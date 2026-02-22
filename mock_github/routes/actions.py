"""GitHub Actions endpoints: workflows, runs, jobs, artifacts, secrets, variables, caches, permissions."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response

from mock_github.auth import verify_token
from mock_github.models.actions import (
    ActionsPermissionsRequest,
    CreateOrUpdateSecretRequest,
    CreateVariableRequest,
    UpdateVariableRequest,
    WorkflowDispatchRequest,
)
from mock_github.models.common import now_iso

router = APIRouter()


def _get_store(request: Request):
    return request.app.state.store


# ── Workflows ──────────────────────────────────────────────────────


@router.get("/repos/{owner}/{repo}/actions/workflows")
async def list_workflows(
    owner: str,
    repo: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """List workflows for a repository."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    workflows = list(store.workflows.get((owner, repo), {}).values())
    return {"total_count": len(workflows), "workflows": workflows}


@router.get("/repos/{owner}/{repo}/actions/workflows/{workflow_id}")
async def get_workflow(
    owner: str,
    repo: str,
    workflow_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get a workflow."""
    store = _get_store(request)
    workflow = store.workflows.get((owner, repo), {}).get(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


@router.post("/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches", status_code=204)
async def create_workflow_dispatch(
    owner: str,
    repo: str,
    workflow_id: int,
    body: WorkflowDispatchRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Trigger a workflow dispatch event. Creates a workflow run."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)

    # Ensure workflow exists (create if not)
    key = (owner, repo)
    if key not in store.workflows:
        store.workflows[key] = {}
    if workflow_id not in store.workflows[key]:
        store.workflows[key][workflow_id] = _make_workflow(store, owner, repo, workflow_id)

    # Create a run
    run_id = store.next_id()
    now = now_iso()
    run = {
        "id": run_id,
        "node_id": f"WR_{run_id}",
        "name": store.workflows[key][workflow_id].get("name", "Mock Workflow"),
        "head_branch": body.ref,
        "head_sha": "d" * 40,
        "run_number": len(store.workflow_runs.get(key, {})) + 1,
        "event": "workflow_dispatch",
        "status": "queued",
        "conclusion": None,
        "workflow_id": workflow_id,
        "url": f"https://api.github.com/repos/{owner}/{repo}/actions/runs/{run_id}",
        "html_url": f"https://github.com/{owner}/{repo}/actions/runs/{run_id}",
        "created_at": now,
        "updated_at": now,
        "run_started_at": now,
        "jobs_url": f"https://api.github.com/repos/{owner}/{repo}/actions/runs/{run_id}/jobs",
        "logs_url": f"https://api.github.com/repos/{owner}/{repo}/actions/runs/{run_id}/logs",
        "artifacts_url": f"https://api.github.com/repos/{owner}/{repo}/actions/runs/{run_id}/artifacts",
    }

    if key not in store.workflow_runs:
        store.workflow_runs[key] = {}
    store.workflow_runs[key][run_id] = run


@router.put("/repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable", status_code=204)
async def enable_workflow(
    owner: str,
    repo: str,
    workflow_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Enable a workflow."""
    store = _get_store(request)
    key = (owner, repo)
    workflow = store.workflows.get(key, {}).get(workflow_id)
    if workflow:
        workflow["state"] = "active"


@router.put("/repos/{owner}/{repo}/actions/workflows/{workflow_id}/disable", status_code=204)
async def disable_workflow(
    owner: str,
    repo: str,
    workflow_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Disable a workflow."""
    store = _get_store(request)
    key = (owner, repo)
    workflow = store.workflows.get(key, {}).get(workflow_id)
    if workflow:
        workflow["state"] = "disabled_manually"


# ── Workflow Runs ──────────────────────────────────────────────────


@router.get("/repos/{owner}/{repo}/actions/runs")
async def list_workflow_runs(
    owner: str,
    repo: str,
    request: Request,
    status: str | None = None,
    event: str | None = None,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """List workflow runs."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    runs = list(store.workflow_runs.get((owner, repo), {}).values())

    if status:
        runs = [r for r in runs if r.get("status") == status]
    if event:
        runs = [r for r in runs if r.get("event") == event]

    return {"total_count": len(runs), "workflow_runs": runs}


@router.get("/repos/{owner}/{repo}/actions/runs/{run_id}")
async def get_workflow_run(
    owner: str,
    repo: str,
    run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get a workflow run."""
    store = _get_store(request)
    run = store.workflow_runs.get((owner, repo), {}).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    return run


@router.delete("/repos/{owner}/{repo}/actions/runs/{run_id}", status_code=204)
async def delete_workflow_run(
    owner: str,
    repo: str,
    run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Delete a workflow run."""
    store = _get_store(request)
    runs = store.workflow_runs.get((owner, repo), {})
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    del runs[run_id]


@router.post("/repos/{owner}/{repo}/actions/runs/{run_id}/cancel", status_code=202)
async def cancel_workflow_run(
    owner: str,
    repo: str,
    run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Cancel a workflow run."""
    store = _get_store(request)
    run = store.workflow_runs.get((owner, repo), {}).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    run["status"] = "completed"
    run["conclusion"] = "cancelled"
    run["updated_at"] = now_iso()
    return {}


@router.post("/repos/{owner}/{repo}/actions/runs/{run_id}/rerun", status_code=201)
async def rerun_workflow(
    owner: str,
    repo: str,
    run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Rerun all jobs in a workflow run."""
    store = _get_store(request)
    run = store.workflow_runs.get((owner, repo), {}).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    run["status"] = "queued"
    run["conclusion"] = None
    run["updated_at"] = now_iso()
    return {}


@router.post("/repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs", status_code=201)
async def rerun_failed_jobs(
    owner: str,
    repo: str,
    run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Rerun failed jobs in a workflow run."""
    store = _get_store(request)
    run = store.workflow_runs.get((owner, repo), {}).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    run["status"] = "queued"
    run["conclusion"] = None
    run["updated_at"] = now_iso()

    # Reset failed jobs
    job_ids = store.run_jobs.get((owner, repo, run_id), [])
    for jid in job_ids:
        job = store.jobs.get(jid)
        if job and job.get("conclusion") == "failure":
            job["status"] = "queued"
            job["conclusion"] = None

    return {}


@router.get("/repos/{owner}/{repo}/actions/runs/{run_id}/timing")
async def get_workflow_run_timing(
    owner: str,
    repo: str,
    run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get run timing information."""
    store = _get_store(request)
    run = store.workflow_runs.get((owner, repo), {}).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    return {
        "billable": {
            "UBUNTU": {"total_ms": 60000, "jobs": 1},
        },
        "run_duration_ms": 60000,
    }


@router.get("/repos/{owner}/{repo}/actions/runs/{run_id}/logs")
async def download_run_logs(
    owner: str,
    repo: str,
    run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> PlainTextResponse:
    """Download run logs as text."""
    store = _get_store(request)
    run = store.workflow_runs.get((owner, repo), {}).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    return PlainTextResponse(
        f"Mock logs for workflow run {run_id}\n[{now_iso()}] Run completed.\n"
    )


@router.delete("/repos/{owner}/{repo}/actions/runs/{run_id}/logs", status_code=204)
async def delete_run_logs(
    owner: str,
    repo: str,
    run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Delete run logs."""
    store = _get_store(request)
    run = store.workflow_runs.get((owner, repo), {}).get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")


# ── Jobs ───────────────────────────────────────────────────────────


@router.get("/repos/{owner}/{repo}/actions/runs/{run_id}/jobs")
async def list_jobs_for_run(
    owner: str,
    repo: str,
    run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """List jobs for a workflow run."""
    store = _get_store(request)
    job_ids = store.run_jobs.get((owner, repo, run_id), [])
    jobs = [store.jobs[jid] for jid in job_ids if jid in store.jobs]
    return {"total_count": len(jobs), "jobs": jobs}


@router.get("/repos/{owner}/{repo}/actions/jobs/{job_id}")
async def get_job(
    owner: str,
    repo: str,
    job_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get a job."""
    store = _get_store(request)
    job = store.jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/repos/{owner}/{repo}/actions/jobs/{job_id}/logs")
async def download_job_logs(
    owner: str,
    repo: str,
    job_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> PlainTextResponse:
    """Download job logs as text."""
    store = _get_store(request)
    job = store.jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return PlainTextResponse(
        f"Mock logs for job {job_id}\n[{now_iso()}] Job completed.\n"
    )


# ── Artifacts ──────────────────────────────────────────────────────


@router.get("/repos/{owner}/{repo}/actions/artifacts")
async def list_artifacts(
    owner: str,
    repo: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """List all artifacts for a repository."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    # Filter artifacts belonging to this repo
    artifacts = [
        a for a in store.artifacts.values()
        if a.get("_owner") == owner and a.get("_repo") == repo
    ]
    return {"total_count": len(artifacts), "artifacts": artifacts}


@router.get("/repos/{owner}/{repo}/actions/runs/{run_id}/artifacts")
async def list_run_artifacts(
    owner: str,
    repo: str,
    run_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """List artifacts for a workflow run."""
    store = _get_store(request)
    artifact_ids = store.run_artifacts.get((owner, repo, run_id), [])
    artifacts = [store.artifacts[aid] for aid in artifact_ids if aid in store.artifacts]
    return {"total_count": len(artifacts), "artifacts": artifacts}


@router.get("/repos/{owner}/{repo}/actions/artifacts/{artifact_id}")
async def get_artifact(
    owner: str,
    repo: str,
    artifact_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get artifact metadata."""
    store = _get_store(request)
    artifact = store.artifacts.get(artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return artifact


@router.get("/repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip")
async def download_artifact(
    owner: str,
    repo: str,
    artifact_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> Response:
    """Download artifact as zip (returns mock binary content)."""
    store = _get_store(request)
    artifact = store.artifacts.get(artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return Response(
        content=b"PK\x03\x04mock-artifact-content",
        media_type="application/zip",
    )


@router.delete("/repos/{owner}/{repo}/actions/artifacts/{artifact_id}", status_code=204)
async def delete_artifact(
    owner: str,
    repo: str,
    artifact_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Delete an artifact."""
    store = _get_store(request)
    if artifact_id not in store.artifacts:
        raise HTTPException(status_code=404, detail="Artifact not found")
    del store.artifacts[artifact_id]


# ── Secrets ────────────────────────────────────────────────────────


@router.get("/repos/{owner}/{repo}/actions/secrets/public-key")
async def get_repo_public_key(
    owner: str,
    repo: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get the repository public key for encrypting secrets."""
    return {
        "key_id": "mock-key-id-123456",
        "key": "hBT5WZEj8ZoOv6TYJsfJq+5fsMMinUDmcB3cA7sKUME=",
    }


@router.get("/repos/{owner}/{repo}/actions/secrets")
async def list_secrets(
    owner: str,
    repo: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """List repository secrets (names only, no values)."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    secrets = store.secrets.get((owner, repo), {})
    secret_list = [
        {"name": name, "created_at": s.get("created_at"), "updated_at": s.get("updated_at")}
        for name, s in secrets.items()
    ]
    return {"total_count": len(secret_list), "secrets": secret_list}


@router.get("/repos/{owner}/{repo}/actions/secrets/{secret_name}")
async def get_secret(
    owner: str,
    repo: str,
    secret_name: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get secret metadata (no value)."""
    store = _get_store(request)
    secret = store.secrets.get((owner, repo), {}).get(secret_name)
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
    return {
        "name": secret_name,
        "created_at": secret.get("created_at"),
        "updated_at": secret.get("updated_at"),
    }


@router.put("/repos/{owner}/{repo}/actions/secrets/{secret_name}", status_code=204)
async def create_or_update_secret(
    owner: str,
    repo: str,
    secret_name: str,
    body: CreateOrUpdateSecretRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Create or update a repository secret."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    now = now_iso()
    key = (owner, repo)

    if key not in store.secrets:
        store.secrets[key] = {}

    existing = store.secrets[key].get(secret_name)
    store.secrets[key][secret_name] = {
        "encrypted_value": body.encrypted_value,
        "key_id": body.key_id,
        "created_at": existing["created_at"] if existing else now,
        "updated_at": now,
    }


@router.delete("/repos/{owner}/{repo}/actions/secrets/{secret_name}", status_code=204)
async def delete_secret(
    owner: str,
    repo: str,
    secret_name: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Delete a repository secret."""
    store = _get_store(request)
    secrets = store.secrets.get((owner, repo), {})
    if secret_name not in secrets:
        raise HTTPException(status_code=404, detail="Secret not found")
    del secrets[secret_name]


# ── Variables ──────────────────────────────────────────────────────


@router.get("/repos/{owner}/{repo}/actions/variables")
async def list_variables(
    owner: str,
    repo: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """List repository variables."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    variables = list(store.variables.get((owner, repo), {}).values())
    return {"total_count": len(variables), "variables": variables}


@router.post("/repos/{owner}/{repo}/actions/variables", status_code=201)
async def create_variable(
    owner: str,
    repo: str,
    body: CreateVariableRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Create a repository variable."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    now = now_iso()
    key = (owner, repo)

    if key not in store.variables:
        store.variables[key] = {}

    if body.name in store.variables[key]:
        raise HTTPException(status_code=409, detail="Variable already exists")

    variable = {
        "name": body.name,
        "value": body.value,
        "created_at": now,
        "updated_at": now,
    }
    store.variables[key][body.name] = variable
    return variable


@router.get("/repos/{owner}/{repo}/actions/variables/{name}")
async def get_variable(
    owner: str,
    repo: str,
    name: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get a repository variable."""
    store = _get_store(request)
    variable = store.variables.get((owner, repo), {}).get(name)
    if not variable:
        raise HTTPException(status_code=404, detail="Variable not found")
    return variable


@router.patch("/repos/{owner}/{repo}/actions/variables/{name}")
async def update_variable(
    owner: str,
    repo: str,
    name: str,
    body: UpdateVariableRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Update a repository variable."""
    store = _get_store(request)
    variable = store.variables.get((owner, repo), {}).get(name)
    if not variable:
        raise HTTPException(status_code=404, detail="Variable not found")

    variable["value"] = body.value
    if body.name:
        # Rename
        old_name = name
        store.variables[(owner, repo)][body.name] = variable
        if body.name != old_name:
            del store.variables[(owner, repo)][old_name]
        variable["name"] = body.name
    variable["updated_at"] = now_iso()
    return variable


@router.delete("/repos/{owner}/{repo}/actions/variables/{name}", status_code=204)
async def delete_variable(
    owner: str,
    repo: str,
    name: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Delete a repository variable."""
    store = _get_store(request)
    variables = store.variables.get((owner, repo), {})
    if name not in variables:
        raise HTTPException(status_code=404, detail="Variable not found")
    del variables[name]


# ── Permissions ────────────────────────────────────────────────────


@router.get("/repos/{owner}/{repo}/actions/permissions")
async def get_actions_permissions(
    owner: str,
    repo: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get Actions permissions for a repository."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    return store.permissions.get((owner, repo), {
        "enabled": True,
        "allowed_actions": "all",
        "selected_actions_url": "",
    })


@router.put("/repos/{owner}/{repo}/actions/permissions", status_code=204)
async def set_actions_permissions(
    owner: str,
    repo: str,
    body: ActionsPermissionsRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Set Actions permissions for a repository."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    store.permissions[(owner, repo)] = {
        "enabled": body.enabled,
        "allowed_actions": body.allowed_actions,
        "selected_actions_url": "",
    }


# ── Caches ─────────────────────────────────────────────────────────


@router.get("/repos/{owner}/{repo}/actions/caches")
async def list_caches(
    owner: str,
    repo: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """List Actions caches."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    caches = list(store.caches.get((owner, repo), {}).values())
    return {"total_count": len(caches), "actions_caches": caches}


@router.delete("/repos/{owner}/{repo}/actions/caches/{cache_id}", status_code=204)
async def delete_cache(
    owner: str,
    repo: str,
    cache_id: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> None:
    """Delete an Actions cache."""
    store = _get_store(request)
    caches = store.caches.get((owner, repo), {})
    if cache_id not in caches:
        raise HTTPException(status_code=404, detail="Cache not found")
    del caches[cache_id]


@router.get("/repos/{owner}/{repo}/actions/cache/usage")
async def get_cache_usage(
    owner: str,
    repo: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get cache usage for a repository."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    caches = store.caches.get((owner, repo), {})
    total_size = sum(c.get("size_in_bytes", 0) for c in caches.values())
    return {
        "full_name": f"{owner}/{repo}",
        "active_caches_size_in_bytes": total_size,
        "active_caches_count": len(caches),
    }


# ── Helpers ────────────────────────────────────────────────────────


def _make_workflow(store, owner: str, repo: str, workflow_id: int) -> dict[str, Any]:
    """Create a default workflow record."""
    now = now_iso()
    return {
        "id": workflow_id,
        "node_id": f"W_{workflow_id}",
        "name": f"Mock Workflow {workflow_id}",
        "path": f".github/workflows/workflow-{workflow_id}.yml",
        "state": "active",
        "url": f"https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow_id}",
        "html_url": f"https://github.com/{owner}/{repo}/actions/workflows/workflow-{workflow_id}.yml",
        "created_at": now,
        "updated_at": now,
    }
