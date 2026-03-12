"""FastAPI application entry point for mock ACR server."""

from fastapi import FastAPI

from mock_acr.config import settings
from mock_acr.routes.admin import create_admin_router
from mock_acr.routes.auth import create_auth_router
from mock_acr.routes.blobs import create_blobs_router
from mock_acr.routes.catalog import create_catalog_router
from mock_acr.routes.health import create_health_router
from mock_acr.routes.manifests import create_manifests_router
from mock_acr.routes.v2 import create_v2_router
from mock_acr.store import RegistryStore

store = RegistryStore(settings.data_dir)

app = FastAPI(
    title="Mock Azure Container Registry",
    version="0.1.0",
    description=(
        "Lightweight mock ACR implementing Docker Registry V2 API. "
        "Supports docker pull, docker push, and tar import. "
        "All auth challenges succeed -- no real credentials needed."
    ),
)

# Auth must come before v2 routes so /oauth2/token is matched first
app.include_router(create_health_router(store))
app.include_router(create_auth_router(store))
app.include_router(create_admin_router(store))
app.include_router(create_v2_router(store))
app.include_router(create_catalog_router(store))
app.include_router(create_manifests_router(store))
app.include_router(create_blobs_router(store))
