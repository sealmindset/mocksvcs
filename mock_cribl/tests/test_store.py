"""Tests for the EventStore."""

import threading

from mock_cribl.store import EventStore


def test_circular_buffer_eviction():
    store = EventStore(maxlen=5)
    events = [{"level": "INFO", "message": f"msg-{i}"} for i in range(8)]
    store.add_events(events)
    assert len(store) == 5
    # Oldest 3 should be evicted; remaining are msg-3 through msg-7
    stored = store.query()
    assert stored[0]["message"] == "msg-3"
    assert stored[-1]["message"] == "msg-7"


def test_total_received_survives_eviction():
    store = EventStore(maxlen=3)
    store.add_events([{"level": "INFO", "message": f"m-{i}"} for i in range(10)])
    assert store.total_received == 10
    assert len(store) == 3


def test_clear_resets_buffer_not_total():
    store = EventStore(maxlen=100)
    store.add_events([{"level": "INFO", "message": "a"}])
    store.clear()
    assert len(store) == 0
    # total_received stays (only the fixture in conftest resets it)
    assert store.total_received == 1


def test_thread_safety():
    store = EventStore(maxlen=10_000)
    errors: list[Exception] = []

    def writer(start: int) -> None:
        try:
            for i in range(500):
                store.add_events([{"level": "INFO", "message": f"t-{start}-{i}"}])
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=writer, args=(t,)) for t in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    assert store.total_received == 2000
    assert len(store) == 2000


def test_composable_filters():
    store = EventStore(maxlen=100)
    store.add_events([
        {"level": "INFO", "message": "scan started", "service": "zapper-backend"},
        {"level": "ERROR", "message": "scan failed", "service": "zapper-backend"},
        {"level": "INFO", "message": "task started", "service": "zapper-worker"},
        {"level": "ERROR", "message": "task error", "service": "zapper-worker"},
    ])
    # Combine level + service filters
    results = store.query(level="ERROR", service="zapper-worker")
    assert len(results) == 1
    assert results[0]["message"] == "task error"


def test_query_with_project_id_filter():
    store = EventStore(maxlen=100)
    store.add_events([
        {"level": "INFO", "message": "a", "project_id": "proj-1"},
        {"level": "INFO", "message": "b", "project_id": "proj-2"},
    ])
    results = store.query(project_id="proj-1")
    assert len(results) == 1
    assert results[0]["project_id"] == "proj-1"


def test_stats_empty_store():
    store = EventStore(maxlen=100)
    stats = store.stats()
    assert stats["total_received"] == 0
    assert stats["buffer_size"] == 0
    assert stats["buffer_usage_pct"] == 0
    assert stats["events_by_level"] == {}
    assert stats["events_by_service"] == {}
