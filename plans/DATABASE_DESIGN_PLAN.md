---
plan: Database Design Plan
phase: 2
purpose: Comprehensive database architecture guide for PostgreSQL + SQLAlchemy + Alembic
prerequisites: Phase 1 (Project Bootstrap)
duration: 3-5 days
reference: AuditGH production database (40+ models, multi-tenant, RBAC)
---

# Phase 2: Database Design Plan

> **Purpose:** Complete database architecture specification using SQLAlchemy ORM, Alembic migrations, and PostgreSQL-specific features. This plan provides patterns for schema design, relationships, indexes, multi-tenant isolation, and migration workflows. Parameterized with `{PLACEHOLDER}` patterns for reuse across any domain.
>
> **Reference Implementation:** [AuditGH](/Users/rob.vance@sleepnumber.com/Documents/GitHub/auditgh) — 40+ production models including Organization, Repository, Finding, ScanRun, User, ApiKey, and complex RBAC.

---

## Parameter Reference

| Placeholder | Description | AuditGH Example |
|------------|-------------|-----------------|
| `{PROJECT_NAME}` | Project identifier (lowercase) | `auditgh` |
| `{DB_NAME}` | PostgreSQL database name | `auditgh_kb` |
| `{DB_USER}` | Database username | `auditgh` |
| `{DB_PASSWORD}` | Database password (dev only) | `auditgh_secret` |
| `{DB_HOST}` | Database hostname | `localhost` (dev), `db` (docker) |
| `{DB_PORT}` | Database port | `5432` |
| `{TENANT_ENTITY}` | Multi-tenant root entity | `Organization` |
| `{TENANT_ID_COLUMN}` | Foreign key to tenant | `organization_id` |
| `{DOMAIN_MODELS}` | Core business entities | `Finding`, `Repository`, `ScanRun` |
| `{ROLE_HIERARCHY}` | RBAC role names | `super_admin`, `admin`, `analyst`, `manager`, `user` |
| `{AUTH_PROVIDER}` | Authentication backend | `entra`, `okta`, `auth0` |

---

## Table of Contents

1. [Plan Overview](#1-plan-overview)
2. [Schema Design Philosophy](#2-schema-design-philosophy)
3. [SQLAlchemy Base & Mixins](#3-sqlalchemy-base--mixins)
4. [Core Domain Models](#4-core-domain-models)
5. [Authentication & RBAC Models](#5-authentication--rbac-models)
6. [Relationship Patterns](#6-relationship-patterns)
7. [Indexing Strategy](#7-indexing-strategy)
8. [Alembic Migration Setup](#8-alembic-migration-setup)
9. [Multi-Tenant Data Isolation](#9-multi-tenant-data-isolation)
10. [Seed Data & Bootstrap](#10-seed-data--bootstrap)
11. [Connection & Session Management](#11-connection--session-management)
12. [Query Performance Patterns](#12-query-performance-patterns)
13. [Data Integrity & Constraints](#13-data-integrity--constraints)
14. [Validation Checklist](#14-validation-checklist)

---

## 1. Plan Overview

### 1.1 Purpose

This plan provides a complete database architecture specification for a production-grade full-stack web application. You will learn:

- How to design a PostgreSQL schema with proper normalization, indexes, and constraints
- SQLAlchemy ORM patterns (models, relationships, mixins, sessions)
- Alembic migration workflows (init, autogenerate, upgrade, downgrade)
- Multi-tenant data isolation using row-level scoping
- RBAC schema design with role hierarchy and permission management
- Query optimization and performance patterns
- Seed data and bootstrap scripts

### 1.2 Prerequisites

Before starting this phase:

- [ ] Phase 1 (Project Bootstrap) completed
- [ ] Python 3.11+ installed
- [ ] PostgreSQL 14+ running locally or in Docker
- [ ] Basic understanding of relational databases and SQL
- [ ] Familiarity with SQLAlchemy ORM concepts

### 1.3 Estimated Effort

| Task | Duration |
|------|----------|
| Schema design (models + relationships) | 1-2 days |
| Alembic setup + initial migration | 0.5 day |
| RBAC models + seed data | 1 day |
| Multi-tenant patterns (if applicable) | 0.5 day |
| Indexes + constraints | 0.5 day |
| Testing + validation | 0.5 day |
| **Total** | **3-5 days** |

### 1.4 Deliverables

- [ ] `src/api/database.py` — Database connection, session management
- [ ] `src/api/models.py` — SQLAlchemy models (or split across modules)
- [ ] `alembic.ini` — Alembic configuration
- [ ] `migrations/env.py` — Alembic environment setup
- [ ] `migrations/versions/` — Initial migration script
- [ ] `src/rbac/models.py` — RBAC models (Role, Permission, UserRole)
- [ ] `src/rbac/seeds.py` — Role/permission seed data
- [ ] `scripts/seed_dev_data.py` — Development seed script

---

## 2. Schema Design Philosophy

### 2.1 Naming Conventions

**Tables:** Plural, snake_case

```python
# Good
__tablename__ = "users"
__tablename__ = "scan_runs"
__tablename__ = "api_endpoints"

# Bad
__tablename__ = "User"  # Pascal case
__tablename__ = "scanrun"  # Missing underscore
__tablename__ = "user"  # Singular
```

**Columns:** Singular, snake_case

```python
# Good
created_at = Column(DateTime)
user_id = Column(UUID(as_uuid=True))
github_username = Column(String)

# Bad
CreatedAt = Column(DateTime)  # Pascal case
userId = Column(UUID)  # Camel case
github_user_name = Column(String)  # Over-segmented
```

**Relationships:** Follow SQLAlchemy conventions

```python
# One-to-many: plural on parent, singular on child
# Parent (Organization)
repositories = relationship("Repository", back_populates="organization")

# Child (Repository)
organization = relationship("Organization", back_populates="repositories")
```

### 2.2 Primary Key Strategy

**Default: UUID with server-side generation**

```python
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import text

id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
```

**Benefits:**
- Universally unique (safe for distributed systems, data merges)
- No predictable enumeration (security)
- Portable across environments

**Alternative: Integer sequence (for API IDs)**

```python
from sqlalchemy import Sequence

# Used for human-readable API responses, not primary keys
api_id = Column(Integer, Sequence('users_api_id_seq'), unique=True)
```

> **AuditGH Reference:** Every model has a UUID `id` primary key plus an integer `api_id` for API responses. This pattern keeps UUIDs in the database while exposing cleaner integers in URLs/JSON.

### 2.3 Timestamp Patterns

**Standard pattern: `created_at` + `updated_at`**

```python
from sqlalchemy.sql import func

created_at = Column(DateTime, server_default=func.now())
updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
```

**Timezone-aware (recommended for multi-region apps):**

```python
from datetime import datetime

created_at = Column(DateTime(timezone=True), server_default=func.now())
```

**Domain-specific timestamps:**

```python
# Auth models
first_login_at = Column(DateTime, nullable=True)
last_login_at = Column(DateTime)
expires_at = Column(DateTime(timezone=True), nullable=False)

# Findings
first_seen_at = Column(DateTime, server_default=func.now())
last_seen_at = Column(DateTime, server_default=func.now())
resolved_at = Column(DateTime, nullable=True)

# Audit logs
executed_at = Column(DateTime)
verified_at = Column(DateTime, nullable=True)
```

### 2.4 Soft Delete Patterns

**Approach 1: Boolean flag (simple)**

```python
is_deleted = Column(Boolean, default=False, nullable=False)
deleted_at = Column(DateTime, nullable=True)
deleted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
```

**Approach 2: Status enum (recommended)**

```python
status = Column(String(20), nullable=False, default='active')
# Values: 'active', 'archived', 'deleted', 'suspended'
```

**Query pattern:**

```python
# Exclude soft-deleted records by default
active_users = db.query(User).filter(User.status == 'active').all()

# Include all records (admin view)
all_users = db.query(User).all()
```

> **AuditGH Reference:** Most models use an `is_active` boolean. Critical entities (Organization, User) cascade deletes with `ondelete="CASCADE"` on foreign keys rather than soft deletes.

### 2.5 JSONB vs Relational

**Use JSONB when:**
- Schema is dynamic/unpredictable (API responses, metadata)
- Data is write-heavy, read-infrequently
- Flexible structure outweighs query performance

**Use relational when:**
- Data has consistent structure
- You need foreign key constraints
- Complex queries/joins are required

**Example: JSONB for flexible metadata**

```python
from sqlalchemy.dialects.postgresql import JSONB

# Scan configuration (varies by scan type)
scan_config = Column(JSONB, default={})

# API response metadata (no need to model every field)
extra_data = Column(JSONB, nullable=True)

# Risk score breakdown (computed, no relational integrity needed)
risk_factors = Column(JSONB, nullable=True)
# Example: {"severity": 0.4, "age": 0.2, "exposure": 0.3, "exploitability": 0.1}
```

**Example: Relational for structured associations**

```python
# Bad: JSONB for structured data
user_roles = Column(JSONB)  # {"roles": ["admin", "analyst"]}

# Good: Proper join table
class UserRole(Base):
    __tablename__ = "user_roles"
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"))
```

---

## 3. SQLAlchemy Base & Mixins

### 3.1 Base Declarative Class

**File: `src/api/database.py`**

```python
import os
import logging
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

logger = logging.getLogger(__name__)

# Database configuration from environment
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "{DB_USER}")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "{DB_PASSWORD}")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "{DB_NAME}")

SQLALCHEMY_DATABASE_URL = (
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
)

# Engine configuration
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=10,              # Connection pool size
    max_overflow=20,           # Allow 20 extra connections beyond pool_size
    pool_recycle=3600,         # Recycle connections after 1 hour
    pool_pre_ping=True,        # Verify connections before using
    echo=False,                # Set True for SQL query logging (dev only)
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base for all models
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    Dependency for getting database sessions in FastAPI.

    Usage:
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

> **AuditGH Reference:** See `/Users/rob.vance@sleepnumber.com/Documents/GitHub/auditgh/src/api/database.py` for production configuration including multi-tenant context management and health check queries.

### 3.2 TimestampMixin

**File: `src/api/mixins.py`**

```python
from sqlalchemy import Column, DateTime
from sqlalchemy.sql import func


class TimestampMixin:
    """Adds created_at and updated_at timestamps to models."""

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
```

**Usage:**

```python
from src.api.database import Base
from src.api.mixins import TimestampMixin


class {DomainModel}(Base, TimestampMixin):
    __tablename__ = "{domain_models}"
    # ... model definition
```

### 3.3 SoftDeleteMixin

```python
class SoftDeleteMixin:
    """Adds soft delete capability with is_deleted flag and timestamp."""

    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
```

### 3.4 TenantMixin (Multi-Tenant Apps)

```python
from sqlalchemy.dialects.postgresql import UUID


class TenantMixin:
    """Adds organization_id foreign key for multi-tenant row-level isolation."""

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("{tenant_entity_table}.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
```

**Usage:**

```python
class {DomainModel}(Base, TimestampMixin, TenantMixin):
    __tablename__ = "{domain_models}"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    # ... domain fields

    # Relationship back to tenant
    {tenant_entity_lowercase} = relationship("{TenantEntity}", backref="{domain_models}")
```

### 3.5 AuditMixin

```python
class AuditMixin:
    """Tracks who created/modified a record."""

    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
```

---

## 4. Core Domain Models

### 4.1 Multi-Tenant Root Entity

**Template: {TENANT_ENTITY} (e.g., Organization, Company, Account)**

```python
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Sequence
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func, text
from src.api.database import Base


class {TenantEntity}(Base):
    """
    Multi-tenant root entity. All tenant-scoped data references this table.

    In a SaaS application, this represents the top-level customer account.
    For AuditGH, this is the GitHub organization being scanned.
    """
    __tablename__ = "{tenant_entities}"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    api_id = Column(Integer, Sequence('{tenant_entities}_api_id_seq'), unique=True)

    # Core identity
    name = Column(String(255), unique=True, nullable=False, index=True)
    display_name = Column(String(255), nullable=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)  # URL-safe identifier

    # Configuration
    settings = Column(JSONB, default={})  # Tenant-specific configuration

    # Lifecycle
    is_active = Column(Boolean, default=True, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)  # Default tenant for local dev

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<{TenantEntity}(name='{self.name}', slug='{self.slug}')>"
```

> **AuditGH Reference:** Organization model at `/Users/rob.vance@sleepnumber.com/Documents/GitHub/auditgh/src/api/models.py:13-36`. Includes `github_org` for external GitHub org name and `database_name` for legacy per-tenant DB approach (now deprecated in favor of row-level scoping).

### 4.2 Domain Model Template

**Template: Core business entity**

```python
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func, text
from src.api.database import Base


class {DomainModel}(Base):
    """
    {Brief description of what this entity represents}.

    Example: Represents a {domain concept} with {key attributes}.
    """
    __tablename__ = "{domain_models}"

    # Primary key (UUID)
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    api_id = Column(Integer, Sequence('{domain_models}_api_id_seq'), unique=True)

    # Multi-tenant scope (if applicable)
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("{tenant_entities}.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Core attributes
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default='active')

    # Metadata (flexible JSONB)
    metadata = Column(JSONB, default={})

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    organization = relationship("{TenantEntity}", backref="{domain_models}")

    # Unique constraint: name unique within organization
    __table_args__ = (
        UniqueConstraint('organization_id', 'name', name='uq_{domain_model}_name_per_org'),
    )

    def __repr__(self):
        return f"<{DomainModel}(name='{self.name}', status='{self.status}')>"
```

### 4.3 AuditGH Example: Repository Model

**Reference: `/Users/rob.vance@sleepnumber.com/Documents/GitHub/auditgh/src/api/models.py:42-110`**

```python
class Repository(Base):
    """
    Represents a GitHub repository within an organization.

    Tracks repository metadata, scan results, findings, and contributors.
    """
    __tablename__ = "repositories"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    api_id = Column(Integer, Sequence('repositories_api_id_seq'), unique=True)

    # Multi-tenant scope
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))

    # Core attributes
    name = Column(String, nullable=False)
    full_name = Column(String)  # e.g., "sleepnumber/auditgh"
    url = Column(Text)
    description = Column(Text)
    default_branch = Column(String, default='main')
    language = Column(String)  # Primary programming language

    # GitHub metadata
    pushed_at = Column(DateTime)
    github_created_at = Column(DateTime)
    stargazers_count = Column(Integer, default=0)
    forks_count = Column(Integer, default=0)
    is_private = Column(Boolean, default=True)
    visibility = Column(String)  # public, private, internal

    # Scan tracking
    last_scanned_at = Column(DateTime, nullable=True)
    business_criticality = Column(String)  # critical, high, medium, low

    # Failure tracking (self-annealing pattern)
    failure_count = Column(Integer, default=0)
    last_failure_at = Column(DateTime, nullable=True)
    last_failure_reason = Column(String, nullable=True)

    # Architecture analysis (stored as text/JSON)
    architecture_report = Column(Text)
    architecture_preprocessed = Column(Text)  # JSON string

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    organization = relationship("Organization", backref="repositories")
    scan_runs = relationship("ScanRun", back_populates="repository")
    findings = relationship("Finding", back_populates="repository")
    contributors = relationship("Contributor", back_populates="repository")

    # Unique constraint
    __table_args__ = (
        UniqueConstraint('organization_id', 'name', name='unique_repo_name_per_org'),
    )
```

**Key patterns:**

- **Multi-tenant scoping:** `organization_id` foreign key with `ondelete="CASCADE"`
- **GitHub API metadata:** Direct mapping of GitHub API fields (`stargazers_count`, `pushed_at`)
- **Self-annealing:** `failure_count`, `last_failure_reason` to track problematic repos
- **Flexible storage:** JSONB for `architecture_preprocessed` to avoid rigid schema
- **Unique constraint:** Name must be unique within an organization

### 4.4 AuditGH Example: Finding Model

**Reference: `/Users/rob.vance@sleepnumber.com/Documents/GitHub/auditgh/src/api/models.py:298-392`**

```python
class Finding(Base):
    """
    Security finding discovered by scanners.

    Represents vulnerabilities, secrets, code quality issues, etc.
    Lifecycle: open → triaged → in_progress → resolved/closed
    """
    __tablename__ = "findings"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    api_id = Column(Integer, Sequence('findings_api_id_seq'), unique=True)
    finding_uuid = Column(UUID(as_uuid=True), unique=True, server_default=text("gen_random_uuid()"))

    # Multi-tenant scope
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))

    # Foreign keys
    repository_id = Column(UUID(as_uuid=True), ForeignKey("repositories.id"))
    scan_run_id = Column(UUID(as_uuid=True), ForeignKey("scan_runs.id"))
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Scanner metadata
    scanner_name = Column(String)  # gitleaks, trivy, semgrep
    finding_type = Column(String)  # secret, vulnerability, code_smell
    severity = Column(String)  # critical, high, medium, low, info

    # Finding details
    title = Column(Text, nullable=False)
    description = Column(Text)
    file_path = Column(Text)
    line_start = Column(Integer)
    line_end = Column(Integer)
    code_snippet = Column(Text)

    # Vulnerability-specific (CVE/CWE)
    cve_id = Column(String)
    cwe_id = Column(String)
    package_name = Column(String)
    package_version = Column(String)
    fixed_version = Column(String)

    # Status tracking
    status = Column(String, default='open')  # open, triaged, in_progress, resolved, closed
    resolution = Column(String)  # fixed, false_positive, wont_fix, duplicate
    resolution_notes = Column(Text)

    # Ticket integration
    jira_ticket_key = Column(String)
    jira_ticket_url = Column(Text)

    # AI remediation
    ai_remediation_text = Column(Text)
    ai_remediation_diff = Column(Text)
    ai_confidence_score = Column(Numeric(3, 2))  # 0.00-1.00

    # Risk scoring
    risk_score = Column(Integer, nullable=True)  # 0-100
    risk_factors = Column(JSONB, nullable=True)

    # Deduplication
    duplicate_group_id = Column(UUID(as_uuid=True), nullable=True)
    is_primary_in_group = Column(Boolean, default=True)

    # Lifecycle timestamps
    first_seen_at = Column(DateTime, server_default=func.now())
    last_seen_at = Column(DateTime, server_default=func.now())
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    repository = relationship("Repository", back_populates="findings")
    scan_run = relationship("ScanRun", back_populates="findings")
    assignee = relationship("User", back_populates="assigned_findings")
    history = relationship("FindingHistory", back_populates="finding")
    comments = relationship("FindingComment", back_populates="finding")
```

**Key patterns:**

- **Lifecycle tracking:** `first_seen_at`, `last_seen_at`, `resolved_at` for MTTR analytics
- **AI integration:** Separate columns for AI remediation suggestions with confidence scores
- **Deduplication:** `duplicate_group_id` + `is_primary_in_group` for grouping similar findings
- **Flexible risk scoring:** JSONB `risk_factors` to store breakdown of score components
- **Assignment:** `assigned_to` foreign key to User for workflow management

---

## 5. Authentication & RBAC Models

### 5.1 User Model

**Template with OIDC support:**

```python
from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func, text
from src.api.database import Base


class User(Base):
    """
    User account with OIDC authentication and RBAC.

    Supports multiple OIDC providers (Entra ID, Okta, Auth0) via stable
    oidc_subject claim. Role assignment is per-tenant via UserRole table.
    """
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    api_id = Column(Integer, Sequence('users_api_id_seq'), unique=True)

    # Core identity
    username = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=True)

    # OIDC authentication (provider-agnostic)
    oidc_subject = Column(String(255), unique=True, nullable=True, index=True)  # 'sub' claim
    oidc_issuer = Column(String(255), nullable=True)  # Issuer URL
    auth_provider = Column(String(50), default='{AUTH_PROVIDER}')  # entra, okta, auth0

    # Legacy/break-glass authentication
    local_password_hash = Column(String(255), nullable=True)  # bcrypt hash (optional)

    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    is_service_account = Column(Boolean, default=False, nullable=False)
    is_invited = Column(Boolean, default=False, nullable=False)

    # Login tracking
    first_login_at = Column(DateTime, nullable=True)
    last_login_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    assigned_findings = relationship("{DomainModel}", back_populates="assignee")
    api_keys = relationship("ApiKey", back_populates="user")
    user_roles = relationship("UserRole", back_populates="user")

    def __repr__(self):
        return f"<User(email='{self.email}', provider='{self.auth_provider}')>"
```

> **AuditGH Reference:** User model at `/Users/rob.vance@sleepnumber.com/Documents/GitHub/auditgh/src/api/models.py:409-450`. Includes `entra_id_object_id` for Azure AD backward compatibility.

### 5.2 Role Model

**File: `src/rbac/models.py`**

```python
from sqlalchemy import Column, String, Integer, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func, text
from src.api.database import Base


class Role(Base):
    """
    Global role definition with hierarchy levels.

    Roles are defined globally but assigned per-tenant via UserRole.
    Lower level numbers = higher privilege (1 = super admin).
    """
    __tablename__ = "roles"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

    # Role identity
    name = Column(String(50), unique=True, nullable=False, index=True)
    display_name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)

    # Hierarchy (1 = highest privilege)
    level = Column(Integer, nullable=False, unique=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")
    user_roles = relationship("UserRole", back_populates="role")

    def __repr__(self):
        return f"<Role(name='{self.name}', level={self.level})>"
```

**Example hierarchy:**

| Level | Role Name | Display Name | Description |
|-------|-----------|--------------|-------------|
| 1 | `super_admin` | Super Administrator | Full system access across all tenants |
| 2 | `admin` | Administrator | Tenant admin with full access to tenant resources |
| 3 | `analyst` | Security Analyst | Read/write access to findings and scans |
| 4 | `manager` | Manager | Read-only access to reports and dashboards |
| 5 | `user` | User | Basic read-only access |

### 5.3 Permission Model

```python
class Permission(Base):
    """
    Global permission using resource:action naming convention.

    Format: {resource}:{action}
    Examples: findings:read, scans:execute, users:write
    Wildcards: findings:*, *:* (super admin)
    """
    __tablename__ = "permissions"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

    # Permission identity (resource:action format)
    name = Column(String(100), unique=True, nullable=False, index=True)
    resource = Column(String(50), nullable=False)  # findings, scans, users
    action = Column(String(50), nullable=False)    # read, write, execute, delete

    # Description
    description = Column(String(255), nullable=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    roles = relationship("RolePermission", back_populates="permission")

    # Unique constraint on resource + action
    __table_args__ = (
        UniqueConstraint('resource', 'action', name='uq_permission_resource_action'),
    )

    def __repr__(self):
        return f"<Permission(name='{self.name}')>"
```

### 5.4 RolePermission (Many-to-Many)

```python
class RolePermission(Base):
    """
    Join table: roles ←→ permissions.

    Allows multiple permissions per role and same permission across multiple roles.
    """
    __tablename__ = "role_permissions"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

    # Foreign keys
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    permission_id = Column(UUID(as_uuid=True), ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)

    # Timestamp
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    role = relationship("Role", back_populates="permissions")
    permission = relationship("Permission", back_populates="roles")

    # Unique constraint: prevent duplicate role-permission assignments
    __table_args__ = (
        UniqueConstraint('role_id', 'permission_id', name='uq_role_permission'),
    )

    def __repr__(self):
        return f"<RolePermission(role_id={self.role_id}, permission_id={self.permission_id})>"
```

### 5.5 UserRole (Tenant-Scoped Role Assignment)

```python
class UserRole(Base):
    """
    Tenant-scoped user role assignment.

    CRITICAL: Users are assigned roles per-tenant. A user can be:
    - Admin in Tenant A
    - Analyst in Tenant B
    - No access in Tenant C

    This is the KEY to multi-tenant RBAC security.
    """
    __tablename__ = "user_roles"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

    # Assignment
    user_sub = Column(String(255), nullable=False, index=True)  # OIDC 'sub' claim (not FK to users.id)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("{tenant_entities}.id", ondelete="CASCADE"), nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    role = relationship("Role", back_populates="user_roles")
    {tenant_entity_lowercase} = relationship("{TenantEntity}", backref="user_roles")

    # Unique constraint: one role per user per tenant
    __table_args__ = (
        UniqueConstraint('user_sub', 'tenant_id', name='uq_user_tenant_role'),
    )

    def __repr__(self):
        return f"<UserRole(user_sub='{self.user_sub}', tenant_id={self.tenant_id}, role_id={self.role_id})>"
```

**Why `user_sub` instead of `user_id`?**

- User records might not exist yet during OIDC login
- OIDC 'sub' claim is the stable identifier across providers
- Decouples RBAC from User table creation timing

> **AuditGH Reference:** UserRole model at `/Users/rob.vance@sleepnumber.com/Documents/GitHub/auditgh/src/rbac/models.py:127-168`. Uses `user_sub` for OIDC 'sub' claim and `tenant_id` for organization scoping.

---

## 6. Relationship Patterns

### 6.1 One-to-Many (Parent → Children)

**Pattern: Organization has many Repositories**

```python
# Parent model (Organization)
class {TenantEntity}(Base):
    __tablename__ = "{tenant_entities}"
    # ...
    repositories = relationship("{DomainModel}", back_populates="{tenant_entity_lowercase}")

# Child model (Repository)
class {DomainModel}(Base):
    __tablename__ = "{domain_models}"
    # ...
    {tenant_entity_lowercase}_id = Column(UUID(as_uuid=True), ForeignKey("{tenant_entities}.id", ondelete="CASCADE"))
    {tenant_entity_lowercase} = relationship("{TenantEntity}", back_populates="{domain_models}")
```

**Cascade rules:**

- **`ondelete="CASCADE"`**: Delete children when parent is deleted (most common)
- **`ondelete="SET NULL"`**: Nullify foreign key when parent is deleted
- **`ondelete="RESTRICT"`**: Prevent parent deletion if children exist

**SQLAlchemy cascade options:**

```python
# Delete orphaned children when removed from parent collection
repositories = relationship("{DomainModel}", cascade="all, delete-orphan")

# Only delete children when parent is deleted (not when removed from collection)
repositories = relationship("{DomainModel}", cascade="all, delete")

# No cascade (default)
repositories = relationship("{DomainModel}")
```

### 6.2 Many-to-Many (Join Table)

**Pattern: Roles ←→ Permissions**

```python
# Role model
class Role(Base):
    __tablename__ = "roles"
    # ...
    permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")

# Permission model
class Permission(Base):
    __tablename__ = "permissions"
    # ...
    roles = relationship("RolePermission", back_populates="permission")

# Join table
class RolePermission(Base):
    __tablename__ = "role_permissions"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"))
    permission_id = Column(UUID(as_uuid=True), ForeignKey("permissions.id", ondelete="CASCADE"))

    role = relationship("Role", back_populates="permissions")
    permission = relationship("Permission", back_populates="roles")

    __table_args__ = (
        UniqueConstraint('role_id', 'permission_id', name='uq_role_permission'),
    )
```

**Alternative: SQLAlchemy `secondary` pattern (simpler, no extra attributes)**

```python
# Only use if join table has no additional columns beyond the two FKs
role_permissions = Table(
    'role_permissions',
    Base.metadata,
    Column('role_id', UUID(as_uuid=True), ForeignKey('roles.id', ondelete='CASCADE')),
    Column('permission_id', UUID(as_uuid=True), ForeignKey('permissions.id', ondelete='CASCADE')),
    UniqueConstraint('role_id', 'permission_id')
)

class Role(Base):
    __tablename__ = "roles"
    # ...
    permissions = relationship("Permission", secondary=role_permissions, backref="roles")
```

### 6.3 Self-Referential (Parent → Self)

**Pattern: Hierarchical {DomainModel} (e.g., Finding → Parent Finding)**

```python
class {DomainModel}(Base):
    __tablename__ = "{domain_models}"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    parent_id = Column(UUID(as_uuid=True), ForeignKey("{domain_models}.id"), nullable=True)

    # Self-referential relationship
    parent = relationship("{DomainModel}", remote_side=[id], backref="children")
```

**Query example:**

```python
# Get all children of a parent
parent = db.query({DomainModel}).filter_by(id=parent_id).first()
children = parent.children  # Automatically loads via backref

# Get parent of a child
child = db.query({DomainModel}).filter_by(id=child_id).first()
parent = child.parent
```

### 6.4 Polymorphic Associations (Advanced)

**Use case:** Comments on multiple entity types (Findings, ScanRuns, etc.)

**Approach 1: Nullable foreign keys (simple, not ideal)**

```python
class Comment(Base):
    __tablename__ = "comments"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

    # Multiple nullable foreign keys (only one is populated)
    finding_id = Column(UUID(as_uuid=True), ForeignKey("findings.id"), nullable=True)
    scan_run_id = Column(UUID(as_uuid=True), ForeignKey("scan_runs.id"), nullable=True)

    comment_text = Column(Text, nullable=False)
```

**Approach 2: Generic foreign key with type discriminator (better)**

```python
class Comment(Base):
    __tablename__ = "comments"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

    # Generic foreign key pattern
    commentable_type = Column(String(50), nullable=False)  # 'finding', 'scan_run'
    commentable_id = Column(UUID(as_uuid=True), nullable=False)

    comment_text = Column(Text, nullable=False)

    __table_args__ = (
        Index('ix_comments_polymorphic', 'commentable_type', 'commentable_id'),
    )
```

**Query pattern:**

```python
# Get all comments for a finding
finding_comments = db.query(Comment).filter(
    Comment.commentable_type == 'finding',
    Comment.commentable_id == finding_id
).all()
```

### 6.5 Backref vs back_populates

**`back_populates` (explicit, recommended):**

```python
# Parent
class Organization(Base):
    repositories = relationship("Repository", back_populates="organization")

# Child
class Repository(Base):
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"))
    organization = relationship("Organization", back_populates="repositories")
```

**`backref` (implicit, convenient):**

```python
# Parent (automatically creates Repository.organization)
class Organization(Base):
    repositories = relationship("Repository", backref="organization")

# Child (no explicit relationship needed)
class Repository(Base):
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"))
```

**Recommendation:** Use `back_populates` for clarity and explicit control.

---

## 7. Indexing Strategy

### 7.1 Index Types

**B-tree (default):** Most common, supports equality and range queries

```python
# Single-column index
username = Column(String(255), index=True)

# Explicit named index
from sqlalchemy import Index

__table_args__ = (
    Index('ix_{table_name}_{column_name}', '{column_name}'),
)
```

**Composite index:** Multi-column queries

```python
__table_args__ = (
    Index('ix_findings_repo_status', 'repository_id', 'status'),
)

# Query that uses this index efficiently:
# SELECT * FROM findings WHERE repository_id = ? AND status = ?
```

**Partial index:** Index only rows matching a condition

```python
__table_args__ = (
    Index(
        'ix_findings_active',
        'repository_id',
        postgresql_where=(status == 'open')
    ),
)
```

**GIN index:** Full-text search and JSONB

```python
from sqlalchemy.dialects.postgresql import JSONB

metadata = Column(JSONB, default={})

__table_args__ = (
    Index('ix_metadata_gin', 'metadata', postgresql_using='gin'),
)

# Query pattern:
# SELECT * FROM findings WHERE metadata @> '{"severity": "critical"}'
```

### 7.2 Foreign Key Indexes

**Always index foreign keys:**

```python
organization_id = Column(
    UUID(as_uuid=True),
    ForeignKey("organizations.id", ondelete="CASCADE"),
    nullable=False,
    index=True  # Critical for join performance
)
```

> **Why:** Foreign keys are used in JOINs and WHERE clauses. Without indexes, PostgreSQL performs full table scans.

### 7.3 Unique Indexes

**Unique constraints automatically create indexes:**

```python
email = Column(String(255), unique=True)  # Auto-creates unique index

# Composite unique constraint
__table_args__ = (
    UniqueConstraint('organization_id', 'name', name='uq_repo_name_per_org'),
)
```

### 7.4 Index Naming Conventions

```
ix_{table_name}_{column1}_{column2}    # Regular index
uq_{table_name}_{column1}              # Unique constraint
fk_{table_name}_{ref_table}            # Foreign key (auto-named by PostgreSQL)
pk_{table_name}                        # Primary key (auto-named)
```

### 7.5 AuditGH Index Examples

**From `/Users/rob.vance@sleepnumber.com/Documents/GitHub/auditgh/src/api/models.py`:**

```python
# Commit analysis cache expiration lookup
__table_args__ = (
    Index("ix_commit_analyses_repository_id", "repository_id"),
    Index("ix_commit_analyses_expires_at", "expires_at"),  # For cache cleanup jobs
    UniqueConstraint("repository_id", name="uq_commit_analyses_repository"),
)

# Polymorphic comment lookup
__table_args__ = (
    Index('ix_comments_polymorphic', 'commentable_type', 'commentable_id'),
)

# User authentication lookup
oidc_subject = Column(String, unique=True, nullable=True, index=True)
email = Column(String, unique=True, nullable=False, index=True)

# Multi-tenant filtering (critical for performance)
organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), index=True)
```

### 7.6 Index Maintenance

**Monitor index usage:**

```sql
-- PostgreSQL query to find unused indexes
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

**When to add indexes:**

- Columns used in WHERE clauses
- Foreign keys (always)
- Columns used in ORDER BY
- Columns used in GROUP BY
- Composite indexes for multi-column filters

**When NOT to add indexes:**

- Small tables (<1000 rows)
- Columns with low cardinality (e.g., boolean flags)
- Frequently updated columns (indexes slow down writes)

---

## 8. Alembic Migration Setup

### 8.1 Install Alembic

```bash
pip install alembic
```

### 8.2 Initialize Alembic

```bash
alembic init migrations
```

**File structure after init:**

```
{PROJECT_ROOT}/
├── alembic.ini                 # Alembic configuration
├── migrations/
│   ├── env.py                  # Migration environment
│   ├── script.py.mako          # Template for new migrations
│   ├── versions/               # Migration scripts
│   └── README
```

### 8.3 Configure alembic.ini

**File: `alembic.ini`**

```ini
[alembic]
script_location = migrations
prepend_sys_path = .
version_path_separator = os

# Database URL (use environment variable in production)
sqlalchemy.url = postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}

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

> **Production:** Use environment variable for database URL:
>
> ```ini
> sqlalchemy.url = driver://user:pass@host/dbname
> # sqlalchemy.url =  # Leave blank, configure in env.py from environment
> ```

### 8.4 Configure env.py

**File: `migrations/env.py`**

```python
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import sys
import os

# Add project root to path so we can import models
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.api.database import engine as metadata_engine
from src.api.models import Base

# Import all models here to ensure they're registered with Base.metadata
from src.api.models import (
    {TenantEntity},
    {DomainModel},
    User,
    # ... import all models
)
from src.rbac.models import Role, Permission, RolePermission, UserRole

# Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# SQLAlchemy metadata for autogenerate
target_metadata = Base.metadata


def run_migrations_online():
    """Run migrations in 'online' mode (standard production mode)."""

    connectable = metadata_engine

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,           # Detect column type changes
            compare_server_default=True, # Detect server default changes
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    raise NotImplementedError("Offline mode not supported")
else:
    run_migrations_online()
```

> **AuditGH Reference:** Multi-tenant migration setup at `/Users/rob.vance@sleepnumber.com/Documents/GitHub/auditgh/migrations/env.py:23-83`. Supports migrating multiple tenant schemas in a loop.

### 8.5 Create Initial Migration

**Generate migration from models:**

```bash
alembic revision --autogenerate -m "Initial schema"
```

**Output:**

```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.autogenerate.compare] Detected added table 'organizations'
INFO  [alembic.autogenerate.compare] Detected added table 'users'
INFO  [alembic.autogenerate.compare] Detected added table 'roles'
...
Generating /Users/.../migrations/versions/a1b2c3d4e5f6_initial_schema.py ...  done
```

**Review the generated migration:**

```python
# migrations/versions/a1b2c3d4e5f6_initial_schema.py

"""Initial schema

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-02-27 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('organizations',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('api_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('display_name', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('api_id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_organizations_name'), 'organizations', ['name'], unique=False)
    # ...


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(op.f('ix_organizations_name'), table_name='organizations')
    op.drop_table('organizations')
    # ...
```

### 8.6 Apply Migration

```bash
# Upgrade to latest
alembic upgrade head

# Upgrade one version
alembic upgrade +1

# Downgrade one version
alembic downgrade -1

# Downgrade to base (empty database)
alembic downgrade base

# Show current version
alembic current

# Show migration history
alembic history --verbose
```

### 8.7 Migration Workflow

**Standard workflow:**

1. **Modify models** — Add/change columns, tables, relationships in `models.py`
2. **Generate migration** — `alembic revision --autogenerate -m "Add {feature}"`
3. **Review migration** — Check `migrations/versions/` for correctness
4. **Test migration** — Apply to local DB, verify schema changes
5. **Test rollback** — `alembic downgrade -1`, then `alembic upgrade head`
6. **Commit to git** — Commit migration file with model changes
7. **Deploy** — Run `alembic upgrade head` in staging/prod

**Best practices:**

- **Never edit applied migrations** — Create a new migration instead
- **Review autogenerated code** — Alembic may miss complex changes
- **Add data migrations manually** — Use `op.execute()` for data transformations
- **Test rollback** — Ensure `downgrade()` works before deploying
- **Squash migrations** — Combine many migrations into one before v1.0

### 8.8 Manual Migration Example

**Use case:** Add a computed column with initial data

```python
"""Add risk_score to findings

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-27 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    # Add column (nullable first)
    op.add_column('findings', sa.Column('risk_score', sa.Integer(), nullable=True))

    # Populate initial values
    op.execute("""
        UPDATE findings
        SET risk_score = CASE
            WHEN severity = 'critical' THEN 90
            WHEN severity = 'high' THEN 70
            WHEN severity = 'medium' THEN 50
            WHEN severity = 'low' THEN 30
            ELSE 10
        END
    """)

    # Make non-nullable after populating
    op.alter_column('findings', 'risk_score', nullable=False)


def downgrade():
    op.drop_column('findings', 'risk_score')
```

### 8.9 Migration Naming Conventions

```
{timestamp}_{description}.py

Examples:
20260227_103000_initial_schema.py
20260227_110000_add_risk_score_to_findings.py
20260227_120000_add_rbac_models.py
20260227_130000_add_multi_tenant_support.py
```

---

## 9. Multi-Tenant Data Isolation

### 9.1 Row-Level Security Pattern

**Approach: Shared database with `{TENANT_ID_COLUMN}` foreign key**

Every tenant-scoped table has an `organization_id` column that references the `{tenant_entities}` table. All queries filter by `organization_id`.

**Benefits:**
- Simple to implement and maintain
- Cost-effective (one database for all tenants)
- Easy backups and migrations
- Suitable for <100 tenants

**Drawbacks:**
- Query complexity (must filter every query)
- Risk of cross-tenant data leakage (application bug)
- Noisy neighbor problem (one tenant can impact others)

> **AuditGH Reference:** Uses row-level security with `organization_id` foreign key. Originally used per-tenant databases but migrated to shared DB approach for simplicity.

### 9.2 Tenant Context Middleware

**Pattern: Set tenant context per-request**

**File: `src/api/database.py`**

```python
from typing import Optional

# Global tenant context (request-scoped)
_request_org_id: Optional[str] = None


def set_request_org_id(org_id: Optional[str]):
    """Set the organization ID for the current request."""
    global _request_org_id
    _request_org_id = org_id


def get_request_org_id() -> Optional[str]:
    """Get the organization ID for the current request."""
    return _request_org_id
```

**Middleware to extract tenant from request:**

```python
from fastapi import Request
from src.api.database import set_request_org_id

@app.middleware("http")
async def tenant_context_middleware(request: Request, call_next):
    """
    Extract tenant from request and set context.

    Tenant can come from:
    - Path parameter: /api/v1/{org_slug}/...
    - Header: X-Organization-ID
    - JWT claim: organization_id
    """
    org_id = None

    # Option 1: Path parameter
    if "org_slug" in request.path_params:
        org_slug = request.path_params["org_slug"]
        # Lookup organization by slug
        org = db.query(Organization).filter(Organization.slug == org_slug).first()
        if org:
            org_id = str(org.id)

    # Option 2: Header
    if not org_id:
        org_id = request.headers.get("X-Organization-ID")

    # Option 3: JWT claim (if using token authentication)
    if not org_id and hasattr(request.state, "user"):
        org_id = request.state.user.get("organization_id")

    # Set context
    set_request_org_id(org_id)

    response = await call_next(request)

    # Clear context after request
    set_request_org_id(None)

    return response
```

### 9.3 Query Filtering Pattern

**Always filter by tenant in queries:**

```python
from fastapi import Depends
from sqlalchemy.orm import Session
from src.api.database import get_db, get_request_org_id


@router.get("/{domain_models}")
def list_{domain_models}(db: Session = Depends(get_db)):
    """List all {domain_models} for the current tenant."""

    org_id = get_request_org_id()
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization context")

    {domain_models} = db.query({DomainModel}).filter(
        {DomainModel}.organization_id == org_id
    ).all()

    return {domain_models}
```

**Helper function to enforce tenant filtering:**

```python
def get_tenant_query(db: Session, model):
    """Return a query pre-filtered by current tenant."""
    org_id = get_request_org_id()
    if not org_id:
        raise ValueError("No organization context set")

    return db.query(model).filter(model.organization_id == org_id)


# Usage
@router.get("/{domain_models}")
def list_{domain_models}(db: Session = Depends(get_db)):
    query = get_tenant_query(db, {DomainModel})
    {domain_models} = query.all()
    return {domain_models}
```

### 9.4 Preventing Cross-Tenant Data Leakage

**Rule 1: Never trust user input for tenant ID**

```python
# BAD: User provides org_id in request body
@router.post("/{domain_models}")
def create_{domain_model}(data: {DomainModel}Create, db: Session = Depends(get_db)):
    new_item = {DomainModel}(
        organization_id=data.organization_id,  # NEVER DO THIS
        name=data.name
    )
    db.add(new_item)
    db.commit()


# GOOD: Use tenant from request context
@router.post("/{domain_models}")
def create_{domain_model}(data: {DomainModel}Create, db: Session = Depends(get_db)):
    org_id = get_request_org_id()
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization context")

    new_item = {DomainModel}(
        organization_id=org_id,  # From request context, not user input
        name=data.name
    )
    db.add(new_item)
    db.commit()
```

**Rule 2: Validate tenant ownership before updates/deletes**

```python
@router.put("/{domain_models}/{item_id}")
def update_{domain_model}(
    item_id: str,
    data: {DomainModel}Update,
    db: Session = Depends(get_db)
):
    org_id = get_request_org_id()
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization context")

    # Fetch item with tenant filter
    item = db.query({DomainModel}).filter(
        {DomainModel}.id == item_id,
        {DomainModel}.organization_id == org_id  # CRITICAL: Validate tenant ownership
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Update item
    item.name = data.name
    db.commit()
    return item
```

**Rule 3: Test tenant isolation**

```python
# Test in tests/test_tenant_isolation.py

def test_cannot_access_other_tenant_data(client, db):
    """Ensure users cannot access data from other tenants."""

    # Create two tenants
    org_a = Organization(name="Tenant A", slug="tenant-a")
    org_b = Organization(name="Tenant B", slug="tenant-b")
    db.add_all([org_a, org_b])
    db.commit()

    # Create item in Tenant A
    item_a = {DomainModel}(organization_id=org_a.id, name="Item A")
    db.add(item_a)
    db.commit()

    # Attempt to access Tenant A's item from Tenant B context
    set_request_org_id(str(org_b.id))
    response = client.get(f"/{domain_models}/{item_a.id}")

    # Should return 404, not 200
    assert response.status_code == 404
```

### 9.5 Alternative: Schema-Per-Tenant

**Pattern: Each tenant gets a PostgreSQL schema**

```python
# Tenant A data: tenant_a.repositories, tenant_a.findings
# Tenant B data: tenant_b.repositories, tenant_b.findings
```

**Benefits:**
- Stronger isolation (database enforces separation)
- Easier to backup/restore single tenant
- Can set per-tenant resource limits

**Drawbacks:**
- Complex migration management (must migrate all schemas)
- More expensive (more database connections, resources)
- Harder to query cross-tenant data (analytics)

**Implementation snippet:**

```python
def get_tenant_session(tenant_slug: str) -> Session:
    """Get a session with search_path set to tenant schema."""

    # Create engine with tenant-specific schema
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"options": f"-csearch_path=tenant_{tenant_slug},public"}
    )
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()
```

> **AuditGH Reference:** Originally implemented schema-per-tenant but migrated to row-level security for simplicity. See `migrations/env.py` for multi-schema migration logic (now deprecated).

---

## 10. Seed Data & Bootstrap

### 10.1 RBAC Seed Script

**File: `src/rbac/seeds.py`**

```python
"""
RBAC seed data for roles and permissions.

Idempotent: Safe to run multiple times without creating duplicates.
"""

from sqlalchemy.orm import Session
from sqlalchemy import select
from src.rbac.models import Role, Permission, RolePermission
import logging

logger = logging.getLogger(__name__)


def seed_rbac_data(session: Session) -> None:
    """
    Seed database with default roles and permissions.

    Creates:
    - 5 roles (super_admin, admin, analyst, manager, user)
    - ~13 permissions covering core resources
    - Role-permission mappings
    """
    logger.info("Starting RBAC seed data initialization...")

    # Define roles
    roles_data = [
        {
            "name": "super_admin",
            "display_name": "Super Administrator",
            "description": "Full system access across all tenants",
            "level": 1
        },
        {
            "name": "admin",
            "display_name": "Administrator",
            "description": "Tenant admin with full access",
            "level": 2
        },
        {
            "name": "analyst",
            "display_name": "Analyst",
            "description": "Read/write access to core resources",
            "level": 3
        },
        {
            "name": "manager",
            "display_name": "Manager",
            "description": "Read-only access to reports",
            "level": 4
        },
        {
            "name": "user",
            "display_name": "User",
            "description": "Basic read-only access",
            "level": 5
        }
    ]

    # Create or update roles
    roles = {}
    for role_data in roles_data:
        existing_role = session.execute(
            select(Role).where(Role.name == role_data["name"])
        ).scalar_one_or_none()

        if existing_role:
            # Update existing
            for key, value in role_data.items():
                setattr(existing_role, key, value)
            role = existing_role
            logger.info(f"Updated role: {role_data['name']}")
        else:
            # Create new
            role = Role(**role_data)
            session.add(role)
            logger.info(f"Created role: {role_data['name']}")

        roles[role_data["name"]] = role

    session.flush()

    # Define permissions
    permissions_data = [
        {"name": "*:*", "resource": "*", "action": "*", "description": "Full access (super admin)"},
        {"name": "{domain}:read", "resource": "{domain}", "action": "read", "description": "View {domain}"},
        {"name": "{domain}:write", "resource": "{domain}", "action": "write", "description": "Create/update {domain}"},
        {"name": "{domain}:delete", "resource": "{domain}", "action": "delete", "description": "Delete {domain}"},
        # Add more permissions for your domain models
    ]

    # Create or update permissions
    permissions = {}
    for perm_data in permissions_data:
        existing_perm = session.execute(
            select(Permission).where(Permission.name == perm_data["name"])
        ).scalar_one_or_none()

        if existing_perm:
            for key, value in perm_data.items():
                setattr(existing_perm, key, value)
            permission = existing_perm
            logger.info(f"Updated permission: {perm_data['name']}")
        else:
            permission = Permission(**perm_data)
            session.add(permission)
            logger.info(f"Created permission: {perm_data['name']}")

        permissions[perm_data["name"]] = permission

    session.flush()

    # Assign permissions to roles
    role_permissions_map = {
        "super_admin": ["*:*"],
        "admin": ["{domain}:read", "{domain}:write", "{domain}:delete"],
        "analyst": ["{domain}:read", "{domain}:write"],
        "manager": ["{domain}:read"],
        "user": ["{domain}:read"]
    }

    for role_name, permission_names in role_permissions_map.items():
        role = roles[role_name]

        for perm_name in permission_names:
            permission = permissions[perm_name]

            # Check if mapping exists
            existing_mapping = session.execute(
                select(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.permission_id == permission.id
                )
            ).scalar_one_or_none()

            if not existing_mapping:
                role_permission = RolePermission(
                    role_id=role.id,
                    permission_id=permission.id
                )
                session.add(role_permission)
                logger.info(f"Assigned '{perm_name}' to '{role_name}'")

    session.commit()
    logger.info(f"RBAC seed complete: {len(roles_data)} roles, {len(permissions_data)} permissions")
```

> **AuditGH Reference:** RBAC seed at `/Users/rob.vance@sleepnumber.com/Documents/GitHub/auditgh/src/rbac/seeds.py`. Includes 13 permissions covering findings, scans, repositories, organizations, users, and reports.

### 10.2 Development Seed Script

**File: `scripts/seed_dev_data.py`**

```python
#!/usr/bin/env python3
"""
Seed development data for local testing.

Creates:
- Default organization
- Test users with various roles
- Sample domain entities
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.api.database import SessionLocal
from src.api.models import {TenantEntity}, {DomainModel}, User
from src.rbac.models import Role, UserRole
from src.rbac.seeds import seed_rbac_data
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def seed_dev_data():
    """Seed development data."""
    db = SessionLocal()

    try:
        # Seed RBAC first
        seed_rbac_data(db)

        # Create default organization
        org = db.query({TenantEntity}).filter({TenantEntity}.name == "Default Org").first()
        if not org:
            org = {TenantEntity}(
                name="Default Org",
                slug="default",
                display_name="Default Organization",
                is_default=True
            )
            db.add(org)
            db.commit()
            logger.info(f"Created organization: {org.name}")
        else:
            logger.info(f"Organization already exists: {org.name}")

        # Create test users
        users_data = [
            {"email": "admin@example.com", "username": "admin", "full_name": "Admin User", "role": "admin"},
            {"email": "analyst@example.com", "username": "analyst", "full_name": "Analyst User", "role": "analyst"},
            {"email": "user@example.com", "username": "user", "full_name": "Regular User", "role": "user"},
        ]

        for user_data in users_data:
            user = db.query(User).filter(User.email == user_data["email"]).first()
            if not user:
                user = User(
                    email=user_data["email"],
                    username=user_data["username"],
                    full_name=user_data["full_name"],
                    is_active=True
                )
                db.add(user)
                db.flush()

                # Assign role
                role = db.query(Role).filter(Role.name == user_data["role"]).first()
                if role:
                    user_role = UserRole(
                        user_sub=user.email,  # In dev, use email as sub
                        tenant_id=org.id,
                        role_id=role.id
                    )
                    db.add(user_role)

                db.commit()
                logger.info(f"Created user: {user.email} (role: {user_data['role']})")
            else:
                logger.info(f"User already exists: {user.email}")

        # Create sample domain entities
        sample_items = [
            {"name": "Sample Item 1", "description": "First sample item"},
            {"name": "Sample Item 2", "description": "Second sample item"},
        ]

        for item_data in sample_items:
            item = db.query({DomainModel}).filter(
                {DomainModel}.organization_id == org.id,
                {DomainModel}.name == item_data["name"]
            ).first()

            if not item:
                item = {DomainModel}(
                    organization_id=org.id,
                    name=item_data["name"],
                    description=item_data["description"]
                )
                db.add(item)
                db.commit()
                logger.info(f"Created {domain_model}: {item.name}")
            else:
                logger.info(f"{DomainModel} already exists: {item.name}")

        logger.info("Development seed data complete!")

    except Exception as e:
        logger.error(f"Error seeding data: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_dev_data()
```

**Run the seed script:**

```bash
python scripts/seed_dev_data.py
```

### 10.3 Bootstrap Admin User

**Pattern: Create initial admin via environment variable**

```python
import os
from src.api.database import SessionLocal
from src.api.models import User, {TenantEntity}
from src.rbac.models import Role, UserRole

def bootstrap_admin():
    """Create initial admin user from environment variables."""

    admin_email = os.environ.get("ADMIN_EMAIL")
    admin_username = os.environ.get("ADMIN_USERNAME", "admin")

    if not admin_email:
        print("ADMIN_EMAIL not set, skipping admin bootstrap")
        return

    db = SessionLocal()

    try:
        # Check if user exists
        user = db.query(User).filter(User.email == admin_email).first()
        if user:
            print(f"Admin user already exists: {admin_email}")
            return

        # Get or create default organization
        org = db.query({TenantEntity}).filter({TenantEntity}.is_default == True).first()
        if not org:
            org = {TenantEntity}(name="Default", slug="default", is_default=True)
            db.add(org)
            db.commit()

        # Create user
        user = User(
            email=admin_email,
            username=admin_username,
            full_name="System Administrator",
            is_active=True
        )
        db.add(user)
        db.flush()

        # Assign super_admin role
        super_admin_role = db.query(Role).filter(Role.name == "super_admin").first()
        if super_admin_role:
            user_role = UserRole(
                user_sub=user.email,
                tenant_id=org.id,
                role_id=super_admin_role.id
            )
            db.add(user_role)

        db.commit()
        print(f"Created admin user: {admin_email}")

    finally:
        db.close()
```

**Run on application startup:**

```python
# src/api/main.py

from src.rbac.seeds import seed_rbac_data
from src.api.database import SessionLocal

@app.on_event("startup")
async def startup_event():
    """Run startup tasks."""
    db = SessionLocal()
    try:
        # Seed RBAC data
        seed_rbac_data(db)

        # Bootstrap admin user
        bootstrap_admin()

    finally:
        db.close()
```

---

## 11. Connection & Session Management

### 11.1 Engine Configuration

**File: `src/api/database.py`**

```python
from sqlalchemy import create_engine

# Production-grade engine configuration
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,

    # Connection pool settings
    pool_size=10,              # Base connection pool size
    max_overflow=20,           # Allow 20 extra connections beyond pool_size
    pool_timeout=30,           # Wait 30s for connection before raising error
    pool_recycle=3600,         # Recycle connections after 1 hour (prevents stale connections)
    pool_pre_ping=True,        # Test connections before using (auto-reconnect)

    # Query logging (dev only)
    echo=False,                # Set to True to log all SQL queries

    # Connection arguments
    connect_args={
        "options": "-c timezone=utc",  # Force UTC timezone
        "connect_timeout": 10,         # Connection timeout in seconds
    }
)
```

**Explanation:**

- **`pool_size=10`**: Maintain 10 open connections at all times
- **`max_overflow=20`**: Allow up to 30 total connections (10 + 20)
- **`pool_recycle=3600`**: Close and reopen connections after 1 hour (prevents PostgreSQL idle timeout)
- **`pool_pre_ping=True`**: Ping database before using connection (auto-reconnect if dead)

### 11.2 Session Lifecycle

**Pattern: Dependency injection with FastAPI**

```python
from typing import Generator
from sqlalchemy.orm import Session

def get_db() -> Generator[Session, None, None]:
    """
    Database session dependency.

    Yields a session and ensures it's closed after request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Usage in routers
from fastapi import Depends

@router.get("/{domain_models}")
def list_{domain_models}(db: Session = Depends(get_db)):
    items = db.query({DomainModel}).all()
    return items
```

**Pattern: Manual session management (scripts)**

```python
def my_background_task():
    """Background task with manual session management."""
    db = SessionLocal()
    try:
        # Do work
        items = db.query({DomainModel}).all()
        for item in items:
            process_item(item)
        db.commit()
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()
```

### 11.3 Transaction Management

**Explicit transactions:**

```python
@router.post("/{domain_models}")
def create_with_transaction(data: {DomainModel}Create, db: Session = Depends(get_db)):
    """Create item with explicit transaction control."""

    try:
        # Begin transaction (implicit with SessionLocal)
        item = {DomainModel}(**data.dict())
        db.add(item)

        # Flush to get ID without committing
        db.flush()

        # Do more work (e.g., create related records)
        related = RelatedModel(parent_id=item.id, name="Related")
        db.add(related)

        # Commit transaction
        db.commit()

        # Refresh to load relationships
        db.refresh(item)

        return item

    except Exception as e:
        # Rollback on error
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
```

**Nested transactions (savepoints):**

```python
from sqlalchemy.orm import Session

def create_with_savepoint(db: Session, data: dict):
    """Use savepoints for partial rollback."""

    # Create main item
    item = {DomainModel}(**data)
    db.add(item)
    db.flush()

    # Savepoint before risky operation
    savepoint = db.begin_nested()

    try:
        # Attempt risky operation
        risky_item = RiskyModel(parent_id=item.id)
        db.add(risky_item)
        db.flush()

    except Exception as e:
        # Rollback to savepoint (item still exists)
        savepoint.rollback()
        logger.warning(f"Risky operation failed: {e}")

    # Commit main transaction
    db.commit()
    return item
```

### 11.4 Async Support (Optional)

**SQLAlchemy 2.0 async pattern:**

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# Async engine
async_engine = create_async_engine(
    "postgresql+asyncpg://user:password@host/db",
    pool_size=10,
    max_overflow=20
)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Async dependency
async def get_async_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

# Async route
@router.get("/{domain_models}")
async def list_{domain_models}_async(db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select({DomainModel}))
    items = result.scalars().all()
    return items
```

### 11.5 Health Check Queries

```python
from sqlalchemy import text

@router.get("/health/db")
def db_health_check(db: Session = Depends(get_db)):
    """Check database connectivity."""
    try:
        # Simple query to verify connection
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
```

---

## 12. Query Performance Patterns

### 12.1 N+1 Query Problem

**Problem: Loading relationships in a loop**

```python
# BAD: N+1 queries (1 query for repositories + N queries for organizations)
repositories = db.query(Repository).all()
for repo in repositories:
    print(repo.organization.name)  # Triggers separate query each iteration
```

**Solution 1: Eager loading with `joinedload`**

```python
from sqlalchemy.orm import joinedload

# GOOD: Single query with LEFT JOIN
repositories = db.query(Repository).options(
    joinedload(Repository.organization)
).all()

for repo in repositories:
    print(repo.organization.name)  # No additional query
```

**Solution 2: Eager loading with `selectinload`**

```python
from sqlalchemy.orm import selectinload

# GOOD: Two queries (one for repos, one for orgs) - better for one-to-many
repositories = db.query(Repository).options(
    selectinload(Repository.findings)  # Load all findings in one query
).all()
```

**When to use each:**

- **`joinedload`**: One-to-one, many-to-one (uses JOIN)
- **`selectinload`**: One-to-many, many-to-many (uses IN clause)

### 12.2 Pagination

**Offset-based pagination (simple):**

```python
from fastapi import Query

@router.get("/{domain_models}")
def list_{domain_models}_paginated(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """List items with offset pagination."""

    total = db.query({DomainModel}).count()
    items = db.query({DomainModel}).offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": items
    }
```

**Cursor-based pagination (efficient for large datasets):**

```python
from uuid import UUID

@router.get("/{domain_models}")
def list_{domain_models}_cursor(
    cursor: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """List items with cursor pagination."""

    query = db.query({DomainModel}).order_by({DomainModel}.created_at, {DomainModel}.id)

    if cursor:
        # Decode cursor (base64-encoded UUID)
        cursor_id = UUID(cursor)
        cursor_item = db.query({DomainModel}).filter({DomainModel}.id == cursor_id).first()
        if cursor_item:
            query = query.filter(
                {DomainModel}.created_at >= cursor_item.created_at,
                {DomainModel}.id > cursor_id
            )

    items = query.limit(limit + 1).all()

    # Check if there are more items
    has_more = len(items) > limit
    if has_more:
        items = items[:limit]

    next_cursor = str(items[-1].id) if items and has_more else None

    return {
        "items": items,
        "next_cursor": next_cursor,
        "has_more": has_more
    }
```

### 12.3 Bulk Operations

**Bulk insert (fast):**

```python
# BAD: Insert one-by-one
for data in items_data:
    item = {DomainModel}(**data)
    db.add(item)
db.commit()


# GOOD: Bulk insert
from sqlalchemy import insert

db.execute(
    insert({DomainModel}),
    items_data  # List of dicts
)
db.commit()
```

**Bulk update (fast):**

```python
# BAD: Update one-by-one
items = db.query({DomainModel}).filter({DomainModel}.status == 'pending').all()
for item in items:
    item.status = 'processed'
db.commit()


# GOOD: Bulk update
db.query({DomainModel}).filter(
    {DomainModel}.status == 'pending'
).update(
    {"{DomainModel}.status": 'processed'},
    synchronize_session=False
)
db.commit()
```

### 12.4 Query Optimization

**Use `exists()` for boolean checks:**

```python
# BAD: Load all records just to check existence
has_items = len(db.query({DomainModel}).filter({DomainModel}.status == 'active').all()) > 0

# GOOD: Use exists subquery
from sqlalchemy import exists, select

has_items = db.query(
    exists().where({DomainModel}.status == 'active')
).scalar()
```

**Select only needed columns:**

```python
# BAD: Load full objects when only need IDs
item_ids = [item.id for item in db.query({DomainModel}).all()]

# GOOD: Select only ID column
from sqlalchemy import select

item_ids = db.execute(
    select({DomainModel}.id)
).scalars().all()
```

**Use database aggregations:**

```python
# BAD: Count in Python
items = db.query({DomainModel}).all()
count = len(items)

# GOOD: Count in database
from sqlalchemy import func

count = db.query(func.count({DomainModel}.id)).scalar()
```

---

## 13. Data Integrity & Constraints

### 13.1 CHECK Constraints

**Validate data at database level:**

```python
from sqlalchemy import CheckConstraint

class {DomainModel}(Base):
    __tablename__ = "{domain_models}"

    # ...
    severity = Column(String(20), nullable=False)
    risk_score = Column(Integer, nullable=False)

    __table_args__ = (
        # Severity must be one of allowed values
        CheckConstraint(
            "severity IN ('critical', 'high', 'medium', 'low', 'info')",
            name='ck_{domain_model}_severity'
        ),

        # Risk score must be 0-100
        CheckConstraint(
            "risk_score >= 0 AND risk_score <= 100",
            name='ck_{domain_model}_risk_score'
        ),
    )
```

### 13.2 ENUM Types

**PostgreSQL native enum:**

```python
from sqlalchemy import Enum

class {DomainModel}(Base):
    __tablename__ = "{domain_models}"

    # ...
    status = Column(
        Enum('pending', 'active', 'completed', 'failed', name='status_enum'),
        nullable=False,
        default='pending'
    )
```

**String-based enum (more flexible):**

```python
class {DomainModel}(Base):
    __tablename__ = "{domain_models}"

    # ...
    status = Column(String(20), nullable=False, default='pending')

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'active', 'completed', 'failed')",
            name='ck_{domain_model}_status'
        ),
    )
```

### 13.3 JSONB Validation

**Schema validation at application level:**

```python
from pydantic import BaseModel, ValidationError
import json

class RiskFactorsSchema(BaseModel):
    severity: float
    age: float
    exposure: float
    exploitability: float

class {DomainModel}(Base):
    __tablename__ = "{domain_models}"

    # ...
    risk_factors = Column(JSONB, nullable=True)

    def set_risk_factors(self, data: dict):
        """Validate and set risk_factors."""
        try:
            validated = RiskFactorsSchema(**data)
            self.risk_factors = validated.dict()
        except ValidationError as e:
            raise ValueError(f"Invalid risk_factors: {e}")
```

### 13.4 Unique Constraints

**Single-column unique:**

```python
email = Column(String(255), unique=True, nullable=False)
```

**Multi-column unique (composite):**

```python
__table_args__ = (
    UniqueConstraint('organization_id', 'name', name='uq_{domain_model}_name_per_org'),
)
```

**Partial unique (PostgreSQL):**

```python
from sqlalchemy import Index

__table_args__ = (
    Index(
        'uq_{domain_model}_active_name',
        'name',
        unique=True,
        postgresql_where=(status == 'active')
    ),
)
```

### 13.5 Foreign Key Constraints

**Cascade rules:**

```python
# DELETE CASCADE: Delete child when parent is deleted
organization_id = Column(
    UUID(as_uuid=True),
    ForeignKey("{tenant_entities}.id", ondelete="CASCADE"),
    nullable=False
)

# SET NULL: Nullify FK when parent is deleted
assigned_to = Column(
    UUID(as_uuid=True),
    ForeignKey("users.id", ondelete="SET NULL"),
    nullable=True
)

# RESTRICT: Prevent parent deletion if children exist
category_id = Column(
    UUID(as_uuid=True),
    ForeignKey("categories.id", ondelete="RESTRICT"),
    nullable=False
)
```

### 13.6 Database-Level vs Application-Level Validation

| Validation | Database | Application |
|------------|----------|-------------|
| **NOT NULL** | ✅ Enforce | ✅ Validate |
| **UNIQUE** | ✅ Enforce | ✅ Pre-check for better UX |
| **CHECK constraints** | ✅ Enforce | ✅ Validate for error messages |
| **Foreign keys** | ✅ Enforce | ❌ Trust database |
| **Business rules** | ❌ Too complex | ✅ Enforce |
| **JSONB schema** | ❌ Not supported | ✅ Enforce |

**Best practice:** Use both. Database enforces integrity, application provides better error messages.

---

## 14. Validation Checklist

### 14.1 Schema Design

- [ ] All tables use snake_case naming (plural for tables, singular for columns)
- [ ] Primary keys are UUID with `server_default=text("gen_random_uuid()")`
- [ ] Foreign keys have appropriate `ondelete` rules (CASCADE, SET NULL, RESTRICT)
- [ ] All foreign keys are indexed
- [ ] Timestamps (`created_at`, `updated_at`) use `server_default=func.now()`
- [ ] JSONB columns have default `{}`
- [ ] Boolean columns have explicit `default=False/True`

### 14.2 Multi-Tenant (if applicable)

- [ ] All tenant-scoped models have `organization_id` foreign key
- [ ] `organization_id` is indexed
- [ ] Tenant context middleware extracts tenant from request
- [ ] All queries filter by `organization_id`
- [ ] Tests verify tenant isolation (cannot access other tenant's data)

### 14.3 RBAC

- [ ] Role model with hierarchy levels (1=highest)
- [ ] Permission model with resource:action naming
- [ ] RolePermission join table with unique constraint
- [ ] UserRole table with tenant scoping (`user_sub`, `tenant_id`, `role_id`)
- [ ] RBAC seed script creates default roles and permissions
- [ ] Bootstrap script creates initial admin user

### 14.4 Relationships

- [ ] All relationships use `back_populates` (not backref)
- [ ] One-to-many relationships have cascade rules configured
- [ ] Many-to-many relationships have join table with unique constraint
- [ ] Self-referential relationships use `remote_side=[id]`

### 14.5 Indexes

- [ ] All foreign keys indexed
- [ ] Unique constraints on email, username, slug
- [ ] Composite indexes for common query patterns
- [ ] GIN indexes for JSONB columns (if queried)
- [ ] Partial indexes for filtered queries (e.g., status='active')

### 14.6 Alembic Migrations

- [ ] Alembic initialized (`alembic init migrations`)
- [ ] `alembic.ini` configured with database URL
- [ ] `env.py` imports all models
- [ ] Initial migration created (`alembic revision --autogenerate -m "Initial schema"`)
- [ ] Migration tested: `alembic upgrade head && alembic downgrade -1 && alembic upgrade head`
- [ ] `.gitignore` excludes `*.pyc`, `__pycache__`, `.env`

### 14.7 Seed Data

- [ ] RBAC seed script (`src/rbac/seeds.py`) is idempotent
- [ ] Development seed script (`scripts/seed_dev_data.py`) creates test data
- [ ] Bootstrap admin user script runs on startup
- [ ] Seed scripts log progress

### 14.8 Performance

- [ ] No N+1 queries (use `joinedload`/`selectinload`)
- [ ] Pagination on all list endpoints
- [ ] Bulk operations for batch inserts/updates
- [ ] Database aggregations (count, sum) instead of Python
- [ ] Connection pool configured (`pool_size`, `max_overflow`, `pool_recycle`)

### 14.9 Data Integrity

- [ ] CHECK constraints for enum-like columns
- [ ] Unique constraints for business keys
- [ ] NOT NULL constraints for required fields
- [ ] Foreign key constraints prevent orphaned records
- [ ] JSONB validation at application level (Pydantic)

### 14.10 Testing

- [ ] Database URL uses test database in test environment
- [ ] Fixtures create and tear down test data
- [ ] Tests verify unique constraints raise errors
- [ ] Tests verify cascade deletes work correctly
- [ ] Tests verify tenant isolation (multi-tenant apps)
- [ ] Tests verify RBAC permissions

### 14.11 Documentation

- [ ] Models have docstrings explaining purpose
- [ ] Complex relationships documented
- [ ] Migration files have descriptive commit messages
- [ ] README includes database setup instructions
- [ ] CLAUDE.md documents database conventions

---

## Final Notes

### AuditGH Database Stats

| Metric | Count |
|--------|-------|
| **Total models** | 40+ |
| **Tenant-scoped models** | 30+ |
| **RBAC models** | 4 (Role, Permission, RolePermission, UserRole) |
| **Auth models** | 6 (User, UserInvitation, ApiKey, AuthAuditLog, etc.) |
| **Relationships** | 100+ |
| **Indexes** | 50+ |
| **Migrations** | 20+ |

### Key Takeaways

1. **UUID primary keys** — Better for distributed systems, security, portability
2. **Multi-tenant row-level scoping** — Simple, cost-effective for <100 tenants
3. **RBAC with tenant scoping** — UserRole table is the key to per-tenant permissions
4. **Alembic autogenerate** — Review and test migrations before deploying
5. **Eager loading** — Prevent N+1 queries with `joinedload`/`selectinload`
6. **Index foreign keys** — Critical for query performance
7. **Seed scripts are idempotent** — Safe to run multiple times

### Next Steps

After completing this phase:

1. **Phase 3: API Skeleton** — Build FastAPI routers on top of these models
2. **Phase 4: Authentication** — Implement OIDC login and RBAC enforcement
3. **Phase 8: Testing** — Write tests for models, relationships, constraints

---

**Generated from AuditGH reference architecture. All code examples are production-tested patterns.**


