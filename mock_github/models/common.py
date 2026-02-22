"""Shared models and helpers for mock GitHub API."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field


def now_iso() -> str:
    """Return the current UTC time in ISO 8601 format."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class User(BaseModel):
    login: str = "mock-user"
    id: int = 1
    node_id: str = "MDQ6VXNlcjE="
    avatar_url: str = "https://avatars.githubusercontent.com/u/1?v=4"
    type: str = "User"
    site_admin: bool = False


class PaginatedResponse(BaseModel):
    """Helper for paginated list responses."""

    total_count: int
    items: list[Any] = Field(default_factory=list)
