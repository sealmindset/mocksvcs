"""FastAPI application entry point for mock GitHub API server."""

import logging

from fastapi import FastAPI

from mock_github.config import settings
from mock_github.routes.auth_routes import router as auth_router
from mock_github.routes.repos import router as repos_router
from mock_github.routes.pulls import router as pulls_router
from mock_github.routes.issues import router as issues_router
from mock_github.routes.checks import router as checks_router
from mock_github.routes.code_scanning import router as code_scanning_router
from mock_github.routes.actions import router as actions_router
from mock_github.routes.debug import create_debug_router
from mock_github.store import GitHubStore

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

store = GitHubStore(auto_create_repos=settings.auto_create_repos)

app = FastAPI(
    title="Mock GitHub API",
    version="0.1.0",
    description="Lightweight mock GitHub REST API for local CI/CD testing.",
)

# Attach store to app state so routes can access it
app.state.store = store

app.include_router(auth_router)
app.include_router(repos_router)
app.include_router(pulls_router)
app.include_router(issues_router)
app.include_router(checks_router)
app.include_router(code_scanning_router)
app.include_router(actions_router)
app.include_router(create_debug_router(store))
