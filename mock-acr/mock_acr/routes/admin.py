"""Admin endpoints for managing the mock registry (import, reset, stats)."""

from __future__ import annotations

import tempfile
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, UploadFile
from fastapi.responses import JSONResponse

if TYPE_CHECKING:
    from mock_acr.store import RegistryStore


def create_admin_router(store: RegistryStore) -> APIRouter:
    r = APIRouter(prefix="/admin")

    @r.get("/stats")
    async def stats() -> dict[str, Any]:
        """Return registry statistics."""
        return store.stats()

    @r.get("/repositories")
    async def list_repositories() -> dict[str, Any]:
        """List all repositories with their tags."""
        repos = store.list_repositories()
        result = {}
        for repo in repos:
            result[repo] = store.list_tags(repo)
        return {"repositories": result}

    @r.post("/import")
    async def import_tar(file: UploadFile) -> JSONResponse:
        """Import images from a `docker save` tar archive.

        Usage: curl -F "file=@myimage.tar" http://localhost:5100/admin/import
        """
        with tempfile.NamedTemporaryFile(suffix=".tar", delete=True) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp.flush()
            imported = store.import_tar(tmp.name)

        return JSONResponse(
            status_code=201,
            content={
                "imported": imported,
                "count": len(imported),
            },
        )

    return r
