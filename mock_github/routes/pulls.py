"""Pull request endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from mock_github.auth import verify_token
from mock_github.models.common import now_iso
from mock_github.models.pulls import CreatePullRequest, MergePullRequest, UpdatePullRequest

router = APIRouter()


def _get_store(request: Request):
    return request.app.state.store


@router.get("/repos/{owner}/{repo}/pulls")
async def list_pull_requests(
    owner: str,
    repo: str,
    request: Request,
    state: str = "open",
    head: str | None = None,
    base: str | None = None,
    user: dict[str, Any] = Depends(verify_token),
) -> list[dict[str, Any]]:
    """List pull requests with optional filters."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    pulls = list(store.pulls.get((owner, repo), {}).values())

    if state != "all":
        pulls = [p for p in pulls if p.get("state") == state]
    if head:
        pulls = [p for p in pulls if p.get("head", {}).get("ref") == head]
    if base:
        pulls = [p for p in pulls if p.get("base", {}).get("ref") == base]

    return pulls


@router.post("/repos/{owner}/{repo}/pulls", status_code=201)
async def create_pull_request(
    owner: str,
    repo: str,
    body: CreatePullRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Create a pull request."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    pr_number = store.next_pr_number(owner, repo)
    pr_id = store.next_id()
    now = now_iso()
    merge_commit_sha = f"merge{'0' * 35}"

    pr = {
        "id": pr_id,
        "node_id": f"PR_{pr_id}",
        "number": pr_number,
        "state": "open",
        "title": body.title,
        "body": body.body,
        "draft": body.draft,
        "locked": False,
        "user": {"login": user["login"], "id": user["id"]},
        "head": {
            "ref": body.head,
            "sha": "a" * 40,
            "label": f"{owner}:{body.head}",
        },
        "base": {
            "ref": body.base,
            "sha": "b" * 40,
            "label": f"{owner}:{body.base}",
        },
        "merged": False,
        "mergeable": True,
        "merge_commit_sha": merge_commit_sha,
        "merged_by": None,
        "comments": 0,
        "commits": 1,
        "additions": 10,
        "deletions": 2,
        "changed_files": 1,
        "html_url": f"https://github.com/{owner}/{repo}/pull/{pr_number}",
        "url": f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}",
        "created_at": now,
        "updated_at": now,
        "closed_at": None,
        "merged_at": None,
    }

    key = (owner, repo)
    if key not in store.pulls:
        store.pulls[key] = {}
    store.pulls[key][pr_number] = pr
    return pr


@router.get("/repos/{owner}/{repo}/pulls/{pull_number}")
async def get_pull_request(
    owner: str,
    repo: str,
    pull_number: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get a pull request."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    pr = store.pulls.get((owner, repo), {}).get(pull_number)
    if not pr:
        raise HTTPException(status_code=404, detail="Pull request not found")
    return pr


@router.patch("/repos/{owner}/{repo}/pulls/{pull_number}")
async def update_pull_request(
    owner: str,
    repo: str,
    pull_number: int,
    body: UpdatePullRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Update a pull request."""
    store = _get_store(request)
    pr = store.pulls.get((owner, repo), {}).get(pull_number)
    if not pr:
        raise HTTPException(status_code=404, detail="Pull request not found")

    updates = body.model_dump(exclude_none=True)
    pr.update(updates)
    pr["updated_at"] = now_iso()

    if body.state == "closed":
        pr["closed_at"] = now_iso()

    return pr


@router.get("/repos/{owner}/{repo}/pulls/{pull_number}/files")
async def list_pull_request_files(
    owner: str,
    repo: str,
    pull_number: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> list[dict[str, Any]]:
    """List changed files in a pull request."""
    store = _get_store(request)
    key = (owner, repo, pull_number)
    files = store.pull_files.get(key)
    if files is not None:
        return files

    # Return a default file list
    return [
        {
            "sha": "f" * 40,
            "filename": "README.md",
            "status": "modified",
            "additions": 10,
            "deletions": 2,
            "changes": 12,
            "patch": "@@ -1 +1 @@\n-old\n+new",
        }
    ]


@router.get("/repos/{owner}/{repo}/pulls/{pull_number}/merge")
async def check_merge_status(
    owner: str,
    repo: str,
    pull_number: int,
    request: Request,
    response: Response,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Check if a PR has been merged. 204 = merged, 404 = not merged."""
    store = _get_store(request)
    pr = store.pulls.get((owner, repo), {}).get(pull_number)
    if not pr:
        raise HTTPException(status_code=404, detail="Pull request not found")
    if pr.get("merged"):
        response.status_code = 204
        return
    raise HTTPException(status_code=404, detail="Not merged")


@router.put("/repos/{owner}/{repo}/pulls/{pull_number}/merge")
async def merge_pull_request(
    owner: str,
    repo: str,
    pull_number: int,
    body: MergePullRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Merge a pull request."""
    store = _get_store(request)
    pr = store.pulls.get((owner, repo), {}).get(pull_number)
    if not pr:
        raise HTTPException(status_code=404, detail="Pull request not found")
    if pr.get("merged"):
        raise HTTPException(status_code=405, detail="Pull request already merged")

    now = now_iso()
    merge_sha = "m" * 40
    pr["merged"] = True
    pr["merged_at"] = now
    pr["state"] = "closed"
    pr["closed_at"] = now
    pr["merged_by"] = {"login": user["login"], "id": user["id"]}
    pr["merge_commit_sha"] = merge_sha

    return {
        "sha": merge_sha,
        "merged": True,
        "message": "Pull Request successfully merged",
    }


@router.get("/repos/{owner}/{repo}/pulls/{pull_number}/commits")
async def list_pull_request_commits(
    owner: str,
    repo: str,
    pull_number: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> list[dict[str, Any]]:
    """List commits on a pull request."""
    store = _get_store(request)
    pr = store.pulls.get((owner, repo), {}).get(pull_number)
    if not pr:
        raise HTTPException(status_code=404, detail="Pull request not found")

    head_sha = pr.get("head", {}).get("sha", "a" * 40)
    return [
        {
            "sha": head_sha,
            "commit": {
                "message": f"Commit for PR #{pull_number}",
                "author": {"name": "Mock User", "email": "mock@example.com", "date": now_iso()},
            },
            "author": {"login": user["login"], "id": user["id"]},
        }
    ]
