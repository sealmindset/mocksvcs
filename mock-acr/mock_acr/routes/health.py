"""Health check endpoint."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter

if TYPE_CHECKING:
    from mock_acr.store import RegistryStore


def create_health_router(store: RegistryStore) -> APIRouter:
    r = APIRouter()

    @r.get("/health")
    async def health() -> dict:
        stats = store.stats()
        return {
            "status": "healthy",
            "service": "mock-acr",
            "version": "0.1.0",
            **stats,
        }

    return r
