"""FastAPI application entry point for mock Cribl Stream server."""

from fastapi import FastAPI

from mock_cribl.config import settings
from mock_cribl.routes.auth import router as auth_router
from mock_cribl.routes.debug import create_debug_router
from mock_cribl.routes.health import create_health_router
from mock_cribl.routes.ingest import create_ingest_router
from mock_cribl.store import EventStore

store = EventStore(maxlen=settings.max_events)

app = FastAPI(
    title="Mock Cribl Stream",
    version="0.1.0",
    description="Lightweight mock Cribl Stream HTTP Source for local development.",
)

app.include_router(auth_router)
app.include_router(create_health_router(store))
app.include_router(create_ingest_router(store))
app.include_router(create_debug_router(store))
