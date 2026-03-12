"""Docker Registry V2 catalog and tag listing."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

if TYPE_CHECKING:
    from mock_acr.store import RegistryStore


def create_catalog_router(store: RegistryStore) -> APIRouter:
    r = APIRouter()

    @r.get("/v2/_catalog")
    async def list_repositories(
        n: int = Query(default=100, ge=1),
        last: str = Query(default=""),
    ) -> JSONResponse:
        repos = store.list_repositories()
        if last:
            try:
                idx = repos.index(last) + 1
                repos = repos[idx:]
            except ValueError:
                pass
        repos = repos[:n]
        return JSONResponse(
            content={"repositories": repos},
            headers={"Docker-Distribution-API-Version": "registry/2.0"},
        )

    @r.get("/v2/{name:path}/tags/list")
    async def list_tags(
        name: str,
        n: int = Query(default=100, ge=1),
        last: str = Query(default=""),
    ) -> JSONResponse:
        tags = store.list_tags(name)
        if not tags:
            return JSONResponse(
                status_code=404,
                content={"errors": [{"code": "NAME_UNKNOWN", "message": f"Repository not found: {name}"}]},
            )
        if last:
            try:
                idx = tags.index(last) + 1
                tags = tags[idx:]
            except ValueError:
                pass
        tags = tags[:n]
        return JSONResponse(
            content={"name": name, "tags": tags},
            headers={"Docker-Distribution-API-Version": "registry/2.0"},
        )

    return r
