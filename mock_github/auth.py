"""Authentication dependency for mock GitHub API.

Accepts any Bearer or token authorization. Never rejects.
"""

from __future__ import annotations

from typing import Any

from fastapi import Header, Query

from mock_github.config import settings


async def verify_token(
    authorization: str | None = Header(None),
    access_token: str | None = Query(None),
    x_github_api_version: str | None = Header(None),
) -> dict[str, Any]:
    """Accept ANY Bearer token or query param token. No validation.

    Returns a mock user dict matching GitHub's /user response shape.
    """
    return {
        "login": settings.default_user_login,
        "id": 1,
        "node_id": "MDQ6VXNlcjE=",
        "type": "User",
        "site_admin": True,
        "name": "Mock User",
        "email": "mock-user@example.com",
    }
