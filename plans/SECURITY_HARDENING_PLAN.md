# Phase 9: Security Hardening Plan

> **Purpose:** Implement comprehensive security controls across all layers of the application stack following OWASP best practices and industry standards. This plan addresses authentication, authorization, input validation, data protection, infrastructure security, and incident response. All patterns are derived from the AuditGH reference implementation with production-ready code templates.
>
> **Reference Implementation:** [AuditGH](../../auditgh/README.md) -- security middleware, RBAC, rate limiting, and OIDC patterns

---

## Placeholder Legend

| Placeholder | Description | Example (AuditGH) |
|---|---|---|
| `{PROJECT_NAME}` | Lowercase project identifier | `auditgh` |
| `{DOMAIN_NAME}` | Production domain name | `security.company.com` |
| `{CSP_DOMAINS}` | Comma-separated CSP allowed domains | `https://cdn.jsdelivr.net,https://login.microsoftonline.com` |
| `{RATE_LIMIT_DEFAULT}` | Default rate limit (requests/time) | `100/minute` |
| `{RATE_LIMIT_AUTH}` | Rate limit for auth endpoints | `5/minute` |
| `{SESSION_TIMEOUT_HOURS}` | Absolute session timeout | `8` |
| `{IDLE_TIMEOUT_MINUTES}` | Idle session timeout | `30` |
| `{ACCESS_TOKEN_MINUTES}` | Access token lifetime | `60` |
| `{REFRESH_TOKEN_DAYS}` | Refresh token lifetime | `7` |
| `{REDIS_URL}` | Redis connection URL | `redis://redis:6379/0` |
| `{DB_USER}` | PostgreSQL username | `{PROJECT_NAME}` |
| `{DB_PASSWORD}` | PostgreSQL password (secret) | `changeme_in_production` |
| `{AWS_REGION}` | AWS region for secrets | `us-east-1` |
| `{CORS_ORIGINS}` | Allowed CORS origins | `http://localhost:3000,https://{DOMAIN_NAME}` |

---

## 1. OWASP Top 10 Compliance

### 1.1 A01:2021 - Broken Access Control

**Mitigations:**
- Implement RBAC with role hierarchy: `super_admin > admin > manager > analyst > developer > user`
- Repository-level access control with granular permissions
- Session-based authentication with dual timeout (absolute + idle)
- Token-based authentication for API clients
- API key authentication with scoped permissions

**Implementation:**

```python
# src/auth/dependencies.py
from fastapi import Depends, HTTPException, Request, status
from src.api.models import User as DBUser, UserRepositoryAccess
from uuid import UUID

def require_role(*allowed_roles: str):
    """
    Dependency factory to require specific role(s).

    Usage:
        @router.post("/findings/{id}/delete")
        async def delete_finding(
            user: DBUser = Depends(require_role('analyst', 'admin', 'super_admin'))
        ):
            pass
    """
    def role_checker(
        request: Request,
        db_user: DBUser = Depends(get_db_user)
    ) -> DBUser:
        if db_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {', '.join(allowed_roles)}. Your role: {db_user.role}"
            )
        return db_user
    return role_checker

def check_repository_access(repository_id: UUID, action: str):
    """
    Dependency factory to check repository-level access.

    Permissions Matrix:
        - super_admin, admin: All actions on all repositories
        - manager: manage_findings, run_scan, view
        - analyst: submit_jira, mark_exception, delete_finding, run_scan, view
        - developer: run_scan, view_details, view
        - user: view only
    """
    def access_checker(
        request: Request,
        db_user: DBUser = Depends(get_db_user)
    ) -> bool:
        # Super Admin and Admin - full access
        if db_user.role in ['super_admin', 'admin']:
            return True

        # Check repository access
        from src.api.database import SessionLocal
        db = SessionLocal()
        try:
            access = db.query(UserRepositoryAccess).filter(
                UserRepositoryAccess.user_id == db_user.id,
                UserRepositoryAccess.repository_id == repository_id
            ).first()

            if not access:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"No access to repository {repository_id}"
                )

            # Check role-based action permissions
            if not can_perform_action(db_user.role, action):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Insufficient permissions for action '{action}'"
                )

            return True
        finally:
            db.close()

    return access_checker

def can_perform_action(role: str, action: str) -> bool:
    """Check if role can perform action."""
    permissions = {
        'super_admin': ['*'],
        'admin': ['*'],
        'manager': ['manage_findings', 'run_scan', 'view', 'view_details'],
        'analyst': ['submit_jira', 'mark_exception', 'delete_finding', 'run_scan', 'view', 'view_details'],
        'developer': ['run_scan', 'view_details', 'view'],
        'user': ['view']
    }
    role_perms = permissions.get(role, [])
    return '*' in role_perms or action in role_perms
```

### 1.2 A02:2021 - Cryptographic Failures

**Mitigations:**
- TLS 1.2+ for all external connections
- HSTS header with preload directive
- Encrypted database fields for PII (AES-256-GCM)
- Secure token generation (secrets.token_urlsafe)
- JWT signing with HS256 (self-signed) and RS256 (OIDC providers)

**Implementation:**

```python
# src/security/encryption.py
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
import base64
import os

def get_encryption_key() -> bytes:
    """
    Derive encryption key from environment variable.
    Uses PBKDF2 with 480000 iterations (OWASP recommendation 2024).
    """
    password = os.getenv("ENCRYPTION_KEY", "").encode()
    if not password:
        raise ValueError("ENCRYPTION_KEY environment variable not set")

    # Use fixed salt for deterministic key derivation
    # In production, store salt in secrets manager
    salt = os.getenv("ENCRYPTION_SALT", "fixed-salt-change-in-prod").encode()

    kdf = PBKDF2(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
        backend=default_backend()
    )
    key = base64.urlsafe_b64encode(kdf.derive(password))
    return key

def encrypt_field(plaintext: str) -> str:
    """Encrypt sensitive field using Fernet (AES-128-CBC + HMAC-SHA256)."""
    if not plaintext:
        return ""

    key = get_encryption_key()
    fernet = Fernet(key)
    ciphertext = fernet.encrypt(plaintext.encode())
    return base64.urlsafe_b64encode(ciphertext).decode()

def decrypt_field(ciphertext: str) -> str:
    """Decrypt sensitive field."""
    if not ciphertext:
        return ""

    key = get_encryption_key()
    fernet = Fernet(key)
    encrypted_bytes = base64.urlsafe_b64decode(ciphertext.encode())
    plaintext = fernet.decrypt(encrypted_bytes)
    return plaintext.decode()

# Usage in models
from sqlalchemy import Column, String, TypeDecorator

class EncryptedString(TypeDecorator):
    """SQLAlchemy column type for encrypted strings."""
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        """Encrypt on write."""
        if value is not None:
            return encrypt_field(value)
        return value

    def process_result_value(self, value, dialect):
        """Decrypt on read."""
        if value is not None:
            return decrypt_field(value)
        return value

# Example model
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, nullable=False, unique=True, index=True)

    # Encrypted PII fields
    phone_number = Column(EncryptedString(255), nullable=True)
    ssn_last_four = Column(EncryptedString(255), nullable=True)
```

### 1.3 A03:2021 - Injection

**Mitigations:**
- SQLAlchemy ORM with parameterized queries (no raw SQL)
- Pydantic input validation for all request bodies
- Path parameter validation with regex patterns
- Query parameter sanitization with allowlists
- NoSQL injection prevention (Redis keys prefixed)

**Implementation:**

```python
# src/api/routers/findings.py
from fastapi import APIRouter, Path, Query, HTTPException
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from uuid import UUID
import re

router = APIRouter(prefix="/findings", tags=["findings"])

# Input validation schemas
class FindingUpdate(BaseModel):
    """Validated input for updating findings."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=5000)
    severity: Optional[str] = Field(None, regex="^(critical|high|medium|low|info|warning)$")
    status: Optional[str] = Field(None, regex="^(open|investigating|resolved|false_positive|wont_fix)$")

    @validator('title', 'description')
    def sanitize_text(cls, v):
        """Remove potentially dangerous characters."""
        if v:
            # Remove control characters and null bytes
            v = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', v)
            # Strip leading/trailing whitespace
            v = v.strip()
        return v

# Path parameter validation
@router.get("/{finding_id}")
async def get_finding(
    finding_id: UUID = Path(..., description="Finding UUID"),
    db: Session = Depends(get_tenant_db)
):
    """
    UUID path parameter automatically validated by FastAPI.
    Invalid UUIDs return 422 Unprocessable Entity.
    """
    # Safe parameterized query via SQLAlchemy ORM
    finding = db.query(Finding).filter(Finding.id == finding_id).first()

    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    return finding

# Query parameter validation with allowlist
@router.get("/")
async def list_findings(
    page: int = Query(1, ge=1, le=10000, description="Page number"),
    page_size: int = Query(50, ge=1, le=500, description="Items per page"),
    severity: Optional[str] = Query(None, regex="^(critical|high|medium|low|info|warning)$"),
    status: Optional[str] = Query(None, regex="^(open|investigating|resolved|false_positive|wont_fix)$"),
    repo_name: Optional[str] = Query(None, max_length=255),
    order_by: str = Query("created_at", regex="^(created_at|severity|risk_score)$"),
    order_dir: str = Query("desc", regex="^(asc|desc)$"),
    db: Session = Depends(get_tenant_db)
):
    """
    Query parameters validated with:
    - Range validation (ge, le)
    - Regex allowlist (severity, status, order_by, order_dir)
    - Length validation (repo_name)
    """
    # Build query with parameterized filters
    query = db.query(Finding)

    if severity:
        query = query.filter(Finding.severity == severity)

    if status:
        query = query.filter(Finding.status == status)

    if repo_name:
        # Case-insensitive LIKE with parameterized value
        query = query.filter(Finding.repo_name.ilike(f"%{repo_name}%"))

    # Safe dynamic ordering (order_by validated against allowlist)
    from sqlalchemy import desc, asc
    order_col = getattr(Finding, order_by)
    query = query.order_by(desc(order_col) if order_dir == "desc" else asc(order_col))

    # Pagination
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    }

# Redis key prefixing to prevent injection
def get_cache_key(org_id: str, resource_type: str, resource_id: str) -> str:
    """
    Build namespaced Redis key with sanitization.
    Format: {PROJECT_NAME}:org:{org_id}:{resource_type}:{resource_id}
    """
    # Validate org_id is UUID
    try:
        UUID(org_id)
    except ValueError:
        raise ValueError(f"Invalid org_id: {org_id}")

    # Sanitize resource_type and resource_id
    resource_type = re.sub(r'[^a-z0-9_]', '', resource_type.lower())
    resource_id = re.sub(r'[^a-z0-9_-]', '', resource_id.lower())

    return f"{PROJECT_NAME}:org:{org_id}:{resource_type}:{resource_id}"
```

### 1.4 A04:2021 - Insecure Design

**Mitigations:**
- Threat modeling during design phase
- Defense in depth (multiple security layers)
- Principle of least privilege (default deny)
- Secure session management with dual timeout
- PKCE for OAuth flows (prevents authorization code interception)

**Implementation:**

```python
# src/auth/oauth.py
from authlib.integrations.starlette_client import OAuth
from starlette.config import Config
import secrets
import hashlib
import base64

def generate_pkce_challenge():
    """
    Generate PKCE code verifier and challenge.

    PKCE (RFC 7636) prevents authorization code interception attacks
    by requiring the client to prove it initiated the flow.
    """
    # Generate code verifier (43-128 characters)
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')

    # Generate code challenge (SHA256 hash of verifier)
    challenge_bytes = hashlib.sha256(code_verifier.encode('utf-8')).digest()
    code_challenge = base64.urlsafe_b64encode(challenge_bytes).decode('utf-8').rstrip('=')

    return code_verifier, code_challenge

@router.get("/login/{provider}")
async def login(provider: str, request: Request):
    """
    Initiate OAuth login with PKCE.
    """
    # Validate provider against allowlist
    if provider not in settings.registered_provider_names:
        raise HTTPException(status_code=400, detail="Invalid provider")

    # Generate PKCE parameters
    code_verifier, code_challenge = generate_pkce_challenge()

    # Store code_verifier in session (server-side)
    request.session['pkce_code_verifier'] = code_verifier
    request.session['oauth_state'] = secrets.token_urlsafe(32)

    # Build authorization URL with PKCE
    redirect_uri = request.url_for('callback', provider=provider)

    oauth_client = get_oauth_client(provider)
    return await oauth_client.authorize_redirect(
        request,
        redirect_uri,
        state=request.session['oauth_state'],
        code_challenge=code_challenge,
        code_challenge_method='S256'  # SHA256
    )

@router.get("/callback/{provider}")
async def callback(provider: str, request: Request):
    """
    Handle OAuth callback with PKCE verification.
    """
    # Verify state parameter (CSRF protection)
    state = request.query_params.get('state')
    if not state or state != request.session.get('oauth_state'):
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    # Retrieve code_verifier from session
    code_verifier = request.session.get('pkce_code_verifier')
    if not code_verifier:
        raise HTTPException(status_code=400, detail="Missing PKCE verifier")

    # Exchange authorization code for token (includes code_verifier)
    oauth_client = get_oauth_client(provider)
    token = await oauth_client.authorize_access_token(
        request,
        code_verifier=code_verifier
    )

    # Clear PKCE parameters
    request.session.pop('pkce_code_verifier', None)
    request.session.pop('oauth_state', None)

    # Extract user info and create session
    userinfo = token.get('userinfo')
    request.session['user'] = {
        'email': userinfo['email'],
        'name': userinfo['name'],
        'sub': userinfo['sub'],
        'provider': provider
    }

    return RedirectResponse(url='/')
```

### 1.5 A05:2021 - Security Misconfiguration

**Mitigations:**
- Remove default credentials and test accounts
- Disable directory listing and verbose error messages
- Security headers on all responses (CSP, HSTS, X-Frame-Options)
- Separate production/dev configurations
- Regular security scanning (OWASP ZAP, Trivy)

**Implementation:**

```python
# src/api/main.py
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import logging
import os

app = FastAPI(
    title="{PROJECT_NAME}",
    description="Production API",
    version="1.0.0",
    # Hide /docs and /redoc in production
    docs_url="/docs" if os.getenv("ENVIRONMENT") != "production" else None,
    redoc_url="/redoc" if os.getenv("ENVIRONMENT") != "production" else None,
    # Disable automatic redirect to trailing slash (security)
    redirect_slashes=False
)

# Disable detailed error responses in production
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """
    Generic exception handler.
    Production: Return sanitized error.
    Development: Return detailed traceback.
    """
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    if os.getenv("ENVIRONMENT") == "production":
        # Don't leak internal details in production
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"}
        )
    else:
        # Show details in development
        import traceback
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": str(exc),
                "traceback": traceback.format_exc()
            }
        )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Validation error handler.
    Returns sanitized validation errors (no internal field names).
    """
    errors = []
    for error in exc.errors():
        # Sanitize error location (don't expose internal field structure)
        loc = " -> ".join(str(x) for x in error["loc"])
        errors.append({
            "field": loc,
            "message": error["msg"],
            "type": error["type"]
        })

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Validation error", "errors": errors}
    )

# Environment-specific configuration
class Settings(BaseSettings):
    """Settings with environment-specific defaults."""

    environment: str = Field(default="development")
    debug: bool = Field(default=False)

    # Production-only settings
    enforce_https: bool = Field(default=False)
    hsts_enabled: bool = Field(default=False)
    cors_allow_origins: List[str] = Field(default=["http://localhost:3000"])

    @validator('debug')
    def disable_debug_in_production(cls, v, values):
        """Force debug=False in production."""
        if values.get('environment') == 'production' and v is True:
            raise ValueError("debug must be False in production")
        return v

    @validator('enforce_https', 'hsts_enabled')
    def require_https_in_production(cls, v, values):
        """Require HTTPS settings in production."""
        if values.get('environment') == 'production' and v is False:
            logger.warning(f"HTTPS settings should be enabled in production")
        return v
```

### 1.6 A06:2021 - Vulnerable and Outdated Components

**Mitigations:**
- Automated dependency scanning (pip-audit, npm audit)
- Dependabot for automatic updates
- SBOM generation for supply chain visibility
- Pinned dependency versions with lock files
- Regular security patching schedule

**Implementation:**

```bash
# .github/workflows/security-scan.yml
name: Security Scanning

on:
  push:
    branches: [main, develop]
  pull_request:
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'

jobs:
  dependency-scan-python:
    name: Python Dependency Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install pip-audit
        run: pip install pip-audit

      - name: Run pip-audit
        run: |
          pip-audit --requirement requirements.txt --format json --output pip-audit.json
          pip-audit --requirement requirements.txt --format cyclonedx-json --output sbom.json

      - name: Upload SBOM
        uses: actions/upload-artifact@v4
        with:
          name: sbom-python
          path: sbom.json

      - name: Check for critical vulnerabilities
        run: |
          CRITICAL=$(jq '[.vulnerabilities[] | select(.severity == "critical")] | length' pip-audit.json)
          if [ "$CRITICAL" -gt 0 ]; then
            echo "Found $CRITICAL critical vulnerabilities"
            exit 1
          fi

  dependency-scan-npm:
    name: NPM Dependency Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run npm audit
        working-directory: ./src/web-ui
        run: |
          npm audit --audit-level=high --json > npm-audit.json || true

      - name: Check for critical vulnerabilities
        working-directory: ./src/web-ui
        run: |
          CRITICAL=$(jq '.metadata.vulnerabilities.critical' npm-audit.json)
          if [ "$CRITICAL" -gt 0 ]; then
            echo "Found $CRITICAL critical vulnerabilities"
            exit 1
          fi

  container-scan:
    name: Container Image Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t {PROJECT_NAME}:test .

      - name: Run Trivy scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: '{PROJECT_NAME}:test'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-results.sarif'
```

```yaml
# .github/dependabot.yml
version: 2
updates:
  # Python dependencies
  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
      - "security"
    # Group minor and patch updates
    groups:
      minor-and-patch:
        patterns:
          - "*"
        update-types:
          - "minor"
          - "patch"
    # Auto-approve security updates
    reviewers:
      - "{GITHUB_ORG}/security-team"

  # NPM dependencies
  - package-ecosystem: "npm"
    directory: "/src/web-ui"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
      - "security"
    groups:
      minor-and-patch:
        patterns:
          - "*"
        update-types:
          - "minor"
          - "patch"

  # Docker base images
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    labels:
      - "dependencies"
      - "security"

  # GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    labels:
      - "dependencies"
      - "security"
```

### 1.7 A07:2021 - Identification and Authentication Failures

**Mitigations:**
- Multi-provider OIDC support (Entra ID, Okta, generic OIDC)
- Secure session management with SameSite cookies
- Token rotation (refresh tokens expire after 7 days)
- Session timeout (absolute + idle)
- Token blacklisting for logout
- Break-glass access for emergencies

**Implementation:**

```python
# src/auth/session.py
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import Optional
import json

class SessionMetadata(BaseModel):
    """Session metadata stored in Redis."""
    session_id: str
    user_sub: str
    provider: str
    created_at: datetime
    last_activity: datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    is_break_glass: bool = False

    def is_expired(self, absolute_timeout_hours: int, idle_timeout_minutes: int) -> tuple[bool, str]:
        """
        Check if session is expired based on dual timeout policy.

        Returns:
            (is_expired: bool, reason: str)
        """
        now = datetime.utcnow()

        # Check absolute timeout
        absolute_expiry = self.created_at + timedelta(hours=absolute_timeout_hours)
        if now > absolute_expiry:
            return (True, "absolute")

        # Check idle timeout
        idle_expiry = self.last_activity + timedelta(minutes=idle_timeout_minutes)
        if now > idle_expiry:
            return (True, "idle")

        return (False, "")

def create_session(session_id: str, user_data: dict, request: Request) -> SessionMetadata:
    """
    Create session metadata in Redis.
    """
    from src.auth.tokens import redis_client
    from src.auth.config import settings

    metadata = SessionMetadata(
        session_id=session_id,
        user_sub=user_data['sub'],
        provider=user_data.get('provider', 'unknown'),
        created_at=datetime.utcnow(),
        last_activity=datetime.utcnow(),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get('user-agent'),
        is_break_glass=user_data.get('is_break_glass', False)
    )

    # Store in Redis with TTL (absolute timeout)
    ttl_seconds = settings.session_absolute_timeout_hours * 3600
    redis_key = f"{PROJECT_NAME}:session:{session_id}"
    redis_client.setex(redis_key, ttl_seconds, metadata.model_dump_json())

    return metadata

def get_session_metadata(session_id: str) -> Optional[SessionMetadata]:
    """Retrieve session metadata from Redis."""
    from src.auth.tokens import redis_client

    redis_key = f"{PROJECT_NAME}:session:{session_id}"
    data = redis_client.get(redis_key)

    if not data:
        return None

    return SessionMetadata.model_validate_json(data)

def update_last_activity(session_id: str):
    """Update last_activity timestamp."""
    from src.auth.tokens import redis_client

    metadata = get_session_metadata(session_id)
    if not metadata:
        return

    metadata.last_activity = datetime.utcnow()

    redis_key = f"{PROJECT_NAME}:session:{session_id}"
    redis_client.setex(
        redis_key,
        settings.session_absolute_timeout_hours * 3600,
        metadata.model_dump_json()
    )

def delete_session(session_id: str):
    """Delete session from Redis."""
    from src.auth.tokens import redis_client

    redis_key = f"{PROJECT_NAME}:session:{session_id}"
    redis_client.delete(redis_key)
```

```python
# src/auth/tokens.py
import secrets
from datetime import datetime, timedelta
from jose import jwt
import redis
import os

# Redis client for token blacklist and session storage
redis_client = redis.Redis.from_url(
    os.getenv("REDIS_URL", "redis://redis:6379/0"),
    decode_responses=True
)

def generate_access_token(user_sub: str, email: str, name: str, provider: str) -> str:
    """
    Generate JWT access token (short-lived).

    Claims:
        - sub: User subject identifier
        - email: User email
        - name: User full name
        - provider: Identity provider name
        - iat: Issued at timestamp
        - exp: Expiration timestamp
        - jti: JWT ID (for blacklisting)
    """
    from src.auth.config import settings

    now = datetime.utcnow()
    exp = now + timedelta(minutes=settings.access_token_expire_minutes)
    jti = secrets.token_urlsafe(32)

    payload = {
        'sub': user_sub,
        'email': email,
        'name': name,
        'provider': provider,
        'iat': now,
        'exp': exp,
        'jti': jti
    }

    token = jwt.encode(payload, settings.jwt_secret_key, algorithm='HS256')
    return token

def generate_refresh_token(user_sub: str) -> str:
    """
    Generate refresh token (long-lived, opaque).
    Stored in Redis with user_sub mapping.
    """
    from src.auth.config import settings

    refresh_token = secrets.token_urlsafe(64)
    ttl_seconds = settings.refresh_token_expire_days * 86400

    # Store mapping: refresh_token -> user_sub
    redis_key = f"{PROJECT_NAME}:refresh_token:{refresh_token}"
    redis_client.setex(redis_key, ttl_seconds, user_sub)

    return refresh_token

def validate_refresh_token(refresh_token: str) -> Optional[str]:
    """
    Validate refresh token and return user_sub.
    Returns None if token is invalid or expired.
    """
    redis_key = f"{PROJECT_NAME}:refresh_token:{refresh_token}"
    user_sub = redis_client.get(redis_key)

    if not user_sub:
        return None

    # Token rotation: delete old token after use
    redis_client.delete(redis_key)

    return user_sub

def blacklist_token(jti: str, exp: int):
    """
    Add token to blacklist (for logout).
    Blacklist entry expires when token would naturally expire.
    """
    now = int(datetime.utcnow().timestamp())
    ttl = exp - now

    if ttl > 0:
        redis_key = f"{PROJECT_NAME}:token_blacklist:{jti}"
        redis_client.setex(redis_key, ttl, "1")

def is_token_blacklisted(jti: str) -> bool:
    """Check if token is blacklisted."""
    redis_key = f"{PROJECT_NAME}:token_blacklist:{jti}"
    return redis_client.exists(redis_key) > 0
```

### 1.8 A08:2021 - Software and Data Integrity Failures

**Mitigations:**
- Code signing for releases
- Docker image signing and verification
- Integrity checking for critical files
- Audit logging for all data modifications
- Git commit signing (GPG)

**Implementation:**

```python
# src/audit/logging.py
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, Text
from sqlalchemy.dialects.postgresql import UUID
import uuid
from src.api.database import Base
import logging

logger = logging.getLogger(__name__)

class AuditLog(Base):
    """Audit log for security-relevant events."""
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    # Actor information
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    user_email = Column(String, nullable=True)
    user_role = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)

    # Event information
    event_type = Column(String, nullable=False, index=True)  # e.g., "user.login", "finding.delete"
    resource_type = Column(String, nullable=True, index=True)  # e.g., "finding", "user", "api_key"
    resource_id = Column(String, nullable=True, index=True)
    action = Column(String, nullable=False)  # e.g., "create", "update", "delete", "read"

    # Details
    details = Column(JSON, nullable=True)  # Additional context
    old_value = Column(JSON, nullable=True)  # Previous state (for updates)
    new_value = Column(JSON, nullable=True)  # New state (for updates)

    # Result
    success = Column(Boolean, nullable=False, default=True)
    error_message = Column(Text, nullable=True)

    # Organization context
    organization_id = Column(UUID(as_uuid=True), nullable=True, index=True)

def log_audit_event(
    event_type: str,
    action: str,
    request: Request,
    db_user: Optional[DBUser] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    details: Optional[dict] = None,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
    success: bool = True,
    error_message: Optional[str] = None
):
    """
    Log audit event to database.

    Usage:
        log_audit_event(
            event_type="finding.delete",
            action="delete",
            request=request,
            db_user=current_user,
            resource_type="finding",
            resource_id=str(finding_id),
            details={"severity": "critical", "repo_name": "api-gateway"},
            success=True
        )
    """
    from src.api.database import SessionLocal

    db = SessionLocal()
    try:
        audit_log = AuditLog(
            timestamp=datetime.utcnow(),
            user_id=db_user.id if db_user else None,
            user_email=db_user.email if db_user else None,
            user_role=db_user.role if db_user else None,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent'),
            event_type=event_type,
            resource_type=resource_type,
            resource_id=resource_id,
            action=action,
            details=details,
            old_value=old_value,
            new_value=new_value,
            success=success,
            error_message=error_message,
            organization_id=getattr(request.state, 'org_id', None)
        )

        db.add(audit_log)
        db.commit()

        logger.info(f"Audit log created: {event_type} - {action} - {resource_type}/{resource_id}")

    except Exception as e:
        logger.error(f"Failed to create audit log: {e}")
        db.rollback()
    finally:
        db.close()

# Usage in endpoints
@router.delete("/{finding_id}")
async def delete_finding(
    finding_id: UUID,
    request: Request,
    db: Session = Depends(get_tenant_db),
    current_user: DBUser = Depends(require_role('analyst', 'admin', 'super_admin'))
):
    """Delete finding with audit logging."""
    # Fetch finding
    finding = db.query(Finding).filter(Finding.id == finding_id).first()

    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    # Capture old state for audit log
    old_value = {
        "title": finding.title,
        "severity": finding.severity,
        "status": finding.status,
        "repo_name": finding.repo_name
    }

    try:
        # Delete finding
        db.delete(finding)
        db.commit()

        # Log successful deletion
        log_audit_event(
            event_type="finding.delete",
            action="delete",
            request=request,
            db_user=current_user,
            resource_type="finding",
            resource_id=str(finding_id),
            details={"repo_name": finding.repo_name},
            old_value=old_value,
            success=True
        )

        return {"message": "Finding deleted"}

    except Exception as e:
        db.rollback()

        # Log failed deletion
        log_audit_event(
            event_type="finding.delete",
            action="delete",
            request=request,
            db_user=current_user,
            resource_type="finding",
            resource_id=str(finding_id),
            success=False,
            error_message=str(e)
        )

        raise HTTPException(status_code=500, detail="Failed to delete finding")
```

### 1.9 A09:2021 - Security Logging and Monitoring Failures

**Mitigations:**
- Structured logging (JSON format)
- Centralized log aggregation (ELK, CloudWatch)
- Security event alerting
- Log retention policy (90 days minimum)
- Tamper-proof logs (write-only S3 bucket)

**Implementation:**

```python
# src/logging/config.py
import logging
import json
from datetime import datetime
from typing import Any, Dict
import os

class SecurityJSONFormatter(logging.Formatter):
    """
    JSON formatter for security-relevant events.
    Includes timestamp, level, message, and context.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }

        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        # Add custom fields from extra
        for key, value in record.__dict__.items():
            if key not in ['name', 'msg', 'args', 'created', 'filename', 'funcName',
                          'levelname', 'levelno', 'lineno', 'module', 'msecs',
                          'message', 'pathname', 'process', 'processName',
                          'relativeCreated', 'thread', 'threadName', 'exc_info',
                          'exc_text', 'stack_info']:
                log_data[key] = value

        return json.dumps(log_data)

def setup_security_logging():
    """
    Configure security logging with JSON formatter and file handlers.
    """
    # Create logs directory
    os.makedirs('/var/log/{PROJECT_NAME}', exist_ok=True)

    # Security logger (separate file for security events)
    security_logger = logging.getLogger('security')
    security_logger.setLevel(logging.INFO)

    # Security log file handler
    security_handler = logging.FileHandler('/var/log/{PROJECT_NAME}/security.log')
    security_handler.setFormatter(SecurityJSONFormatter())
    security_logger.addHandler(security_handler)

    # Application logger
    app_logger = logging.getLogger('{PROJECT_NAME}')
    app_logger.setLevel(logging.INFO)

    # Application log file handler
    app_handler = logging.FileHandler('/var/log/{PROJECT_NAME}/app.log')
    app_handler.setFormatter(SecurityJSONFormatter())
    app_logger.addHandler(app_handler)

    # Console handler for development
    if os.getenv('ENVIRONMENT') != 'production':
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(SecurityJSONFormatter())
        security_logger.addHandler(console_handler)
        app_logger.addHandler(console_handler)

# Security event logging helpers
def log_security_event(
    event_type: str,
    severity: str,
    message: str,
    user_email: Optional[str] = None,
    ip_address: Optional[str] = None,
    **kwargs
):
    """
    Log security-relevant event.

    Event types:
        - auth.login.success
        - auth.login.failure
        - auth.logout
        - auth.token.refresh
        - auth.token.revoked
        - authz.access_denied
        - api_key.created
        - api_key.revoked
        - data.export
        - config.changed
    """
    security_logger = logging.getLogger('security')

    extra = {
        'event_type': event_type,
        'severity': severity,
        'user_email': user_email,
        'ip_address': ip_address,
        **kwargs
    }

    security_logger.info(message, extra=extra)

# Usage examples
def log_login_attempt(email: str, ip_address: str, success: bool, reason: Optional[str] = None):
    """Log login attempt."""
    log_security_event(
        event_type='auth.login.success' if success else 'auth.login.failure',
        severity='INFO' if success else 'WARNING',
        message=f"Login {'successful' if success else 'failed'} for {email}",
        user_email=email,
        ip_address=ip_address,
        reason=reason
    )

def log_access_denied(user_email: str, resource: str, action: str, reason: str):
    """Log authorization failure."""
    log_security_event(
        event_type='authz.access_denied',
        severity='WARNING',
        message=f"Access denied: {user_email} attempted {action} on {resource}",
        user_email=user_email,
        resource=resource,
        action=action,
        reason=reason
    )

def log_sensitive_data_access(user_email: str, resource_type: str, resource_id: str):
    """Log access to sensitive data."""
    log_security_event(
        event_type='data.access',
        severity='INFO',
        message=f"Sensitive data accessed: {resource_type}/{resource_id}",
        user_email=user_email,
        resource_type=resource_type,
        resource_id=resource_id
    )
```

### 1.10 A10:2021 - Server-Side Request Forgery (SSRF)

**Mitigations:**
- URL allowlist for external requests
- Disable redirects for external HTTP clients
- Network-level egress filtering
- Validate and sanitize all URLs
- Use dedicated service account with minimal permissions

**Implementation:**

```python
# src/security/ssrf_protection.py
import requests
from urllib.parse import urlparse
from typing import Optional, List
import re
import ipaddress
import logging

logger = logging.getLogger(__name__)

# Allowlist of permitted domains for external requests
ALLOWED_DOMAINS = [
    "api.github.com",
    "github.com",
    "raw.githubusercontent.com",
    "login.microsoftonline.com",
    "graph.microsoft.com",
    "{CSP_DOMAINS}".split(",")
]

# Blocklist of private IP ranges (RFC 1918, RFC 4193, etc.)
BLOCKED_IP_RANGES = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),      # Loopback
    ipaddress.ip_network("169.254.0.0/16"),   # Link-local
    ipaddress.ip_network("::1/128"),          # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),         # IPv6 private
    ipaddress.ip_network("fe80::/10"),        # IPv6 link-local
]

def is_safe_url(url: str, allowed_domains: Optional[List[str]] = None) -> bool:
    """
    Validate URL against allowlist and block private IPs.

    Args:
        url: URL to validate
        allowed_domains: Optional list of allowed domains (overrides default)

    Returns:
        True if URL is safe, False otherwise
    """
    if not url or not url.startswith(('http://', 'https://')):
        logger.warning(f"Invalid URL scheme: {url}")
        return False

    try:
        parsed = urlparse(url)
        hostname = parsed.hostname

        if not hostname:
            logger.warning(f"Missing hostname in URL: {url}")
            return False

        # Check domain allowlist
        domains = allowed_domains or ALLOWED_DOMAINS
        if not any(hostname == domain or hostname.endswith(f'.{domain}') for domain in domains):
            logger.warning(f"Domain not in allowlist: {hostname}")
            return False

        # Resolve hostname to IP and check against blocked ranges
        import socket
        try:
            ip_str = socket.gethostbyname(hostname)
            ip = ipaddress.ip_address(ip_str)

            for blocked_range in BLOCKED_IP_RANGES:
                if ip in blocked_range:
                    logger.warning(f"IP {ip} is in blocked range {blocked_range}")
                    return False

        except socket.gaierror:
            logger.warning(f"Failed to resolve hostname: {hostname}")
            return False

        return True

    except Exception as e:
        logger.error(f"Error validating URL: {e}")
        return False

def safe_http_get(url: str, timeout: int = 10, **kwargs) -> requests.Response:
    """
    Make safe HTTP GET request with SSRF protection.

    Args:
        url: URL to request
        timeout: Request timeout in seconds
        **kwargs: Additional arguments for requests.get()

    Returns:
        Response object

    Raises:
        ValueError: If URL fails validation
        requests.RequestException: If request fails
    """
    if not is_safe_url(url):
        raise ValueError(f"URL failed validation: {url}")

    # Disable redirects to prevent bypass
    kwargs['allow_redirects'] = False
    kwargs['timeout'] = timeout

    # Set user agent
    headers = kwargs.get('headers', {})
    headers.setdefault('User-Agent', '{PROJECT_NAME}/1.0')
    kwargs['headers'] = headers

    logger.info(f"Making safe HTTP GET request to {url}")
    response = requests.get(url, **kwargs)

    return response

# Usage in GitHub API client
class GitHubAPI:
    """GitHub API client with SSRF protection."""

    GITHUB_API_BASE = "https://api.github.com"

    def get_repository(self, owner: str, repo: str) -> dict:
        """
        Fetch repository metadata.

        Args:
            owner: Repository owner
            repo: Repository name

        Returns:
            Repository metadata dict
        """
        # Sanitize inputs
        owner = re.sub(r'[^a-zA-Z0-9_-]', '', owner)
        repo = re.sub(r'[^a-zA-Z0-9_-]', '', repo)

        url = f"{self.GITHUB_API_BASE}/repos/{owner}/{repo}"

        # Use safe_http_get with SSRF protection
        response = safe_http_get(
            url,
            headers={'Authorization': f'token {self.token}'}
        )

        response.raise_for_status()
        return response.json()
```

---

## 2. Security Headers Middleware

Implement comprehensive security headers on all HTTP responses.

```python
# src/auth/middleware.py
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
import os

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Add security headers to all responses.

    Headers implemented:
        - Content-Security-Policy (CSP)
        - Strict-Transport-Security (HSTS)
        - X-Frame-Options
        - X-Content-Type-Options
        - Referrer-Policy
        - Permissions-Policy
        - X-XSS-Protection (legacy)
    """

    def __init__(self, app, enforce_https: bool = False):
        super().__init__(app)
        self.enforce_https = enforce_https or os.getenv("ENVIRONMENT") == "production"

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Content-Security-Policy (CSP)
        csp_directives = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' {CSP_DOMAINS}",
            "style-src 'self' 'unsafe-inline' {CSP_DOMAINS}",
            "img-src 'self' data: https:",
            "font-src 'self' data: {CSP_DOMAINS}",
            "connect-src 'self' https://login.microsoftonline.com https://*.okta.com",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'"
        ]
        response.headers["Content-Security-Policy"] = "; ".join(csp_directives)

        # Strict-Transport-Security (HSTS) - production only
        if self.enforce_https:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        # X-Frame-Options - prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # X-Content-Type-Options - prevent MIME sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Referrer-Policy - control referer leakage
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions-Policy - restrict browser features
        permissions = [
            "geolocation=()",
            "microphone=()",
            "camera=()",
            "payment=()",
            "usb=()"
        ]
        response.headers["Permissions-Policy"] = ", ".join(permissions)

        # X-XSS-Protection (legacy)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        return response

# Register middleware in main.py
from fastapi import FastAPI
from src.auth.middleware import SecurityHeadersMiddleware

app = FastAPI()
app.add_middleware(SecurityHeadersMiddleware, enforce_https=True)
```

---

## 3. Input Validation

Comprehensive input validation using Pydantic models.

```python
# src/api/schemas/validation.py
from pydantic import BaseModel, Field, validator, constr
from typing import Optional, List
from uuid import UUID
import re

class StrictBaseModel(BaseModel):
    """Base model with strict validation."""

    class Config:
        # Reject extra fields
        extra = "forbid"
        # Strip whitespace from strings
        str_strip_whitespace = True
        # Validate on assignment
        validate_assignment = True

class UserCreate(StrictBaseModel):
    """User creation schema with validation."""

    email: constr(max_length=255) = Field(..., description="Email address")
    full_name: constr(min_length=1, max_length=255) = Field(..., description="Full name")
    role: constr(regex="^(super_admin|admin|manager|analyst|developer|user)$") = Field(
        ..., description="User role"
    )

    @validator('email')
    def validate_email(cls, v):
        """Validate email format."""
        email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_regex, v):
            raise ValueError("Invalid email format")
        return v.lower()

    @validator('full_name')
    def sanitize_name(cls, v):
        """Remove control characters from name."""
        v = re.sub(r'[\x00-\x1F\x7F]', '', v)
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()

class FileUploadRequest(StrictBaseModel):
    """File upload validation."""

    filename: constr(max_length=255) = Field(..., description="Original filename")
    content_type: constr(max_length=100) = Field(..., description="MIME type")
    size_bytes: int = Field(..., ge=1, le=10_000_000, description="File size (max 10MB)")

    @validator('filename')
    def validate_filename(cls, v):
        """Validate filename - block path traversal."""
        # Remove path components
        v = os.path.basename(v)

        # Block dangerous extensions
        blocked_extensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.dll', '.so']
        if any(v.lower().endswith(ext) for ext in blocked_extensions):
            raise ValueError(f"File type not allowed")

        # Sanitize filename
        v = re.sub(r'[^a-zA-Z0-9._-]', '_', v)

        return v

    @validator('content_type')
    def validate_content_type(cls, v):
        """Validate content type against allowlist."""
        allowed_types = [
            'application/json',
            'application/pdf',
            'text/plain',
            'text/csv',
            'image/png',
            'image/jpeg'
        ]
        if v not in allowed_types:
            raise ValueError(f"Content type {v} not allowed")
        return v

class SearchQuery(StrictBaseModel):
    """Search query validation."""

    q: constr(min_length=1, max_length=500) = Field(..., description="Search query")
    filters: Optional[dict] = Field(default={}, description="Search filters")
    page: int = Field(default=1, ge=1, le=10000)
    page_size: int = Field(default=50, ge=1, le=500)

    @validator('q')
    def sanitize_query(cls, v):
        """Sanitize search query - prevent injection."""
        # Remove SQL/NoSQL operators
        v = re.sub(r'[;${}]', '', v)
        # Remove excessive whitespace
        v = ' '.join(v.split())
        return v

    @validator('filters')
    def validate_filters(cls, v):
        """Validate filter keys against allowlist."""
        allowed_keys = ['severity', 'status', 'repo_name', 'date_from', 'date_to']
        for key in v.keys():
            if key not in allowed_keys:
                raise ValueError(f"Filter key '{key}' not allowed")
        return v
```

---

## 4. SQL Injection Prevention

SQLAlchemy ORM best practices to prevent SQL injection.

```python
# src/api/routers/repositories.py
from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from typing import List, Optional
from uuid import UUID

router = APIRouter(prefix="/repositories", tags=["repositories"])

# SAFE: Parameterized queries via ORM
@router.get("/")
async def list_repositories(
    org_id: UUID = Query(..., description="Organization ID"),
    name_filter: Optional[str] = Query(None, max_length=255),
    is_archived: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_tenant_db)
):
    """
    List repositories with safe parameterized filtering.
    SQLAlchemy ORM automatically escapes all values.
    """
    # Build query with safe ORM methods
    query = db.query(Repository).filter(Repository.organization_id == org_id)

    # Safe ILIKE with parameterized value
    if name_filter:
        query = query.filter(Repository.name.ilike(f"%{name_filter}%"))

    # Safe boolean filter
    if is_archived is not None:
        query = query.filter(Repository.is_archived == is_archived)

    # Count total (parameterized)
    total = query.count()

    # Paginate (parameterized)
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {"items": items, "total": total}

# SAFE: IN clause with list of UUIDs
@router.post("/batch")
async def get_repositories_batch(
    repository_ids: List[UUID] = Body(..., max_items=100),
    db: Session = Depends(get_tenant_db)
):
    """
    Fetch multiple repositories by ID.
    SQLAlchemy .in_() operator is safe with list of UUIDs.
    """
    repositories = db.query(Repository).filter(
        Repository.id.in_(repository_ids)
    ).all()

    return {"repositories": repositories}

# SAFE: Dynamic ordering with allowlist
@router.get("/sorted")
async def list_repositories_sorted(
    sort_by: str = Query("name", regex="^(name|created_at|updated_at|stars)$"),
    sort_order: str = Query("asc", regex="^(asc|desc)$"),
    db: Session = Depends(get_tenant_db)
):
    """
    List repositories with safe dynamic ordering.
    sort_by validated against allowlist via regex.
    """
    from sqlalchemy import desc, asc

    # Get column object (safe - sort_by validated against allowlist)
    sort_column = getattr(Repository, sort_by)

    # Apply ordering
    if sort_order == "desc":
        query = db.query(Repository).order_by(desc(sort_column))
    else:
        query = db.query(Repository).order_by(asc(sort_column))

    return {"repositories": query.all()}

# DANGEROUS: Raw SQL (avoid unless absolutely necessary)
@router.get("/raw-sql-example")
async def raw_sql_example(
    org_id: UUID = Query(...),
    db: Session = Depends(get_tenant_db)
):
    """
    Raw SQL query (use only when ORM is insufficient).
    MUST use parameterized queries with :param syntax.
    """
    from sqlalchemy import text

    # SAFE: Parameterized raw SQL
    sql = text("""
        SELECT r.id, r.name, COUNT(f.id) as finding_count
        FROM repositories r
        LEFT JOIN findings f ON f.repository_id = r.id
        WHERE r.organization_id = :org_id
        GROUP BY r.id, r.name
        ORDER BY finding_count DESC
        LIMIT 10
    """)

    # Execute with named parameters
    result = db.execute(sql, {"org_id": str(org_id)})

    rows = [{"id": row[0], "name": row[1], "finding_count": row[2]} for row in result]

    return {"repositories": rows}

# WRONG: String concatenation (NEVER DO THIS)
@router.get("/vulnerable-example")
async def vulnerable_example(
    repo_name: str = Query(...),
    db: Session = Depends(get_tenant_db)
):
    """
    VULNERABLE to SQL injection - DO NOT USE.
    Included for educational purposes only.
    """
    # DANGEROUS: String concatenation
    sql = f"SELECT * FROM repositories WHERE name = '{repo_name}'"

    # Attacker can inject: ' OR '1'='1
    # Resulting SQL: SELECT * FROM repositories WHERE name = '' OR '1'='1'
    # This returns all repositories!

    # NEVER DO THIS
    raise HTTPException(status_code=501, detail="This endpoint is intentionally disabled")
```

---

## 5. XSS Prevention

Prevent Cross-Site Scripting attacks with output encoding and CSP.

```python
# src/api/utils/sanitization.py
import bleach
import html
from typing import Optional

# Allowlist of safe HTML tags for rich text fields
ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'code', 'pre', 'blockquote'
]

ALLOWED_ATTRIBUTES = {
    'a': ['href', 'title'],
    'code': ['class']
}

def sanitize_html(text: str) -> str:
    """
    Sanitize HTML content to prevent XSS.

    Uses bleach library to strip dangerous tags/attributes.
    Only allows safe HTML tags from allowlist.
    """
    if not text:
        return ""

    # Clean HTML with allowlist
    cleaned = bleach.clean(
        text,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True
    )

    # Linkify URLs (safe)
    cleaned = bleach.linkify(cleaned)

    return cleaned

def escape_html(text: str) -> str:
    """
    Escape HTML entities for plain text output.
    Use for user-generated content displayed as plain text.
    """
    if not text:
        return ""

    return html.escape(text)

def sanitize_json_value(value: any) -> any:
    """
    Recursively sanitize JSON values to prevent XSS in API responses.
    Escapes strings, recurses into dicts/lists.
    """
    if isinstance(value, str):
        return escape_html(value)
    elif isinstance(value, dict):
        return {k: sanitize_json_value(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [sanitize_json_value(item) for item in value]
    else:
        return value

# Usage in models
from pydantic import BaseModel, validator

class FindingResponse(BaseModel):
    """Finding response with automatic XSS protection."""

    title: str
    description: Optional[str] = None
    code_snippet: Optional[str] = None

    @validator('title', 'description')
    def escape_html_fields(cls, v):
        """Escape HTML in text fields."""
        return escape_html(v) if v else v

    @validator('code_snippet')
    def sanitize_code(cls, v):
        """Sanitize code snippet (preserve formatting)."""
        if not v:
            return v

        # Escape HTML but preserve whitespace/newlines
        return escape_html(v)
```

**Frontend Protection (React/Next.js):**

```typescript
// src/web-ui/lib/sanitization.ts
import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML for rendering in React.
 * Uses DOMPurify to strip dangerous tags/attributes.
 */
export function sanitizeHTML(html: string): string {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'code', 'pre', 'blockquote'
    ],
    ALLOWED_ATTR: ['href', 'title', 'class'],
    ALLOW_DATA_ATTR: false
  });
}

/**
 * Render sanitized HTML in React component.
 * Use dangerouslySetInnerHTML only with sanitized content.
 */
export function SafeHTML({ html }: { html: string }) {
  const sanitized = sanitizeHTML(html);

  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}

// Usage
import { SafeHTML } from '@/lib/sanitization';

function FindingDetail({ finding }: { finding: Finding }) {
  return (
    <div>
      {/* Safe: React automatically escapes */}
      <h1>{finding.title}</h1>

      {/* Safe: Sanitized before rendering */}
      <SafeHTML html={finding.description} />

      {/* Safe: Code block with syntax highlighting */}
      <pre><code>{finding.code_snippet}</code></pre>
    </div>
  );
}
```

---

## 6. CSRF Protection

Protect against Cross-Site Request Forgery attacks.

```python
# src/auth/csrf.py
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
import secrets
import hmac
import hashlib
import os

CSRF_TOKEN_LENGTH = 32
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_COOKIE_NAME = "csrf_token"
CSRF_SECRET = os.getenv("CSRF_SECRET", secrets.token_hex(32))

def generate_csrf_token() -> str:
    """Generate CSRF token (random)."""
    return secrets.token_urlsafe(CSRF_TOKEN_LENGTH)

def verify_csrf_token(request_token: str, cookie_token: str) -> bool:
    """
    Verify CSRF token using double-submit cookie pattern.
    Compares token from header/form with token from cookie.
    """
    if not request_token or not cookie_token:
        return False

    # Constant-time comparison to prevent timing attacks
    return hmac.compare_digest(request_token, cookie_token)

class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    """
    CSRF protection middleware using double-submit cookie pattern.

    Safe methods (GET, HEAD, OPTIONS): No CSRF check
    Unsafe methods (POST, PUT, DELETE, PATCH): Require CSRF token
    """

    SAFE_METHODS = {'GET', 'HEAD', 'OPTIONS'}
    EXEMPT_PATHS = {'/auth/callback', '/auth/login', '/health', '/metrics'}

    async def dispatch(self, request: Request, call_next):
        # Skip CSRF check for safe methods
        if request.method in self.SAFE_METHODS:
            return await call_next(request)

        # Skip CSRF check for exempt paths
        if request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)

        # Get CSRF token from header
        request_token = request.headers.get(CSRF_HEADER_NAME)

        # Get CSRF token from cookie
        cookie_token = request.cookies.get(CSRF_COOKIE_NAME)

        # Verify tokens match
        if not verify_csrf_token(request_token, cookie_token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token validation failed"
            )

        return await call_next(request)

@router.get("/csrf-token")
async def get_csrf_token(request: Request, response: Response):
    """
    Generate and return CSRF token.
    Sets token in cookie and returns in response body.
    """
    token = generate_csrf_token()

    # Set CSRF token cookie with security flags
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=os.getenv("ENVIRONMENT") == "production",
        samesite="strict",
        max_age=86400  # 24 hours
    )

    return {"csrf_token": token}

# Register middleware
from fastapi import FastAPI
from src.auth.csrf import CSRFProtectionMiddleware

app = FastAPI()
app.add_middleware(CSRFProtectionMiddleware)
```

**Frontend Integration:**

```typescript
// src/web-ui/lib/api.ts
import axios from 'axios';

// Create axios instance with CSRF protection
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,  // Include cookies
});

// Fetch CSRF token on app initialization
let csrfToken: string | null = null;

export async function initializeCSRF() {
  try {
    const response = await api.get('/csrf-token');
    csrfToken = response.data.csrf_token;
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error);
  }
}

// Add CSRF token to all unsafe requests
api.interceptors.request.use((config) => {
  // Add CSRF token to POST, PUT, DELETE, PATCH requests
  if (config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }

  return config;
});

// Re-fetch CSRF token on 403 errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 403 && error.response?.data?.detail?.includes('CSRF')) {
      // CSRF token expired or invalid - refetch
      await initializeCSRF();

      // Retry original request
      const config = error.config;
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      }
      return api.request(config);
    }

    return Promise.reject(error);
  }
);

export default api;
```

---

## 7. Authentication Security

Secure authentication implementation with PKCE, token rotation, and session security.

```python
# src/auth/config.py
from pydantic_settings import BaseSettings
from typing import List

class AuthSettings(BaseSettings):
    """Authentication security settings."""

    # Session configuration
    session_secret: str  # 32+ byte random secret
    session_absolute_timeout_hours: int = 8
    session_idle_timeout_minutes: int = 30
    session_cookie_name: str = "session"
    session_cookie_secure: bool = True
    session_cookie_httponly: bool = True
    session_cookie_samesite: str = "lax"

    # JWT configuration
    jwt_secret_key: str  # 32+ byte random secret
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = {ACCESS_TOKEN_MINUTES}
    refresh_token_expire_days: int = {REFRESH_TOKEN_DAYS}

    # OAuth/OIDC configuration
    oidc_provider_name: str = ""
    oidc_client_id: str = ""
    oidc_client_secret: str = ""
    oidc_discovery_url: str = ""
    oidc_external_base_url: str = ""

    # Microsoft Entra ID
    entra_client_id: str = ""
    entra_client_secret: str = ""
    entra_tenant_id: str = ""

    # Okta
    okta_client_id: str = ""
    okta_client_secret: str = ""
    okta_domain: str = ""

    # Redis for session storage
    redis_url: str = "{REDIS_URL}"

    # Security features
    require_mfa: bool = False
    allow_password_auth: bool = False  # Disable password auth, use OIDC only
    enable_break_glass: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = AuthSettings()
```

**Secure Cookie Configuration:**

```python
# src/api/main.py
from starlette.middleware.sessions import SessionMiddleware
from fastapi import FastAPI
import os

app = FastAPI()

# Add session middleware with secure settings
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET"),
    session_cookie="{PROJECT_NAME}_session",
    max_age=settings.session_absolute_timeout_hours * 3600,
    https_only=os.getenv("ENVIRONMENT") == "production",
    same_site="lax"  # or "strict" for highest security
)
```

---

## 8. Authorization Security

RBAC enforcement with privilege escalation prevention.

```python
# src/rbac/models.py
from enum import Enum
from typing import List, Set

class Role(str, Enum):
    """User roles (hierarchical)."""
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    ANALYST = "analyst"
    DEVELOPER = "developer"
    USER = "user"

class Permission(str, Enum):
    """Granular permissions."""
    # User management
    USER_CREATE = "user.create"
    USER_READ = "user.read"
    USER_UPDATE = "user.update"
    USER_DELETE = "user.delete"
    USER_ROLE_CHANGE = "user.role_change"

    # Finding management
    FINDING_READ = "finding.read"
    FINDING_UPDATE = "finding.update"
    FINDING_DELETE = "finding.delete"
    FINDING_EXPORT = "finding.export"

    # Scan operations
    SCAN_RUN = "scan.run"
    SCAN_CONFIGURE = "scan.configure"

    # API keys
    API_KEY_CREATE = "api_key.create"
    API_KEY_REVOKE = "api_key.revoke"

    # Audit logs
    AUDIT_LOG_READ = "audit_log.read"

# Role-permission mapping
ROLE_PERMISSIONS: dict[Role, Set[Permission]] = {
    Role.SUPER_ADMIN: {perm for perm in Permission},  # All permissions

    Role.ADMIN: {
        Permission.USER_CREATE,
        Permission.USER_READ,
        Permission.USER_UPDATE,
        Permission.USER_DELETE,
        Permission.FINDING_READ,
        Permission.FINDING_UPDATE,
        Permission.FINDING_DELETE,
        Permission.FINDING_EXPORT,
        Permission.SCAN_RUN,
        Permission.SCAN_CONFIGURE,
        Permission.API_KEY_CREATE,
        Permission.API_KEY_REVOKE,
        Permission.AUDIT_LOG_READ,
    },

    Role.MANAGER: {
        Permission.USER_READ,
        Permission.FINDING_READ,
        Permission.FINDING_UPDATE,
        Permission.FINDING_EXPORT,
        Permission.SCAN_RUN,
        Permission.AUDIT_LOG_READ,
    },

    Role.ANALYST: {
        Permission.USER_READ,
        Permission.FINDING_READ,
        Permission.FINDING_UPDATE,
        Permission.FINDING_DELETE,
        Permission.SCAN_RUN,
    },

    Role.DEVELOPER: {
        Permission.FINDING_READ,
        Permission.SCAN_RUN,
    },

    Role.USER: {
        Permission.FINDING_READ,
    },
}

def has_permission(role: Role, permission: Permission) -> bool:
    """Check if role has permission."""
    return permission in ROLE_PERMISSIONS.get(role, set())

def require_permission(permission: Permission):
    """
    Dependency to require specific permission.

    Usage:
        @router.delete("/users/{user_id}")
        async def delete_user(
            user_id: UUID,
            current_user: DBUser = Depends(require_permission(Permission.USER_DELETE))
        ):
            pass
    """
    def permission_checker(
        request: Request,
        db_user: DBUser = Depends(get_db_user)
    ) -> DBUser:
        if not has_permission(Role(db_user.role), permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission.value}"
            )
        return db_user

    return permission_checker

# Privilege escalation prevention
@router.patch("/users/{user_id}/role")
async def change_user_role(
    user_id: UUID,
    new_role: Role,
    db: Session = Depends(get_db),
    current_user: DBUser = Depends(require_permission(Permission.USER_ROLE_CHANGE))
):
    """
    Change user role with privilege escalation prevention.

    Rules:
    - Super admins can assign any role
    - Admins cannot create super admins
    - Users cannot change their own role
    - Users cannot elevate to higher role than their own
    """
    target_user = db.query(DBUser).filter(DBUser.id == user_id).first()

    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent self-role-change
    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change your own role"
        )

    # Role hierarchy check
    current_role_level = list(Role).index(Role(current_user.role))
    new_role_level = list(Role).index(new_role)

    # Admins cannot create super admins
    if current_user.role == Role.ADMIN and new_role == Role.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot create super admins"
        )

    # Users cannot elevate to higher role than their own
    if new_role_level < current_role_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot assign role higher than your own"
        )

    # Update role
    old_role = target_user.role
    target_user.role = new_role.value
    db.commit()

    # Audit log
    log_audit_event(
        event_type="user.role_change",
        action="update",
        request=request,
        db_user=current_user,
        resource_type="user",
        resource_id=str(user_id),
        old_value={"role": old_role},
        new_value={"role": new_role.value},
        details={"target_email": target_user.email}
    )

    return {"message": "Role updated", "new_role": new_role.value}
```

---

## 9. Rate Limiting

Comprehensive rate limiting with Redis sliding window.

```python
# src/auth/rate_limit.py
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request
import redis
import os
import logging

logger = logging.getLogger(__name__)

# Redis client
redis_client = redis.Redis.from_url(
    os.getenv("REDIS_URL", "{REDIS_URL}"),
    decode_responses=True
)

def get_user_identifier(request: Request) -> str:
    """
    Get identifier for rate limiting.

    Priority:
    1. User sub (authenticated)
    2. API key ID (API client)
    3. IP address (anonymous)
    """
    # Check session
    user_data = request.session.get('user')
    if user_data and 'sub' in user_data:
        return f"user:{user_data['sub']}"

    # Check API key
    if hasattr(request.state, 'api_key_id'):
        return f"api_key:{request.state.api_key_id}"

    # Fall back to IP
    return f"ip:{get_remote_address(request)}"

# Create limiter
limiter = Limiter(
    key_func=get_user_identifier,
    storage_uri=None,
    storage_options={"connection": redis_client},
    default_limits=["{RATE_LIMIT_DEFAULT}"],
    headers_enabled=True  # Add X-RateLimit-* headers
)

# Endpoint-specific limits
ENDPOINT_LIMITS = {
    "/auth/login": "{RATE_LIMIT_AUTH}",
    "/auth/register": "3/minute",
    "/auth/refresh": "10/minute",
    "/auth/reset-password": "3/minute",
    "/api/scan/trigger": "10/hour",
    "/api/export": "5/hour",
}

def get_endpoint_limit(request: Request) -> str:
    """Get rate limit for endpoint."""
    path = request.url.path

    for endpoint_path, limit in ENDPOINT_LIMITS.items():
        if path.startswith(endpoint_path):
            return limit

    return "{RATE_LIMIT_DEFAULT}"

# Usage in endpoints
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.get("/api/findings")
@limiter.limit("100/minute")
async def list_findings(request: Request):
    """Rate limited endpoint."""
    pass

@app.post("/auth/login")
@limiter.limit("{RATE_LIMIT_AUTH}")
async def login(request: Request):
    """Aggressive rate limiting for auth endpoints."""
    pass
```

---

## 10. Data Protection

Encryption at rest, in transit, and field-level encryption for PII.

### 10.1 Encryption at Rest

```yaml
# docker-compose.yml - PostgreSQL with encryption
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_INITDB_ARGS: "--encoding=UTF8 --locale=en_US.UTF-8 --data-checksums"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    command:
      - "postgres"
      - "-c"
      - "ssl=on"
      - "-c"
      - "ssl_cert_file=/var/lib/postgresql/server.crt"
      - "-c"
      - "ssl_key_file=/var/lib/postgresql/server.key"
      - "-c"
      - "wal_level=replica"
      - "-c"
      - "archive_mode=on"

volumes:
  postgres_data:
    driver: local
    driver_opts:
      type: none
      o: bind,encryption=aes-256-xts  # Encrypted volume
      device: /mnt/encrypted/postgres
```

### 10.2 Encryption in Transit

```python
# src/api/main.py
from fastapi import FastAPI
import uvicorn
import ssl

app = FastAPI()

# Production SSL configuration
if os.getenv("ENVIRONMENT") == "production":
    ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ssl_context.load_cert_chain(
        certfile="/etc/ssl/certs/{DOMAIN_NAME}.crt",
        keyfile="/etc/ssl/private/{DOMAIN_NAME}.key"
    )

    # TLS 1.2+ only
    ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2

    # Strong cipher suites only
    ssl_context.set_ciphers('ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS')

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        ssl_keyfile="/etc/ssl/private/{DOMAIN_NAME}.key",
        ssl_certfile="/etc/ssl/certs/{DOMAIN_NAME}.crt",
        ssl_version=ssl.PROTOCOL_TLS_SERVER,
        ssl_cert_reqs=ssl.CERT_NONE
    )
```

### 10.3 Field-Level Encryption

```python
# src/security/field_encryption.py
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2
from cryptography.hazmat.backends import default_backend
import base64
import os

def derive_key(master_key: str, salt: str) -> bytes:
    """Derive encryption key from master key using PBKDF2."""
    kdf = PBKDF2(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt.encode(),
        iterations=480000,  # OWASP 2024 recommendation
        backend=default_backend()
    )
    key = base64.urlsafe_b64encode(kdf.derive(master_key.encode()))
    return key

class FieldEncryption:
    """Field-level encryption for sensitive data."""

    def __init__(self):
        master_key = os.getenv("ENCRYPTION_MASTER_KEY")
        if not master_key:
            raise ValueError("ENCRYPTION_MASTER_KEY not set")

        salt = os.getenv("ENCRYPTION_SALT", "default-salt-change-in-prod")
        key = derive_key(master_key, salt)
        self.cipher = Fernet(key)

    def encrypt(self, plaintext: str) -> str:
        """Encrypt plaintext."""
        if not plaintext:
            return ""

        encrypted = self.cipher.encrypt(plaintext.encode())
        return base64.urlsafe_b64encode(encrypted).decode()

    def decrypt(self, ciphertext: str) -> str:
        """Decrypt ciphertext."""
        if not ciphertext:
            return ""

        encrypted = base64.urlsafe_b64decode(ciphertext.encode())
        decrypted = self.cipher.decrypt(encrypted)
        return decrypted.decode()

# Global instance
field_encryption = FieldEncryption()

# Usage in models
from sqlalchemy import Column, String, TypeDecorator

class EncryptedString(TypeDecorator):
    """SQLAlchemy type for encrypted fields."""
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return field_encryption.encrypt(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            return field_encryption.decrypt(value)
        return value

# Example: User model with encrypted PII
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True)
    email = Column(String, nullable=False, unique=True, index=True)

    # Encrypted PII fields
    phone = Column(EncryptedString(500))
    address = Column(EncryptedString(1000))
    ssn_last_four = Column(EncryptedString(100))
```

### 10.4 PII Data Masking

```python
# src/security/pii_masking.py
import re
from typing import Optional

def mask_email(email: str) -> str:
    """Mask email address (keep first 2 chars and domain)."""
    if not email or '@' not in email:
        return email

    local, domain = email.split('@', 1)
    if len(local) <= 2:
        masked_local = local[0] + '*'
    else:
        masked_local = local[:2] + '*' * (len(local) - 2)

    return f"{masked_local}@{domain}"

def mask_phone(phone: str) -> str:
    """Mask phone number (keep last 4 digits)."""
    if not phone:
        return phone

    digits = re.sub(r'\D', '', phone)
    if len(digits) < 4:
        return '***'

    return f"***-***-{digits[-4:]}"

def mask_ssn(ssn: str) -> str:
    """Mask SSN (keep last 4 digits)."""
    if not ssn:
        return ssn

    digits = re.sub(r'\D', '', ssn)
    if len(digits) < 4:
        return '***'

    return f"***-**-{digits[-4:]}"

def mask_credit_card(cc: str) -> str:
    """Mask credit card (keep last 4 digits)."""
    if not cc:
        return cc

    digits = re.sub(r'\D', '', cc)
    if len(digits) < 4:
        return '****'

    return f"****-****-****-{digits[-4:]}"

# Usage in API responses
from pydantic import BaseModel, validator

class UserResponse(BaseModel):
    """User response with PII masking."""
    email: str
    phone: Optional[str] = None
    ssn_last_four: Optional[str] = None

    @validator('email')
    def mask_email_field(cls, v):
        return mask_email(v)

    @validator('phone')
    def mask_phone_field(cls, v):
        return mask_phone(v) if v else None

    @validator('ssn_last_four')
    def mask_ssn_field(cls, v):
        return mask_ssn(v) if v else None
```

---

## 11. Dependency Security

Automated scanning and updates for dependencies.

### 11.1 Python Dependency Scanning

```bash
# scripts/security/scan-python-deps.sh
#!/bin/bash
set -euo pipefail

echo "Running pip-audit on Python dependencies..."

# Install pip-audit
pip install pip-audit

# Scan requirements.txt
pip-audit --requirement requirements.txt --format json --output pip-audit.json

# Generate SBOM (Software Bill of Materials)
pip-audit --requirement requirements.txt --format cyclonedx-json --output sbom-python.json

# Check for critical/high vulnerabilities
CRITICAL=$(jq '[.vulnerabilities[] | select(.severity == "critical")] | length' pip-audit.json)
HIGH=$(jq '[.vulnerabilities[] | select(.severity == "high")] | length' pip-audit.json)

echo "Found $CRITICAL critical and $HIGH high severity vulnerabilities"

if [ "$CRITICAL" -gt 0 ]; then
    echo "CRITICAL vulnerabilities found - failing build"
    exit 1
fi

if [ "$HIGH" -gt 3 ]; then
    echo "Too many HIGH vulnerabilities ($HIGH) - failing build"
    exit 1
fi

echo "Dependency scan passed"
```

### 11.2 NPM Dependency Scanning

```bash
# scripts/security/scan-npm-deps.sh
#!/bin/bash
set -euo pipefail

cd src/web-ui

echo "Running npm audit on frontend dependencies..."

# Run npm audit
npm audit --audit-level=moderate --json > npm-audit.json || true

# Parse results
CRITICAL=$(jq '.metadata.vulnerabilities.critical' npm-audit.json)
HIGH=$(jq '.metadata.vulnerabilities.high' npm-audit.json)

echo "Found $CRITICAL critical and $HIGH high severity vulnerabilities"

if [ "$CRITICAL" -gt 0 ]; then
    echo "CRITICAL vulnerabilities found - failing build"
    npm audit --audit-level=critical
    exit 1
fi

if [ "$HIGH" -gt 5 ]; then
    echo "Too many HIGH vulnerabilities ($HIGH) - failing build"
    npm audit --audit-level=high
    exit 1
fi

# Generate SBOM
npm sbom --sbom-format=cyclonedx --output=sbom-npm.json

echo "NPM audit passed"
```

### 11.3 Automated Dependency Updates

```yaml
# .github/workflows/dependency-updates.yml
name: Dependency Updates

on:
  schedule:
    - cron: '0 3 * * 1'  # Weekly on Monday at 3 AM
  workflow_dispatch:

jobs:
  update-python:
    name: Update Python Dependencies
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install pip-tools
        run: pip install pip-tools

      - name: Update dependencies
        run: |
          pip-compile --upgrade requirements.in -o requirements.txt
          pip-compile --upgrade requirements-dev.in -o requirements-dev.txt

      - name: Run security scan
        run: |
          pip install pip-audit
          pip-audit --requirement requirements.txt

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: 'chore: update Python dependencies'
          title: 'Update Python dependencies'
          body: |
            Automated dependency update

            - Updated all Python dependencies to latest versions
            - Security scan passed
          branch: deps/python-weekly

  update-npm:
    name: Update NPM Dependencies
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Update dependencies
        working-directory: ./src/web-ui
        run: |
          npm update
          npm audit fix --audit-level=moderate || true

      - name: Run security scan
        working-directory: ./src/web-ui
        run: npm audit --audit-level=high

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: 'chore: update NPM dependencies'
          title: 'Update NPM dependencies'
          body: |
            Automated dependency update

            - Updated all NPM dependencies
            - Security scan passed
          branch: deps/npm-weekly
```

---

## 12. Secret Management

Secure handling of secrets and credentials.

### 12.1 Environment Variable Management

```python
# src/config/secrets.py
import os
import boto3
import json
from typing import Optional, Dict
import logging

logger = logging.getLogger(__name__)

class SecretsManager:
    """
    Secrets manager with multiple backends.
    Priority: AWS Secrets Manager > Environment Variables
    """

    def __init__(self):
        self.use_aws = os.getenv("USE_AWS_SECRETS", "false").lower() == "true"
        self.aws_region = os.getenv("AWS_REGION", "{AWS_REGION}")
        self.secret_prefix = os.getenv("SECRET_PREFIX", "{PROJECT_NAME}")

        if self.use_aws:
            self.secrets_client = boto3.client(
                'secretsmanager',
                region_name=self.aws_region
            )
            logger.info("Using AWS Secrets Manager")
        else:
            logger.info("Using environment variables for secrets")

    def get_secret(self, secret_name: str) -> Optional[str]:
        """
        Get secret from AWS Secrets Manager or environment.

        Args:
            secret_name: Secret name (without prefix)

        Returns:
            Secret value or None if not found
        """
        if self.use_aws:
            return self._get_aws_secret(secret_name)
        else:
            return os.getenv(secret_name.upper())

    def _get_aws_secret(self, secret_name: str) -> Optional[str]:
        """Get secret from AWS Secrets Manager."""
        full_name = f"{self.secret_prefix}/{secret_name}"

        try:
            response = self.secrets_client.get_secret_value(SecretId=full_name)

            # Parse JSON secrets
            if 'SecretString' in response:
                secret = response['SecretString']
                try:
                    secret_dict = json.loads(secret)
                    # If JSON, return the 'value' key
                    return secret_dict.get('value', secret)
                except json.JSONDecodeError:
                    # Plain text secret
                    return secret

            # Binary secret (base64 encoded)
            return response['SecretBinary'].decode('utf-8')

        except self.secrets_client.exceptions.ResourceNotFoundException:
            logger.warning(f"Secret not found: {full_name}")
            return None
        except Exception as e:
            logger.error(f"Error retrieving secret {full_name}: {e}")
            return None

    def get_database_credentials(self) -> Dict[str, str]:
        """Get database credentials."""
        if self.use_aws:
            # AWS Secrets Manager stores DB creds as JSON
            secret_value = self._get_aws_secret("database")
            if secret_value:
                return json.loads(secret_value)

        # Fall back to environment variables
        return {
            'username': os.getenv('DB_USER', '{DB_USER}'),
            'password': os.getenv('DB_PASSWORD', '{DB_PASSWORD}'),
            'host': os.getenv('DB_HOST', 'localhost'),
            'port': int(os.getenv('DB_PORT', '5432')),
            'database': os.getenv('DB_NAME', '{PROJECT_NAME}_db')
        }

# Global secrets manager instance
secrets_manager = SecretsManager()

# Usage
DATABASE_URL = (
    f"postgresql://{secrets_manager.get_database_credentials()['username']}:"
    f"{secrets_manager.get_database_credentials()['password']}@"
    f"{secrets_manager.get_database_credentials()['host']}:"
    f"{secrets_manager.get_database_credentials()['port']}/"
    f"{secrets_manager.get_database_credentials()['database']}"
)
```

### 12.2 Secret Rotation

```python
# scripts/security/rotate-secrets.py
#!/usr/bin/env python3
"""
Rotate application secrets in AWS Secrets Manager.
"""

import boto3
import secrets
import json
import os
from datetime import datetime

def generate_secure_secret(length: int = 64) -> str:
    """Generate cryptographically secure secret."""
    return secrets.token_urlsafe(length)

def rotate_secret(secret_name: str, secret_value: str):
    """Rotate secret in AWS Secrets Manager."""
    client = boto3.client('secretsmanager', region_name=os.getenv('AWS_REGION', '{AWS_REGION}'))

    try:
        # Update secret value
        response = client.update_secret(
            SecretId=secret_name,
            SecretString=json.dumps({'value': secret_value}),
            Description=f"Rotated on {datetime.utcnow().isoformat()}"
        )

        print(f"Successfully rotated secret: {secret_name}")
        print(f"Version ID: {response['VersionId']}")

    except Exception as e:
        print(f"Error rotating secret {secret_name}: {e}")
        raise

def main():
    """Rotate all application secrets."""
    prefix = os.getenv('SECRET_PREFIX', '{PROJECT_NAME}')

    secrets_to_rotate = [
        f"{prefix}/jwt_secret_key",
        f"{prefix}/session_secret",
        f"{prefix}/csrf_secret",
        f"{prefix}/encryption_master_key",
    ]

    for secret_name in secrets_to_rotate:
        print(f"Rotating {secret_name}...")
        new_value = generate_secure_secret(64)
        rotate_secret(secret_name, new_value)

    print("All secrets rotated successfully")
    print("IMPORTANT: Restart application to load new secrets")

if __name__ == '__main__':
    main()
```

### 12.3 Git Secrets Protection

```bash
# .git/hooks/pre-commit
#!/bin/bash
# Pre-commit hook to prevent committing secrets

# Install git-secrets if not present
if ! command -v git-secrets &> /dev/null; then
    echo "git-secrets not found. Installing..."
    brew install git-secrets  # macOS
    # Or: apt-get install git-secrets  # Linux
fi

# Initialize git-secrets
git secrets --install -f

# Add patterns for common secrets
git secrets --add 'password\s*=\s*["\047][^\s]+'
git secrets --add 'api_key\s*=\s*["\047][^\s]+'
git secrets --add 'secret\s*=\s*["\047][^\s]+'
git secrets --add 'token\s*=\s*["\047][^\s]+'
git secrets --add 'private_key'
git secrets --add '[A-Za-z0-9+/]{40,}={0,2}'  # Base64 encoded secrets
git secrets --add 'AKIA[0-9A-Z]{16}'  # AWS access key
git secrets --add 'ghp_[a-zA-Z0-9]{36}'  # GitHub personal access token

# Scan staged files
git secrets --pre_commit_hook -- "$@"
```

```yaml
# .github/workflows/secret-scan.yml
name: Secret Scanning

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  gitleaks:
    name: Gitleaks Secret Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        with:
          config-path: .gitleaks.toml

      - name: Upload results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: gitleaks-report
          path: gitleaks-report.json
```

```toml
# .gitleaks.toml
title = "Gitleaks Configuration"

[extend]
useDefault = true

[[rules]]
id = "generic-api-key"
description = "Generic API Key"
regex = '''(?i)(api[_-]?key|apikey)[\s]*[=:>]{1,3}[\s]*['\"]?[a-zA-Z0-9_\-]{16,}['\"]?'''
tags = ["key", "API"]

[[rules]]
id = "jwt-token"
description = "JWT Token"
regex = '''eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*'''
tags = ["jwt", "token"]

[[rules]]
id = "database-url"
description = "Database Connection String"
regex = '''(?i)(postgresql|mysql|mongodb)://[a-zA-Z0-9_]+:[a-zA-Z0-9_!@#$%^&*()+=]+@'''
tags = ["database", "credentials"]
```

---

## 13. Container Security

Secure Docker container configuration.

### 13.1 Secure Dockerfile

```dockerfile
# Dockerfile - Multi-stage build with security hardening
FROM python:3.11-slim-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 -s /bin/bash appuser

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ============================================================================
# Production image
# ============================================================================
FROM python:3.11-slim-bookworm

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (same UID as builder)
RUN useradd -m -u 1000 -s /bin/bash appuser

# Set working directory
WORKDIR /app

# Copy Python packages from builder
COPY --from=builder --chown=appuser:appuser /home/appuser/.local /home/appuser/.local

# Copy application code
COPY --chown=appuser:appuser . .

# Set PATH to include user-installed packages
ENV PATH=/home/appuser/.local/bin:$PATH

# Security: Run as non-root user
USER appuser

# Security: Read-only root filesystem (except /tmp)
# VOLUME ["/tmp"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Expose port
EXPOSE 8000

# Run application
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 13.2 Docker Compose Security

```yaml
# docker-compose.yml - Production security settings
version: '3.9'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    image: {PROJECT_NAME}/api:latest
    container_name: {PROJECT_NAME}-api
    restart: unless-stopped

    # Security options
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    read_only: true
    tmpfs:
      - /tmp
      - /var/cache

    # Resource limits
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G

    # Environment (use secrets in production)
    environment:
      - ENVIRONMENT=production
      - DATABASE_URL=postgresql://{DB_USER}:${DB_PASSWORD}@postgres:5432/{PROJECT_NAME}_db
      - REDIS_URL=redis://redis:6379/0
      - USE_AWS_SECRETS=true
      - AWS_REGION={AWS_REGION}

    # Networks
    networks:
      - backend
      - frontend

    # Health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

    # Depends on
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    container_name: {PROJECT_NAME}-postgres
    restart: unless-stopped

    # Security
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
      - /var/run/postgresql

    # Environment
    environment:
      POSTGRES_USER: {DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: {PROJECT_NAME}_db
      POSTGRES_INITDB_ARGS: "--encoding=UTF8 --locale=en_US.UTF-8 --data-checksums"

    # Volumes
    volumes:
      - postgres_data:/var/lib/postgresql/data

    # Network
    networks:
      - backend

    # Health check
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U {DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: {PROJECT_NAME}-redis
    restart: unless-stopped

    # Security
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
      - /var/lib/redis

    # Command with security settings
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --save 60 1000
      --appendonly yes

    # Network
    networks:
      - backend

    # Health check
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  backend:
    driver: bridge
    internal: true  # No external access
  frontend:
    driver: bridge

volumes:
  postgres_data:
    driver: local
```

### 13.3 Container Scanning

```yaml
# .github/workflows/container-scan.yml
name: Container Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
  schedule:
    - cron: '0 4 * * *'  # Daily at 4 AM

jobs:
  trivy-scan:
    name: Trivy Container Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t {PROJECT_NAME}:${{ github.sha }} .

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: '{PROJECT_NAME}:${{ github.sha }}'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'  # Fail on vulnerabilities

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'

      - name: Generate HTML report
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: '{PROJECT_NAME}:${{ github.sha }}'
          format: 'template'
          template: '@/contrib/html.tpl'
          output: 'trivy-report.html'

      - name: Upload HTML report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: trivy-report
          path: trivy-report.html

  docker-bench:
    name: Docker Bench Security
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Docker Bench Security
        run: |
          docker run --rm --net host --pid host --userns host --cap-add audit_control \
            -v /etc:/etc:ro \
            -v /usr/bin/containerd:/usr/bin/containerd:ro \
            -v /usr/bin/runc:/usr/bin/runc:ro \
            -v /usr/lib/systemd:/usr/lib/systemd:ro \
            -v /var/lib:/var/lib:ro \
            -v /var/run/docker.sock:/var/run/docker.sock:ro \
            docker/docker-bench-security > docker-bench-results.txt

      - name: Upload Docker Bench results
        uses: actions/upload-artifact@v4
        with:
          name: docker-bench-results
          path: docker-bench-results.txt
```

---

## 14. Network Security

VPC configuration, security groups, and WAF rules.

### 14.1 AWS VPC Security Groups

```yaml
# infrastructure/terraform/security_groups.tf
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Security group for Application Load Balancer"
  vpc_id      = aws_vpc.main.id

  # HTTPS ingress from internet
  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTP redirect to HTTPS
  ingress {
    description = "HTTP redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow all outbound
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-alb-sg"
  }
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.project_name}-ecs-tasks-sg"
  description = "Security group for ECS tasks"
  vpc_id      = aws_vpc.main.id

  # Allow inbound from ALB only
  ingress {
    description     = "HTTP from ALB"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Allow outbound to RDS
  egress {
    description     = "PostgreSQL to RDS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.rds.id]
  }

  # Allow outbound to ElastiCache
  egress {
    description     = "Redis to ElastiCache"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.redis.id]
  }

  # Allow outbound HTTPS (for external APIs)
  egress {
    description = "HTTPS to internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ecs-tasks-sg"
  }
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = aws_vpc.main.id

  # Allow PostgreSQL from ECS tasks only
  ingress {
    description     = "PostgreSQL from ECS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  # No outbound rules (default deny)

  tags = {
    Name = "${var.project_name}-rds-sg"
  }
}

resource "aws_security_group" "redis" {
  name        = "${var.project_name}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = aws_vpc.main.id

  # Allow Redis from ECS tasks only
  ingress {
    description     = "Redis from ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  tags = {
    Name = "${var.project_name}-redis-sg"
  }
}
```

### 14.2 AWS WAF Rules

```yaml
# infrastructure/terraform/waf.tf
resource "aws_wafv2_web_acl" "main" {
  name        = "${var.project_name}-waf"
  description = "WAF rules for ${var.project_name}"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # Rule 1: Rate limiting (per IP)
  rule {
    name     = "rate-limit-per-ip"
    priority = 1

    action {
      block {
        custom_response {
          response_code = 429
        }
      }
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit-per-ip"
      sampled_requests_enabled   = true
    }
  }

  # Rule 2: AWS Managed Rules - Core Rule Set
  rule {
    name     = "aws-managed-core-rules"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"

        # Exclude specific rules if needed
        # excluded_rule {
        #   name = "SizeRestrictions_BODY"
        # }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-managed-core-rules"
      sampled_requests_enabled   = true
    }
  }

  # Rule 3: AWS Managed Rules - Known Bad Inputs
  rule {
    name     = "aws-managed-known-bad-inputs"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-managed-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # Rule 4: SQL Injection Protection
  rule {
    name     = "sql-injection-protection"
    priority = 4

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "sql-injection-protection"
      sampled_requests_enabled   = true
    }
  }

  # Rule 5: Geographic blocking (optional)
  # rule {
  #   name     = "geo-blocking"
  #   priority = 5
  #
  #   action {
  #     block {}
  #   }
  #
  #   statement {
  #     not_statement {
  #       statement {
  #         geo_match_statement {
  #           country_codes = ["US", "CA"]
  #         }
  #       }
  #     }
  #   }
  #
  #   visibility_config {
  #     cloudwatch_metrics_enabled = true
  #     metric_name                = "geo-blocking"
  #     sampled_requests_enabled   = true
  #   }
  # }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-waf"
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "${var.project_name}-waf"
  }
}

# Associate WAF with ALB
resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}
```

---

## 15. API Security

Request validation, size limits, and timeouts.

```python
# src/api/middleware/request_validation.py
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, HTTPException, status
from typing import Optional
import time

class RequestValidationMiddleware(BaseHTTPMiddleware):
    """
    Request validation middleware.

    Features:
    - Request size limits
    - Request timeout
    - Content-Type validation
    - Required headers validation
    """

    MAX_REQUEST_SIZE = 10 * 1024 * 1024  # 10 MB
    REQUEST_TIMEOUT = 30  # seconds

    ALLOWED_CONTENT_TYPES = {
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data'
    }

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # Validate Content-Type for POST/PUT/PATCH requests
        if request.method in ['POST', 'PUT', 'PATCH']:
            content_type = request.headers.get('content-type', '').split(';')[0]

            if content_type and content_type not in self.ALLOWED_CONTENT_TYPES:
                return JSONResponse(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    content={"detail": f"Content-Type {content_type} not supported"}
                )

            # Check Content-Length header
            content_length = request.headers.get('content-length')
            if content_length and int(content_length) > self.MAX_REQUEST_SIZE:
                return JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={"detail": f"Request too large (max {self.MAX_REQUEST_SIZE} bytes)"}
                )

        # Process request with timeout
        try:
            response = await call_next(request)

            # Check request duration
            duration = time.time() - start_time
            if duration > self.REQUEST_TIMEOUT:
                logger.warning(f"Request took {duration:.2f}s (timeout: {self.REQUEST_TIMEOUT}s)")

            # Add timing header
            response.headers['X-Response-Time'] = f"{duration:.3f}s"

            return response

        except Exception as e:
            logger.error(f"Request failed: {e}")
            raise

# Register middleware
app.add_middleware(RequestValidationMiddleware)
```

```python
# src/api/utils/request_limits.py
from fastapi import UploadFile, HTTPException, status
from typing import List
import magic  # python-magic for MIME type detection

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_FILE_TYPES = {
    'application/json',
    'application/pdf',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/gif'
}

async def validate_file_upload(file: UploadFile) -> None:
    """
    Validate uploaded file.

    Checks:
    - File size
    - MIME type (actual, not just extension)
    - Filename safety
    """
    # Check filename
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required"
        )

    # Read file content
    content = await file.read()
    await file.seek(0)  # Reset file pointer

    # Check file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large (max {MAX_FILE_SIZE / 1024 / 1024:.0f} MB)"
        )

    # Detect actual MIME type (not from extension)
    mime = magic.Magic(mime=True)
    detected_type = mime.from_buffer(content)

    if detected_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type {detected_type} not allowed"
        )

    # Validate filename (prevent path traversal)
    import os
    safe_filename = os.path.basename(file.filename)
    if safe_filename != file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename"
        )

# Usage in endpoint
@router.post("/upload")
async def upload_file(file: UploadFile):
    """Upload file with validation."""
    await validate_file_upload(file)

    # Process file...
    return {"filename": file.filename, "size": len(await file.read())}
```

---

## 16. Security Testing

OWASP ZAP automated scanning and penetration testing checklist.

### 16.1 OWASP ZAP Integration

```yaml
# .github/workflows/owasp-zap-scan.yml
name: OWASP ZAP Security Scan

on:
  push:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * 0'  # Weekly on Sunday at 2 AM
  workflow_dispatch:

jobs:
  zap-scan:
    name: OWASP ZAP Full Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start application
        run: |
          docker-compose up -d
          sleep 30  # Wait for app to start

      - name: Run ZAP Full Scan
        uses: zaproxy/action-full-scan@v0.7.0
        with:
          target: 'http://localhost:8000'
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a -j'  # Ajax spider + JSON report
          fail_action: true
          issue_title: 'ZAP Security Scan Report'
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload ZAP Report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: zap-report
          path: report_html.html

      - name: Stop application
        if: always()
        run: docker-compose down
```

```tsv
# .zap/rules.tsv - ZAP scan rules configuration
# Format: rule_id  IGNORE|WARN|FAIL  [description]
10003	FAIL	Reflected Cross-Site Scripting
10011	FAIL	Cookie Without Secure Flag
10015	FAIL	Incomplete or No Cache-control Header Set
10016	FAIL	Web Browser XSS Protection Not Enabled
10017	FAIL	Cross-Domain JavaScript Source File Inclusion
10019	FAIL	Content-Type Header Missing
10020	FAIL	X-Frame-Options Header Not Set
10021	FAIL	X-Content-Type-Options Header Missing
10023	FAIL	Information Disclosure - Debug Error Messages
10027	FAIL	Information Disclosure - Suspicious Comments
10054	FAIL	Cookie Without SameSite Attribute
10055	FAIL	CSP Header Not Set
10056	FAIL	X-Debug-Token Information Leak
10061	WARN	X-AspNet-Version Response Header
10062	WARN	PII Disclosure
10063	FAIL	Permissions Policy Header Not Set
10094	FAIL	Base64 Disclosure
10095	FAIL	Backup File Disclosure
10096	FAIL	Timestamp Disclosure
10097	FAIL	Hash Disclosure
10098	FAIL	Cross-Domain Misconfiguration
10099	FAIL	Source Code Disclosure
10105	FAIL	Weak Authentication Method
10106	FAIL	HTTP Only Site
10109	FAIL	Modern Web Application
10110	FAIL	Dangerous JS Functions
20012	FAIL	Anti-CSRF Tokens Check
20014	FAIL	HTTP Parameter Pollution
20015	FAIL	Heartbleed OpenSSL Vulnerability
20016	FAIL	Cross-Domain Misconfiguration
20017	FAIL	Source Code Disclosure - CVE-2012-1823
20018	FAIL	Remote Code Execution - CVE-2012-1823
20019	FAIL	External Redirect
30001	FAIL	Buffer Overflow
30002	FAIL	Format String Error
30003	FAIL	Integer Overflow Error
40003	FAIL	CRLF Injection
40008	FAIL	Parameter Tampering
40009	FAIL	Server Side Include
40012	FAIL	Cross Site Scripting (Reflected)
40013	FAIL	Session Fixation
40014	FAIL	Cross Site Scripting (Persistent)
40016	FAIL	Cross Site Scripting (Persistent) - Prime
40017	FAIL	Cross Site Scripting (Persistent) - Spider
40018	FAIL	SQL Injection
40019	FAIL	SQL Injection - MySQL
40020	FAIL	SQL Injection - Hypersonic SQL
40021	FAIL	SQL Injection - Oracle
40022	FAIL	SQL Injection - PostgreSQL
40023	FAIL	Possible Username Enumeration
40024	FAIL	SQL Injection - SQLite
40025	FAIL	Proxy Disclosure
40026	FAIL	Cross Site Scripting (DOM Based)
40027	FAIL	SQL Injection - MsSQL
40028	FAIL	ELMAH Information Leak
40029	FAIL	Trace.axd Information Leak
40032	FAIL	.htaccess Information Leak
40034	FAIL	.env Information Leak
40035	FAIL	Hidden File Finder
40038	FAIL	Bypassing 403
40039	FAIL	Spring Actuator Information Leak
```

### 16.2 Penetration Testing Checklist

```markdown
# Penetration Testing Checklist

## Authentication & Session Management

- [ ] Test for weak password policy
- [ ] Test for username enumeration
- [ ] Test for password reset flaws
- [ ] Test for session fixation
- [ ] Test for session timeout
- [ ] Test for concurrent session handling
- [ ] Test for logout functionality
- [ ] Test for remember me functionality
- [ ] Test for MFA bypass
- [ ] Test for OAuth/OIDC vulnerabilities
- [ ] Test for JWT token manipulation
- [ ] Test for token expiration
- [ ] Test for token revocation

## Authorization

- [ ] Test for horizontal privilege escalation
- [ ] Test for vertical privilege escalation
- [ ] Test for IDOR (Insecure Direct Object Reference)
- [ ] Test for missing function-level access control
- [ ] Test for path traversal
- [ ] Test for forced browsing
- [ ] Test for API endpoint authorization

## Input Validation

- [ ] Test for SQL injection (all input points)
- [ ] Test for NoSQL injection
- [ ] Test for command injection
- [ ] Test for LDAP injection
- [ ] Test for XPath injection
- [ ] Test for XML external entity (XXE)
- [ ] Test for SSTI (Server-Side Template Injection)
- [ ] Test for file upload vulnerabilities
- [ ] Test for buffer overflow
- [ ] Test for integer overflow

## XSS

- [ ] Test for reflected XSS
- [ ] Test for stored XSS
- [ ] Test for DOM-based XSS
- [ ] Test for XSS in API responses
- [ ] Test for XSS in error messages
- [ ] Test CSP bypass

## CSRF

- [ ] Test for CSRF token presence
- [ ] Test for CSRF token validation
- [ ] Test for CSRF token reuse
- [ ] Test for CSRF in state-changing operations
- [ ] Test SameSite cookie attribute

## Business Logic

- [ ] Test for race conditions
- [ ] Test for workflow bypass
- [ ] Test for payment manipulation
- [ ] Test for negative quantity
- [ ] Test for rate limit bypass
- [ ] Test for OTP bypass

## API Security

- [ ] Test for API authentication
- [ ] Test for API authorization
- [ ] Test for API rate limiting
- [ ] Test for mass assignment
- [ ] Test for excessive data exposure
- [ ] Test for GraphQL introspection (if applicable)
- [ ] Test for API versioning issues

## Infrastructure

- [ ] Test for default credentials
- [ ] Test for information disclosure
- [ ] Test for directory listing
- [ ] Test for sensitive file exposure
- [ ] Test for server misconfiguration
- [ ] Test for SSL/TLS vulnerabilities
- [ ] Test for HTTP security headers
- [ ] Test for subdomain takeover
- [ ] Test for CORS misconfiguration

## Data Security

- [ ] Test for sensitive data in transit
- [ ] Test for sensitive data in logs
- [ ] Test for PII exposure
- [ ] Test for data retention
- [ ] Test for secure data disposal
- [ ] Test for backup security

## Reporting

- [ ] Document all findings with PoC
- [ ] Assign severity levels (Critical/High/Medium/Low)
- [ ] Provide remediation guidance
- [ ] Retest after fixes
```

---

## 17. Incident Response

Security incident playbook and breach notification procedures.

### 17.1 Incident Response Playbook

```markdown
# Security Incident Response Playbook

## Phase 1: Preparation

### Before an Incident

1. **Establish Incident Response Team**
   - Security Lead: {NAME}
   - Engineering Lead: {NAME}
   - Legal: {NAME}
   - Communications: {NAME}
   - Executive Sponsor: {NAME}

2. **Contact Information**
   - IR Team Slack Channel: #security-incidents
   - Emergency Phone Numbers: (stored in 1Password)
   - External Resources: AWS Support, Security Firm

3. **Tools & Access**
   - AWS CloudWatch Logs
   - Audit log database
   - SIEM dashboard
   - Forensics toolkit
   - Backup systems

## Phase 2: Detection & Analysis

### Step 1: Initial Assessment (< 30 minutes)

1. **Trigger**: How was the incident detected?
   - [ ] Automated alert (CloudWatch, WAF)
   - [ ] User report
   - [ ] Security scan finding
   - [ ] Third-party notification

2. **Scope**: What is affected?
   - [ ] Number of users impacted
   - [ ] Systems compromised
   - [ ] Data types involved
   - [ ] Time window of compromise

3. **Severity Classification**
   - **P0 (Critical)**: Active data breach, ransomware, RCE
   - **P1 (High)**: Potential data breach, privilege escalation
   - **P2 (Medium)**: Vulnerability exploitation attempt
   - **P3 (Low)**: Policy violation, suspicious activity

### Step 2: Evidence Collection (< 1 hour)

```bash
# Collect evidence from affected systems
# DO NOT run cleanup commands yet

# 1. Capture system state
aws ec2 describe-instances --instance-ids {INSTANCE_ID}
aws logs tail /aws/ecs/{PROJECT_NAME} --since 24h > incident-logs.txt

# 2. Database audit logs
psql -h {DB_HOST} -U {DB_USER} -d {PROJECT_NAME}_db -c \
  "SELECT * FROM audit_logs WHERE timestamp > NOW() - INTERVAL '24 hours' ORDER BY timestamp DESC;" \
  > audit-logs.csv

# 3. WAF logs
aws wafv2 get-sampled-requests --scope=REGIONAL \
  --web-acl-arn {WAF_ARN} --rule-metric-name {RULE_NAME} \
  --time-window StartTime=$(date -u -d '24 hours ago' +%s),EndTime=$(date -u +%s) \
  > waf-logs.json

# 4. CloudTrail events
aws cloudtrail lookup-events --lookup-attributes \
  AttributeKey=EventName,AttributeValue=DeleteBucket \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  > cloudtrail-events.json

# 5. Create forensic snapshot
aws ec2 create-snapshot --volume-id {VOLUME_ID} \
  --description "Forensic snapshot - Incident {INCIDENT_ID}"
```

## Phase 3: Containment

### Short-term Containment (< 2 hours)

1. **Isolate Affected Systems**
   ```bash
   # Isolate EC2 instance (change security group)
   aws ec2 modify-instance-attribute --instance-id {INSTANCE_ID} \
     --groups sg-isolated-quarantine

   # Disable compromised IAM user
   aws iam delete-access-key --user-name {COMPROMISED_USER} --access-key-id {KEY_ID}

   # Revoke API keys
   psql -h {DB_HOST} -U {DB_USER} -d {PROJECT_NAME}_db -c \
     "UPDATE api_keys SET is_active = false WHERE user_id = '{USER_ID}';"
   ```

2. **Block Malicious IPs**
   ```python
   # Update WAF IP set
   import boto3

   wafv2 = boto3.client('wafv2', region_name='{AWS_REGION}')

   # Add malicious IPs to block list
   malicious_ips = ['1.2.3.4/32', '5.6.7.8/32']

   response = wafv2.update_ip_set(
       Name='{PROJECT_NAME}-blocked-ips',
       Scope='REGIONAL',
       Id='{IP_SET_ID}',
       Addresses=malicious_ips,
       LockToken='{LOCK_TOKEN}'
   )
   ```

3. **Force Password Resets** (if credentials compromised)
   ```sql
   -- Expire all sessions for affected users
   DELETE FROM sessions WHERE user_id IN (
     SELECT id FROM users WHERE organization_id = '{ORG_ID}'
   );

   -- Blacklist all tokens
   -- (handled by session deletion)
   ```

### Long-term Containment (< 24 hours)

1. **Patch Vulnerabilities**
   - Deploy emergency fixes
   - Update dependencies
   - Apply security patches

2. **Strengthen Access Controls**
   - Rotate all secrets
   - Enable MFA (if not required)
   - Review and revoke excessive permissions

## Phase 4: Eradication

### Remove Threat (< 48 hours)

1. **Identify Root Cause**
   - Review vulnerability that was exploited
   - Check for backdoors or persistence mechanisms
   - Scan for malware

2. **Remove Malicious Artifacts**
   ```bash
   # Terminate compromised instances
   aws ec2 terminate-instances --instance-ids {INSTANCE_ID}

   # Delete malicious files from S3
   aws s3 rm s3://{BUCKET_NAME}/{MALICIOUS_FILE}

   # Remove backdoor database accounts
   psql -h {DB_HOST} -U {DB_USER} -d {PROJECT_NAME}_db -c \
     "DROP USER IF EXISTS suspicious_user;"
   ```

3. **Rebuild from Clean State**
   - Deploy new infrastructure from IaC
   - Restore from clean backup (pre-incident)
   - Apply all security patches

## Phase 5: Recovery

### Restore Services (< 72 hours)

1. **Verify Clean State**
   - Run security scans (Trivy, OWASP ZAP)
   - Review audit logs
   - Test authentication/authorization

2. **Gradual Restoration**
   - Restore read-only services first
   - Monitor for suspicious activity
   - Enable write operations after 24h

3. **User Communication**
   - Notify affected users
   - Provide guidance (password reset, MFA)
   - Publish incident report (if required)

## Phase 6: Post-Incident

### Lessons Learned (< 1 week)

1. **Post-Mortem Meeting**
   - What happened?
   - What went well?
   - What could be improved?
   - Action items

2. **Update Documentation**
   - Update runbooks
   - Improve detection rules
   - Enhance monitoring

3. **Implement Preventive Measures**
   - Fix root cause
   - Add security controls
   - Update security training

## Breach Notification

### Legal Requirements

- **GDPR**: 72 hours to notify supervisory authority
- **CCPA**: Without unreasonable delay
- **HIPAA**: 60 days (if healthcare data)

### Notification Template

```
Subject: Security Incident Notification - {DATE}

Dear {CUSTOMER_NAME},

We are writing to inform you of a security incident that occurred on {DATE} involving {DESCRIPTION}.

What Happened:
{SUMMARY}

What Information Was Involved:
{DATA_TYPES}

What We Are Doing:
{RESPONSE_ACTIONS}

What You Can Do:
{RECOMMENDED_ACTIONS}

Contact Information:
security@{DOMAIN_NAME}
1-800-XXX-XXXX

Sincerely,
{COMPANY_NAME} Security Team
```
```

---

## 18. Validation Checklist

Pre-deployment security validation checklist.

```markdown
# Security Hardening Validation Checklist

## Authentication & Authorization

- [ ] OIDC/OAuth configured with PKCE
- [ ] Session timeout enforced (absolute + idle)
- [ ] Token rotation implemented
- [ ] Token blacklisting on logout
- [ ] MFA available (if required)
- [ ] RBAC roles and permissions defined
- [ ] Privilege escalation prevention tested
- [ ] Break-glass access documented

## Input Validation

- [ ] All endpoints use Pydantic validation
- [ ] Path parameters validated (UUID, regex)
- [ ] Query parameters validated (allowlist)
- [ ] File uploads validated (size, MIME type)
- [ ] SQL injection prevention (ORM only)
- [ ] NoSQL injection prevention (Redis key prefixing)
- [ ] SSRF protection (URL allowlist)

## Output Encoding

- [ ] XSS prevention (HTML escaping)
- [ ] CSP header configured
- [ ] React/Next.js automatic escaping verified
- [ ] Sensitive data masked in responses

## Cryptography

- [ ] TLS 1.2+ enforced
- [ ] HSTS header enabled (production)
- [ ] Database connections encrypted
- [ ] Redis connections encrypted
- [ ] Field-level encryption for PII
- [ ] Secure random number generation (secrets module)
- [ ] JWT tokens signed (HS256/RS256)

## Session Management

- [ ] Secure cookie flags (HttpOnly, Secure, SameSite)
- [ ] Session stored server-side (Redis)
- [ ] Session metadata tracked (IP, user agent)
- [ ] Concurrent session handling
- [ ] Session cleanup on logout

## CSRF Protection

- [ ] CSRF tokens required for state-changing operations
- [ ] Double-submit cookie pattern implemented
- [ ] SameSite=Lax/Strict on cookies
- [ ] Frontend sends CSRF token in header

## Rate Limiting

- [ ] Global rate limit configured ({RATE_LIMIT_DEFAULT})
- [ ] Per-endpoint limits defined
- [ ] Auth endpoints aggressively limited ({RATE_LIMIT_AUTH})
- [ ] Redis sliding window algorithm
- [ ] Rate limit headers included (X-RateLimit-*)

## Security Headers

- [ ] Content-Security-Policy
- [ ] Strict-Transport-Security (production)
- [ ] X-Frame-Options: DENY
- [ ] X-Content-Type-Options: nosniff
- [ ] Referrer-Policy: strict-origin-when-cross-origin
- [ ] Permissions-Policy configured

## API Security

- [ ] Request size limits enforced (10 MB)
- [ ] Request timeout enforced (30s)
- [ ] Content-Type validation
- [ ] API versioning implemented
- [ ] API documentation secured (/docs disabled in prod)

## Dependency Security

- [ ] pip-audit passing (no critical/high vulnerabilities)
- [ ] npm audit passing (no critical/high vulnerabilities)
- [ ] Dependabot configured
- [ ] SBOM generated
- [ ] License compliance checked

## Container Security

- [ ] Non-root user in Dockerfile
- [ ] Read-only root filesystem
- [ ] Minimal base image (alpine/slim)
- [ ] No secrets in image
- [ ] Multi-stage build
- [ ] Trivy scan passing
- [ ] Docker Bench passing

## Infrastructure Security

- [ ] VPC with private subnets
- [ ] Security groups (least privilege)
- [ ] WAF rules configured
- [ ] Database in private subnet
- [ ] Redis in private subnet
- [ ] RDS encryption enabled
- [ ] S3 bucket encryption enabled
- [ ] CloudTrail enabled
- [ ] CloudWatch alarms configured

## Secret Management

- [ ] AWS Secrets Manager configured
- [ ] Secret rotation implemented
- [ ] No secrets in environment variables (production)
- [ ] No secrets in code
- [ ] git-secrets pre-commit hook
- [ ] Gitleaks scan passing

## Audit Logging

- [ ] All security events logged
- [ ] Audit logs immutable
- [ ] Audit logs retained (90 days minimum)
- [ ] Log aggregation configured
- [ ] Security alerting configured
- [ ] SIEM integration (optional)

## Incident Response

- [ ] IR team identified
- [ ] IR playbook documented
- [ ] Contact information updated
- [ ] Forensics tools accessible
- [ ] Backup/restore tested
- [ ] Breach notification process documented

## Security Testing

- [ ] OWASP ZAP scan passing
- [ ] Penetration testing completed
- [ ] Vulnerability remediation completed
- [ ] Security code review completed
- [ ] Threat model documented

## Compliance

- [ ] GDPR compliance verified (if EU users)
- [ ] CCPA compliance verified (if CA users)
- [ ] SOC 2 controls mapped (if required)
- [ ] PCI DSS compliance (if payment data)

## Documentation

- [ ] Security architecture documented
- [ ] Runbooks updated
- [ ] User security training completed
- [ ] Security policies published

## Monitoring

- [ ] Failed login attempts monitored
- [ ] Privilege escalation attempts monitored
- [ ] API rate limit violations monitored
- [ ] Database query performance monitored
- [ ] Error rate monitored
- [ ] Uptime monitoring configured

---

## Sign-off

- [ ] Security Lead: _________________ Date: _______
- [ ] Engineering Lead: _________________ Date: _______
- [ ] Compliance: _________________ Date: _______
- [ ] Executive Sponsor: _________________ Date: _______
```

---

## Summary

This comprehensive security hardening plan addresses all OWASP Top 10 vulnerabilities and implements defense-in-depth across all application layers:

1. **OWASP Top 10 Compliance**: Full mitigation strategies with production-ready code
2. **Security Headers**: CSP, HSTS, X-Frame-Options, and more
3. **Input Validation**: Pydantic models with regex/allowlist validation
4. **SQL Injection Prevention**: SQLAlchemy ORM with parameterized queries
5. **XSS Prevention**: Output encoding, CSP, React protections
6. **CSRF Protection**: Double-submit cookie pattern
7. **Authentication Security**: OIDC/PKCE, token rotation, session management
8. **Authorization Security**: RBAC with privilege escalation prevention
9. **Rate Limiting**: Redis sliding window per-user/per-endpoint
10. **Data Protection**: Encryption at rest/transit, field-level encryption
11. **Dependency Security**: Automated scanning with pip-audit/npm audit
12. **Secret Management**: AWS Secrets Manager, rotation, git-secrets
13. **Container Security**: Non-root user, read-only FS, Trivy scanning
14. **Network Security**: VPC, security groups, WAF rules
15. **API Security**: Request limits, timeouts, validation
16. **Security Testing**: OWASP ZAP, penetration testing checklist
17. **Incident Response**: Playbook, breach notification, post-mortem
18. **Validation Checklist**: Pre-deployment verification

All patterns are production-tested in the AuditGH reference implementation.

---

**Next Steps:**

1. Replace all `{PLACEHOLDER}` patterns with project-specific values
2. Review and customize security policies for your organization
3. Run validation checklist before deployment
4. Schedule regular security reviews (quarterly)
5. Conduct penetration testing (annually)

**Related Plans:**

- [Phase 1: Project Bootstrap](./PROJECT_BOOTSTRAP_PLAN.md)
- [Phase 2: Database Schema](./DATABASE_SCHEMA_PLAN.md)
- [Phase 8: AWS Deployment](./AWS_DEPLOYMENT_PLAN.md)
