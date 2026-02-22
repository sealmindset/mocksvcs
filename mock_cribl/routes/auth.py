"""Authentication endpoint (mock)."""

from fastapi import APIRouter

from mock_cribl.config import settings
from mock_cribl.models import LoginRequest, LoginResponse

router = APIRouter()


@router.post("/api/v1/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest) -> LoginResponse:
    """Accept any credentials and return the configured auth token."""
    return LoginResponse(token=settings.auth_token)
