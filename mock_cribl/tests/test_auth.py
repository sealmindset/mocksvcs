"""Tests for the auth endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_login_returns_token(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["token"] == "mock-cribl-dev-token"


@pytest.mark.asyncio
async def test_login_accepts_any_credentials(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "foo", "password": "bar"},
    )
    assert resp.status_code == 200
    assert resp.json()["token"] == "mock-cribl-dev-token"


@pytest.mark.asyncio
async def test_login_response_shape(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "x", "password": "y"},
    )
    data = resp.json()
    assert set(data.keys()) == {"token"}
