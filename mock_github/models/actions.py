"""GitHub Actions request/response models."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class WorkflowDispatchRequest(BaseModel):
    ref: str
    inputs: dict[str, str] = Field(default_factory=dict)


class CreateVariableRequest(BaseModel):
    name: str
    value: str


class UpdateVariableRequest(BaseModel):
    name: Optional[str] = None
    value: str


class CreateOrUpdateSecretRequest(BaseModel):
    encrypted_value: str
    key_id: str


class ActionsPermissionsRequest(BaseModel):
    enabled: bool = True
    allowed_actions: str = "all"  # all, local_only, selected
