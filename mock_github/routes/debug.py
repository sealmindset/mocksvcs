"""Debug endpoints for inspecting and resetting the mock store."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from mock_github.store import GitHubStore


def create_debug_router(store: GitHubStore) -> APIRouter:
    router = APIRouter(prefix="/debug", tags=["debug"])

    @router.get("/store")
    async def get_store_stats() -> dict[str, Any]:
        """Return counts of all entity types."""
        return store.stats()

    @router.delete("/store")
    async def clear_store() -> dict[str, str]:
        """Clear all data from the store."""
        store.clear()
        return {"status": "cleared"}

    @router.get("/store/{entity}")
    async def get_store_entity(entity: str) -> Any:
        """Dump a specific entity collection."""
        entity_map = {
            "repos": lambda: {f"{k[0]}/{k[1]}": v for k, v in store.repos.items()},
            "branches": lambda: {f"{k[0]}/{k[1]}": v for k, v in store.branches.items()},
            "commits": lambda: {f"{k[0]}/{k[1]}": v for k, v in store.commits.items()},
            "pulls": lambda: {
                f"{k[0]}/{k[1]}": {str(num): pr for num, pr in v.items()}
                for k, v in store.pulls.items()
            },
            "comments": lambda: store.comments,
            "check_runs": lambda: store.check_runs,
            "check_suites": lambda: store.check_suites,
            "code_scanning_alerts": lambda: {
                f"{k[0]}/{k[1]}": {str(num): a for num, a in v.items()}
                for k, v in store.code_scanning_alerts.items()
            },
            "sarif_uploads": lambda: store.sarif_uploads,
            "workflows": lambda: {
                f"{k[0]}/{k[1]}": {str(wid): w for wid, w in v.items()}
                for k, v in store.workflows.items()
            },
            "workflow_runs": lambda: {
                f"{k[0]}/{k[1]}": {str(rid): r for rid, r in v.items()}
                for k, v in store.workflow_runs.items()
            },
            "jobs": lambda: store.jobs,
            "artifacts": lambda: store.artifacts,
            "secrets": lambda: {
                f"{k[0]}/{k[1]}": {name: {kk: vv for kk, vv in s.items() if kk != "encrypted_value"} for name, s in v.items()}
                for k, v in store.secrets.items()
            },
            "variables": lambda: {
                f"{k[0]}/{k[1]}": v for k, v in store.variables.items()
            },
            "caches": lambda: {
                f"{k[0]}/{k[1]}": {str(cid): c for cid, c in v.items()}
                for k, v in store.caches.items()
            },
            "permissions": lambda: {
                f"{k[0]}/{k[1]}": v for k, v in store.permissions.items()
            },
        }

        if entity not in entity_map:
            raise HTTPException(
                status_code=404,
                detail=f"Unknown entity: {entity}. Available: {list(entity_map.keys())}",
            )

        return entity_map[entity]()

    return router
