# Database Design Plan: AI Prompt Management Service

> **Purpose:** PostgreSQL schema design, SQLAlchemy models, Alembic migrations, and seed data for the Prompt Management Service. Based on Zapper's Prompt/PromptVersion models with enhancements for standalone operation.
>
> **Phase:** 2 of 8
> **Prerequisites:** Phase 1 (Project Bootstrap)
> **Duration:** 1-2 days
> **Reference:** Zapper `backend/app/models/base.py` lines 996-1059

---

## Table of Contents

1. [Entity Relationship Diagram](#1-entity-relationship-diagram)
2. [Table Definitions](#2-table-definitions)
3. [SQLAlchemy Models](#3-sqlalchemy-models)
4. [Enums and Constants](#4-enums-and-constants)
5. [Indexes and Constraints](#5-indexes-and-constraints)
6. [Alembic Migration](#6-alembic-migration)
7. [Seed Data Strategy](#7-seed-data-strategy)
8. [Validation Checklist](#8-validation-checklist)

---

## 1. Entity Relationship Diagram

```
┌─────────────────────┐         ┌──────────────────────────┐
│      prompts        │         │    prompt_versions       │
├─────────────────────┤         ├──────────────────────────┤
│ id (PK, UUID)       │────┐    │ id (PK, UUID)            │
│ api_id (BIGINT, UQ) │    │    │ api_id (BIGINT, UQ)      │
│ slug (VARCHAR, UQ)  │    └───<│ prompt_id (FK, UUID, IDX) │
│ title (VARCHAR)     │         │ version (INT)            │
│ type (ENUM)         │         │ title (VARCHAR)          │
│ consumer_id (VARCHAR)│        │ type (ENUM)              │
│ content (TEXT)      │         │ consumer_id (VARCHAR)    │
│ description (TEXT)  │         │ content (TEXT)           │
│ version (INT)       │         │ description (TEXT)       │
│ is_active (BOOL)    │         │ updated_by (VARCHAR)     │
│ updated_by (VARCHAR)│         │ created_at (TIMESTAMPTZ) │
│ created_at (TSTZ)   │         └──────────────────────────┘
│ updated_at (TSTZ)   │         UQ(prompt_id, version)
└─────────────────────┘

┌─────────────────────┐         ┌──────────────────────────┐
│      api_keys       │         │      audit_logs          │
├─────────────────────┤         ├──────────────────────────┤
│ id (PK, UUID)       │         │ id (PK, UUID)            │
│ name (VARCHAR, UQ)  │         │ api_id (BIGINT, UQ)      │
│ key_hash (VARCHAR)  │         │ action (VARCHAR, IDX)    │
│ role (ENUM)         │         │ resource_type (VARCHAR)  │
│ is_active (BOOL)    │         │ resource_id (UUID, IDX)  │
│ last_used_at (TSTZ) │         │ user_id (VARCHAR, IDX)   │
│ expires_at (TSTZ)   │         │ changes (JSONB)          │
│ created_at (TSTZ)   │         │ created_at (TIMESTAMPTZ) │
│ updated_at (TSTZ)   │         └──────────────────────────┘
└─────────────────────┘
```

---

## 2. Table Definitions

### 2.1 `prompts` — Core Prompt Storage

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default gen_random_uuid() | Primary key |
| `api_id` | BIGINT | NOT NULL, UNIQUE, GENERATED ALWAYS AS IDENTITY | Sequential ID for pagination |
| `slug` | VARCHAR(100) | NOT NULL, UNIQUE | Immutable identifier (e.g., `ai-triage-assessment`) |
| `title` | VARCHAR(255) | NOT NULL | Human-readable display name |
| `type` | prompt_type ENUM | NOT NULL | One of: system, instruction, tooling, template |
| `consumer_id` | VARCHAR(100) | NOT NULL | Identifier of consuming service/agent |
| `content` | TEXT | NOT NULL | Full prompt content (may include `{{ var }}` Jinja2 placeholders) |
| `description` | TEXT | NULL | Optional description of the prompt's purpose |
| `version` | INTEGER | NOT NULL, DEFAULT 1 | Current version number |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT TRUE | Soft-delete flag |
| `updated_by` | VARCHAR(100) | NULL | Email or API key name of last editor |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation time |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last modification time |

### 2.2 `prompt_versions` — Immutable Version History

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default gen_random_uuid() | Primary key |
| `api_id` | BIGINT | NOT NULL, UNIQUE, GENERATED ALWAYS AS IDENTITY | Sequential ID |
| `prompt_id` | UUID | NOT NULL, FK → prompts.id ON DELETE CASCADE | Parent prompt |
| `version` | INTEGER | NOT NULL | Version number (immutable snapshot) |
| `title` | VARCHAR(255) | NOT NULL | Title at this version |
| `type` | prompt_type ENUM | NOT NULL | Type at this version |
| `consumer_id` | VARCHAR(100) | NOT NULL | Consumer at this version |
| `content` | TEXT | NOT NULL | Content snapshot at this version |
| `description` | TEXT | NULL | Description at this version |
| `updated_by` | VARCHAR(100) | NULL | Who created this version |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Version creation time |

**Unique constraint:** `(prompt_id, version)`

### 2.3 `api_keys` — Service Authentication

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default gen_random_uuid() | Primary key |
| `name` | VARCHAR(100) | NOT NULL, UNIQUE | Human-readable key name |
| `key_hash` | VARCHAR(64) | NOT NULL | SHA-256 hash of API key |
| `role` | api_role ENUM | NOT NULL, DEFAULT 'viewer' | Permission level |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT TRUE | Whether key is active |
| `last_used_at` | TIMESTAMPTZ | NULL | Last successful authentication |
| `expires_at` | TIMESTAMPTZ | NULL | Optional expiration |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Key creation time |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last modification |

### 2.4 `audit_logs` — Change History

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default gen_random_uuid() | Primary key |
| `api_id` | BIGINT | NOT NULL, UNIQUE, GENERATED ALWAYS AS IDENTITY | Sequential ID for pagination |
| `action` | VARCHAR(50) | NOT NULL | Action type (e.g., `prompt.created`, `prompt.updated`) |
| `resource_type` | VARCHAR(50) | NOT NULL | Entity type (`prompt`, `api_key`) |
| `resource_id` | UUID | NOT NULL | Entity ID |
| `user_id` | VARCHAR(100) | NOT NULL | Actor (email or API key name) |
| `changes` | JSONB | NULL | Before/after diff |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Event time |

---

## 3. SQLAlchemy Models

### 3.1 Base Model

```python
# backend/app/models/base.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import BigInteger, Boolean, DateTime, Identity, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
```

### 3.2 Prompt Model

```python
# backend/app/models/prompt.py
import enum
from sqlalchemy import Enum, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship


class PromptType(str, enum.Enum):
    system = "system"
    instruction = "instruction"
    tooling = "tooling"
    template = "template"


class Prompt(TimestampMixin, Base):
    __tablename__ = "prompts"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    api_id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), unique=True, nullable=False
    )
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[PromptType] = mapped_column(
        Enum(PromptType, name="prompt_type"), nullable=False
    )
    consumer_id: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Relationships
    versions: Mapped[list["PromptVersion"]] = relationship(
        back_populates="prompt", cascade="all, delete-orphan",
        order_by="PromptVersion.version.desc()"
    )
```

### 3.3 PromptVersion Model

```python
class PromptVersion(Base):
    __tablename__ = "prompt_versions"
    __table_args__ = (
        UniqueConstraint("prompt_id", "version", name="uq_prompt_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    api_id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), unique=True, nullable=False
    )
    prompt_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("prompts.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[PromptType] = mapped_column(
        Enum(PromptType, name="prompt_type", create_type=False), nullable=False
    )
    consumer_id: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    prompt: Mapped["Prompt"] = relationship(back_populates="versions")
```

### 3.4 ApiKey Model

```python
class ApiRole(str, enum.Enum):
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


class ApiKey(TimestampMixin, Base):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[ApiRole] = mapped_column(
        Enum(ApiRole, name="api_role"), nullable=False, default=ApiRole.viewer
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
```

### 3.5 AuditLog Model

```python
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    api_id: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), unique=True, nullable=False
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    changes: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
```

---

## 4. Enums and Constants

### 4.1 PromptType Enum

| Value | Purpose | Example |
|-------|---------|---------|
| `system` | System-level prompts (LLM system messages) | AI agent system instructions |
| `instruction` | User-facing instructions embedded in prompts | Step-by-step analysis instructions |
| `tooling` | Tool-use and function-calling prompts | Tool selection guidance |
| `template` | Parameterized templates with `{{ variables }}` | Finding write-up templates |

### 4.2 ApiRole Enum

| Value | Permissions |
|-------|------------|
| `admin` | Full CRUD on prompts, manage API keys, view audit logs |
| `editor` | Create and update prompts, view versions |
| `viewer` | Read-only access to prompts (typical for consuming services) |

### 4.3 Audit Actions

| Action | Trigger |
|--------|---------|
| `prompt.created` | New prompt created |
| `prompt.updated` | Prompt content/metadata updated |
| `prompt.deactivated` | Prompt soft-deleted |
| `prompt.reactivated` | Prompt restored to active |
| `prompt.restored` | Historical version restored |
| `api_key.created` | New API key generated |
| `api_key.revoked` | API key deactivated |

### 4.4 Category Derivation

```python
# backend/app/constants.py
PROMPT_CATEGORIES = ["ai", "system", "template", "report", "writeup", "tool"]

def derive_category(slug: str) -> str | None:
    """Extract category from slug prefix."""
    prefix = slug.split("-", 1)[0]
    return prefix if prefix in PROMPT_CATEGORIES else None
```

---

## 5. Indexes and Constraints

### 5.1 Primary Keys

| Table | Column | Type |
|-------|--------|------|
| prompts | id | UUID |
| prompt_versions | id | UUID |
| api_keys | id | UUID |
| audit_logs | id | UUID |

### 5.2 Unique Constraints

| Table | Column(s) | Name |
|-------|-----------|------|
| prompts | slug | uq_prompts_slug |
| prompts | api_id | uq_prompts_api_id |
| prompt_versions | (prompt_id, version) | uq_prompt_version |
| prompt_versions | api_id | uq_prompt_versions_api_id |
| api_keys | name | uq_api_keys_name |
| audit_logs | api_id | uq_audit_logs_api_id |

### 5.3 Indexes

| Table | Column(s) | Purpose |
|-------|-----------|---------|
| prompt_versions | prompt_id | Fast version lookups |
| audit_logs | action | Filter by action type |
| audit_logs | resource_id | Filter by resource |
| audit_logs | user_id | Filter by actor |
| audit_logs | created_at | Time-range queries |

### 5.4 Foreign Keys

| Child Table | Column | Parent Table | On Delete |
|------------|--------|-------------|-----------|
| prompt_versions | prompt_id | prompts.id | CASCADE |

---

## 6. Alembic Migration

### 6.1 Initial Migration Structure

```python
# backend/alembic/versions/001_initial_schema.py
"""Initial schema for prompt management service.

Revision ID: 001
Create Date: 2026-02-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "001"
down_revision = None


def upgrade() -> None:
    # Create enum types
    prompt_type = sa.Enum("system", "instruction", "tooling", "template",
                          name="prompt_type")
    api_role = sa.Enum("admin", "editor", "viewer", name="api_role")

    # prompts table
    op.create_table(
        "prompts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("api_id", sa.BigInteger, sa.Identity(always=True),
                  unique=True, nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("type", prompt_type, nullable=False),
        sa.Column("consumer_id", sa.String(100), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("updated_by", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
    )

    # prompt_versions table
    op.create_table(
        "prompt_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("api_id", sa.BigInteger, sa.Identity(always=True),
                  unique=True, nullable=False),
        sa.Column("prompt_id", UUID(as_uuid=True),
                  sa.ForeignKey("prompts.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("type", prompt_type, nullable=False),
        sa.Column("consumer_id", sa.String(100), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("updated_by", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
        sa.UniqueConstraint("prompt_id", "version", name="uq_prompt_version"),
    )

    # api_keys table
    op.create_table(
        "api_keys",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), unique=True, nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("role", api_role, nullable=False, server_default="viewer"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
    )

    # audit_logs table
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("api_id", sa.BigInteger, sa.Identity(always=True),
                  unique=True, nullable=False),
        sa.Column("action", sa.String(50), nullable=False, index=True),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("user_id", sa.String(100), nullable=False, index=True),
        sa.Column("changes", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("NOW()"), nullable=False),
    )

    # Additional index for time-range queries
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("api_keys")
    op.drop_table("prompt_versions")
    op.drop_table("prompts")
    op.execute("DROP TYPE IF EXISTS prompt_type")
    op.execute("DROP TYPE IF EXISTS api_role")
```

---

## 7. Seed Data Strategy

### 7.1 Seed Function (Application Startup)

```python
# backend/app/seed.py
async def seed_prompts(db: AsyncSession) -> None:
    """Idempotent seed: only creates prompts not already in DB."""
    from app.defaults import PROMPT_DEFAULTS, PROMPT_METADATA

    result = await db.execute(select(Prompt.slug))
    existing_slugs = {row[0] for row in result.all()}

    for slug, content in PROMPT_DEFAULTS.items():
        if slug in existing_slugs:
            continue

        meta = PROMPT_METADATA.get(slug, {})
        prompt = Prompt(
            slug=slug,
            title=meta.get("title", slug.replace("-", " ").title()),
            type=PromptType(meta.get("type", "template")),
            consumer_id=meta.get("consumer_id", "default"),
            content=content,
            description=meta.get("description"),
            version=1,
            updated_by="system-seed",
        )
        db.add(prompt)
        await db.flush()

        version = PromptVersion(
            prompt_id=prompt.id,
            version=1,
            title=prompt.title,
            type=prompt.type,
            consumer_id=prompt.consumer_id,
            content=prompt.content,
            description=prompt.description,
            updated_by="system-seed",
        )
        db.add(version)

    await db.commit()
```

### 7.2 Defaults Dictionary Structure

```python
# backend/app/defaults.py
PROMPT_DEFAULTS: dict[str, str] = {
    "system-default": "You are a helpful AI assistant.",
    # Project-specific prompts go here
}

PROMPT_METADATA: dict[str, dict] = {
    "system-default": {
        "title": "Default System Prompt",
        "type": "system",
        "consumer_id": "default",
        "description": "Fallback system prompt for general use",
    },
    # Project-specific metadata goes here
}
```

### 7.3 Seed Behavior

- **Idempotent:** Only creates prompts whose slug does not exist in DB
- **Safe to re-run:** Application startup calls seed every time
- **Does not overwrite:** If a prompt has been edited via UI/API, the seed will not revert it
- **Version tracking:** Creates PromptVersion v1 for each seeded prompt

---

## 8. Validation Checklist

### Schema Verification

- [ ] All tables created successfully via `alembic upgrade head`
- [ ] Enum types `prompt_type` and `api_role` exist in PostgreSQL
- [ ] UUID generation works (`gen_random_uuid()`)
- [ ] Identity columns auto-increment correctly
- [ ] Foreign key cascade deletes work (delete prompt → versions deleted)
- [ ] Unique constraint on `(prompt_id, version)` prevents duplicate versions

### Data Integrity

- [ ] Seed function populates default prompts on first run
- [ ] Seed function is idempotent on subsequent runs
- [ ] `updated_at` automatically updates on row modification
- [ ] Soft-delete (`is_active=false`) preserves data and versions
- [ ] JSONB `changes` column accepts arbitrary JSON

### Performance

- [ ] Index scan used for `prompt_versions` by `prompt_id` (EXPLAIN ANALYZE)
- [ ] Index scan used for `audit_logs` by `action`, `resource_id`, `user_id`
- [ ] Sequential scan only on small tables (api_keys)
- [ ] `api_id` Identity columns suitable for cursor-based pagination
