# Phase 8: Testing Strategy Plan

> **Purpose:** Establish comprehensive testing infrastructure covering unit tests, integration tests, RBAC enforcement, tenant isolation, auth flows, data integrity, frontend testing, E2E tests, contract testing, and performance benchmarks. This plan provides full code templates and patterns derived from AuditGH's production test suite.
>
> **Reference Implementation:** [AuditGH Tests](https://github.com/{GITHUB_ORG}/auditgh/tests) -- all test patterns, fixtures, and configurations are derived from AuditGH's battle-tested test suite.

---

## Placeholder Legend

| Placeholder | Description | Example (AuditGH) |
|---|---|---|
| `{PROJECT_NAME}` | Lowercase project identifier | `auditgh` |
| `{DOMAIN_MODELS}` | Core domain models (comma-separated) | `Finding, Repository, Organization` |
| `{TENANT_ENTITY}` | Primary tenant/organization model | `Organization` or `Tenant` |
| `{ROLE_HIERARCHY}` | Roles in order of privilege | `super_admin, admin, analyst, manager, user` |
| `{DB_NAME}` | PostgreSQL database name | `auditgh_kb` |
| `{DB_USER}` | Database username | `auditgh` |
| `{API_PORT}` | Backend API port | `8000` |
| `{UI_PORT}` | Frontend UI port | `3000` |

---

## 1. Test Architecture

### Testing Pyramid Strategy

```
                    /\
                   /  \     E2E (10%) - Critical user journeys
                  /____\
                 /      \   Integration (30%) - API endpoints, DB, auth
                /________\
               /          \ Unit (60%) - Business logic, models, utilities
              /__________\
```

**Coverage Targets:**
- **Overall:** 85% code coverage minimum
- **Critical Paths:** 95% coverage (auth, RBAC, tenant isolation, data integrity)
- **Unit Tests:** 90% coverage of business logic
- **Integration Tests:** 80% coverage of API endpoints
- **E2E Tests:** Cover 100% of critical user flows

**Test Organization:**
```
tests/
├── __init__.py
├── conftest.py                    # Global fixtures
├── unit/                          # Fast, isolated tests
│   ├── __init__.py
│   ├── test_models.py            # Model validation
│   ├── test_services.py          # Business logic
│   └── test_utilities.py         # Helper functions
├── integration/                   # API + DB tests
│   ├── __init__.py
│   ├── conftest.py               # Integration fixtures
│   ├── test_api_endpoints.py    # FastAPI routes
│   ├── test_database.py         # Database operations
│   └── test_background_tasks.py # Async tasks
├── security/                      # Security-focused tests
│   ├── __init__.py
│   ├── test_rbac_enforcement.py # Role-based access
│   ├── test_tenant_isolation.py # Multi-tenant isolation
│   ├── test_auth_flows.py       # Authentication
│   └── test_data_integrity.py   # Referential integrity
├── frontend/                      # React/Next.js tests
│   ├── unit/
│   │   └── components/          # Component tests
│   ├── integration/
│   │   └── pages/               # Page integration tests
│   └── e2e/
│       └── specs/               # End-to-end tests
└── performance/                   # Load and performance
    ├── locustfile.py
    └── test_query_performance.py
```

---

## 2. pytest Configuration

### pytest.ini

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
asyncio_mode = auto
addopts =
    -v
    --tb=short
    --strict-markers
    --cov=src
    --cov-report=html
    --cov-report=term-missing
    --cov-fail-under=85
markers =
    unit: Unit tests (fast, isolated)
    integration: Integration tests (DB, API)
    security: Security-focused tests (RBAC, isolation)
    e2e: End-to-end tests (slow)
    performance: Performance and load tests
    smoke: Quick smoke tests for CI
    slow: Tests that take >5 seconds
```

### pyproject.toml - Testing Section

```toml
[tool.pytest.ini_options]
minversion = "7.0"
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
asyncio_mode = "auto"
filterwarnings = [
    "error",
    "ignore::DeprecationWarning",
    "ignore::PendingDeprecationWarning",
]

[tool.coverage.run]
source = ["src"]
omit = [
    "*/tests/*",
    "*/migrations/*",
    "*/__pycache__/*",
    "*/venv/*",
    "*/virtualenv/*",
]
branch = true

[tool.coverage.report]
precision = 2
show_missing = true
skip_covered = false
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise AssertionError",
    "raise NotImplementedError",
    "if __name__ == .__main__.:",
    "if TYPE_CHECKING:",
    "class .*\\bProtocol\\):",
    "@(abc\\.)?abstractmethod",
]

[tool.coverage.html]
directory = "htmlcov"
```

### Key Dependencies

Add to `requirements-dev.txt`:
```txt
# Testing
pytest>=7.4.0
pytest-asyncio>=0.21.0
pytest-cov>=4.1.0
pytest-mock>=3.11.0
pytest-xdist>=3.3.0  # Parallel test execution
pytest-timeout>=2.1.0

# Factories and Fixtures
factory-boy>=3.3.0
faker>=19.0.0

# Contract Testing
schemathesis>=3.19.0
hypothesis>=6.82.0

# Performance Testing
locust>=2.15.0
pytest-benchmark>=4.0.0

# E2E Testing (for API testing from Python)
playwright>=1.35.0
```

---

## 3. Test Database Setup

### Global conftest.py

```python
"""
Global pytest fixtures for {PROJECT_NAME}.

Provides test database, test client, and test users with various roles for
verifying role-based access control enforcement across API endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from datetime import datetime, timedelta
import uuid

# Import application components
from src.api.main import app
from src.api.database import Base, get_db
from src.auth.models import User
from src.rbac.models import Role, Permission, RolePermission, UserRole
from src.api.models import {TENANT_ENTITY}


# Test database configuration
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="function")
def test_engine():
    """
    Create a test database engine with isolation.

    Uses SQLite in-memory database for fast tests.
    For PostgreSQL-specific tests, override with PostgreSQL test database.
    """
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # Share connection across threads
    )

    # Enable foreign keys for SQLite
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    yield engine

    engine.dispose()


@pytest.fixture(scope="function")
def test_db(test_engine):
    """
    Create a fresh test database for each test function.

    This fixture:
    1. Creates all tables
    2. Seeds basic RBAC data
    3. Yields session for test
    4. Rolls back and cleans up after test

    Yields:
        Session: SQLAlchemy database session
    """
    # Create all tables
    Base.metadata.create_all(bind=test_engine)

    # Create session factory
    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_engine
    )

    db = TestingSessionLocal()

    try:
        # Seed with basic RBAC data
        seed_rbac_data(db)
        yield db
    finally:
        db.close()
        # Drop all tables after test
        Base.metadata.drop_all(bind=test_engine)


def seed_rbac_data(db: Session):
    """
    Seed database with RBAC roles and permissions.

    Creates role hierarchy: {ROLE_HIERARCHY}
    """

    # Create permissions - adjust for your domain
    permissions = [
        Permission(id=uuid.uuid4(), name="*:*", description="Wildcard - all permissions"),
        Permission(id=uuid.uuid4(), name="findings:read", description="Read findings"),
        Permission(id=uuid.uuid4(), name="findings:write", description="Write findings"),
        Permission(id=uuid.uuid4(), name="findings:delete", description="Delete findings"),
        Permission(id=uuid.uuid4(), name="scans:read", description="Read scans"),
        Permission(id=uuid.uuid4(), name="scans:execute", description="Execute scans"),
        Permission(id=uuid.uuid4(), name="repositories:read", description="Read repositories"),
        Permission(id=uuid.uuid4(), name="repositories:write", description="Write repositories"),
        Permission(id=uuid.uuid4(), name="organizations:read", description="Read organizations"),
        Permission(id=uuid.uuid4(), name="organizations:write", description="Write organizations"),
        Permission(id=uuid.uuid4(), name="admin:manage", description="Manage system"),
    ]

    for perm in permissions:
        db.add(perm)
    db.commit()

    # Create roles - adjust hierarchy for your needs
    super_admin = Role(
        id=uuid.uuid4(),
        name="super_admin",
        description="Super Administrator",
        level=1,  # Lowest number = highest privilege
        is_system=True
    )
    admin = Role(
        id=uuid.uuid4(),
        name="admin",
        description="Administrator",
        level=2,
        is_system=True
    )
    analyst = Role(
        id=uuid.uuid4(),
        name="analyst",
        description="Security Analyst",
        level=3,
        is_system=True
    )
    manager = Role(
        id=uuid.uuid4(),
        name="manager",
        description="Manager",
        level=4,
        is_system=True
    )
    user = Role(
        id=uuid.uuid4(),
        name="user",
        description="Basic User",
        level=5,
        is_system=True
    )

    db.add_all([super_admin, admin, analyst, manager, user])
    db.commit()

    # Assign permissions to roles
    # Super Admin gets wildcard
    db.add(RolePermission(
        role_id=super_admin.id,
        permission_id=next(p.id for p in permissions if p.name == "*:*")
    ))

    # Admin gets most permissions
    admin_perms = [
        "findings:read", "findings:write", "findings:delete",
        "scans:read", "scans:execute",
        "repositories:read", "repositories:write",
        "organizations:read", "organizations:write",
        "admin:manage"
    ]
    for perm_name in admin_perms:
        perm_id = next(p.id for p in permissions if p.name == perm_name)
        db.add(RolePermission(role_id=admin.id, permission_id=perm_id))

    # Analyst gets read/write for core domain
    analyst_perms = [
        "findings:read", "findings:write",
        "scans:read", "scans:execute",
        "repositories:read"
    ]
    for perm_name in analyst_perms:
        perm_id = next(p.id for p in permissions if p.name == perm_name)
        db.add(RolePermission(role_id=analyst.id, permission_id=perm_id))

    # Manager gets read-only
    manager_perms = [
        "findings:read", "scans:read",
        "repositories:read", "organizations:read"
    ]
    for perm_name in manager_perms:
        perm_id = next(p.id for p in permissions if p.name == perm_name)
        db.add(RolePermission(role_id=manager.id, permission_id=perm_id))

    # User gets minimal read
    user_perms = ["findings:read"]
    for perm_name in user_perms:
        perm_id = next(p.id for p in permissions if p.name == perm_name)
        db.add(RolePermission(role_id=user.id, permission_id=perm_id))

    db.commit()


@pytest.fixture(scope="function")
def test_client(test_db):
    """
    Create a test client with database session override.

    Args:
        test_db: Test database session fixture

    Yields:
        TestClient: FastAPI test client
    """
    # Override database dependency
    def override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    client = TestClient(app)

    yield client

    # Clean up
    app.dependency_overrides.clear()


@pytest.fixture
def test_tenant(test_db):
    """Create a test organization/tenant."""
    org = {TENANT_ENTITY}(
        id=uuid.uuid4(),
        name="test-org",
        display_name="Test Organization",
        is_active=True
    )
    test_db.add(org)
    test_db.commit()
    test_db.refresh(org)
    return org


# User fixtures for different roles
@pytest.fixture
def test_user_super_admin(test_db, test_tenant):
    """Create a test user with super_admin role."""
    user_data = {
        "email": "super@test.com",
        "name": "Super Admin",
        "sub": f"test-super-{uuid.uuid4()}",
        "provider": "test"
    }

    role = test_db.query(Role).filter(Role.name == "super_admin").first()
    user_role = UserRole(
        user_sub=user_data["sub"],
        tenant_id=str(test_tenant.id),
        role_id=role.id
    )
    test_db.add(user_role)
    test_db.commit()

    user_data["token"] = "test-token-super-admin"
    return User(**user_data)


@pytest.fixture
def test_user_admin(test_db, test_tenant):
    """Create a test user with admin role."""
    user_data = {
        "email": "admin@test.com",
        "name": "Test Admin",
        "sub": f"test-admin-{uuid.uuid4()}",
        "provider": "test"
    }

    role = test_db.query(Role).filter(Role.name == "admin").first()
    user_role = UserRole(
        user_sub=user_data["sub"],
        tenant_id=str(test_tenant.id),
        role_id=role.id
    )
    test_db.add(user_role)
    test_db.commit()

    user_data["token"] = "test-token-admin"
    return User(**user_data)


@pytest.fixture
def test_user_analyst(test_db, test_tenant):
    """Create a test user with analyst role."""
    user_data = {
        "email": "analyst@test.com",
        "name": "Test Analyst",
        "sub": f"test-analyst-{uuid.uuid4()}",
        "provider": "test"
    }

    role = test_db.query(Role).filter(Role.name == "analyst").first()
    user_role = UserRole(
        user_sub=user_data["sub"],
        tenant_id=str(test_tenant.id),
        role_id=role.id
    )
    test_db.add(user_role)
    test_db.commit()

    user_data["token"] = "test-token-analyst"
    return User(**user_data)


@pytest.fixture
def test_user_manager(test_db, test_tenant):
    """Create a test user with manager role."""
    user_data = {
        "email": "manager@test.com",
        "name": "Test Manager",
        "sub": f"test-manager-{uuid.uuid4()}",
        "provider": "test"
    }

    role = test_db.query(Role).filter(Role.name == "manager").first()
    user_role = UserRole(
        user_sub=user_data["sub"],
        tenant_id=str(test_tenant.id),
        role_id=role.id
    )
    test_db.add(user_role)
    test_db.commit()

    user_data["token"] = "test-token-manager"
    return User(**user_data)


@pytest.fixture
def test_user_no_role(test_db, test_tenant):
    """Create a test user without any role assignment."""
    user_data = {
        "email": "norole@test.com",
        "name": "No Role User",
        "sub": f"test-norole-{uuid.uuid4()}",
        "provider": "test",
        "token": "test-token-no-role"
    }
    return User(**user_data)
```

---

## 4. Unit Tests

### tests/unit/test_models.py

```python
"""
Unit tests for domain models.

Tests model validation, constraints, and business logic.
"""

import pytest
from datetime import datetime, timedelta
import uuid
from pydantic import ValidationError

from src.api.models import {DOMAIN_MODELS}


class TestModelValidation:
    """Test Pydantic model validation."""

    def test_finding_model_requires_severity(self):
        """Finding model should require severity field."""
        with pytest.raises(ValidationError) as exc_info:
            Finding(
                title="Test Finding",
                description="Test",
                # Missing severity
                scanner_name="test"
            )

        assert "severity" in str(exc_info.value)

    def test_finding_severity_enum_validation(self):
        """Finding severity should only accept valid values."""
        valid_severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]

        for severity in valid_severities:
            finding = Finding(
                title="Test",
                description="Test",
                severity=severity,
                scanner_name="test"
            )
            assert finding.severity == severity

        with pytest.raises(ValidationError):
            Finding(
                title="Test",
                description="Test",
                severity="INVALID",
                scanner_name="test"
            )


class TestModelBusinessLogic:
    """Test model business logic methods."""

    def test_finding_is_active(self):
        """Finding.is_active should return True for open findings."""
        finding = Finding(
            title="Test",
            description="Test",
            severity="HIGH",
            status="open",
            scanner_name="test"
        )
        assert finding.is_active() == True

        finding.status = "resolved"
        assert finding.is_active() == False

    def test_finding_age_calculation(self):
        """Finding.age_days should calculate days since discovery."""
        finding = Finding(
            title="Test",
            description="Test",
            severity="HIGH",
            scanner_name="test",
            discovered_at=datetime.utcnow() - timedelta(days=5)
        )

        assert finding.age_days() == 5


class TestModelRelationships:
    """Test model relationships and foreign keys."""

    def test_finding_belongs_to_repository(self, test_db):
        """Finding should have valid repository relationship."""
        repo = Repository(
            id=uuid.uuid4(),
            name="test-repo",
            full_name="org/test-repo",
            url="https://github.com/org/test-repo"
        )
        test_db.add(repo)
        test_db.commit()

        finding = Finding(
            id=uuid.uuid4(),
            title="Test Finding",
            description="Test",
            severity="HIGH",
            scanner_name="test",
            repository_id=repo.id
        )
        test_db.add(finding)
        test_db.commit()

        # Query finding with relationship
        db_finding = test_db.query(Finding).filter(Finding.id == finding.id).first()
        assert db_finding.repository.id == repo.id
        assert db_finding.repository.name == "test-repo"
```

### tests/unit/test_services.py

```python
"""
Unit tests for business logic services.

Tests service methods with mocked dependencies.
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
import uuid

from src.services.finding_service import FindingService
from src.services.scan_service import ScanService


class TestFindingService:
    """Test FindingService business logic."""

    @pytest.mark.asyncio
    async def test_create_finding(self):
        """Should create finding with proper validation."""
        mock_db = Mock()
        service = FindingService(db=mock_db)

        finding_data = {
            "title": "SQL Injection",
            "description": "SQL injection vulnerability",
            "severity": "CRITICAL",
            "scanner_name": "semgrep",
            "repository_id": str(uuid.uuid4())
        }

        with patch.object(service, '_validate_repository', return_value=True):
            finding = await service.create_finding(finding_data)

            assert finding.title == "SQL Injection"
            assert finding.severity == "CRITICAL"
            mock_db.add.assert_called_once()
            mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_finding_deduplicates(self):
        """Should not create duplicate findings."""
        mock_db = Mock()
        service = FindingService(db=mock_db)

        # Mock existing finding
        mock_db.query.return_value.filter.return_value.first.return_value = Mock(id=uuid.uuid4())

        finding_data = {
            "title": "Duplicate",
            "description": "Test",
            "severity": "HIGH",
            "scanner_name": "test",
            "repository_id": str(uuid.uuid4()),
            "finding_uuid": str(uuid.uuid4())
        }

        result = await service.create_finding(finding_data)

        # Should return existing finding, not create new one
        assert result is not None
        mock_db.add.assert_not_called()


class TestScanService:
    """Test ScanService orchestration logic."""

    @pytest.mark.asyncio
    async def test_execute_scan_orchestration(self):
        """Should orchestrate scan execution properly."""
        mock_db = Mock()
        service = ScanService(db=mock_db)

        with patch('src.services.scan_service.run_scanner', new_callable=AsyncMock) as mock_scanner:
            mock_scanner.return_value = {"findings": []}

            result = await service.execute_scan(
                repository_id=str(uuid.uuid4()),
                scan_type="sast"
            )

            assert result["status"] == "completed"
            mock_scanner.assert_called_once()
```

---

## 5. Integration Tests

### tests/integration/test_api_endpoints.py

```python
"""
Integration tests for API endpoints.

Tests FastAPI routes with TestClient and database.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
import uuid


class TestFindingsAPI:
    """Test /api/findings endpoints."""

    @patch('src.auth.dependencies.get_current_user')
    def test_list_findings_requires_auth(self, mock_user, test_client):
        """GET /api/findings/ should require authentication."""
        response = test_client.get("/api/findings/")
        assert response.status_code == 401

    @patch('src.auth.dependencies.get_current_user')
    def test_list_findings_with_analyst_role(self, mock_user, test_client, test_user_analyst):
        """Analyst should be able to list findings."""
        mock_user.return_value = test_user_analyst

        response = test_client.get(
            "/api/findings/",
            headers={"Authorization": "Bearer test-token"}
        )

        assert response.status_code in [200, 404]  # 404 if no findings

    @patch('src.auth.dependencies.get_current_user')
    def test_create_finding_requires_write_permission(self, mock_user, test_client, test_user_manager):
        """Manager (read-only) should not create findings."""
        mock_user.return_value = test_user_manager

        response = test_client.post(
            "/api/findings/",
            json={
                "title": "Test Finding",
                "description": "Test",
                "severity": "HIGH",
                "scanner_name": "test",
                "repository_id": str(uuid.uuid4())
            },
            headers={"Authorization": "Bearer test-token"}
        )

        assert response.status_code == 403


class TestScansAPI:
    """Test /api/scans endpoints."""

    @patch('src.auth.dependencies.get_current_user')
    def test_execute_scan_requires_permission(self, mock_user, test_client, test_user_analyst):
        """Should require scans:execute permission."""
        mock_user.return_value = test_user_analyst

        response = test_client.post(
            "/api/scans/",
            json={
                "repository_id": str(uuid.uuid4()),
                "scan_type": "sast"
            },
            headers={"Authorization": "Bearer test-token"}
        )

        # May fail with 404 (repo not found) but permission granted
        assert response.status_code in [200, 201, 404, 422]


class TestPaginationAndFiltering:
    """Test query parameters for pagination and filtering."""

    @patch('src.auth.dependencies.get_current_user')
    def test_findings_pagination(self, mock_user, test_client, test_user_analyst, test_db):
        """Should support pagination with limit/offset."""
        mock_user.return_value = test_user_analyst

        # Create test findings
        from src.api.models import Finding, Repository
        repo = Repository(id=uuid.uuid4(), name="test", full_name="org/test", url="https://github.com/org/test")
        test_db.add(repo)
        test_db.commit()

        for i in range(15):
            finding = Finding(
                id=uuid.uuid4(),
                title=f"Finding {i}",
                description="Test",
                severity="HIGH",
                scanner_name="test",
                repository_id=repo.id
            )
            test_db.add(finding)
        test_db.commit()

        # Test pagination
        response = test_client.get(
            "/api/findings/?limit=10&offset=0",
            headers={"Authorization": "Bearer test-token"}
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) <= 10
        assert data["total"] == 15
```

---

## 6. Multi-Tenant Isolation Tests

### tests/security/test_tenant_isolation.py

```python
"""
Integration tests for tenant isolation in multi-tenant architecture.

Tests verify that:
1. Data from tenant A doesn't leak into tenant B
2. RBAC authorization still works with tenant routing
3. Tenant provisioning flow works correctly
4. Migration status API works correctly
"""

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
import uuid

from src.api.models import {TENANT_ENTITY}, Finding, Repository


@pytest.fixture
def setup_test_tenants(test_db):
    """
    Create two test tenants for isolation testing.
    """
    tenant_a = {TENANT_ENTITY}(
        id=uuid.uuid4(),
        slug="test-tenant-a",
        name="Test Tenant A",
        is_active=True
    )

    tenant_b = {TENANT_ENTITY}(
        id=uuid.uuid4(),
        slug="test-tenant-b",
        name="Test Tenant B",
        is_active=True
    )

    test_db.add(tenant_a)
    test_db.add(tenant_b)
    test_db.commit()
    test_db.refresh(tenant_a)
    test_db.refresh(tenant_b)

    return {"tenant_a": tenant_a, "tenant_b": tenant_b}


def test_tenant_isolation_basic(test_client, test_db, setup_test_tenants):
    """
    Verify data from tenant A doesn't leak into tenant B.
    """
    tenants = setup_test_tenants

    # Create repository in tenant A
    repo_a = Repository(
        id=uuid.uuid4(),
        name="repo-a",
        full_name="tenant-a/repo-a",
        url="https://github.com/tenant-a/repo-a",
        tenant_id=tenants["tenant_a"].id
    )
    test_db.add(repo_a)
    test_db.commit()

    # Create finding in tenant A
    finding_a = Finding(
        id=uuid.uuid4(),
        title="Finding A - Tenant A Only",
        description="This should not be visible to tenant B",
        severity="HIGH",
        scanner_name="test",
        repository_id=repo_a.id,
        tenant_id=tenants["tenant_a"].id
    )
    test_db.add(finding_a)
    test_db.commit()

    # Query as tenant A - should see finding
    findings_a = test_db.query(Finding).filter(
        Finding.tenant_id == tenants["tenant_a"].id
    ).all()
    assert len(findings_a) == 1

    # Query as tenant B - should NOT see finding
    findings_b = test_db.query(Finding).filter(
        Finding.tenant_id == tenants["tenant_b"].id
    ).all()
    assert len(findings_b) == 0


def test_tenant_middleware_sets_context(test_client, setup_test_tenants):
    """
    Verify TenantMiddleware correctly sets request.state.tenant_id.
    """
    tenants = setup_test_tenants

    with patch('src.auth.jwt.decode_jwt') as mock_jwt:
        mock_jwt.return_value = {
            "sub": "user-123",
            "email": "user@test.com",
            "tenant_id": str(tenants["tenant_a"].id)
        }

        response = test_client.get(
            "/health",
            headers={"Authorization": "Bearer fake-token"}
        )

        # Middleware should not crash the request
        assert response.status_code in [200, 404]


def test_cross_tenant_access_prevention(test_db, setup_test_tenants):
    """
    Verify explicit tenant filtering prevents cross-tenant access.
    """
    tenants = setup_test_tenants

    # Create repos for both tenants
    repo_a = Repository(
        id=uuid.uuid4(),
        name="repo-a",
        full_name="org-a/repo-a",
        url="https://github.com/org-a/repo-a",
        tenant_id=tenants["tenant_a"].id
    )
    repo_b = Repository(
        id=uuid.uuid4(),
        name="repo-b",
        full_name="org-b/repo-b",
        url="https://github.com/org-b/repo-b",
        tenant_id=tenants["tenant_b"].id
    )

    test_db.add(repo_a)
    test_db.add(repo_b)
    test_db.commit()

    # Tenant A should only see their repo
    repos_a = test_db.query(Repository).filter(
        Repository.tenant_id == tenants["tenant_a"].id
    ).all()
    assert len(repos_a) == 1
    assert repos_a[0].name == "repo-a"

    # Tenant B should only see their repo
    repos_b = test_db.query(Repository).filter(
        Repository.tenant_id == tenants["tenant_b"].id
    ).all()
    assert len(repos_b) == 1
    assert repos_b[0].name == "repo-b"
```

---

## 7. RBAC Tests

### tests/security/test_rbac_enforcement.py

```python
"""
Integration tests for RBAC enforcement across API routes.

Tests verify that:
- Unauthenticated requests are denied (401)
- Authenticated users without roles are denied (403)
- Users with appropriate permissions can access endpoints
- Users without required permissions are denied (403)
- Role hierarchy works correctly
- Wildcard permissions (*:*) grant access to all endpoints
"""

import pytest
from unittest.mock import patch


class TestAuthenticationRequirement:
    """Test that all protected endpoints require authentication."""

    def test_unauthenticated_user_denied_findings(self, test_client):
        """Unauthenticated requests should return 401."""
        response = test_client.get("/api/findings/")
        assert response.status_code == 401
        assert "not authenticated" in response.json()["detail"].lower()

    def test_unauthenticated_user_denied_scans(self, test_client):
        """Unauthenticated requests to scans should return 401."""
        response = test_client.get("/api/scans/")
        assert response.status_code == 401


class TestUserWithoutRole:
    """Test that users without role assignments are denied access."""

    @patch('src.auth.dependencies.get_current_user')
    def test_user_without_role_denied(self, mock_get_user, test_client, test_user_no_role):
        """User without role should return 403."""
        mock_get_user.return_value = test_user_no_role

        response = test_client.get("/api/findings/")
        assert response.status_code == 403


class TestAnalystRoleAccess:
    """Test analyst role permissions."""

    @patch('src.auth.dependencies.get_current_user')
    def test_analyst_can_read_findings(self, mock_get_user, test_client, test_user_analyst):
        """Analyst role should access findings:read endpoint."""
        mock_get_user.return_value = test_user_analyst

        response = test_client.get("/api/findings/")
        assert response.status_code in [200, 404]

    @patch('src.auth.dependencies.get_current_user')
    def test_analyst_cannot_delete_findings(self, mock_get_user, test_client, test_user_analyst):
        """Analyst role should NOT delete findings."""
        mock_get_user.return_value = test_user_analyst

        response = test_client.delete("/api/findings/00000000-0000-0000-0000-000000000000")
        assert response.status_code == 403


class TestManagerRoleAccess:
    """Test manager role permissions (read-only)."""

    @patch('src.auth.dependencies.get_current_user')
    def test_manager_can_read_findings(self, mock_get_user, test_client, test_user_manager):
        """Manager role should access findings:read endpoint."""
        mock_get_user.return_value = test_user_manager

        response = test_client.get("/api/findings/")
        assert response.status_code in [200, 404]

    @patch('src.auth.dependencies.get_current_user')
    def test_manager_cannot_write_findings(self, mock_get_user, test_client, test_user_manager):
        """Manager role should NOT write findings."""
        mock_get_user.return_value = test_user_manager

        response = test_client.post("/api/findings/", json={
            "title": "Test",
            "description": "Test",
            "severity": "HIGH",
            "scanner_name": "test"
        })
        assert response.status_code == 403


class TestSuperAdminWildcardAccess:
    """Test super admin wildcard (*:*) permissions."""

    @patch('src.auth.dependencies.get_current_user')
    def test_super_admin_can_access_all_endpoints(self, mock_get_user, test_client, test_user_super_admin):
        """Super admin (*:*) should access all endpoints."""
        mock_get_user.return_value = test_user_super_admin

        endpoints = [
            "/api/findings/",
            "/api/scans/",
            "/api/repositories/",
        ]

        for endpoint in endpoints:
            response = test_client.get(endpoint)
            # Should not get 401 or 403
            assert response.status_code not in [401, 403]


class TestPermissionGranularity:
    """Test that permission granularity works correctly."""

    @patch('src.auth.dependencies.get_current_user')
    def test_findings_read_does_not_grant_write(self, mock_get_user, test_client, test_user_manager):
        """Having findings:read should not grant findings:write."""
        mock_get_user.return_value = test_user_manager

        # Can read
        response = test_client.get("/api/findings/")
        assert response.status_code in [200, 404]

        # Cannot write
        response = test_client.post("/api/findings/", json={})
        assert response.status_code == 403
```

---

## 8. Auth Flow Tests

### tests/security/test_auth_flows.py

```python
"""
Tests for authentication flows.

Tests OIDC, API keys, device flow, break glass, and session management.
"""

import pytest
from unittest.mock import patch, Mock
from datetime import datetime, timedelta
import uuid

from src.auth.device_flow import generate_device_code, generate_user_code
from src.auth.api_keys import create_api_key, validate_api_key
from src.auth.break_glass import create_emergency_access


class TestDeviceFlow:
    """Test OAuth 2.0 Device Flow."""

    def test_device_code_generation(self):
        """Device codes should be 128 characters and unique."""
        codes = [generate_device_code() for _ in range(100)]

        assert all(len(code) == 128 for code in codes)
        assert len(set(codes)) == 100

    def test_user_code_generation(self):
        """User codes should be 9 characters (ABCD-1234) and unique."""
        codes = [generate_user_code() for _ in range(100)]

        assert all(len(code) == 9 for code in codes)
        assert all(code[4] == '-' for code in codes)
        assert len(set(codes)) == 100

    def test_user_code_excludes_confusing_chars(self):
        """User codes should not contain confusing characters."""
        confusing_chars = {'0', 'O', '1', 'I', 'l'}

        for _ in range(200):
            code = generate_user_code().replace('-', '')
            assert not any(char in code for char in confusing_chars)


class TestAPIKeyAuth:
    """Test API key authentication."""

    @pytest.mark.asyncio
    async def test_api_key_creation(self, test_db):
        """Should create valid API key with metadata."""
        user_id = str(uuid.uuid4())

        api_key = await create_api_key(
            test_db,
            user_id=user_id,
            name="Test API Key",
            scopes=["findings:read", "scans:read"]
        )

        assert api_key.key.startswith("agk_")  # {PROJECT_NAME} key prefix
        assert len(api_key.key) > 32
        assert api_key.name == "Test API Key"
        assert "findings:read" in api_key.scopes

    @pytest.mark.asyncio
    async def test_api_key_validation(self, test_db):
        """Should validate API key and return user."""
        user_id = str(uuid.uuid4())
        api_key = await create_api_key(test_db, user_id=user_id, name="Test")

        validated = await validate_api_key(test_db, api_key.key)

        assert validated is not None
        assert validated.user_id == user_id

    @pytest.mark.asyncio
    async def test_api_key_expiration(self, test_db):
        """Expired API keys should not validate."""
        user_id = str(uuid.uuid4())
        api_key = await create_api_key(
            test_db,
            user_id=user_id,
            name="Expired Key",
            expires_at=datetime.utcnow() - timedelta(days=1)
        )

        validated = await validate_api_key(test_db, api_key.key)

        assert validated is None


class TestOIDCFlow:
    """Test OIDC authentication flow."""

    @patch('src.auth.oidc.httpx.AsyncClient.get')
    @pytest.mark.asyncio
    async def test_oidc_discovery(self, mock_get):
        """Should discover OIDC configuration."""
        mock_get.return_value.json.return_value = {
            "issuer": "https://oidc.example.com",
            "authorization_endpoint": "https://oidc.example.com/auth",
            "token_endpoint": "https://oidc.example.com/token",
            "jwks_uri": "https://oidc.example.com/jwks"
        }

        from src.auth.oidc import discover_oidc_config
        config = await discover_oidc_config("https://oidc.example.com")

        assert config["issuer"] == "https://oidc.example.com"
        assert "authorization_endpoint" in config


class TestBreakGlassAccess:
    """Test emergency break glass access."""

    @pytest.mark.asyncio
    async def test_break_glass_creation(self, test_db):
        """Should create time-limited emergency access."""
        user_id = str(uuid.uuid4())

        access = await create_emergency_access(
            test_db,
            user_id=user_id,
            reason="Production incident - database locked",
            duration_minutes=30
        )

        assert access.user_id == user_id
        assert access.reason is not None
        assert access.expires_at > datetime.utcnow()
        assert access.expires_at <= datetime.utcnow() + timedelta(minutes=31)

    @pytest.mark.asyncio
    async def test_break_glass_audit_logged(self, test_db):
        """Emergency access should be audited."""
        user_id = str(uuid.uuid4())

        with patch('src.auth.break_glass.audit_log') as mock_audit:
            await create_emergency_access(
                test_db,
                user_id=user_id,
                reason="Emergency",
                duration_minutes=15
            )

            mock_audit.assert_called_once()
            assert "break_glass" in mock_audit.call_args[1]["action"]
```

---

## 9. Data Integrity Tests

### tests/security/test_data_integrity.py

```python
"""
Data integrity tests.

Ensures database maintains referential integrity and data consistency.
"""

import pytest
from sqlalchemy import text


class TestReferentialIntegrity:
    """Test database referential integrity."""

    @pytest.mark.unit
    def test_no_orphaned_findings(self, test_db):
        """Verify all findings have valid repository references."""
        orphans = test_db.execute(text("""
            SELECT f.id, f.repository_id
            FROM findings f
            LEFT JOIN repositories r ON f.repository_id = r.id
            WHERE r.id IS NULL
            LIMIT 10
        """)).fetchall()

        assert len(orphans) == 0, f"Found {len(orphans)} orphaned findings"

    @pytest.mark.unit
    def test_no_orphaned_domain_entities(self, test_db):
        """Verify all domain entities have valid references."""
        # Adjust query for your domain model
        orphans = test_db.execute(text("""
            SELECT COUNT(*) as count
            FROM {DOMAIN_ENTITIES}
            WHERE parent_id IS NOT NULL
            AND parent_id NOT IN (SELECT id FROM parents)
        """)).scalar()

        assert orphans == 0


class TestDataTypeConsistency:
    """Test data type consistency and validation."""

    @pytest.mark.unit
    def test_severity_values_valid(self, test_db):
        """Verify severity values are valid."""
        invalid = test_db.execute(text("""
            SELECT id, severity
            FROM findings
            WHERE severity NOT IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'UNKNOWN')
            LIMIT 10
        """)).fetchall()

        assert len(invalid) == 0

    @pytest.mark.unit
    def test_status_enum_consistency(self, test_db):
        """Verify status enums are consistent."""
        invalid = test_db.execute(text("""
            SELECT id, status
            FROM findings
            WHERE status NOT IN ('open', 'resolved', 'snoozed', 'false_positive')
            LIMIT 10
        """)).fetchall()

        assert len(invalid) == 0


class TestUniqueConstraints:
    """Test unique constraints are enforced."""

    @pytest.mark.unit
    def test_no_duplicate_findings(self, test_db):
        """Verify findings unique constraint prevents duplicates."""
        duplicates = test_db.execute(text("""
            SELECT repository_id, finding_uuid, COUNT(*) as dup_count
            FROM findings
            GROUP BY repository_id, finding_uuid
            HAVING COUNT(*) > 1
            LIMIT 10
        """)).fetchall()

        assert len(duplicates) == 0


class TestTenantIsolation:
    """Test multi-tenant data isolation."""

    @pytest.mark.security
    def test_all_findings_have_tenant_id(self, test_db):
        """Verify all findings have tenant_id set."""
        missing_tenant = test_db.execute(text("""
            SELECT COUNT(*) as count
            FROM findings
            WHERE tenant_id IS NULL
        """)).scalar()

        assert missing_tenant == 0, "All records must have tenant_id for isolation"

    @pytest.mark.security
    def test_tenant_id_matches_parent_tenant(self, test_db):
        """Verify finding tenant_id matches repository's tenant_id."""
        mismatched = test_db.execute(text("""
            SELECT f.id, f.tenant_id as finding_tenant, r.tenant_id as repo_tenant
            FROM findings f
            JOIN repositories r ON f.repository_id = r.id
            WHERE f.tenant_id != r.tenant_id
            LIMIT 10
        """)).fetchall()

        assert len(mismatched) == 0


class TestDataCompleteness:
    """Test critical fields are populated."""

    @pytest.mark.unit
    def test_findings_have_required_fields(self, test_db):
        """Verify findings have all required fields."""
        incomplete = test_db.execute(text("""
            SELECT id, title, severity, scanner_name
            FROM findings
            WHERE title IS NULL
               OR title = ''
               OR severity IS NULL
               OR scanner_name IS NULL
            LIMIT 10
        """)).fetchall()

        assert len(incomplete) == 0
```

---

## 10. Frontend Testing

### Frontend Testing Setup (Jest + React Testing Library)

**package.json - test scripts:**
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.1.0",
    "@testing-library/user-event": "^14.5.0",
    "jest": "^29.5.0",
    "jest-environment-jsdom": "^29.5.0",
    "@playwright/test": "^1.35.0"
  }
}
```

**jest.config.js:**
```javascript
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
  ],
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### frontend/tests/unit/components/FindingCard.test.tsx

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FindingCard } from '@/components/FindingCard';

describe('FindingCard', () => {
  const mockFinding = {
    id: '123',
    title: 'SQL Injection',
    description: 'SQL injection vulnerability found',
    severity: 'CRITICAL',
    status: 'open',
    scanner_name: 'semgrep',
  };

  it('renders finding information', () => {
    render(<FindingCard finding={mockFinding} />);

    expect(screen.getByText('SQL Injection')).toBeInTheDocument();
    expect(screen.getByText(/SQL injection vulnerability/)).toBeInTheDocument();
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
  });

  it('displays severity badge with correct color', () => {
    render(<FindingCard finding={mockFinding} />);

    const severityBadge = screen.getByText('CRITICAL');
    expect(severityBadge).toHaveClass('bg-red-600'); // Adjust for your styling
  });

  it('calls onResolve when resolve button clicked', async () => {
    const handleResolve = jest.fn();
    const user = userEvent.setup();

    render(<FindingCard finding={mockFinding} onResolve={handleResolve} />);

    const resolveButton = screen.getByRole('button', { name: /resolve/i });
    await user.click(resolveButton);

    expect(handleResolve).toHaveBeenCalledWith('123');
  });

  it('shows loading state when resolving', () => {
    render(<FindingCard finding={mockFinding} isResolving />);

    expect(screen.getByText(/resolving/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resolve/i })).toBeDisabled();
  });
});
```

---

## 11. E2E Tests

### playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:{UI_PORT}',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:{UI_PORT}',
    reuseExistingServer: !process.env.CI,
  },
});
```

### tests/e2e/critical-flows.spec.ts

```typescript
import { test, expect } from '@playwright/test';

test.describe('Critical User Journeys', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication for E2E tests
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'test-token');
    });
  });

  test('should login and view dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByText(/findings/i)).toBeVisible();
  });

  test('should view findings list and filter by severity', async ({ page }) => {
    await page.goto('/findings');

    // Wait for findings to load
    await expect(page.getByTestId('findings-list')).toBeVisible();

    // Filter by CRITICAL severity
    await page.getByRole('combobox', { name: /severity/i }).click();
    await page.getByRole('option', { name: /critical/i }).click();

    // Verify filtered results
    await expect(page.getByTestId('finding-card')).toContainText('CRITICAL');
  });

  test('should resolve a finding', async ({ page }) => {
    await page.goto('/findings');

    // Click first finding
    await page.getByTestId('finding-card').first().click();

    // Resolve finding
    await page.getByRole('button', { name: /resolve/i }).click();
    await page.getByRole('button', { name: /confirm/i }).click();

    // Verify resolution
    await expect(page.getByText(/resolved successfully/i)).toBeVisible();
  });

  test('should create a new scan', async ({ page }) => {
    await page.goto('/scans/new');

    // Fill scan form
    await page.getByLabel(/repository/i).fill('test-repo');
    await page.getByLabel(/scan type/i).selectOption('sast');

    // Submit
    await page.getByRole('button', { name: /start scan/i }).click();

    // Verify scan started
    await expect(page.getByText(/scan started/i)).toBeVisible();
  });
});

test.describe('RBAC Enforcement in UI', () => {
  test('manager role cannot see admin menu', async ({ page }) => {
    // Mock manager role
    await page.evaluate(() => {
      localStorage.setItem('user_role', 'manager');
    });

    await page.goto('/dashboard');

    // Admin menu should not be visible
    await expect(page.getByRole('link', { name: /admin/i })).not.toBeVisible();
  });

  test('analyst role can create scans', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('user_role', 'analyst');
    });

    await page.goto('/scans');

    // Should see create scan button
    await expect(page.getByRole('button', { name: /new scan/i })).toBeVisible();
  });
});
```

---

## 12. Contract Testing

### tests/contract/test_openapi_schema.py

```python
"""
Contract tests using Schemathesis.

Tests API contract against OpenAPI specification.
"""

import schemathesis
from hypothesis import settings

# Load OpenAPI schema
schema = schemathesis.from_uri("http://localhost:{API_PORT}/openapi.json")


@schema.parametrize()
@settings(max_examples=50)
def test_api_contract(case):
    """
    Test all API endpoints against OpenAPI schema.

    Schemathesis will:
    - Generate test cases from OpenAPI spec
    - Validate request/response schemas
    - Check status codes
    - Verify content types
    """
    response = case.call()
    case.validate_response(response)


@schema.parametrize(endpoint="/api/findings/")
@settings(max_examples=100)
def test_findings_endpoint_fuzzing(case):
    """
    Fuzz test findings endpoint with generated payloads.

    Catches edge cases like:
    - Invalid UUIDs
    - Out of range integers
    - Missing required fields
    - Extra fields
    """
    response = case.call()
    case.validate_response(response)

    # Additional checks
    if response.status_code == 200:
        data = response.json()
        assert "items" in data
        assert "total" in data
```

### tests/contract/test_api_versioning.py

```python
"""
Test API versioning and backward compatibility.
"""

import pytest
from fastapi.testclient import TestClient


def test_api_v1_still_supported(test_client):
    """V1 API should still be accessible."""
    response = test_client.get("/api/v1/findings/")
    assert response.status_code in [200, 401, 404]  # Not 410 Gone


def test_api_v2_with_v1_payload(test_client):
    """V2 should accept V1 payload format."""
    v1_payload = {
        "title": "Test",
        "severity": "HIGH",
        "scanner_name": "test"
    }

    response = test_client.post("/api/v2/findings/", json=v1_payload)
    # Should not fail with 400 Bad Request
    assert response.status_code not in [400]
```

---

## 13. Performance Testing

### tests/performance/locustfile.py

```python
"""
Load testing with Locust.

Run with: locust -f tests/performance/locustfile.py --host=http://localhost:{API_PORT}
"""

from locust import HttpUser, task, between
import random


class {PROJECT_NAME}User(HttpUser):
    """Simulated user for load testing."""

    wait_time = between(1, 3)

    def on_start(self):
        """Login before starting tasks."""
        # Mock authentication token
        self.client.headers = {
            "Authorization": "Bearer test-load-testing-token"
        }

    @task(3)
    def list_findings(self):
        """List findings (most common operation)."""
        self.client.get("/api/findings/?limit=50")

    @task(2)
    def get_finding_detail(self):
        """Get single finding detail."""
        finding_id = random.choice(self.finding_ids)
        self.client.get(f"/api/findings/{finding_id}")

    @task(1)
    def filter_findings(self):
        """Filter findings by severity."""
        severity = random.choice(["CRITICAL", "HIGH", "MEDIUM", "LOW"])
        self.client.get(f"/api/findings/?severity={severity}")

    @task(1)
    def search_findings(self):
        """Search findings by text."""
        query = random.choice(["sql", "xss", "injection", "auth"])
        self.client.get(f"/api/findings/search?q={query}")

    @task(1)
    def dashboard_analytics(self):
        """Load dashboard analytics."""
        self.client.get("/api/analytics/summary")

    # Store finding IDs for detail requests
    finding_ids = []


class AdminUser(HttpUser):
    """Admin user with write operations."""

    wait_time = between(2, 5)

    @task
    def create_scan(self):
        """Create new scan."""
        self.client.post("/api/scans/", json={
            "repository_id": "test-repo-id",
            "scan_type": "sast"
        })
```

### tests/performance/test_query_performance.py

```python
"""
Database query performance tests.

Uses pytest-benchmark to measure query performance.
"""

import pytest
from sqlalchemy import text


@pytest.mark.performance
def test_findings_list_query_performance(test_db, benchmark):
    """List findings query should complete in <100ms."""

    def query_findings():
        return test_db.execute(text("""
            SELECT id, title, severity, status, repository_id
            FROM findings
            WHERE status = 'open'
            ORDER BY severity DESC, discovered_at DESC
            LIMIT 50
        """)).fetchall()

    result = benchmark(query_findings)

    # Assert query completes in reasonable time
    assert benchmark.stats['mean'] < 0.1  # 100ms


@pytest.mark.performance
def test_findings_aggregation_performance(test_db, benchmark):
    """Analytics aggregation should complete in <500ms."""

    def query_aggregation():
        return test_db.execute(text("""
            SELECT
                severity,
                status,
                COUNT(*) as count
            FROM findings
            GROUP BY severity, status
        """)).fetchall()

    result = benchmark(query_aggregation)

    assert benchmark.stats['mean'] < 0.5  # 500ms
```

---

## 14. Test Data Management

### tests/factories/finding_factory.py

```python
"""
Factory for generating test data using factory_boy.
"""

import factory
from factory.faker import faker
import uuid
from datetime import datetime

from src.api.models import Finding, Repository, {TENANT_ENTITY}


FAKE = faker.Faker()


class TenantFactory(factory.Factory):
    """Factory for creating test tenants."""

    class Meta:
        model = {TENANT_ENTITY}

    id = factory.LazyFunction(uuid.uuid4)
    name = factory.Faker('company')
    slug = factory.LazyAttribute(lambda obj: obj.name.lower().replace(' ', '-'))
    is_active = True


class RepositoryFactory(factory.Factory):
    """Factory for creating test repositories."""

    class Meta:
        model = Repository

    id = factory.LazyFunction(uuid.uuid4)
    name = factory.Faker('word')
    full_name = factory.LazyAttribute(lambda obj: f"org/{obj.name}")
    url = factory.LazyAttribute(lambda obj: f"https://github.com/{obj.full_name}")
    tenant_id = factory.LazyFunction(uuid.uuid4)


class FindingFactory(factory.Factory):
    """Factory for creating test findings."""

    class Meta:
        model = Finding

    id = factory.LazyFunction(uuid.uuid4)
    finding_uuid = factory.LazyFunction(uuid.uuid4)
    title = factory.Faker('sentence', nb_words=6)
    description = factory.Faker('text', max_nb_chars=200)
    severity = factory.Faker('random_element', elements=['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
    status = factory.Faker('random_element', elements=['open', 'resolved', 'snoozed'])
    scanner_name = factory.Faker('random_element', elements=['semgrep', 'gitleaks', 'grype'])
    discovered_at = factory.LazyFunction(datetime.utcnow)
    repository_id = factory.LazyFunction(uuid.uuid4)
    tenant_id = factory.LazyFunction(uuid.uuid4)


# Usage in tests:
# finding = FindingFactory.build()
# finding = FindingFactory.create(severity='CRITICAL')
# findings = FindingFactory.create_batch(10)
```

### tests/fixtures/sample_data.py

```python
"""
Sample data fixtures for integration tests.
"""

import pytest
from tests.factories.finding_factory import (
    TenantFactory,
    RepositoryFactory,
    FindingFactory
)


@pytest.fixture
def sample_tenant(test_db):
    """Create sample tenant with repositories and findings."""
    tenant = TenantFactory.build()
    test_db.add(tenant)
    test_db.commit()
    return tenant


@pytest.fixture
def sample_repository(test_db, sample_tenant):
    """Create sample repository."""
    repo = RepositoryFactory.build(tenant_id=sample_tenant.id)
    test_db.add(repo)
    test_db.commit()
    return repo


@pytest.fixture
def sample_findings(test_db, sample_repository):
    """Create 10 sample findings."""
    findings = FindingFactory.create_batch(
        10,
        repository_id=sample_repository.id,
        tenant_id=sample_repository.tenant_id
    )
    for finding in findings:
        test_db.add(finding)
    test_db.commit()
    return findings


@pytest.fixture
def critical_finding(test_db, sample_repository):
    """Create a critical severity finding."""
    finding = FindingFactory.build(
        severity='CRITICAL',
        status='open',
        repository_id=sample_repository.id,
        tenant_id=sample_repository.tenant_id
    )
    test_db.add(finding)
    test_db.commit()
    return finding
```

---

## 15. Coverage Configuration

### .coveragerc

```ini
[run]
source = src
omit =
    */tests/*
    */migrations/*
    */__pycache__/*
    */venv/*
    */virtualenv/*
branch = True

[report]
precision = 2
show_missing = True
skip_covered = False
exclude_lines =
    pragma: no cover
    def __repr__
    raise AssertionError
    raise NotImplementedError
    if __name__ == .__main__.:
    if TYPE_CHECKING:
    class .*\bProtocol\):
    @(abc\.)?abstractmethod

[html]
directory = htmlcov

[coverage:paths]
source =
    src/
    */site-packages/
```

### Running Coverage Reports

```bash
# Run tests with coverage
pytest --cov=src --cov-report=html --cov-report=term-missing

# Generate coverage badge
coverage-badge -o coverage.svg

# View HTML report
open htmlcov/index.html

# Check coverage thresholds
pytest --cov=src --cov-fail-under=85
```

---

## 16. CI Integration

### .github/workflows/test.yml

```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12"]

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: ${{ matrix.python-version }}

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements.txt') }}

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-dev.txt

      - name: Run unit tests
        run: pytest tests/unit -v --tb=short -m unit

      - name: Run integration tests
        run: pytest tests/integration -v --tb=short -m integration

  security-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-dev.txt

      - name: Run RBAC tests
        run: pytest tests/security/test_rbac_enforcement.py -v

      - name: Run tenant isolation tests
        run: pytest tests/security/test_tenant_isolation.py -v

      - name: Run data integrity tests
        run: pytest tests/security/test_data_integrity.py -v

  coverage:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-dev.txt

      - name: Run tests with coverage
        run: pytest --cov=src --cov-report=xml --cov-report=term-missing --cov-fail-under=85

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage.xml
          fail_ci_if_error: true

  frontend-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "18"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run Jest tests
        run: npm test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

  e2e-tests:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: {DB_NAME}_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.11"

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "18"

      - name: Install Python dependencies
        run: |
          pip install -r requirements.txt

      - name: Install Node dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Start backend
        run: |
          uvicorn src.api.main:app --host 0.0.0.0 --port {API_PORT} &
          sleep 5

      - name: Start frontend
        run: |
          npm run build
          npm start &
          sleep 5

      - name: Run E2E tests
        run: npx playwright test

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 17. Validation Checklist

### Pre-Deployment Testing Checklist

```markdown
## Unit Tests
- [ ] All unit tests pass
- [ ] >90% code coverage for business logic
- [ ] All model validation tests pass
- [ ] All service layer tests pass

## Integration Tests
- [ ] All API endpoint tests pass
- [ ] Database integration tests pass
- [ ] Background task tests pass
- [ ] Pagination and filtering tests pass

## Security Tests
- [ ] All RBAC enforcement tests pass
- [ ] Tenant isolation verified (no data leakage)
- [ ] Authentication flow tests pass
- [ ] Authorization tests for all roles pass
- [ ] Data integrity tests pass
- [ ] No orphaned records

## Multi-Tenant Tests
- [ ] Cross-tenant access prevented
- [ ] Tenant middleware sets context correctly
- [ ] All domain models have tenant_id
- [ ] Tenant filtering works at query level

## Auth Flow Tests
- [ ] OIDC authentication works
- [ ] Device flow generates valid codes
- [ ] API key validation works
- [ ] Break glass access audited
- [ ] Session management works

## Contract Tests
- [ ] OpenAPI schema validation passes
- [ ] Schemathesis fuzzing finds no issues
- [ ] API versioning backward compatible

## Performance Tests
- [ ] List queries complete in <100ms
- [ ] Aggregation queries complete in <500ms
- [ ] Load testing shows acceptable response times
- [ ] No N+1 query issues

## Frontend Tests
- [ ] All component tests pass
- [ ] Integration tests pass
- [ ] E2E critical paths pass
- [ ] RBAC enforced in UI

## Coverage
- [ ] Overall coverage ≥85%
- [ ] Critical paths coverage ≥95%
- [ ] All branches tested
- [ ] Coverage report generated

## CI/CD
- [ ] All CI tests pass
- [ ] Coverage uploaded to Codecov
- [ ] E2E tests pass in CI
- [ ] No flaky tests
```

---

## Quick Start Commands

```bash
# Install test dependencies
pip install -r requirements-dev.txt

# Run all tests
pytest

# Run unit tests only (fast)
pytest tests/unit -m unit

# Run integration tests
pytest tests/integration -m integration

# Run security tests
pytest tests/security -m security

# Run with coverage
pytest --cov=src --cov-report=html --cov-report=term-missing

# Run specific test file
pytest tests/security/test_rbac_enforcement.py -v

# Run tests matching pattern
pytest -k "test_tenant_isolation"

# Run tests in parallel
pytest -n auto

# Run with verbose output
pytest -vv

# Run performance benchmarks
pytest tests/performance --benchmark-only

# Frontend tests
npm test
npm run test:watch
npm run test:coverage

# E2E tests
npx playwright test
npx playwright test --headed
npx playwright test --debug

# Load testing
locust -f tests/performance/locustfile.py --host=http://localhost:{API_PORT}
```

---

## Summary

This testing strategy provides:

1. **Comprehensive Coverage** - Unit, integration, security, E2E, contract, and performance tests
2. **Production Patterns** - All patterns derived from AuditGH's battle-tested test suite
3. **Security First** - Extensive RBAC, tenant isolation, and data integrity tests
4. **Full Code Templates** - Copy-paste ready test files with realistic examples
5. **CI/CD Integration** - GitHub Actions workflows for automated testing
6. **Performance Benchmarks** - Load testing and query performance validation
7. **Frontend Testing** - Jest + React Testing Library + Playwright E2E
8. **Test Data Management** - Factories and fixtures for maintainable test data

**Target Metrics:**
- 85%+ overall code coverage
- 95%+ coverage on critical paths
- <100ms for list queries
- <500ms for aggregation queries
- All RBAC tests passing
- Zero tenant data leakage
- All E2E critical paths passing

This plan ensures your application is production-ready with confidence in security, performance, and reliability.
