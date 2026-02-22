"""Tests for the GitHubStore."""

from __future__ import annotations

from mock_github.store import GitHubStore


def test_next_id():
    store = GitHubStore()
    assert store.next_id() == 1
    assert store.next_id() == 2
    assert store.next_id() == 3


def test_ensure_repo_creates():
    store = GitHubStore(auto_create_repos=True)
    repo = store.ensure_repo("org", "myrepo")
    assert repo["full_name"] == "org/myrepo"
    assert repo["default_branch"] == "main"
    assert ("org", "myrepo") in store.repos


def test_ensure_repo_idempotent():
    store = GitHubStore(auto_create_repos=True)
    repo1 = store.ensure_repo("org", "myrepo")
    repo2 = store.ensure_repo("org", "myrepo")
    assert repo1["id"] == repo2["id"]


def test_ensure_repo_disabled():
    store = GitHubStore(auto_create_repos=False)
    repo = store.ensure_repo("org", "myrepo")
    assert repo == {}
    assert ("org", "myrepo") not in store.repos


def test_ensure_repo_creates_default_branch():
    store = GitHubStore(auto_create_repos=True)
    store.ensure_repo("org", "repo")
    branches = store.branches.get(("org", "repo"), [])
    assert len(branches) == 1
    assert branches[0]["name"] == "main"


def test_next_pr_number():
    store = GitHubStore()
    assert store.next_pr_number("org", "repo") == 1
    assert store.next_pr_number("org", "repo") == 2
    assert store.next_pr_number("org", "other") == 1


def test_next_alert_number():
    store = GitHubStore()
    assert store.next_alert_number("org", "repo") == 1
    assert store.next_alert_number("org", "repo") == 2


def test_clear():
    store = GitHubStore(auto_create_repos=True)
    store.ensure_repo("org", "repo")
    store.next_id()
    store.clear()
    assert len(store.repos) == 0
    assert store.next_id() == 1


def test_stats():
    store = GitHubStore(auto_create_repos=True)
    store.ensure_repo("org", "repo1")
    store.ensure_repo("org", "repo2")
    stats = store.stats()
    assert stats["repos"] == 2
    assert stats["branches"] == 2  # Each repo gets a 'main' branch
    assert stats["check_runs"] == 0


def test_thread_safety():
    """Basic smoke test that IDs are unique under concurrent access."""
    import threading

    store = GitHubStore()
    ids = []
    lock = threading.Lock()

    def get_ids(n=100):
        local_ids = [store.next_id() for _ in range(n)]
        with lock:
            ids.extend(local_ids)

    threads = [threading.Thread(target=get_ids) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(ids) == 1000
    assert len(set(ids)) == 1000  # All unique
