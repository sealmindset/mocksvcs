"""Health check endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from fastapi import APIRouter

from mock_cribl.models import CriblHealthResponse, HealthResponse

if TYPE_CHECKING:
    from mock_cribl.store import EventStore

router = APIRouter()

_start_time = datetime.now(timezone.utc).isoformat()


def create_health_router(store: EventStore) -> APIRouter:
    """Create health router with access to the event store."""
    r = APIRouter()

    @r.get("/api/v1/health", response_model=HealthResponse)
    async def api_health() -> HealthResponse:
        return HealthResponse(
            startTime=_start_time,
            eventCount=store.total_received,
        )

    @r.get("/cribl_health", response_model=CriblHealthResponse)
    async def cribl_health() -> CriblHealthResponse:
        return CriblHealthResponse()

    return r
