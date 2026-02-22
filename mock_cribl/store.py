"""In-memory circular buffer for storing ingested events."""

from __future__ import annotations

import threading
from collections import deque
from datetime import datetime, timezone
from typing import Any


class EventStore:
    """Thread-safe circular buffer for log events.

    Uses collections.deque(maxlen=N) so oldest events are auto-evicted
    when the buffer is full. A separate _total_received counter tracks
    lifetime ingestion count independent of eviction.
    """

    def __init__(self, maxlen: int = 10_000) -> None:
        self._buffer: deque[dict[str, Any]] = deque(maxlen=maxlen)
        self._maxlen = maxlen
        self._total_received: int = 0
        self._lock = threading.Lock()

    def add_events(self, events: list[dict[str, Any]]) -> int:
        """Add events to the buffer. Returns number of events added."""
        now = datetime.now(timezone.utc).isoformat()
        with self._lock:
            for event in events:
                event["_received_at"] = now
                self._buffer.append(event)
            self._total_received += len(events)
        return len(events)

    def query(
        self,
        *,
        level: str | None = None,
        service: str | None = None,
        since: str | None = None,
        scan_id: str | None = None,
        project_id: str | None = None,
        q: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Query events with optional filters.

        Filters are composable (AND logic). Text search (`q`) checks
        the `message` field with case-insensitive substring match.
        """
        with self._lock:
            results = list(self._buffer)

        if level:
            results = [e for e in results if e.get("level", "").upper() == level.upper()]
        if service:
            results = [e for e in results if e.get("service") == service]
        if since:
            results = [e for e in results if e.get("_received_at", "") >= since]
        if scan_id:
            results = [e for e in results if e.get("scan_id") == scan_id]
        if project_id:
            results = [e for e in results if e.get("project_id") == project_id]
        if q:
            q_lower = q.lower()
            results = [
                e for e in results
                if q_lower in e.get("message", "").lower()
            ]

        return results[offset : offset + limit]

    def stats(self) -> dict[str, Any]:
        """Return aggregate statistics about stored events."""
        with self._lock:
            events = list(self._buffer)
            total = self._total_received

        by_level: dict[str, int] = {}
        by_service: dict[str, int] = {}
        for event in events:
            lvl = event.get("level", "UNKNOWN")
            by_level[lvl] = by_level.get(lvl, 0) + 1
            svc = event.get("service", "unknown")
            by_service[svc] = by_service.get(svc, 0) + 1

        buffer_size = len(events)
        return {
            "total_received": total,
            "buffer_size": buffer_size,
            "buffer_max": self._maxlen,
            "buffer_usage_pct": round(buffer_size / self._maxlen * 100, 2) if self._maxlen else 0,
            "events_by_level": by_level,
            "events_by_service": by_service,
        }

    def clear(self) -> int:
        """Clear all events. Returns number of events cleared."""
        with self._lock:
            count = len(self._buffer)
            self._buffer.clear()
        return count

    @property
    def total_received(self) -> int:
        with self._lock:
            return self._total_received

    def __len__(self) -> int:
        with self._lock:
            return len(self._buffer)
