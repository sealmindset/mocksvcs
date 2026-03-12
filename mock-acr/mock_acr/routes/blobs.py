"""Docker Registry V2 blob operations (pull & push layers/configs)."""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING

from fastapi import APIRouter, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

from mock_acr.config import settings

if TYPE_CHECKING:
    from mock_acr.store import RegistryStore


def _error(code: str, message: str, status: int = 404) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"errors": [{"code": code, "message": message}]},
    )


def create_blobs_router(store: RegistryStore) -> APIRouter:
    r = APIRouter()

    # ---- Pull blobs ----

    @r.head("/v2/{name:path}/blobs/{digest}")
    async def head_blob(name: str, digest: str) -> Response:
        if not store.has_blob(digest):
            return Response(status_code=404)
        size = store.blob_size(digest)
        return Response(
            status_code=200,
            headers={
                "Content-Length": str(size),
                "Docker-Content-Digest": digest,
                "Content-Type": "application/octet-stream",
                "Docker-Distribution-API-Version": "registry/2.0",
            },
        )

    @r.get("/v2/{name:path}/blobs/{digest}")
    async def get_blob(name: str, digest: str) -> Response:
        blob_path = store.get_blob(digest)
        if blob_path is None:
            return _error("BLOB_UNKNOWN", f"Blob not found: {digest}")
        return FileResponse(
            path=str(blob_path),
            media_type="application/octet-stream",
            headers={
                "Docker-Content-Digest": digest,
                "Docker-Distribution-API-Version": "registry/2.0",
            },
        )

    @r.delete("/v2/{name:path}/blobs/{digest}")
    async def delete_blob(name: str, digest: str) -> Response:
        if not store.delete_blob(digest):
            return _error("BLOB_UNKNOWN", f"Blob not found: {digest}")
        return Response(status_code=202)

    # ---- Push blobs (upload flow) ----

    @r.post("/v2/{name:path}/blobs/uploads/")
    async def start_upload(
        name: str,
        request: Request,
        digest: str = Query(default="", alias="digest"),
        mount: str = Query(default="", alias="mount"),
        _from: str = Query(default="", alias="from"),
    ) -> Response:
        # Cross-repo mount: if the blob already exists, skip upload
        if mount and store.has_blob(mount):
            return Response(
                status_code=201,
                headers={
                    "Docker-Content-Digest": mount,
                    "Location": f"/v2/{name}/blobs/{mount}",
                    "Docker-Distribution-API-Version": "registry/2.0",
                },
            )

        # Monolithic upload: if digest is provided and body has content
        if digest:
            body = await request.body()
            if body:
                actual = "sha256:" + hashlib.sha256(body).hexdigest()
                if actual != digest:
                    return _error("DIGEST_INVALID", "Digest mismatch", 400)
                store.put_blob(digest, body)
                return Response(
                    status_code=201,
                    headers={
                        "Docker-Content-Digest": digest,
                        "Location": f"/v2/{name}/blobs/{digest}",
                        "Docker-Distribution-API-Version": "registry/2.0",
                    },
                )

        # Start a new chunked upload session
        upload_id = store.create_upload()
        return Response(
            status_code=202,
            headers={
                "Location": f"/v2/{name}/blobs/uploads/{upload_id}",
                "Docker-Upload-UUID": upload_id,
                "Range": "0-0",
                "Docker-Distribution-API-Version": "registry/2.0",
            },
        )

    @r.patch("/v2/{name:path}/blobs/uploads/{upload_id}")
    async def upload_chunk(name: str, upload_id: str, request: Request) -> Response:
        if store.get_upload_path(upload_id) is None:
            return _error("BLOB_UPLOAD_UNKNOWN", f"Upload not found: {upload_id}")

        body = await request.body()
        new_size = store.append_upload(upload_id, body)
        if new_size < 0:
            return _error("BLOB_UPLOAD_UNKNOWN", f"Upload not found: {upload_id}")

        return Response(
            status_code=202,
            headers={
                "Location": f"/v2/{name}/blobs/uploads/{upload_id}",
                "Docker-Upload-UUID": upload_id,
                "Range": f"0-{new_size - 1}",
                "Docker-Distribution-API-Version": "registry/2.0",
            },
        )

    @r.put("/v2/{name:path}/blobs/uploads/{upload_id}")
    async def complete_upload(
        name: str,
        upload_id: str,
        request: Request,
        digest: str = Query(alias="digest"),
    ) -> Response:
        # Append any final data
        body = await request.body()
        if body:
            store.append_upload(upload_id, body)

        # Finalize: verify digest and move to blob store
        result_digest = store.complete_upload(upload_id, digest)
        if result_digest is None:
            return _error("DIGEST_INVALID", "Digest verification failed", 400)

        return Response(
            status_code=201,
            headers={
                "Docker-Content-Digest": result_digest,
                "Location": f"/v2/{name}/blobs/{result_digest}",
                "Docker-Distribution-API-Version": "registry/2.0",
            },
        )

    @r.delete("/v2/{name:path}/blobs/uploads/{upload_id}")
    async def cancel_upload(name: str, upload_id: str) -> Response:
        if not store.cancel_upload(upload_id):
            return _error("BLOB_UPLOAD_UNKNOWN", f"Upload not found: {upload_id}")
        return Response(status_code=204)

    return r
