"""Tests for code scanning and SARIF upload endpoints."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


async def test_upload_sarif(client, auth_headers):
    resp = await client.post(
        "/repos/org/repo/code-scanning/sarifs",
        headers=auth_headers,
        json={
            "commit_sha": "abc123",
            "ref": "refs/heads/main",
            "sarif": "H4sIAAAAAAAAA6tWKkktLlGyUlAqS8wpTgUAVNJzEhIAAAA=",
            "tool_name": "semgrep",
        },
    )
    assert resp.status_code == 202
    data = resp.json()
    assert "id" in data
    assert "url" in data


async def test_get_sarif_upload_status(client, auth_headers):
    create_resp = await client.post(
        "/repos/org/repo/code-scanning/sarifs",
        headers=auth_headers,
        json={
            "commit_sha": "abc",
            "ref": "refs/heads/main",
            "sarif": "encoded-data",
        },
    )
    sarif_id = create_resp.json()["id"]

    resp = await client.get(
        f"/repos/org/repo/code-scanning/sarifs/{sarif_id}", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["processing_status"] == "complete"


async def test_sarif_creates_alert(client, auth_headers):
    await client.post(
        "/repos/org/repo/code-scanning/sarifs",
        headers=auth_headers,
        json={
            "commit_sha": "abc",
            "ref": "refs/heads/main",
            "sarif": "data",
            "tool_name": "nuclei",
        },
    )

    resp = await client.get(
        "/repos/org/repo/code-scanning/alerts", headers=auth_headers
    )
    assert resp.status_code == 200
    alerts = resp.json()
    assert len(alerts) == 1
    assert alerts[0]["tool"]["name"] == "nuclei"
    assert alerts[0]["state"] == "open"


async def test_get_alert(client, auth_headers):
    await client.post(
        "/repos/org/repo/code-scanning/sarifs",
        headers=auth_headers,
        json={"commit_sha": "abc", "ref": "refs/heads/main", "sarif": "data"},
    )

    resp = await client.get(
        "/repos/org/repo/code-scanning/alerts/1", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["number"] == 1


async def test_dismiss_alert(client, auth_headers):
    await client.post(
        "/repos/org/repo/code-scanning/sarifs",
        headers=auth_headers,
        json={"commit_sha": "abc", "ref": "refs/heads/main", "sarif": "data"},
    )

    resp = await client.patch(
        "/repos/org/repo/code-scanning/alerts/1",
        headers=auth_headers,
        json={
            "state": "dismissed",
            "dismissed_reason": "false positive",
            "dismissed_comment": "Not applicable",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "dismissed"
    assert data["dismissed_reason"] == "false positive"
    assert data["dismissed_by"]["login"] == "mock-user"


async def test_reopen_alert(client, auth_headers):
    await client.post(
        "/repos/org/repo/code-scanning/sarifs",
        headers=auth_headers,
        json={"commit_sha": "abc", "ref": "refs/heads/main", "sarif": "data"},
    )
    await client.patch(
        "/repos/org/repo/code-scanning/alerts/1",
        headers=auth_headers,
        json={"state": "dismissed", "dismissed_reason": "won't fix"},
    )
    resp = await client.patch(
        "/repos/org/repo/code-scanning/alerts/1",
        headers=auth_headers,
        json={"state": "open"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "open"
    assert data["dismissed_at"] is None


async def test_list_alerts_filter_state(client, auth_headers):
    # Create two alerts
    await client.post(
        "/repos/org/repo/code-scanning/sarifs",
        headers=auth_headers,
        json={"commit_sha": "a", "ref": "refs/heads/main", "sarif": "d1"},
    )
    await client.post(
        "/repos/org/repo/code-scanning/sarifs",
        headers=auth_headers,
        json={"commit_sha": "b", "ref": "refs/heads/main", "sarif": "d2"},
    )
    # Dismiss one
    await client.patch(
        "/repos/org/repo/code-scanning/alerts/1",
        headers=auth_headers,
        json={"state": "dismissed", "dismissed_reason": "false positive"},
    )

    resp = await client.get(
        "/repos/org/repo/code-scanning/alerts",
        headers=auth_headers,
        params={"state": "open"},
    )
    assert len(resp.json()) == 1
    assert resp.json()[0]["number"] == 2


async def test_sarif_upload_not_found(client, auth_headers):
    resp = await client.get(
        "/repos/org/repo/code-scanning/sarifs/nonexistent", headers=auth_headers
    )
    assert resp.status_code == 404
