"""Shared fixtures for mock Cribl tests."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from mock_cribl.config import settings
from mock_cribl.main import app, store


@pytest.fixture(autouse=True)
def _clear_store():
    """Clear the event store before each test."""
    store.clear()
    store._total_received = 0
    yield


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.auth_token}"}
