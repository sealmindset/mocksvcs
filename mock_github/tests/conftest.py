"""Shared test fixtures for mock GitHub API tests."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from mock_github.main import app, store


@pytest.fixture(autouse=True)
def reset_store():
    """Reset the store before each test."""
    store.clear()
    yield
    store.clear()


@pytest.fixture
def auth_headers() -> dict[str, str]:
    """Standard auth headers."""
    return {
        "Authorization": "Bearer test-token",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


@pytest.fixture
async def client():
    """Async HTTP client using ASGI transport."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
