"""Docker Registry V2 base endpoint."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from mock_acr.config import settings

if TYPE_CHECKING:
    from mock_acr.store import RegistryStore


def _auth_ok(request: Request) -> bool:
    """Check if the request has any Authorization header (we accept anything)."""
    return "authorization" in request.headers


def create_v2_router(store: RegistryStore) -> APIRouter:
    r = APIRouter()

    @r.get("/v2/")
    async def v2_check(request: Request) -> Response:
        """Docker Registry V2 version check.

        If no auth header, return 401 with WWW-Authenticate challenge
        to trigger Docker's token flow. If auth present, return 200.
        """
        if not _auth_ok(request):
            realm = f"http://{settings.registry_host}/oauth2/token"
            return Response(
                content="{}",
                status_code=401,
                headers={
                    "WWW-Authenticate": (
                        f'Bearer realm="{realm}",'
                        f'service="{settings.registry_host}"'
                    ),
                    "Docker-Distribution-API-Version": "registry/2.0",
                    "Content-Type": "application/json",
                },
            )
        return JSONResponse(
            content={},
            headers={"Docker-Distribution-API-Version": "registry/2.0"},
        )

    return r
