"""Check run and check suite request/response models."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class CheckRunOutput(BaseModel):
    title: str
    summary: str
    text: Optional[str] = None
    annotations: list[dict[str, Any]] = Field(default_factory=list)


class CreateCheckRunRequest(BaseModel):
    name: str
    head_sha: str
    details_url: Optional[str] = None
    external_id: Optional[str] = None
    status: str = "queued"  # queued, in_progress, completed
    conclusion: Optional[str] = None  # success, failure, neutral, cancelled, etc.
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    output: Optional[CheckRunOutput] = None
    actions: list[dict[str, Any]] = Field(default_factory=list)


class UpdateCheckRunRequest(BaseModel):
    name: Optional[str] = None
    details_url: Optional[str] = None
    external_id: Optional[str] = None
    status: Optional[str] = None
    conclusion: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    output: Optional[CheckRunOutput] = None
    actions: list[dict[str, Any]] = Field(default_factory=list)


class CreateCheckSuiteRequest(BaseModel):
    head_sha: str
