"""Tests for check run and check suite endpoints."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


async def test_create_check_run(client, auth_headers):
    resp = await client.post(
        "/repos/org/repo/check-runs",
        headers=auth_headers,
        json={
            "name": "Zapper Scan",
            "head_sha": "abc123",
            "conclusion": "success",
            "output": {
                "title": "Scan passed",
                "summary": "All clear",
            },
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Zapper Scan"
    assert data["conclusion"] == "success"
    assert data["status"] == "completed"
    assert data["output"]["title"] == "Scan passed"


async def test_get_check_run(client, auth_headers):
    create_resp = await client.post(
        "/repos/org/repo/check-runs",
        headers=auth_headers,
        json={"name": "test", "head_sha": "abc"},
    )
    cr_id = create_resp.json()["id"]

    resp = await client.get(f"/repos/org/repo/check-runs/{cr_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "test"


async def test_update_check_run(client, auth_headers):
    create_resp = await client.post(
        "/repos/org/repo/check-runs",
        headers=auth_headers,
        json={"name": "test", "head_sha": "abc"},
    )
    cr_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/repos/org/repo/check-runs/{cr_id}",
        headers=auth_headers,
        json={"conclusion": "failure"},
    )
    assert resp.status_code == 200
    assert resp.json()["conclusion"] == "failure"
    assert resp.json()["status"] == "completed"


async def test_list_check_runs_for_ref(client, auth_headers):
    sha = "ref123"
    await client.post(
        "/repos/org/repo/check-runs",
        headers=auth_headers,
        json={"name": "run1", "head_sha": sha},
    )
    await client.post(
        "/repos/org/repo/check-runs",
        headers=auth_headers,
        json={"name": "run2", "head_sha": sha},
    )
    await client.post(
        "/repos/org/repo/check-runs",
        headers=auth_headers,
        json={"name": "other", "head_sha": "different"},
    )

    resp = await client.get(
        f"/repos/org/repo/commits/{sha}/check-runs", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_count"] == 2


async def test_list_check_runs_for_ref_filter_name(client, auth_headers):
    sha = "ref456"
    await client.post(
        "/repos/org/repo/check-runs",
        headers=auth_headers,
        json={"name": "Zapper", "head_sha": sha},
    )
    await client.post(
        "/repos/org/repo/check-runs",
        headers=auth_headers,
        json={"name": "Other", "head_sha": sha},
    )

    resp = await client.get(
        f"/repos/org/repo/commits/{sha}/check-runs",
        headers=auth_headers,
        params={"check_name": "Zapper"},
    )
    assert resp.json()["total_count"] == 1


async def test_check_run_annotations(client, auth_headers):
    create_resp = await client.post(
        "/repos/org/repo/check-runs",
        headers=auth_headers,
        json={
            "name": "test",
            "head_sha": "abc",
            "output": {
                "title": "Results",
                "summary": "Found issues",
                "annotations": [
                    {
                        "path": "src/app.py",
                        "start_line": 10,
                        "end_line": 10,
                        "annotation_level": "warning",
                        "message": "Possible SQL injection",
                    }
                ],
            },
        },
    )
    cr_id = create_resp.json()["id"]

    resp = await client.get(
        f"/repos/org/repo/check-runs/{cr_id}/annotations", headers=auth_headers
    )
    assert resp.status_code == 200
    annotations = resp.json()
    assert len(annotations) == 1
    assert annotations[0]["message"] == "Possible SQL injection"


async def test_rerequest_check_run(client, auth_headers):
    create_resp = await client.post(
        "/repos/org/repo/check-runs",
        headers=auth_headers,
        json={"name": "test", "head_sha": "abc", "conclusion": "failure"},
    )
    cr_id = create_resp.json()["id"]

    resp = await client.post(
        f"/repos/org/repo/check-runs/{cr_id}/rerequest", headers=auth_headers
    )
    assert resp.status_code == 201

    resp = await client.get(f"/repos/org/repo/check-runs/{cr_id}", headers=auth_headers)
    assert resp.json()["status"] == "queued"
    assert resp.json()["conclusion"] is None


async def test_create_check_suite(client, auth_headers):
    resp = await client.post(
        "/repos/org/repo/check-suites",
        headers=auth_headers,
        json={"head_sha": "suite-sha"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["head_sha"] == "suite-sha"
    assert data["status"] == "queued"


async def test_list_check_suites_for_ref(client, auth_headers):
    sha = "suite-ref"
    await client.post(
        "/repos/org/repo/check-suites",
        headers=auth_headers,
        json={"head_sha": sha},
    )

    resp = await client.get(
        f"/repos/org/repo/commits/{sha}/check-suites", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["total_count"] == 1
