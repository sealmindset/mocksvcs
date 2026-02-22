"""Issue and PR comment endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from mock_github.auth import verify_token
from mock_github.models.common import now_iso
from mock_github.models.issues import CreateCommentRequest, UpdateCommentRequest

router = APIRouter()


def _get_store(request: Request):
    return request.app.state.store


@router.get("/repos/{owner}/{repo}/issues/{issue_number}/comments")
async def list_issue_comments(
    owner: str,
    repo: str,
    issue_number: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> list[dict[str, Any]]:
    """List comments on an issue or PR."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    comment_ids = store.issue_comments.get((owner, repo, issue_number), [])
    return [store.comments[cid] for cid in comment_ids if cid in store.comments]


@router.post("/repos/{owner}/{repo}/issues/{issue_number}/comments", status_code=201)
async def create_issue_comment(
    owner: str,
    repo: str,
    issue_number: int,
    body: CreateCommentRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Create a comment on an issue or PR."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    comment_id = store.next_id()
    now = now_iso()

    comment = {
        "id": comment_id,
        "node_id": f"IC_{comment_id}",
        "body": body.body,
        "user": {"login": user["login"], "id": user["id"]},
        "html_url": f"https://github.com/{owner}/{repo}/issues/{issue_number}#issuecomment-{comment_id}",
        "url": f"https://api.github.com/repos/{owner}/{repo}/issues/comments/{comment_id}",
        "issue_url": f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}",
        "created_at": now,
        "updated_at": now,
    }

    store.comments[comment_id] = comment
    key = (owner, repo, issue_number)
    if key not in store.issue_comments:
        store.issue_comments[key] = []
    store.issue_comments[key].append(comment_id)

    return comment


@router.get("/repos/{owner}/{repo}/issues/comments/{comment_id}")
async def get_issue_comment(
    owner: str,
    repo: str,
    comment_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get a specific comment by ID."""
    store = _get_store(request)
    comment = store.comments.get(comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    return comment


@router.patch("/repos/{owner}/{repo}/issues/comments/{comment_id}")
async def update_issue_comment(
    owner: str,
    repo: str,
    comment_id: int,
    body: UpdateCommentRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Update a comment."""
    store = _get_store(request)
    comment = store.comments.get(comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    comment["body"] = body.body
    comment["updated_at"] = now_iso()
    return comment


@router.delete("/repos/{owner}/{repo}/issues/comments/{comment_id}", status_code=204)
async def delete_issue_comment(
    owner: str,
    repo: str,
    comment_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Delete a comment."""
    store = _get_store(request)
    comment = store.comments.pop(comment_id, None)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Remove from issue_comments index
    for key, ids in store.issue_comments.items():
        if comment_id in ids:
            ids.remove(comment_id)
            break
