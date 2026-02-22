"""Tests for authentication and rate limit endpoints."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


async def test_get_user(client, auth_headers):
    resp = await client.get("/user", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["login"] == "mock-user"
    assert data["id"] == 1
    assert "email" in data


async def test_get_user_no_auth(client):
    """Auth should still work even without a token (mock accepts anything)."""
    resp = await client.get("/user")
    assert resp.status_code == 200
    assert resp.json()["login"] == "mock-user"


async def test_rate_limit(client, auth_headers):
    resp = await client.get("/rate_limit", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["rate"]["limit"] == 5000
    assert data["resources"]["core"]["remaining"] == 4999
    assert "code_scanning_upload" in data["resources"]
