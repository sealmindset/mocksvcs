"""Debug endpoints for querying and managing stored events."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Query

from mock_cribl.models import StatsResponse

if TYPE_CHECKING:
    from mock_cribl.store import EventStore


def create_debug_router(store: EventStore) -> APIRouter:
    """Create debug router with access to the event store."""
    r = APIRouter()

    @r.get("/debug/events")
    async def get_events(
        level: str | None = Query(None, description="Filter by log level"),
        service: str | None = Query(None, description="Filter by service name"),
        since: str | None = Query(None, description="Filter events received after ISO timestamp"),
        scan_id: str | None = Query(None, description="Filter by scan_id"),
        project_id: str | None = Query(None, description="Filter by project_id"),
        q: str | None = Query(None, description="Text search in message field"),
        limit: int = Query(100, ge=1, le=1000),
        offset: int = Query(0, ge=0),
    ) -> list[dict[str, Any]]:
        return store.query(
            level=level,
            service=service,
            since=since,
            scan_id=scan_id,
            project_id=project_id,
            q=q,
            limit=limit,
            offset=offset,
        )

    @r.get("/debug/stats", response_model=StatsResponse)
    async def get_stats() -> dict[str, Any]:
        return store.stats()

    @r.delete("/debug/events")
    async def clear_events() -> dict[str, Any]:
        count = store.clear()
        return {"cleared": count}

    return r
