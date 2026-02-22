"""Tests for pull request endpoints."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


async def _create_pr(client, auth_headers, owner="org", repo="repo", **kwargs):
    defaults = {"title": "Test PR", "head": "feature", "base": "main"}
    defaults.update(kwargs)
    resp = await client.post(
        f"/repos/{owner}/{repo}/pulls",
        headers=auth_headers,
        json=defaults,
    )
    return resp


async def test_create_pr(client, auth_headers):
    resp = await _create_pr(client, auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Test PR"
    assert data["number"] == 1
    assert data["state"] == "open"
    assert data["head"]["ref"] == "feature"


async def test_list_prs(client, auth_headers):
    await _create_pr(client, auth_headers)
    await _create_pr(client, auth_headers, title="Second PR", head="feature-2")

    resp = await client.get("/repos/org/repo/pulls", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_list_prs_filter_state(client, auth_headers):
    await _create_pr(client, auth_headers)
    resp = await client.get(
        "/repos/org/repo/pulls", headers=auth_headers, params={"state": "closed"}
    )
    assert len(resp.json()) == 0


async def test_get_pr(client, auth_headers):
    await _create_pr(client, auth_headers)
    resp = await client.get("/repos/org/repo/pulls/1", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["number"] == 1


async def test_get_pr_not_found(client, auth_headers):
    resp = await client.get("/repos/org/repo/pulls/999", headers=auth_headers)
    assert resp.status_code == 404


async def test_update_pr(client, auth_headers):
    await _create_pr(client, auth_headers)
    resp = await client.patch(
        "/repos/org/repo/pulls/1",
        headers=auth_headers,
        json={"title": "Updated Title"},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"


async def test_close_pr(client, auth_headers):
    await _create_pr(client, auth_headers)
    resp = await client.patch(
        "/repos/org/repo/pulls/1",
        headers=auth_headers,
        json={"state": "closed"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "closed"
    assert data["closed_at"] is not None


async def test_list_pr_files(client, auth_headers):
    await _create_pr(client, auth_headers)
    resp = await client.get("/repos/org/repo/pulls/1/files", headers=auth_headers)
    assert resp.status_code == 200
    files = resp.json()
    assert len(files) >= 1
    assert "filename" in files[0]


async def test_merge_pr(client, auth_headers):
    await _create_pr(client, auth_headers)
    resp = await client.put(
        "/repos/org/repo/pulls/1/merge",
        headers=auth_headers,
        json={"merge_method": "squash"},
    )
    assert resp.status_code == 200
    assert resp.json()["merged"] is True


async def test_merge_already_merged(client, auth_headers):
    await _create_pr(client, auth_headers)
    await client.put(
        "/repos/org/repo/pulls/1/merge",
        headers=auth_headers,
        json={"merge_method": "merge"},
    )
    resp = await client.put(
        "/repos/org/repo/pulls/1/merge",
        headers=auth_headers,
        json={"merge_method": "merge"},
    )
    assert resp.status_code == 405


async def test_check_merge_status_not_merged(client, auth_headers):
    await _create_pr(client, auth_headers)
    resp = await client.get("/repos/org/repo/pulls/1/merge", headers=auth_headers)
    assert resp.status_code == 404


async def test_check_merge_status_merged(client, auth_headers):
    await _create_pr(client, auth_headers)
    await client.put(
        "/repos/org/repo/pulls/1/merge",
        headers=auth_headers,
        json={"merge_method": "merge"},
    )
    resp = await client.get("/repos/org/repo/pulls/1/merge", headers=auth_headers)
    assert resp.status_code == 204


async def test_list_pr_commits(client, auth_headers):
    await _create_pr(client, auth_headers)
    resp = await client.get("/repos/org/repo/pulls/1/commits", headers=auth_headers)
    assert resp.status_code == 200
    commits = resp.json()
    assert len(commits) >= 1
