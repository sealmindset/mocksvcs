# CHANGELOG.md Template

> **Usage:** Copy this file to `CHANGELOG.md` in your project root. Follow the format below for each release. Remove all `<!-- TEMPLATE: -->` comments after customizing.

---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
VERSIONING GUIDE:
  MAJOR (X.0.0) — Breaking changes (API contract changes, DB schema breaks, auth flow changes)
  MINOR (0.X.0) — New features, backward-compatible additions
  PATCH (0.0.X) — Bug fixes, security patches, dependency updates

SECTION ORDER (use only sections that apply):
  ### Added       — New features
  ### Changed     — Changes to existing functionality
  ### Deprecated  — Features that will be removed in future versions
  ### Removed     — Features removed in this version
  ### Fixed       — Bug fixes
  ### Security    — Vulnerability fixes and security improvements
  ### Migration   — Database migrations or breaking changes requiring action
  ### Infrastructure — DevOps, CI/CD, Docker, deployment changes
-->

## [Unreleased]

### Added
- <!-- Track upcoming changes here as you develop -->

---

<!-- TEMPLATE: Below are example entries showing proper format. Replace with your actual releases. -->

## [2.1.0] - 2026-02-27

### Added
- OIDC authentication with Microsoft Entra ID and generic OIDC provider support
- PKCE (S256) enforcement on all OAuth flows for authorization code security
- RBAC system with 5-tier role hierarchy (super_admin, admin, analyst, manager, user)
- Email-based invitation system with 7-day expiring tokens
- Break glass emergency authentication for disaster recovery scenarios
- API key authentication with SHA256 hashing and per-key rate limiting
- OAuth 2.0 Device Flow (RFC 8628) for CLI tool authentication
- Redis-backed session management with dual timeout (8h absolute, 30m idle)
- JWT token rotation with one-time-use enforcement and revocation
- Rate limiting on authentication endpoints (5/min login, 3/min break glass)
- Auth audit logging for all authentication events
- Session cleanup background job (runs every 5 minutes)
- Security headers middleware (CSP, HSTS, X-Frame-Options, etc.)
- Frontend AuthContext with role-based rendering and session polling

### Changed
- Auth callback now redirects to `APP_URL` instead of `/` to support separate frontend
- Provider registration includes `code_challenge_method: 'S256'` in client_kwargs

### Fixed
- PKCE code_challenge not sent to Entra ID during authorization (AADSTS501471)
- Post-login redirect staying on API port instead of frontend
- Missing `models/` directory in API Docker image causing ModuleNotFoundError

### Security
- Enforced email_verified claim validation before trusting OIDC email
- Added provider name whitelist validation to prevent arbitrary provider injection
- Restricted break glass access to single designated email address
- Implemented token blacklist for instant revocation across all instances

### Migration
- Run `python -m src.auth.bootstrap` to create initial admin accounts
- Run `python -m src.rbac.seeds` to seed RBAC roles and permissions
- Register redirect URI in Entra ID: `http://localhost:8000/auth/callback/entra`
- New environment variables required: `SESSION_SECRET`, `JWT_SECRET_KEY`, `ENTRA_*`

### Infrastructure
- Added `COPY models/ /app/models/` to Dockerfile.api for models module
- Added session-cleanup service to docker-compose.yml
- Added Redis health check dependency for API container startup

---

## [2.0.0] - 2026-02-15

### Added
- Multi-tenant support with organization-level data isolation
- Web dashboard (Next.js) for viewing and managing security findings
- FastAPI backend with OpenAPI documentation
- AI-powered analysis using Claude, GPT-4, and Ollama
- Scheduled scanning with cron-based job scheduler
- PDF and DOCX report generation
- PostgreSQL database with Alembic migrations
- Redis caching for session and permission data

### Changed
- Migrated from CLI-only to full web application architecture
- Reorganized project structure: `src/api/`, `src/auth/`, `src/rbac/`, `src/web-ui/`

### Removed
- Legacy single-tenant scanning mode (replaced by multi-tenant)

### Migration
- **Breaking:** Database schema changes require fresh migration
  ```bash
  docker exec app python -m alembic upgrade head
  ```
- **Breaking:** Environment variables renamed from `DATABASE_URL` to `POSTGRES_*` format
- See `.env.sample` for complete variable reference

### Infrastructure
- Added Docker Compose with 5 services (API, UI, DB, Redis, Scanner)
- Added Terraform modules for AWS deployment (VPC, ECS, RDS, ElastiCache)
- Added GitHub Actions CI/CD pipeline

---

## [1.0.0] - 2026-01-10

### Added
- Initial release: GitHub repository security scanner
- Secret scanning with Gitleaks, TruffleHog, and Whispers
- Vulnerability scanning with Grype, Trivy, and OSV
- Static analysis with Semgrep, CodeQL, and Bandit
- Infrastructure-as-Code scanning with Checkov, Trivy, and Terrascan
- Go-specific scanning with gosec and govulncheck
- CLI interface for scanning GitHub organizations
- JSON report output with severity classification

---

<!--
TEMPLATE INSTRUCTIONS — DELETE BELOW THIS LINE
================================================

HOW TO WRITE GOOD CHANGELOG ENTRIES:

1. Write for humans, not machines
   BAD:  "Updated auth.py"
   GOOD: "Auth callback now redirects to frontend URL instead of API root"

2. Lead with WHAT changed, then WHY
   BAD:  "Fixed bug"
   GOOD: "Fixed PKCE code_challenge not sent to Entra ID, causing AADSTS501471 error"

3. Group related changes under one bullet
   BAD:  Three separate entries for "added role X", "added role Y", "added role Z"
   GOOD: "RBAC system with 5-tier role hierarchy (super_admin, admin, analyst, manager, user)"

4. Always include Migration section for breaking changes
   - Database migrations needed
   - New required environment variables
   - Manual steps (bootstrap scripts, provider registration)

5. Security section for any vulnerability or auth fix
   - What was the risk
   - What was fixed
   - Any action needed by deployers

6. Use consistent verb tense
   - Added: past tense ("Added X")
   - Fixed: past tense ("Fixed X causing Y")
   - Changed: past tense ("Changed X to Y")

7. Link to issues/PRs where applicable
   - "Fixed login redirect loop ([#42](link))"

WHEN TO CREATE A NEW VERSION:

  Start with [Unreleased] section
  Move entries to versioned section when you tag a release

  Tagging workflow:
    1. Move [Unreleased] items to new version section
    2. Add date: ## [X.Y.Z] - YYYY-MM-DD
    3. Create fresh [Unreleased] section
    4. Commit changelog
    5. Tag: git tag -a vX.Y.Z -m "Release X.Y.Z"
    6. Push: git push origin vX.Y.Z

COMPARISON LINKS (add at bottom of file):

[Unreleased]: https://github.com/org/repo/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/org/repo/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/org/repo/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/org/repo/releases/tag/v1.0.0
-->
