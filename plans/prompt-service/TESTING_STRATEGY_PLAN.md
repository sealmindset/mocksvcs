# Testing Strategy Plan: AI Prompt Management Service

> **Purpose:** Comprehensive testing strategy covering unit tests, integration tests, API tests, frontend component tests, E2E tests, and load testing for the Prompt Management Service.
>
> **Phase:** 8 of 8
> **Prerequisites:** Phase 1-7 (all implementation complete)
> **Duration:** 2-3 days
> **Reference:** Zapper `backend/tests/`, `frontend/vitest.config.ts`

---

## Table of Contents

1. [Testing Pyramid](#1-testing-pyramid)
2. [Backend Unit Tests](#2-backend-unit-tests)
3. [Backend Integration Tests](#3-backend-integration-tests)
4. [API Route Tests](#4-api-route-tests)
5. [Frontend Component Tests](#5-frontend-component-tests)
6. [E2E Tests](#6-e2e-tests)
7. [SDK Client Tests](#7-sdk-client-tests)
8. [Load Testing](#8-load-testing)
9. [Test Infrastructure](#9-test-infrastructure)
10. [Validation Checklist](#10-validation-checklist)

---

## 1. Testing Pyramid

```
         ┌────────┐
         │  E2E   │  ← 5-10 critical path tests (Playwright)
         │ Tests  │
        ┌┴────────┴┐
        │Integration│  ← 20-30 API route tests (pytest + httpx)
        │  Tests    │
       ┌┴──────────┴┐
       │  Unit Tests │  ← 50+ service/model/schema tests (pytest)
       │             │
       └─────────────┘
```

### Coverage Targets

| Layer | Coverage Target | Framework |
|-------|----------------|-----------|
| Backend services | 90%+ | pytest + pytest-asyncio |
| API routes | 85%+ | pytest + httpx TestClient |
| Frontend components | 80%+ | Vitest + React Testing Library |
| E2E flows | Critical paths | Playwright |
| SDK client | 90%+ | pytest |

---

## 2. Backend Unit Tests

### 2.1 Service Layer Tests

```python
# backend/tests/test_prompt_service.py
import pytest
from unittest.mock import AsyncMock, patch
from app.services.prompt_service import (
    get_prompt, get_prompt_with_vars, create_prompt,
    update_prompt, soft_delete_prompt, list_prompts,
    restore_version, extract_template_variables,
)


class TestGetPrompt:
    """Test three-tier fallback chain."""

    async def test_returns_from_cache(self, db_session):
        """Tier 1: Redis cache hit returns immediately."""
        with patch("app.services.prompt_service.cache_get", return_value="cached content"):
            content, source = await get_prompt(db_session, "test-slug")
            assert content == "cached content"
            assert source == "cache"

    async def test_falls_back_to_database(self, db_session, seeded_prompt):
        """Tier 2: Cache miss, DB hit — caches and returns."""
        with patch("app.services.prompt_service.cache_get", return_value=None):
            with patch("app.services.prompt_service.cache_set") as mock_cache:
                content, source = await get_prompt(db_session, seeded_prompt.slug)
                assert content == seeded_prompt.content
                assert source == "database"
                mock_cache.assert_called_once()

    async def test_falls_back_to_defaults(self, db_session):
        """Tier 3: No cache, no DB — returns hardcoded default."""
        with patch("app.services.prompt_service.cache_get", return_value=None):
            with patch("app.services.prompt_service.PROMPT_DEFAULTS", {"fallback-slug": "default content"}):
                content, source = await get_prompt(db_session, "fallback-slug")
                assert content == "default content"
                assert source == "default"

    async def test_returns_none_when_not_found(self, db_session):
        """All tiers miss — returns None."""
        with patch("app.services.prompt_service.cache_get", return_value=None):
            content, source = await get_prompt(db_session, "nonexistent")
            assert content is None
            assert source == "not_found"


class TestGetPromptWithVars:
    """Test Jinja2 template rendering."""

    async def test_renders_variables(self, db_session):
        with patch("app.services.prompt_service.get_prompt",
                   return_value=("Hello {{ name }}", "cache")):
            content, _ = await get_prompt_with_vars(db_session, "test", name="World")
            assert content == "Hello World"

    async def test_returns_raw_on_syntax_error(self, db_session):
        with patch("app.services.prompt_service.get_prompt",
                   return_value=("Hello {{ bad syntax", "cache")):
            content, _ = await get_prompt_with_vars(db_session, "test", name="World")
            assert "{{ bad syntax" in content


class TestCreatePrompt:
    """Test prompt creation with version 1."""

    async def test_creates_prompt_and_version(self, db_session):
        from app.schemas.prompt import PromptCreate
        data = PromptCreate(
            slug="test-create", title="Test", type="system",
            consumer_id="test", content="Hello"
        )
        prompt = await create_prompt(db_session, data, updated_by="tester")
        assert prompt.version == 1
        assert prompt.slug == "test-create"

    async def test_caches_on_create(self, db_session):
        with patch("app.services.prompt_service.cache_set") as mock_cache:
            from app.schemas.prompt import PromptCreate
            data = PromptCreate(
                slug="test-cache", title="Test", type="system",
                consumer_id="test", content="Hello"
            )
            await create_prompt(db_session, data)
            mock_cache.assert_called_once_with("prompt:test-cache", "Hello")


class TestUpdatePrompt:
    """Test prompt update with version increment."""

    async def test_increments_version(self, db_session, seeded_prompt):
        from app.schemas.prompt import PromptUpdate
        data = PromptUpdate(content="Updated content")
        updated = await update_prompt(db_session, seeded_prompt.id, data)
        assert updated.version == seeded_prompt.version + 1

    async def test_creates_version_snapshot(self, db_session, seeded_prompt):
        from app.schemas.prompt import PromptUpdate
        data = PromptUpdate(content="Updated")
        await update_prompt(db_session, seeded_prompt.id, data)
        versions = await get_versions(db_session, seeded_prompt.id)
        assert len(versions) == 2

    async def test_invalidates_cache(self, db_session, seeded_prompt):
        with patch("app.services.prompt_service.cache_invalidate") as mock:
            from app.schemas.prompt import PromptUpdate
            await update_prompt(db_session, seeded_prompt.id, PromptUpdate(content="New"))
            mock.assert_called_once()


class TestRestoreVersion:
    """Test version restoration."""

    async def test_restore_creates_new_version(self, db_session, seeded_prompt):
        # Update twice to create v2, v3
        from app.schemas.prompt import PromptUpdate
        await update_prompt(db_session, seeded_prompt.id, PromptUpdate(content="v2"))
        await update_prompt(db_session, seeded_prompt.id, PromptUpdate(content="v3"))

        # Restore v1
        restored = await restore_version(db_session, seeded_prompt.id, 1)
        assert restored.version == 4  # New version, not overwrite
        assert restored.content == seeded_prompt.content  # v1 content


class TestExtractTemplateVariables:
    """Test Jinja2 variable extraction."""

    def test_extracts_variables(self):
        result = extract_template_variables("Hello {{ name }}, your {{ role }} is ready")
        assert result == ["name", "role"]

    def test_deduplicates(self):
        result = extract_template_variables("{{ x }} and {{ x }}")
        assert result == ["x"]

    def test_empty_when_no_variables(self):
        result = extract_template_variables("No variables here")
        assert result == []
```

### 2.2 Model Tests

```python
# backend/tests/test_models.py

class TestPromptModel:
    def test_default_values(self):
        prompt = Prompt(slug="test", title="Test", type=PromptType.system,
                       consumer_id="test", content="Hello")
        assert prompt.version == 1
        assert prompt.is_active is True

class TestCategoryDerivation:
    def test_derives_known_category(self):
        assert derive_category("ai-triage") == "ai"
        assert derive_category("writeup-poc") == "writeup"

    def test_returns_none_for_unknown(self):
        assert derive_category("custom-prompt") is None
```

---

## 3. Backend Integration Tests

### 3.1 Database Integration

```python
# backend/tests/test_integration.py

class TestPromptServiceIntegration:
    """Tests against real PostgreSQL (Docker)."""

    async def test_full_lifecycle(self, db_session):
        """Create → Update → Restore → Soft-delete."""
        # Create
        data = PromptCreate(slug="lifecycle-test", ...)
        prompt = await create_prompt(db_session, data)
        assert prompt.version == 1

        # Update
        updated = await update_prompt(db_session, prompt.id,
                                      PromptUpdate(content="v2"))
        assert updated.version == 2

        # Restore v1
        restored = await restore_version(db_session, prompt.id, 1)
        assert restored.version == 3

        # Verify versions
        versions = await get_versions(db_session, prompt.id)
        assert len(versions) == 3

        # Soft-delete
        deleted = await soft_delete_prompt(db_session, prompt.id)
        assert deleted.is_active is False

    async def test_seed_idempotent(self, db_session):
        """Seed runs twice without duplicating."""
        await seed_prompts(db_session)
        count1 = await count_prompts(db_session)
        await seed_prompts(db_session)
        count2 = await count_prompts(db_session)
        assert count1 == count2
```

### 3.2 Cache Integration

```python
class TestCacheIntegration:
    """Tests against real Redis (Docker)."""

    async def test_cache_set_and_get(self):
        await cache_set("test-key", "test-value")
        result = await cache_get("test-key")
        assert result == "test-value"

    async def test_cache_ttl_expiration(self):
        await cache_set("ttl-key", "value", ttl=1)
        await asyncio.sleep(1.5)
        result = await cache_get("ttl-key")
        assert result is None

    async def test_cache_invalidation(self):
        await cache_set("inv-key", "value")
        await cache_invalidate("inv-key")
        result = await cache_get("inv-key")
        assert result is None
```

---

## 4. API Route Tests

```python
# backend/tests/test_routes.py
from httpx import AsyncClient

class TestPromptRoutes:
    """HTTP-level API tests."""

    async def test_create_prompt(self, client: AsyncClient, admin_headers):
        response = await client.post("/api/v1/prompts", json={
            "slug": "test-route",
            "title": "Test Route",
            "type": "system",
            "consumer_id": "test",
            "content": "Hello",
        }, headers=admin_headers)
        assert response.status_code == 201
        assert response.json()["slug"] == "test-route"
        assert response.json()["version"] == 1

    async def test_create_duplicate_slug_409(self, client, admin_headers, existing_prompt):
        response = await client.post("/api/v1/prompts", json={
            "slug": existing_prompt.slug,  # duplicate
            "title": "Dup", "type": "system",
            "consumer_id": "test", "content": "Hello",
        }, headers=admin_headers)
        assert response.status_code == 409

    async def test_list_prompts_paginated(self, client, viewer_headers):
        response = await client.get(
            "/api/v1/prompts?page=1&size=10", headers=viewer_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert data["size"] == 10

    async def test_get_by_slug(self, client, viewer_headers, existing_prompt):
        response = await client.get(
            f"/api/v1/prompts/by-slug/{existing_prompt.slug}",
            headers=viewer_headers,
        )
        assert response.status_code == 200
        assert response.json()["slug"] == existing_prompt.slug

    async def test_update_increments_version(self, client, editor_headers, existing_prompt):
        response = await client.put(
            f"/api/v1/prompts/{existing_prompt.id}",
            json={"content": "Updated content"},
            headers=editor_headers,
        )
        assert response.status_code == 200
        assert response.json()["version"] == existing_prompt.version + 1

    async def test_soft_delete(self, client, admin_headers, existing_prompt):
        response = await client.delete(
            f"/api/v1/prompts/{existing_prompt.id}",
            headers=admin_headers,
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False

    async def test_viewer_cannot_create(self, client, viewer_headers):
        response = await client.post("/api/v1/prompts", json={
            "slug": "forbidden", "title": "X", "type": "system",
            "consumer_id": "test", "content": "X",
        }, headers=viewer_headers)
        assert response.status_code == 403

    async def test_version_history(self, client, viewer_headers, prompt_with_versions):
        response = await client.get(
            f"/api/v1/prompts/{prompt_with_versions.id}/versions",
            headers=viewer_headers,
        )
        assert response.status_code == 200
        versions = response.json()
        assert len(versions) >= 2
        assert versions[0]["version"] > versions[1]["version"]  # Newest first

    async def test_restore_version(self, client, admin_headers, prompt_with_versions):
        response = await client.post(
            f"/api/v1/prompts/{prompt_with_versions.id}/restore",
            json={"version": 1},
            headers=admin_headers,
        )
        assert response.status_code == 200
        # Restore creates a NEW version
        assert response.json()["version"] > prompt_with_versions.version

    async def test_render_template(self, client, viewer_headers):
        # Create a template prompt first
        # Then render it
        response = await client.post(
            "/api/v1/prompts/by-slug/test-template/render",
            json={"variables": {"name": "World"}},
            headers=viewer_headers,
        )
        assert response.status_code == 200
        assert "World" in response.json()["rendered_content"]

    async def test_health_check_no_auth(self, client):
        response = await client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
```

---

## 5. Frontend Component Tests

### 5.1 Framework Setup

```typescript
// frontend/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

### 5.2 Component Test Examples

```typescript
// frontend/src/components/prompts/__tests__/prompt-list.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { PromptList } from "../prompt-list";

describe("PromptList", () => {
  it("renders search input", () => {
    render(<PromptList selectedId={null} onSelect={vi.fn()} ... />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it("filters prompts by search term", async () => {
    render(<PromptList ... />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "triage" },
    });
    // Assert filtered results
  });

  it("highlights selected prompt", () => {
    render(<PromptList selectedId="123" ... />);
    // Assert selected item has accent background
  });
});
```

```typescript
// frontend/src/components/prompts/__tests__/prompt-editor.test.tsx
describe("PromptEditor", () => {
  it("displays prompt content in textarea", () => { ... });
  it("shows metadata bar with slug, type, version", () => { ... });
  it("extracts and displays template variables", () => { ... });
  it("calls update mutation on save", () => { ... });
  it("shows empty state when no prompt selected", () => { ... });
});
```

```typescript
// frontend/src/components/prompts/__tests__/version-diff.test.tsx
describe("VersionDiff", () => {
  it("renders additions in green", () => { ... });
  it("renders removals in red", () => { ... });
  it("shows version comparison header", () => { ... });
});
```

---

## 6. E2E Tests

### 6.1 Playwright Setup

```typescript
// frontend/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev",
    port: 3000,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
});
```

### 6.2 Critical Path Tests

```typescript
// frontend/e2e/prompt-management.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Prompt Management", () => {
  test("create, edit, and view version history", async ({ page }) => {
    await page.goto("/prompts");

    // Create new prompt
    await page.click("text=New Prompt");
    await page.fill('input[name="slug"]', "e2e-test-prompt");
    await page.fill('input[name="title"]', "E2E Test Prompt");
    await page.fill('textarea[name="content"]', "Hello {{ name }}");
    await page.click("text=Create");

    // Verify in list
    await expect(page.locator("text=E2E Test Prompt")).toBeVisible();

    // Edit content
    await page.click("text=E2E Test Prompt");
    await page.fill("textarea", "Updated content {{ name }}");
    await page.click("text=Save");

    // Verify version incremented
    await expect(page.locator("text=v2")).toBeVisible();

    // Check version history
    await expect(page.locator("text=Version History")).toBeVisible();
    await expect(page.locator("text=v1")).toBeVisible();
    await expect(page.locator("text=v2")).toBeVisible();
  });

  test("restore a previous version", async ({ page }) => {
    await page.goto("/prompts");
    // ... select prompt with multiple versions
    // Click restore on v1
    await page.click("text=Restore");
    await page.click("text=Confirm");
    // Verify new version created
  });

  test("search and filter prompts", async ({ page }) => {
    await page.goto("/prompts");
    await page.fill('input[placeholder*="Search"]', "triage");
    // Verify filtered results
  });
});
```

---

## 7. SDK Client Tests

```python
# promptvault-client/tests/test_client.py
import pytest
from unittest.mock import patch, AsyncMock
from promptvault import PromptVaultClient


class TestPromptVaultClient:
    async def test_get_from_api(self):
        with patch("httpx.AsyncClient.get") as mock:
            mock.return_value = MockResponse(200, {"content": "Hello"})
            async with PromptVaultClient() as client:
                result = await client.get("test-slug")
                assert result == "Hello"

    async def test_get_from_cache_on_second_call(self):
        async with PromptVaultClient() as client:
            with patch("httpx.AsyncClient.get") as mock:
                mock.return_value = MockResponse(200, {"content": "Hello"})
                await client.get("test-slug")  # Populates cache
                mock.reset_mock()
                result = await client.get("test-slug")  # Cache hit
                assert result == "Hello"
                mock.assert_not_called()

    async def test_falls_back_to_defaults(self):
        client = PromptVaultClient(defaults={"fallback": "default value"})
        with patch("httpx.AsyncClient.get", side_effect=Exception("Network error")):
            result = await client.get("fallback")
            assert result == "default value"

    async def test_renders_template_variables(self):
        with patch("httpx.AsyncClient.get") as mock:
            mock.return_value = MockResponse(200, {"content": "Hello {{ name }}"})
            async with PromptVaultClient() as client:
                result = await client.get_rendered("test", name="World")
                assert result == "Hello World"
```

---

## 8. Load Testing

### 8.1 Prompt Retrieval Under Load

```python
# backend/tests/load/test_load.py
"""Run with: locust -f test_load.py --host=http://localhost:8000"""
from locust import HttpUser, task, between


class PromptUser(HttpUser):
    wait_time = between(0.1, 0.5)
    headers = {"X-API-Key": "pv_test_key"}

    @task(10)
    def get_prompt_by_slug(self):
        """Most common operation — slug lookup."""
        self.client.get(
            "/api/v1/prompts/by-slug/system-default",
            headers=self.headers,
        )

    @task(3)
    def list_prompts(self):
        """List with pagination."""
        self.client.get(
            "/api/v1/prompts?page=1&size=50",
            headers=self.headers,
        )

    @task(1)
    def render_template(self):
        """Template rendering."""
        self.client.post(
            "/api/v1/prompts/by-slug/system-default/render",
            json={"variables": {"name": "test"}},
            headers=self.headers,
        )
```

### 8.2 Performance Targets

| Scenario | Concurrent Users | Target p95 | Target p99 |
|----------|-----------------|------------|------------|
| Slug lookup (cache hit) | 100 | < 10ms | < 25ms |
| Slug lookup (cache miss) | 100 | < 50ms | < 100ms |
| List prompts (50 items) | 50 | < 100ms | < 200ms |
| Template rendering | 50 | < 50ms | < 100ms |

---

## 9. Test Infrastructure

### 9.1 pytest Conftest

```python
# backend/tests/conftest.py
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.database import get_db
from app.models.base import Base

TEST_DATABASE_URL = "postgresql+asyncpg://prompt:prompt_dev@localhost:5436/prompt_service_test"


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession)
    async with session_factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session):
    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_headers():
    return {"X-API-Key": "pv_admin_test_key"}


@pytest.fixture
def viewer_headers():
    return {"X-API-Key": "pv_viewer_test_key"}
```

### 9.2 CI Pipeline

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: prompt
          POSTGRES_PASSWORD: prompt_dev
          POSTGRES_DB: prompt_service_test
        ports: ["5432:5432"]
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r backend/requirements.txt -r backend/requirements-dev.txt
      - run: cd backend && pytest --cov=app --cov-report=xml
        env:
          DATABASE_URL: postgresql+asyncpg://prompt:prompt_dev@localhost:5432/prompt_service_test
          REDIS_URL: redis://localhost:6379/0
          AUTH_DISABLED: true

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: cd frontend && npm ci && npm test
```

---

## 10. Validation Checklist

### Backend Tests

- [ ] All service layer tests pass
- [ ] All model tests pass
- [ ] Schema validation tests pass
- [ ] Cache integration tests pass
- [ ] Seed idempotency test passes

### API Route Tests

- [ ] All CRUD operations tested
- [ ] All version history operations tested
- [ ] Template rendering tested
- [ ] Auth/RBAC tested (admin, editor, viewer, unauthenticated)
- [ ] Error cases tested (404, 409, 403, 422)
- [ ] Pagination tested

### Frontend Tests

- [ ] All components render without errors
- [ ] Search/filter functionality tested
- [ ] Editor save and mutation tested
- [ ] Version history rendering tested
- [ ] Version diff rendering tested

### E2E Tests

- [ ] Create → edit → view history flow passes
- [ ] Version restore flow passes
- [ ] Search and filter flow passes

### Coverage

- [ ] Backend coverage > 80%
- [ ] Frontend coverage > 70%
- [ ] CI pipeline green on all tests
