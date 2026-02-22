"""Authentication and rate limit endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from mock_github.auth import verify_token
from mock_github.config import settings

router = APIRouter()


@router.get("/user")
async def get_authenticated_user(
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Return the mock authenticated user."""
    return {
        **user,
        "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
        "html_url": f"https://github.com/{user['login']}",
        "url": f"https://api.github.com/users/{user['login']}",
        "repos_url": f"https://api.github.com/users/{user['login']}/repos",
        "public_repos": 0,
        "public_gists": 0,
        "followers": 0,
        "following": 0,
        "created_at": "2020-01-01T00:00:00Z",
        "updated_at": "2020-01-01T00:00:00Z",
    }


@router.get("/rate_limit")
async def get_rate_limit() -> dict[str, Any]:
    """Return generous rate limit response."""
    return {
        "resources": {
            "core": {
                "limit": 5000,
                "remaining": 4999,
                "reset": 9999999999,
                "used": 1,
            },
            "search": {
                "limit": 30,
                "remaining": 29,
                "reset": 9999999999,
                "used": 1,
            },
            "code_scanning_upload": {
                "limit": 500,
                "remaining": 499,
                "reset": 9999999999,
                "used": 1,
            },
        },
        "rate": {
            "limit": 5000,
            "remaining": 4999,
            "reset": 9999999999,
            "used": 1,
        },
    }
