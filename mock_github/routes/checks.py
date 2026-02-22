"""Check run and check suite endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from mock_github.auth import verify_token
from mock_github.models.checks import CreateCheckRunRequest, CreateCheckSuiteRequest, UpdateCheckRunRequest
from mock_github.models.common import now_iso

router = APIRouter()


def _get_store(request: Request):
    return request.app.state.store


# --- Check Runs ---


@router.post("/repos/{owner}/{repo}/check-runs", status_code=201)
async def create_check_run(
    owner: str,
    repo: str,
    body: CreateCheckRunRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Create a check run."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    check_run_id = store.next_id()
    now = now_iso()

    output = None
    if body.output:
        output = body.output.model_dump()

    check_run = {
        "id": check_run_id,
        "node_id": f"CR_{check_run_id}",
        "name": body.name,
        "head_sha": body.head_sha,
        "status": body.status,
        "conclusion": body.conclusion,
        "started_at": body.started_at or now,
        "completed_at": body.completed_at,
        "details_url": body.details_url,
        "external_id": body.external_id,
        "output": output or {"title": "", "summary": "", "text": None, "annotations": [], "annotations_count": 0},
        "app": {"id": 1, "slug": "mock-github-app", "name": "Mock GitHub App"},
        "url": f"https://api.github.com/repos/{owner}/{repo}/check-runs/{check_run_id}",
        "html_url": f"https://github.com/{owner}/{repo}/runs/{check_run_id}",
        "check_suite": {"id": None},
        "_owner": owner,
        "_repo": repo,
    }

    if body.conclusion:
        check_run["status"] = "completed"
        check_run["completed_at"] = check_run["completed_at"] or now

    store.check_runs[check_run_id] = check_run

    # Index by ref
    ref_key = (owner, repo, body.head_sha)
    if ref_key not in store.ref_check_runs:
        store.ref_check_runs[ref_key] = []
    store.ref_check_runs[ref_key].append(check_run_id)

    return check_run


@router.get("/repos/{owner}/{repo}/check-runs/{check_run_id}")
async def get_check_run(
    owner: str,
    repo: str,
    check_run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get a check run."""
    store = _get_store(request)
    check_run = store.check_runs.get(check_run_id)
    if not check_run:
        raise HTTPException(status_code=404, detail="Check run not found")
    return check_run


@router.patch("/repos/{owner}/{repo}/check-runs/{check_run_id}")
async def update_check_run(
    owner: str,
    repo: str,
    check_run_id: int,
    body: UpdateCheckRunRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Update a check run."""
    store = _get_store(request)
    check_run = store.check_runs.get(check_run_id)
    if not check_run:
        raise HTTPException(status_code=404, detail="Check run not found")

    updates = body.model_dump(exclude_none=True)
    if "output" in updates and updates["output"]:
        # Merge output fields
        existing_output = check_run.get("output", {})
        existing_output.update(updates.pop("output"))
        check_run["output"] = existing_output

    check_run.update(updates)

    if body.conclusion:
        check_run["status"] = "completed"
        check_run["completed_at"] = check_run.get("completed_at") or now_iso()

    return check_run


@router.get("/repos/{owner}/{repo}/check-runs/{check_run_id}/annotations")
async def list_check_run_annotations(
    owner: str,
    repo: str,
    check_run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> list[dict[str, Any]]:
    """List annotations for a check run."""
    store = _get_store(request)
    check_run = store.check_runs.get(check_run_id)
    if not check_run:
        raise HTTPException(status_code=404, detail="Check run not found")
    output = check_run.get("output", {})
    return output.get("annotations", [])


@router.post("/repos/{owner}/{repo}/check-runs/{check_run_id}/rerequest", status_code=201)
async def rerequest_check_run(
    owner: str,
    repo: str,
    check_run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Rerequest a check run."""
    store = _get_store(request)
    check_run = store.check_runs.get(check_run_id)
    if not check_run:
        raise HTTPException(status_code=404, detail="Check run not found")

    check_run["status"] = "queued"
    check_run["conclusion"] = None
    check_run["completed_at"] = None
    check_run["started_at"] = now_iso()

    return {}


@router.get("/repos/{owner}/{repo}/commits/{ref}/check-runs")
async def list_check_runs_for_ref(
    owner: str,
    repo: str,
    ref: str,
    request: Request,
    check_name: str | None = None,
    status: str | None = None,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """List check runs for a git reference."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    run_ids = store.ref_check_runs.get((owner, repo, ref), [])
    runs = [store.check_runs[rid] for rid in run_ids if rid in store.check_runs]

    if check_name:
        runs = [r for r in runs if r.get("name") == check_name]
    if status:
        runs = [r for r in runs if r.get("status") == status]

    return {"total_count": len(runs), "check_runs": runs}


# --- Check Suites ---


@router.post("/repos/{owner}/{repo}/check-suites", status_code=201)
async def create_check_suite(
    owner: str,
    repo: str,
    body: CreateCheckSuiteRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Create a check suite."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    suite_id = store.next_id()
    now = now_iso()

    suite = {
        "id": suite_id,
        "node_id": f"CS_{suite_id}",
        "head_sha": body.head_sha,
        "head_branch": "main",
        "status": "queued",
        "conclusion": None,
        "url": f"https://api.github.com/repos/{owner}/{repo}/check-suites/{suite_id}",
        "app": {"id": 1, "slug": "mock-github-app", "name": "Mock GitHub App"},
        "created_at": now,
        "updated_at": now,
        "_owner": owner,
        "_repo": repo,
    }

    store.check_suites[suite_id] = suite
    store.suite_check_runs[suite_id] = []

    ref_key = (owner, repo, body.head_sha)
    if ref_key not in store.ref_check_suites:
        store.ref_check_suites[ref_key] = []
    store.ref_check_suites[ref_key].append(suite_id)

    return suite


@router.get("/repos/{owner}/{repo}/check-suites/{check_suite_id}")
async def get_check_suite(
    owner: str,
    repo: str,
    check_suite_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get a check suite."""
    store = _get_store(request)
    suite = store.check_suites.get(check_suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Check suite not found")
    return suite


@router.get("/repos/{owner}/{repo}/check-suites/{check_suite_id}/check-runs")
async def list_check_runs_for_suite(
    owner: str,
    repo: str,
    check_suite_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """List check runs in a check suite."""
    store = _get_store(request)
    run_ids = store.suite_check_runs.get(check_suite_id, [])
    runs = [store.check_runs[rid] for rid in run_ids if rid in store.check_runs]
    return {"total_count": len(runs), "check_runs": runs}


@router.post("/repos/{owner}/{repo}/check-suites/{check_suite_id}/rerequest", status_code=201)
async def rerequest_check_suite(
    owner: str,
    repo: str,
    check_suite_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Rerequest a check suite."""
    store = _get_store(request)
    suite = store.check_suites.get(check_suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Check suite not found")

    suite["status"] = "queued"
    suite["conclusion"] = None
    return {}


@router.get("/repos/{owner}/{repo}/commits/{ref}/check-suites")
async def list_check_suites_for_ref(
    owner: str,
    repo: str,
    ref: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """List check suites for a git reference."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    suite_ids = store.ref_check_suites.get((owner, repo, ref), [])
    suites = [store.check_suites[sid] for sid in suite_ids if sid in store.check_suites]
    return {"total_count": len(suites), "check_suites": suites}
