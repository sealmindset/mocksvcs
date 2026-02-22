"""Tests for debug endpoints."""

import pytest
from httpx import AsyncClient


async def _ingest(client: AsyncClient, auth_headers: dict[str, str], events: list[dict]):
    await client.post("/cribl/ingest", json=events, headers=auth_headers)


@pytest.mark.asyncio
async def test_empty_query(client: AsyncClient):
    resp = await client.get("/debug/events")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_filter_by_level(client: AsyncClient, auth_headers: dict[str, str]):
    await _ingest(client, auth_headers, [
        {"level": "INFO", "message": "info msg"},
        {"level": "ERROR", "message": "error msg"},
        {"level": "INFO", "message": "another info"},
    ])
    resp = await client.get("/debug/events", params={"level": "ERROR"})
    events = resp.json()
    assert len(events) == 1
    assert events[0]["message"] == "error msg"


@pytest.mark.asyncio
async def test_filter_by_service(client: AsyncClient, auth_headers: dict[str, str]):
    await _ingest(client, auth_headers, [
        {"level": "INFO", "message": "a", "service": "zapper-backend"},
        {"level": "INFO", "message": "b", "service": "zapper-worker"},
    ])
    resp = await client.get("/debug/events", params={"service": "zapper-worker"})
    events = resp.json()
    assert len(events) == 1
    assert events[0]["service"] == "zapper-worker"


@pytest.mark.asyncio
async def test_filter_by_scan_id(client: AsyncClient, auth_headers: dict[str, str]):
    await _ingest(client, auth_headers, [
        {"level": "INFO", "message": "a", "scan_id": "scan-1"},
        {"level": "INFO", "message": "b", "scan_id": "scan-2"},
    ])
    resp = await client.get("/debug/events", params={"scan_id": "scan-1"})
    events = resp.json()
    assert len(events) == 1
    assert events[0]["scan_id"] == "scan-1"


@pytest.mark.asyncio
async def test_text_search(client: AsyncClient, auth_headers: dict[str, str]):
    await _ingest(client, auth_headers, [
        {"level": "INFO", "message": "Starting scan for target"},
        {"level": "INFO", "message": "Database connection established"},
        {"level": "ERROR", "message": "Scan failed with timeout"},
    ])
    resp = await client.get("/debug/events", params={"q": "scan"})
    events = resp.json()
    assert len(events) == 2


@pytest.mark.asyncio
async def test_pagination(client: AsyncClient, auth_headers: dict[str, str]):
    events = [{"level": "INFO", "message": f"msg-{i}"} for i in range(10)]
    await _ingest(client, auth_headers, events)

    resp = await client.get("/debug/events", params={"limit": 3, "offset": 0})
    page1 = resp.json()
    assert len(page1) == 3
    assert page1[0]["message"] == "msg-0"

    resp = await client.get("/debug/events", params={"limit": 3, "offset": 3})
    page2 = resp.json()
    assert len(page2) == 3
    assert page2[0]["message"] == "msg-3"


@pytest.mark.asyncio
async def test_stats(client: AsyncClient, auth_headers: dict[str, str]):
    await _ingest(client, auth_headers, [
        {"level": "INFO", "message": "a", "service": "zapper-backend"},
        {"level": "ERROR", "message": "b", "service": "zapper-backend"},
        {"level": "INFO", "message": "c", "service": "zapper-worker"},
    ])
    resp = await client.get("/debug/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_received"] == 3
    assert data["buffer_size"] == 3
    assert data["events_by_level"]["INFO"] == 2
    assert data["events_by_level"]["ERROR"] == 1
    assert data["events_by_service"]["zapper-backend"] == 2
    assert data["events_by_service"]["zapper-worker"] == 1


@pytest.mark.asyncio
async def test_clear_events(client: AsyncClient, auth_headers: dict[str, str]):
    await _ingest(client, auth_headers, [
        {"level": "INFO", "message": "a"},
        {"level": "INFO", "message": "b"},
    ])
    resp = await client.delete("/debug/events")
    assert resp.status_code == 200
    assert resp.json()["cleared"] == 2

    resp = await client.get("/debug/events")
    assert resp.json() == []
