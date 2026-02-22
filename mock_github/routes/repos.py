"""Repository, branch, commit, and status endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from mock_github.auth import verify_token
from mock_github.models.common import now_iso
from mock_github.models.repos import CreateRepoRequest, CreateStatusRequest, UpdateRepoRequest

router = APIRouter()


def _get_store(request: Request):
    return request.app.state.store


@router.post("/user/repos", status_code=201)
async def create_user_repo(
    body: CreateRepoRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Create a repo for the authenticated user."""
    store = _get_store(request)
    owner = user["login"]
    key = (owner, body.name)

    if key in store.repos:
        raise HTTPException(status_code=422, detail="Repository already exists")

    repo = store.ensure_repo(owner, body.name)
    repo.update({
        "description": body.description,
        "private": body.private,
        "default_branch": body.default_branch,
    })
    return repo


@router.post("/orgs/{org}/repos", status_code=201)
async def create_org_repo(
    org: str,
    body: CreateRepoRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Create a repo under an organization."""
    store = _get_store(request)
    key = (org, body.name)

    if key in store.repos:
        raise HTTPException(status_code=422, detail="Repository already exists")

    repo = store.ensure_repo(org, body.name)
    repo.update({
        "description": body.description,
        "private": body.private,
        "default_branch": body.default_branch,
        "owner": {"login": org, "id": 1, "type": "Organization"},
    })
    return repo


@router.get("/repos/{owner}/{repo}")
async def get_repo(
    owner: str,
    repo: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get a repository. Auto-creates if auto_create_repos is enabled."""
    store = _get_store(request)
    repo_data = store.ensure_repo(owner, repo)
    if not repo_data:
        raise HTTPException(status_code=404, detail="Not Found")
    return repo_data


@router.patch("/repos/{owner}/{repo}")
async def update_repo(
    owner: str,
    repo: str,
    body: UpdateRepoRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Update a repository."""
    store = _get_store(request)
    key = (owner, repo)
    repo_data = store.ensure_repo(owner, repo)
    if not repo_data:
        raise HTTPException(status_code=404, detail="Not Found")

    updates = body.model_dump(exclude_none=True)
    repo_data.update(updates)
    repo_data["updated_at"] = now_iso()

    # Handle name change
    if body.name and body.name != repo:
        store.repos[(owner, body.name)] = store.repos.pop(key)
        repo_data["name"] = body.name
        repo_data["full_name"] = f"{owner}/{body.name}"

    return repo_data


@router.delete("/repos/{owner}/{repo}", status_code=204)
async def delete_repo(
    owner: str,
    repo: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Delete a repository and all related data."""
    store = _get_store(request)
    key = (owner, repo)

    if key not in store.repos:
        raise HTTPException(status_code=404, detail="Not Found")

    store.repos.pop(key, None)
    store.branches.pop(key, None)
    store.commits.pop(key, None)
    store.pulls.pop(key, None)
    store.code_scanning_alerts.pop(key, None)
    store.workflows.pop(key, None)
    store.workflow_runs.pop(key, None)
    store.secrets.pop(key, None)
    store.variables.pop(key, None)
    store.caches.pop(key, None)
    store.permissions.pop(key, None)


# --- Branches ---


@router.get("/repos/{owner}/{repo}/branches")
async def list_branches(
    owner: str,
    repo: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> list[dict[str, Any]]:
    """List branches for a repo."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    return store.branches.get((owner, repo), [])


@router.get("/repos/{owner}/{repo}/branches/{branch}")
async def get_branch(
    owner: str,
    repo: str,
    branch: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get a specific branch."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    branches = store.branches.get((owner, repo), [])
    for b in branches:
        if b["name"] == branch:
            return b
    raise HTTPException(status_code=404, detail="Branch not found")


# --- Commits ---


@router.get("/repos/{owner}/{repo}/commits")
async def list_commits(
    owner: str,
    repo: str,
    request: Request,
    sha: str | None = None,
    user: dict[str, Any] = Depends(verify_token),
) -> list[dict[str, Any]]:
    """List commits for a repo."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    commits = store.commits.get((owner, repo), [])
    if sha:
        commits = [c for c in commits if c.get("sha", "").startswith(sha)]
    return commits


@router.get("/repos/{owner}/{repo}/commits/{ref}")
async def get_commit(
    owner: str,
    repo: str,
    ref: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get a specific commit by ref."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    commits = store.commits.get((owner, repo), [])
    for c in commits:
        if c.get("sha", "").startswith(ref):
            return c

    # Return a synthetic commit for any ref
    return {
        "sha": ref if len(ref) == 40 else ref + "0" * (40 - len(ref)),
        "node_id": f"C_{ref}",
        "commit": {
            "message": "Mock commit",
            "author": {"name": "Mock User", "email": "mock@example.com", "date": now_iso()},
            "committer": {"name": "Mock User", "email": "mock@example.com", "date": now_iso()},
        },
        "author": {"login": "mock-user", "id": 1},
        "committer": {"login": "mock-user", "id": 1},
        "html_url": f"https://github.com/{owner}/{repo}/commit/{ref}",
        "url": f"https://api.github.com/repos/{owner}/{repo}/commits/{ref}",
    }


# --- Commit Statuses ---


@router.post("/repos/{owner}/{repo}/statuses/{sha}", status_code=201)
async def create_commit_status(
    owner: str,
    repo: str,
    sha: str,
    body: CreateStatusRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Create a commit status."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    status_id = store.next_id()
    now = now_iso()

    status = {
        "id": status_id,
        "node_id": f"S_{status_id}",
        "state": body.state,
        "target_url": body.target_url,
        "description": body.description,
        "context": body.context,
        "url": f"https://api.github.com/repos/{owner}/{repo}/statuses/{sha}",
        "creator": {"login": user["login"], "id": user["id"]},
        "created_at": now,
        "updated_at": now,
    }

    key = (owner, repo, sha)
    if key not in store.commit_statuses:
        store.commit_statuses[key] = []
    store.commit_statuses[key].insert(0, status)
    return status


@router.get("/repos/{owner}/{repo}/commits/{ref}/statuses")
async def list_statuses_for_ref(
    owner: str,
    repo: str,
    ref: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> list[dict[str, Any]]:
    """List statuses for a ref."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    return store.commit_statuses.get((owner, repo, ref), [])


@router.get("/repos/{owner}/{repo}/commits/{ref}/status")
async def get_combined_status(
    owner: str,
    repo: str,
    ref: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get combined status for a ref."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    statuses = store.commit_statuses.get((owner, repo, ref), [])

    # Determine combined state
    if not statuses:
        state = "pending"
    elif any(s["state"] == "failure" for s in statuses):
        state = "failure"
    elif any(s["state"] == "error" for s in statuses):
        state = "error"
    elif any(s["state"] == "pending" for s in statuses):
        state = "pending"
    else:
        state = "success"

    return {
        "state": state,
        "statuses": statuses,
        "sha": ref,
        "total_count": len(statuses),
        "repository": store.repos.get((owner, repo), {}),
    }
