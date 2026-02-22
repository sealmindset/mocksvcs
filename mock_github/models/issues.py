"""Issue/comment request/response models."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class CreateCommentRequest(BaseModel):
    body: str


class UpdateCommentRequest(BaseModel):
    body: str
