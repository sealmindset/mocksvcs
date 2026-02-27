# Phase 1: Project Bootstrap Plan

> **Purpose:** Go from zero to a fully scaffolded, runnable project with a Python/FastAPI backend, Next.js frontend, database migrations, developer tooling, and environment configuration. This plan is parameterized with `{PLACEHOLDER}` patterns so it can be reused across any new project that follows the AuditGH reference architecture.
>
> **Reference Implementation:** [AuditGH](../README.md) -- all patterns, directory structures, and conventions are derived from AuditGH's production codebase.

---

## Placeholder Legend

| Placeholder | Description | Example (AuditGH) |
|---|---|---|
| `{PROJECT_NAME}` | Lowercase project identifier, used in directories and package names | `auditgh` |
| `{PROJECT_TITLE}` | Human-readable project title for UI and docs | `AuditGH Security Portal` |
| `{PROJECT_DESCRIPTION}` | One-line description for README and package.json | `Comprehensive security scanning and remediation platform` |
| `{DOMAIN_MODULE}` | Primary domain-specific Python package under `src/` | `github` (for AuditGH), `inventory` (for a CMDB) |
| `{DB_NAME}` | PostgreSQL database name | `auditgh_kb` |
| `{DB_USER}` | PostgreSQL username | `auditgh` |
| `{DB_PASSWORD}` | PostgreSQL password (dev only) | `auditgh_secret` |
| `{API_PORT}` | Backend API port | `8000` |
| `{UI_PORT}` | Frontend UI port | `3000` |
| `{REDIS_PORT}` | Redis port | `6379` |
| `{LICENSE_TYPE}` | SPDX license identifier | `GPL-3.0-only` |
| `{AUTHOR_NAME}` | Primary author / team name | `Platform Engineering` |
| `{AUTHOR_EMAIL}` | Contact email | `platform@company.com` |
| `{GITHUB_ORG}` | GitHub organization for the repository | `sleepnumber` |
| `{CORS_ORIGINS}` | Comma-separated allowed CORS origins | `http://localhost:3000,http://localhost:8000` |

---

## 1. Repository Initialization

### 1.1 Git Init and Branch Strategy

```bash
mkdir {PROJECT_NAME}
cd {PROJECT_NAME}
git init
git checkout -b main
```

**Branch strategy:**

| Branch | Purpose | Merges Into |
|---|---|---|
| `main` | Production-ready code. Protected. Requires PR review. | -- |
| `develop` | Integration branch. All feature branches merge here first. | `main` (via release PR) |
| `feature/{ticket}-{description}` | Individual feature work | `develop` |
| `bugfix/{ticket}-{description}` | Bug fixes | `develop` |
| `hotfix/{ticket}-{description}` | Emergency production fixes | `main` + `develop` |

```bash
# Create develop branch after initial commit
git checkout -b develop
```

### 1.2 .gitignore

Create `.gitignore` at the project root:

```gitignore
# =============================================
# Environment variables -- NEVER commit secrets
# =============================================
.env
.env.local
.env.*.local
.env.tmp

# =============================================
# Python
# =============================================
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

# Virtual Environment
venv/
env/
ENV/
.venv/

# Pytest / Coverage
.pytest_cache/
.coverage
htmlcov/
coverage.xml

# MyPy
.mypy_cache/

# =============================================
# Node.js / Next.js
# =============================================
node_modules/
.next/
out/
.turbo/
*.tsbuildinfo

# =============================================
# IDE
# =============================================
.idea/
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
*.swp
*.swo
*~
*.code-workspace

# =============================================
# Docker
# =============================================
docker-compose.override.yml

# =============================================
# OS
# =============================================
.DS_Store
Thumbs.db

# =============================================
# Logs and Reports
# =============================================
logs/
*.log

# =============================================
# Project-specific generated files
# =============================================
backups/
generated_*/
```

### 1.3 LICENSE Selection

Choose a license based on project requirements. For internal enterprise projects, consider:

- **GPL-3.0** -- Strong copyleft (AuditGH's choice)
- **Apache-2.0** -- Permissive with patent grant
- **MIT** -- Maximum permissiveness
- **UNLICENSED** -- Proprietary / internal only

```bash
# Download the license text (example: GPL-3.0)
curl -sL https://www.gnu.org/licenses/gpl-3.0.txt > LICENSE
```

### 1.4 README.md Skeleton

Create `README.md`:

```markdown
# {PROJECT_TITLE}

{PROJECT_DESCRIPTION}

## Quick Start

### Prerequisites

- Docker & Docker Compose v2+
- Python 3.11+
- Node.js 20+ and npm
- Make

### Development Setup

```bash
# Clone the repository
git clone https://github.com/{GITHUB_ORG}/{PROJECT_NAME}.git
cd {PROJECT_NAME}

# One-command setup
make setup

# Start all services
make dev-up

# Access the application
# API:     http://localhost:{API_PORT}
# Web UI:  http://localhost:{UI_PORT}
# Docs:    http://localhost:{API_PORT}/docs
```

## Architecture

| Component | Technology | Port |
|-----------|-----------|------|
| API | FastAPI (Python 3.11) | {API_PORT} |
| Frontend | Next.js 16 + Tailwind CSS | {UI_PORT} |
| Database | PostgreSQL 15 | 5432 |
| Cache | Redis 7 | {REDIS_PORT} |

## Project Structure

```
{PROJECT_NAME}/
├── src/
│   ├── api/           # FastAPI application
│   ├── auth/          # Authentication & session management
│   ├── rbac/          # Role-based access control
│   ├── services/      # Business logic services
│   └── {DOMAIN_MODULE}/  # Domain-specific modules
├── src/web-ui/        # Next.js frontend
├── migrations/        # Alembic database migrations
├── tests/             # Test suites
├── scripts/           # Utility scripts
└── docker-compose.yml
```

## License

This project is licensed under the {LICENSE_TYPE} License. See [LICENSE](LICENSE) for details.
```

### 1.5 Initial Commit

```bash
git add .gitignore LICENSE README.md
git commit -m "Initial project scaffold for {PROJECT_NAME}"
```

---

## 2. Python Backend Scaffolding

### 2.1 Directory Structure

Create the full directory tree:

```bash
# Core application package
mkdir -p src/api/routers
mkdir -p src/api/middleware
mkdir -p src/api/schemas
mkdir -p src/api/utils
mkdir -p src/api/constants
mkdir -p src/api/tasks

# Authentication module
mkdir -p src/auth

# Role-based access control
mkdir -p src/rbac

# Business logic services
mkdir -p src/services

# Domain-specific module (replace with your domain)
mkdir -p src/{DOMAIN_MODULE}

# Database migrations
mkdir -p migrations/versions

# Tests
mkdir -p tests/api
mkdir -p tests/auth
mkdir -p tests/services
mkdir -p tests/{DOMAIN_MODULE}

# Scripts
mkdir -p scripts
```

### 2.2 Python Package Init Files

Every Python directory needs an `__init__.py`. Create them all:

```bash
# Root package
touch src/__init__.py

# API package and sub-packages
touch src/api/__init__.py
touch src/api/routers/__init__.py
touch src/api/middleware/__init__.py
touch src/api/schemas/__init__.py
touch src/api/utils/__init__.py
touch src/api/constants/__init__.py
touch src/api/tasks/__init__.py

# Auth package
touch src/auth/__init__.py

# RBAC package
touch src/rbac/__init__.py

# Services package
touch src/services/__init__.py

# Domain package
touch src/{DOMAIN_MODULE}/__init__.py

# Test packages
touch tests/__init__.py
touch tests/api/__init__.py
touch tests/auth/__init__.py
touch tests/services/__init__.py
touch tests/{DOMAIN_MODULE}/__init__.py
```

**`src/__init__.py`** -- version metadata:

```python
"""
{PROJECT_TITLE} - {PROJECT_DESCRIPTION}
"""

__version__ = "0.1.0"
```

### 2.3 Entry Point (`src/__main__.py`)

```python
"""
{PROJECT_TITLE} - Application entry point.

Usage:
    python -m src              # Start the API server
    python -m src --help       # Show CLI options
"""
import argparse
import logging
import os
import sys

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("{PROJECT_NAME}.log"),
    ],
)
logger = logging.getLogger(__name__)


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="{PROJECT_DESCRIPTION}"
    )
    parser.add_argument(
        "--host",
        default=os.getenv("API_HOST", "0.0.0.0"),
        help="Host to bind to (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("API_PORT", "{API_PORT}")),
        help="Port to listen on (default: {API_PORT})",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for development",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose output",
    )
    return parser.parse_args()


def main():
    """Main entry point."""
    args = parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    import uvicorn

    uvicorn.run(
        "src.api.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
```

### 2.4 requirements.txt

Pin major versions to avoid breaking changes. This is the baseline dependency set derived from the AuditGH reference:

```txt
# =============================================================================
# {PROJECT_TITLE} - Python Dependencies
# =============================================================================

# --- Web Framework -----------------------------------------------------------
fastapi>=0.115.0
uvicorn>=0.30.0
python-multipart>=0.0.9

# --- Database ----------------------------------------------------------------
sqlalchemy>=2.0.0
psycopg2-binary>=2.9.0       # PostgreSQL adapter
alembic>=1.14.0               # Database migrations

# --- Data Validation ---------------------------------------------------------
pydantic>=2.0.0
pydantic-settings>=2.0.0     # Settings management from env vars
email-validator>=2.0.0        # Pydantic EmailStr validation

# --- Authentication & Authorization ------------------------------------------
authlib>=1.3.0                # OAuth 2.0 / OIDC client
python-jose[cryptography]>=3.3.0  # JWT encoding/decoding
bcrypt>=4.0.0                 # Password hashing (break-glass auth)
itsdangerous>=2.1.0           # Starlette SessionMiddleware signing

# --- Caching & Session Management --------------------------------------------
redis>=5.0.0                  # Redis client for caching, sessions, token blacklist
hiredis>=2.2.0                # C parser for Redis performance

# --- Rate Limiting ------------------------------------------------------------
slowapi>=0.1.9                # API rate limiting via Redis/memory backend

# --- Background Jobs ----------------------------------------------------------
apscheduler>=3.10.0           # Cron-style scheduled tasks

# --- Logging & Observability --------------------------------------------------
loguru>=0.7.0                 # Structured logging with rotation and sinks
python-dotenv>=1.0.0          # .env file loading

# --- HTTP Client --------------------------------------------------------------
httpx>=0.27.0                 # Async HTTP client

# --- Testing ------------------------------------------------------------------
pytest>=8.0.0
pytest-asyncio>=0.23.0
pytest-cov>=5.0.0             # Code coverage

# --- Code Quality (dev) -------------------------------------------------------
# Install separately or via pre-commit:
# black, isort, flake8, mypy
```

### 2.5 Virtual Environment Setup

**Option A: venv (simple, recommended for most projects)**

```bash
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

**Option B: Poetry (dependency locking, reproducible builds)**

```bash
pip install poetry
poetry init --name {PROJECT_NAME} --description "{PROJECT_DESCRIPTION}" --author "{AUTHOR_NAME} <{AUTHOR_EMAIL}>"
poetry add fastapi uvicorn sqlalchemy psycopg2-binary alembic pydantic pydantic-settings \
    authlib python-jose[cryptography] bcrypt loguru redis slowapi apscheduler \
    python-dotenv httpx python-multipart email-validator itsdangerous hiredis
poetry add --group dev pytest pytest-asyncio pytest-cov black isort flake8 mypy
```

### 2.6 Alembic Initialization

```bash
# Initialize Alembic (from project root)
alembic init migrations
```

This creates `alembic.ini` at the root and `migrations/` directory with `env.py` and `script.py.mako`. The next section covers `alembic.ini` configuration.

---

## 3. Next.js Frontend Scaffolding

### 3.1 Create Next.js App

```bash
# Create the Next.js app inside src/web-ui
npx create-next-app@latest src/web-ui \
  --typescript \
  --tailwind \
  --app \
  --src-dir=false \
  --import-alias="@/*" \
  --use-npm \
  --no-eslint
```

After creation, re-add ESLint with the Next.js config:

```bash
cd src/web-ui
npm install --save-dev eslint eslint-config-next
```

### 3.2 shadcn/ui Initialization

```bash
cd src/web-ui
npx shadcn@latest init
```

When prompted, select:
- Style: **New York**
- Base color: **Neutral**
- CSS variables: **Yes**

This creates `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {}
}
```

Install commonly needed shadcn components:

```bash
npx shadcn@latest add button card badge table dialog dropdown-menu \
  input label select tabs toast tooltip avatar separator scroll-area \
  alert alert-dialog checkbox popover switch sheet sidebar skeleton \
  collapsible radio-group textarea progress
```

### 3.3 Directory Structure

After `create-next-app` and `shadcn init`, ensure this structure exists:

```
src/web-ui/
├── app/
│   ├── globals.css          # Tailwind + CSS variables (created by shadcn)
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Home page
│   └── api/                 # Next.js API routes (optional, for BFF patterns)
├── components/
│   ├── ui/                  # shadcn components (auto-generated)
│   ├── theme-provider.tsx   # Dark/light mode provider
│   └── mode-toggle.tsx      # Theme toggle button
├── contexts/
│   └── AuthContext.tsx       # Authentication context provider
├── hooks/
│   └── use-mobile.ts        # Responsive hooks
├── lib/
│   ├── api.ts               # API base URL configuration
│   └── utils.ts             # cn() utility (created by shadcn)
├── public/                  # Static assets
├── components.json          # shadcn configuration
├── next.config.ts           # Next.js configuration
├── tsconfig.json            # TypeScript configuration
├── package.json
└── postcss.config.mjs
```

Create missing directories:

```bash
mkdir -p src/web-ui/contexts
mkdir -p src/web-ui/hooks
mkdir -p src/web-ui/lib
mkdir -p src/web-ui/components
```

### 3.4 package.json Dependencies

After `create-next-app`, install the additional dependencies that match the AuditGH stack:

```bash
cd src/web-ui

# UI component libraries
npm install @radix-ui/react-alert-dialog @radix-ui/react-avatar \
  @radix-ui/react-checkbox @radix-ui/react-collapsible \
  @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-label @radix-ui/react-popover \
  @radix-ui/react-radio-group @radix-ui/react-scroll-area \
  @radix-ui/react-select @radix-ui/react-separator \
  @radix-ui/react-slot @radix-ui/react-switch \
  @radix-ui/react-tabs @radix-ui/react-toast \
  @radix-ui/react-tooltip

# Utility libraries
npm install class-variance-authority clsx tailwind-merge
npm install lucide-react
npm install recharts
npm install date-fns
npm install next-themes
npm install js-cookie
npm install @tanstack/react-table

# Dev dependencies
npm install --save-dev @types/js-cookie @types/node @types/react @types/react-dom
npm install --save-dev @tailwindcss/postcss @tailwindcss/typography
npm install --save-dev tw-animate-css
```

The resulting `package.json` scripts section:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  }
}
```

### 3.5 tsconfig.json Path Aliases

The `@/` alias should already be configured by `create-next-app`. Verify `tsconfig.json` contains:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

---

## 4. Environment Configuration

### 4.1 .env.sample

Create `.env.sample` at the project root. This file contains **every** environment variable the project uses, with descriptions and safe defaults. No real secrets.

```bash
# =============================================================================
# {PROJECT_TITLE} -- Environment Configuration
# =============================================================================
# Copy this file to .env and fill in actual values:
#   cp .env.sample .env
#
# NEVER commit .env to version control.
# =============================================================================

# --- Core Application --------------------------------------------------------
NODE_ENV=development
API_HOST=0.0.0.0
API_PORT={API_PORT}
SESSION_SECRET=change-me-in-prod-use-openssl-rand-hex-32

# --- Database (PostgreSQL) ---------------------------------------------------
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_USER={DB_USER}
POSTGRES_PASSWORD={DB_PASSWORD}
POSTGRES_DB={DB_NAME}
# Fully expanded connection string (used by Alembic and direct connections)
DATABASE_URL=postgresql://{DB_USER}:{DB_PASSWORD}@db:5432/{DB_NAME}

# --- Redis (Caching, Sessions, Token Blacklist) ------------------------------
REDIS_HOST=redis
REDIS_PORT={REDIS_PORT}
REDIS_URL=redis://redis:{REDIS_PORT}/0

# --- Authentication ----------------------------------------------------------
# Set to false to disable auth in development
AUTH_REQUIRED=false
# Break-glass emergency password (dev only, change in prod)
BREAK_GLASS_PASSWORD=ChangeMe123!
# JWT Configuration
SECRET_KEY=your-secret-key-change-in-prod
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# --- OIDC / SSO (Azure Entra ID, Okta, etc.) --------------------------------
# Provider name: entra-id, okta, mock-oidc
OIDC_PROVIDER_NAME=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_DISCOVERY_URL=
# External base URL for OIDC redirects (e.g., http://localhost:{API_PORT})
OIDC_EXTERNAL_BASE_URL=

# --- SMTP (Email) ------------------------------------------------------------
# Development: Use MailHog (localhost:1025, no auth, no TLS)
# Production: Use SendGrid, AWS SES, Gmail, etc.
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@{PROJECT_NAME}.local
SMTP_USE_TLS=false
SMTP_USE_SSL=false

# --- AI / LLM (Optional) ----------------------------------------------------
# Provider: openai, claude, anthropic_foundry, ollama, docker
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514
# Azure AI Foundry (if using Anthropic via Azure)
AZURE_AI_FOUNDRY_ENDPOINT=
AZURE_AI_FOUNDRY_API_KEY=

# --- Frontend ----------------------------------------------------------------
# Backend API URL (read by Next.js via NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_API_URL=http://localhost:{API_PORT}
# CORS allowed origins (comma-separated)
CORS_ORIGINS={CORS_ORIGINS}

# --- Application URLs --------------------------------------------------------
APP_URL=http://localhost:{UI_PORT}

# --- Multi-Tenant (Optional) -------------------------------------------------
MULTI_TENANT_ENABLED=false
DEFAULT_TENANT_SLUG=default
```

### 4.2 .env Loading Pattern

**Python backend** -- uses `python-dotenv` in `src/__main__.py` and `src/api/config.py`:

```python
from dotenv import load_dotenv
load_dotenv()  # Loads .env from project root
```

Pydantic Settings also natively reads `.env`:

```python
class Settings(BaseSettings):
    class Config:
        env_file = ".env"
        extra = "ignore"
```

**Next.js frontend** -- uses built-in `.env` loading:
- `.env` -- all environments
- `.env.local` -- local overrides (gitignored)
- `.env.development` / `.env.production` -- environment-specific

Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser bundle.

---

## 5. Developer Tooling

### 5.1 Makefile

Create `Makefile` at the project root:

```makefile
# =============================================================================
# {PROJECT_TITLE} -- Developer Workflow Targets
# =============================================================================

.PHONY: setup dev-up dev-down dev-logs test lint format migrate seed clean build help

# Default target
.DEFAULT_GOAL := help

# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------

## One-time setup: create venv, install deps, copy env, init DB
setup:
	@echo "Setting up {PROJECT_NAME} development environment..."
	python3.11 -m venv venv
	. venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
	cd src/web-ui && npm install
	@if [ ! -f .env ]; then cp .env.sample .env; echo "Created .env from .env.sample"; fi
	@echo ""
	@echo "Setup complete. Run 'make dev-up' to start services."

# -----------------------------------------------------------------------------
# Development Environment
# -----------------------------------------------------------------------------

## Start all development services (API, UI, DB, Redis)
dev-up:
	docker compose up -d db redis
	@echo "Waiting for database to become healthy..."
	@sleep 5
	docker compose up -d api web-ui
	@echo ""
	@echo "API:     http://localhost:{API_PORT}"
	@echo "Web UI:  http://localhost:{UI_PORT}"
	@echo "Docs:    http://localhost:{API_PORT}/docs"
	@echo ""

## Stop all development services
dev-down:
	docker compose down

## Tail logs for all services
dev-logs:
	docker compose logs -f

## Tail API logs only
logs:
	docker compose logs -f api

# -----------------------------------------------------------------------------
# Testing
# -----------------------------------------------------------------------------

## Run all Python tests with coverage
test:
	. venv/bin/activate && pytest --cov=src --cov-report=term-missing -v

## Run tests matching a pattern: make test-k PATTERN=test_auth
test-k:
	. venv/bin/activate && pytest -k "$(PATTERN)" -v

# -----------------------------------------------------------------------------
# Code Quality
# -----------------------------------------------------------------------------

## Run all linters (Python + TypeScript)
lint:
	. venv/bin/activate && flake8 src/ tests/ --max-line-length=120
	cd src/web-ui && npm run lint

## Auto-format all code (Python + TypeScript)
format:
	. venv/bin/activate && black src/ tests/ --line-length=120
	. venv/bin/activate && isort src/ tests/ --profile=black
	cd src/web-ui && npx prettier --write "**/*.{ts,tsx,json,css,md}"

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

## Run Alembic migrations (upgrade to head)
migrate:
	. venv/bin/activate && alembic upgrade head

## Create a new migration: make migration MSG="add users table"
migration:
	. venv/bin/activate && alembic revision --autogenerate -m "$(MSG)"

## Rollback last migration
migrate-down:
	. venv/bin/activate && alembic downgrade -1

## Seed the database with initial data
seed:
	. venv/bin/activate && python scripts/seed.py

# -----------------------------------------------------------------------------
# Build
# -----------------------------------------------------------------------------

## Build all Docker images
build:
	docker compose build

## Build frontend for production
build-ui:
	cd src/web-ui && npm run build

# -----------------------------------------------------------------------------
# Cleanup
# -----------------------------------------------------------------------------

## Remove all generated files, caches, and volumes
clean:
	docker compose down -v --remove-orphans 2>/dev/null || true
	rm -rf venv/
	rm -rf src/web-ui/node_modules/ src/web-ui/.next/
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	@echo "Clean complete."

# -----------------------------------------------------------------------------
# Help
# -----------------------------------------------------------------------------

## Show this help message
help:
	@echo ""
	@echo "  {PROJECT_TITLE} -- Available Make Targets"
	@echo "  ================================================"
	@echo ""
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## /  /' | while IFS= read -r line; do echo "  $$line"; done
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*' $(MAKEFILE_LIST) | \
		grep -v '.PHONY' | grep -v '.DEFAULT_GOAL' | \
		awk -F: '{printf "  \033[36m%-20s\033[0m\n", $$1}'
	@echo ""
```

### 5.2 Pre-commit Hooks

Install `pre-commit`:

```bash
pip install pre-commit
```

Create `.pre-commit-config.yaml`:

```yaml
# =============================================================================
# Pre-commit hooks for {PROJECT_NAME}
# =============================================================================
# Install: pre-commit install
# Run all: pre-commit run --all-files
# =============================================================================

repos:
  # --- Python: Black (formatter) ---
  - repo: https://github.com/psf/black
    rev: 24.4.2
    hooks:
      - id: black
        args: [--line-length=120]

  # --- Python: isort (import sorting) ---
  - repo: https://github.com/PyCQA/isort
    rev: 5.13.2
    hooks:
      - id: isort
        args: [--profile=black, --line-length=120]

  # --- Python: flake8 (linter) ---
  - repo: https://github.com/PyCQA/flake8
    rev: 7.1.0
    hooks:
      - id: flake8
        args: [--max-line-length=120, --extend-ignore=E203]

  # --- General: trailing whitespace, EOF, YAML ---
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-added-large-files
        args: [--maxkb=1000]
      - id: no-commit-to-branch
        args: [--branch=main]

  # --- TypeScript/JavaScript: ESLint ---
  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.5.0
    hooks:
      - id: eslint
        files: \.(ts|tsx)$
        types: [file]
        additional_dependencies:
          - eslint
          - eslint-config-next

  # --- TypeScript/JavaScript: Prettier ---
  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0-alpha.8
    hooks:
      - id: prettier
        files: \.(ts|tsx|json|css|md)$
```

Activate the hooks:

```bash
pre-commit install
```

### 5.3 EditorConfig

Create `.editorconfig`:

```ini
# =============================================================================
# EditorConfig -- Consistent coding styles across IDEs
# https://editorconfig.org
# =============================================================================

root = true

[*]
indent_style = space
indent_size = 4
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.{ts,tsx,js,jsx,json,css,scss,yaml,yml}]
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab

[*.{sh,bash}]
indent_size = 2
```

### 5.4 VSCode Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.organizeImports": "explicit"
    }
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "python.defaultInterpreterPath": "./venv/bin/python",
  "python.analysis.typeCheckingMode": "basic",
  "python.testing.pytestEnabled": true,
  "python.testing.pytestArgs": ["tests/"],
  "files.exclude": {
    "**/__pycache__": true,
    "**/.pytest_cache": true,
    "**/node_modules": true,
    "**/.next": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/.next": true,
    "**/venv": true
  },
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cn\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"]
  ]
}
```

Create `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "ms-python.python",
    "ms-python.black-formatter",
    "ms-python.isort",
    "ms-python.flake8",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "EditorConfig.EditorConfig",
    "eamodio.gitlens",
    "ms-azuretools.vscode-docker",
    "redhat.vscode-yaml"
  ]
}
```

---

## 6. Configuration Files

### 6.1 alembic.ini

Create `alembic.ini` at the project root:

```ini
[alembic]
script_location = migrations
prepend_sys_path = .
version_path_separator = os
# Default connection string (overridden by env.py at runtime)
sqlalchemy.url = postgresql://{DB_USER}:{DB_PASSWORD}@db:5432/{DB_NAME}

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = INFO
handlers = console

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

### 6.2 Alembic env.py

Replace the auto-generated `migrations/env.py` with one that reads DATABASE_URL from the environment:

```python
"""Alembic migration environment configuration."""
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from src.api.database import Base

# Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Add model MetaData for 'autogenerate' support
target_metadata = Base.metadata

# Override sqlalchemy.url from environment variable
database_url = os.environ.get("DATABASE_URL")
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### 6.3 pytest.ini

Create `pytest.ini` at the project root:

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
asyncio_mode = auto
addopts = -v --tb=short
```

### 6.4 docker-compose.yml (Placeholder)

Create `docker-compose.yml` at the project root. This is a minimal starter that gets the infrastructure running. The full Docker plan will expand this significantly.

```yaml
# =============================================================================
# {PROJECT_TITLE} -- Docker Compose (Development)
# =============================================================================

services:
  # ---------------------------------------------------------------------------
  # API Service -- FastAPI backend
  # ---------------------------------------------------------------------------
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    container_name: {PROJECT_NAME}_api
    ports:
      - "{API_PORT}:{API_PORT}"
    env_file:
      - .env
    environment:
      - POSTGRES_HOST=db
      - REDIS_URL=redis://redis:{REDIS_PORT}/0
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:{API_PORT}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped

  # ---------------------------------------------------------------------------
  # Web UI Service -- Next.js frontend
  # ---------------------------------------------------------------------------
  web-ui:
    build:
      context: .
      dockerfile: Dockerfile.ui
      target: runner
    container_name: {PROJECT_NAME}_ui
    ports:
      - "{UI_PORT}:{UI_PORT}"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:{API_PORT}
      - NODE_ENV=production
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

  # ---------------------------------------------------------------------------
  # Database -- PostgreSQL
  # ---------------------------------------------------------------------------
  db:
    image: postgres:15-alpine
    container_name: {PROJECT_NAME}_db
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-{DB_USER}}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-{DB_PASSWORD}}
      - POSTGRES_DB=${POSTGRES_DB:-{DB_NAME}}
      - POSTGRES_MAX_CONNECTIONS=200
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    command:
      - "postgres"
      - "-c"
      - "max_connections=200"
      - "-c"
      - "shared_buffers=256MB"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-{DB_USER}}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # ---------------------------------------------------------------------------
  # Redis -- Caching, sessions, token blacklist
  # ---------------------------------------------------------------------------
  redis:
    image: redis:7-alpine
    container_name: {PROJECT_NAME}_redis
    ports:
      - "{REDIS_PORT}:{REDIS_PORT}"
    volumes:
      - redis-data:/data
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
    restart: unless-stopped

volumes:
  postgres-data:
  redis-data:
```

### 6.5 policy.yaml (If Applicable)

If the project includes policy-gate functionality (e.g., scan pass/fail criteria), create a `policy.yaml` placeholder:

```yaml
# =============================================================================
# {PROJECT_TITLE} -- Policy Configuration
# =============================================================================
# Purpose: Define pass/fail gates and threshold rules.
# Modes:
#   - policy.mode: "fail" -> violations mark the gate as FAIL
#   - policy.mode: "warn" -> violations produce warnings only
# =============================================================================

version: 1

policy:
  mode: warn
  short_circuit_fail: false

# Define your domain-specific gates here:
# gates:
#   example_gate:
#     max_severity: high
#     max_counts:
#       critical: 0
#       high: 0
#       medium: 25
```

---

## 7. Initial File Templates

These are the minimal, working source files needed to boot the application. Each is derived from the AuditGH reference but stripped to essentials.

### 7.1 src/api/main.py -- FastAPI Application

```python
"""
{PROJECT_TITLE} -- FastAPI Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import os

from loguru import logger as loguru_logger

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="{PROJECT_TITLE} API",
    description="{PROJECT_DESCRIPTION}",
    version="0.1.0",
    contact={"name": "{AUTHOR_NAME}", "email": "{AUTHOR_EMAIL}"},
    license_info={"name": "{LICENSE_TYPE}"},
    swagger_ui_parameters={
        "docExpansion": "none",
        "filter": True,
        "persistAuthorization": True,
        "tryItOutEnabled": True,
        "displayRequestDuration": True,
    },
)

# ---------------------------------------------------------------------------
# Database table creation (development only; use Alembic in production)
# ---------------------------------------------------------------------------
from .database import engine
from . import models

models.Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# CORS Configuration
# ---------------------------------------------------------------------------
cors_origins = os.getenv("CORS_ORIGINS", "{CORS_ORIGINS}").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
    ],
)

# ---------------------------------------------------------------------------
# Import and include routers
# ---------------------------------------------------------------------------
# from .routers import {your_router}
# app.include_router({your_router}.router)

# ---------------------------------------------------------------------------
# Lifecycle Events
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup_event():
    """Initialize services on API startup."""
    logger.info("{PROJECT_TITLE} API starting up...")
    # Add initialization logic here:
    # - RBAC seed
    # - Scheduler start
    # - Cache warmup


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("{PROJECT_TITLE} API shutting down...")
    # Add cleanup logic here


# ---------------------------------------------------------------------------
# Root & Health Endpoints
# ---------------------------------------------------------------------------
@app.get("/", summary="API root", tags=["default"], include_in_schema=False)
async def root():
    """Return API welcome message and links."""
    return {
        "message": "Welcome to {PROJECT_TITLE} API",
        "docs": "/docs",
        "redoc": "/redoc",
        "version": "0.1.0",
    }


@app.get(
    "/health",
    summary="Health check",
    tags=["default"],
    response_model=None,
    responses={
        200: {"description": "All systems healthy"},
        503: {"description": "One or more dependencies unhealthy"},
    },
)
async def health_check():
    """Health check endpoint reporting database and Redis status."""
    from datetime import datetime, timezone
    from sqlalchemy import text
    from .database import SessionLocal

    health = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {},
    }

    # Check database
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        health["checks"]["database"] = "healthy"
    except Exception as e:
        health["checks"]["database"] = f"unhealthy: {str(e)}"
        health["status"] = "unhealthy"

    # Check Redis
    try:
        import redis as redis_lib

        r = redis_lib.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
        r.ping()
        health["checks"]["redis"] = "healthy"
    except Exception as e:
        health["checks"]["redis"] = f"unhealthy: {str(e)}"
        health["status"] = "unhealthy"

    status_code = 200 if health["status"] == "healthy" else 503
    return JSONResponse(content=health, status_code=status_code)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("API_PORT", "{API_PORT}")))
```

### 7.2 src/api/config.py -- Settings from Environment

```python
"""
{PROJECT_TITLE} -- Application Configuration

All settings are loaded from environment variables with sensible defaults.
For local development, values come from .env via python-dotenv.
"""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ---- Database ----
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: str = "5432"
    POSTGRES_USER: str = "{DB_USER}"
    POSTGRES_PASSWORD: str = "{DB_PASSWORD}"
    POSTGRES_DB: str = "{DB_NAME}"

    # ---- Redis ----
    REDIS_URL: str = "redis://localhost:{REDIS_PORT}/0"

    # ---- Security / JWT ----
    SECRET_KEY: str = "your-secret-key-change-in-prod"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # ---- CORS ----
    CORS_ORIGINS: str = "{CORS_ORIGINS}"

    # ---- OIDC / SSO ----
    OIDC_PROVIDER_NAME: str = ""
    OIDC_CLIENT_ID: str = ""
    OIDC_CLIENT_SECRET: str = ""
    OIDC_DISCOVERY_URL: str = ""

    # ---- SMTP ----
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@{PROJECT_NAME}.local"

    # ---- AI (Optional) ----
    AI_PROVIDER: str = "openai"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4"

    # ---- Application ----
    APP_URL: str = "http://localhost:{UI_PORT}"
    MULTI_TENANT_ENABLED: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS into a list."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
```

### 7.3 src/api/database.py -- SQLAlchemy Engine and Session

```python
"""
{PROJECT_TITLE} -- Database Configuration

Provides the SQLAlchemy engine, session factory, and FastAPI dependency
for injecting database sessions into route handlers.
"""
import os
import logging
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from fastapi import Request

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Connection configuration from environment
# ---------------------------------------------------------------------------
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "{DB_USER}")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "{DB_PASSWORD}")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "{DB_NAME}")

SQLALCHEMY_DATABASE_URL = (
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
)

# ---------------------------------------------------------------------------
# Engine and session factory
# ---------------------------------------------------------------------------
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,       # Verify connections before use
    pool_size=10,             # Connection pool size
    max_overflow=20,          # Extra connections when pool is full
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ---------------------------------------------------------------------------
# Declarative base for models
# ---------------------------------------------------------------------------
Base = declarative_base()


# ---------------------------------------------------------------------------
# FastAPI dependency for database sessions
# ---------------------------------------------------------------------------
def get_db(request: Request = None) -> Generator[Session, None, None]:
    """
    Dependency for getting a database session.

    Usage in routers:
        @router.get("/items")
        def get_items(db: Session = Depends(get_db)):
            items = db.query(Item).all()
            return items
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### 7.4 src/api/models.py -- Base Model with Common Mixins

```python
"""
{PROJECT_TITLE} -- SQLAlchemy Models

Base model definitions with common columns and mixins.
Add your domain-specific models below the base definitions.
"""
from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func, text
from .database import Base
import uuid


# =============================================================================
# MIXIN: Common columns shared across most tables
# =============================================================================
class TimestampMixin:
    """Adds created_at and updated_at columns."""
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class UUIDPrimaryKeyMixin:
    """Adds a UUID primary key column."""
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )


# =============================================================================
# Example: User model (for authentication/RBAC)
# =============================================================================
class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Application user."""
    __tablename__ = "users"

    email = Column(String(255), unique=True, nullable=False, index=True)
    display_name = Column(String(255))
    hashed_password = Column(String(255))  # For break-glass auth
    is_active = Column(Boolean, default=True)
    role = Column(String(50), default="user")  # user, analyst, admin, super_admin
    last_login = Column(DateTime)

    def __repr__(self):
        return f"<User(email='{self.email}', role='{self.role}')>"


# =============================================================================
# Add your domain-specific models below
# =============================================================================
# class {DomainEntity}(UUIDPrimaryKeyMixin, TimestampMixin, Base):
#     """Description of the domain entity."""
#     __tablename__ = "{domain_entities}"
#
#     name = Column(String(255), nullable=False)
#     description = Column(Text)
#     is_active = Column(Boolean, default=True)
```

### 7.5 src/web-ui/app/layout.tsx -- Root Layout

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "{PROJECT_TITLE}",
  description: "{PROJECT_DESCRIPTION}",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### 7.6 src/web-ui/app/page.tsx -- Hello World Page

```tsx
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">
            {PROJECT_TITLE}
          </CardTitle>
          <CardDescription>
            {PROJECT_DESCRIPTION}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="flex gap-2">
            <Badge variant="outline">FastAPI</Badge>
            <Badge variant="outline">Next.js</Badge>
            <Badge variant="outline">PostgreSQL</Badge>
            <Badge variant="outline">Redis</Badge>
          </div>
          <div className="flex gap-2">
            <a href={`http://localhost:{API_PORT}/docs`} target="_blank">
              <Button variant="default">API Docs</Button>
            </a>
            <a href={`http://localhost:{API_PORT}/health`} target="_blank">
              <Button variant="outline">Health Check</Button>
            </a>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Edit <code className="bg-muted px-1 rounded">app/page.tsx</code> to get started.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

### 7.7 src/web-ui/lib/utils.ts -- cn() Utility

This is created automatically by `shadcn init`, but here is the expected content:

```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### 7.8 src/web-ui/lib/api.ts -- API Base URL

```typescript
/**
 * API base URL, read from the NEXT_PUBLIC_API_URL environment variable.
 * Defaults to http://localhost:{API_PORT} for local development.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:{API_PORT}";
```

### 7.9 src/web-ui/components/theme-provider.tsx -- Theme Provider

```tsx
"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

### 7.10 src/web-ui/next.config.ts -- Next.js Configuration

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

---

## 8. Execution Checklist

Use this checklist to verify each step of the bootstrap is complete:

### Repository
- [ ] `git init` and initial commit on `main`
- [ ] `develop` branch created
- [ ] `.gitignore` covers Python, Node.js, IDE, .env, Docker
- [ ] `LICENSE` file present
- [ ] `README.md` with quick start instructions

### Python Backend
- [ ] Directory structure created (`src/api/`, `src/auth/`, `src/rbac/`, `src/services/`, `src/{DOMAIN_MODULE}/`)
- [ ] All `__init__.py` files in place
- [ ] `src/__init__.py` with version
- [ ] `src/__main__.py` entry point works (`python -m src --help`)
- [ ] `requirements.txt` with pinned versions
- [ ] Virtual environment created and dependencies installed
- [ ] `src/api/main.py` starts and serves `/health`
- [ ] `src/api/config.py` reads from environment
- [ ] `src/api/database.py` connects to PostgreSQL
- [ ] `src/api/models.py` defines Base and initial models

### Database
- [ ] `alembic.ini` configured
- [ ] `migrations/env.py` reads DATABASE_URL from environment
- [ ] `migrations/versions/` directory exists
- [ ] Initial migration can be generated (`alembic revision --autogenerate -m "initial"`)
- [ ] Migration applies cleanly (`alembic upgrade head`)

### Next.js Frontend
- [ ] `src/web-ui/` created with `create-next-app`
- [ ] `shadcn/ui` initialized (`components.json` present)
- [ ] Base shadcn components installed (button, card, badge, etc.)
- [ ] `app/layout.tsx` with ThemeProvider
- [ ] `app/page.tsx` renders
- [ ] `lib/utils.ts` has `cn()` function
- [ ] `lib/api.ts` exports `API_BASE`
- [ ] `components/theme-provider.tsx` works
- [ ] `npm run dev` starts without errors
- [ ] `npm run build` succeeds

### Environment
- [ ] `.env.sample` documents ALL variables with categories
- [ ] `.env` created from `.env.sample` (gitignored)
- [ ] Python reads `.env` via `python-dotenv` and `pydantic-settings`
- [ ] Next.js reads `NEXT_PUBLIC_*` variables

### Developer Tooling
- [ ] `Makefile` with all targets (`setup`, `dev-up`, `dev-down`, `test`, `lint`, `format`, `migrate`, `seed`, `clean`, `build`)
- [ ] `make setup` runs end-to-end
- [ ] `make dev-up` starts all services
- [ ] Pre-commit hooks installed and passing
- [ ] `.editorconfig` present
- [ ] `.vscode/settings.json` configured
- [ ] `.vscode/extensions.json` lists recommended extensions

### Configuration Files
- [ ] `alembic.ini` present
- [ ] `pytest.ini` configured
- [ ] `docker-compose.yml` with API, UI, DB, Redis
- [ ] `policy.yaml` placeholder (if applicable)

### Smoke Test
- [ ] `make dev-up` -- all containers healthy
- [ ] `curl http://localhost:{API_PORT}/health` returns `{"status": "healthy"}`
- [ ] `curl http://localhost:{API_PORT}/docs` returns Swagger UI
- [ ] `http://localhost:{UI_PORT}` renders the hello world page
- [ ] `make test` runs tests (even if 0 tests initially)
- [ ] `make lint` passes
- [ ] `make dev-down` stops cleanly

---

## 9. File Creation Order

For a clean commit history, create files in this order:

| Commit | Files | Message |
|--------|-------|---------|
| 1 | `.gitignore`, `LICENSE`, `README.md` | `Initial project scaffold` |
| 2 | `requirements.txt`, `src/__init__.py`, `src/__main__.py` | `Add Python backend skeleton with entry point` |
| 3 | `src/api/main.py`, `src/api/config.py`, `src/api/database.py`, `src/api/models.py`, all `__init__.py` | `Add FastAPI application with health check` |
| 4 | `alembic.ini`, `migrations/env.py`, `migrations/script.py.mako` | `Initialize Alembic for database migrations` |
| 5 | `src/web-ui/` (entire Next.js scaffold) | `Add Next.js frontend with shadcn/ui` |
| 6 | `.env.sample`, `docker-compose.yml`, `pytest.ini` | `Add environment config and Docker Compose` |
| 7 | `Makefile`, `.pre-commit-config.yaml`, `.editorconfig`, `.vscode/` | `Add developer tooling: Makefile, pre-commit, editor config` |

---

## 10. Next Steps (Post-Bootstrap)

After completing this Phase 1 bootstrap, proceed to:

1. **Phase 2: Authentication & Authorization** -- OIDC integration, JWT sessions, RBAC (see `OIDC_AUTHN_IMPLEMENTATION_PLAN.md`)
2. **Phase 3: API-First Implementation** -- Domain models, routers, schemas (see `API_FIRST_IMPLEMENTATION_PLAN.md`)
3. **Phase 4: Docker & Infrastructure** -- Production Dockerfiles, multi-stage builds, CI/CD
4. **Phase 5: Testing** -- Unit tests, integration tests, API contract tests

---

*This plan was generated from the AuditGH reference implementation. Replace all `{PLACEHOLDER}` values with your project-specific configuration before execution.*
