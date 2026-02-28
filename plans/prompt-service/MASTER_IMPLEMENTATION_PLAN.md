# Master Implementation Plan: AI Prompt Management Service

> **Purpose:** Complete, ordered implementation guide for building a standalone AI Prompt Management microservice. Based on the Zapper (Pulse) prompt management subsystem, extracted and enhanced as an independent service with its own database, cache, API, and admin UI.
>
> **Audience:** Engineering teams building centralized prompt management for AI-powered applications using FastAPI + Next.js + PostgreSQL + Redis.
>
> **Reference Implementation:** Zapper `/backend/app/services/prompt_service.py`, `/backend/app/models/base.py` (Prompt/PromptVersion), `/frontend/src/app/(dashboard)/admin/prompts/`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Implementation Phases](#2-implementation-phases)
3. [Plan Index](#3-plan-index)
4. [Phase Execution Order](#4-phase-execution-order)
5. [Cross-Cutting Concerns](#5-cross-cutting-concerns)
6. [Customization Guide](#6-customization-guide)
7. [Validation Checkpoints](#7-validation-checkpoints)
8. [Appendix: Zapper Prompt Subsystem Reference](#appendix-zapper-prompt-subsystem-reference)

---

## 1. Architecture Overview

### Target Architecture

```
                    ┌─────────────────────────────────────────┐
                    │         Consuming Services / Agents      │
                    │   (Any AI-powered app needing prompts)   │
                    └────────────┬──────────┬──────────────────┘
                                 │ REST API │ SDK Client
                    ┌────────────▼──────────▼──────────────────┐
                    │        Load Balancer / Reverse Proxy      │
                    │           (Nginx / Traefik / ALB)         │
                    └────────────┬──────────┬──────────────────┘
                                 │          │
                    ┌────────────▼──┐  ┌────▼────────────┐
                    │  Admin UI     │  │  Prompt API      │
                    │  Next.js      │  │  FastAPI          │
                    │  :3000        │  │  :8000            │
                    └───────────────┘  └──┬─────────┬─────┘
                                          │         │
                              ┌───────────▼──┐  ┌───▼───────────┐
                              │  PostgreSQL  │  │  Redis         │
                              │  :5432       │  │  :6379         │
                              │  Prompts,    │  │  Prompt Cache, │
                              │  Versions,   │  │  Rate Limiting │
                              │  Audit Log   │  │  (TTL: 5min)   │
                              └──────────────┘  └────────────────┘
```

### Three-Tier Prompt Retrieval (Core Pattern)

```
Consumer Request: GET /api/v1/prompts/by-slug/{slug}
                          │
                    ┌─────▼──────┐
                    │ Redis Cache │─── HIT ──→ Return cached content
                    │ prompt:{slug}│
                    └─────┬──────┘
                          │ MISS
                    ┌─────▼──────┐
                    │ PostgreSQL │─── FOUND ──→ Cache & return
                    │ prompts    │
                    └─────┬──────┘
                          │ NOT FOUND
                    ┌─────▼──────┐
                    │ Hardcoded  │─── FOUND ──→ Return default
                    │ Defaults   │
                    └─────┬──────┘
                          │ NOT FOUND
                       404 Error
```

### Reference Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| **API Framework** | FastAPI | 0.115+ | Async HTTP, OpenAPI auto-gen |
| **Web Server** | Uvicorn | 0.34+ | ASGI server |
| **ORM** | SQLAlchemy | 2.0+ | Async + type hints |
| **DB Driver** | asyncpg | 0.30+ | PostgreSQL async |
| **Database** | PostgreSQL | 16+ | Primary data store |
| **Cache** | Redis | 7+ | Prompt caching (TTL-based) |
| **Migrations** | Alembic | 1.14+ | Schema versioning |
| **Validation** | Pydantic | 2.10+ | Request/response schemas |
| **Config** | Pydantic Settings | 2.7+ | Environment variable management |
| **Logging** | python-json-logger | 3.2+ | Structured JSON logs |
| **Template Engine** | Jinja2 | 3.1+ | Prompt variable rendering |
| **HTTP Client** | httpx | 0.28+ | Async HTTP for SDK |
| **Frontend** | Next.js | 15+ | React 19, App Router |
| **UI Library** | shadcn/ui | Latest | Radix + Tailwind |
| **Data Fetching** | TanStack Query | 5.x | Server state sync |
| **Tables** | TanStack Table | 8.x | Data grid for prompt list |
| **Forms** | React Hook Form | 7.x | Form state management |
| **Validation (FE)** | Zod | 4.x | Client-side schema |
| **Styling** | Tailwind CSS | 3.4+ | Utility-first CSS |
| **Diff** | diff (npm) | Latest | Version comparison |
| **Container** | Docker + Compose | Latest | Local dev + deployment |

### Domain Customization Points

| Placeholder | Description | Prompt Service Example |
|------------|-------------|----------------------|
| `{PROJECT_NAME}` | Project name | PromptVault |
| `{DOMAIN_MODELS}` | Core domain entities | Prompt, PromptVersion, AuditLog |
| `{DOMAIN_ROUTERS}` | API endpoint groups | prompts, versions, admin, health |
| `{DOMAIN_SERVICES}` | Business logic modules | prompt_service, cache_service, seed_service |
| `{CONSUMER_TYPES}` | Consuming service identifiers | orchestrator, triager, reporter, custom |
| `{PROMPT_CATEGORIES}` | Prompt classification | system, template, instruction, tooling |
| `{ROLE_HIERARCHY}` | RBAC roles | admin, editor, viewer |
| `{CACHE_TTL}` | Redis cache duration | 300 seconds (5 minutes) |
| `{DEFAULT_PROMPTS}` | Seed prompts for initialization | Project-specific defaults dict |

---

## 2. Implementation Phases

### Phase Map

```
Phase 1:  PROJECT BOOTSTRAP ──────────────────────────────── Day 1
          Repo init, scaffolding, tooling, dev environment
          └── Reference: PROJECT_BOOTSTRAP_PLAN.md

Phase 2:  DATABASE FOUNDATION ─────────────────────────────── Day 1-2
          Schema design, models, migrations, seeds
          └── Reference: DATABASE_DESIGN_PLAN.md

Phase 3:  API SKELETON + SERVICE LAYER ────────────────────── Day 2-4
          FastAPI setup, CRUD routes, prompt service,
          Redis caching, fallback chain, Jinja2 rendering
          └── Reference: API_FIRST_IMPLEMENTATION_PLAN.md

Phase 4:  AUTHENTICATION & AUTHORIZATION ──────────────────── Day 4-5
          API key auth for services, optional OIDC for UI,
          RBAC (admin/editor/viewer)
          └── Reference: AUTH_IMPLEMENTATION_PLAN.md

Phase 5:  FRONTEND ADMIN UI ──────────────────────────────── Day 5-8
          Next.js prompt editor, version history,
          version diff, search/filter, category browser
          └── Reference: FRONTEND_IMPLEMENTATION_PLAN.md

Phase 6:  DOCKER & DEPLOYMENT ─────────────────────────────── Day 8-9
          Dockerfiles, docker-compose, environment config,
          health checks, production readiness
          └── Reference: DOCKER_CONTAINERIZATION_PLAN.md

Phase 7:  SDK CLIENT LIBRARY ──────────────────────────────── Day 9-10
          Python client package for consuming services,
          sync/async retrieval, local caching
          └── Reference: SDK_CLIENT_PLAN.md

Phase 8:  TESTING & HARDENING ─────────────────────────────── Day 10-12
          Unit tests, integration tests, API tests,
          load testing, security review
          └── Reference: TESTING_STRATEGY_PLAN.md
```

### Phase Dependencies

```
Phase 1 (Bootstrap) ────→ Phase 2 (Database)
                                │
                                ├──→ Phase 3 (API + Service Layer)
                                │         │
                                │         ├──→ Phase 4 (Auth)
                                │         │         │
                                │         │         ├──→ Phase 5 (Frontend)
                                │         │         │
                                │         │         └──→ Phase 7 (SDK Client)
                                │         │
                                │         └──→ Phase 6 (Docker)
                                │
                                └──→ Phase 8 (Testing) [parallel with 5-7]
```

---

## 3. Plan Index

| Plan Document | Phase | Duration | Description |
|--------------|-------|----------|-------------|
| [PROJECT_BOOTSTRAP_PLAN.md](PROJECT_BOOTSTRAP_PLAN.md) | 1 | 1 day | Repository scaffolding, dependencies, dev environment |
| [DATABASE_DESIGN_PLAN.md](DATABASE_DESIGN_PLAN.md) | 2 | 1-2 days | PostgreSQL schema, SQLAlchemy models, Alembic migrations, seed data |
| [API_FIRST_IMPLEMENTATION_PLAN.md](API_FIRST_IMPLEMENTATION_PLAN.md) | 3 | 2-3 days | FastAPI routes, service layer, Redis caching, fallback chain |
| [AUTH_IMPLEMENTATION_PLAN.md](AUTH_IMPLEMENTATION_PLAN.md) | 4 | 1-2 days | API key auth, optional OIDC, RBAC middleware |
| [FRONTEND_IMPLEMENTATION_PLAN.md](FRONTEND_IMPLEMENTATION_PLAN.md) | 5 | 3-4 days | Next.js admin UI with prompt editor, versioning, diffs |
| [DOCKER_CONTAINERIZATION_PLAN.md](DOCKER_CONTAINERIZATION_PLAN.md) | 6 | 1-2 days | Docker Compose, Dockerfiles, environment configuration |
| [SDK_CLIENT_PLAN.md](SDK_CLIENT_PLAN.md) | 7 | 1-2 days | Python SDK for consuming services |
| [TESTING_STRATEGY_PLAN.md](TESTING_STRATEGY_PLAN.md) | 8 | 2-3 days | Test suite, CI pipeline, load testing |

---

## 4. Phase Execution Order

### Phase 1: Project Bootstrap (Day 1)

**Goal:** Repository initialized with directory structure, dependencies, and dev tooling.

**Deliverables:**
- [ ] Git repository initialized with `.gitignore`
- [ ] Backend directory: `backend/` with FastAPI scaffold
- [ ] Frontend directory: `frontend/` with Next.js 15 scaffold
- [ ] `docker-compose.yml` with PostgreSQL 16 + Redis 7
- [ ] `backend/requirements.txt` with pinned dependencies
- [ ] `frontend/package.json` with dependencies
- [ ] `CLAUDE.md` with project conventions
- [ ] `.env.example` with all configuration variables

### Phase 2: Database Foundation (Day 1-2)

**Goal:** PostgreSQL schema with Prompt, PromptVersion, User, ApiKey, and AuditLog tables.

**Deliverables:**
- [ ] SQLAlchemy models for all entities
- [ ] Alembic migration for initial schema
- [ ] Seed script for default prompts
- [ ] Database connection pooling (async)

### Phase 3: API + Service Layer (Day 2-4)

**Goal:** Complete REST API with CRUD, versioning, caching, and fallback chain.

**Deliverables:**
- [ ] Prompt CRUD endpoints (POST, GET, PUT, DELETE)
- [ ] Version history endpoints (list, get specific, restore)
- [ ] Slug-based lookup with three-tier fallback
- [ ] Redis caching (5-min TTL, invalidate on write)
- [ ] Jinja2 template variable rendering
- [ ] Pagination, filtering, search
- [ ] Health check endpoint
- [ ] OpenAPI spec auto-generated

### Phase 4: Authentication & Authorization (Day 4-5)

**Goal:** Secure API access via API keys (service-to-service) and optional OIDC (admin UI).

**Deliverables:**
- [ ] API key generation and validation
- [ ] RBAC middleware (admin, editor, viewer)
- [ ] Optional OIDC integration for browser-based auth
- [ ] Audit logging for all write operations

### Phase 5: Frontend Admin UI (Day 5-8)

**Goal:** Full-featured prompt management interface.

**Deliverables:**
- [ ] Three-column layout: [Filter/List] [Editor] [History/Diff]
- [ ] Prompt list with search, category tabs, type/consumer filters
- [ ] Prompt editor with monospace textarea and metadata display
- [ ] Template variable extraction and display
- [ ] Version history panel with restore capability
- [ ] Side-by-side version diff viewer
- [ ] Create, duplicate, save, and soft-delete operations

### Phase 6: Docker & Deployment (Day 8-9)

**Goal:** Production-ready containerization.

**Deliverables:**
- [ ] Multi-stage Dockerfiles (backend, frontend)
- [ ] docker-compose.yml (dev) with all services
- [ ] docker-compose.prod.yml overrides
- [ ] Health check configuration
- [ ] Volume mounts for development hot-reload

### Phase 7: SDK Client Library (Day 9-10)

**Goal:** Python package for consuming services to retrieve prompts.

**Deliverables:**
- [ ] `promptvault-client` Python package
- [ ] Sync and async retrieval methods
- [ ] Local fallback cache
- [ ] Jinja2 variable rendering on client side
- [ ] Connection pooling and retry logic

### Phase 8: Testing & Hardening (Day 10-12)

**Goal:** Comprehensive test coverage and production readiness.

**Deliverables:**
- [ ] Backend unit tests (services, models, schemas)
- [ ] API integration tests (routes, auth, pagination)
- [ ] Frontend component tests (Vitest + RTL)
- [ ] E2E tests (Playwright)
- [ ] Load testing (prompt retrieval under concurrency)
- [ ] Security review (OWASP top 10)

---

## 5. Cross-Cutting Concerns

### 5.1 Versioning Strategy

| Aspect | Strategy |
|--------|----------|
| **API Version** | `/api/v1/` prefix, versioned in URL |
| **Prompt Version** | Auto-incrementing integer per prompt |
| **Schema Version** | Alembic migrations with sequential revisions |
| **App Version** | Semantic versioning in `pyproject.toml` / `package.json` |

### 5.2 Audit Logging

Every write operation (create, update, delete, restore) generates an audit log entry:

```python
{
    "action": "prompt.updated",
    "resource_type": "prompt",
    "resource_id": "uuid",
    "user_id": "user-email-or-api-key-name",
    "changes": {"content": {"old": "...", "new": "..."}},
    "timestamp": "2026-02-28T12:00:00Z"
}
```

### 5.3 Error Handling

Standard JSON error format across all endpoints:

```json
{"detail": "Prompt with slug 'my-prompt' not found"}
```

| Status Code | Usage |
|-------------|-------|
| 400 | Validation errors (Pydantic) |
| 401 | Missing or invalid API key / token |
| 403 | Insufficient role permissions |
| 404 | Resource not found |
| 409 | Duplicate slug on create |
| 422 | Request body validation failure |
| 500 | Internal server error (generic message) |

### 5.4 Structured Logging

All logs emitted as JSON for aggregation:

```json
{
    "timestamp": "2026-02-28T12:00:00Z",
    "level": "INFO",
    "service": "prompt-service",
    "message": "Prompt updated",
    "prompt_slug": "ai-triage-assessment",
    "version": 3,
    "user": "admin@company.com"
}
```

### 5.5 Performance Targets

| Metric | Target |
|--------|--------|
| Prompt retrieval (cache hit) | < 5ms |
| Prompt retrieval (cache miss) | < 50ms |
| Prompt list (50 items) | < 100ms |
| Version history load | < 100ms |
| Cache hit ratio (steady state) | > 95% |
| API availability | 99.9% |

### 5.6 Security Boundaries

| Boundary | Protection |
|----------|-----------|
| API input | Pydantic validation with max_length constraints |
| SQL | ORM-only queries, no raw SQL with user input |
| Template rendering | Jinja2 sandboxed environment |
| API keys | SHA-256 hashed, never stored in plaintext |
| CORS | Explicit origin allowlist, no wildcards |
| Rate limiting | Redis-based per-API-key throttling |

---

## 6. Customization Guide

### Adapting for Your Project

1. **Define your prompt categories** — Replace `{PROMPT_CATEGORIES}` with categories meaningful to your domain (e.g., `["analysis", "generation", "classification", "extraction"]`)

2. **Define your consumers** — Replace `{CONSUMER_TYPES}` with the services/agents that will consume prompts (e.g., `["data-pipeline", "chatbot", "summarizer", "classifier"]`)

3. **Define your prompt types** — The default types (`system`, `instruction`, `tooling`, `template`) cover most use cases. Add domain-specific types if needed.

4. **Create seed defaults** — Build a `PROMPT_DEFAULTS` dictionary mapping slug → content for prompts that should exist on first startup.

5. **Configure RBAC** — Adjust role hierarchy to match your organization's needs.

### Category Derivation Convention

Slugs follow the pattern `{category}-{function}`:

```
ai-triage-assessment    → category: "ai"
writeup-poc             → category: "writeup"
report-executive        → category: "report"
system-welcome          → category: "system"
```

The category is derived at read-time from the slug prefix — no storage needed.

---

## 7. Validation Checkpoints

### Checkpoint 1: Infrastructure Ready (After Phase 1-2)

- [ ] `docker compose up` starts PostgreSQL + Redis
- [ ] Alembic migration creates all tables
- [ ] Seed script populates default prompts
- [ ] Database connection verified via health check

### Checkpoint 2: API Functional (After Phase 3-4)

- [ ] All CRUD operations work via curl/httpie
- [ ] Version history created on every update
- [ ] Restore creates new version (not destructive)
- [ ] Redis cache populated on read, invalidated on write
- [ ] Fallback chain works: cache → DB → defaults
- [ ] Jinja2 variables render correctly
- [ ] API key authentication working
- [ ] OpenAPI docs accessible at `/docs`

### Checkpoint 3: UI Complete (After Phase 5)

- [ ] Prompt list loads with filtering and search
- [ ] Prompt editor saves and creates new versions
- [ ] Version history shows all versions
- [ ] Version diff highlights changes
- [ ] Restore from history works
- [ ] Create and duplicate prompts works
- [ ] Soft-delete (deactivate) works

### Checkpoint 4: Production Ready (After Phase 6-8)

- [ ] Docker images build successfully
- [ ] All services start via docker-compose
- [ ] Health checks pass
- [ ] Test suite passes (>80% coverage)
- [ ] SDK client retrieves prompts from running service
- [ ] No OWASP top 10 vulnerabilities

---

## Appendix: Zapper Prompt Subsystem Reference

### Source Files (Zapper Repository)

| Component | File Path |
|-----------|-----------|
| **Models** | `backend/app/models/base.py` (Prompt, PromptVersion) |
| **Schemas** | `backend/app/schemas/prompt.py` |
| **Routes** | `backend/app/api/routes/prompts.py` |
| **Service** | `backend/app/services/prompt_service.py` |
| **Sync Loader** | `backend/app/ai/prompt_loader.py` |
| **Defaults** | `backend/app/ai/defaults.py` (PROMPT_DEFAULTS dict) |
| **Constants** | `backend/app/ai/constants.py` (AGENT_IDS, CATEGORIES) |
| **Seeding** | `backend/app/main.py` (_seed_prompts function) |
| **Frontend Types** | `frontend/src/types/prompt.ts` |
| **Frontend Hooks** | `frontend/src/hooks/use-prompts.ts` |
| **Prompt List** | `frontend/src/components/prompts/prompt-list.tsx` |
| **Prompt Editor** | `frontend/src/components/prompts/prompt-editor.tsx` |
| **Version History** | `frontend/src/components/prompts/version-history.tsx` |
| **Version Diff** | `frontend/src/components/prompts/version-diff.tsx` |
| **Admin Page** | `frontend/src/app/(dashboard)/admin/prompts/page.tsx` |

### Key Patterns Extracted

1. **Slug-based identification** — Immutable slug for stable references across deployments
2. **Immutable version history** — Every update creates a PromptVersion snapshot; history is never deleted
3. **Restore = new version** — Restoring a historical version creates a NEW version with that content
4. **Three-tier fallback** — Redis (5min TTL) → PostgreSQL → hardcoded defaults
5. **Soft-delete only** — `is_active=False`, data is never physically deleted
6. **Category derivation** — Computed from slug prefix at read-time, not stored
7. **Jinja2 template variables** — `{{ variable }}` syntax in prompt content, rendered at retrieval time
8. **Dual context support** — Async service for FastAPI routes, sync loader for background workers
9. **Seed on startup** — Default prompts seeded idempotently on application boot
10. **API ID pattern** — Sequential BigInteger for efficient cursor-based pagination alongside UUID PKs
