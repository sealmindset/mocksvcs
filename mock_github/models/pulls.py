"""Pull request request/response models."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class CreatePullRequest(BaseModel):
    title: str
    head: str
    base: str = "main"
    body: Optional[str] = None
    draft: bool = False


class UpdatePullRequest(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    state: Optional[str] = None  # open, closed
    base: Optional[str] = None


class MergePullRequest(BaseModel):
    commit_title: Optional[str] = None
    commit_message: Optional[str] = None
    merge_method: str = "merge"  # merge, squash, rebase
    sha: Optional[str] = None
