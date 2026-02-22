"""Tests for GitHub Actions endpoints."""

from __future__ import annotations

import pytest

from mock_github.main import store

pytestmark = pytest.mark.anyio


# ── Workflows ──────────────────────────────────────────────────────


async def test_workflow_dispatch(client, auth_headers):
    # Seed a workflow
    store.ensure_repo("org", "repo")
    store.workflows[("org", "repo")] = {
        1: {
            "id": 1,
            "name": "CI",
            "path": ".github/workflows/ci.yml",
            "state": "active",
        }
    }

    resp = await client.post(
        "/repos/org/repo/actions/workflows/1/dispatches",
        headers=auth_headers,
        json={"ref": "main"},
    )
    assert resp.status_code == 204

    # Verify run was created
    resp = await client.get(
        "/repos/org/repo/actions/runs", headers=auth_headers
    )
    runs = resp.json()["workflow_runs"]
    assert len(runs) == 1
    assert runs[0]["event"] == "workflow_dispatch"


async def test_list_workflows(client, auth_headers):
    store.ensure_repo("org", "repo")
    store.workflows[("org", "repo")] = {
        1: {"id": 1, "name": "CI", "state": "active"},
        2: {"id": 2, "name": "Deploy", "state": "active"},
    }

    resp = await client.get(
        "/repos/org/repo/actions/workflows", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_count"] == 2


async def test_enable_disable_workflow(client, auth_headers):
    store.ensure_repo("org", "repo")
    store.workflows[("org", "repo")] = {1: {"id": 1, "name": "CI", "state": "active"}}

    resp = await client.put(
        "/repos/org/repo/actions/workflows/1/disable", headers=auth_headers
    )
    assert resp.status_code == 204
    assert store.workflows[("org", "repo")][1]["state"] == "disabled_manually"

    resp = await client.put(
        "/repos/org/repo/actions/workflows/1/enable", headers=auth_headers
    )
    assert resp.status_code == 204
    assert store.workflows[("org", "repo")][1]["state"] == "active"


# ── Workflow Runs ──────────────────────────────────────────────────


async def test_workflow_run_lifecycle(client, auth_headers):
    store.ensure_repo("org", "repo")
    store.workflows[("org", "repo")] = {1: {"id": 1, "name": "CI", "state": "active"}}

    # Create run via dispatch
    await client.post(
        "/repos/org/repo/actions/workflows/1/dispatches",
        headers=auth_headers,
        json={"ref": "main"},
    )

    # List runs
    resp = await client.get("/repos/org/repo/actions/runs", headers=auth_headers)
    runs = resp.json()["workflow_runs"]
    run_id = runs[0]["id"]

    # Get run
    resp = await client.get(
        f"/repos/org/repo/actions/runs/{run_id}", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "queued"

    # Cancel run
    resp = await client.post(
        f"/repos/org/repo/actions/runs/{run_id}/cancel", headers=auth_headers
    )
    assert resp.status_code == 202

    resp = await client.get(
        f"/repos/org/repo/actions/runs/{run_id}", headers=auth_headers
    )
    assert resp.json()["conclusion"] == "cancelled"

    # Rerun
    resp = await client.post(
        f"/repos/org/repo/actions/runs/{run_id}/rerun", headers=auth_headers
    )
    assert resp.status_code == 201

    resp = await client.get(
        f"/repos/org/repo/actions/runs/{run_id}", headers=auth_headers
    )
    assert resp.json()["status"] == "queued"
    assert resp.json()["conclusion"] is None


async def test_delete_workflow_run(client, auth_headers):
    store.ensure_repo("org", "repo")
    store.workflows[("org", "repo")] = {1: {"id": 1, "name": "CI", "state": "active"}}
    await client.post(
        "/repos/org/repo/actions/workflows/1/dispatches",
        headers=auth_headers,
        json={"ref": "main"},
    )

    resp = await client.get("/repos/org/repo/actions/runs", headers=auth_headers)
    run_id = resp.json()["workflow_runs"][0]["id"]

    resp = await client.delete(
        f"/repos/org/repo/actions/runs/{run_id}", headers=auth_headers
    )
    assert resp.status_code == 204

    resp = await client.get(
        f"/repos/org/repo/actions/runs/{run_id}", headers=auth_headers
    )
    assert resp.status_code == 404


async def test_run_timing(client, auth_headers):
    store.ensure_repo("org", "repo")
    store.workflows[("org", "repo")] = {1: {"id": 1, "name": "CI", "state": "active"}}
    await client.post(
        "/repos/org/repo/actions/workflows/1/dispatches",
        headers=auth_headers,
        json={"ref": "main"},
    )

    resp = await client.get("/repos/org/repo/actions/runs", headers=auth_headers)
    run_id = resp.json()["workflow_runs"][0]["id"]

    resp = await client.get(
        f"/repos/org/repo/actions/runs/{run_id}/timing", headers=auth_headers
    )
    assert resp.status_code == 200
    assert "billable" in resp.json()


async def test_run_logs(client, auth_headers):
    store.ensure_repo("org", "repo")
    store.workflows[("org", "repo")] = {1: {"id": 1, "name": "CI", "state": "active"}}
    await client.post(
        "/repos/org/repo/actions/workflows/1/dispatches",
        headers=auth_headers,
        json={"ref": "main"},
    )

    resp = await client.get("/repos/org/repo/actions/runs", headers=auth_headers)
    run_id = resp.json()["workflow_runs"][0]["id"]

    resp = await client.get(
        f"/repos/org/repo/actions/runs/{run_id}/logs", headers=auth_headers
    )
    assert resp.status_code == 200
    assert "Mock logs" in resp.text


# ── Secrets ────────────────────────────────────────────────────────


async def test_secrets_crud(client, auth_headers):
    # Create
    resp = await client.put(
        "/repos/org/repo/actions/secrets/MY_SECRET",
        headers=auth_headers,
        json={"encrypted_value": "enc-value", "key_id": "key-123"},
    )
    assert resp.status_code == 204

    # List
    resp = await client.get(
        "/repos/org/repo/actions/secrets", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["total_count"] == 1
    assert resp.json()["secrets"][0]["name"] == "MY_SECRET"

    # Get
    resp = await client.get(
        "/repos/org/repo/actions/secrets/MY_SECRET", headers=auth_headers
    )
    assert resp.status_code == 200

    # Delete
    resp = await client.delete(
        "/repos/org/repo/actions/secrets/MY_SECRET", headers=auth_headers
    )
    assert resp.status_code == 204


async def test_get_public_key(client, auth_headers):
    resp = await client.get(
        "/repos/org/repo/actions/secrets/public-key", headers=auth_headers
    )
    assert resp.status_code == 200
    assert "key_id" in resp.json()
    assert "key" in resp.json()


# ── Variables ──────────────────────────────────────────────────────


async def test_variables_crud(client, auth_headers):
    # Create
    resp = await client.post(
        "/repos/org/repo/actions/variables",
        headers=auth_headers,
        json={"name": "MY_VAR", "value": "hello"},
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "MY_VAR"

    # List
    resp = await client.get(
        "/repos/org/repo/actions/variables", headers=auth_headers
    )
    assert resp.json()["total_count"] == 1

    # Get
    resp = await client.get(
        "/repos/org/repo/actions/variables/MY_VAR", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == "hello"

    # Update
    resp = await client.patch(
        "/repos/org/repo/actions/variables/MY_VAR",
        headers=auth_headers,
        json={"value": "updated"},
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == "updated"

    # Delete
    resp = await client.delete(
        "/repos/org/repo/actions/variables/MY_VAR", headers=auth_headers
    )
    assert resp.status_code == 204


async def test_create_duplicate_variable(client, auth_headers):
    await client.post(
        "/repos/org/repo/actions/variables",
        headers=auth_headers,
        json={"name": "DUP", "value": "v1"},
    )
    resp = await client.post(
        "/repos/org/repo/actions/variables",
        headers=auth_headers,
        json={"name": "DUP", "value": "v2"},
    )
    assert resp.status_code == 409


# ── Permissions ────────────────────────────────────────────────────


async def test_permissions(client, auth_headers):
    resp = await client.get(
        "/repos/org/repo/actions/permissions", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is True

    resp = await client.put(
        "/repos/org/repo/actions/permissions",
        headers=auth_headers,
        json={"enabled": False, "allowed_actions": "local_only"},
    )
    assert resp.status_code == 204

    resp = await client.get(
        "/repos/org/repo/actions/permissions", headers=auth_headers
    )
    assert resp.json()["enabled"] is False
    assert resp.json()["allowed_actions"] == "local_only"


# ── Caches ─────────────────────────────────────────────────────────


async def test_cache_usage(client, auth_headers):
    resp = await client.get(
        "/repos/org/repo/actions/cache/usage", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["active_caches_count"] == 0


async def test_list_caches_empty(client, auth_headers):
    resp = await client.get(
        "/repos/org/repo/actions/caches", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["total_count"] == 0
