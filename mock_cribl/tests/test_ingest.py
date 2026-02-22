"""Tests for ingest endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_ingest_json_array(client: AsyncClient, auth_headers: dict[str, str]):
    events = [
        {"level": "INFO", "message": "hello"},
        {"level": "ERROR", "message": "fail"},
    ]
    resp = await client.post("/cribl/ingest", json=events, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["items_received"] == 2


@pytest.mark.asyncio
async def test_ingest_requires_auth(client: AsyncClient):
    resp = await client.post(
        "/cribl/ingest",
        json=[{"level": "INFO", "message": "test"}],
    )
    assert resp.status_code == 422  # missing Authorization header


@pytest.mark.asyncio
async def test_ingest_rejects_bad_token(client: AsyncClient):
    resp = await client.post(
        "/cribl/ingest",
        json=[{"level": "INFO", "message": "test"}],
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ingest_rejects_non_array(client: AsyncClient, auth_headers: dict[str, str]):
    resp = await client.post(
        "/cribl/ingest",
        json={"level": "INFO", "message": "not an array"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_ingest_empty_array(client: AsyncClient, auth_headers: dict[str, str]):
    resp = await client.post("/cribl/ingest", json=[], headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["items_received"] == 0


@pytest.mark.asyncio
async def test_ingest_preserves_fields(client: AsyncClient, auth_headers: dict[str, str]):
    event = {
        "level": "WARNING",
        "message": "disk low",
        "service": "zapper-backend",
        "scan_id": "abc-123",
        "custom_field": "preserved",
    }
    await client.post("/cribl/ingest", json=[event], headers=auth_headers)
    resp = await client.get("/debug/events")
    events = resp.json()
    assert len(events) == 1
    assert events[0]["custom_field"] == "preserved"
    assert events[0]["scan_id"] == "abc-123"
    assert "_received_at" in events[0]


@pytest.mark.asyncio
async def test_ingest_ndjson(client: AsyncClient, auth_headers: dict[str, str]):
    ndjson = '{"level":"INFO","message":"one"}\n{"level":"ERROR","message":"two"}\n'
    resp = await client.post(
        "/cribl/_bulk",
        content=ndjson.encode(),
        headers={**auth_headers, "Content-Type": "application/x-ndjson"},
    )
    assert resp.status_code == 200
    assert resp.json()["items_received"] == 2


@pytest.mark.asyncio
async def test_ndjson_skips_malformed_lines(client: AsyncClient, auth_headers: dict[str, str]):
    ndjson = '{"level":"INFO","message":"good"}\nnot-json\n{"level":"ERROR","message":"also good"}\n'
    resp = await client.post(
        "/cribl/_bulk",
        content=ndjson.encode(),
        headers={**auth_headers, "Content-Type": "application/x-ndjson"},
    )
    assert resp.status_code == 200
    assert resp.json()["items_received"] == 2


@pytest.mark.asyncio
async def test_ndjson_requires_auth(client: AsyncClient):
    resp = await client.post(
        "/cribl/_bulk",
        content=b'{"level":"INFO"}\n',
    )
    assert resp.status_code == 422
