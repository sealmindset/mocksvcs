# OIDC Authentication Implementation Plan

**Template for adding enterprise-grade authentication to any web application.**
**Reference implementation: AuditGH (FastAPI + Next.js)**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Prerequisites](#3-prerequisites)
4. [Phase 1: Foundation](#phase-1-foundation---infrastructure--models)
5. [Phase 2: OIDC Provider Registration](#phase-2-oidc-provider-registration)
6. [Phase 3: Auth Router & Login Flow](#phase-3-auth-router--login-flow)
7. [Phase 4: Session Management](#phase-4-session-management)
8. [Phase 5: RBAC System](#phase-5-rbac-system)
9. [Phase 6: Auth Middleware & Dependencies](#phase-6-auth-middleware--dependencies)
10. [Phase 7: Invitation System](#phase-7-invitation-system)
11. [Phase 8: Token Management (JWT)](#phase-8-token-management-jwt)
12. [Phase 9: Break Glass Access](#phase-9-break-glass-access)
13. [Phase 10: API Key Authentication](#phase-10-api-key-authentication)
14. [Phase 11: Device Flow (CLI Auth)](#phase-11-device-flow-cli-auth)
15. [Phase 12: Rate Limiting](#phase-12-rate-limiting)
16. [Phase 13: Frontend Auth Integration](#phase-13-frontend-auth-integration)
17. [Phase 14: Bootstrap & Deployment](#phase-14-bootstrap--deployment)
18. [Environment Variables Reference](#environment-variables-reference)
19. [Security Checklist](#security-checklist)
20. [Gotchas & Lessons Learned](#gotchas--lessons-learned)
21. [Entra ID App Registration Guide](#entra-id-app-registration-guide)

---

## 1. Overview

This plan implements a complete OIDC-based authentication and authorization system with:

- **OIDC/OAuth 2.0 login** with PKCE (Entra ID + generic OIDC support)
- **RBAC** with 5-tier role hierarchy and permission matrix
- **Invitation-based onboarding** with email delivery
- **Break glass emergency access** for disaster recovery
- **API key authentication** for programmatic access
- **Device flow** (RFC 8628) for CLI tools
- **Redis-backed sessions** with dual timeout (absolute + idle)
- **JWT tokens** with rotation and revocation
- **Rate limiting** on auth endpoints
- **Audit logging** for all authentication events

### Authentication Methods (Priority Order)

```
1. API Key (X-API-Key header)          → Programmatic access
2. Session Cookie (browser)             → Interactive login via OIDC
3. Bearer Token (Authorization header)  → JWT from token refresh or device flow
4. Break Glass (local password)         → Emergency-only access
```

---

## 2. Architecture

```
                    ┌──────────────────────────────────────────┐
                    │              Identity Providers           │
                    │  ┌────────────┐  ┌────────────────────┐  │
                    │  │  Entra ID  │  │  Generic OIDC      │  │
                    │  │ (Microsoft)│  │  (Okta/Auth0/etc.) │  │
                    │  └─────┬──────┘  └────────┬───────────┘  │
                    └────────┼──────────────────┼──────────────┘
                             │    OIDC Flow     │
                    ┌────────▼──────────────────▼──────────────┐
                    │           Backend API Server              │
                    │                                           │
                    │  ┌─────────────────────────────────────┐  │
                    │  │         Auth Middleware Chain         │  │
                    │  │  Auth → Session → Security Headers   │  │
                    │  └──────────────┬──────────────────────┘  │
                    │                 │                          │
                    │  ┌──────────────▼──────────────────────┐  │
                    │  │          Auth Router                 │  │
                    │  │  /auth/login, /callback, /logout     │  │
                    │  │  /auth/me, /refresh, /revoke         │  │
                    │  └──────────────┬──────────────────────┘  │
                    │                 │                          │
                    │  ┌──────────────▼──────────────────────┐  │
                    │  │       Auth Dependencies              │  │
                    │  │  Session → Token → API Key → RBAC    │  │
                    │  └──────────────┬──────────────────────┘  │
                    │                 │                          │
                    │  ┌──────┐  ┌───▼───┐  ┌──────────────┐   │
                    │  │ RBAC │  │ Token │  │  Invitation   │   │
                    │  │Engine│  │ Mgmt  │  │    System     │   │
                    │  └──┬───┘  └───┬───┘  └──────┬───────┘   │
                    └─────┼──────────┼─────────────┼───────────┘
                          │          │             │
              ┌───────────▼──────────▼─────────────▼──────────┐
              │                  Data Layer                     │
              │  ┌────────────┐  ┌───────────┐  ┌──────────┐  │
              │  │ PostgreSQL │  │   Redis   │  │   SMTP   │  │
              │  │  Users     │  │  Sessions │  │  Emails  │  │
              │  │  Roles     │  │  Tokens   │  │          │  │
              │  │  Audit Log │  │  Cache    │  │          │  │
              │  └────────────┘  └───────────┘  └──────────┘  │
              └────────────────────────────────────────────────┘
```

### Login Flow Sequence

```
Browser                    Backend API              Identity Provider
  │                            │                         │
  │  GET /auth/login/entra     │                         │
  │ ──────────────────────────>│                         │
  │                            │  PKCE challenge (S256)  │
  │                            │  authorize_redirect()   │
  │                            │ ───────────────────────>│
  │  302 Redirect to IdP       │                         │
  │ <──────────────────────────│                         │
  │                            │                         │
  │  User authenticates        │                         │
  │ ─────────────────────────────────────────────────────>│
  │                            │                         │
  │  GET /auth/callback/entra?code=xxx&state=yyy         │
  │ <─────────────────────────────────────────────────────│
  │ ──────────────────────────>│                         │
  │                            │  Exchange code + PKCE   │
  │                            │ ───────────────────────>│
  │                            │  Access token + ID token│
  │                            │ <───────────────────────│
  │                            │                         │
  │                            │  Validate email_verified│
  │                            │  Check user in DB       │
  │                            │  Create session (Redis) │
  │                            │  Set session cookie     │
  │                            │                         │
  │  303 Redirect to frontend  │                         │
  │ <──────────────────────────│                         │
  │                            │                         │
  │  GET /auth/me              │                         │
  │ ──────────────────────────>│                         │
  │  { user, role, perms }     │                         │
  │ <──────────────────────────│                         │
```

---

## 3. Prerequisites

### Infrastructure
| Component | Purpose | Development | Production |
|-----------|---------|-------------|------------|
| PostgreSQL 15+ | Users, roles, audit logs | Docker container | RDS / managed DB |
| Redis 7+ | Sessions, token blacklist, rate limiting | Docker container | ElastiCache / managed Redis |
| SMTP server | Invitation emails | MailHog (localhost:1025) | SES / SendGrid / Gmail |

### Identity Provider Setup
| Provider | Required Credentials | Discovery URL Pattern |
|----------|---------------------|-----------------------|
| Entra ID | Tenant ID, Client ID, Client Secret | `https://login.microsoftonline.com/{tenant_id}/v2.0/.well-known/openid-configuration` |
| Okta | Domain, Client ID, Client Secret | `https://{domain}/.well-known/openid-configuration` |
| Generic OIDC | Client ID, Client Secret, Discovery URL | Provider-specific |

### Entra ID Redirect URIs
Register these in **Azure Portal > App Registrations > Authentication**:

| Environment | Redirect URI |
|-------------|-------------|
| Local dev | `http://localhost:8000/auth/callback/entra` |
| Staging | `https://api-staging.yourdomain.com/auth/callback/entra` |
| Production | `https://api.yourdomain.com/auth/callback/entra` |

---

## Phase 1: Foundation - Infrastructure & Models

### 1.1 Database Models

Create the following tables:

**Users Table**
```
users
├── id: UUID (PK)
├── email: VARCHAR UNIQUE NOT NULL (indexed)
├── username: VARCHAR
├── full_name: VARCHAR
├── role: VARCHAR NOT NULL (super_admin|admin|analyst|manager|user)
├── access_type: VARCHAR DEFAULT 'both' (ui_only|api_only|both)
├── auth_provider: VARCHAR (entra|okta|mock-oidc|local|api_key)
├── oidc_subject: VARCHAR (sub claim from IdP)
├── oidc_issuer: VARCHAR (iss claim from IdP)
├── local_password_hash: VARCHAR (bcrypt, for break glass only)
├── is_active: BOOLEAN DEFAULT TRUE
├── is_invited: BOOLEAN DEFAULT FALSE
├── first_login_at: TIMESTAMP
├── last_login_at: TIMESTAMP
├── created_at: TIMESTAMP DEFAULT NOW()
└── updated_at: TIMESTAMP DEFAULT NOW()
```

**Auth Audit Log Table**
```
auth_audit_log
├── id: UUID (PK)
├── user_id: UUID (FK → users, nullable for failed attempts)
├── email: VARCHAR NOT NULL
├── event_type: VARCHAR NOT NULL (login|logout|token_refresh|revoke|invite)
├── auth_method: VARCHAR (entra|okta|break_glass|api_key|device_flow)
├── success: BOOLEAN NOT NULL
├── failure_reason: VARCHAR
├── ip_address: VARCHAR
├── user_agent: VARCHAR
├── is_break_glass: BOOLEAN DEFAULT FALSE
└── created_at: TIMESTAMP DEFAULT NOW()
```

**User Invitations Table**
```
user_invitations
├── id: UUID (PK)
├── email: VARCHAR NOT NULL
├── invite_token: VARCHAR UNIQUE NOT NULL (64-char cryptographic)
├── invited_by: UUID (FK → users)
├── invited_role: VARCHAR NOT NULL
├── invited_access_type: VARCHAR DEFAULT 'both'
├── status: VARCHAR DEFAULT 'pending' (pending|accepted|expired|revoked)
├── expires_at: TIMESTAMP NOT NULL (created_at + 7 days)
├── accepted_at: TIMESTAMP
└── created_at: TIMESTAMP DEFAULT NOW()
```

### 1.2 RBAC Tables

**Roles Table**
```
roles
├── id: UUID (PK)
├── name: VARCHAR UNIQUE NOT NULL (super_admin|admin|analyst|manager|user)
├── display_name: VARCHAR
├── description: VARCHAR
└── level: INTEGER NOT NULL (1=highest privilege, 5=lowest)
```

**Permissions Table**
```
permissions
├── id: UUID (PK)
├── name: VARCHAR UNIQUE NOT NULL (e.g., 'findings:read', '*:*')
├── resource: VARCHAR NOT NULL
├── action: VARCHAR NOT NULL
├── description: VARCHAR
└── UNIQUE(resource, action)
```

**Role-Permission Mapping**
```
role_permissions
├── id: UUID (PK)
├── role_id: UUID (FK → roles)
├── permission_id: UUID (FK → permissions)
└── UNIQUE(role_id, permission_id)
```

**User-Role per Tenant (for multi-tenant)**
```
user_roles
├── id: UUID (PK)
├── user_sub: VARCHAR NOT NULL (OIDC subject claim)
├── tenant_id: UUID (FK → organizations)
├── role_id: UUID (FK → roles)
└── UNIQUE(user_sub, tenant_id)
```

### 1.3 API Key Tables

```
api_keys
├── id: UUID (PK)
├── user_id: UUID (FK → users)
├── organization_id: UUID
├── key_prefix: VARCHAR (first 8 chars, for display)
├── key_hash: VARCHAR NOT NULL (SHA256, indexed)
├── permission_overrides: JSONB (subset of owner's permissions)
├── rate_limit_per_hour: INTEGER DEFAULT 1000
├── is_active: BOOLEAN DEFAULT TRUE
├── expires_at: TIMESTAMP
├── last_used_at: TIMESTAMP
├── last_used_ip: VARCHAR
└── created_at: TIMESTAMP DEFAULT NOW()
```

### 1.4 Device Flow Tables

```
device_flow_requests
├── id: UUID (PK)
├── device_code: VARCHAR(128) UNIQUE NOT NULL
├── user_code: VARCHAR(9) UNIQUE NOT NULL (ABCD-1234 format)
├── client_id: VARCHAR
├── status: VARCHAR DEFAULT 'pending' (pending|approved|denied|consumed|expired)
├── user_sub: VARCHAR (populated on approval)
├── user_email: VARCHAR (populated on approval)
├── expires_at: TIMESTAMP NOT NULL (created_at + 10 minutes)
├── poll_count: INTEGER DEFAULT 0
└── created_at: TIMESTAMP DEFAULT NOW()

device_authorizations
├── id: UUID (PK)
├── user_sub: VARCHAR NOT NULL
├── user_email: VARCHAR NOT NULL
├── device_name: VARCHAR (user-assigned label)
├── client_id: VARCHAR
├── current_refresh_token_jti: VARCHAR (for revocation)
├── is_active: BOOLEAN DEFAULT TRUE
├── revoked_at: TIMESTAMP
├── revoked_by: VARCHAR
├── token_refresh_count: INTEGER DEFAULT 0
├── last_used_at: TIMESTAMP
└── created_at: TIMESTAMP DEFAULT NOW()
```

---

## Phase 2: OIDC Provider Registration

### 2.1 Dynamic Provider Registration

Register providers only when their environment variables are present. This allows the same codebase to work in dev (mock-oidc), staging (one provider), and production (multiple providers).

**Configuration Pattern:**
```
# Generic OIDC (development mock or any OIDC provider)
OIDC_PROVIDER_NAME=mock-oidc
OIDC_CLIENT_ID=dev-client-id
OIDC_CLIENT_SECRET=dev-client-secret
OIDC_DISCOVERY_URL=http://mock-oidc:10090/.well-known/openid-configuration
OIDC_EXTERNAL_BASE_URL=http://localhost:3007

# Microsoft Entra ID (production)
ENTRA_TENANT_ID=your-tenant-id
ENTRA_CLIENT_ID=your-client-id
ENTRA_CLIENT_SECRET=your-client-secret

# Okta (optional additional provider)
OKTA_DOMAIN=dev-12345.okta.com
OKTA_CLIENT_ID=your-okta-client-id
OKTA_CLIENT_SECRET=your-okta-client-secret
```

**Registration Logic:**
```
For each configured provider:
  1. Detect credentials in environment
  2. Build discovery URL:
     - Entra: https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration
     - Okta:  https://{domain}/.well-known/openid-configuration
     - Generic: Use OIDC_DISCOVERY_URL directly
  3. Register with OAuth library:
     - client_id
     - client_secret
     - server_metadata_url (discovery)
     - client_kwargs:
         scope: 'openid profile email'
         code_challenge_method: 'S256'    ← CRITICAL: enables PKCE
  4. Log registered provider name
```

**Key Decision: PKCE Must Be Configured at Registration**

The `code_challenge_method: 'S256'` must be set in `client_kwargs` during provider registration, not just at redirect time. Without this, Entra ID will reject the authorization request with `AADSTS501471: Missing code_challenge parameter`.

### 2.2 Provider Discovery Endpoint

```
GET /auth/providers
Response: [
  { "name": "entra", "display_name": "Microsoft", "type": "oidc" },
  { "name": "mock-oidc", "display_name": "Development Login", "type": "oidc" }
]
```

The frontend uses this to dynamically render login buttons.

---

## Phase 3: Auth Router & Login Flow

### 3.1 Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth/providers` | List available OIDC providers |
| GET | `/auth/login/{provider}` | Initiate OIDC flow with PKCE |
| GET | `/auth/callback/{provider}` | Handle OAuth callback |
| GET | `/auth/accept-invite` | Accept invitation → redirect to OIDC |
| POST | `/auth/break-glass/login` | Emergency local auth |
| GET | `/auth/logout` | Clear session |
| GET | `/auth/me` | Get current user info |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/revoke` | Revoke current token |

### 3.2 Login Endpoint

```
GET /auth/login/{provider}

1. Validate provider against registered provider names (whitelist)
2. Build redirect_uri = /auth/callback/{provider}
3. Accept optional login_hint query param
4. Call provider.authorize_redirect(request, redirect_uri, code_challenge_method='S256')
5. Returns 302 to IdP authorization endpoint
```

### 3.3 Callback Endpoint (Critical Path)

```
GET /auth/callback/{provider}?code=xxx&state=yyy

1. Validate provider against whitelist
2. Exchange authorization code for tokens (PKCE verified automatically)
3. Extract user info from token response or parse ID token
4. Validate email_verified claim:
   - If email_verified == false → 400 "Email not verified"
   - If missing (mock-oidc) → allow
5. Check if user exists in database by email:
   a. USER EXISTS:
      - Update oidc_subject/issuer if not set
      - Update last_login_at
      - Log successful login to audit trail
   b. USER DOES NOT EXIST:
      - Check for invite_token in session
      - If no invitation → 403 "No invitation found"
      - If invitation valid:
        - Create user with invitation role/access_type
        - Mark invitation as 'accepted'
        - Log user creation
6. Store session data:
   - provider, email, name, sub, role, access_type, user_id, is_break_glass
7. Store access_token in session
8. Redirect to frontend URL (APP_URL env var) with 303 status

CRITICAL: Use 303 See Other, NOT 302 Found
  - Prevents browser re-POST on page refresh
  - POST-redirect-GET pattern

CRITICAL: Redirect to frontend URL, NOT '/'
  - API and frontend are on different ports/domains
  - Use APP_URL environment variable (default: http://localhost:3000)
```

### 3.4 Logout Endpoint

```
GET /auth/logout

1. Get session_id from cookies
2. Delete session metadata from Redis
3. Clear session cookie
4. Log logout event to audit trail
5. Redirect to login page
```

### 3.5 Me Endpoint

```
GET /auth/me

Response 200:
{
  "email": "user@example.com",
  "name": "User Name",
  "role": "analyst",
  "access_type": "both",
  "provider": "entra",
  "is_break_glass": false
}

Response 401: Not authenticated
```

---

## Phase 4: Session Management

### 4.1 Session Architecture

```
Browser Cookie (encrypted)        Redis (server-side)
┌─────────────────────┐          ┌───────────────────────────┐
│ session_id           │ ───────> │ session:{session_id}       │
│ user: {              │          │ {                           │
│   provider, email,   │          │   user_sub,                │
│   name, sub, role,   │          │   tenant_id,               │
│   access_type,       │          │   created_at,              │
│   user_id,           │          │   last_activity,           │
│   is_break_glass     │          │   provider                 │
│ }                    │          │ }                           │
│ access_token         │          │ TTL: 8 hours               │
└─────────────────────┘          └───────────────────────────┘
```

### 4.2 Dual Timeout Enforcement

```
SESSION_ABSOLUTE_TIMEOUT_HOURS=8     # Max session lifetime
SESSION_IDLE_TIMEOUT_MINUTES=30      # Max inactivity period

Check on every authenticated request:
  expired = (now - created_at) > 8 hours
            OR
            (now - last_activity) > 30 minutes

  If expired → clear session, return 401
  If valid → update last_activity in Redis
```

### 4.3 Session Activity Middleware

```
On every authenticated request:
  1. Get session_id from cookie
  2. If session exists in Redis:
     a. Fetch metadata
     b. Check dual timeout
     c. Update last_activity = now()
     d. Store back to Redis with same TTL
  3. Non-blocking: log warning on failure, don't block request
  4. Skip OPTIONS requests (CORS preflight)
```

### 4.4 Session Cleanup Job

```
Background process (runs every 5 minutes):
  1. SCAN Redis for session:* keys
  2. For each session, check dual timeout
  3. DELETE expired sessions
  4. Log: "Session cleanup: X removed (Y scanned)"

Run as: separate container/process
  - Docker: dedicated service with same app image, different command
  - Example: python -m src.auth.cleanup
```

---

## Phase 5: RBAC System

### 5.1 Role Hierarchy (5 Tiers)

| Level | Role | Access |
|-------|------|--------|
| 1 | super_admin | Full system access across all tenants |
| 2 | admin | Tenant admin — full access within tenant |
| 3 | analyst | Read/write findings, execute scans |
| 4 | manager | Read-only access to reports/dashboards |
| 5 | user | Minimal read-only access |

### 5.2 Permission Matrix

| Permission | super_admin | admin | analyst | manager | user |
|-----------|:-----------:|:-----:|:-------:|:-------:|:----:|
| `*:*` (wildcard) | X | | | | |
| `findings:read` | X | X | X | X | X |
| `findings:write` | X | X | X | | |
| `findings:delete` | X | X | | | |
| `scans:read` | X | X | X | X | |
| `scans:execute` | X | X | X | | |
| `repositories:read` | X | X | X | X | X |
| `repositories:write` | X | X | | | |
| `organizations:read` | X | X | | X | |
| `organizations:write` | X | X | | | |
| `users:read` | X | X | | | |
| `users:write` | X | X | | | |
| `reports:read` | X | X | X | X | X |

### 5.3 Permission Evaluation

```
has_permission(user_permissions, required_permission):
  For each user_permission:
    1. If user_permission == "*:*" → ALLOW (super admin wildcard)
    2. Parse required: resource:action
    3. If user_permission == "resource:*" → ALLOW (resource wildcard)
    4. If user_permission == required_permission → ALLOW (exact match)
  Default → DENY
```

### 5.4 Permission Caching (Redis)

```
Key:   perm:{user_sub}:{tenant_id}
Value: JSON array of permission names
TTL:   5 minutes

On role/permission change → DELETE cache key
On request → check cache first, query DB on miss
```

### 5.5 Seed Script (Idempotent)

```
Seed RBAC data on first run:
  1. Create 5 roles (check if exists first)
  2. Create ~13 permissions (check if exists first)
  3. Create role-permission mappings (check if exists first)
  4. Safe to run multiple times (uses upsert/merge logic)

Run as: python -m src.rbac.seeds
Trigger: On app startup if roles table is empty
```

---

## Phase 6: Auth Middleware & Dependencies

### 6.1 Middleware Chain

```
Request
  │
  ▼
┌─────────────────────────────┐
│  AuthenticationMiddleware    │  Check if request is authenticated
│  - Public endpoints → pass  │  - /auth/*, /docs, /health, /static
│  - Authenticated → pass     │  - Check session cookie
│  - API request → 401 JSON   │  - Return login_url in error
│  - UI request → redirect    │  - Redirect to /login?next={path}
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  SessionActivityMiddleware   │  Update session last_activity
│  - Non-blocking             │  - Log warning on failure
│  - Skip OPTIONS             │  - Don't block requests
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  SecurityHeadersMiddleware   │  Add security headers
│  - CSP                      │  - HSTS (production only)
│  - X-Frame-Options: DENY    │  - X-Content-Type-Options: nosniff
│  - Referrer-Policy          │  - X-XSS-Protection
└──────────────┬──────────────┘
               │
               ▼
           Route Handler
```

### 6.2 Public Endpoints (No Auth Required)

```
/auth/*                    # Authentication endpoints
/invite/*                  # Invitation acceptance
/api/docs                  # API documentation
/api/redoc                 # Redoc documentation
/api/openapi.json          # OpenAPI spec
/health                    # Health check
/static/*                  # Static files
/_next/*                   # Next.js assets
```

### 6.3 Auth Dependencies (Injection)

**Multi-method auth (default for all protected routes):**
```
get_current_user(request):
  1. Check X-API-Key header → validate_api_key()
  2. Check AUTH_DISABLED env → return mock admin (dev only)
  3. Check session cookie → get_current_user_from_session()
  4. If none → 401 Unauthorized
```

**Role-based guards:**
```
require_role('analyst', 'admin', 'super_admin')
  → Check user.role is in allowed list
  → 403 if not authorized

require_admin()
  → Shortcut for admin or super_admin

require_super_admin()
  → Shortcut for super_admin only
```

**Route-level usage example:**
```
POST /findings/{id}/delete
  Dependencies: [require_role('analyst', 'admin', 'super_admin')]

POST /users/invite
  Dependencies: [require_admin()]

POST /system/reset
  Dependencies: [require_super_admin()]
```

---

## Phase 7: Invitation System

### 7.1 Invitation Flow

```
Admin                        Backend                     Email               New User
  │                            │                          │                    │
  │ POST /invitations          │                          │                    │
  │ {email, role, access_type} │                          │                    │
  │ ──────────────────────────>│                          │                    │
  │                            │  Generate 64-char token  │                    │
  │                            │  (secrets.token_urlsafe) │                    │
  │                            │  Set 7-day expiry        │                    │
  │                            │                          │                    │
  │                            │  Send invitation email   │                    │
  │                            │ ────────────────────────>│                    │
  │  201 Created               │                          │  Email delivered   │
  │ <──────────────────────────│                          │ ──────────────────>│
  │                            │                          │                    │
  │                            │                          │    Click link      │
  │                            │      GET /auth/accept-invite?token=xxx       │
  │                            │ <────────────────────────────────────────────│
  │                            │                          │                    │
  │                            │  Store token in session  │                    │
  │                            │  Redirect to OIDC login  │                    │
  │                            │ ────────────────────────────────────────────>│
  │                            │                          │                    │
  │                            │           (User authenticates with IdP)      │
  │                            │                          │                    │
  │                            │  Callback checks session │                    │
  │                            │  Finds invite_token      │                    │
  │                            │  Creates user with role  │                    │
  │                            │  Marks invite accepted   │                    │
  │                            │                          │                    │
  │                            │  Redirect to frontend    │                    │
  │                            │ ────────────────────────────────────────────>│
```

### 7.2 Invitation Token Security

- **Length:** 64 characters (base64url encoded from 48 random bytes)
- **Expiry:** 7 days from creation
- **Single use:** Marked as 'accepted' after use
- **Email validation:** Authenticated email must match invitation email (case-insensitive)
- **Race condition:** Check user doesn't already exist before creating

### 7.3 Invitation States

```
pending  → Created, email sent, awaiting action
accepted → User completed the flow
expired  → 7 days passed (auto-expire on check)
revoked  → Admin manually revoked
```

### 7.4 Email Configuration

| Environment | SMTP Host | Port | Auth | TLS |
|-------------|-----------|------|------|-----|
| Development | localhost (MailHog) | 1025 | None | No |
| Production (Gmail) | smtp.gmail.com | 587 | App password | Yes |
| Production (SES) | email-smtp.{region}.amazonaws.com | 587 | IAM credentials | Yes |
| Production (SendGrid) | smtp.sendgrid.net | 587 | API key | Yes |

---

## Phase 8: Token Management (JWT)

### 8.1 Token Types

| Token | Lifetime | Signing | Purpose |
|-------|----------|---------|---------|
| Access Token | 1 hour | HS256 (JWT_SECRET_KEY) | API access |
| Refresh Token | 7 days | HS256 (JWT_SECRET_KEY) | Obtain new access tokens |

### 8.2 Token Claims

```json
{
  "sub": "user-oidc-subject",
  "tenant_id": "org-uuid",
  "email": "user@example.com",
  "name": "User Name",
  "type": "access|refresh",
  "jti": "unique-token-id",
  "iat": 1709040000,
  "exp": 1709043600
}
```

### 8.3 Token Rotation (One-Time Use)

```
POST /auth/refresh
  Body: { refresh_token: "xxx" }

1. Decode old refresh token
2. Verify type == "refresh"
3. Check JTI not blacklisted
4. Check JTI in rotation tracker (Redis: refresh:{jti})
   - If NOT exists → "Token already used" (401) — replay attack detected
5. Delete old JTI from rotation tracker
6. Generate new access token + new refresh token
7. Add new refresh JTI to rotation tracker
8. Return new tokens

Redis Keys:
  refresh:{jti} → "1" (TTL: 7 days)    # Rotation tracker
  blacklist:{jti} → "1" (TTL: until exp) # Revocation list
```

### 8.4 Token Revocation

```
POST /auth/revoke

1. Get current token JTI from session or Authorization header
2. Add to Redis blacklist: blacklist:{jti} = "1"
3. Set TTL = token expiry time (auto-cleanup)
4. Instant effect across all API instances (Redis-backed)
```

---

## Phase 9: Break Glass Access

### 9.1 Purpose
Emergency access when OIDC is unavailable (IdP outage, misconfiguration, network issues).

### 9.2 Design Constraints
- **Restricted to one designated email** (hardcoded, not configurable)
- **Local password only** (bcrypt, 12 salt rounds)
- **Prominently audited** (all attempts logged with is_break_glass=True)
- **Super admin role only** (break glass = full access)

### 9.3 Implementation

```
POST /auth/break-glass/login
  Body: { email: "admin@example.com", password: "xxx" }

1. Validate email == designated break glass email (403 if not)
2. Query user by email
3. Verify bcrypt password hash (401 if wrong)
4. Check user is_active (401 if deactivated)
5. Update last_login_at
6. Create session with is_break_glass=True
7. Log WARNING: "BREAK GLASS LOGIN: {email} from {ip}"
8. Create AuthAuditLog with break_glass=True
9. Redirect to frontend

Frontend: Display warning banner when is_break_glass=True
```

### 9.4 Bootstrap Script

```
python -m src.auth.bootstrap

Creates:
  1. Break glass user (local password from BREAK_GLASS_PASSWORD env var)
  2. Primary admin user (OIDC-only, no local password)

Idempotent: Checks if users exist before creating.
```

---

## Phase 10: API Key Authentication

### 10.1 API Key Flow

```
Client sends: X-API-Key: agh_xxxxxxxxxxxx

1. Hash key with SHA256
2. Query api_keys by key_hash
3. Validate: is_active, not expired
4. Check rate limit (Redis sliding window, default 1000/hour)
5. Fetch owner user from database
6. Resolve effective permissions (intersection of owner + key overrides)
7. Set request context: auth_method="api_key", permissions=[...]
8. Update last_used_at and last_used_ip
```

### 10.2 Key Generation

```
POST /settings/api-keys
  Body: { name: "CI/CD Key", expires_in_days: 90 }

1. Generate 32-byte random key
2. Prefix with "agh_" for identification
3. Hash with SHA256 for storage
4. Store key_prefix (first 8 chars) for display
5. Return full key ONCE (never stored in plaintext)
```

### 10.3 Rate Limiting (Redis Sliding Window)

```
Key: apikey_rate:{key_id}
Window: 1 hour
Default limit: 1000 requests/hour

Fail-open: If Redis is down, allow request (availability > security)
```

---

## Phase 11: Device Flow (CLI Auth)

### 11.1 RFC 8628 Implementation

```
CLI                         Backend                    Browser
 │                            │                          │
 │ POST /auth/device/code     │                          │
 │ ──────────────────────────>│                          │
 │                            │ Generate:                │
 │                            │  device_code (128 chars)  │
 │                            │  user_code (ABCD-1234)   │
 │ { device_code,             │                          │
 │   user_code,               │                          │
 │   verification_uri,        │                          │
 │   expires_in: 600 }        │                          │
 │ <──────────────────────────│                          │
 │                            │                          │
 │ Display to user:           │                          │
 │ "Go to /verify?code=XXXX" │                          │
 │                            │                          │
 │                            │  GET /auth/device/verify │
 │                            │ <────────────────────────│
 │                            │  { verification form }   │
 │                            │ ────────────────────────>│
 │                            │                          │
 │                            │  POST /verify-code       │
 │                            │ <────────────────────────│
 │                            │  Redirect to OIDC login  │
 │                            │ ────────────────────────>│
 │                            │                          │
 │                            │  (User authenticates)    │
 │                            │                          │
 │                            │  POST /approve (action)  │
 │                            │ <────────────────────────│
 │                            │  Approved!               │
 │                            │ ────────────────────────>│
 │                            │                          │
 │ POST /auth/device/token    │                          │
 │ (polling every 5s)         │                          │
 │ ──────────────────────────>│                          │
 │ { access_token,            │                          │
 │   refresh_token }          │                          │
 │ <──────────────────────────│                          │
```

### 11.2 User Code Generation

```
Charset: ABCDEFGHJKLMNPQRSTUVWXYZ23456789  (32 chars)
  - Excludes: 0, O, 1, I, l (confusing characters)
Length: 8 characters
Format: ABCD-1234 (dash for readability)
Entropy: 32^8 = ~1.2 trillion combinations
```

### 11.3 Polling Responses (RFC 8628)

| Status | HTTP | Error Code | Meaning |
|--------|------|------------|---------|
| Pending | 400 | authorization_pending | Keep polling |
| Slow | 400 | slow_down | Increase interval by 5s |
| Denied | 400 | access_denied | User denied |
| Expired | 400 | expired_token | 10-minute timeout |
| Success | 200 | — | Returns tokens |

---

## Phase 12: Rate Limiting

### 12.1 Endpoint-Specific Limits

| Endpoint | Limit | Reason |
|----------|-------|--------|
| `/auth/login/*` | 5/minute | Prevent brute force |
| `/auth/break-glass/login` | 3/minute | Protect emergency access |
| `/auth/refresh` | 10/minute | Prevent token exhaustion |
| `/auth/device/code` | 5/minute | Prevent device code spam |
| All other endpoints | 100/minute | General protection |

### 12.2 Rate Limit Identification

```
Priority:
  1. Authenticated user → "user:{sub}"
  2. API key → "apikey:{key_id}"
  3. IP address → "ip:{client_ip}"
```

### 12.3 Response Headers

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1709040060
Retry-After: 60  (only on 429 responses)
```

---

## Phase 13: Frontend Auth Integration

### 13.1 Auth Context (React)

```typescript
interface AuthUser {
  sub: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'analyst' | 'manager' | 'user';
  access_type: 'ui_only' | 'api_only' | 'both';
  is_break_glass: boolean;
}

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

// Context provides:
{
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasRole: (minimumRole: RoleName) => boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}
```

### 13.2 Session Check Pattern

```
On app mount:
  1. Call GET /auth/me (with credentials: "include")
  2. If 200 → set authenticated
  3. If 401 → set unauthenticated
  4. If other → log warning, don't change state (avoid loops)

Periodic check:
  - Every 5 minutes, call /auth/me
  - If 401 → redirect to login (session expired)
```

### 13.3 Login Page Components

```
Login Page:
  ├── Provider Buttons (from GET /auth/providers)
  │   └── Each button → GET /auth/login/{provider}
  ├── Break Glass Button (hidden by default)
  │   └── Toggle reveals email/password form
  │   └── POST /auth/break-glass/login
  └── Loading State (check if already authenticated)
```

### 13.4 Protected Route Pattern

```typescript
// AuthShell wraps all pages:
function AuthShell({ children }) {
  const { status, isAuthenticated } = useAuth();
  const pathname = usePathname();

  if (status === 'loading') return <Spinner />;
  if (!isAuthenticated && pathname !== '/login') {
    redirect('/login');
  }
  return children;
}

// Role-based rendering:
{hasRole('admin') && <AdminPanel />}
{user.is_break_glass && <BreakGlassWarningBanner />}
```

### 13.5 API Calls (Cookie-Based)

```typescript
// All API calls include credentials for session cookie:
fetch(`${API_URL}/api/findings`, {
  credentials: 'include',  // Send session cookie cross-origin
  headers: { 'Content-Type': 'application/json' }
});

// CORS must be configured on backend:
CORS_ORIGINS=http://localhost:3000,https://app.yourdomain.com
```

---

## Phase 14: Bootstrap & Deployment

### 14.1 First-Time Setup

```bash
# 1. Configure environment
cp .env.sample .env
# Edit .env with real credentials

# 2. Start infrastructure
docker compose up -d db redis

# 3. Run database migrations
docker exec app python -m alembic upgrade head

# 4. Seed RBAC roles and permissions
docker exec app python -c "from src.rbac import init_rbac_if_needed; ..."

# 5. Bootstrap admin users
docker exec app python -m src.auth.bootstrap

# 6. Start application
docker compose up -d

# 7. Verify
curl http://localhost:8000/health
curl http://localhost:8000/auth/providers
```

### 14.2 Deployment Checklist

- [ ] Set strong SESSION_SECRET (32+ characters)
- [ ] Set strong JWT_SECRET_KEY (32+ characters)
- [ ] Set AUTH_REQUIRED=true
- [ ] Set AUTH_DISABLED=false (or remove)
- [ ] Change BREAK_GLASS_PASSWORD from default
- [ ] Configure real SMTP for invitations
- [ ] Register redirect URIs in Entra ID for production domain
- [ ] Set APP_URL to production frontend URL
- [ ] Set CORS_ORIGINS to production frontend URL
- [ ] Configure Redis with password in production
- [ ] Enable HTTPS (required for secure cookies)
- [ ] Run bootstrap script to create admin users
- [ ] Test login flow end-to-end
- [ ] Test invitation flow end-to-end
- [ ] Test break glass access
- [ ] Verify audit logs are being created

---

## Environment Variables Reference

```bash
# ============================================================
# Core Authentication
# ============================================================
SESSION_SECRET=<32+ char random string>      # Session cookie signing
JWT_SECRET_KEY=<32+ char random string>      # JWT token signing
AUTH_REQUIRED=true                           # false for dev bypass
BREAK_GLASS_PASSWORD=ChangeMe123!            # CHANGE IN PRODUCTION

# ============================================================
# OIDC Providers
# ============================================================
# Entra ID (Microsoft)
ENTRA_TENANT_ID=your-tenant-id
ENTRA_CLIENT_ID=your-client-id
ENTRA_CLIENT_SECRET=your-client-secret

# Generic OIDC (development/mock)
OIDC_PROVIDER_NAME=mock-oidc
OIDC_CLIENT_ID=dev-client-id
OIDC_CLIENT_SECRET=dev-client-secret
OIDC_DISCOVERY_URL=http://mock-oidc:10090/.well-known/openid-configuration
OIDC_EXTERNAL_BASE_URL=http://localhost:3007

# Okta (optional)
OKTA_DOMAIN=dev-12345.okta.com
OKTA_CLIENT_ID=your-okta-client-id
OKTA_CLIENT_SECRET=your-okta-client-secret

# ============================================================
# Redis & Sessions
# ============================================================
REDIS_URL=redis://redis:6379/0
SESSION_ABSOLUTE_TIMEOUT_HOURS=8
SESSION_IDLE_TIMEOUT_MINUTES=30

# ============================================================
# Email (Invitations)
# ============================================================
SMTP_HOST=localhost                          # Dev: localhost, Prod: smtp provider
SMTP_PORT=1025                               # Dev: 1025 (MailHog), Prod: 587
SMTP_USER=                                   # Empty for dev
SMTP_PASSWORD=                               # Empty for dev
SMTP_FROM=noreply@yourdomain.com
SMTP_USE_TLS=false                           # true in production
SMTP_USE_SSL=false

# ============================================================
# URLs
# ============================================================
APP_URL=http://localhost:3000                # Frontend URL (redirect target)
CORS_ORIGINS=http://localhost:3000           # Comma-separated allowed origins

# ============================================================
# Database
# ============================================================
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=appdb
```

---

## Security Checklist

### Authentication
- [ ] PKCE (S256) enforced on all OIDC flows
- [ ] email_verified claim validated before trusting email
- [ ] Provider name validated against registered whitelist
- [ ] 303 redirect used after callback (not 302)
- [ ] Session cookie is HttpOnly, Secure (prod), SameSite=Lax
- [ ] Break glass access restricted to designated email only
- [ ] Break glass login prominently audited

### Authorization
- [ ] Every endpoint has auth dependency
- [ ] RBAC permissions checked at route level
- [ ] Wildcard `*:*` restricted to super_admin
- [ ] Tenant isolation enforced via UserRole.tenant_id
- [ ] 404 returned for unauthorized resource access (not 403)

### Tokens
- [ ] Refresh tokens are one-time use (rotation enforced)
- [ ] Token blacklist checked on every validation
- [ ] JWTs have reasonable expiry (access: 1h, refresh: 7d)
- [ ] JWT_SECRET_KEY is 32+ characters

### Sessions
- [ ] Dual timeout enforced (absolute + idle)
- [ ] Session cleanup job running
- [ ] Session metadata in Redis (not just cookie)

### API Keys
- [ ] Keys stored as SHA256 hash (never plaintext)
- [ ] Full key shown only once at creation
- [ ] Rate limiting per key (sliding window)
- [ ] Permission scoping (subset of owner)

### Infrastructure
- [ ] Redis password set in production
- [ ] HTTPS enforced in production
- [ ] CORS origins explicitly listed (no wildcards)
- [ ] Security headers applied (CSP, HSTS, X-Frame-Options)
- [ ] Rate limiting on auth endpoints
- [ ] .env excluded from version control

---

## Gotchas & Lessons Learned

### 1. PKCE Code Challenge (Entra ID)
**Problem:** `AADSTS501471: Missing code_challenge parameter`
**Root Cause:** PKCE must be declared in OAuth client registration via `client_kwargs`, not just at redirect time.
**Fix:** Add `'code_challenge_method': 'S256'` to `client_kwargs` during provider registration.

### 2. Post-Auth Redirect Goes to API, Not Frontend
**Problem:** After callback, `RedirectResponse(url='/')` stays on API port (8000) instead of frontend (3000).
**Root Cause:** API and frontend run on different ports. `/` resolves to the API root.
**Fix:** Redirect to `os.getenv('APP_URL', 'http://localhost:3000')`.

### 3. Zscaler / Corporate Proxy SSL Errors
**Problem:** Docker build fails with `SSL: UNEXPECTED_EOF_WHILE_READING` when fetching packages or fonts.
**Root Cause:** Corporate proxy (Zscaler) intercepts HTTPS and presents its own certificate.
**Fix:** Disable Zscaler during Docker builds, or inject corporate CA cert into Docker images.

### 4. Google Fonts Fail in Docker Build
**Problem:** Next.js `next/font/google` fails during `npm run build` in Docker.
**Root Cause:** Docker build environment has no internet (air-gapped) or proxy blocks Google.
**Fix:** Use `next/font/local` with bundled font files, or ensure network access during build.

### 5. TypeScript Build Errors Surface One at a Time
**Problem:** Next.js TypeScript checker reports only the first error per build.
**Root Cause:** Build stops at first type error. Each fix reveals the next.
**Fix:** Run `npx tsc --noEmit` locally before Docker build to catch all errors at once.

### 6. Missing Module in Docker (models/ not copied)
**Problem:** `ModuleNotFoundError: No module named 'models'`
**Root Cause:** Dockerfile only copied `src/` but code imports from `models/` at project root.
**Fix:** Add `COPY models/ /app/models/` to Dockerfile.

### 7. "No Invitation Found" for First User
**Problem:** After successful OIDC login, app rejects with 403 "No invitation found".
**Root Cause:** No users exist in database. The system requires either an existing user or a pending invitation.
**Fix:** Run bootstrap script to create initial admin users before first login.

### 8. Entra ID "No Reply Address Registered"
**Problem:** `AADSTS500113: No reply address is registered for the application`
**Root Cause:** The redirect URI in the OAuth request doesn't match any URI registered in the Entra ID app.
**Fix:** Register `http://localhost:8000/auth/callback/entra` in Azure Portal > App Registrations > Authentication.

### 9. Session Cookie Not Sent Cross-Origin
**Problem:** Frontend on port 3000 can't authenticate with API on port 8000.
**Root Cause:** Browser doesn't send cookies cross-origin by default.
**Fix:** Use `credentials: 'include'` in fetch calls AND configure CORS with explicit origins (not `*`).

### 10. Token Rotation Replay Attack
**Problem:** Old refresh token reused after rotation allows parallel sessions.
**Root Cause:** Without one-time-use tracking, rotated tokens remain valid.
**Fix:** Track each refresh token JTI in Redis. Delete on use. Reject if not found (already used).

---

## Entra ID App Registration Guide

### Step-by-Step Setup

1. **Azure Portal** > **Microsoft Entra ID** > **App registrations** > **New registration**
   - Name: `YourApp - {Environment}`
   - Supported account types: "Accounts in this organizational directory only" (single tenant)
   - Redirect URI: Web → `http://localhost:8000/auth/callback/entra`
   - Click **Register**

2. **Authentication** tab:
   - Add platform: Web
   - Redirect URIs:
     - `http://localhost:8000/auth/callback/entra` (development)
     - `https://api.yourdomain.com/auth/callback/entra` (production)
   - Implicit grant: Leave unchecked (using Authorization Code + PKCE)
   - Allow public client flows: No

3. **Certificates & secrets** tab:
   - New client secret
   - Description: `OIDC Auth Secret`
   - Expiry: 24 months (recommended, set calendar reminder)
   - Copy the **Value** immediately (shown only once)

4. **API permissions** tab:
   - Microsoft Graph > Delegated permissions:
     - `openid` (Sign users in)
     - `profile` (View basic profile)
     - `email` (View email address)
   - Click **Grant admin consent**

5. **Token configuration** tab (optional):
   - Add optional claim: ID token → `email`, `preferred_username`

6. **Record these values** for your `.env`:
   ```
   ENTRA_TENANT_ID=  (from Overview > Directory (tenant) ID)
   ENTRA_CLIENT_ID=  (from Overview > Application (client) ID)
   ENTRA_CLIENT_SECRET=  (from Certificates & secrets > Value)
   ```

### Testing the Configuration

```bash
# Verify discovery URL is accessible:
curl https://login.microsoftonline.com/{tenant_id}/v2.0/.well-known/openid-configuration

# Should return JSON with:
# - authorization_endpoint
# - token_endpoint
# - jwks_uri
# - issuer
```

---

*Generated from AuditGH reference implementation. Adapt file paths, framework specifics, and naming conventions to your stack.*
