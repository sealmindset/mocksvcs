"""Ingest endpoints for receiving log events."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from mock_cribl.config import settings
from mock_cribl.models import IngestResponse

if TYPE_CHECKING:
    from mock_cribl.store import EventStore


async def verify_bearer_token(
    authorization: str = Header(...),
) -> str:
    """Validate Bearer token from Authorization header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization[7:]
    if token != settings.auth_token:
        raise HTTPException(status_code=401, detail="Invalid token")
    return token


def create_ingest_router(store: EventStore) -> APIRouter:
    """Create ingest router with access to the event store."""
    r = APIRouter()

    @r.post(
        "/cribl/ingest",
        response_model=IngestResponse,
        dependencies=[Depends(verify_bearer_token)],
    )
    async def ingest_json(request: Request) -> IngestResponse:
        """Accept a JSON array of events (used by CriblHandler)."""
        body = await request.json()
        if not isinstance(body, list):
            raise HTTPException(status_code=400, detail="Request body must be a JSON array")
        count = store.add_events(body)
        return IngestResponse(items_received=count)

    @r.post(
        "/cribl/_bulk",
        response_model=IngestResponse,
        dependencies=[Depends(verify_bearer_token)],
    )
    async def ingest_ndjson(request: Request) -> IngestResponse:
        """Accept NDJSON (newline-delimited JSON) events."""
        raw = await request.body()
        text = raw.decode("utf-8").strip()
        if not text:
            return IngestResponse(items_received=0)

        events: list[dict[str, Any]] = []
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # Skip malformed lines

        count = store.add_events(events)
        return IngestResponse(items_received=count)

    return r
