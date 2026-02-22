"""Code scanning alerts and SARIF upload endpoints."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from mock_github.auth import verify_token
from mock_github.models.code_scanning import SarifUploadRequest, UpdateAlertRequest
from mock_github.models.common import now_iso

router = APIRouter()


def _get_store(request: Request):
    return request.app.state.store


@router.get("/repos/{owner}/{repo}/code-scanning/alerts")
async def list_code_scanning_alerts(
    owner: str,
    repo: str,
    request: Request,
    state: str | None = None,
    tool_name: str | None = None,
    ref: str | None = None,
    user: dict[str, Any] = Depends(verify_token),
) -> list[dict[str, Any]]:
    """List code scanning alerts."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    alerts = list(store.code_scanning_alerts.get((owner, repo), {}).values())

    if state:
        alerts = [a for a in alerts if a.get("state") == state]
    if tool_name:
        alerts = [a for a in alerts if a.get("tool", {}).get("name") == tool_name]

    return alerts


@router.get("/repos/{owner}/{repo}/code-scanning/alerts/{alert_number}")
async def get_code_scanning_alert(
    owner: str,
    repo: str,
    alert_number: int,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get a code scanning alert."""
    store = _get_store(request)
    alert = store.code_scanning_alerts.get((owner, repo), {}).get(alert_number)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.patch("/repos/{owner}/{repo}/code-scanning/alerts/{alert_number}")
async def update_code_scanning_alert(
    owner: str,
    repo: str,
    alert_number: int,
    body: UpdateAlertRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Update (dismiss/reopen) a code scanning alert."""
    store = _get_store(request)
    alert = store.code_scanning_alerts.get((owner, repo), {}).get(alert_number)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert["state"] = body.state
    alert["updated_at"] = now_iso()

    if body.state == "dismissed":
        alert["dismissed_at"] = now_iso()
        alert["dismissed_by"] = {"login": user["login"], "id": user["id"]}
        alert["dismissed_reason"] = body.dismissed_reason
        alert["dismissed_comment"] = body.dismissed_comment
    elif body.state == "open":
        alert["dismissed_at"] = None
        alert["dismissed_by"] = None
        alert["dismissed_reason"] = None
        alert["dismissed_comment"] = None

    return alert


@router.post("/repos/{owner}/{repo}/code-scanning/sarifs", status_code=202)
async def upload_sarif(
    owner: str,
    repo: str,
    body: SarifUploadRequest,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Upload SARIF data. Creates mock alerts from the upload."""
    store = _get_store(request)
    store.ensure_repo(owner, repo)
    sarif_id = str(uuid.uuid4())
    now = now_iso()

    upload = {
        "id": sarif_id,
        "commit_sha": body.commit_sha,
        "ref": body.ref,
        "sarif": body.sarif,
        "tool_name": body.tool_name,
        "processing_status": "complete",
        "analysis_key": f"mock-analysis-{sarif_id[:8]}",
        "url": f"https://api.github.com/repos/{owner}/{repo}/code-scanning/sarifs/{sarif_id}",
        "created_at": now,
    }

    store.sarif_uploads[sarif_id] = upload

    # Create a mock alert from the SARIF upload
    alert_number = store.next_alert_number(owner, repo)
    alert = {
        "number": alert_number,
        "state": "open",
        "rule": {
            "id": f"mock-rule-{alert_number}",
            "severity": "warning",
            "description": "Mock alert from SARIF upload",
        },
        "tool": {
            "name": body.tool_name or "mock-tool",
            "version": "1.0.0",
        },
        "most_recent_instance": {
            "ref": body.ref,
            "commit_sha": body.commit_sha,
            "state": "open",
            "location": {
                "path": "src/mock.py",
                "start_line": 1,
                "end_line": 1,
            },
        },
        "html_url": f"https://github.com/{owner}/{repo}/security/code-scanning/{alert_number}",
        "url": f"https://api.github.com/repos/{owner}/{repo}/code-scanning/alerts/{alert_number}",
        "created_at": now,
        "updated_at": now,
        "dismissed_at": None,
        "dismissed_by": None,
        "dismissed_reason": None,
        "dismissed_comment": None,
    }

    key = (owner, repo)
    if key not in store.code_scanning_alerts:
        store.code_scanning_alerts[key] = {}
    store.code_scanning_alerts[key][alert_number] = alert

    return {"id": sarif_id, "url": upload["url"]}


@router.get("/repos/{owner}/{repo}/code-scanning/sarifs/{sarif_id}")
async def get_sarif_upload(
    owner: str,
    repo: str,
    sarif_id: str,
    request: Request,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    """Get SARIF upload status."""
    store = _get_store(request)
    upload = store.sarif_uploads.get(sarif_id)
    if not upload:
        raise HTTPException(status_code=404, detail="SARIF upload not found")
    return upload
