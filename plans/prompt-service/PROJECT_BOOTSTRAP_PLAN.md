# Project Bootstrap Plan: AI Prompt Management Service

> **Purpose:** Repository initialization, directory scaffolding, dependency installation, and development environment setup for the Prompt Management Service.
>
> **Phase:** 1 of 8
> **Prerequisites:** None
> **Duration:** 1 day
> **Reference:** Zapper project structure, `backend/requirements.txt`, `frontend/package.json`

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [Backend Scaffolding](#2-backend-scaffolding)
3. [Frontend Scaffolding](#3-frontend-scaffolding)
4. [Dependencies](#4-dependencies)
5. [Configuration Files](#5-configuration-files)
6. [Development Environment](#6-development-environment)
7. [Validation Checklist](#7-validation-checklist)

---

## 1. Repository Structure

### Top-Level Layout

```
prompt-service/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app entry point + seed
│   │   ├── config.py               # Pydantic Settings
│   │   ├── database.py             # Async session factory
│   │   ├── cache.py                # Redis cache helpers
│   │   ├── constants.py            # Categories, types, consumer IDs
│   │   ├── defaults.py             # PROMPT_DEFAULTS + PROMPT_METADATA
│   │   ├── seed.py                 # Idempotent prompt seeding
│   │   ├── prompt_loader.py        # Sync loader (for SDK/workers)
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── base.py             # DeclarativeBase, TimestampMixin
│   │   │   ├── prompt.py           # Prompt, PromptVersion models
│   │   │   ├── api_key.py          # ApiKey model
│   │   │   └── audit_log.py        # AuditLog model
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── prompt.py           # Request/response schemas
│   │   │   ├── api_key.py          # API key schemas
│   │   │   └── common.py           # PaginatedResponse, ErrorResponse
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── prompt_service.py   # Prompt CRUD + fallback chain
│   │   │   ├── api_key_service.py  # API key management
│   │   │   └── audit_service.py    # Audit log recording
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── routes/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── prompts.py      # Prompt CRUD + versions routes
│   │   │   │   ├── api_keys.py     # API key management routes
│   │   │   │   ├── audit_log.py    # Audit log routes
│   │   │   │   └── health.py       # Health check
│   │   │   └── deps.py             # FastAPI dependencies (auth, db)
│   │   └── middleware/
│   │       ├── __init__.py
│   │       └── auth.py             # API key + OIDC auth middleware
│   ├── alembic/
│   │   ├── alembic.ini
│   │   ├── env.py
│   │   └── versions/
│   │       └── 001_initial_schema.py
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_prompt_service.py
│   │   ├── test_prompt_routes.py
│   │   └── test_cache.py
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── globals.css
│   │   │   ├── prompts/
│   │   │   │   └── page.tsx
│   │   │   ├── api-keys/
│   │   │   │   └── page.tsx
│   │   │   └── audit-log/
│   │   │       └── page.tsx
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── layout/
│   │   │   └── prompts/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── types/
│   ├── public/
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── .gitignore
├── CLAUDE.md
└── README.md
```

---

## 2. Backend Scaffolding

### 2.1 FastAPI Entry Point

```python
# backend/app/main.py
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, async_session
from app.seed import seed_prompts
from app.api.routes import prompts, api_keys, audit_log, health

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle."""
    # Startup
    logger.info("Starting Prompt Management Service")
    async with async_session() as db:
        await seed_prompts(db)
    logger.info("Seed complete")
    yield
    # Shutdown
    await engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title="AI Prompt Management Service",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(health.router, prefix="/api/v1")
app.include_router(prompts.router, prefix="/api/v1")
app.include_router(api_keys.router, prefix="/api/v1")
app.include_router(audit_log.router, prefix="/api/v1")
```

### 2.2 Database Session Factory

```python
# backend/app/database.py
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.config import settings

engine = create_async_engine(
    settings.database_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with async_session() as session:
        yield session
```

---

## 3. Frontend Scaffolding

### 3.1 Next.js Initialization

```bash
npx create-next-app@latest frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"
```

### 3.2 shadcn/ui Setup

```bash
cd frontend
npx shadcn-ui@latest init
npx shadcn-ui@latest add button input textarea badge card dialog tabs select scroll-area separator tooltip
```

### 3.3 Root Layout

```typescript
// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "AI Prompt Management",
  description: "Centralized prompt management for AI-powered applications",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
```

---

## 4. Dependencies

### 4.1 Backend Dependencies

```text
# backend/requirements.txt
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy[asyncio]==2.0.36
asyncpg==0.30.0
alembic==1.14.1
pydantic==2.10.5
pydantic-settings==2.7.1
redis==5.2.1
jinja2==3.1.5
python-json-logger==3.2.1
httpx==0.28.1
```

```text
# backend/requirements-dev.txt
pytest==8.3.4
pytest-asyncio==0.24.0
httpx==0.28.1
factory-boy==3.3.1
```

### 4.2 Frontend Dependencies

```json
{
  "dependencies": {
    "next": "15.1.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-query": "^5.62.0",
    "@tanstack/react-table": "^8.21.3",
    "react-hook-form": "^7.71.2",
    "@hookform/resolvers": "^4.1.3",
    "zod": "^4.3.6",
    "diff": "^7.0.0",
    "lucide-react": "^0.468.0",
    "sonner": "^2.0.7",
    "tailwindcss": "^3.4.17",
    "tailwindcss-animate": "^1.0.7",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.0.2"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "@types/react": "^19.0.0",
    "@types/diff": "^7.0.0",
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.2.0"
  }
}
```

---

## 5. Configuration Files

### 5.1 .gitignore

```gitignore
# Python
__pycache__/
*.py[cod]
*.egg-info/
.venv/
venv/

# Node
node_modules/
.next/
out/

# Environment
.env
.env.local
.env.production

# IDE
.vscode/
.idea/

# Docker
postgres_data/
redis_data/

# OS
.DS_Store
Thumbs.db
```

### 5.2 CLAUDE.md

```markdown
# AI Prompt Management Service

## Overview

Standalone microservice for centralized AI prompt management. Provides CRUD operations, version history, Redis caching, Jinja2 template rendering, and an admin web UI.

## Tech Stack

- **Backend:** FastAPI + SQLAlchemy 2.0 + asyncpg + PostgreSQL 16 + Redis 7
- **Frontend:** Next.js 15 + React 19 + shadcn/ui + TanStack Query
- **Container:** Docker Compose

## Key Patterns

- **Three-tier fallback:** Redis cache (5min TTL) → PostgreSQL → hardcoded defaults
- **Immutable versioning:** Every update creates a PromptVersion snapshot
- **Slug-based identification:** Immutable slugs for stable cross-service references
- **Soft-delete only:** is_active=False, never physical delete
- **Category derivation:** Computed from slug prefix at read-time

## Development

```bash
docker compose up -d
docker compose exec backend alembic upgrade head
# API: http://localhost:8000/docs
# UI:  http://localhost:3000
```

## Conventions

- Python: async/await everywhere, no blocking I/O in routes
- SQL: ORM-only, no raw SQL with user input
- API: REST, /api/v1/ prefix, Pydantic validation
- Frontend: Server state via TanStack Query, client state via useState
- Auth: API key header (X-API-Key), 3 roles: admin/editor/viewer
```

---

## 6. Development Environment

### 6.1 Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Docker | 24+ | Container runtime |
| Docker Compose | 2.20+ | Multi-service orchestration |
| Python | 3.12+ | Backend development (optional, for IDE) |
| Node.js | 20+ | Frontend development (optional, for IDE) |

### 6.2 Quick Start

```bash
# 1. Clone repository
git clone <repo-url> prompt-service
cd prompt-service

# 2. Copy environment
cp .env.example .env

# 3. Start services
docker compose up -d

# 4. Run migrations
docker compose exec backend alembic upgrade head

# 5. Verify
curl http://localhost:8000/api/v1/health
# → {"status":"healthy","database":"connected","cache":"connected"}

# 6. Open admin UI
open http://localhost:3000
```

### 6.3 IDE Setup (Optional)

For IDE autocompletion and linting:

```bash
# Backend (Python venv)
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

# Frontend (Node)
cd frontend
npm install
```

---

## 7. Validation Checklist

### Repository

- [ ] Git repository initialized with `.gitignore`
- [ ] `CLAUDE.md` created with project conventions
- [ ] `.env.example` with all configuration variables
- [ ] `README.md` with quick start instructions

### Backend

- [ ] `backend/` directory structure matches plan
- [ ] `requirements.txt` installs without errors
- [ ] `app/main.py` runs with `uvicorn app.main:app`
- [ ] All `__init__.py` files created
- [ ] Alembic initialized with `alembic.ini` and `env.py`

### Frontend

- [ ] `frontend/` created with Next.js 15 scaffold
- [ ] shadcn/ui components installed
- [ ] `npm run dev` starts without errors
- [ ] TypeScript strict mode enabled

### Docker

- [ ] `docker-compose.yml` defines all 4 services
- [ ] `docker compose up -d` starts successfully
- [ ] `docker compose exec backend alembic upgrade head` runs migrations
- [ ] Health check passes: `curl http://localhost:8000/api/v1/health`
- [ ] Frontend accessible at http://localhost:3000
