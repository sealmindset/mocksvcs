"""Docker Registry V2 manifest operations (pull & push manifests)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

if TYPE_CHECKING:
    from mock_acr.store import RegistryStore

# Supported manifest media types
MANIFEST_TYPES = {
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.docker.distribution.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v1+prettyjws",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.oci.image.index.v1+json",
}


def _error(code: str, message: str, status: int = 404) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"errors": [{"code": code, "message": message}]},
    )


def create_manifests_router(store: RegistryStore) -> APIRouter:
    r = APIRouter()

    @r.head("/v2/{name:path}/manifests/{reference}")
    async def head_manifest(name: str, reference: str) -> Response:
        result = store.get_manifest(name, reference)
        if result is None:
            return Response(status_code=404)
        manifest_bytes, content_type = result
        digest = store.manifest_digest(name, reference)
        return Response(
            status_code=200,
            headers={
                "Content-Type": content_type,
                "Docker-Content-Digest": digest or "",
                "Content-Length": str(len(manifest_bytes)),
                "Docker-Distribution-API-Version": "registry/2.0",
            },
        )

    @r.get("/v2/{name:path}/manifests/{reference}")
    async def get_manifest(name: str, reference: str) -> Response:
        result = store.get_manifest(name, reference)
        if result is None:
            return _error("MANIFEST_UNKNOWN", f"Manifest not found: {name}:{reference}")
        manifest_bytes, content_type = result
        digest = store.manifest_digest(name, reference)
        return Response(
            content=manifest_bytes,
            status_code=200,
            media_type=content_type,
            headers={
                "Docker-Content-Digest": digest or "",
                "Docker-Distribution-API-Version": "registry/2.0",
            },
        )

    @r.put("/v2/{name:path}/manifests/{reference}")
    async def put_manifest(name: str, reference: str, request: Request) -> Response:
        body = await request.body()
        content_type = request.headers.get(
            "content-type",
            "application/vnd.docker.distribution.manifest.v2+json",
        )
        digest = store.put_manifest(name, reference, body, content_type)
        return Response(
            status_code=201,
            headers={
                "Docker-Content-Digest": digest,
                "Location": f"/v2/{name}/manifests/{digest}",
                "Docker-Distribution-API-Version": "registry/2.0",
            },
        )

    @r.delete("/v2/{name:path}/manifests/{reference}")
    async def delete_manifest(name: str, reference: str) -> Response:
        if not store.delete_manifest(name, reference):
            return _error("MANIFEST_UNKNOWN", f"Manifest not found: {name}:{reference}")
        return Response(status_code=202)

    return r
