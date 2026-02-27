# Phase 5: Docker & Containerization Implementation Plan

**Template for containerizing full-stack web applications with Docker and Docker Compose.**
**Reference implementation: AuditGH (3 Dockerfiles: api, ui, scanner; docker-compose with 7 services)**

---

## Table of Contents

1. [Overview & Principles](#1-overview--principles)
2. [Dockerfile Patterns](#2-dockerfile-patterns)
3. [Docker Compose for Local Development](#3-docker-compose-for-local-development)
4. [Development Mode Configuration](#4-development-mode-configuration)
5. [Production Optimizations](#5-production-optimizations)
6. [Health Check Patterns](#6-health-check-patterns)
7. [Common Gotchas & Troubleshooting](#7-common-gotchas--troubleshooting)
8. [Makefile Integration](#8-makefile-integration)
9. [Validation Checklist](#9-validation-checklist)

---

## Domain Customization Placeholders

Throughout this plan, replace these placeholders with your project-specific values:

| Placeholder | Description | AuditGH Example |
|------------|-------------|-----------------|
| `{PROJECT_NAME}` | Project name (lowercase, no spaces) | `auditgh` |
| `{PROJECT_SLUG}` | Docker container prefix | `auditgh` |
| `{API_FRAMEWORK}` | Backend framework | FastAPI |
| `{API_PORT}` | Backend API port | `8000` |
| `{UI_FRAMEWORK}` | Frontend framework | Next.js |
| `{UI_PORT}` | Frontend UI port | `3000` |
| `{PYTHON_VERSION}` | Python version for API | `3.12` |
| `{NODE_VERSION}` | Node.js version for UI | `20` |
| `{POSTGRES_VERSION}` | PostgreSQL version | `16` |
| `{REDIS_VERSION}` | Redis version | `7` |
| `{DB_NAME}` | Default database name | `security_portal` |
| `{API_ENTRYPOINT}` | Uvicorn app path | `src.api.main:app` |
| `{UI_SOURCE_DIR}` | Path to UI source | `src/web-ui` |
| `{DOMAIN_WORKER}` | Domain-specific worker/tool container | `scanner` |
| `{DOMAIN_WORKER_TOOLS}` | System-level tools for worker | Gitleaks, Trivy, Semgrep |
| `{WORKER_ENTRYPOINT}` | Worker container entrypoint | `scripts/scanning/scan_repos.py` |
| `{GITHUB_ORG}` | GitHub org for private repos | `sleepnumber` |

---

## 1. Overview & Principles

### Container Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Docker Compose Network                        │
│                                                                     │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────┐ │
│  │  {UI}         │  │  {API}        │  │  {DOMAIN_WORKER}        │ │
│  │  Next.js      │  │  FastAPI      │  │  Python + System Tools  │ │
│  │  :3000        │──│  :8000        │──│  (on-demand)            │ │
│  │  Dockerfile.ui│  │  Dockerfile.  │  │  Dockerfile.            │ │
│  │               │  │  api          │  │  {worker}               │ │
│  └───────────────┘  └──────┬────────┘  └─────────┬───────────────┘ │
│                            │                     │                  │
│           ┌────────────────┼─────────────────────┘                  │
│           │                │                                        │
│  ┌────────▼───────┐  ┌────▼──────────┐  ┌─────────────────────────┐│
│  │  PostgreSQL    │  │  Redis        │  │  Supporting Services    ││
│  │  :5432         │  │  :6379        │  │  Mock OIDC  :3007       ││
│  │  Named Volume  │  │  Named Volume │  │  MailHog    :8025       ││
│  │                │  │               │  │  Session Cleanup (cron) ││
│  └────────────────┘  └───────────────┘  └─────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### Guiding Principles

| Principle | Description |
|-----------|-------------|
| **Multi-stage builds** | Separate build-time dependencies from runtime; keep images small |
| **Layer caching** | Copy dependency manifests first, then source code, to maximize cache hits |
| **Non-root execution** | Run containers as non-root users in production |
| **Health checks everywhere** | Every service defines a health check; use `depends_on: condition: service_healthy` |
| **Environment parity** | Dev and prod use the same Dockerfiles; behavior changes via environment variables |
| **Minimal base images** | Use `-slim` (Debian) or `-alpine` variants; never use full base images |
| **Named volumes** | Persist data (Postgres, Redis) and caches (npm, pip) across container restarts |
| **.dockerignore** | Exclude `.git`, `node_modules`, `__pycache__`, `.env` from build context |

### File Structure

```
{PROJECT_NAME}/
├── Dockerfile.api                 # Python/FastAPI backend
├── Dockerfile.ui                  # Next.js frontend (multi-stage)
├── Dockerfile.{worker}            # Domain-specific tool container
├── docker-compose.yml             # Full local development stack
├── docker-compose.override.yml    # Dev-mode volume mounts & hot reload (optional)
├── .dockerignore                  # Build context exclusions
├── .env                           # Environment variables (git-ignored)
├── .env.example                   # Template for .env (committed)
└── Makefile                       # Developer workflow shortcuts
```

---

## 2. Dockerfile Patterns

### 2.1 Python/FastAPI API — Multi-Stage Build

**File: `Dockerfile.api`**

```dockerfile
# =============================================================================
# Stage 1: Builder — install dependencies in a clean layer
# =============================================================================
FROM python:{PYTHON_VERSION}-slim AS builder

WORKDIR /app

# Install system dependencies needed for building Python packages
# libpq-dev: PostgreSQL client library (for psycopg2)
# gcc: C compiler (for native extensions)
# python3-dev: Python headers (for native extensions)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    python3-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifest FIRST (layer caching optimization)
# This layer is only rebuilt when requirements.txt changes
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# =============================================================================
# Stage 2: Runtime — minimal image with only runtime dependencies
# =============================================================================
FROM python:{PYTHON_VERSION}-slim AS runtime

WORKDIR /app

# Install only runtime system dependencies (no gcc, no dev headers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Create non-root user for production
RUN groupadd --system --gid 1001 appgroup && \
    useradd --system --uid 1001 --gid appgroup appuser

# Copy application source code
# IMPORTANT: Copy each directory explicitly to avoid missing modules
COPY src/ /app/src/
COPY models/ /app/models/
COPY alembic/ /app/alembic/
COPY alembic.ini /app/alembic.ini

# Set Python path so imports resolve correctly
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Switch to non-root user
USER appuser

# Expose the API port
EXPOSE {API_PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD curl -f http://localhost:{API_PORT}/health || exit 1

# Default command: production mode (no --reload)
CMD ["uvicorn", "{API_ENTRYPOINT}", "--host", "0.0.0.0", "--port", "{API_PORT}"]
```

> **AuditGH note:** The production Dockerfile.api uses a single stage for simplicity since the scanner container is the heavy one. Multi-stage is shown here as the recommended pattern for new projects.

#### Simplified Single-Stage (AuditGH Actual Pattern)

For projects where the API image is not the bottleneck and simplicity is preferred:

```dockerfile
FROM python:{PYTHON_VERSION}-slim

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY src/ /app/src/
COPY models/ /app/models/

ENV PYTHONPATH=/app

CMD ["uvicorn", "{API_ENTRYPOINT}", "--host", "0.0.0.0", "--port", "{API_PORT}"]
```

---

### 2.2 Next.js Frontend — Three-Stage Build

**File: `Dockerfile.ui`**

```dockerfile
# =============================================================================
# Stage 1: Dependencies — install node_modules
# =============================================================================
FROM node:{NODE_VERSION}-alpine AS deps
WORKDIR /app

# Copy package manifest FIRST (layer caching optimization)
# Only rebuilt when package.json or lock file changes
COPY {UI_SOURCE_DIR}/package.json {UI_SOURCE_DIR}/package-lock.json* ./
RUN npm ci

# =============================================================================
# Stage 2: Builder — build the Next.js application
# =============================================================================
FROM node:{NODE_VERSION}-alpine AS builder
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy full UI source
COPY {UI_SOURCE_DIR} .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time environment variables (baked into the JS bundle)
# These MUST be set at build time for NEXT_PUBLIC_ vars
ARG NEXT_PUBLIC_API_URL=http://localhost:{API_PORT}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build

# =============================================================================
# Stage 3: Runner — minimal production image
# =============================================================================
FROM node:{NODE_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Create .next directory with correct permissions for prerender cache
RUN mkdir .next && chown nextjs:nodejs .next

# Copy standalone output (requires `output: 'standalone'` in next.config.js)
# This dramatically reduces image size by including only needed node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE {UI_PORT}

ENV PORT={UI_PORT}
ENV HOSTNAME="0.0.0.0"

# Standalone mode: Next.js generates a minimal server.js
CMD ["node", "server.js"]
```

> **IMPORTANT:** For standalone output to work, add this to `next.config.js`:
> ```js
> /** @type {import('next').NextConfig} */
> const nextConfig = {
>   output: 'standalone',
> }
> module.exports = nextConfig
> ```

---

### 2.3 Domain Tool Container (e.g., Scanner/Worker)

**File: `Dockerfile.{worker}`**

This pattern is for containers that need system-level tools (Go binaries, Java JRE, Ruby gems, etc.) alongside your Python application.

```dockerfile
FROM python:{PYTHON_VERSION}-slim

# Architecture-aware builds: Docker sets TARGETARCH automatically
# Values: amd64, arm64
ARG TARGETARCH

# =============================================================================
# System Dependencies — the "kitchen sink" for domain tools
# =============================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    npm \
    openjdk-21-jre-headless \
    ruby \
    ruby-dev \
    build-essential \
    wget \
    curl \
    unzip \
    ca-certificates \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Architecture-Aware Tool Installation
# =============================================================================

# Go runtime (needed for Go-based security tools)
RUN echo "Installing Go for ${TARGETARCH}..." && \
    curl -Lk https://go.dev/dl/go1.21.5.linux-${TARGETARCH}.tar.gz -o go.tar.gz && \
    tar -C /usr/local -xzf go.tar.gz && \
    rm go.tar.gz
ENV PATH="${PATH}:/usr/local/go/bin:/root/go/bin"
ENV GOPATH="/root/go"

# Architecture-aware binary download pattern:
# Different release naming conventions per project
# - Some use: linux_amd64 / linux_arm64
# - Some use: Linux-64bit / Linux-ARM64
# - Some use: x86_64 / arm64
# Always check the release page for the exact naming

# Example: Tool with standard naming (amd64/arm64)
RUN echo "Installing {TOOL_NAME} for ${TARGETARCH}..." && \
    curl -sSfLk https://github.com/{ORG}/{TOOL}/releases/download/v{VERSION}/{TOOL}_{VERSION}_linux_${TARGETARCH}.tar.gz -o tool.tar.gz && \
    tar -xzf tool.tar.gz && \
    mv {TOOL} /usr/local/bin/ && \
    rm tool.tar.gz

# Example: Tool with non-standard naming (x64/arm64)
RUN ARCH_TAG="x64"; \
    if [ "$TARGETARCH" = "arm64" ]; then ARCH_TAG="arm64"; fi; \
    echo "Installing {TOOL_NAME} for ${ARCH_TAG}..." && \
    curl -sSfLk https://github.com/{ORG}/{TOOL}/releases/download/v{VERSION}/{TOOL}_{VERSION}_linux_${ARCH_TAG}.tar.gz -o tool.tar.gz && \
    tar -xzf tool.tar.gz && \
    mv {TOOL} /usr/local/bin/ && \
    rm tool.tar.gz

# Example: Tool only available on amd64 (graceful skip on arm64)
RUN if [ "$(uname -m)" = "x86_64" ]; then \
        echo "Installing {AMD64_ONLY_TOOL}..." && \
        wget -q https://example.com/{TOOL}_linux64.zip -O /tmp/tool.zip && \
        unzip -q /tmp/tool.zip -d /opt/{TOOL} && \
        rm /tmp/tool.zip && \
        ln -s /opt/{TOOL}/{TOOL} /usr/local/bin/{TOOL}; \
    else \
        echo "Skipping {AMD64_ONLY_TOOL} on non-x86_64 architecture"; \
    fi

# =============================================================================
# Isolated Python Tool Environments (avoid dependency conflicts)
# =============================================================================
# When your container needs multiple Python tools that have conflicting
# dependencies, install each in its own venv and symlink the binary

RUN python -m venv /opt/venv/{tool_a} && \
    /opt/venv/{tool_a}/bin/pip install --no-cache-dir {tool_a} && \
    ln -s /opt/venv/{tool_a}/bin/{tool_a} /usr/local/bin/{tool_a}

RUN python -m venv /opt/venv/{tool_b} && \
    /opt/venv/{tool_b}/bin/pip install --no-cache-dir {tool_b} && \
    ln -s /opt/venv/{tool_b}/bin/{tool_b} /usr/local/bin/{tool_b}

# =============================================================================
# Private Repository Access (build arg, not baked into image layers)
# =============================================================================
ARG GITHUB_TOKEN
RUN git config --global credential.helper store && \
    echo "https://${GITHUB_TOKEN}:x-oauth-basic@github.com" > /root/.git-credentials && \
    chmod 600 /root/.git-credentials

# =============================================================================
# Application Dependencies
# =============================================================================
WORKDIR /app

# Copy requirements first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code LAST (changes most frequently)
COPY . .

# Persistent volume for output artifacts
VOLUME ["/app/{output_dir}"]

ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["python", "{WORKER_ENTRYPOINT}"]
```

---

### 2.4 .dockerignore

**File: `.dockerignore`**

```dockerignore
# =============================================================================
# .dockerignore — Reduce build context and prevent leaking secrets
# =============================================================================

# Version control
.git
.gitignore

# Dependencies (rebuilt inside container)
node_modules
__pycache__
*.pyc
*.pyo
.venv
venv
env

# IDE and editor files
.vscode
.idea
*.swp
*.swo
*~

# Environment and secrets (NEVER include in image)
.env
.env.*
!.env.example
*.pem
*.key
credentials.json

# Build artifacts
.next
dist
build
*.egg-info

# Docker files (prevent recursive context)
Dockerfile*
docker-compose*
.dockerignore

# Documentation
*.md
docs/
LICENSE

# Tests (not needed in production image)
tests/
test/
*.test.js
*.test.ts
*.spec.js
*.spec.ts
pytest.ini
.pytest_cache
.coverage
htmlcov

# CI/CD
.github
.gitlab-ci.yml
Jenkinsfile

# OS files
.DS_Store
Thumbs.db

# Terraform / IaC
terraform/
*.tfstate*
.terraform

# Logs and reports
*.log
vulnerability_reports/
```

> **Why this matters:** Without a `.dockerignore`, Docker sends your entire project directory as the build context. A `.git` directory alone can be 100MB+, making builds slow and potentially leaking sensitive data into image layers.

---

### 2.5 Layer Caching Optimization

The most important caching principle: **copy files that change least frequently first**.

```
Optimal layer order (top = changes least, bottom = changes most):

┌──────────────────────────────────────┐
│  FROM base-image                     │  ← Almost never changes
├──────────────────────────────────────┤
│  RUN apt-get install system-deps     │  ← Changes rarely
├──────────────────────────────────────┤
│  COPY requirements.txt / package.json│  ← Changes occasionally
│  RUN pip install / npm ci            │  ← Cached unless manifest changes
├──────────────────────────────────────┤
│  COPY src/ /app/src/                 │  ← Changes frequently
├──────────────────────────────────────┤
│  CMD [...]                           │  ← Almost never changes
└──────────────────────────────────────┘
```

**Anti-pattern (busts cache on every code change):**
```dockerfile
# BAD: Copies everything, then installs deps
# Every code change invalidates the pip install cache
COPY . /app
RUN pip install -r requirements.txt
```

**Correct pattern (deps cached separately):**
```dockerfile
# GOOD: Dependencies cached independently from source code
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ /app/src/
```

---

### 2.6 Security: Non-Root User

**Python container:**
```dockerfile
# Create a system user (no home directory, no login shell)
RUN groupadd --system --gid 1001 appgroup && \
    useradd --system --uid 1001 --gid appgroup --no-create-home appuser

# If the app needs to write to specific directories, set ownership before switching
RUN mkdir -p /app/data && chown appuser:appgroup /app/data

USER appuser
```

**Node.js container (Alpine):**
```dockerfile
# Alpine uses addgroup/adduser (not groupadd/useradd)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

USER nextjs
```

---

### 2.7 Corporate Proxy / Zscaler SSL Certificate Injection

Corporate environments using SSL inspection (Zscaler, Netskaler, BlueCoat) will cause SSL certificate verification failures during `apt-get`, `pip install`, `npm install`, `curl`, and Go tool downloads.

**Pattern: Inject corporate CA certificate at build time**

```dockerfile
# Accept the certificate as a build argument (base64-encoded or file path)
ARG CORPORATE_CA_CERT=""

# Install the corporate CA certificate if provided
RUN if [ -n "$CORPORATE_CA_CERT" ]; then \
        echo "$CORPORATE_CA_CERT" > /usr/local/share/ca-certificates/corporate-ca.crt && \
        update-ca-certificates; \
    fi

# For Python (pip/requests):
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

# For Node.js:
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# For Go:
ENV SSL_CERT_DIR=/etc/ssl/certs
```

**Alternative: Copy certificate file directly**

```dockerfile
# Copy the cert from the build context
COPY certs/zscaler-root-ca.pem /usr/local/share/ca-certificates/zscaler-root-ca.crt
RUN update-ca-certificates
```

**Quick workaround (NOT recommended for production, but useful for debugging):**

```dockerfile
# Disable SSL verification (INSECURE — debug only)
ENV PIP_TRUSTED_HOST="pypi.org pypi.python.org files.pythonhosted.org"
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
# curl uses -k flag: curl -sSfLk https://...
```

**Build command with proxy cert:**
```bash
docker build \
    --build-arg CORPORATE_CA_CERT="$(cat /path/to/zscaler-root-ca.pem)" \
    -f Dockerfile.api \
    -t {PROJECT_SLUG}_api .
```

---

### 2.8 Build Arguments

```dockerfile
# Build-time secrets (NOT persisted in image layers with BuildKit)
ARG GITHUB_TOKEN
ARG CORPORATE_CA_CERT=""

# Build-time configuration
ARG TARGETARCH          # Set automatically by Docker BuildKit (amd64, arm64)
ARG PYTHON_VERSION=3.12
ARG NODE_ENV=production
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Passing build args:**
```bash
# Via docker build
docker build \
    --build-arg GITHUB_TOKEN=${GITHUB_TOKEN} \
    --build-arg NEXT_PUBLIC_API_URL=https://api.{PROJECT_NAME}.com \
    -f Dockerfile.ui -t {PROJECT_SLUG}_ui .

# Via docker-compose.yml
services:
  scanner:
    build:
      context: .
      dockerfile: Dockerfile.{worker}
      args:
        - GITHUB_TOKEN=${GITHUB_TOKEN}
```

> **Security note:** Build args passed with `--build-arg` are visible in `docker history`. For sensitive values, use BuildKit secrets: `--secret id=github_token,src=.github_token`. In the Dockerfile, access via `RUN --mount=type=secret,id=github_token cat /run/secrets/github_token`.

---

## 3. Docker Compose for Local Development

### 3.1 Complete docker-compose.yml

**File: `docker-compose.yml`**

```yaml
# =============================================================================
# {PROJECT_NAME} — Docker Compose for Local Development
# =============================================================================
# Usage:
#   docker compose up -d            # Start core services
#   docker compose --profile dev up # Start with dev tools (mock OIDC, MailHog)
#   docker compose --profile scan up {DOMAIN_WORKER}  # Run domain worker
#
# Required: Copy .env.example to .env and fill in values
# =============================================================================

services:
  # ===========================================================================
  # API Service — FastAPI Backend
  # ===========================================================================
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    container_name: {PROJECT_SLUG}_api
    ports:
      - "{API_PORT}:{API_PORT}"
    env_file:
      - .env
    environment:
      # Database connection (override host to use Docker service name)
      - POSTGRES_HOST=db
      - POSTGRES_PORT=${POSTGRES_PORT:-5432}
      - POSTGRES_USER=${POSTGRES_USER:-postgres}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
      - POSTGRES_DB=${POSTGRES_DB:-{DB_NAME}}
      # Redis connection
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_URL=redis://redis:6379/0
      # Application secrets
      - SECRETS_MASTER_KEY=${SECRETS_MASTER_KEY:-{PROJECT_SLUG}_dev_secrets_key_32ch}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY:-dev-jwt-secret-change-in-production}
      # OIDC / Auth (empty defaults = disabled)
      - OIDC_PROVIDER_NAME=${OIDC_PROVIDER_NAME:-}
      - OIDC_CLIENT_ID=${OIDC_CLIENT_ID:-}
      - OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET:-}
      - OIDC_DISCOVERY_URL=${OIDC_DISCOVERY_URL:-}
      - OIDC_EXTERNAL_BASE_URL=${OIDC_EXTERNAL_BASE_URL:-}
      # Email (defaults to MailHog in dev)
      - SMTP_HOST=${SMTP_HOST:-mailhog}
      - SMTP_PORT=${SMTP_PORT:-1025}
      - SMTP_USER=${SMTP_USER:-}
      - SMTP_PASSWORD=${SMTP_PASSWORD:-}
      - SMTP_FROM=${SMTP_FROM:-noreply@{PROJECT_NAME}.local}
      - SMTP_USE_TLS=${SMTP_USE_TLS:-false}
      - SMTP_USE_SSL=${SMTP_USE_SSL:-false}
      # Frontend URL (for CORS, email links, redirects)
      - APP_URL=${APP_URL:-http://localhost:{UI_PORT}}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:{API_PORT}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped

  # ===========================================================================
  # Web UI Service — Next.js Frontend
  # ===========================================================================
  web-ui:
    build:
      context: .
      dockerfile: Dockerfile.ui
      target: runner
      args:
        - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:{API_PORT}}
    container_name: {PROJECT_SLUG}_ui
    ports:
      - "{UI_PORT}:{UI_PORT}"
    environment:
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:{API_PORT}}
      - NODE_ENV=production
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

  # ===========================================================================
  # PostgreSQL Database
  # ===========================================================================
  db:
    image: postgres:{POSTGRES_VERSION}-alpine
    container_name: {PROJECT_SLUG}_db
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-postgres}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
      - POSTGRES_DB=${POSTGRES_DB:-{DB_NAME}}
      - POSTGRES_MAX_CONNECTIONS=200
    volumes:
      - postgres-data:/var/lib/postgresql/data
      # Optional: mount init scripts for first-run setup
      # - ./scripts/db/init.sql:/docker-entrypoint-initdb.d/01-init.sql
    ports:
      - "5432:5432"
    command:
      - "postgres"
      - "-c"
      - "max_connections=200"
      - "-c"
      - "shared_buffers=256MB"
      - "-c"
      - "log_statement=all"          # Enable for dev debugging
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # ===========================================================================
  # Redis — Caching, Sessions, Rate Limiting
  # ===========================================================================
  redis:
    image: redis:{REDIS_VERSION}-alpine
    container_name: {PROJECT_SLUG}_redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: >
      redis-server
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
    restart: unless-stopped

  # ===========================================================================
  # Session Cleanup — Periodic job using same API image
  # ===========================================================================
  session-cleanup:
    build:
      context: .
      dockerfile: Dockerfile.api
    container_name: {PROJECT_SLUG}_session_cleanup
    command: python -m src.auth.cleanup
    depends_on:
      - redis
    env_file:
      - .env
    environment:
      - REDIS_URL=redis://redis:6379/0
    restart: unless-stopped

  # ===========================================================================
  # {DOMAIN_WORKER} — Domain-Specific Worker (on-demand via profile)
  # ===========================================================================
  {DOMAIN_WORKER}:
    build:
      context: .
      dockerfile: Dockerfile.{DOMAIN_WORKER}
      args:
        - GITHUB_TOKEN=${GITHUB_TOKEN}
    container_name: {PROJECT_SLUG}_{DOMAIN_WORKER}
    env_file:
      - .env
    environment:
      - POSTGRES_HOST=db
      - POSTGRES_PORT=${POSTGRES_PORT:-5432}
      - POSTGRES_USER=${POSTGRES_USER:-postgres}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
      - POSTGRES_DB=${POSTGRES_DB:-{DB_NAME}}
    volumes:
      # Cache volumes for tools that download databases/rules
      - {DOMAIN_WORKER}-cache-a:/root/.cache/{tool_a}
      - {DOMAIN_WORKER}-cache-b:/root/.cache/{tool_b}
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '1'
          memory: 2G
    command: >
      --org ${GITHUB_ORG}
      --report-dir /app/{output_dir}
      --max-workers 4
      --loglevel INFO
    depends_on:
      db:
        condition: service_started
    profiles:
      - scan    # Only started explicitly: docker compose --profile scan up {DOMAIN_WORKER}

  # ===========================================================================
  # Mock OIDC Provider — Local auth without real IdP (dev profile)
  # ===========================================================================
  mock-oidc:
    image: ghcr.io/navikt/mock-oauth2-server:2.1.10
    container_name: {PROJECT_SLUG}_mock_oidc
    ports:
      - "3007:3007"
    environment:
      - SERVER_PORT=3007
      - JSON_CONFIG={
          "interactiveLogin":true,
          "httpServer":"NettyWrapper",
          "tokenCallbacks":[{
            "issuerId":"mock",
            "tokenExpiry":3600,
            "requestMappings":[{
              "requestParam":"scope",
              "match":"openid",
              "claims":{
                "sub":"test-user",
                "email":"dev@{PROJECT_NAME}.local",
                "name":"Dev User",
                "groups":["admin"]
              }
            }]
          }]
        }
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3007/mock/.well-known/openid-configuration"]
      interval: 10s
      timeout: 5s
      retries: 3
    profiles:
      - dev

  # ===========================================================================
  # MailHog — Email testing (captures all outbound email)
  # ===========================================================================
  mailhog:
    image: mailhog/mailhog:latest
    container_name: {PROJECT_SLUG}_mailhog
    ports:
      - "1025:1025"    # SMTP server (point your app here)
      - "8025:8025"    # Web UI (view captured emails)
    profiles:
      - dev

# =============================================================================
# Named Volumes
# =============================================================================
volumes:
  postgres-data:          # PostgreSQL data (persistent across restarts)
  redis-data:             # Redis AOF persistence
  {DOMAIN_WORKER}-cache-a:  # Tool A database/rules cache
  {DOMAIN_WORKER}-cache-b:  # Tool B database/rules cache

# =============================================================================
# Networks (optional — Docker Compose creates a default network)
# =============================================================================
# Uncomment if you need explicit network control or multiple compose stacks
# networks:
#   {PROJECT_SLUG}-network:
#     driver: bridge
#     name: {PROJECT_SLUG}-network
```

---

### 3.2 Environment Variable Template

**File: `.env.example`**

```bash
# =============================================================================
# {PROJECT_NAME} — Environment Variables
# =============================================================================
# Copy this file to .env and fill in values:
#   cp .env.example .env
#
# NEVER commit .env to version control
# =============================================================================

# --- Database ---
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB={DB_NAME}
POSTGRES_PORT=5432

# --- Redis ---
REDIS_URL=redis://redis:6379/0

# --- Application ---
SECRETS_MASTER_KEY={PROJECT_SLUG}_dev_secrets_key_32chars
JWT_SECRET_KEY=dev-jwt-secret-change-in-production
APP_URL=http://localhost:{UI_PORT}

# --- Frontend ---
NEXT_PUBLIC_API_URL=http://localhost:{API_PORT}

# --- OIDC Authentication ---
# Leave empty to disable OIDC; fill in for SSO
OIDC_PROVIDER_NAME=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_DISCOVERY_URL=
OIDC_EXTERNAL_BASE_URL=

# For mock OIDC (make dev-up):
# OIDC_PROVIDER_NAME=mock-oidc
# OIDC_CLIENT_ID=mock-client
# OIDC_CLIENT_SECRET=mock-secret
# OIDC_DISCOVERY_URL=http://mock-oidc:3007/mock/.well-known/openid-configuration
# OIDC_EXTERNAL_BASE_URL=http://localhost:3007

# --- Email ---
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@{PROJECT_NAME}.local
SMTP_USE_TLS=false
SMTP_USE_SSL=false

# --- Domain-Specific ---
GITHUB_TOKEN=
GITHUB_ORG=
# GITHUB_API=https://api.github.com        # or GitHub Enterprise URL

# --- AI / LLM (if applicable) ---
# ANTHROPIC_MODEL=claude-sonnet-4-20250514
# AZURE_AI_FOUNDRY_ENDPOINT=
# AZURE_AI_FOUNDRY_API_KEY=
```

---

### 3.3 Service Dependency Graph

```
                                ┌──────────────┐
                                │   web-ui     │
                                │   :3000      │
                                └──────┬───────┘
                                       │ depends_on (healthy)
                                ┌──────▼───────┐
                ┌───────────────│     api      │───────────────┐
                │               │   :8000      │               │
                │               └──────────────┘               │
                │ depends_on (healthy)          depends_on (healthy)
         ┌──────▼───────┐                          ┌───────▼──────┐
         │     db       │                          │    redis     │
         │   :5432      │                          │   :6379      │
         └──────────────┘                          └──────────────┘

Profiles (started separately):
  --profile dev:   mock-oidc (:3007), mailhog (:1025/:8025)
  --profile scan:  {DOMAIN_WORKER}
```

Key rules:
- **`service_healthy`**: Service must pass its health check before dependents start
- **`service_started`**: Service container is running (does not wait for health check)
- **`service_completed_successfully`**: Service ran and exited with code 0 (for init containers)

---

## 4. Development Mode Configuration

### 4.1 Docker Compose Override for Hot Reload

**File: `docker-compose.override.yml`**

This file is automatically merged with `docker-compose.yml` when you run `docker compose up`. Use it for dev-only settings.

```yaml
# =============================================================================
# Development overrides — hot reload, debug settings
# =============================================================================
# This file is automatically loaded by `docker compose up`
# To skip it: docker compose -f docker-compose.yml up
# =============================================================================

services:
  # ---------------------------------------------------------------------------
  # API: Mount source code + enable Uvicorn hot reload
  # ---------------------------------------------------------------------------
  api:
    volumes:
      # Mount source directory for hot reload (changes reflect immediately)
      - ./src:/app/src
      - ./models:/app/models
      - ./alembic:/app/alembic
      - ./scripts:/app/scripts
    command: >
      uvicorn {API_ENTRYPOINT}
      --host 0.0.0.0
      --port {API_PORT}
      --reload
      --reload-dir /app/src
      --log-level debug
    environment:
      - LOG_LEVEL=DEBUG
      - PYTHONDONTWRITEBYTECODE=1

  # ---------------------------------------------------------------------------
  # UI: Mount source + Next.js dev server with fast refresh
  # ---------------------------------------------------------------------------
  web-ui:
    build:
      target: deps    # Use deps stage (has node_modules but no build)
    volumes:
      - ./{UI_SOURCE_DIR}/src:/app/src
      - ./{UI_SOURCE_DIR}/public:/app/public
      - ./{UI_SOURCE_DIR}/app:/app/app
      # Do NOT mount node_modules (use the container's copy)
      # This prevents platform-incompatible native modules
    command: npm run dev
    environment:
      - NODE_ENV=development
      - NEXT_PUBLIC_API_URL=http://localhost:{API_PORT}

  # ---------------------------------------------------------------------------
  # Database: Enable verbose logging in dev
  # ---------------------------------------------------------------------------
  db:
    command:
      - "postgres"
      - "-c"
      - "max_connections=200"
      - "-c"
      - "shared_buffers=256MB"
      - "-c"
      - "log_statement=all"
      - "-c"
      - "log_duration=on"
      - "-c"
      - "log_min_duration_statement=0"
```

---

### 4.2 Database Initialization on First Run

PostgreSQL automatically runs `.sql` and `.sh` files in `/docker-entrypoint-initdb.d/` on first startup (when the data volume is empty).

**File: `scripts/db/init.sql`**

```sql
-- =============================================================================
-- Database initialization script (runs only on first container start)
-- =============================================================================

-- Create additional databases if needed
-- CREATE DATABASE {DB_NAME}_test;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create application schema
-- (Prefer Alembic migrations over raw SQL for schema management)
```

Mount in `docker-compose.yml`:
```yaml
db:
  volumes:
    - postgres-data:/var/lib/postgresql/data
    - ./scripts/db/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
```

---

### 4.3 Database Migrations on Startup

Rather than running migrations inside the init script, run them after the API starts or as a one-shot command:

```bash
# Option A: Run migrations via Makefile
make db-migrate

# Option B: Add a migration sidecar in docker-compose.yml
services:
  db-migrate:
    build:
      context: .
      dockerfile: Dockerfile.api
    command: alembic upgrade head
    environment:
      - POSTGRES_HOST=db
      - POSTGRES_USER=${POSTGRES_USER:-postgres}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
      - POSTGRES_DB=${POSTGRES_DB:-{DB_NAME}}
    depends_on:
      db:
        condition: service_healthy
    profiles:
      - init    # Run with: docker compose --profile init up db-migrate
```

---

### 4.4 Seed Data Loading

```bash
# Via Makefile target (recommended)
make db-seed

# Which runs:
docker exec {PROJECT_SLUG}_api python -m scripts.seed

# Or as a compose profile:
services:
  db-seed:
    build:
      context: .
      dockerfile: Dockerfile.api
    command: python -m scripts.seed
    depends_on:
      db:
        condition: service_healthy
    profiles:
      - init
```

**Example seed script: `scripts/seed.py`**

```python
"""
Seed the database with initial/demo data.
Idempotent: safe to run multiple times.
"""
import asyncio
from src.database import get_async_session
from src.models import User, Role  # adjust to your models

async def seed():
    async with get_async_session() as session:
        # Check if already seeded
        existing = await session.execute(
            select(User).where(User.email == "admin@{PROJECT_NAME}.local")
        )
        if existing.scalar():
            print("Database already seeded, skipping.")
            return

        # Create default admin user
        admin = User(
            email="admin@{PROJECT_NAME}.local",
            name="Admin User",
            role=Role.ADMIN,
        )
        session.add(admin)
        await session.commit()
        print("Seed data loaded successfully.")

if __name__ == "__main__":
    asyncio.run(seed())
```

---

## 5. Production Optimizations

### 5.1 Image Size Targets

| Service | Base Image | Target Size | Key Technique |
|---------|-----------|-------------|---------------|
| API (FastAPI) | `python:3.12-slim` | < 200 MB | Multi-stage, no dev deps |
| UI (Next.js) | `node:20-alpine` | < 300 MB | Standalone output, 3-stage |
| Database | `postgres:16-alpine` | ~80 MB (stock) | Use official Alpine variant |
| Redis | `redis:7-alpine` | ~30 MB (stock) | Use official Alpine variant |
| Worker | `python:3.12-slim` | 500 MB - 2 GB | System tools unavoidable |

Check image sizes:
```bash
docker images | grep {PROJECT_SLUG}
```

### 5.2 Minimal Runtime Images

```dockerfile
# Multi-stage: builder has gcc, dev headers; runtime does not
FROM python:3.12-slim AS builder
RUN apt-get update && apt-get install -y gcc python3-dev libpq-dev
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim AS runtime
# Only the runtime C library for PostgreSQL, no compiler
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /install /usr/local
COPY src/ /app/src/
```

### 5.3 Read-Only Filesystem

```yaml
# docker-compose.yml (production)
services:
  api:
    read_only: true
    tmpfs:
      - /tmp            # Allow writes to /tmp
      - /app/.cache     # Allow writes to cache directory
    volumes:
      - api-logs:/app/logs  # Persist logs
```

### 5.4 Resource Limits

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '2'       # Max 2 CPU cores
          memory: 4G      # Max 4 GB RAM (OOM-killed if exceeded)
        reservations:
          cpus: '0.5'     # Guaranteed 0.5 CPU cores
          memory: 512M    # Guaranteed 512 MB RAM

  db:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.25'
          memory: 256M

  redis:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.1'
          memory: 64M
```

### 5.5 Logging Configuration

```yaml
services:
  api:
    logging:
      driver: json-file
      options:
        max-size: "10m"       # Max 10 MB per log file
        max-file: "3"         # Keep 3 rotated files
        tag: "{PROJECT_SLUG}_api"

  # For production on AWS, use awslogs driver:
  # logging:
  #   driver: awslogs
  #   options:
  #     awslogs-group: /ecs/{PROJECT_NAME}/api
  #     awslogs-region: us-east-1
  #     awslogs-stream-prefix: api
```

### 5.6 Container Security Scanning

Run these in CI before deploying:

```bash
# Trivy — vulnerability scanning
docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    aquasec/trivy:latest image {PROJECT_SLUG}_api:latest

# Dockle — Dockerfile best practices
docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    goodwithtech/dockle:latest {PROJECT_SLUG}_api:latest

# Hadolint — Dockerfile linting (run against source, not image)
docker run --rm -i hadolint/hadolint < Dockerfile.api
```

**GitHub Actions integration:**
```yaml
- name: Scan API image with Trivy
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: '{PROJECT_SLUG}_api:latest'
    format: 'sarif'
    output: 'trivy-results.sarif'
    severity: 'CRITICAL,HIGH'
```

---

## 6. Health Check Patterns

### 6.1 Health Check Reference Table

| Service | Check Type | Command | Interval | Timeout | Retries | Start Period |
|---------|-----------|---------|----------|---------|---------|--------------|
| API (FastAPI) | HTTP GET | `curl -f http://localhost:{API_PORT}/health` | 30s | 10s | 3 | 40s |
| PostgreSQL | pg_isready | `pg_isready -U postgres` | 10s | 5s | 5 | 0s |
| Redis | redis-cli | `redis-cli ping` | 10s | 3s | 3 | 0s |
| Next.js UI | HTTP GET | `curl -f http://localhost:{UI_PORT}` | 30s | 10s | 3 | 30s |
| Mock OIDC | HTTP GET | `curl -f http://localhost:3007/mock/.well-known/openid-configuration` | 10s | 5s | 3 | 5s |
| Worker | Custom | Depends on worker type | 60s | 30s | 3 | 120s |

### 6.2 Docker Compose Health Checks

```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:{API_PORT}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  db:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
```

### 6.3 API Health Endpoint Implementation

**FastAPI (`src/api/health.py`):**
```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

router = APIRouter(tags=["health"])

@router.get("/health")
async def health_check(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """
    Health check endpoint for container orchestration.

    Returns:
      - 200: All dependencies healthy
      - 503: One or more dependencies unhealthy
    """
    checks = {}

    # Database check
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "healthy"
    except Exception as e:
        checks["database"] = f"unhealthy: {e}"

    # Redis check
    try:
        await redis.ping()
        checks["redis"] = "healthy"
    except Exception as e:
        checks["redis"] = f"unhealthy: {e}"

    all_healthy = all(v == "healthy" for v in checks.values())

    return JSONResponse(
        status_code=200 if all_healthy else 503,
        content={
            "status": "healthy" if all_healthy else "unhealthy",
            "checks": checks,
            "version": settings.APP_VERSION,
        },
    )
```

### 6.4 Startup, Liveness, and Readiness Concepts

These concepts map from Kubernetes to Docker Compose:

| Concept | Kubernetes Probe | Docker Compose Equivalent | Purpose |
|---------|-----------------|--------------------------|---------|
| **Startup** | `startupProbe` | `start_period` in healthcheck | Grace period for slow-starting containers |
| **Liveness** | `livenessProbe` | `healthcheck` (ongoing) | "Is the process alive?" — restart if failing |
| **Readiness** | `readinessProbe` | `depends_on: condition: service_healthy` | "Can it accept traffic?" — route traffic only when ready |

In Docker Compose, a single `healthcheck` serves all three purposes:
- `start_period`: How long to wait before counting failures (startup)
- `interval` + `retries`: Ongoing liveness check
- `depends_on: condition: service_healthy`: Readiness gate for dependent services

---

## 7. Common Gotchas & Troubleshooting

### 7.1 Google Fonts Failing in Docker Build (Next.js)

**Symptom:**
```
error - Failed to download `Inter` from Google Fonts.
FetchError: request to https://fonts.googleapis.com/... failed, reason: unable to get local issuer certificate
```

**Cause:** Google Fonts are downloaded at build time. Behind a corporate proxy (Zscaler), SSL fails. Even without a proxy, the Docker build environment may not have network access.

**Solution:** Use `next/font/local` instead of `next/font/google`:

```typescript
// BEFORE (fails in Docker behind proxy):
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'] })

// AFTER (works everywhere):
import localFont from 'next/font/local'
const inter = localFont({
  src: [
    { path: '../fonts/Inter-Regular.woff2', weight: '400' },
    { path: '../fonts/Inter-Bold.woff2', weight: '700' },
  ],
})
```

Download the font files and commit them to your repo under `public/fonts/` or `src/fonts/`.

---

### 7.2 SSL Errors Behind Corporate Proxy (Zscaler)

**Symptom (various forms):**
```
pip: SSLCertVerificationError: certificate verify failed: unable to get local issuer certificate
npm: UNABLE_TO_GET_ISSUER_CERT_LOCALLY
curl: SSL certificate problem: unable to get local issuer certificate
go get: x509: certificate signed by unknown authority
apt-get: Certificate verification failed
```

**Solution:** Inject the corporate CA certificate into the container at build time. See [Section 2.7](#27-corporate-proxy--zscaler-ssl-certificate-injection) for the full pattern.

**Quick diagnostic:**
```bash
# Find your Zscaler certificate on macOS:
security find-certificate -a -p /Library/Keychains/System.keychain | \
    openssl x509 -noout -subject 2>/dev/null | grep -i zscaler

# Export it:
security find-certificate -a -p /Library/Keychains/System.keychain | \
    awk '/BEGIN/,/END/' > zscaler-ca.pem

# Pass to Docker build:
docker build --build-arg CORPORATE_CA_CERT="$(cat zscaler-ca.pem)" .
```

---

### 7.3 ModuleNotFoundError (Missing COPY)

**Symptom:**
```
ModuleNotFoundError: No module named 'models'
ModuleNotFoundError: No module named 'config'
```

**Cause:** You `COPY src/ /app/src/` but forgot to copy other directories your code imports from.

**Solution:** Explicitly copy every directory your application imports:

```dockerfile
# List ALL directories your Python code imports from
COPY src/ /app/src/
COPY models/ /app/models/
COPY config/ /app/config/
COPY scripts/ /app/scripts/
COPY alembic/ /app/alembic/
COPY alembic.ini /app/alembic.ini
```

**Diagnostic:**
```bash
# Find all imports in your source code:
grep -rh "^from \|^import " src/ | sort -u

# Compare against COPY directives in Dockerfile
```

---

### 7.4 Permission Denied on Volume Mounts

**Symptom:**
```
PermissionError: [Errno 13] Permission denied: '/app/data/output.json'
```

**Cause:** Container runs as non-root user (UID 1001) but the volume mount is owned by root.

**Solution:**
```dockerfile
# Create the directory and set ownership BEFORE switching to non-root
RUN mkdir -p /app/data && chown appuser:appgroup /app/data
USER appuser
```

For bind mounts (dev mode), ensure your host user's UID matches the container user:
```yaml
# docker-compose.override.yml
services:
  api:
    user: "${UID:-1000}:${GID:-1000}"
```

---

### 7.5 Container Dependency Ordering

**Symptom:** API starts before database is ready, crashes with "connection refused."

**Wrong:**
```yaml
depends_on:
  - db    # Only waits for container to START, not be READY
```

**Correct:**
```yaml
depends_on:
  db:
    condition: service_healthy    # Waits for health check to pass
  redis:
    condition: service_healthy
```

> The `condition: service_healthy` option requires the depended-upon service to have a `healthcheck` defined. Without it, Docker Compose cannot determine when the service is truly ready.

---

### 7.6 Port Conflicts

**Symptom:**
```
Error response from daemon: driver failed programming external connectivity:
Bind for 0.0.0.0:5432 failed: port is already allocated
```

**Cause:** A local service (PostgreSQL, Redis) is already running on the host and occupying the port.

**Solution — remap the host port:**
```yaml
ports:
  - "5433:5432"    # Host:Container — use 5433 on host, 5432 inside container
```

**Solution — stop the conflicting local service:**
```bash
# macOS (Homebrew)
brew services stop postgresql
brew services stop redis

# Linux (systemd)
sudo systemctl stop postgresql
sudo systemctl stop redis
```

**Find what is using a port:**
```bash
lsof -i :5432
# or
ss -tlnp | grep 5432
```

---

### 7.7 Build Context Too Large

**Symptom:**
```
Sending build context to Docker daemon  2.15GB
```

**Cause:** No `.dockerignore` file, or it is missing key exclusions like `.git`, `node_modules`, or large data directories.

**Solution:** Add a comprehensive `.dockerignore` (see [Section 2.4](#24-dockerignore)).

**Diagnostic:**
```bash
# Check what Docker would send as build context:
du -sh --exclude='.git' .
# Compare with:
du -sh .git node_modules __pycache__ .next
```

---

### 7.8 Next.js Standalone Mode Not Working

**Symptom:**
```
COPY --from=builder /app/.next/standalone ./
# Error: no such file or directory
```

**Cause:** `next.config.js` does not have `output: 'standalone'`.

**Solution:**
```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // ... other config
}
module.exports = nextConfig
```

---

### 7.9 ARM64 / Apple Silicon Issues

**Symptom:** Binary tools fail to execute with `exec format error`.

**Cause:** Tool binary was downloaded for `amd64` but running on `arm64` (Apple Silicon Mac, AWS Graviton).

**Solution:** Use `TARGETARCH` build arg (set automatically by BuildKit):

```dockerfile
ARG TARGETARCH
RUN curl -L https://example.com/tool_linux_${TARGETARCH}.tar.gz | tar xz
```

**For tools without ARM64 builds:**
```dockerfile
RUN if [ "$(uname -m)" = "x86_64" ]; then \
        echo "Installing amd64-only tool..."; \
        # install here
    else \
        echo "Skipping tool (not available for ARM64)"; \
    fi
```

---

## 8. Makefile Integration

**File: `Makefile`**

```makefile
# =============================================================================
# {PROJECT_NAME} — Developer Workflow Makefile
# =============================================================================
# Usage: make <target>
# Run `make help` to see all available targets
# =============================================================================

.PHONY: help dev-up dev-down dev-logs dev-rebuild dev-ps \
        db-migrate db-seed db-reset \
        shell-api shell-db shell-redis \
        build test lint clean \
        scan-up scan-down scan-logs

# Default target
.DEFAULT_GOAL := help

# Project config
PROJECT_SLUG := {PROJECT_SLUG}
API_CONTAINER := $(PROJECT_SLUG)_api
DB_CONTAINER := $(PROJECT_SLUG)_db
REDIS_CONTAINER := $(PROJECT_SLUG)_redis
UI_CONTAINER := $(PROJECT_SLUG)_ui

# =============================================================================
# Help
# =============================================================================

## Show this help message
help:
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## /  /' | sort
	@echo ""

# =============================================================================
# Development Lifecycle
# =============================================================================

## Start all dev services (API, UI, DB, Redis, mock OIDC, MailHog)
dev-up:
	docker compose --profile dev up -d mock-oidc mailhog
	@echo "Waiting for mock OIDC to become healthy..."
	@sleep 3
	docker compose up -d api web-ui redis db session-cleanup
	@echo ""
	@echo "======================================"
	@echo "  {PROJECT_NAME} Dev Environment"
	@echo "======================================"
	@echo "  API:        http://localhost:{API_PORT}"
	@echo "  UI:         http://localhost:{UI_PORT}"
	@echo "  Mock OIDC:  http://localhost:3007"
	@echo "  MailHog:    http://localhost:8025"
	@echo "  Postgres:   localhost:5432"
	@echo "  Redis:      localhost:6379"
	@echo "======================================"
	@echo ""

## Stop all dev services
dev-down:
	docker compose --profile dev down

## Stop all services and remove volumes (DESTROYS DATA)
dev-nuke:
	docker compose --profile dev --profile scan down -v
	@echo "All containers stopped and volumes removed."

## Tail logs for all services
dev-logs:
	docker compose logs -f

## Tail logs for API only
dev-logs-api:
	docker compose logs -f api

## Rebuild and restart all services (force recreate)
dev-rebuild:
	docker compose up -d --build --force-recreate

## Rebuild a single service (usage: make dev-rebuild-svc SVC=api)
dev-rebuild-svc:
	docker compose up -d --build --force-recreate $(SVC)

## Show running containers and health status
dev-ps:
	docker compose ps

## Show resource usage (CPU, memory)
dev-stats:
	docker stats --no-stream $(API_CONTAINER) $(UI_CONTAINER) $(DB_CONTAINER) $(REDIS_CONTAINER)

# =============================================================================
# Database Management
# =============================================================================

## Run Alembic migrations (upgrade to head)
db-migrate:
	docker exec $(API_CONTAINER) alembic upgrade head

## Create a new Alembic migration (usage: make db-revision MSG="add users table")
db-revision:
	docker exec $(API_CONTAINER) alembic revision --autogenerate -m "$(MSG)"

## Seed the database with initial data
db-seed:
	docker exec $(API_CONTAINER) python -m scripts.seed

## Reset database (drop and recreate)
db-reset:
	docker exec $(DB_CONTAINER) psql -U postgres -c "DROP DATABASE IF EXISTS {DB_NAME};"
	docker exec $(DB_CONTAINER) psql -U postgres -c "CREATE DATABASE {DB_NAME};"
	@echo "Database reset. Run 'make db-migrate' to apply schema."

## Open psql shell
shell-db:
	docker exec -it $(DB_CONTAINER) psql -U postgres -d {DB_NAME}

# =============================================================================
# Container Shells
# =============================================================================

## Open bash shell in API container
shell-api:
	docker exec -it $(API_CONTAINER) bash

## Open redis-cli in Redis container
shell-redis:
	docker exec -it $(REDIS_CONTAINER) redis-cli

## Open sh shell in UI container (Alpine has sh, not bash)
shell-ui:
	docker exec -it $(UI_CONTAINER) sh

# =============================================================================
# Domain Worker / Scanner
# =============================================================================

## Start domain worker (e.g., scanner)
scan-up:
	docker compose --profile scan up -d {DOMAIN_WORKER}

## Stop domain worker
scan-down:
	docker compose --profile scan down

## Tail domain worker logs
scan-logs:
	docker compose --profile scan logs -f {DOMAIN_WORKER}

# =============================================================================
# Build & Test
# =============================================================================

## Build all Docker images (no cache)
build:
	docker compose build --no-cache

## Build API image only
build-api:
	docker build -f Dockerfile.api -t $(PROJECT_SLUG)_api .

## Build UI image only
build-ui:
	docker build -f Dockerfile.ui -t $(PROJECT_SLUG)_ui .

## Run test suite inside API container
test:
	docker exec $(API_CONTAINER) pytest tests/ -v --tb=short

## Run linter inside API container
lint:
	docker exec $(API_CONTAINER) ruff check src/

## Check image sizes
image-sizes:
	@echo "Image sizes:"
	@docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep $(PROJECT_SLUG)

# =============================================================================
# Cleanup
# =============================================================================

## Remove stopped containers, dangling images, unused networks
clean:
	docker system prune -f
	@echo "Cleaned up Docker resources."

## Remove ALL project images (forces full rebuild next time)
clean-images:
	docker images --format "{{.Repository}}:{{.Tag}}" | grep $(PROJECT_SLUG) | xargs -r docker rmi -f
	@echo "All project images removed."
```

---

## 9. Validation Checklist

Use this checklist to verify your Docker setup is complete and correct.

### Dockerfiles

- [ ] `Dockerfile.api` builds successfully: `docker build -f Dockerfile.api -t test_api .`
- [ ] `Dockerfile.ui` builds successfully: `docker build -f Dockerfile.ui -t test_ui .`
- [ ] `Dockerfile.{worker}` builds successfully (if applicable)
- [ ] `.dockerignore` exists and excludes `.git`, `node_modules`, `.env`, `__pycache__`
- [ ] API image size is under 200 MB (`docker images test_api`)
- [ ] UI image size is under 300 MB (`docker images test_ui`)
- [ ] No secrets baked into image layers (`docker history test_api`)
- [ ] Non-root user configured in production Dockerfiles
- [ ] `requirements.txt` / `package.json` copied before source code (layer caching)
- [ ] All imported Python modules have corresponding COPY directives
- [ ] Next.js uses `output: 'standalone'` in `next.config.js`
- [ ] Fonts use `next/font/local` (not `next/font/google`)

### Docker Compose

- [ ] `docker compose up -d` starts all core services without errors
- [ ] `docker compose ps` shows all services as "healthy" or "running"
- [ ] API responds: `curl http://localhost:{API_PORT}/health`
- [ ] UI responds: `curl http://localhost:{UI_PORT}`
- [ ] Database accepts connections: `docker exec {PROJECT_SLUG}_db pg_isready`
- [ ] Redis accepts connections: `docker exec {PROJECT_SLUG}_redis redis-cli ping`
- [ ] All `depends_on` use `condition: service_healthy` (not bare `depends_on`)
- [ ] `.env.example` exists and is committed to version control
- [ ] `.env` is in `.gitignore`
- [ ] Named volumes defined for PostgreSQL and Redis data persistence
- [ ] Resource limits set for all services
- [ ] Health checks defined for all services

### Development Workflow

- [ ] Hot reload works for API: edit a `.py` file, see change reflected without restart
- [ ] Hot reload works for UI: edit a component, see fast refresh in browser
- [ ] `make dev-up` starts the full stack
- [ ] `make dev-down` stops everything
- [ ] `make dev-logs` shows aggregated logs
- [ ] `make db-migrate` runs Alembic migrations
- [ ] `make shell-api` opens a shell in the API container
- [ ] `make shell-db` opens psql
- [ ] `docker compose down -v && docker compose up -d` (full reset) works cleanly

### Production Readiness

- [ ] Multi-stage builds separate build deps from runtime
- [ ] No `--reload` flag in production CMD
- [ ] `NODE_ENV=production` set in UI container
- [ ] Logging drivers configured with rotation (`max-size`, `max-file`)
- [ ] Trivy scan passes with no CRITICAL vulnerabilities
- [ ] Hadolint reports no errors on Dockerfiles
- [ ] Images build successfully on both `amd64` and `arm64` (if cross-platform required)

---

## Appendix A: Quick Start Commands

```bash
# First-time setup
cp .env.example .env
# Edit .env with your values

# Start everything
make dev-up

# Run database migrations
make db-migrate

# Load seed data
make db-seed

# Verify health
curl http://localhost:{API_PORT}/health

# View logs
make dev-logs

# Stop everything
make dev-down

# Full reset (destroys data)
make dev-nuke
```

---

## Appendix B: AuditGH Reference Mapping

This table maps the parameterized template to the actual AuditGH implementation:

| Placeholder | AuditGH Value |
|------------|---------------|
| `{PROJECT_NAME}` | AuditGH |
| `{PROJECT_SLUG}` | auditgh |
| `{API_FRAMEWORK}` | FastAPI |
| `{API_PORT}` | 8000 |
| `{UI_FRAMEWORK}` | Next.js |
| `{UI_PORT}` | 3000 |
| `{PYTHON_VERSION}` | 3.11 |
| `{NODE_VERSION}` | 20 |
| `{POSTGRES_VERSION}` | 15 |
| `{REDIS_VERSION}` | 7 |
| `{DB_NAME}` | security_portal (api) / auditgh_kb (scanner) |
| `{API_ENTRYPOINT}` | src.api.main:app |
| `{UI_SOURCE_DIR}` | src/web-ui |
| `{DOMAIN_WORKER}` | scanner |
| `{DOMAIN_WORKER_TOOLS}` | Gitleaks, Trivy, Semgrep, Bandit, Checkov, CodeQL, etc. |
| `{WORKER_ENTRYPOINT}` | scripts/scanning/scan_repos.py |
| `{GITHUB_ORG}` | (configured per deployment) |

### AuditGH Services (7 total in docker-compose.yml)

| # | Service | Container Name | Port | Profile |
|---|---------|---------------|------|---------|
| 1 | api | auditgh_api | 8000 | default |
| 2 | web-ui | auditgh_ui | 3000 | default |
| 3 | db | auditgh_db | 5432 | default |
| 4 | redis | auditgh-redis | 6379 | default |
| 5 | session-cleanup | auditgh_session_cleanup | - | default |
| 6 | scanner | auditgh_scanner | - | scan |
| 7 | mock-oidc | auditgh_mock_oidc | 3007 | dev |

### AuditGH Dockerfiles (3 total)

| File | Stages | Base Image | Key Features |
|------|--------|-----------|--------------|
| Dockerfile.api | 1 (single) | python:3.11-slim | Syft, libpq, Uvicorn |
| Dockerfile.ui | 3 (deps, builder, runner) | node:20-alpine | Standalone output, non-root user |
| Dockerfile.scanner | 1 (single, heavy) | python:3.11-slim | 20+ security tools, TARGETARCH, GITHUB_TOKEN, isolated venvs |
