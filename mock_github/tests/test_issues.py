"""Tests for issue/PR comment endpoints."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


async def test_create_comment(client, auth_headers):
    resp = await client.post(
        "/repos/org/repo/issues/1/comments",
        headers=auth_headers,
        json={"body": "Test comment"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["body"] == "Test comment"
    assert "id" in data
    assert data["user"]["login"] == "mock-user"


async def test_list_comments(client, auth_headers):
    await client.post(
        "/repos/org/repo/issues/1/comments",
        headers=auth_headers,
        json={"body": "Comment 1"},
    )
    await client.post(
        "/repos/org/repo/issues/1/comments",
        headers=auth_headers,
        json={"body": "Comment 2"},
    )

    resp = await client.get("/repos/org/repo/issues/1/comments", headers=auth_headers)
    assert resp.status_code == 200
    comments = resp.json()
    assert len(comments) == 2


async def test_get_comment(client, auth_headers):
    create_resp = await client.post(
        "/repos/org/repo/issues/1/comments",
        headers=auth_headers,
        json={"body": "Find me"},
    )
    comment_id = create_resp.json()["id"]

    resp = await client.get(
        f"/repos/org/repo/issues/comments/{comment_id}", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["body"] == "Find me"


async def test_update_comment(client, auth_headers):
    create_resp = await client.post(
        "/repos/org/repo/issues/1/comments",
        headers=auth_headers,
        json={"body": "Original"},
    )
    comment_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/repos/org/repo/issues/comments/{comment_id}",
        headers=auth_headers,
        json={"body": "Updated"},
    )
    assert resp.status_code == 200
    assert resp.json()["body"] == "Updated"


async def test_delete_comment(client, auth_headers):
    create_resp = await client.post(
        "/repos/org/repo/issues/1/comments",
        headers=auth_headers,
        json={"body": "Delete me"},
    )
    comment_id = create_resp.json()["id"]

    resp = await client.delete(
        f"/repos/org/repo/issues/comments/{comment_id}", headers=auth_headers
    )
    assert resp.status_code == 204

    resp = await client.get(
        f"/repos/org/repo/issues/comments/{comment_id}", headers=auth_headers
    )
    assert resp.status_code == 404


async def test_comments_isolated_per_issue(client, auth_headers):
    await client.post(
        "/repos/org/repo/issues/1/comments",
        headers=auth_headers,
        json={"body": "Issue 1 comment"},
    )
    await client.post(
        "/repos/org/repo/issues/2/comments",
        headers=auth_headers,
        json={"body": "Issue 2 comment"},
    )

    resp1 = await client.get("/repos/org/repo/issues/1/comments", headers=auth_headers)
    resp2 = await client.get("/repos/org/repo/issues/2/comments", headers=auth_headers)

    assert len(resp1.json()) == 1
    assert len(resp2.json()) == 1
    assert resp1.json()[0]["body"] == "Issue 1 comment"
    assert resp2.json()[0]["body"] == "Issue 2 comment"
