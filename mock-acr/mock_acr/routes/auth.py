"""ACR-compatible token authentication (always grants access)."""

from __future__ import annotations

import hashlib
import json
import time
from typing import TYPE_CHECKING

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from mock_acr.config import settings

if TYPE_CHECKING:
    from mock_acr.store import RegistryStore


def create_auth_router(store: RegistryStore) -> APIRouter:
    r = APIRouter()

    @r.get("/oauth2/token")
    @r.post("/oauth2/token")
    async def get_token(
        request: Request,
        service: str = Query(default=""),
        scope: str = Query(default=""),
        grant_type: str = Query(default=""),
    ) -> JSONResponse:
        """ACR token endpoint -- always returns a valid token.

        Docker calls this after getting a 401 from /v2/ with the
        WWW-Authenticate challenge. We always grant access.
        """
        now = int(time.time())
        # Build a minimal JWT-like token (doesn't need to be cryptographically valid
        # since the mock never verifies it -- it just needs to be non-empty)
        payload = {
            "iss": f"https://{settings.registry_host}",
            "sub": "mock-user",
            "aud": service or settings.registry_host,
            "exp": now + settings.token_lifetime,
            "iat": now,
            "nbf": now,
            "scope": scope,
        }
        # Simple base64-ish token (not a real JWT, but Docker doesn't validate it)
        import base64
        header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).decode().rstrip("=")
        body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        token = f"{header}.{body}.mock-signature"

        return JSONResponse({
            "access_token": token,
            "token": token,  # Some Docker versions use "token" instead
            "token_type": "Bearer",
            "expires_in": settings.token_lifetime,
        })

    @r.get("/oauth2/exchange")
    @r.post("/oauth2/exchange")
    async def exchange_token(request: Request) -> JSONResponse:
        """ACR refresh token exchange -- always succeeds."""
        now = int(time.time())
        return JSONResponse({
            "refresh_token": f"mock-refresh-{now}",
        })

    return r
