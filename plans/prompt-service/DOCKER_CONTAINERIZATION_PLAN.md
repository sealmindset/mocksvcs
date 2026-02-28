# Docker Containerization Plan: AI Prompt Management Service

> **Purpose:** Docker Compose configuration, Dockerfiles, environment management, and deployment patterns for the Prompt Management Service. Covers local development and production-ready containerization.
>
> **Phase:** 6 of 8
> **Prerequisites:** Phase 3 (API), Phase 5 (Frontend)
> **Duration:** 1-2 days
> **Reference:** Zapper `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`

---

## Table of Contents

1. [Service Architecture](#1-service-architecture)
2. [Docker Compose (Development)](#2-docker-compose-development)
3. [Dockerfiles](#3-dockerfiles)
4. [Environment Configuration](#4-environment-configuration)
5. [Development Workflow](#5-development-workflow)
6. [Production Overrides](#6-production-overrides)
7. [Health Checks](#7-health-checks)
8. [Validation Checklist](#8-validation-checklist)

---

## 1. Service Architecture

### Container Topology

```
┌─────────────────────────────────────────────────────┐
│                Docker Compose Network                │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌─────────┐  ┌──────┐│
│  │ frontend │  │ backend  │  │postgres │  │redis ││
│  │ :3000    │  │ :8000    │  │ :5432   │  │:6379 ││
│  │ Next.js  │  │ FastAPI  │  │ PG 16   │  │Redis7││
│  └──────────┘  └──────────┘  └─────────┘  └──────┘│
│       │              │            │           │     │
│       └──── prompt-network ───────┘───────────┘     │
└─────────────────────────────────────────────────────┘
```

### Port Assignments

| Service | Internal Port | External Port | Purpose |
|---------|--------------|---------------|---------|
| frontend | 3000 | 3000 | Admin UI |
| backend | 8000 | 8000 | REST API |
| postgres | 5432 | 5436 | Database (offset to avoid conflicts) |
| redis | 6379 | 6380 | Cache (offset to avoid conflicts) |

---

## 2. Docker Compose (Development)

```yaml
# docker-compose.yml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: prompt-postgres
    environment:
      POSTGRES_USER: prompt
      POSTGRES_PASSWORD: prompt_dev
      POSTGRES_DB: prompt_service
    ports:
      - "5436:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U prompt -d prompt_service"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: prompt-redis
    ports:
      - "6380:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
      target: development
    container_name: prompt-backend
    environment:
      - DATABASE_URL=postgresql+asyncpg://prompt:prompt_dev@postgres:5432/prompt_service
      - REDIS_URL=redis://redis:6379/0
      - AUTH_DISABLED=true
      - LOG_LEVEL=DEBUG
      - CORS_ORIGINS=http://localhost:3000
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      target: development
    container_name: prompt-frontend
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
    ports:
      - "3000:3000"
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/public:/app/public
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:

networks:
  default:
    name: prompt-network
```

---

## 3. Dockerfiles

### 3.1 Backend Dockerfile

```dockerfile
# backend/Dockerfile
# ─── Base ────────────────────────────────────────────
FROM python:3.12-slim AS base

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── Development ─────────────────────────────────────
FROM base AS development

# Install dev dependencies
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ─── Production ──────────────────────────────────────
FROM base AS production

COPY . .

# Run as non-root
RUN adduser --disabled-password --gecos "" appuser
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

### 3.2 Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
# ─── Base ────────────────────────────────────────────
FROM node:20-alpine AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ─── Dependencies ────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

# ─── Development ─────────────────────────────────────
FROM base AS development

COPY --from=deps /app/node_modules ./node_modules
COPY . .

CMD ["npm", "run", "dev"]

# ─── Build ───────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ─── Production ──────────────────────────────────────
FROM base AS production

RUN adduser --disabled-password --gecos "" appuser

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER appuser

ENV PORT=3000
CMD ["node", "server.js"]
```

---

## 4. Environment Configuration

### 4.1 Environment Variables

```bash
# .env.example

# ─── Database ────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://prompt:prompt_dev@localhost:5436/prompt_service

# ─── Redis ───────────────────────────────────────────
REDIS_URL=redis://localhost:6380/0

# ─── Cache ───────────────────────────────────────────
CACHE_TTL=300

# ─── Auth ────────────────────────────────────────────
AUTH_DISABLED=true
# OIDC_CLIENT_ID=
# OIDC_CLIENT_SECRET=
# OIDC_AUTHORITY=

# ─── API ─────────────────────────────────────────────
CORS_ORIGINS=http://localhost:3000
LOG_LEVEL=INFO
API_VERSION=v1

# ─── Frontend ────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### 4.2 Pydantic Settings

```python
# backend/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://prompt:prompt_dev@localhost:5436/prompt_service"

    # Redis
    redis_url: str = "redis://localhost:6380/0"

    # Cache
    cache_ttl: int = 300

    # Auth
    auth_disabled: bool = False
    oidc_client_id: str = ""
    oidc_client_secret: str = ""
    oidc_authority: str = ""

    # API
    cors_origins: str = "http://localhost:3000"
    log_level: str = "INFO"
    api_version: str = "v1"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
```

---

## 5. Development Workflow

### 5.1 First-Time Setup

```bash
# Clone and start
git clone <repo-url> prompt-service
cd prompt-service
cp .env.example .env

# Start all services
docker compose up -d

# Run migrations
docker compose exec backend alembic upgrade head

# Verify
curl http://localhost:8000/api/v1/health
open http://localhost:3000
```

### 5.2 Common Operations

| Task | Command |
|------|---------|
| Start all services | `docker compose up -d` |
| View logs | `docker compose logs -f backend` |
| Restart backend | `docker compose restart backend` |
| Run migrations | `docker compose exec backend alembic upgrade head` |
| Create migration | `docker compose exec backend alembic revision --autogenerate -m "description"` |
| Run backend tests | `docker compose exec backend pytest` |
| Stop all services | `docker compose down` |
| Clean reset | `docker compose down -v` (removes volumes) |
| Shell into backend | `docker compose exec backend bash` |
| Shell into DB | `docker compose exec postgres psql -U prompt -d prompt_service` |

### 5.3 Hot-Reload Configuration

| Service | Hot-Reload Method |
|---------|------------------|
| backend | Uvicorn `--reload` + volume mount `./backend:/app` |
| frontend | Next.js dev server + volume mount `./frontend/src:/app/src` |
| postgres | N/A (persistent volume) |
| redis | N/A (persistent volume) |

---

## 6. Production Overrides

```yaml
# docker-compose.prod.yml
version: "3.9"

services:
  backend:
    build:
      target: production
    environment:
      - AUTH_DISABLED=false
      - LOG_LEVEL=INFO
    volumes: []  # No source mount in production
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M

  frontend:
    build:
      target: production
    environment:
      - NEXT_PUBLIC_API_URL=${API_URL}
    volumes: []

  postgres:
    ports: []  # No external port in production

  redis:
    ports: []
```

**Usage:**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 7. Health Checks

### 7.1 Service Health Checks

| Service | Check | Interval | Timeout | Retries |
|---------|-------|----------|---------|---------|
| postgres | `pg_isready` | 5s | 3s | 5 |
| redis | `redis-cli ping` | 5s | 3s | 5 |
| backend | `curl /api/v1/health` | 10s | 5s | 5 |

### 7.2 Dependency Chain

```
postgres (healthy) ──→ backend (starts)
redis (healthy)    ──→ backend (starts)
backend (healthy)  ──→ frontend (starts)
```

### 7.3 Backend Health Endpoint Response

```json
{
    "status": "healthy",
    "database": "connected",
    "cache": "connected"
}
```

| status | HTTP Code | Meaning |
|--------|-----------|---------|
| healthy | 200 | All dependencies connected |
| degraded | 503 | One or more dependencies unavailable |

---

## 8. Validation Checklist

### Container Build

- [ ] `docker compose build` completes without errors
- [ ] Backend image builds both development and production targets
- [ ] Frontend image builds both development and production targets
- [ ] No secrets baked into images

### Service Startup

- [ ] `docker compose up -d` starts all 4 services
- [ ] PostgreSQL healthy within 15 seconds
- [ ] Redis healthy within 10 seconds
- [ ] Backend healthy within 30 seconds
- [ ] Frontend accessible at http://localhost:3000

### Development Workflow

- [ ] Backend hot-reload works (edit Python file → changes reflected)
- [ ] Frontend hot-reload works (edit TSX file → changes reflected)
- [ ] Alembic migrations run successfully
- [ ] `docker compose down -v` cleanly removes all volumes
- [ ] Logs accessible via `docker compose logs`

### Network & Connectivity

- [ ] Backend connects to PostgreSQL on internal network
- [ ] Backend connects to Redis on internal network
- [ ] Frontend proxies API calls to backend
- [ ] CORS configured for frontend origin
- [ ] External ports don't conflict with host services

### Production Readiness

- [ ] Production targets run as non-root user
- [ ] No source code mounted in production config
- [ ] Resource limits configured
- [ ] External database/redis ports disabled in production
- [ ] Auth enabled in production config
