"""Tests for health check endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_api_health(client: AsyncClient):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["version"] == "mock-4.x"
    assert "startTime" in data
    assert data["eventCount"] == 0


@pytest.mark.asyncio
async def test_cribl_health(client: AsyncClient):
    resp = await client.get("/cribl_health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["source"] == "http"
    assert data["accepting"] is True


@pytest.mark.asyncio
async def test_health_reflects_event_count(
    client: AsyncClient, auth_headers: dict[str, str]
):
    await client.post(
        "/cribl/ingest",
        json=[{"level": "INFO", "message": "test"}],
        headers=auth_headers,
    )
    resp = await client.get("/api/v1/health")
    assert resp.json()["eventCount"] == 1
