"""In-memory store for all mock GitHub entities.

Thread-safe via threading.Lock. Auto-creates repos on first reference
when auto_create_repos is enabled.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any


class GitHubStore:
    """Thread-safe in-memory store for mock GitHub data."""

    def __init__(self, auto_create_repos: bool = True) -> None:
        self._lock = threading.Lock()
        self.auto_create_repos = auto_create_repos

        # Keyed by (owner, repo)
        self.repos: dict[tuple[str, str], dict] = {}
        self.branches: dict[tuple[str, str], list[dict]] = {}
        self.commits: dict[tuple[str, str], list[dict]] = {}
        self.commit_statuses: dict[tuple[str, str, str], list[dict]] = {}

        # Pull requests: (owner, repo) -> {pr_number: pr_dict}
        self.pulls: dict[tuple[str, str], dict[int, dict]] = {}
        self.pull_files: dict[tuple[str, str, int], list[dict]] = {}

        # Comments: global comment_id -> comment_dict
        self.comments: dict[int, dict] = {}
        # Issue/PR comments index: (owner, repo, issue_number) -> [comment_ids]
        self.issue_comments: dict[tuple[str, str, int], list[int]] = {}

        # Check runs: global check_run_id -> check_run_dict
        self.check_runs: dict[int, dict] = {}
        # Check suites: global check_suite_id -> check_suite_dict
        self.check_suites: dict[int, dict] = {}
        # Index: (owner, repo, ref) -> [check_run_ids]
        self.ref_check_runs: dict[tuple[str, str, str], list[int]] = {}
        # Index: (owner, repo, ref) -> [check_suite_ids]
        self.ref_check_suites: dict[tuple[str, str, str], list[int]] = {}
        # Index: check_suite_id -> [check_run_ids]
        self.suite_check_runs: dict[int, list[int]] = {}

        # Code scanning
        self.code_scanning_alerts: dict[tuple[str, str], dict[int, dict]] = {}
        self.sarif_uploads: dict[str, dict] = {}

        # Actions — Workflows
        self.workflows: dict[tuple[str, str], dict[int, dict]] = {}
        self.workflow_runs: dict[tuple[str, str], dict[int, dict]] = {}
        self.jobs: dict[int, dict] = {}
        self.run_jobs: dict[tuple[str, str, int], list[int]] = {}
        self.artifacts: dict[int, dict] = {}
        self.run_artifacts: dict[tuple[str, str, int], list[int]] = {}
        self.secrets: dict[tuple[str, str], dict[str, dict]] = {}
        self.variables: dict[tuple[str, str], dict[str, dict]] = {}
        self.caches: dict[tuple[str, str], dict[int, dict]] = {}
        self.permissions: dict[tuple[str, str], dict] = {}

        # Auto-increment counters
        self._next_id: int = 1
        self._next_pr: dict[tuple[str, str], int] = {}
        self._next_alert: dict[tuple[str, str], int] = {}

    def next_id(self) -> int:
        """Return the next auto-incrementing integer ID (thread-safe)."""
        with self._lock:
            id_ = self._next_id
            self._next_id += 1
            return id_

    def next_pr_number(self, owner: str, repo: str) -> int:
        """Return the next PR number for a given repo."""
        key = (owner, repo)
        with self._lock:
            num = self._next_pr.get(key, 1)
            self._next_pr[key] = num + 1
            return num

    def next_alert_number(self, owner: str, repo: str) -> int:
        """Return the next alert number for a given repo."""
        key = (owner, repo)
        with self._lock:
            num = self._next_alert.get(key, 1)
            self._next_alert[key] = num + 1
            return num

    def ensure_repo(self, owner: str, repo: str) -> dict:
        """Auto-create a repo on first reference. Returns the repo dict."""
        key = (owner, repo)
        with self._lock:
            if key not in self.repos:
                if not self.auto_create_repos:
                    return {}
                now = _now_iso()
                repo_id = self._next_id
                self._next_id += 1
                self.repos[key] = {
                    "id": repo_id,
                    "node_id": f"R_{repo_id}",
                    "name": repo,
                    "full_name": f"{owner}/{repo}",
                    "owner": {
                        "login": owner,
                        "id": 1,
                        "type": "Organization",
                    },
                    "private": False,
                    "html_url": f"https://github.com/{owner}/{repo}",
                    "url": f"https://api.github.com/repos/{owner}/{repo}",
                    "default_branch": "main",
                    "created_at": now,
                    "updated_at": now,
                }
                self.branches[key] = [
                    {
                        "name": "main",
                        "commit": {"sha": "0" * 40, "url": ""},
                        "protected": False,
                    }
                ]
                self.commits[key] = []
                self.pulls[key] = {}
                self.code_scanning_alerts[key] = {}
                self.workflows[key] = {}
                self.workflow_runs[key] = {}
                self.secrets[key] = {}
                self.variables[key] = {}
                self.caches[key] = {}
                self.permissions[key] = {
                    "enabled": True,
                    "allowed_actions": "all",
                    "selected_actions_url": "",
                }
            return self.repos[key]

    def clear(self) -> None:
        """Reset all collections."""
        with self._lock:
            self.repos.clear()
            self.branches.clear()
            self.commits.clear()
            self.commit_statuses.clear()
            self.pulls.clear()
            self.pull_files.clear()
            self.comments.clear()
            self.issue_comments.clear()
            self.check_runs.clear()
            self.check_suites.clear()
            self.ref_check_runs.clear()
            self.ref_check_suites.clear()
            self.suite_check_runs.clear()
            self.code_scanning_alerts.clear()
            self.sarif_uploads.clear()
            self.workflows.clear()
            self.workflow_runs.clear()
            self.jobs.clear()
            self.run_jobs.clear()
            self.artifacts.clear()
            self.run_artifacts.clear()
            self.secrets.clear()
            self.variables.clear()
            self.caches.clear()
            self.permissions.clear()
            self._next_id = 1
            self._next_pr.clear()
            self._next_alert.clear()

    def stats(self) -> dict[str, Any]:
        """Return counts of all entity types."""
        with self._lock:
            return {
                "repos": len(self.repos),
                "branches": sum(len(v) for v in self.branches.values()),
                "commits": sum(len(v) for v in self.commits.values()),
                "pull_requests": sum(len(v) for v in self.pulls.values()),
                "comments": len(self.comments),
                "check_runs": len(self.check_runs),
                "check_suites": len(self.check_suites),
                "code_scanning_alerts": sum(
                    len(v) for v in self.code_scanning_alerts.values()
                ),
                "sarif_uploads": len(self.sarif_uploads),
                "workflows": sum(len(v) for v in self.workflows.values()),
                "workflow_runs": sum(len(v) for v in self.workflow_runs.values()),
                "jobs": len(self.jobs),
                "artifacts": len(self.artifacts),
                "secrets": sum(len(v) for v in self.secrets.values()),
                "variables": sum(len(v) for v in self.variables.values()),
                "caches": sum(len(v) for v in self.caches.values()),
            }


def _now_iso() -> str:
    """Return the current UTC time in ISO 8601 format."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
