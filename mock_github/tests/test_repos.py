"""Tests for repository, branch, commit, and status endpoints."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


async def test_get_repo_auto_creates(client, auth_headers):
    resp = await client.get("/repos/org/myrepo", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["full_name"] == "org/myrepo"
    assert data["default_branch"] == "main"


async def test_create_user_repo(client, auth_headers):
    resp = await client.post(
        "/user/repos",
        headers=auth_headers,
        json={"name": "new-repo", "description": "A test repo", "private": True},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "new-repo"
    assert data["private"] is True


async def test_create_org_repo(client, auth_headers):
    resp = await client.post(
        "/orgs/test-org/repos",
        headers=auth_headers,
        json={"name": "org-repo"},
    )
    assert resp.status_code == 201
    assert resp.json()["owner"]["login"] == "test-org"


async def test_create_duplicate_repo(client, auth_headers):
    await client.post("/user/repos", headers=auth_headers, json={"name": "dup"})
    resp = await client.post("/user/repos", headers=auth_headers, json={"name": "dup"})
    assert resp.status_code == 422


async def test_update_repo(client, auth_headers):
    await client.get("/repos/org/repo", headers=auth_headers)
    resp = await client.patch(
        "/repos/org/repo",
        headers=auth_headers,
        json={"description": "Updated"},
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated"


async def test_delete_repo(client, auth_headers):
    await client.get("/repos/org/repo", headers=auth_headers)
    resp = await client.delete("/repos/org/repo", headers=auth_headers)
    assert resp.status_code == 204

    resp = await client.get("/repos/org/repo", headers=auth_headers)
    # auto_create_repos will recreate it, so it should still return 200
    assert resp.status_code == 200


async def test_list_branches(client, auth_headers):
    await client.get("/repos/org/repo", headers=auth_headers)
    resp = await client.get("/repos/org/repo/branches", headers=auth_headers)
    assert resp.status_code == 200
    branches = resp.json()
    assert len(branches) >= 1
    assert branches[0]["name"] == "main"


async def test_get_branch(client, auth_headers):
    await client.get("/repos/org/repo", headers=auth_headers)
    resp = await client.get("/repos/org/repo/branches/main", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "main"


async def test_get_branch_not_found(client, auth_headers):
    await client.get("/repos/org/repo", headers=auth_headers)
    resp = await client.get("/repos/org/repo/branches/nonexistent", headers=auth_headers)
    assert resp.status_code == 404


async def test_get_commit_synthetic(client, auth_headers):
    resp = await client.get("/repos/org/repo/commits/abc123", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["sha"].startswith("abc123")


async def test_create_and_list_statuses(client, auth_headers):
    sha = "a" * 40
    resp = await client.post(
        f"/repos/org/repo/statuses/{sha}",
        headers=auth_headers,
        json={"state": "success", "context": "ci/test"},
    )
    assert resp.status_code == 201
    assert resp.json()["state"] == "success"

    resp = await client.get(f"/repos/org/repo/commits/{sha}/statuses", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_combined_status(client, auth_headers):
    sha = "b" * 40
    await client.post(
        f"/repos/org/repo/statuses/{sha}",
        headers=auth_headers,
        json={"state": "success", "context": "ci/build"},
    )
    await client.post(
        f"/repos/org/repo/statuses/{sha}",
        headers=auth_headers,
        json={"state": "failure", "context": "ci/test"},
    )

    resp = await client.get(f"/repos/org/repo/commits/{sha}/status", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "failure"
    assert data["total_count"] == 2
