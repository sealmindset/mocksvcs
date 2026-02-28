# Authentication & Authorization Plan: AI Prompt Management Service

> **Purpose:** API key authentication for service-to-service communication, optional OIDC for browser-based admin UI, and RBAC middleware with three roles (admin, editor, viewer).
>
> **Phase:** 4 of 8
> **Prerequisites:** Phase 3 (API Skeleton)
> **Duration:** 1-2 days
> **Reference:** Zapper `backend/app/middleware/`, `backend/app/api/routes/auth.py`

---

## Table of Contents

1. [Auth Architecture](#1-auth-architecture)
2. [API Key Authentication](#2-api-key-authentication)
3. [RBAC Middleware](#3-rbac-middleware)
4. [Optional OIDC Integration](#4-optional-oidc-integration)
5. [Development Mode](#5-development-mode)
6. [Audit Logging](#6-audit-logging)
7. [API Key Management Routes](#7-api-key-management-routes)
8. [Validation Checklist](#8-validation-checklist)

---

## 1. Auth Architecture

### Auth Flow Overview

```
Consuming Service (API Key)          Admin User (OIDC/Browser)
         │                                    │
         │  X-API-Key: pv_abc123              │  OIDC callback → session JWT
         │                                    │
         ▼                                    ▼
┌─────────────────────────────────────────────────────┐
│              Auth Middleware                          │
│                                                     │
│  1. Check X-API-Key header                          │
│     → Hash and lookup in api_keys table             │
│     → Verify: is_active, not expired                │
│     → Set current_user = ApiKeyIdentity             │
│                                                     │
│  2. Else check Authorization: Bearer <jwt>          │
│     → Validate OIDC JWT                             │
│     → Set current_user = OIDCIdentity               │
│                                                     │
│  3. Else if AUTH_DISABLED=true                       │
│     → Set current_user = DevIdentity(role=admin)    │
│                                                     │
│  4. Else → 401 Unauthorized                         │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│              RBAC Guard                              │
│                                                     │
│  require_role(ApiRole.editor)                       │
│  → Check current_user.role >= required_role         │
│  → 403 if insufficient                              │
└─────────────────────────────────────────────────────┘
```

### Role Hierarchy

| Role | Level | Permissions |
|------|-------|------------|
| admin | 3 | Full CRUD, manage API keys, view audit logs, restore versions, deactivate prompts |
| editor | 2 | Create prompts, update prompts, view versions |
| viewer | 1 | Read-only: list prompts, get by slug/id, view versions, render templates |

---

## 2. API Key Authentication

### 2.1 Key Format

```
pv_{32-character-random-hex}
```

Example: `pv_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`

- Prefix `pv_` (prompt vault) for easy identification
- 32 hex characters = 128 bits of entropy
- SHA-256 hashed before storage (only hash in DB)
- Raw key shown **once** at creation — never retrievable again

### 2.2 Key Generation

```python
# backend/app/services/api_key_service.py
import hashlib
import secrets
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.api_key import ApiKey, ApiRole


def generate_api_key() -> tuple[str, str]:
    """Generate API key and its hash. Returns (raw_key, key_hash)."""
    raw = f"pv_{secrets.token_hex(16)}"
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


async def create_api_key(
    db: AsyncSession, name: str, role: ApiRole, expires_at=None
) -> tuple[ApiKey, str]:
    """Create API key. Returns (model, raw_key)."""
    raw_key, key_hash = generate_api_key()
    api_key = ApiKey(
        name=name,
        key_hash=key_hash,
        role=role,
        expires_at=expires_at,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)
    return api_key, raw_key


async def validate_api_key(db: AsyncSession, raw_key: str) -> ApiKey | None:
    """Validate API key and return model if valid."""
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.key_hash == key_hash,
            ApiKey.is_active.is_(True),
        )
    )
    api_key = result.scalar_one_or_none()
    if api_key is None:
        return None

    # Check expiration
    if api_key.expires_at and api_key.expires_at < datetime.now(timezone.utc):
        return None

    # Update last_used_at
    api_key.last_used_at = datetime.now(timezone.utc)
    await db.commit()

    return api_key
```

### 2.3 Authentication Middleware

```python
# backend/app/middleware/auth.py
from dataclasses import dataclass
from fastapi import Depends, HTTPException, Request
from app.database import get_db
from app.config import settings
from app.models.api_key import ApiRole


@dataclass
class CurrentUser:
    identity: str       # email or API key name
    role: ApiRole
    auth_method: str    # "api_key", "oidc", or "dev"


async def get_current_user(
    request: Request,
    db=Depends(get_db),
) -> CurrentUser:
    """Extract and validate current user from request."""

    # Dev mode bypass
    if settings.auth_disabled:
        return CurrentUser(
            identity="dev@localhost",
            role=ApiRole.admin,
            auth_method="dev",
        )

    # API Key auth
    api_key_header = request.headers.get("X-API-Key")
    if api_key_header:
        from app.services.api_key_service import validate_api_key
        api_key = await validate_api_key(db, api_key_header)
        if api_key is None:
            raise HTTPException(401, "Invalid or expired API key")
        return CurrentUser(
            identity=api_key.name,
            role=api_key.role,
            auth_method="api_key",
        )

    # OIDC JWT auth (if configured)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        # Validate OIDC JWT (Phase 4 enhancement)
        pass

    raise HTTPException(401, "Authentication required")


def require_role(minimum_role: ApiRole):
    """FastAPI dependency that enforces minimum role level."""
    ROLE_LEVELS = {
        ApiRole.viewer: 1,
        ApiRole.editor: 2,
        ApiRole.admin: 3,
    }

    async def _check(user: CurrentUser = Depends(get_current_user)):
        if ROLE_LEVELS.get(user.role, 0) < ROLE_LEVELS[minimum_role]:
            raise HTTPException(
                403, f"Requires {minimum_role.value} role or higher"
            )
        return user

    return _check
```

---

## 3. RBAC Middleware

### 3.1 Permission Matrix

| Endpoint | admin | editor | viewer |
|----------|-------|--------|--------|
| POST `/prompts` | Y | N | N |
| GET `/prompts` | Y | Y | Y |
| GET `/prompts/by-slug/{slug}` | Y | Y | Y |
| GET `/prompts/{id}` | Y | Y | Y |
| PUT `/prompts/{id}` | Y | Y | N |
| DELETE `/prompts/{id}` | Y | N | N |
| GET `/prompts/{id}/versions` | Y | Y | Y |
| GET `/prompts/{id}/versions/{v}` | Y | Y | Y |
| POST `/prompts/{id}/restore` | Y | N | N |
| POST `/prompts/by-slug/{slug}/render` | Y | Y | Y |
| POST `/api-keys` | Y | N | N |
| GET `/api-keys` | Y | N | N |
| DELETE `/api-keys/{id}` | Y | N | N |
| GET `/audit-logs` | Y | N | N |
| GET `/health` | Y | Y | Y |

### 3.2 Route Guard Usage

```python
@router.post("/", response_model=PromptResponse, status_code=201)
async def create_prompt(
    data: PromptCreate,
    db=Depends(get_db),
    user=Depends(require_role(ApiRole.admin)),  # ← admin only
):
    ...

@router.get("/", response_model=PaginatedResponse)
async def list_prompts(
    db=Depends(get_db),
    _user=Depends(require_role(ApiRole.viewer)),  # ← any authenticated user
):
    ...
```

---

## 4. Optional OIDC Integration

### 4.1 Configuration

```python
# Only activated when OIDC env vars are set
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_AUTHORITY=https://login.microsoftonline.com/{tenant_id}/v2.0
OIDC_CALLBACK_URL=http://localhost:3000/api/auth/callback
```

### 4.2 Flow

1. Frontend redirects to OIDC provider login
2. OIDC provider redirects back with authorization code
3. Backend exchanges code for tokens
4. Backend validates ID token and extracts claims
5. Backend issues session JWT (stored in httpOnly cookie)
6. Subsequent requests include JWT in Authorization header

### 4.3 Role Mapping

OIDC users receive admin role by default (admin UI users). For more granular control, map OIDC groups/claims to roles:

```python
OIDC_ROLE_MAPPING = {
    "prompt-admins": ApiRole.admin,
    "prompt-editors": ApiRole.editor,
    "prompt-viewers": ApiRole.viewer,
}
```

---

## 5. Development Mode

When `AUTH_DISABLED=true`:

- All requests authenticated as `dev@localhost` with `admin` role
- No API key or OIDC validation
- Suitable for local development only
- Default in docker-compose.yml (dev)
- Disabled in docker-compose.prod.yml

---

## 6. Audit Logging

### 6.1 Audit Service

```python
# backend/app/services/audit_service.py
from app.models.audit_log import AuditLog


async def log_action(
    db: AsyncSession,
    action: str,
    resource_type: str,
    resource_id: UUID,
    user_id: str,
    changes: dict | None = None,
) -> None:
    """Record an audit log entry."""
    entry = AuditLog(
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        user_id=user_id,
        changes=changes,
    )
    db.add(entry)
    await db.flush()
```

### 6.2 Integration with Service Layer

Every write operation in prompt_service should call audit logging:

```python
# In create_prompt:
await log_action(db, "prompt.created", "prompt", prompt.id, updated_by)

# In update_prompt:
await log_action(db, "prompt.updated", "prompt", prompt.id, updated_by, changes={
    "content": {"old": old_content[:200], "new": new_content[:200]},
    "version": {"old": old_version, "new": prompt.version},
})

# In soft_delete_prompt:
await log_action(db, "prompt.deactivated", "prompt", prompt.id, updated_by)

# In restore_version:
await log_action(db, "prompt.restored", "prompt", prompt.id, updated_by, changes={
    "restored_from_version": target_version,
    "new_version": prompt.version,
})
```

---

## 7. API Key Management Routes

```python
# backend/app/api/routes/api_keys.py
from fastapi import APIRouter, Depends, HTTPException
from app.auth import require_role
from app.models.api_key import ApiRole
from app.services import api_key_service
from app.schemas.api_key import ApiKeyCreate, ApiKeyResponse, ApiKeyCreateResponse

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


@router.post("/", response_model=ApiKeyCreateResponse, status_code=201)
async def create_api_key(
    data: ApiKeyCreate,
    db=Depends(get_db),
    user=Depends(require_role(ApiRole.admin)),
):
    """Generate a new API key. Raw key is only shown once."""
    api_key, raw_key = await api_key_service.create_api_key(
        db, data.name, data.role, data.expires_at
    )
    return {**ApiKeyResponse.model_validate(api_key).model_dump(), "raw_key": raw_key}


@router.get("/", response_model=list[ApiKeyResponse])
async def list_api_keys(
    db=Depends(get_db),
    _user=Depends(require_role(ApiRole.admin)),
):
    """List all API keys (without raw key values)."""
    return await api_key_service.list_api_keys(db)


@router.delete("/{key_id}")
async def revoke_api_key(
    key_id: UUID,
    db=Depends(get_db),
    user=Depends(require_role(ApiRole.admin)),
):
    """Revoke (deactivate) an API key."""
    success = await api_key_service.revoke_api_key(db, key_id)
    if not success:
        raise HTTPException(404, "API key not found")
    return {"detail": "API key revoked"}
```

---

## 8. Validation Checklist

### API Key Auth

- [ ] API key generation produces `pv_` prefixed keys
- [ ] Raw key only returned once (at creation)
- [ ] Key hash stored, not plaintext
- [ ] Invalid key returns 401
- [ ] Expired key returns 401
- [ ] Revoked key returns 401
- [ ] `last_used_at` updated on successful auth

### RBAC

- [ ] Admin can access all endpoints
- [ ] Editor can create and update but not delete or manage keys
- [ ] Viewer can only read prompts and versions
- [ ] Insufficient role returns 403
- [ ] Health check requires no auth

### Dev Mode

- [ ] `AUTH_DISABLED=true` grants admin access to all endpoints
- [ ] `AUTH_DISABLED=false` requires valid API key or OIDC token

### Audit Trail

- [ ] Create, update, delete, and restore operations logged
- [ ] Audit log records user identity and changes
- [ ] Audit log endpoint returns paginated results
- [ ] Only admins can view audit logs
