"""Code scanning and SARIF request/response models."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class UpdateAlertRequest(BaseModel):
    state: str  # open, dismissed, fixed
    dismissed_reason: Optional[str] = None  # false positive, won't fix, used in tests
    dismissed_comment: Optional[str] = None


class SarifUploadRequest(BaseModel):
    commit_sha: str
    ref: str
    sarif: str  # base64-encoded gzip SARIF
    checkout_uri: Optional[str] = None
    tool_name: Optional[str] = None
