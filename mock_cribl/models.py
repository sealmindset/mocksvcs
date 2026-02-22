"""Pydantic request/response schemas for the mock Cribl Stream server."""

from __future__ import annotations

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str


class IngestResponse(BaseModel):
    status: str = "ok"
    items_received: int


class HealthResponse(BaseModel):
    status: str = "healthy"
    startTime: str
    version: str = "mock-4.x"
    eventCount: int


class CriblHealthResponse(BaseModel):
    status: str = "healthy"
    source: str = "http"
    accepting: bool = True


class StatsResponse(BaseModel):
    total_received: int
    buffer_size: int
    buffer_max: int
    buffer_usage_pct: float
    events_by_level: dict[str, int]
    events_by_service: dict[str, int]
