# Master Implementation Plan: Full-Stack Web Application from Scratch

> **Purpose:** Complete, ordered implementation guide for recreating a production-grade full-stack web application. Uses AuditGH as the reference implementation with parameterized placeholders for domain-specific customization.
>
> **Audience:** Engineering teams building enterprise web applications with FastAPI + Next.js + PostgreSQL + Redis on AWS.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Implementation Phases](#2-implementation-phases)
3. [Plan Index](#3-plan-index)
4. [Phase Execution Order](#4-phase-execution-order)
5. [Cross-Cutting Concerns](#5-cross-cutting-concerns)
6. [Customization Guide](#6-customization-guide)
7. [Validation Checkpoints](#7-validation-checkpoints)
8. [Appendix: AuditGH Reference Architecture](#appendix-auditgh-reference-architecture)

---

## 1. Architecture Overview

### Target Architecture

```
                    ┌─────────────────────────────────────┐
                    │           Load Balancer (ALB)        │
                    │         SSL Termination / WAF        │
                    └────────────┬──────────┬──────────────┘
                                 │          │
                    ┌────────────▼──┐  ┌────▼────────────┐
                    │  Frontend     │  │  Backend API     │
                    │  Next.js      │  │  FastAPI         │
                    │  :3000        │  │  :8000           │
                    └───────────────┘  └──┬─────────┬─────┘
                                          │         │
                              ┌───────────▼──┐  ┌───▼───────────┐
                              │  PostgreSQL  │  │  Redis         │
                              │  :5432       │  │  :6379         │
                              │  Primary DB  │  │  Sessions,     │
                              │  + Migrations│  │  Cache, Rate   │
                              └──────────────┘  │  Limiting      │
                                                └────────────────┘
```

### Reference Stack (Parameterized)

| Layer | Default Technology | Alternatives |
|-------|-------------------|-------------|
| **Frontend** | Next.js 16 (App Router) + React 19 | Nuxt, SvelteKit, Remix |
| **UI Components** | shadcn/ui + Radix UI + Tailwind CSS 4 | MUI, Ant Design, Chakra |
| **Backend API** | FastAPI (Python 3.12+) | Express, Spring Boot, Go Fiber |
| **ORM** | SQLAlchemy 2.0 + Alembic | Prisma, TypeORM, GORM |
| **Database** | PostgreSQL 16 | MySQL, CockroachDB |
| **Cache/Sessions** | Redis 7 | Valkey, Memcached, DragonflyDB |
| **Auth** | OIDC (Authlib) + JWT (python-jose) | Auth0, Keycloak, Clerk |
| **Container Runtime** | Docker + Docker Compose | Podman, containerd |
| **Cloud Provider** | AWS (ECS Fargate) | Azure (ACA), GCP (Cloud Run) |
| **IaC** | Terraform | Pulumi, CloudFormation, CDK |
| **CI/CD** | GitHub Actions | GitLab CI, Jenkins, CircleCI |
| **Logging** | Loguru (structured JSON) | structlog, Python logging |
| **Monitoring** | CloudWatch + Prometheus | Datadog, Grafana Cloud |

### Domain Customization Points

Throughout all plans, look for these placeholder patterns:

| Placeholder | Description | AuditGH Example |
|------------|-------------|-----------------|
| `{PROJECT_NAME}` | Project name | AuditGH |
| `{DOMAIN_MODELS}` | Core domain entities | Finding, Repository, ScanRun |
| `{DOMAIN_ROUTERS}` | API endpoint groups | findings, scans, repositories |
| `{DOMAIN_SERVICES}` | Business logic modules | scanner, ai_agent, reporting |
| `{SCANNER_TOOLS}` | Domain-specific tools | Gitleaks, Trivy, Semgrep |
| `{AI_PROVIDERS}` | LLM integrations | Claude, GPT-4, Ollama |
| `{TENANT_ENTITY}` | Multi-tenant root | Organization |
| `{ROLE_HIERARCHY}` | RBAC roles | super_admin, admin, analyst, manager, user |

---

## 2. Implementation Phases

### Phase Map

```
Phase 1:  PROJECT BOOTSTRAP ──────────────────────────────── Week 1
          Repo init, scaffolding, tooling, dev environment

Phase 2:  DATABASE FOUNDATION ─────────────────────────────── Week 1-2
          Schema design, models, migrations, seeds

Phase 3:  API SKELETON ────────────────────────────────────── Week 2-3
          FastAPI setup, OpenAPI spec, routers, middleware
          └── Reference: API_FIRST_IMPLEMENTATION_PLAN.md

Phase 4:  AUTHENTICATION & AUTHORIZATION ──────────────────── Week 3-5
          OIDC, sessions, RBAC, invitations, tokens
          └── Reference: OIDC_AUTHN_IMPLEMENTATION_PLAN.md

Phase 5:  DOCKER & LOCAL DEVELOPMENT ──────────────────────── Week 2 (parallel)
          Dockerfiles, Compose, hot reload, health checks

Phase 6:  FRONTEND FOUNDATION ─────────────────────────────── Week 4-6
          Next.js setup, components, auth integration

Phase 7:  DOMAIN FEATURES, AI & SCANNER ARCHITECTURE ───── Week 5-8
          {DOMAIN_SERVICES}, {DOMAIN_ROUTERS}, business logic
          └── AI Reference: AI_ARCHITECTURE_PLAN.md
          └── Scanner Reference: SCANNER_TOOL_IMPLEMENTATION_PLAN.md

Phase 8:  TESTING ─────────────────────────────────────────── Ongoing
          Unit, integration, E2E, contract tests

Phase 9:  SECURITY HARDENING ──────────────────────────────── Week 7-8
          OWASP, headers, scanning, encryption

Phase 10: CI/CD PIPELINE ─────────────────────────────────── Week 6-7
          Build, test, deploy automation

Phase 11: INFRASTRUCTURE ──────────────────────────────────── Week 7-9
          Terraform modules, AWS provisioning

Phase 12: MONITORING & OBSERVABILITY ──────────────────────── Week 8-9
          Logging, metrics, alerting, health checks

Phase 13: PRODUCTION DEPLOYMENT ───────────────────────────── Week 9-10
          Deployment automation, runbooks, validation

Phase 14: DOCUMENTATION & HANDOFF ─────────────────────────── Week 10
          CLAUDE.md, CHANGELOG.md, README, API docs
          └── Reference: CLAUDE_MD_TEMPLATE.md
          └── Reference: CHANGELOG_MD_TEMPLATE.md
```

### Phase Dependencies

```
Phase 1 (Bootstrap)
  ├── Phase 2 (Database)
  │     └── Phase 3 (API) ──── Phase 4 (Auth) ──── Phase 7 (Domain)
  │                                                       │
  ├── Phase 5 (Docker) ◄──── can start after Phase 1 ────┘
  │     │
  │     └── Phase 6 (Frontend) ──── Phase 7 (Domain)
  │
  ├── Phase 8 (Testing) ◄──── ongoing from Phase 3 onward
  │
  ├── Phase 9 (Security) ◄──── after Phase 4 + Phase 7
  │
  ├── Phase 10 (CI/CD) ◄──── after Phase 5 + Phase 8
  │     │
  │     └── Phase 11 (Infrastructure) ──── Phase 13 (Deploy)
  │
  ├── Phase 12 (Monitoring) ◄──── after Phase 3
  │
  └── Phase 14 (Documentation) ◄──── after all phases
```

---

## 3. Plan Index

### Existing Plans (Reference Only)

These plans are complete and should be followed as-is:

| Plan | File | Covers |
|------|------|--------|
| **API-First Architecture** | `API_FIRST_IMPLEMENTATION_PLAN.md` | OpenAPI spec, router organization, request/response models, error handling, pagination, middleware stack, rate limiting, CORS, versioning, developer sandbox, SDK generation, contract testing |
| **OIDC Authentication** | `OIDC_AUTHN_IMPLEMENTATION_PLAN.md` | OIDC providers, auth router, session management, RBAC, invitations, JWT tokens, break glass, API keys, device flow, rate limiting, frontend auth, bootstrap |
| **CLAUDE.md Template** | `CLAUDE_MD_TEMPLATE.md` | Project configuration for Claude Code: critical rules, project structure, dev workflow, conventions, troubleshooting |
| **CHANGELOG Template** | `CHANGELOG_MD_TEMPLATE.md` | Changelog format (Keep a Changelog), versioning guide, release workflow |

### New Plans (Created by This Document)

These plans fill gaps not covered by existing plans:

| Plan | File | Phase |
|------|------|-------|
| **Project Bootstrap** | `PROJECT_BOOTSTRAP_PLAN.md` | Phase 1 |
| **Database Design** | `DATABASE_DESIGN_PLAN.md` | Phase 2 |
| **Frontend Implementation** | `FRONTEND_IMPLEMENTATION_PLAN.md` | Phase 6 |
| **Docker & Containerization** | `DOCKER_CONTAINERIZATION_PLAN.md` | Phase 5 |
| **Infrastructure (Terraform/AWS)** | `INFRASTRUCTURE_PLAN.md` | Phase 11 |
| **CI/CD Pipeline** | `CICD_PIPELINE_PLAN.md` | Phase 10 |
| **Testing Strategy** | `TESTING_STRATEGY_PLAN.md` | Phase 8 |
| **Monitoring & Observability** | `MONITORING_OBSERVABILITY_PLAN.md` | Phase 12 |
| **Security Hardening** | `SECURITY_HARDENING_PLAN.md` | Phase 9 |
| **AI Architecture** | `AI_ARCHITECTURE_PLAN.md` | Phase 7 |
| **Scanner Tool Architecture** | `SCANNER_TOOL_IMPLEMENTATION_PLAN.md` | Phase 7 |

---

## 4. Phase Execution Order

### Phase 1: Project Bootstrap
**Plan:** `PROJECT_BOOTSTRAP_PLAN.md`
**Duration:** 2-3 days
**Prerequisites:** None

**Deliverables:**
- [ ] Git repository initialized with branch strategy
- [ ] Python project structure (`src/api/`, `src/auth/`, `src/rbac/`, `src/services/`)
- [ ] Next.js project scaffolded (`src/web-ui/`)
- [ ] `requirements.txt` with pinned dependencies
- [ ] `package.json` with pinned dependencies
- [ ] `.env.sample` with all variables documented (no secrets)
- [ ] `Makefile` with standard targets
- [ ] `.gitignore` covering Python, Node.js, IDE, environment files
- [ ] Pre-commit hooks configured (black, isort, eslint, prettier)
- [ ] `CLAUDE.md` created from `CLAUDE_MD_TEMPLATE.md`
- [ ] `CHANGELOG.md` created from `CHANGELOG_MD_TEMPLATE.md`

**Validation:** `make setup && make check` passes

---

### Phase 2: Database Foundation
**Plan:** `DATABASE_DESIGN_PLAN.md`
**Duration:** 3-5 days
**Prerequisites:** Phase 1

**Deliverables:**
- [ ] SQLAlchemy Base model with common mixins (timestamps, soft delete, tenant scoping)
- [ ] Core domain models defined (`src/api/models.py`)
- [ ] Alembic initialized and configured (`alembic.ini`, `migrations/`)
- [ ] Initial migration generated and tested
- [ ] Database connection management (`src/api/database.py`)
- [ ] Multi-tenant data isolation pattern (if applicable)
- [ ] Seed scripts for development data (`scripts/`)
- [ ] Database health check endpoint

**Validation:** `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` succeeds

---

### Phase 3: API Skeleton
**Plan:** `API_FIRST_IMPLEMENTATION_PLAN.md` (existing)
**Duration:** 5-7 days
**Prerequisites:** Phase 2

**Deliverables:**
- [ ] FastAPI application entry point (`src/api/main.py`)
- [ ] OpenAPI specification defined
- [ ] Router structure matching domain entities
- [ ] Pydantic request/response schemas (`src/api/schemas/`)
- [ ] Error handling middleware with consistent format
- [ ] Pagination utilities
- [ ] Health check endpoints (`/health`, `/health/ready`, `/health/live`)
- [ ] CORS configuration
- [ ] Request/response logging middleware
- [ ] Swagger UI and ReDoc available at `/docs` and `/redoc`

**Validation:** OpenAPI spec validates, all health endpoints return 200

---

### Phase 4: Authentication & Authorization
**Plan:** `OIDC_AUTHN_IMPLEMENTATION_PLAN.md` (existing)
**Duration:** 7-10 days
**Prerequisites:** Phase 3

**Deliverables:**
- [ ] OIDC provider registration (dynamic, multi-provider)
- [ ] Auth router with login, callback, logout, me endpoints
- [ ] PKCE enforcement on all OAuth flows
- [ ] Redis-backed session management (dual timeout)
- [ ] RBAC system with role hierarchy
- [ ] Auth middleware and FastAPI dependencies
- [ ] Invitation system with email integration
- [ ] JWT token management (access + refresh with rotation)
- [ ] Break glass emergency access
- [ ] API key authentication
- [ ] Rate limiting on auth endpoints
- [ ] Auth audit logging
- [ ] Bootstrap script for initial admin accounts

**Validation:** Full OIDC login flow works with mock provider, RBAC blocks unauthorized access

---

### Phase 5: Docker & Local Development
**Plan:** `DOCKER_CONTAINERIZATION_PLAN.md`
**Duration:** 2-3 days (can start in parallel with Phase 3)
**Prerequisites:** Phase 1

**Deliverables:**
- [ ] `Dockerfile.api` — Multi-stage build for FastAPI
- [ ] `Dockerfile.ui` — Multi-stage build for Next.js
- [ ] `Dockerfile.scanner` — Domain-specific tool container (if applicable)
- [ ] `docker-compose.yml` — Full local development stack
- [ ] Health checks for all services
- [ ] Hot reload for API and UI in development
- [ ] Volume mounts for development code
- [ ] Mock OIDC provider service (for local auth)
- [ ] MailHog service (for email testing)
- [ ] `.dockerignore` files

**Validation:** `docker compose up -d` starts all services healthy within 60 seconds

---

### Phase 6: Frontend Foundation
**Plan:** `FRONTEND_IMPLEMENTATION_PLAN.md`
**Duration:** 7-10 days
**Prerequisites:** Phase 3, Phase 4

**Deliverables:**
- [ ] Next.js App Router structure
- [ ] shadcn/ui component library initialized
- [ ] Tailwind CSS configured with theme tokens
- [ ] Authentication context (`AuthContext.tsx`)
- [ ] Tenant context (`TenantContext.tsx`) — if multi-tenant
- [ ] Login page with OIDC provider selection
- [ ] Protected route wrapper
- [ ] Navigation sidebar
- [ ] User navigation with role display
- [ ] API client utility with credentials handling
- [ ] RBAC helpers for conditional rendering
- [ ] Light/dark mode toggle
- [ ] Responsive layout (mobile + desktop)
- [ ] Custom hooks (`useMobile`, `useDashboardLayout`, `useWidgetData`)

**Validation:** Login flow works end-to-end, role-based rendering verified

---

### Phase 7: Domain Features, AI & Scanner Architecture
**Plans:** Project-specific domain logic + `AI_ARCHITECTURE_PLAN.md` + `SCANNER_TOOL_IMPLEMENTATION_PLAN.md`
**Duration:** Variable (2-8 weeks depending on complexity)
**Prerequisites:** Phase 3, Phase 4, Phase 6

This phase implements your application's core business logic. In AuditGH, this included:

| Feature Area | Routers | Models | Components |
|-------------|---------|--------|------------|
| `{DOMAIN_FEATURE_1}` | e.g., `findings.py`, `scans.py` | `Finding`, `ScanRun` | `SecurityReportModal` |
| `{DOMAIN_FEATURE_2}` | e.g., `repositories.py` | `Repository` | `RepositoryHealthWidget` |
| `{DOMAIN_FEATURE_3}` | e.g., `ai.py`, `ai_chat.py` | `CommitAnalysis` | `AskAIDialog` |
| `{DOMAIN_FEATURE_4}` | e.g., `scheduler.py` | `ScanSchedule` | `SchedulerCalendar` |

**Implementation pattern per feature:**
1. Define/extend database models
2. Create Alembic migration
3. Implement API router with CRUD + business logic
4. Add Pydantic schemas for request/response
5. Implement frontend page and components
6. Write tests (unit + integration)
7. Update OpenAPI spec if needed

#### AI Architecture (if applicable)

For applications with AI/LLM-powered features, follow `AI_ARCHITECTURE_PLAN.md` which covers:

| AI Component | Plan Section | Key Deliverables |
|-------------|-------------|-----------------|
| Provider Abstraction | §2 | Multi-provider layer (Claude, OpenAI, Gemini, Ollama, Docker AI, Azure Foundry) |
| Agent Frameworks | §3-5 | Claude Agent SDK (primary), LangGraph (alt), Raw API (fallback) |
| Sub-Agent Orchestration | §6 | Supervisor, Pipeline, Swarm, and Hybrid patterns |
| MCP Server | §7 | Expose app data/actions as tools via Model Context Protocol |
| MCP Client | §8 | Consume external MCP servers (GitHub, filesystem, databases) |
| Skills Registry | §9 | Composable, versioned AI skills (triage, remediation, investigation) |
| Tool Definitions | §10 | Database search tools, external API tools, function calling |
| Prompt Engineering | §11 | Role-based prompts, structured output, context window management |
| Analysis Pipeline | §12 | ReasoningEngine (plan → execute → synthesize with tool use) |
| Conversations | §13 | Multi-turn persistence, citation tracking |
| Cost & Budget | §14 | Per-provider tracking, user/org daily limits, budget alerts |
| Failover & Resilience | §15 | Circuit breaker, retry, graceful degradation (5 levels) |
| Security Guardrails | §16 | Prompt injection detection, output validation, PII redaction |
| AI Monitoring | §17 | Token/cost metrics, provider health, OpenTelemetry tracing |
| AI Database Models | §18 | AIConversation, AIMessage, AICitation, ComponentAnalysis, ProviderUsage |
| AI API Endpoints | §19 | `/ai/triage`, `/ai/remediate`, `/ai/zero-day`, `/ai/skills/*` |

**AI-specific deliverables:**
- [ ] Provider abstraction with at least 2 providers configured
- [ ] Failover chain (cloud provider → local fallback)
- [ ] MCP server exposing domain tools
- [ ] Skills registry with built-in skills
- [ ] ReasoningEngine for tool-use analysis loops
- [ ] AI database models and migrations
- [ ] AI API endpoints with RBAC and rate limiting
- [ ] Cost tracking with budget limits
- [ ] Prompt injection detection enabled
- [ ] AI audit logging to database

#### Scanner Tool Architecture (if applicable)

For applications with scanner/tool integration, follow `SCANNER_TOOL_IMPLEMENTATION_PLAN.md` which covers:

| Scanner Component | Plan Section | Key Deliverables |
|-------------------|-------------|-----------------|
| Plugin Architecture | §2 | BaseScanner abstract class, ScannerRegistry, categories, execution modes |
| Execution Models | §3 | SubprocessRunner (safe timeout), ContainerRunner (Docker isolation), RemoteRunner (SaaS API) |
| SARIF Normalization | §4 | SARIF v2.1.0 import/export, scanner-specific parsers, severity mapping |
| Repository Management | §5 | Shallow clone, token auth, per-scan isolation, cleanup |
| Technology Detection | §6 | Language/framework/IaC/package manager detection from file analysis |
| Scanner Implementations | §7 | Semgrep, Gitleaks, Trivy, Bandit, Checkov, Grype, TruffleHog + custom |
| Scan Orchestration | §8 | Clone → detect → select → execute → deduplicate → ingest pipeline |
| Progress Monitoring | §9 | CPU tracking, output line counting, idle detection, scanner keywords |
| Result Ingestion | §10 | Fingerprint-based upsert, auto-resolution, severity aggregation |
| Scan Scheduling | §11 | APScheduler with cron triggers, time windows, failure tracking |
| Scanner Configuration | §12 | Per-org overrides, enable/disable, custom rules |
| Docker Container | §13 | Multi-stage multi-arch build with 30+ tools, isolated Python venvs |
| Remote/SaaS Integration | §14 | Snyk, SonarCloud, GitHub Advanced Security, webhook receivers |
| Database Models | §15 | ScanRun, Finding, ScanSchedule, ScannerConfigDB + Alembic migration |
| API Endpoints | §16 | Scans CRUD, Findings filter/export, Scanner registry, Schedule CRUD, Webhooks |

**Scanner-specific deliverables:**
- [ ] BaseScanner plugin architecture with ScannerRegistry
- [ ] At least 3 scanner implementations (subprocess + container modes)
- [ ] SARIF import/export for interoperability
- [ ] Technology detection for automatic scanner selection
- [ ] Scan orchestration pipeline (clone → detect → execute → ingest)
- [ ] Fingerprint-based finding deduplication
- [ ] Scanner Docker container built and verified
- [ ] Result ingestion with auto-resolution of disappeared findings
- [ ] Scan scheduling with cron triggers
- [ ] API endpoints for scan management and findings
- [ ] Remote scanner integration (at least 1 SaaS provider)
- [ ] Progress monitoring for long-running scans

**Validation:** Each feature has API tests passing and UI renders correctly; AI analysis completes end-to-end with tool use; Scanner pipeline executes against a test repo and ingests findings

---

### Phase 8: Testing
**Plan:** `TESTING_STRATEGY_PLAN.md`
**Duration:** Ongoing (start at Phase 3, formalize by Phase 8)
**Prerequisites:** Phase 3

**Deliverables:**
- [ ] pytest configured with fixtures (`tests/conftest.py`)
- [ ] Unit tests for all business logic
- [ ] Integration tests for API endpoints
- [ ] Multi-tenant isolation tests
- [ ] RBAC enforcement tests
- [ ] Auth flow tests (OIDC, API key, device flow)
- [ ] Data integrity tests
- [ ] Frontend component tests (Jest + React Testing Library)
- [ ] E2E tests (Playwright) for critical paths
- [ ] Contract tests (Schemathesis for OpenAPI fuzzing)
- [ ] Coverage reporting (>80% for business logic)
- [ ] Test database isolation strategy

**Validation:** `pytest tests/ -v` all green, coverage >80%

---

### Phase 9: Security Hardening
**Plan:** `SECURITY_HARDENING_PLAN.md`
**Duration:** 3-5 days
**Prerequisites:** Phase 4, Phase 7

**Deliverables:**
- [ ] Security headers middleware (CSP, HSTS, X-Frame-Options, etc.)
- [ ] Input validation at all system boundaries
- [ ] SQL injection prevention (parameterized queries verified)
- [ ] XSS prevention (output encoding, CSP)
- [ ] CSRF protection
- [ ] Rate limiting on all endpoints (not just auth)
- [ ] Dependency vulnerability scanning in CI
- [ ] Secrets scanning (pre-commit + CI)
- [ ] Data redaction for sensitive fields in logs
- [ ] Encryption at rest (database) and in transit (TLS)
- [ ] Security audit logging
- [ ] OWASP Top 10 compliance checklist

**Validation:** OWASP ZAP scan produces no high/critical findings

---

### Phase 10: CI/CD Pipeline
**Plan:** `CICD_PIPELINE_PLAN.md`
**Duration:** 3-5 days
**Prerequisites:** Phase 5, Phase 8

**Deliverables:**
- [ ] GitHub Actions workflow: lint + type-check
- [ ] GitHub Actions workflow: test (unit + integration)
- [ ] GitHub Actions workflow: build Docker images
- [ ] GitHub Actions workflow: push to container registry (ECR)
- [ ] GitHub Actions workflow: deploy to staging
- [ ] GitHub Actions workflow: deploy to production (manual approval)
- [ ] Branch protection rules (PR required, tests must pass)
- [ ] Secret management (GitHub Secrets, AWS Secrets Manager)
- [ ] Build caching (Docker layer cache, pip cache, npm cache)
- [ ] Rollback procedure documented and tested
- [ ] Deployment notifications (Slack/Teams)

**Validation:** Push to main triggers full pipeline, staging deploys automatically

---

### Phase 11: Infrastructure
**Plan:** `INFRASTRUCTURE_PLAN.md`
**Duration:** 5-7 days
**Prerequisites:** Phase 10

**Deliverables:**
- [ ] Terraform module: VPC (public/private subnets, NAT gateway)
- [ ] Terraform module: Security Groups
- [ ] Terraform module: RDS (PostgreSQL, multi-AZ)
- [ ] Terraform module: ElastiCache (Redis, cluster mode)
- [ ] Terraform module: ECR (container registry)
- [ ] Terraform module: ECS Cluster (Fargate)
- [ ] Terraform module: ECS Service (API, UI, workers)
- [ ] Terraform module: ALB (HTTPS, path-based routing)
- [ ] Terraform module: IAM (task roles, execution roles)
- [ ] Terraform module: S3 (logs, reports, backups)
- [ ] Environment separation (dev, staging, prod)
- [ ] Remote state management (S3 + DynamoDB locking)
- [ ] DNS and SSL certificate management (Route 53, ACM)

**Validation:** `terraform plan` shows clean apply, `terraform apply` provisions stack

---

### Phase 12: Monitoring & Observability
**Plan:** `MONITORING_OBSERVABILITY_PLAN.md`
**Duration:** 3-5 days
**Prerequisites:** Phase 3, Phase 11

**Deliverables:**
- [ ] Structured JSON logging to CloudWatch
- [ ] Request ID propagation across services
- [ ] Application metrics (request count, latency, error rate)
- [ ] Database metrics (connection pool, query duration)
- [ ] Redis metrics (hit rate, memory usage)
- [ ] Health check dashboard
- [ ] Alerting rules (5xx spike, latency P99, disk/memory)
- [ ] Error tracking integration (Sentry or equivalent)
- [ ] Uptime monitoring for public endpoints
- [ ] Log retention and archival policy
- [ ] Runbook for common alerts

**Validation:** Trigger a 500 error, verify alert fires within 5 minutes

---

### Phase 13: Production Deployment
**Plan:** Combination of `INFRASTRUCTURE_PLAN.md` + `CICD_PIPELINE_PLAN.md`
**Duration:** 2-3 days
**Prerequisites:** Phase 10, Phase 11, Phase 12

**Deliverables:**
- [ ] Production environment provisioned via Terraform
- [ ] Database migrations applied
- [ ] Bootstrap scripts run (admin accounts, RBAC seeds)
- [ ] OIDC provider configured (Entra ID redirect URIs registered)
- [ ] Environment variables set in production
- [ ] SSL certificate active
- [ ] DNS records configured
- [ ] Smoke tests passing
- [ ] Post-deployment validation script run
- [ ] Rollback tested and documented

**Validation:** `scripts/validate_post_deployment.py` passes all checks

---

### Phase 14: Documentation & Handoff
**Plan:** `CLAUDE_MD_TEMPLATE.md` + `CHANGELOG_MD_TEMPLATE.md` (existing)
**Duration:** 1-2 days
**Prerequisites:** All phases complete

**Deliverables:**
- [ ] `CLAUDE.md` customized from template
- [ ] `CHANGELOG.md` populated with initial release
- [ ] `README.md` with setup instructions, architecture, contributing guide
- [ ] `.env.sample` up to date with all variables
- [ ] API documentation generated and published
- [ ] Operational runbook for common tasks
- [ ] Architecture decision records (ADRs) for key decisions
- [ ] Onboarding guide for new developers

**Validation:** New developer can set up and run the project in <30 minutes using only docs

---

## 5. Cross-Cutting Concerns

These concerns span multiple phases and must be addressed throughout:

### Multi-Tenancy (if applicable)
- **Phase 2:** Add `{TENANT_ENTITY}_id` foreign key to all tenant-scoped models
- **Phase 3:** Add tenant context middleware, extract from request
- **Phase 4:** Scope RBAC roles per tenant
- **Phase 6:** Add tenant switcher component, TenantContext
- **Phase 8:** Write tenant isolation tests
- **Phase 11:** Consider per-tenant database or schema isolation

### Audit Logging
- **Phase 2:** Create `AuditLog` model
- **Phase 4:** Log all auth events
- **Phase 7:** Log all data mutations
- **Phase 9:** Ensure audit logs cannot be tampered with
- **Phase 12:** Route audit logs to immutable storage

### Error Handling
- **Phase 3:** Define error response format (`{"detail": "...", "code": "..."}`)
- **Phase 4:** Auth-specific error codes
- **Phase 6:** Frontend error boundaries and toast notifications
- **Phase 9:** Ensure errors don't leak internal details
- **Phase 12:** Track error rates and alert on spikes

### Performance
- **Phase 2:** Add indexes for common query patterns
- **Phase 3:** Implement pagination on all list endpoints
- **Phase 5:** Set resource limits in Docker Compose
- **Phase 6:** Use React.memo, useMemo for expensive renders
- **Phase 8:** Add performance benchmarks to test suite
- **Phase 11:** Configure auto-scaling policies
- **Phase 12:** Monitor P50/P95/P99 latency

---

## 6. Customization Guide

### Adapting for Your Domain

1. **Replace placeholders** — Search all plans for `{PLACEHOLDER}` patterns and replace with your domain values.

2. **Identify your domain models** — Map your business entities to the model patterns in `DATABASE_DESIGN_PLAN.md`. AuditGH has 40+ models; most projects need 10-20 core models initially.

3. **Select your routers** — Use the router organization from `API_FIRST_IMPLEMENTATION_PLAN.md`. Create one router per domain aggregate.

4. **Choose your auth complexity** — The full `OIDC_AUTHN_IMPLEMENTATION_PLAN.md` implements 14 phases. For simpler apps:
   - **Minimum:** Phases 1-6 (OIDC + Sessions + RBAC)
   - **Standard:** Phases 1-9 (adds tokens, break glass, API keys)
   - **Full:** All 14 phases (adds device flow, rate limiting, frontend auth)

5. **Adapt infrastructure** — The `INFRASTRUCTURE_PLAN.md` targets AWS ECS. Swap Terraform modules for your cloud provider:
   - **Azure:** ACA, Azure DB for PostgreSQL, Azure Cache for Redis
   - **GCP:** Cloud Run, Cloud SQL, Memorystore

### Feature Matrix

Check which features your application needs:

| Feature | Simple App | Standard App | Enterprise App |
|---------|:----------:|:------------:|:--------------:|
| OIDC SSO | Required | Required | Required |
| Session management | Required | Required | Required |
| RBAC (roles) | Optional | Required | Required |
| Multi-tenancy | No | Optional | Required |
| API key auth | No | Optional | Required |
| Device flow (CLI) | No | No | Optional |
| Break glass access | No | No | Required |
| JWT tokens | No | Optional | Required |
| Invitation system | No | Required | Required |
| AI/LLM integration | No | Optional | Optional | → `AI_ARCHITECTURE_PLAN.md` |
| Scanner/tool pipeline | No | Optional | Optional | → `SCANNER_TOOL_IMPLEMENTATION_PLAN.md` |
| Scheduled jobs | No | Optional | Required |
| PDF/DOCX reports | No | Optional | Required |

---

## 7. Validation Checkpoints

### Checkpoint 1: Foundation (After Phase 2)
- [ ] `docker compose up db` starts PostgreSQL
- [ ] `alembic upgrade head` creates all tables
- [ ] Models can be imported without errors
- [ ] Seed data loads successfully

### Checkpoint 2: API Working (After Phase 4)
- [ ] All health endpoints return 200
- [ ] OIDC login flow works end-to-end
- [ ] RBAC blocks unauthorized access
- [ ] API returns proper error responses
- [ ] OpenAPI spec serves at `/docs`

### Checkpoint 3: Full Stack (After Phase 6)
- [ ] Frontend renders login page
- [ ] OIDC login redirects and completes
- [ ] Authenticated pages show user info
- [ ] Role-based UI rendering works
- [ ] API calls from frontend succeed with credentials

### Checkpoint 4: Feature Complete (After Phase 7)
- [ ] All domain features accessible via UI
- [ ] CRUD operations work for all entities
- [ ] Search and filtering functional
- [ ] Data export/reporting works

### Checkpoint 5: Production Ready (After Phase 12)
- [ ] CI/CD pipeline deploys to staging automatically
- [ ] All tests pass (unit, integration, E2E)
- [ ] Security scan produces no critical/high findings
- [ ] Monitoring alerts fire correctly
- [ ] Infrastructure provisioned and validated
- [ ] Rollback procedure tested

---

## Appendix: AuditGH Reference Architecture

### Component Inventory

| Category | Count | Key Items |
|----------|-------|-----------|
| **Database Models** | 40+ | Organization, Repository, Finding, ScanRun, User, ApiKey, ScanSchedule |
| **API Routers** | 30 | auth, findings, repositories, scans, users, organizations, ai, scheduler, api_audit |
| **Frontend Components** | 48+ | SecurityReportModal, APIAuditView, SchedulerCalendar, AskAIDialog |
| **UI Primitives** | 30 | Button, Dialog, Card, Table, Tabs, Toast, Select (shadcn/ui) |
| **Contexts** | 2 | AuthContext, TenantContext |
| **Custom Hooks** | 3 | useMobile, useDashboardLayout, useWidgetData |
| **Auth Methods** | 5 | OIDC, API Key, Break Glass, Device Flow, Session |
| **RBAC Roles** | 5 | super_admin, admin, analyst, manager, user |
| **Terraform Modules** | 10 | VPC, ALB, ECR, ECS, RDS, ElastiCache, IAM, S3, SG |
| **Scanner Tools** | 30+ | Gitleaks, Trivy, Semgrep, Grype, Bandit, Checkov, CodeQL, TruffleHog, Whispers, Terrascan, gosec → `SCANNER_TOOL_IMPLEMENTATION_PLAN.md` |
| **AI Providers** | 6 | Claude (Anthropic), GPT-4/5 (OpenAI), Gemini (Google), Ollama (local), Docker AI, Azure AI Foundry |
| **Test Files** | 7 | RBAC, tenant isolation, device flow, data integrity, ingestion |

### AuditGH-Specific Features (Not in Templates)

These features are domain-specific to AuditGH and would need custom implementation for your domain:

1. **Security Scanner Integration** — 20+ tool integrations with result normalization → See `SCANNER_TOOL_IMPLEMENTATION_PLAN.md` for templated patterns
2. **AI Analysis Engine** — Multi-provider LLM with failover, RAG, chat → See `AI_ARCHITECTURE_PLAN.md` for templated patterns
3. **Finding Lifecycle** — Discovery → Triage → Investigation → Remediation → Closure
4. **Repository Cloning & Analysis** — Git clone, tech detection, architecture analysis
5. **Scan Scheduling** — AI-optimized scheduling with manual overrides
6. **Attack Surface Analysis** — API discovery, credential correlation, outbound mapping
7. **SBOM Generation** — Software Bill of Materials from dependency scanning
8. **Report Generation** — PDF/DOCX executive reports with risk scoring
9. **Jira Integration** — Ticket creation from findings
10. **Contributor Profiling** — Developer activity and risk analysis

### Key Architectural Decisions in AuditGH

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo vs Polyrepo | Monorepo | Single deployment unit, shared models |
| Session vs JWT | Both | Sessions for web, JWT for API/CLI |
| Multi-tenant pattern | Shared DB, org_id scoping | Simpler than schema-per-tenant for <100 tenants |
| Migration strategy | SQL + Alembic hybrid | SQL for DBA review, Alembic for model changes |
| AI provider pattern | Abstract base + failover | Vendor independence, resilience |
| Frontend state | React Context | Sufficient for auth/tenant; no Redux overhead |
| Component library | shadcn/ui + Radix | Customizable, accessible, no runtime CSS-in-JS |
| Scan execution | Separate container | Isolation for security tools, independent scaling |

---

## Quick Start Checklist

For a minimal viable deployment, execute these phases in order:

```
1. PROJECT_BOOTSTRAP_PLAN.md          → Repo and tooling
2. DATABASE_DESIGN_PLAN.md            → Models and migrations
3. API_FIRST_IMPLEMENTATION_PLAN.md   → API skeleton (Phases 1-5)
4. OIDC_AUTHN_IMPLEMENTATION_PLAN.md  → Auth (Phases 1-6 minimum)
5. DOCKER_CONTAINERIZATION_PLAN.md    → Local stack
6. FRONTEND_IMPLEMENTATION_PLAN.md    → UI foundation
7. [Your domain features]             → Business logic
   AI_ARCHITECTURE_PLAN.md            → AI agents, MCP, skills (if applicable)
   SCANNER_TOOL_IMPLEMENTATION_PLAN.md → Scanner plugins, SARIF, orchestration (if applicable)
8. TESTING_STRATEGY_PLAN.md           → Test coverage
9. SECURITY_HARDENING_PLAN.md         → Security review
10. CICD_PIPELINE_PLAN.md             → Deployment automation
11. INFRASTRUCTURE_PLAN.md            → Cloud provisioning
12. MONITORING_OBSERVABILITY_PLAN.md  → Production monitoring
```

Total estimated duration: **8-12 weeks** for a team of 2-3 engineers.

---

*Generated from AuditGH reference architecture. All plans available in `mocksvcs/plans/`.*
