# API-First Implementation Plan: AI Prompt Management Service

> **Purpose:** FastAPI backend implementation covering REST endpoints, service layer, Redis caching, three-tier fallback chain, Jinja2 template rendering, pagination, filtering, and search. Based on Zapper's prompt service and routes.
>
> **Phase:** 3 of 8
> **Prerequisites:** Phase 2 (Database Foundation)
> **Duration:** 2-3 days
> **Reference:** Zapper `backend/app/services/prompt_service.py`, `backend/app/api/routes/prompts.py`

---

## Table of Contents

1. [API Design Overview](#1-api-design-overview)
2. [Pydantic Schemas](#2-pydantic-schemas)
3. [Service Layer](#3-service-layer)
4. [Redis Caching Strategy](#4-redis-caching-strategy)
5. [Three-Tier Fallback Chain](#5-three-tier-fallback-chain)
6. [Jinja2 Template Rendering](#6-jinja2-template-rendering)
7. [REST API Routes](#7-rest-api-routes)
8. [Pagination and Filtering](#8-pagination-and-filtering)
9. [Health Check Endpoint](#9-health-check-endpoint)
10. [OpenAPI Documentation](#10-openapi-documentation)
11. [Error Handling](#11-error-handling)
12. [Anti-Patterns to Avoid](#12-anti-patterns-to-avoid)
13. [Validation Checklist](#13-validation-checklist)

---

## 1. API Design Overview

### Base Path

```
/api/v1/
```

### Endpoint Summary

| Method | Endpoint | Auth Role | Description |
|--------|----------|-----------|-------------|
| **Prompts** | | | |
| POST | `/prompts` | admin | Create new prompt (v1) |
| GET | `/prompts` | viewer | List prompts (paginated, filterable) |
| GET | `/prompts/by-slug/{slug}` | viewer | Lookup by slug (active only) |
| GET | `/prompts/{prompt_id}` | viewer | Get by UUID |
| PUT | `/prompts/{prompt_id}` | editor | Update (auto-increments version) |
| DELETE | `/prompts/{prompt_id}` | admin | Soft-delete (is_active=false) |
| **Versions** | | | |
| GET | `/prompts/{prompt_id}/versions` | viewer | List all versions (newest first) |
| GET | `/prompts/{prompt_id}/versions/{version}` | viewer | Get specific version |
| POST | `/prompts/{prompt_id}/restore` | admin | Restore to historical version |
| **Template Rendering** | | | |
| POST | `/prompts/by-slug/{slug}/render` | viewer | Render with Jinja2 variables |
| **Bulk Operations** | | | |
| POST | `/prompts/bulk-export` | admin | Export prompts as JSON |
| POST | `/prompts/bulk-import` | admin | Import prompts from JSON |
| **API Keys** | | | |
| POST | `/api-keys` | admin | Generate new API key |
| GET | `/api-keys` | admin | List API keys |
| DELETE | `/api-keys/{key_id}` | admin | Revoke API key |
| **Audit Log** | | | |
| GET | `/audit-logs` | admin | List audit entries (paginated) |
| **System** | | | |
| GET | `/health` | none | Liveness/readiness probe |

---

## 2. Pydantic Schemas

### 2.1 Request Schemas

```python
# backend/app/schemas/prompt.py
from pydantic import BaseModel, Field
from app.models.prompt import PromptType


class PromptCreate(BaseModel):
    slug: str = Field(..., max_length=100, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    title: str = Field(..., max_length=255)
    type: PromptType
    consumer_id: str = Field(..., max_length=100)
    content: str
    description: str | None = None


class PromptUpdate(BaseModel):
    title: str | None = Field(None, max_length=255)
    type: PromptType | None = None
    consumer_id: str | None = Field(None, max_length=100)
    content: str | None = None
    description: str | None = None
    is_active: bool | None = None


class PromptRestoreRequest(BaseModel):
    version: int = Field(..., ge=1)


class PromptRenderRequest(BaseModel):
    variables: dict[str, str] = Field(default_factory=dict)
```

### 2.2 Response Schemas

```python
from datetime import datetime
from uuid import UUID


class PromptResponse(BaseModel):
    id: UUID
    api_id: int
    slug: str
    title: str
    type: PromptType
    consumer_id: str
    content: str
    description: str | None
    version: int
    is_active: bool
    updated_by: str | None
    category: str | None  # Computed from slug prefix
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @computed_field
    @property
    def category(self) -> str | None:
        from app.constants import derive_category
        return derive_category(self.slug)


class PromptSummary(BaseModel):
    """Lightweight listing — no content field."""
    id: UUID
    api_id: int
    slug: str
    title: str
    type: PromptType
    consumer_id: str
    version: int
    is_active: bool
    updated_by: str | None
    category: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class PromptVersionResponse(BaseModel):
    id: UUID
    api_id: int
    prompt_id: UUID
    version: int
    title: str
    type: PromptType
    consumer_id: str
    content: str
    description: str | None
    updated_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PromptRenderResponse(BaseModel):
    slug: str
    rendered_content: str
    variables_used: list[str]
    source: str  # "cache", "database", or "default"


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    size: int
    pages: int
```

### 2.3 API Key Schemas

```python
class ApiKeyCreate(BaseModel):
    name: str = Field(..., max_length=100)
    role: ApiRole = ApiRole.viewer
    expires_at: datetime | None = None


class ApiKeyResponse(BaseModel):
    id: UUID
    name: str
    role: ApiRole
    is_active: bool
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiKeyCreateResponse(ApiKeyResponse):
    """Only returned on creation — includes the raw key."""
    raw_key: str
```

---

## 3. Service Layer

### 3.1 Prompt Service (Async — for FastAPI routes)

```python
# backend/app/services/prompt_service.py
import logging
from uuid import UUID
from jinja2 import Environment, BaseLoader, TemplateSyntaxError
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prompt import Prompt, PromptVersion, PromptType
from app.constants import derive_category, PROMPT_CATEGORIES
from app.cache import cache_get, cache_set, cache_invalidate
from app.defaults import PROMPT_DEFAULTS

logger = logging.getLogger(__name__)
jinja_env = Environment(loader=BaseLoader(), autoescape=False)


# ─── Three-Tier Retrieval ───────────────────────────────────────

async def get_prompt(db: AsyncSession, slug: str) -> tuple[str | None, str]:
    """Return (content, source) using fallback chain."""
    # Tier 1: Redis cache
    cached = await cache_get(f"prompt:{slug}")
    if cached is not None:
        return cached, "cache"

    # Tier 2: Database
    result = await db.execute(
        select(Prompt.content).where(
            Prompt.slug == slug, Prompt.is_active.is_(True)
        )
    )
    row = result.scalar_one_or_none()
    if row is not None:
        await cache_set(f"prompt:{slug}", row)
        return row, "database"

    # Tier 3: Hardcoded defaults
    default = PROMPT_DEFAULTS.get(slug)
    if default is not None:
        return default, "default"

    return None, "not_found"


async def get_prompt_with_vars(
    db: AsyncSession, slug: str, **variables: str
) -> tuple[str | None, str]:
    """Retrieve prompt and render Jinja2 template variables."""
    content, source = await get_prompt(db, slug)
    if content is None:
        return None, source

    if not variables:
        return content, source

    try:
        template = jinja_env.from_string(content)
        rendered = template.render(**variables)
        return rendered, source
    except TemplateSyntaxError:
        logger.warning(f"Jinja2 syntax error in prompt '{slug}', returning raw")
        return content, source


# ─── CRUD Operations ────────────────────────────────────────────

async def create_prompt(
    db: AsyncSession, data: "PromptCreate", updated_by: str | None = None
) -> Prompt:
    """Create a new prompt with version 1."""
    prompt = Prompt(
        slug=data.slug,
        title=data.title,
        type=data.type,
        consumer_id=data.consumer_id,
        content=data.content,
        description=data.description,
        version=1,
        updated_by=updated_by,
    )
    db.add(prompt)
    await db.flush()

    version = PromptVersion(
        prompt_id=prompt.id,
        version=1,
        title=prompt.title,
        type=prompt.type,
        consumer_id=prompt.consumer_id,
        content=prompt.content,
        description=prompt.description,
        updated_by=updated_by,
    )
    db.add(version)
    await db.commit()
    await db.refresh(prompt)

    await cache_set(f"prompt:{prompt.slug}", prompt.content)
    return prompt


async def update_prompt(
    db: AsyncSession,
    prompt_id: UUID,
    data: "PromptUpdate",
    updated_by: str | None = None,
) -> Prompt | None:
    """Update prompt, auto-increment version, create version snapshot."""
    result = await db.execute(select(Prompt).where(Prompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    if prompt is None:
        return None

    # Apply changes
    update_fields = data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(prompt, field, value)

    prompt.version += 1
    prompt.updated_by = updated_by

    # Create immutable version snapshot
    version = PromptVersion(
        prompt_id=prompt.id,
        version=prompt.version,
        title=prompt.title,
        type=prompt.type,
        consumer_id=prompt.consumer_id,
        content=prompt.content,
        description=prompt.description,
        updated_by=updated_by,
    )
    db.add(version)
    await db.commit()
    await db.refresh(prompt)

    # Invalidate and re-cache
    await cache_invalidate(f"prompt:{prompt.slug}")
    if prompt.is_active:
        await cache_set(f"prompt:{prompt.slug}", prompt.content)

    return prompt


async def soft_delete_prompt(
    db: AsyncSession, prompt_id: UUID, updated_by: str | None = None
) -> Prompt | None:
    """Soft-delete by setting is_active=False."""
    result = await db.execute(select(Prompt).where(Prompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    if prompt is None:
        return None

    prompt.is_active = False
    prompt.updated_by = updated_by
    await db.commit()
    await db.refresh(prompt)

    await cache_invalidate(f"prompt:{prompt.slug}")
    return prompt


# ─── Listing & Filtering ────────────────────────────────────────

async def list_prompts(
    db: AsyncSession,
    *,
    prompt_type: PromptType | None = None,
    consumer_id: str | None = None,
    is_active: bool | None = True,
    category: str | None = None,
    search: str | None = None,
    page: int = 1,
    size: int = 50,
) -> tuple[list[Prompt], int]:
    """List prompts with filtering and pagination."""
    query = select(Prompt)
    count_query = select(func.count(Prompt.id))

    # Filters
    if is_active is not None:
        query = query.where(Prompt.is_active == is_active)
        count_query = count_query.where(Prompt.is_active == is_active)

    if prompt_type is not None:
        query = query.where(Prompt.type == prompt_type)
        count_query = count_query.where(Prompt.type == prompt_type)

    if consumer_id is not None:
        query = query.where(Prompt.consumer_id == consumer_id)
        count_query = count_query.where(Prompt.consumer_id == consumer_id)

    if category is not None and category in PROMPT_CATEGORIES:
        # Category derived from slug prefix
        query = query.where(Prompt.slug.startswith(f"{category}-"))
        count_query = count_query.where(Prompt.slug.startswith(f"{category}-"))

    if search is not None:
        pattern = f"%{search}%"
        query = query.where(
            or_(Prompt.slug.ilike(pattern), Prompt.title.ilike(pattern))
        )
        count_query = count_query.where(
            or_(Prompt.slug.ilike(pattern), Prompt.title.ilike(pattern))
        )

    # Pagination
    total = (await db.execute(count_query)).scalar()
    query = query.order_by(Prompt.api_id).offset((page - 1) * size).limit(size)
    result = await db.execute(query)

    return list(result.scalars().all()), total


# ─── Version History ─────────────────────────────────────────────

async def get_versions(
    db: AsyncSession, prompt_id: UUID
) -> list[PromptVersion]:
    """Return all versions for a prompt, newest first."""
    result = await db.execute(
        select(PromptVersion)
        .where(PromptVersion.prompt_id == prompt_id)
        .order_by(PromptVersion.version.desc())
    )
    return list(result.scalars().all())


async def get_version(
    db: AsyncSession, prompt_id: UUID, version: int
) -> PromptVersion | None:
    """Return a specific version snapshot."""
    result = await db.execute(
        select(PromptVersion).where(
            PromptVersion.prompt_id == prompt_id,
            PromptVersion.version == version,
        )
    )
    return result.scalar_one_or_none()


async def restore_version(
    db: AsyncSession,
    prompt_id: UUID,
    target_version: int,
    updated_by: str | None = None,
) -> Prompt | None:
    """Restore a historical version by creating a new version with that content."""
    old_version = await get_version(db, prompt_id, target_version)
    if old_version is None:
        return None

    from app.schemas.prompt import PromptUpdate
    update_data = PromptUpdate(
        title=old_version.title,
        type=old_version.type,
        consumer_id=old_version.consumer_id,
        content=old_version.content,
        description=old_version.description,
    )
    return await update_prompt(db, prompt_id, update_data, updated_by)
```

### 3.2 Sync Prompt Loader (for SDK / background workers)

```python
# backend/app/prompt_loader.py
"""Synchronous prompt retrieval for non-async contexts (Celery workers, SDK)."""
import redis
from jinja2 import Environment, BaseLoader, TemplateSyntaxError
from app.config import settings
from app.defaults import PROMPT_DEFAULTS

_redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
_jinja = Environment(loader=BaseLoader(), autoescape=False)
CACHE_TTL = 300  # 5 minutes


def get_prompt_sync(slug: str) -> str | None:
    """Sync retrieval: Redis → defaults (no DB in sync context)."""
    cached = _redis.get(f"prompt:{slug}")
    if cached is not None:
        return cached

    default = PROMPT_DEFAULTS.get(slug)
    return default


def get_prompt_sync_with_vars(slug: str, **variables: str) -> str | None:
    """Sync retrieval with Jinja2 rendering."""
    content = get_prompt_sync(slug)
    if content is None:
        return None
    if not variables:
        return content
    try:
        return _jinja.from_string(content).render(**variables)
    except TemplateSyntaxError:
        return content
```

---

## 4. Redis Caching Strategy

### 4.1 Cache Module

```python
# backend/app/cache.py
import redis.asyncio as aioredis
from app.config import settings

CACHE_TTL = 300  # 5 minutes

_pool: aioredis.ConnectionPool | None = None


async def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.ConnectionPool.from_url(
            settings.redis_url, decode_responses=True
        )
    return aioredis.Redis(connection_pool=_pool)


async def cache_get(key: str) -> str | None:
    r = await get_redis()
    return await r.get(key)


async def cache_set(key: str, value: str, ttl: int = CACHE_TTL) -> None:
    r = await get_redis()
    await r.setex(key, ttl, value)


async def cache_invalidate(key: str) -> None:
    r = await get_redis()
    await r.delete(key)
```

### 4.2 Cache Key Format

| Key Pattern | TTL | Description |
|-------------|-----|-------------|
| `prompt:{slug}` | 300s | Cached prompt content |

### 4.3 Cache Lifecycle

| Event | Action |
|-------|--------|
| Prompt created | `cache_set(prompt:{slug}, content)` |
| Prompt updated | `cache_invalidate(prompt:{slug})` then `cache_set(...)` |
| Prompt soft-deleted | `cache_invalidate(prompt:{slug})` |
| Prompt read (cache miss) | `cache_set(prompt:{slug}, content)` |
| TTL expires | Auto-eviction by Redis |

---

## 5. Three-Tier Fallback Chain

### 5.1 Retrieval Flow

```
get_prompt(slug)
    │
    ├── Tier 1: Redis ─── cache_get("prompt:{slug}")
    │   └── HIT → return (content, "cache")
    │
    ├── Tier 2: PostgreSQL ─── SELECT content FROM prompts WHERE slug=? AND is_active
    │   └── FOUND → cache_set() → return (content, "database")
    │
    ├── Tier 3: Hardcoded ─── PROMPT_DEFAULTS.get(slug)
    │   └── FOUND → return (content, "default")
    │
    └── NOT FOUND → return (None, "not_found")
```

### 5.2 Source Tracking

Every retrieval returns a `source` field indicating which tier served the prompt:
- `"cache"` — Redis cache hit (fastest, < 5ms)
- `"database"` — PostgreSQL lookup (also populates cache)
- `"default"` — Hardcoded fallback (no DB/cache entry exists)
- `"not_found"` — Slug does not exist anywhere

This enables consumers and the admin UI to track cache effectiveness.

---

## 6. Jinja2 Template Rendering

### 6.1 Template Variable Convention

Prompts may contain Jinja2 variables using `{{ variable_name }}` syntax:

```
You are analyzing a security finding.

Title: {{ title }}
Severity: {{ severity }}
Tool: {{ tool_source }}

Provide a detailed assessment of the impact.
```

### 6.2 Rendering Endpoint

```
POST /api/v1/prompts/by-slug/{slug}/render
Content-Type: application/json

{
    "variables": {
        "title": "SQL Injection in login form",
        "severity": "critical",
        "tool_source": "semgrep"
    }
}
```

### 6.3 Variable Extraction (for UI display)

```python
import re

def extract_template_variables(content: str) -> list[str]:
    """Extract {{ variable }} names from prompt content."""
    return sorted(set(re.findall(r"\{\{\s*(\w+)\s*\}\}", content)))
```

### 6.4 Error Handling

- Invalid Jinja2 syntax → return raw content (log warning)
- Missing variables → Jinja2 renders them as empty string (default behavior)
- Sandboxed environment — no access to filesystem or Python builtins

---

## 7. REST API Routes

### 7.1 Route Module

```python
# backend/app/api/routes/prompts.py
from fastapi import APIRouter, Depends, HTTPException, Query
from uuid import UUID

from app.database import get_db
from app.auth import require_role, get_current_user
from app.models.prompt import ApiRole
from app.services import prompt_service
from app.schemas.prompt import (
    PromptCreate, PromptUpdate, PromptRestoreRequest,
    PromptRenderRequest, PromptResponse, PromptSummary,
    PromptVersionResponse, PromptRenderResponse, PaginatedResponse,
)

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.post("/", response_model=PromptResponse, status_code=201)
async def create_prompt(
    data: PromptCreate,
    db=Depends(get_db),
    user=Depends(require_role(ApiRole.admin)),
):
    """Create a new prompt (version 1)."""
    existing = await prompt_service.get_by_slug(db, data.slug)
    if existing:
        raise HTTPException(409, f"Prompt with slug '{data.slug}' already exists")
    prompt = await prompt_service.create_prompt(db, data, updated_by=user.identity)
    return prompt


@router.get("/", response_model=PaginatedResponse)
async def list_prompts(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    type: str | None = None,
    consumer_id: str | None = None,
    category: str | None = None,
    search: str | None = None,
    is_active: bool | None = True,
    db=Depends(get_db),
    _user=Depends(require_role(ApiRole.viewer)),
):
    """List prompts with pagination, filtering, and search."""
    prompts, total = await prompt_service.list_prompts(
        db, prompt_type=type, consumer_id=consumer_id,
        category=category, search=search, is_active=is_active,
        page=page, size=size,
    )
    return PaginatedResponse(
        items=[PromptSummary.model_validate(p) for p in prompts],
        total=total, page=page, size=size,
        pages=-(-total // size),  # ceil division
    )


@router.get("/by-slug/{slug}", response_model=PromptResponse)
async def get_by_slug(
    slug: str,
    db=Depends(get_db),
    _user=Depends(require_role(ApiRole.viewer)),
):
    """Lookup prompt by slug (active only)."""
    result = await db.execute(
        select(Prompt).where(Prompt.slug == slug, Prompt.is_active.is_(True))
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(404, f"Prompt '{slug}' not found")
    return prompt


@router.get("/{prompt_id}", response_model=PromptResponse)
async def get_prompt(
    prompt_id: UUID,
    db=Depends(get_db),
    _user=Depends(require_role(ApiRole.viewer)),
):
    """Get prompt by UUID."""
    result = await db.execute(select(Prompt).where(Prompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(404, "Prompt not found")
    return prompt


@router.put("/{prompt_id}", response_model=PromptResponse)
async def update_prompt(
    prompt_id: UUID,
    data: PromptUpdate,
    db=Depends(get_db),
    user=Depends(require_role(ApiRole.editor)),
):
    """Update prompt (auto-increments version, creates version snapshot)."""
    prompt = await prompt_service.update_prompt(
        db, prompt_id, data, updated_by=user.identity
    )
    if not prompt:
        raise HTTPException(404, "Prompt not found")
    return prompt


@router.delete("/{prompt_id}", response_model=PromptResponse)
async def delete_prompt(
    prompt_id: UUID,
    db=Depends(get_db),
    user=Depends(require_role(ApiRole.admin)),
):
    """Soft-delete prompt (set is_active=False)."""
    prompt = await prompt_service.soft_delete_prompt(
        db, prompt_id, updated_by=user.identity
    )
    if not prompt:
        raise HTTPException(404, "Prompt not found")
    return prompt


# ─── Version History ─────────────────────────────────────────

@router.get("/{prompt_id}/versions", response_model=list[PromptVersionResponse])
async def list_versions(
    prompt_id: UUID,
    db=Depends(get_db),
    _user=Depends(require_role(ApiRole.viewer)),
):
    """List all versions for a prompt (newest first)."""
    versions = await prompt_service.get_versions(db, prompt_id)
    return versions


@router.get("/{prompt_id}/versions/{version}", response_model=PromptVersionResponse)
async def get_version(
    prompt_id: UUID,
    version: int,
    db=Depends(get_db),
    _user=Depends(require_role(ApiRole.viewer)),
):
    """Get a specific version snapshot."""
    v = await prompt_service.get_version(db, prompt_id, version)
    if not v:
        raise HTTPException(404, f"Version {version} not found")
    return v


@router.post("/{prompt_id}/restore", response_model=PromptResponse)
async def restore_version(
    prompt_id: UUID,
    data: PromptRestoreRequest,
    db=Depends(get_db),
    user=Depends(require_role(ApiRole.admin)),
):
    """Restore a historical version (creates new version with that content)."""
    prompt = await prompt_service.restore_version(
        db, prompt_id, data.version, updated_by=user.identity
    )
    if not prompt:
        raise HTTPException(404, "Prompt or version not found")
    return prompt


# ─── Template Rendering ──────────────────────────────────────

@router.post("/by-slug/{slug}/render", response_model=PromptRenderResponse)
async def render_prompt(
    slug: str,
    data: PromptRenderRequest,
    db=Depends(get_db),
    _user=Depends(require_role(ApiRole.viewer)),
):
    """Render a prompt with Jinja2 template variables."""
    content, source = await prompt_service.get_prompt_with_vars(
        db, slug, **data.variables
    )
    if content is None:
        raise HTTPException(404, f"Prompt '{slug}' not found")

    from app.services.prompt_service import extract_template_variables
    raw_content, _ = await prompt_service.get_prompt(db, slug)

    return PromptRenderResponse(
        slug=slug,
        rendered_content=content,
        variables_used=extract_template_variables(raw_content or ""),
        source=source,
    )
```

---

## 8. Pagination and Filtering

### 8.1 Pagination Strategy

**Offset-based pagination** (suitable for prompt management scale):

| Parameter | Type | Default | Constraints |
|-----------|------|---------|-------------|
| `page` | int | 1 | ge=1 |
| `size` | int | 50 | ge=1, le=100 |

### 8.2 Filter Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by PromptType (system, instruction, tooling, template) |
| `consumer_id` | string | Filter by consuming service identifier |
| `category` | string | Filter by slug-derived category |
| `search` | string | Case-insensitive search across slug and title |
| `is_active` | bool | Filter by active status (default: true) |

### 8.3 Response Format

```json
{
    "items": [
        {
            "id": "uuid",
            "api_id": 1,
            "slug": "ai-triage-assessment",
            "title": "Triage Assessment",
            "type": "template",
            "consumer_id": "triager",
            "version": 3,
            "is_active": true,
            "updated_by": "admin@company.com",
            "category": "ai",
            "updated_at": "2026-02-28T12:00:00Z"
        }
    ],
    "total": 42,
    "page": 1,
    "size": 50,
    "pages": 1
}
```

---

## 9. Health Check Endpoint

```python
# backend/app/api/routes/health.py
from fastapi import APIRouter
from app.database import get_db
from app.cache import get_redis

router = APIRouter(tags=["system"])


@router.get("/health")
async def health_check():
    """Liveness/readiness probe."""
    checks = {"status": "healthy", "database": "unknown", "cache": "unknown"}

    # Database check
    try:
        async with get_db() as db:
            await db.execute(text("SELECT 1"))
        checks["database"] = "connected"
    except Exception:
        checks["database"] = "disconnected"
        checks["status"] = "degraded"

    # Redis check
    try:
        r = await get_redis()
        await r.ping()
        checks["cache"] = "connected"
    except Exception:
        checks["cache"] = "disconnected"
        checks["status"] = "degraded"

    status_code = 200 if checks["status"] == "healthy" else 503
    return JSONResponse(content=checks, status_code=status_code)
```

---

## 10. OpenAPI Documentation

FastAPI auto-generates OpenAPI 3.1 spec at:

| URL | Description |
|-----|-------------|
| `/docs` | Swagger UI (interactive) |
| `/redoc` | ReDoc (documentation) |
| `/openapi.json` | Raw OpenAPI spec |

### Configuration

```python
# backend/app/main.py
from fastapi import FastAPI

app = FastAPI(
    title="AI Prompt Management Service",
    description="Centralized management for AI prompts with versioning, caching, and template rendering.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)
```

---

## 11. Error Handling

### 11.1 Standard Error Format

```json
{"detail": "Human-readable error message"}
```

### 11.2 Error Codes

| Status | Scenario |
|--------|----------|
| 400 | Invalid query parameters |
| 401 | Missing or invalid API key |
| 403 | Insufficient role permissions |
| 404 | Prompt/version not found |
| 409 | Duplicate slug on create |
| 422 | Request body validation failure (Pydantic) |
| 500 | Internal server error (generic message, no stack trace) |

### 11.3 Exception Handlers

```python
from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    if "uq_prompts_slug" in str(exc):
        return JSONResponse(status_code=409, content={"detail": "Slug already exists"})
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
```

---

## 12. Anti-Patterns to Avoid

| Anti-Pattern | Correct Approach |
|-------------|-----------------|
| Raw SQL with user input | ORM-only queries via SQLAlchemy |
| Returning stack traces in 500 errors | Generic error message |
| Unbounded query results | Always paginate with max size=100 |
| Caching without invalidation | Invalidate cache on every write |
| Blocking I/O in async routes | Use async DB driver (asyncpg) |
| Hardcoded secrets in code | Environment variables via Pydantic Settings |
| Physical deletion of prompts | Soft-delete only (is_active=false) |
| Mutable version history | Versions are immutable snapshots |

---

## 13. Validation Checklist

### CRUD Operations

- [ ] POST `/prompts` creates prompt and version 1
- [ ] GET `/prompts` returns paginated list with filters
- [ ] GET `/prompts/by-slug/{slug}` returns active prompt
- [ ] GET `/prompts/{id}` returns prompt by UUID
- [ ] PUT `/prompts/{id}` updates and increments version
- [ ] DELETE `/prompts/{id}` soft-deletes (is_active=false)

### Version History

- [ ] GET `/prompts/{id}/versions` returns all versions newest-first
- [ ] GET `/prompts/{id}/versions/{v}` returns specific version
- [ ] POST `/prompts/{id}/restore` creates new version with historical content
- [ ] Restore preserves all prior versions (non-destructive)

### Caching

- [ ] Cache populated on read (cache miss → DB → cache set)
- [ ] Cache invalidated on update
- [ ] Cache invalidated on soft-delete
- [ ] Cache TTL set to 300 seconds
- [ ] Fallback to defaults when slug not in DB or cache

### Template Rendering

- [ ] POST `/prompts/by-slug/{slug}/render` renders Jinja2 variables
- [ ] Missing variables render as empty strings
- [ ] Invalid Jinja2 syntax returns raw content
- [ ] `variables_used` field lists extracted template variables

### Auth & Error Handling

- [ ] Admin-only: create, delete, restore
- [ ] Editor: update
- [ ] Viewer: all read operations
- [ ] 409 on duplicate slug
- [ ] 404 on missing resource
- [ ] No stack traces in error responses
