# API-First Architecture Implementation Plan

**Template for building REST APIs with OpenAPI 3.1 as the single source of truth.**
**Reference implementation: AuditGH (FastAPI + Next.js)**

---

## Table of Contents

1. [Principles](#1-api-first-principles)
2. [Architecture Overview](#2-architecture-overview)
3. [Phase 1: OpenAPI Specification](#phase-1-openapi-specification)
4. [Phase 2: Project Structure & Router Organization](#phase-2-project-structure--router-organization)
5. [Phase 3: Request & Response Models](#phase-3-request--response-models)
6. [Phase 4: Error Handling Standards](#phase-4-error-handling-standards)
7. [Phase 5: Pagination](#phase-5-pagination)
8. [Phase 6: Authentication in the API Contract](#phase-6-authentication-in-the-api-contract)
9. [Phase 7: Middleware Stack](#phase-7-middleware-stack)
10. [Phase 8: Health Check & Observability](#phase-8-health-check--observability)
11. [Phase 9: Rate Limiting](#phase-9-rate-limiting)
12. [Phase 10: CORS Configuration](#phase-10-cors-configuration)
13. [Phase 11: API Versioning Strategy](#phase-11-api-versioning-strategy)
14. [Phase 12: Developer Sandbox](#phase-12-developer-sandbox)
15. [Phase 13: SDK Generation](#phase-13-sdk-generation)
16. [Phase 14: OpenAPI Validation & Governance](#phase-14-openapi-validation--governance)
17. [Phase 15: Developer Portal](#phase-15-developer-portal)
18. [Phase 16: Contract Testing](#phase-16-contract-testing)
19. [Phase 17: API Lifecycle Management](#phase-17-api-lifecycle-management)
20. [Naming Conventions](#naming-conventions)
21. [API Design Checklist](#api-design-checklist)
22. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## 1. API-First Principles

### What is API-First?

API-First means the API contract (OpenAPI specification) is designed, reviewed, and agreed upon **before** any implementation code is written. The specification is the single source of truth for:

- Backend implementation
- Frontend integration
- SDK generation
- Documentation
- Contract testing
- Mock servers

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Contract before code** | Design the API spec, get stakeholder approval, then implement |
| **Spec is the truth** | OpenAPI spec drives docs, SDKs, tests, and mocks — not the other way around |
| **Consumer-driven** | Design APIs from the consumer's perspective, not the database schema |
| **Consistent by default** | Every endpoint follows the same patterns for errors, pagination, auth, naming |
| **Backwards compatible** | Never break existing consumers; use versioning for breaking changes |
| **Self-documenting** | API should be understandable from the spec alone, without external docs |

### API-First vs Code-First

```
API-First Workflow:
  Design spec → Review → Approve → Implement → Validate against spec → Ship

Code-First Workflow (what most teams do):
  Write code → Auto-generate spec → Hope it's consistent → Ship

API-First + Code Generation (pragmatic middle ground — AuditGH pattern):
  Write annotated code → Auto-generate spec → Validate spec → Enhance spec → Ship
  (Use framework's auto-generation but validate and govern the output)
```

This plan supports both pure API-First and the pragmatic middle ground.

---

## 2. Architecture Overview

### API Layer Architecture

```
                         ┌─────────────────────────┐
                         │     API Consumers        │
                         │  Frontend │ CLI │ SDKs   │
                         └──────────┬──────────────┘
                                    │
                         ┌──────────▼──────────────┐
                         │      Load Balancer       │
                         │    (HTTPS termination)   │
                         └──────────┬──────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────┐
│                           API Server                                  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                     Middleware Stack                             │  │
│  │  CORS → Session → Auth → Tenant → Logging → Security Headers   │  │
│  └──────────────────────────┬──────────────────────────────────────┘  │
│                              │                                        │
│  ┌──────────────────────────▼──────────────────────────────────────┐  │
│  │                     Router Layer                                │  │
│  │                                                                 │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │  │
│  │  │   Auth     │ │  Resources │ │  Analytics  │ │   Admin    │   │  │
│  │  │  /auth/*   │ │ /items/*   │ │ /analytics/*│ │  /admin/*  │   │  │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │  │
│  └──────────────────────────┬──────────────────────────────────────┘  │
│                              │                                        │
│  ┌──────────────────────────▼──────────────────────────────────────┐  │
│  │                   Service / Business Logic                      │  │
│  └──────────────────────────┬──────────────────────────────────────┘  │
│                              │                                        │
│  ┌──────────────────────────▼──────────────────────────────────────┐  │
│  │                    Data Access Layer                             │  │
│  │          ORM Models │ Database │ Cache │ External APIs           │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
     ┌────────▼───────┐   ┌────────▼───────┐   ┌────────▼───────┐
     │   PostgreSQL   │   │     Redis      │   │  External APIs │
     │   (primary)    │   │   (cache/      │   │  (IdP, SMTP,   │
     │                │   │    sessions)   │   │   webhooks)    │
     └────────────────┘   └────────────────┘   └────────────────┘
```

### Developer Experience Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Developer Ecosystem                        │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Swagger UI  │  │   ReDoc      │  │  Swagger Editor  │   │
│  │  (Try It)    │  │  (Reference) │  │  (Design Tool)   │   │
│  │  :8000/docs  │  │  :8000/redoc │  │  :8080           │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                 │                    │              │
│         └─────────────────┼────────────────────┘              │
│                           │                                   │
│                  ┌────────▼────────┐                          │
│                  │  OpenAPI Spec   │ ← Single Source of Truth │
│                  │  /openapi.json  │                          │
│                  └────────┬────────┘                          │
│                           │                                   │
│         ┌─────────────────┼─────────────────┐                │
│         │                 │                 │                │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐         │
│  │  Python SDK │  │    TS SDK   │  │  Spectral   │         │
│  │  (generated)│  │  (generated)│  │  (linting)  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                  Developer Sandbox                    │    │
│  │  - Pre-seeded data        - 3 API keys (admin/       │    │
│  │  - Isolated environment     analyst/readonly)         │    │
│  │  - Auto-reset (24h)       - Port :8001               │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 1: OpenAPI Specification

### 1.1 Specification Structure

Whether you write the spec by hand (pure API-First) or auto-generate from annotated code, ensure the output contains:

```yaml
openapi: "3.1.0"
info:
  title: "Your API"
  version: "2.0.0"
  description: |
    Multi-line description with usage instructions.
    Supports **Markdown** formatting.
  contact:
    name: "API Support"
    email: "api-support@company.com"
  license:
    name: "Apache 2.0"

servers:
  - url: http://localhost:8000
    description: Local development
  - url: https://api-staging.company.com
    description: Staging
  - url: https://api.company.com
    description: Production

security:
  - BearerAuth: []
  - ApiKeyAuth: []
  - SessionAuth: []

tags:
  - name: authentication
    description: Login, logout, token management
  - name: resources
    description: CRUD operations on primary resources
  - name: analytics
    description: Metrics, dashboards, reports

paths:
  /resources:
    get:
      tags: [resources]
      summary: "List resources"
      operationId: listResources
      parameters: [...]
      responses:
        "200": { ... }
        "401": { $ref: "#/components/responses/Unauthorized" }
    post:
      tags: [resources]
      summary: "Create resource"
      operationId: createResource
      requestBody: { ... }
      responses:
        "201": { ... }
        "400": { $ref: "#/components/responses/BadRequest" }

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
    SessionAuth:
      type: apiKey
      in: cookie
      name: session

  schemas:
    Resource:
      type: object
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
        created_at: { type: string, format: date-time }

  responses:
    BadRequest:
      description: Validation error
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorResponse"
    Unauthorized:
      description: Authentication required
    NotFound:
      description: Resource not found
```

### 1.2 Swagger UI Configuration

Customize the interactive documentation experience:

```
Parameters:
  docExpansion: "none"            # Collapse all by default
  filter: true                    # Enable search/filter
  persistAuthorization: true      # Remember auth across reloads
  tryItOutEnabled: true           # Enable "Try it out"
  displayRequestDuration: true    # Show response time
  defaultModelsExpandDepth: 2     # Model nesting depth
```

### 1.3 Documentation Endpoints

| Endpoint | Purpose | Audience |
|----------|---------|----------|
| `GET /openapi.json` | Raw OpenAPI spec | Tools, CI/CD |
| `GET /docs` | Swagger UI (interactive) | Developers |
| `GET /redoc` | ReDoc (read-only reference) | Stakeholders |

---

## Phase 2: Project Structure & Router Organization

### 2.1 File Organization

```
src/api/
├── main.py                     # App factory, middleware, router registration
├── config.py                   # Environment-based configuration
├── database.py                 # DB connection, session factory
├── models.py                   # SQLAlchemy/ORM models
├── dependencies.py             # Shared dependency injection
│
├── schemas/                    # Pydantic models (request/response)
│   ├── __init__.py
│   ├── common.py               # ErrorResponse, PaginatedResponse, health
│   ├── resources.py            # Resource schemas
│   └── auth.py                 # Auth-related schemas
│
├── routers/                    # Route handlers (one file per domain)
│   ├── auth.py                 # /auth/*
│   ├── resources.py            # /resources/*
│   ├── analytics.py            # /analytics/*
│   ├── settings.py             # /settings/*
│   └── sandbox.py              # /api/sandbox/* (conditional)
│
├── middleware/                  # Request/response interceptors
│   ├── __init__.py
│   ├── auth.py                 # Authentication enforcement
│   ├── logging.py              # Request lifecycle logging
│   ├── tenant.py               # Multi-tenant context
│   └── sandbox_auth.py         # Sandbox-specific auth
│
├── services/                   # Business logic (no HTTP awareness)
│   ├── resource_service.py
│   └── analytics_service.py
│
└── utils/                      # Shared utilities
    ├── risk_scoring.py
    └── redaction.py
```

### 2.2 Router Pattern

Each router follows the same structure:

```python
# routers/resources.py
from fastapi import APIRouter, Depends, Query, Path
from ..schemas.common import CRUD_ERRORS, PaginatedResponse
from ..schemas.resources import ResourceCreate, ResourceResponse
from ..dependencies import get_current_user, get_db

router = APIRouter(
    prefix="/resources",
    tags=["resources"]
)

@router.get(
    "/",
    response_model=PaginatedResponse[ResourceResponse],
    summary="List resources",
    description="Returns a paginated list of resources.",
    responses=CRUD_ERRORS
)
async def list_resources(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    db=Depends(get_db),
    user=Depends(get_current_user)
):
    ...

@router.post(
    "/",
    response_model=ResourceResponse,
    status_code=201,
    summary="Create resource",
    responses=CRUD_ERRORS
)
async def create_resource(
    body: ResourceCreate,
    db=Depends(get_db),
    user=Depends(get_current_user)
):
    ...

@router.get("/{resource_id}", ...)
@router.put("/{resource_id}", ...)
@router.delete("/{resource_id}", ...)
```

### 2.3 Router Registration

```python
# main.py — Register routers in logical order
# Auth first, then resources, then analytics, then admin
app.include_router(auth.router)           # /auth/*
app.include_router(resources.router)      # /resources/*
app.include_router(analytics.router)      # /analytics/*
app.include_router(settings.router)       # /settings/*

# Conditional routers
if is_sandbox():
    app.include_router(sandbox.router)    # /api/sandbox/*
```

### 2.4 Tag Metadata

Define tags with descriptions for Swagger UI grouping:

```python
tags_metadata = [
    {"name": "authentication", "description": "Login, logout, token management"},
    {"name": "resources", "description": "CRUD operations on primary resources"},
    {"name": "analytics", "description": "Metrics, dashboards, aggregations"},
    {"name": "settings", "description": "System and user configuration"},
    {"name": "sandbox", "description": "Developer sandbox management"},
]
```

---

## Phase 3: Request & Response Models

### 3.1 Schema Layering Pattern

```
ResourceBase           # Shared fields (name, description)
  ├── ResourceCreate   # Create request (no ID, no timestamps)
  ├── ResourceUpdate   # Update request (all optional fields)
  └── ResourceResponse # Response (includes ID, timestamps, computed)
```

```python
# schemas/resources.py
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from uuid import UUID

class ResourceBase(BaseModel):
    """Shared fields for resource operations."""
    name: str = Field(..., min_length=1, max_length=255,
                      description="Resource name",
                      examples=["my-resource"])
    description: Optional[str] = Field(None, max_length=2000,
                                       description="Optional description")

class ResourceCreate(ResourceBase):
    """Request body for creating a resource."""
    pass  # Inherits all base fields as required

class ResourceUpdate(BaseModel):
    """Request body for updating a resource. All fields optional."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)

class ResourceResponse(ResourceBase):
    """Response body for a resource."""
    id: UUID = Field(..., description="Unique identifier")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    created_by: str = Field(..., description="Email of creator")

    model_config = {"from_attributes": True}  # SQLAlchemy ORM support
```

### 3.2 Field Documentation Requirements

Every field must have:
- **Type annotation** (str, int, Optional[str], List[str], UUID)
- **Field() with description** (appears in OpenAPI docs)
- **examples** parameter (shown in Swagger UI "Try it out")
- **Validation constraints** (min_length, max_length, ge, le, regex)

### 3.3 Common Response Types

```python
# schemas/common.py
from pydantic import BaseModel
from typing import Generic, TypeVar, List
from pydantic.generics import GenericModel

T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool

class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None

class CountResponse(BaseModel):
    count: int
```

---

## Phase 4: Error Handling Standards

### 4.1 Error Response Schema

```python
class ErrorResponse(BaseModel):
    detail: str  # Human-readable error message

class ValidationErrorDetail(BaseModel):
    loc: List[str]   # Field path: ["body", "name"]
    msg: str         # Error message
    type: str        # Error type: "value_error"

class ValidationErrorResponse(BaseModel):
    detail: List[ValidationErrorDetail]
```

### 4.2 Standard HTTP Status Codes

| Code | Name | When to Use |
|------|------|-------------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST that creates a resource |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Validation error, malformed input |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Authenticated but insufficient permissions |
| 404 | Not Found | Resource doesn't exist (also use for unauthorized access to hide existence) |
| 409 | Conflict | Duplicate resource, concurrent modification |
| 422 | Unprocessable Entity | Semantically invalid request (framework-specific) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unhandled server error |
| 503 | Service Unavailable | Dependency down (DB, Redis) |

### 4.3 Error Response Presets

Define reusable error response sets for consistent OpenAPI documentation:

```python
STANDARD_ERRORS = {
    400: {"description": "Bad request", "model": ErrorResponse},
    401: {"description": "Authentication required", "model": ErrorResponse},
    403: {"description": "Insufficient permissions", "model": ErrorResponse},
    404: {"description": "Resource not found", "model": ErrorResponse},
    429: {"description": "Rate limit exceeded", "model": ErrorResponse},
    500: {"description": "Internal server error", "model": ErrorResponse},
}

CRUD_ERRORS = {**STANDARD_ERRORS, 409: {"description": "Conflict", "model": ErrorResponse}}
LIST_ERRORS = {401: ..., 403: ..., 429: ..., 500: ...}
CREATE_ERRORS = {400: ..., 401: ..., 403: ..., 409: ..., 429: ..., 500: ...}
DELETE_ERRORS = {401: ..., 403: ..., 404: ..., 429: ..., 500: ...}
```

### 4.4 Error Response Examples

```json
// 400 Bad Request
{"detail": "Field 'name' is required"}

// 401 Unauthorized
{"detail": "Authentication required. Login at /auth/login/entra"}

// 403 Forbidden
{"detail": "Insufficient permissions. Required: findings:write"}

// 404 Not Found
{"detail": "Resource with ID 'abc-123' not found"}

// 409 Conflict
{"detail": "Resource with name 'my-resource' already exists"}

// 429 Too Many Requests
{"detail": "Rate limit exceeded. Retry after 60 seconds"}

// 500 Internal Server Error
{"detail": "An unexpected error occurred. Request ID: req-uuid-here"}
```

---

## Phase 5: Pagination

### 5.1 Page-Based Pagination (Recommended)

```
GET /resources?page=2&page_size=25

Response:
{
  "items": [...],
  "total": 150,
  "page": 2,
  "page_size": 25,
  "total_pages": 6,
  "has_next": true,
  "has_prev": true
}
```

### 5.2 Query Parameters

| Parameter | Type | Default | Constraints | Description |
|-----------|------|---------|-------------|-------------|
| `page` | int | 1 | >= 1 | Page number (1-indexed) |
| `page_size` | int | 50 | 1-100 | Items per page |
| `sort_by` | string | "created_at" | Allowed fields | Sort field |
| `sort_order` | string | "desc" | "asc" or "desc" | Sort direction |

### 5.3 Filtering Pattern

Filters as query parameters with consistent naming:

```
GET /findings?severity=critical&status=open&repo_name=my-repo&page=1&page_size=50
```

| Pattern | Example | Use Case |
|---------|---------|----------|
| Exact match | `?status=open` | Enum/string fields |
| Multiple values | `?severity=critical,high` | OR filter |
| Date range | `?created_after=2026-01-01&created_before=2026-02-01` | Time ranges |
| Search | `?q=search+term` | Full-text search |

### 5.4 Pagination Implementation

```python
@router.get("/", response_model=PaginatedResponse[ResourceResponse])
async def list_resources(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    db=Depends(get_db)
):
    # Calculate offset
    skip = (page - 1) * page_size

    # Query with pagination
    query = db.query(Resource)
    total = query.count()
    items = query.order_by(...).offset(skip).limit(page_size).all()

    # Build response
    total_pages = math.ceil(total / page_size)
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1
    }
```

### 5.5 Caching Paginated Results

```
Redis key: {resource}:list:{org_id}:{page}:{page_size}:{filters_hash}
TTL: 60 seconds (short, invalidated on writes)

On POST/PUT/DELETE: Invalidate all list cache keys for that resource
```

---

## Phase 6: Authentication in the API Contract

### 6.1 Security Schemes

Define all authentication methods in the OpenAPI spec:

```yaml
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: >
        JWT token obtained from POST /auth/break-glass/login,
        POST /auth/refresh, or OAuth 2.0 Device Flow

    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
      description: >
        API key obtained from POST /settings/api-keys
        (format: agh_xxxxxxxxxxxx)

    SessionAuth:
      type: apiKey
      in: cookie
      name: session
      description: >
        Session cookie set during OAuth login callback.
        Used by browser-based clients.
```

### 6.2 Global vs Per-Endpoint Security

```yaml
# Global: Any one method satisfies auth
security:
  - BearerAuth: []
  - ApiKeyAuth: []
  - SessionAuth: []

# Per-endpoint override: No auth required
paths:
  /health:
    get:
      security: []  # Public endpoint
  /auth/login/{provider}:
    get:
      security: []  # Pre-authentication
```

### 6.3 Auth Documentation in Swagger UI

Swagger UI's **Authorize** button should support all three methods:
- Bearer: Paste JWT token
- API Key: Paste API key value
- Session: Automatic (if logged in via browser)

Enable `persistAuthorization: true` so developers don't re-enter credentials on page reload.

---

## Phase 7: Middleware Stack

### 7.1 Middleware Ordering

Order matters. Register in this sequence (first registered = outermost layer):

```
Request arrives
  │
  ▼ (1) CORS Middleware
  │     Handle preflight OPTIONS, add CORS headers
  ▼ (2) Session Middleware
  │     Manage encrypted session cookies (for OAuth state)
  ▼ (3) Request Logging Middleware
  │     Assign request_id, log start/end, measure duration
  ▼ (4) Authentication Middleware
  │     Enforce auth on protected routes, redirect or 401
  ▼ (5) Tenant Middleware (if multi-tenant)
  │     Extract tenant context from JWT/header/cookie
  ▼ (6) Session Activity Middleware
  │     Update last_activity for idle timeout
  ▼ (7) Security Headers Middleware
  │     Add CSP, HSTS, X-Frame-Options, etc.
  │
  ▼ Route Handler
```

### 7.2 Request Logging Middleware

```
On request start:
  1. Generate UUID request_id
  2. Record start time
  3. Extract context: user_id, org_id, session_id

On request end:
  4. Calculate duration
  5. Categorize: FAST (<100ms), NORMAL (<500ms), SLOW (<2s), CRITICAL (>2s)
  6. Log: method, path, status, duration, request_id
  7. Add X-Request-ID response header
```

### 7.3 Security Headers

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'
Strict-Transport-Security: max-age=31536000; includeSubDomains  (production only)
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-XSS-Protection: 1; mode=block
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## Phase 8: Health Check & Observability

### 8.1 Health Endpoint

```
GET /health

Response 200 (all healthy):
{
  "status": "healthy",
  "timestamp": "2026-02-27T15:30:00Z",
  "version": "2.0.0",
  "checks": {
    "database": "healthy",
    "redis": "healthy"
  }
}

Response 503 (degraded):
{
  "status": "unhealthy",
  "timestamp": "2026-02-27T15:30:00Z",
  "version": "2.0.0",
  "checks": {
    "database": "unhealthy: connection refused",
    "redis": "healthy"
  }
}
```

### 8.2 Health Check Implementation

```python
@app.get("/health", tags=["system"], security=[])
async def health_check():
    checks = {}
    healthy = True

    # Database check
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "healthy"
    except Exception as e:
        checks["database"] = f"unhealthy: {str(e)}"
        healthy = False

    # Redis check
    try:
        redis_client.ping()
        checks["redis"] = "healthy"
    except Exception as e:
        checks["redis"] = f"unhealthy: {str(e)}"
        healthy = False

    status_code = 200 if healthy else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "healthy" if healthy else "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "version": app.version,
            "checks": checks
        }
    )
```

### 8.3 Docker Health Check

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### 8.4 Observability Headers

Every response should include:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Request-ID` | UUID | Correlation across logs |
| `X-RateLimit-Limit` | Number | Max requests per window |
| `X-RateLimit-Remaining` | Number | Remaining in window |
| `X-RateLimit-Reset` | Unix timestamp | Window reset time |

---

## Phase 9: Rate Limiting

### 9.1 Strategy

```
Storage: Redis (distributed, shared across instances)
Key function: user sub > API key ID > IP address
Default: 100 requests/minute per identity
Headers: X-RateLimit-* on all responses
```

### 9.2 Endpoint-Specific Limits

| Category | Limit | Endpoints |
|----------|-------|-----------|
| Auth | 5/minute | `/auth/login/*`, `/auth/break-glass/*` |
| Token | 10/minute | `/auth/refresh`, `/auth/revoke` |
| Write | 30/minute | POST, PUT, DELETE operations |
| Read | 100/minute | GET operations |
| Heavy compute | 5/minute | AI analysis, report generation |
| API keys | Configurable | Per-key `rate_limit_per_hour` field |

### 9.3 Rate Limit Response

```
HTTP 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1709040060

{"detail": "Rate limit exceeded. Retry after 60 seconds"}
```

---

## Phase 10: CORS Configuration

### 10.1 Configuration

```python
CORSMiddleware(
    allow_origins=["http://localhost:3000", "https://app.company.com"],
    allow_credentials=True,     # Required for session cookies
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key",
                   "X-Organization-ID", "X-Request-ID"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining",
                    "X-RateLimit-Reset", "X-Request-ID"]
)
```

### 10.2 Rules

- **Never use `allow_origins=["*"]`** with `allow_credentials=True`
- List explicit origins from environment variables
- Expose rate limit headers so frontend can display them
- Include `X-Request-ID` in expose_headers for error correlation

---

## Phase 11: API Versioning Strategy

### 11.1 Approach Comparison

| Strategy | URL | Pro | Con |
|----------|-----|-----|-----|
| **URL path** | `/api/v2/resources` | Clear, cacheable, easy routing | URL pollution |
| **Header** | `Accept: application/vnd.api.v2+json` | Clean URLs | Hidden, harder to test |
| **Query param** | `/resources?version=2` | Simple | Not RESTful |
| **No versioning** | `/resources` | Simplest | Must be backwards compatible |

### 11.2 Recommended: Additive Changes + URL Path for Breaking Changes

```
Phase 1: Start with no versioning
  /resources → v1 behavior (implicit)

Phase 2: When a breaking change is needed
  /api/v1/resources → Original behavior (maintained)
  /api/v2/resources → New behavior

Phase 3: Deprecation
  /api/v1/resources → Returns Sunset header
  /api/v2/resources → Active version
```

### 11.3 Non-Breaking Changes (No Version Bump)

These changes are backwards compatible — just ship them:
- Adding new optional fields to response
- Adding new optional query parameters
- Adding new endpoints
- Adding new enum values (if client handles unknown values)
- Increasing rate limits
- Improving error messages

### 11.4 Breaking Changes (Require Version Bump)

These require a new version:
- Removing or renaming a field
- Changing a field's type
- Making an optional field required
- Changing URL structure
- Removing an endpoint
- Changing authentication method
- Changing error response format

### 11.5 Deprecation Headers

```
Sunset: Sat, 01 Jun 2027 00:00:00 GMT
Deprecation: true
Link: </api/v2/resources>; rel="successor-version"
```

---

## Phase 12: Developer Sandbox

### 12.1 Purpose

An isolated environment where developers can explore the API with pre-seeded data, pre-configured API keys, and no risk to production data.

### 12.2 Architecture (AuditGH Pattern)

```
Production API (:8000)              Sandbox API (:8001)
├── Real data                       ├── Deterministic seed data
├── Full auth (OIDC/JWT/session)    ├── Simple API key auth only
├── Rate limits enforced            ├── Relaxed limits
├── Audit logging                   ├── No audit logging
└── Multi-tenant isolation          └── Single sandbox tenant
```

### 12.3 Sandbox Components

**Pre-Generated API Keys (3 tiers):**

| Key | Role | Use Case |
|-----|------|----------|
| `agh_sandbox_admin` | super_admin | Full access, can reset sandbox |
| `agh_sandbox_analyst` | analyst | Read/write findings, run scans |
| `agh_sandbox_readonly` | user | Read-only access |

**Seed Data Engine:**
- Deterministic generation using UUID v5 (reproducible across resets)
- Realistic data: organizations, repositories, findings, users
- Consistent reset: `POST /api/sandbox/reset` drops and re-seeds

**Sandbox Endpoints:**

| Endpoint | Purpose |
|----------|---------|
| `GET /api/sandbox/keys` | List all API keys with usage examples |
| `POST /api/sandbox/reset` | Drop all data and re-seed (admin only) |
| `GET /api/sandbox/status` | Show sandbox configuration |

**Auto-Reset:**
- Configurable interval: `SANDBOX_AUTO_RESET_HOURS=24`
- Background task resets data periodically
- Prevents stale data from confusing developers

### 12.4 Docker Compose Profile

```yaml
services:
  sandbox:
    build:
      context: .
      dockerfile: Dockerfile.api
    container_name: app_sandbox
    ports:
      - "8001:8000"
    environment:
      - SANDBOX_MODE=true
      - SANDBOX_AUTO_RESET_HOURS=24
      - AUTH_REQUIRED=false
    profiles:
      - sandbox

  swagger-editor:
    image: swaggerapi/swagger-editor
    container_name: swagger_editor
    ports:
      - "8080:8080"
    profiles:
      - sandbox
```

**Start sandbox:**
```bash
make sandbox-up
# or: docker compose --profile sandbox up -d sandbox swagger-editor
```

### 12.5 Developer Landing Page

When sandbox mode is active, the root URL (`/`) serves an HTML page with:
- Links to Swagger UI, ReDoc, Swagger Editor
- All 3 API keys with copy-to-clipboard
- curl examples for each key
- SDK installation instructions
- Sandbox status (last reset, next auto-reset)

---

## Phase 13: SDK Generation

### 13.1 Pipeline

```
Running API → Export OpenAPI spec → Generate SDK → Package → Distribute

1. Export:  curl http://localhost:8001/openapi.json > openapi.json
2. Validate: spectral lint openapi.json
3. Generate: openapi-generator-cli generate -i openapi.json -g python
4. Package:  pip install ./sdks/python OR npm install ./sdks/typescript
```

### 13.2 Makefile Targets

```makefile
# Export OpenAPI spec from sandbox
sdk-export:
	curl -s http://localhost:8001/openapi.json | python -m json.tool > openapi.json
	@echo "Exported to openapi.json"

# Generate Python SDK
sdk-python:
	@echo "Exporting OpenAPI spec..."
	curl -s http://localhost:8001/openapi.json > /tmp/api-spec.json
	@echo "Generating Python SDK..."
	docker run --rm \
	  -v /tmp:/specs \
	  -v $(PWD)/sdks/python:/out \
	  openapitools/openapi-generator-cli generate \
	  -i /specs/api-spec.json \
	  -g python \
	  -o /out \
	  --additional-properties=packageName=myapp_sdk,projectName=myapp-sdk
	@echo "Python SDK generated in sdks/python/"

# Generate TypeScript SDK
sdk-typescript:
	@echo "Exporting OpenAPI spec..."
	curl -s http://localhost:8001/openapi.json > /tmp/api-spec.json
	@echo "Generating TypeScript SDK..."
	docker run --rm \
	  -v /tmp:/specs \
	  -v $(PWD)/sdks/typescript:/out \
	  openapitools/openapi-generator-cli generate \
	  -i /specs/api-spec.json \
	  -g typescript-fetch \
	  -o /out \
	  --additional-properties=npmName=@myorg/sdk,supportsES6=true
	@echo "TypeScript SDK generated in sdks/typescript/"
```

### 13.3 SDK Quality Checklist

- [ ] Generated SDK compiles without errors
- [ ] All endpoints have typed request/response objects
- [ ] Authentication methods are supported (API key, Bearer token)
- [ ] Pagination helpers included
- [ ] Error types match API error responses
- [ ] README generated with usage examples

---

## Phase 14: OpenAPI Validation & Governance

### 14.1 Spectral Linting

```bash
# Install
npm install -g @stoplight/spectral-cli

# Lint
spectral lint openapi.json

# Custom ruleset (.spectral.yml)
extends: spectral:oas
rules:
  operation-operationId: error           # Every operation needs operationId
  operation-description: warn            # Every operation should have description
  operation-tags: error                  # Every operation needs tags
  info-contact: warn                     # API spec should have contact info
  no-$ref-siblings: error               # Prevent $ref alongside other props
  oas3-valid-schema-example: warn        # Examples should match schema
```

### 14.2 Makefile Validation Target

```makefile
api-validate:
	@echo "Fetching OpenAPI spec..."
	curl -s http://localhost:8000/openapi.json > /tmp/api-spec.json
	@echo "Validating with Spectral..."
	docker run --rm -v /tmp:/specs stoplight/spectral lint /specs/api-spec.json
	@echo "Validation complete"
```

### 14.3 CI/CD Validation

```yaml
# .github/workflows/api-validate.yml
name: API Spec Validation
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start API
        run: docker compose up -d api db redis
      - name: Wait for healthy
        run: |
          until curl -sf http://localhost:8000/health; do sleep 2; done
      - name: Export and validate spec
        run: |
          curl -s http://localhost:8000/openapi.json > openapi.json
          npx @stoplight/spectral-cli lint openapi.json
      - name: Check for breaking changes
        run: |
          # Compare current spec against main branch spec
          npx oasdiff breaking openapi-main.json openapi.json
```

### 14.4 API Review Process

```
Developer proposes API change
  │
  ▼
Update OpenAPI spec (or annotated code)
  │
  ▼
Run spectral lint → fix warnings/errors
  │
  ▼
Run breaking change detection (oasdiff)
  │
  ▼
PR review by API owner / architect
  │
  ▼
Merge → CI generates updated SDK
  │
  ▼
Publish SDK to package registry
```

---

## Phase 15: Developer Portal

### 15.1 Components

| Component | URL | Purpose |
|-----------|-----|---------|
| Swagger UI | `/docs` | Interactive API explorer (Try It) |
| ReDoc | `/redoc` | Read-only API reference |
| Swagger Editor | `:8080` | Edit and preview OpenAPI spec |
| Sandbox | `:8001` | Isolated test environment |
| Landing Page | `:8001/` | Developer onboarding page |

### 15.2 Landing Page Content

```html
Developer Portal
├── Quick Start
│   ├── Get your API key
│   ├── Make your first request (curl example)
│   └── Install the SDK
├── Authentication
│   ├── API Key (for scripts/CI)
│   ├── OAuth/OIDC (for web apps)
│   └── Device Flow (for CLI tools)
├── API Reference
│   ├── Swagger UI (interactive)
│   └── ReDoc (reference)
├── SDKs
│   ├── Python: pip install myapp-sdk
│   └── TypeScript: npm install @myorg/sdk
├── Sandbox
│   ├── Pre-configured keys
│   ├── Sample data
│   └── Reset button
└── Support
    ├── API changelog
    ├── Status page
    └── Contact
```

---

## Phase 16: Contract Testing

### 16.1 What to Test

| Test Type | Tool | Purpose |
|-----------|------|---------|
| Schema validation | Spectral | Spec follows standards |
| Breaking changes | oasdiff | No unintended breaks |
| Contract compliance | Schemathesis / Dredd | Implementation matches spec |
| Integration tests | pytest / Jest | Endpoints work correctly |

### 16.2 Schemathesis (Fuzz Testing Against Spec)

```bash
# Install
pip install schemathesis

# Run against live API
schemathesis run http://localhost:8000/openapi.json \
  --header "X-API-Key: your-key" \
  --checks all \
  --stateful=links

# What it does:
# - Generates random valid inputs from schema
# - Calls every endpoint
# - Verifies response matches documented schema
# - Tests edge cases (empty strings, max lengths, special chars)
```

### 16.3 Breaking Change Detection

```bash
# Install
npm install -g oasdiff

# Compare specs
oasdiff breaking old-spec.json new-spec.json

# Output example:
# BREAKING: GET /resources response property 'name' removed
# BREAKING: POST /resources request body property 'type' changed from optional to required
```

### 16.4 CI Pipeline

```
On every PR:
  1. Start API in Docker
  2. Export OpenAPI spec
  3. Lint with Spectral
  4. Compare with main branch spec (oasdiff)
  5. Run Schemathesis fuzz tests
  6. Run integration tests
  7. Generate SDK and verify it compiles
```

---

## Phase 17: API Lifecycle Management

### 17.1 Lifecycle Stages

```
DESIGN → DEVELOP → TEST → PUBLISH → MAINTAIN → DEPRECATE → RETIRE

1. DESIGN:     Write/review OpenAPI spec
2. DEVELOP:    Implement endpoints, write tests
3. TEST:       Contract tests, integration tests, fuzz tests
4. PUBLISH:    Deploy API, publish SDKs, update docs
5. MAINTAIN:   Monitor usage, fix bugs, add features
6. DEPRECATE:  Add Sunset header, notify consumers
7. RETIRE:     Remove endpoint, clean up code
```

### 17.2 Deprecation Timeline

```
T+0:   Add Deprecation: true header
        Add Sunset: <date> header (minimum 6 months out)
        Log warnings when deprecated endpoints called
        Notify consumers via changelog and email

T+3mo: Increase logging severity to WARNING
        Begin returning deprecation notice in response body
        Update SDK to show deprecation warnings

T+6mo: Sunset date reached
        Return 410 Gone
        Remove from OpenAPI spec
        Clean up implementation code
```

### 17.3 Changelog Integration

Every API change should be reflected in CHANGELOG.md:

```markdown
## [2.1.0] - 2026-03-15

### Added
- `GET /resources/{id}/history` - Resource audit trail

### Changed
- `GET /resources` now supports `sort_by` parameter

### Deprecated
- `GET /resources?order` - Use `sort_by` instead (sunset: 2026-09-15)

### Migration
- New query parameter `sort_by` replaces `order`
- `order` parameter will be removed on 2026-09-15
```

---

## Naming Conventions

### URL Paths

| Rule | Example | Anti-Pattern |
|------|---------|-------------|
| Plural nouns for collections | `/resources` | `/resource` |
| kebab-case | `/attack-surface` | `/attackSurface`, `/attack_surface` |
| Nouns, not verbs | `/scans` | `/runScan` |
| Nested for relationships | `/repos/{id}/findings` | `/findings?repo_id=xxx` |
| No trailing slashes | `/resources` | `/resources/` |
| Lowercase only | `/api-keys` | `/API-Keys` |

### Query Parameters

| Rule | Example |
|------|---------|
| snake_case | `?page_size=50` |
| Descriptive names | `?sort_by=created_at` |
| Boolean as true/false | `?include_archived=true` |
| Dates as ISO-8601 | `?created_after=2026-01-01T00:00:00Z` |

### Request/Response Fields

| Rule | Example |
|------|---------|
| snake_case (JSON) | `{ "created_at": "...", "page_size": 50 }` |
| Consistent timestamps | ISO-8601: `"2026-02-27T15:30:00Z"` |
| UUIDs as strings | `"id": "550e8400-e29b-41d4-a716-446655440000"` |
| Booleans for flags | `"is_active": true` (not `"active": 1`) |
| Null for absent values | `"description": null` (not omitting the field) |

### HTTP Headers

| Rule | Example |
|------|---------|
| Standard headers | `Content-Type`, `Authorization` |
| Custom headers prefixed | `X-Organization-ID`, `X-Request-ID` |
| API key header | `X-API-Key` |

---

## API Design Checklist

### Every Endpoint Must Have

- [ ] HTTP method appropriate to the action (GET=read, POST=create, PUT=replace, PATCH=partial update, DELETE=remove)
- [ ] Meaningful URL path following naming conventions
- [ ] `operationId` for SDK generation
- [ ] `summary` (short, shown in Swagger UI sidebar)
- [ ] `description` (detailed, shown when expanded)
- [ ] `tags` for grouping in documentation
- [ ] Request body schema with field descriptions and examples (POST/PUT/PATCH)
- [ ] Response schema for success case with example
- [ ] Error responses using standard presets
- [ ] Authentication requirement (global default or per-endpoint override)
- [ ] Rate limit appropriate to the operation
- [ ] Pagination for list endpoints

### Every Schema Must Have

- [ ] Type annotations on all fields
- [ ] `description` on every field
- [ ] `examples` for non-obvious fields
- [ ] Validation constraints (min/max length, regex, enum values)
- [ ] Consistent naming (snake_case)
- [ ] `from_attributes = True` for ORM-backed responses

### Before Shipping

- [ ] OpenAPI spec passes Spectral linting
- [ ] No breaking changes detected (oasdiff)
- [ ] Contract tests pass (Schemathesis)
- [ ] Integration tests pass
- [ ] SDK generates and compiles
- [ ] Swagger UI works with all auth methods
- [ ] CHANGELOG updated

---

## Anti-Patterns to Avoid

### API Design

| Anti-Pattern | Why It's Bad | Do This Instead |
|-------------|-------------|-----------------|
| Verbs in URLs | `/getUsers`, `/deleteItem` | Use HTTP methods: `GET /users`, `DELETE /items/{id}` |
| Inconsistent pluralization | `/user` and `/items` | Always plural: `/users`, `/items` |
| Returning 200 for errors | `{"status": "error"}` with 200 | Use proper HTTP status codes |
| Nested URLs > 3 levels | `/orgs/{id}/repos/{id}/findings/{id}/comments` | Flatten: `/comments?finding_id=xxx` |
| Exposing internal IDs | Auto-increment integers | Use UUIDs |
| Returning different shapes | List returns array, detail returns object | Always wrap: `{"items": [...]}` and `{"data": {...}}` |
| camelCase in JSON | `{"firstName": "..."}` | snake_case: `{"first_name": "..."}` (be consistent) |

### Implementation

| Anti-Pattern | Why It's Bad | Do This Instead |
|-------------|-------------|-----------------|
| No pagination | Returns 10,000 records | Always paginate list endpoints |
| No rate limiting | Enables abuse | Rate limit all endpoints |
| `allow_origins=["*"]` with credentials | Security vulnerability | List explicit origins |
| Returning stack traces | Information disclosure | Return generic error + request ID |
| No request validation | SQL injection, XSS | Validate with Pydantic/schema |
| No health endpoint | Can't monitor | Implement `/health` with dependency checks |
| Hardcoded CORS origins | Can't deploy to multiple environments | Use environment variables |

### Documentation

| Anti-Pattern | Why It's Bad | Do This Instead |
|-------------|-------------|-----------------|
| No examples | Developers can't understand expected format | Add examples to every field |
| Missing error responses | 4xx/5xx responses undocumented | Use error response presets |
| Stale docs | Docs don't match implementation | Auto-generate from code, validate in CI |
| No changelog | Consumers don't know what changed | Maintain CHANGELOG.md |
| No SDK | Every consumer re-implements client | Generate SDKs from spec |

---

*Generated from AuditGH reference implementation. Adapt framework specifics, naming conventions, and tooling to your stack.*
