# SDK Client Library Plan: AI Prompt Management Service

> **Purpose:** Python SDK client package (`promptvault-client`) for consuming services to retrieve, cache, and render prompts from the Prompt Management Service. Provides both sync and async interfaces.
>
> **Phase:** 7 of 8
> **Prerequisites:** Phase 3 (API), Phase 4 (Auth)
> **Duration:** 1-2 days
> **Reference:** Zapper `backend/app/ai/prompt_loader.py`

---

## Table of Contents

1. [SDK Architecture](#1-sdk-architecture)
2. [Package Structure](#2-package-structure)
3. [Client Interface](#3-client-interface)
4. [Local Caching Strategy](#4-local-caching-strategy)
5. [Template Rendering](#5-template-rendering)
6. [Configuration](#6-configuration)
7. [Usage Examples](#7-usage-examples)
8. [Error Handling](#8-error-handling)
9. [Validation Checklist](#9-validation-checklist)

---

## 1. SDK Architecture

### Design Goals

- **Zero-config for common cases** — sensible defaults, env var configuration
- **Sync and async** — both interfaces for FastAPI and traditional Python apps
- **Local fallback** — works offline with cached/default prompts
- **Minimal dependencies** — only httpx and jinja2

### Retrieval Flow

```
SDK Client
    │
    ├── Local in-memory cache (TTL-based)
    │   └── HIT → return cached content
    │
    ├── HTTP request to Prompt Service API
    │   └── GET /api/v1/prompts/by-slug/{slug}
    │   └── SUCCESS → cache locally → return content
    │
    └── Local defaults dictionary (optional)
        └── FOUND → return default
```

---

## 2. Package Structure

```
promptvault-client/
├── src/
│   └── promptvault/
│       ├── __init__.py          # Public API exports
│       ├── client.py            # Async client (PromptVaultClient)
│       ├── sync_client.py       # Sync client (PromptVaultSyncClient)
│       ├── cache.py             # In-memory TTL cache
│       ├── renderer.py          # Jinja2 template rendering
│       ├── config.py            # Configuration from env vars
│       ├── exceptions.py        # Custom exceptions
│       └── types.py             # Type definitions
├── tests/
│   ├── test_client.py
│   ├── test_sync_client.py
│   ├── test_cache.py
│   └── test_renderer.py
├── pyproject.toml
├── README.md
└── LICENSE
```

---

## 3. Client Interface

### 3.1 Async Client

```python
# src/promptvault/client.py
import httpx
from promptvault.cache import TTLCache
from promptvault.renderer import render_template
from promptvault.config import PromptVaultConfig


class PromptVaultClient:
    """Async client for the Prompt Management Service."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        cache_ttl: int = 300,
        defaults: dict[str, str] | None = None,
        timeout: float = 10.0,
    ):
        self._config = PromptVaultConfig(
            base_url=base_url,
            api_key=api_key,
            cache_ttl=cache_ttl,
        )
        self._cache = TTLCache(default_ttl=cache_ttl)
        self._defaults = defaults or {}
        self._http = httpx.AsyncClient(
            base_url=self._config.base_url,
            headers={"X-API-Key": self._config.api_key},
            timeout=timeout,
        )

    async def get(self, slug: str) -> str | None:
        """Get prompt content by slug. Uses cache → API → defaults fallback."""
        # Local cache
        cached = self._cache.get(slug)
        if cached is not None:
            return cached

        # API call
        try:
            response = await self._http.get(f"/api/v1/prompts/by-slug/{slug}")
            if response.status_code == 200:
                content = response.json()["content"]
                self._cache.set(slug, content)
                return content
        except httpx.HTTPError:
            pass  # Fall through to defaults

        # Local defaults
        return self._defaults.get(slug)

    async def get_rendered(self, slug: str, **variables: str) -> str | None:
        """Get prompt and render Jinja2 template variables."""
        content = await self.get(slug)
        if content is None:
            return None
        return render_template(content, **variables)

    async def invalidate(self, slug: str) -> None:
        """Remove slug from local cache."""
        self._cache.delete(slug)

    async def close(self) -> None:
        """Close HTTP client."""
        await self._http.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()
```

### 3.2 Sync Client

```python
# src/promptvault/sync_client.py
import httpx
from promptvault.cache import TTLCache
from promptvault.renderer import render_template
from promptvault.config import PromptVaultConfig


class PromptVaultSyncClient:
    """Synchronous client for non-async contexts (Celery, scripts)."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        cache_ttl: int = 300,
        defaults: dict[str, str] | None = None,
        timeout: float = 10.0,
    ):
        self._config = PromptVaultConfig(
            base_url=base_url,
            api_key=api_key,
            cache_ttl=cache_ttl,
        )
        self._cache = TTLCache(default_ttl=cache_ttl)
        self._defaults = defaults or {}
        self._http = httpx.Client(
            base_url=self._config.base_url,
            headers={"X-API-Key": self._config.api_key},
            timeout=timeout,
        )

    def get(self, slug: str) -> str | None:
        """Get prompt content by slug (synchronous)."""
        cached = self._cache.get(slug)
        if cached is not None:
            return cached

        try:
            response = self._http.get(f"/api/v1/prompts/by-slug/{slug}")
            if response.status_code == 200:
                content = response.json()["content"]
                self._cache.set(slug, content)
                return content
        except httpx.HTTPError:
            pass

        return self._defaults.get(slug)

    def get_rendered(self, slug: str, **variables: str) -> str | None:
        """Get prompt and render Jinja2 variables (synchronous)."""
        content = self.get(slug)
        if content is None:
            return None
        return render_template(content, **variables)

    def close(self) -> None:
        self._http.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
```

---

## 4. Local Caching Strategy

### 4.1 In-Memory TTL Cache

```python
# src/promptvault/cache.py
import time
from threading import Lock


class TTLCache:
    """Thread-safe in-memory cache with TTL expiration."""

    def __init__(self, default_ttl: int = 300):
        self._store: dict[str, tuple[str, float]] = {}
        self._ttl = default_ttl
        self._lock = Lock()

    def get(self, key: str) -> str | None:
        with self._lock:
            if key not in self._store:
                return None
            value, expires_at = self._store[key]
            if time.monotonic() > expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: str, ttl: int | None = None) -> None:
        with self._lock:
            self._store[key] = (value, time.monotonic() + (ttl or self._ttl))

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
```

### 4.2 Cache Behavior

| Scenario | Behavior |
|----------|----------|
| Cache hit (not expired) | Return immediately |
| Cache hit (expired) | Remove entry, fetch from API |
| API success | Cache result, return |
| API failure | Fall through to defaults |
| No default | Return None |

---

## 5. Template Rendering

```python
# src/promptvault/renderer.py
from jinja2 import Environment, BaseLoader, TemplateSyntaxError

_jinja = Environment(loader=BaseLoader(), autoescape=False)


def render_template(content: str, **variables: str) -> str:
    """Render Jinja2 template variables in prompt content."""
    if not variables:
        return content
    try:
        template = _jinja.from_string(content)
        return template.render(**variables)
    except TemplateSyntaxError:
        return content  # Return raw on syntax error
```

---

## 6. Configuration

```python
# src/promptvault/config.py
import os


class PromptVaultConfig:
    """Configuration from constructor args or environment variables."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        cache_ttl: int = 300,
    ):
        self.base_url = base_url or os.getenv(
            "PROMPTVAULT_URL", "http://localhost:8000"
        )
        self.api_key = api_key or os.getenv("PROMPTVAULT_API_KEY", "")
        self.cache_ttl = cache_ttl
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMPTVAULT_URL` | `http://localhost:8000` | Prompt Service base URL |
| `PROMPTVAULT_API_KEY` | (empty) | API key for authentication |

---

## 7. Usage Examples

### 7.1 Async (FastAPI Application)

```python
from promptvault import PromptVaultClient

client = PromptVaultClient()

# Simple retrieval
system_prompt = await client.get("ai-triage-assessment")

# With template variables
prompt = await client.get_rendered(
    "ai-analysis-template",
    title="SQL Injection in Login",
    severity="critical",
    tool_source="semgrep",
)

# Use in LLM call
response = await llm.complete(system_prompt=prompt, user_message=context)
```

### 7.2 Sync (Celery Worker)

```python
from promptvault import PromptVaultSyncClient

client = PromptVaultSyncClient()

# Simple retrieval
system_prompt = client.get("ai-triage-assessment")

# With template variables
prompt = client.get_rendered(
    "writeup-poc",
    title=finding.title,
    severity=finding.severity,
)
```

### 7.3 With Local Defaults (Offline Capable)

```python
from promptvault import PromptVaultClient

DEFAULTS = {
    "system-default": "You are a helpful AI assistant.",
    "ai-analysis": "Analyze the following: {{ input }}",
}

client = PromptVaultClient(defaults=DEFAULTS)

# Falls back to DEFAULTS if API unreachable
prompt = await client.get("system-default")
```

### 7.4 Context Manager

```python
async with PromptVaultClient() as client:
    prompt = await client.get("my-prompt")
    # HTTP client automatically closed on exit
```

---

## 8. Error Handling

### 8.1 Exception Hierarchy

```python
# src/promptvault/exceptions.py

class PromptVaultError(Exception):
    """Base exception for promptvault client."""
    pass

class PromptNotFoundError(PromptVaultError):
    """Prompt slug not found in any tier."""
    pass

class ConnectionError(PromptVaultError):
    """Cannot reach the Prompt Service API."""
    pass
```

### 8.2 Resilience Patterns

| Failure | Behavior |
|---------|----------|
| API timeout | Fall through to defaults |
| API 404 | Fall through to defaults |
| API 401/403 | Log warning, fall through to defaults |
| API 500 | Fall through to defaults |
| Network unreachable | Fall through to defaults |
| No default exists | Return None |

The SDK is designed to **never raise exceptions** for retrieval operations — it always falls back gracefully. Only explicit errors (configuration issues) raise exceptions.

---

## 9. Validation Checklist

### Package

- [ ] `pip install promptvault-client` installs without errors
- [ ] Only dependencies: httpx, jinja2
- [ ] Python 3.12+ compatible
- [ ] Type hints throughout

### Async Client

- [ ] `get(slug)` returns content from API
- [ ] `get(slug)` returns cached content on second call
- [ ] `get(slug)` falls back to defaults on API failure
- [ ] `get_rendered(slug, **vars)` renders Jinja2 variables
- [ ] Context manager closes HTTP client

### Sync Client

- [ ] Same behavior as async client but synchronous
- [ ] Thread-safe cache access

### Caching

- [ ] Cache hit returns immediately (no API call)
- [ ] Expired entries removed and re-fetched
- [ ] `invalidate(slug)` clears specific entry
- [ ] Thread-safe under concurrent access

### Resilience

- [ ] API timeout does not raise exception
- [ ] Network error does not raise exception
- [ ] Returns None when slug not found anywhere
- [ ] Logs warnings for API errors (does not swallow silently)
