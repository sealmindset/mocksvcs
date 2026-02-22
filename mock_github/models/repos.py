"""Repository-related request/response models."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class CreateRepoRequest(BaseModel):
    name: str
    description: Optional[str] = None
    private: bool = False
    auto_init: bool = False
    default_branch: str = "main"


class UpdateRepoRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    private: Optional[bool] = None
    default_branch: Optional[str] = None


class CreateStatusRequest(BaseModel):
    state: str  # error, failure, pending, success
    target_url: Optional[str] = None
    description: Optional[str] = None
    context: str = "default"
