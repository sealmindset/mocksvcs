---
plan: Scanner Tool Implementation Plan
phase: 7
purpose: Comprehensive scanner tool architecture with plugin system, multi-execution model, SARIF normalization, orchestration, and scheduling
prerequisites: Phase 1 (Project Bootstrap), Phase 2 (Database Design), Phase 3 (API First), Phase 5 (Docker)
duration: 5-10 days
reference: AuditGH production scanner system (30+ tools, subprocess/container/remote execution, tech detection, AI-optimized scheduling)
---

# Phase 7: Scanner Tool Implementation Plan

> **Purpose:** Complete scanner tool architecture specification covering a generic plugin framework, multi-execution model (container, subprocess, remote API), SARIF + custom result normalization, repository management, technology detection, scan orchestration, scheduling, progress monitoring, and result ingestion. Parameterized with `{PLACEHOLDER}` patterns for reuse across any domain.
>
> **Reference Implementation:** [AuditGH](/) — Production scanner system with 30+ security tools, subprocess execution with safe timeout handling, technology-based scanner selection, APScheduler-based scheduling, and AI-optimized scan frequency.

---

## Parameter Reference

| Placeholder | Description | AuditGH Example |
|------------|-------------|-----------------|
| `{PROJECT_NAME}` | Project identifier | `auditgh` |
| `{SCANNER_DOMAIN}` | What scanners analyze | `security vulnerabilities` |
| `{SCANNER_CATEGORIES}` | Types of scanners | `sast, dast, secrets, deps, iac, sca, api` |
| `{SCANNER_TOOLS}` | Specific tools integrated | `Gitleaks, Trivy, Semgrep, Grype, Bandit, Checkov` |
| `{SCAN_TARGET}` | What gets scanned | `git repositories` |
| `{SCAN_TARGET_SOURCE}` | Where targets come from | `GitHub organizations` |
| `{FINDING_ENTITY}` | Normalized result entity | `Finding` |
| `{SCAN_RUN_ENTITY}` | Scan execution record | `ScanRun` |
| `{TENANT_ENTITY}` | Multi-tenant root | `Organization` |
| `{CLONE_DIR}` | Repository clone directory | `/tmp/repo_scan_{uuid}` |
| `{REPORT_DIR}` | Scanner output directory | `vulnerability_reports/` |
| `{SCANNER_IMAGE}` | Scanner Docker image | `{PROJECT_NAME}-scanner:latest` |
| `{SCANNER_TIMEOUT}` | Default scanner timeout (seconds) | `300` |
| `{MAX_SCAN_DURATION}` | Maximum scan time per target | `7200` (2 hours) |
| `{SCHEDULE_FREQUENCIES}` | Supported scan frequencies | `daily, weekly, bi-weekly, monthly` |
| `{API_PORT}` | Backend API port | `8000` |

---

## Table of Contents

1. [Scanner Architecture Principles](#1-scanner-architecture-principles)
2. [Plugin Architecture & Base Scanner](#2-plugin-architecture--base-scanner)
3. [Execution Models](#3-execution-models)
4. [Result Normalization & SARIF](#4-result-normalization--sarif)
5. [Repository Management](#5-repository-management)
6. [Technology Detection](#6-technology-detection)
7. [Scanner Implementations](#7-scanner-implementations)
8. [Scan Orchestration](#8-scan-orchestration)
9. [Progress Monitoring](#9-progress-monitoring)
10. [Result Ingestion Pipeline](#10-result-ingestion-pipeline)
11. [Scan Scheduling](#11-scan-scheduling)
12. [Scanner Configuration](#12-scanner-configuration)
13. [Scanner Docker Container](#13-scanner-docker-container)
14. [Remote / SaaS Scanner Integration](#14-remote--saas-scanner-integration)
15. [Database Models](#15-database-models)
16. [API Endpoints](#16-api-endpoints)
17. [Validation Checklist](#17-validation-checklist)

---

## 1. Scanner Architecture Principles

### 1.1 Core Design Tenets

| Principle | Description | Implementation |
|-----------|-------------|----------------|
| **Plugin Architecture** | Any tool can be added without modifying core | Abstract `BaseScanner` + registry |
| **Multi-Execution Model** | Support containers, subprocesses, and remote APIs | Execution strategy pattern per scanner |
| **SARIF as Interchange** | Industry-standard format for tool interop | SARIF import/export + richer custom schema for storage |
| **Tech-Driven Selection** | Auto-detect technologies, run applicable scanners | `detect_tech.py` maps languages → scanners |
| **Safe Execution** | Scanners can't hang, crash, or leak resources | Strict timeouts, process tree kill, progress monitoring |
| **Idempotent Results** | Re-scanning produces consistent, deduplicated findings | Fingerprint-based deduplication |
| **Multi-Tenant Isolation** | Scans scoped to `{TENANT_ENTITY}` | `organization_id` on all scan/finding records |

### 1.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Scan Triggers                                 │
│  Manual │ Schedule (APScheduler) │ Webhook │ API Request         │
└────────┬──────────┬──────────────┬─────────┬────────────────────┘
         │          │              │         │
         ▼          ▼              ▼         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Scan Orchestrator                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Target Mgmt │  │ Tech Detect  │  │ Scanner Selection     │  │
│  │ (clone/     │  │ (languages,  │  │ (which scanners for   │  │
│  │  download)  │  │  frameworks) │  │  this target?)        │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬───────────┘  │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Scanner Registry                             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │   │
│  │  │ SAST     │ │ Secrets  │ │ Deps/SCA │ │ IaC        │  │   │
│  │  │ Semgrep  │ │ Gitleaks │ │ Trivy    │ │ Checkov    │  │   │
│  │  │ Bandit   │ │ Truffleh.│ │ Grype    │ │ Terrascan  │  │   │
│  │  │ CodeQL   │ │ Whispers │ │ npm audit│ │ Dockle     │  │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘  │   │
│  │       └─────────────┼────────────┼─────────────┘          │   │
│  └──────────────────────────────────┬────────────────────────┘   │
│                                     ▼                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Execution Layer                                 │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │   │
│  │  │ Subprocess   │ │ Container    │ │ Remote API       │ │   │
│  │  │ (local CLI)  │ │ (Docker run) │ │ (SaaS webhook)   │ │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────┘ │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Progress Monitor  │  Safe Subprocess  │  Timeout Handler│   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────┬───────────────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Result Pipeline                                │
│  Raw Output → Parser → SARIF → Normalize → Deduplicate → Ingest │
└─────────────────────────────────────────┬───────────────────────┘
                                          ▼
┌──────────────────┐    ┌──────────────────────────────────────┐
│  PostgreSQL      │    │  Reports / Dashboards / AI Analysis  │
│  ({FINDING_ENTITY})│    │                                      │
└──────────────────┘    └──────────────────────────────────────┘
```

### 1.3 Module Structure

```
src/scanners/
├── __init__.py
├── base.py                     # Abstract BaseScanner + data classes
├── registry.py                 # Scanner registry (discover, register, lookup)
├── config.py                   # Scanner configuration management
├── execution/
│   ├── __init__.py
│   ├── subprocess_runner.py    # Safe subprocess execution with timeout
│   ├── container_runner.py     # Docker container execution
│   ├── remote_runner.py        # Remote API / SaaS execution
│   └── progress_monitor.py     # Progress tracking and stuck detection
├── parsers/
│   ├── __init__.py
│   ├── sarif.py                # SARIF import/export
│   ├── json_parser.py          # Generic JSON output parser
│   ├── semgrep.py              # Semgrep-specific parser
│   ├── trivy.py                # Trivy-specific parser
│   ├── gitleaks.py             # Gitleaks-specific parser
│   └── ...                     # One parser per scanner
├── tools/
│   ├── __init__.py
│   ├── sast/                   # SAST scanners
│   │   ├── semgrep.py
│   │   ├── bandit.py
│   │   └── codeql.py
│   ├── secrets/                # Secret scanners
│   │   ├── gitleaks.py
│   │   ├── trufflehog.py
│   │   └── whispers.py
│   ├── deps/                   # Dependency scanners
│   │   ├── trivy.py
│   │   ├── grype.py
│   │   └── npm_audit.py
│   ├── iac/                    # Infrastructure-as-Code scanners
│   │   ├── checkov.py
│   │   └── terrascan.py
│   └── remote/                 # SaaS/API-based scanners
│       ├── snyk.py
│       └── sonarcloud.py
├── targets/
│   ├── __init__.py
│   ├── git_repo.py             # Git repository clone/manage
│   ├── docker_image.py         # Docker image target
│   └── filesystem.py           # Local filesystem target
├── detection/
│   ├── __init__.py
│   ├── languages.py            # Language detection
│   ├── frameworks.py           # Framework detection
│   └── iac.py                  # IaC detection
├── orchestrator.py             # Scan orchestration (coordinate scanners)
├── scheduler.py                # Scan scheduling (APScheduler)
├── ingestion.py                # Result ingestion into database
└── deduplication.py            # Finding fingerprint and dedup
```

---

## 2. Plugin Architecture & Base Scanner

### 2.1 Core Data Classes

```python
# src/scanners/base.py
"""Base scanner class and core data types."""

import abc
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional
from datetime import datetime


class Severity(str, Enum):
    """Normalized severity levels across all scanners."""
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"
    UNKNOWN = "UNKNOWN"


class ScannerCategory(str, Enum):
    """Scanner type categories."""
    SAST = "sast"           # Static Application Security Testing
    DAST = "dast"           # Dynamic Application Security Testing
    SECRETS = "secrets"     # Secret/credential scanning
    DEPS = "deps"           # Dependency vulnerability scanning
    SCA = "sca"             # Software Composition Analysis
    IAC = "iac"             # Infrastructure as Code scanning
    API = "api"             # API security scanning
    CONTAINER = "container" # Container image scanning
    QUALITY = "quality"     # Code quality (non-security)
    COMPLIANCE = "compliance"  # Compliance/policy scanning
    CUSTOM = "custom"       # User-defined category


class ExecutionMode(str, Enum):
    """How a scanner executes."""
    SUBPROCESS = "subprocess"   # Local CLI tool via subprocess
    CONTAINER = "container"     # Docker container execution
    REMOTE = "remote"           # Remote API / SaaS call


class ScanStatus(str, Enum):
    """Scan execution status."""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    TIMEOUT = "timeout"
    PARTIAL = "partial"     # Some results, but scanner errored
    SKIPPED = "skipped"     # Not applicable to target


@dataclass
class Vulnerability:
    """A single finding/vulnerability from a scanner."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    title: str = ""
    description: str = ""
    severity: Severity = Severity.UNKNOWN

    # Location
    file_path: str = ""
    line_start: int = 0
    line_end: int = 0
    code_snippet: str = ""

    # Vulnerability identifiers
    cve_id: str = ""
    cwe_id: str = ""
    rule_id: str = ""  # Scanner-specific rule ID

    # Package info (for dependency scanners)
    package_name: str = ""
    package_version: str = ""
    fixed_version: str = ""
    package_manager: str = ""

    # Metadata
    scanner_name: str = ""
    scanner_category: ScannerCategory = ScannerCategory.CUSTOM
    confidence: float = 1.0  # 0.0-1.0
    references: list[str] = field(default_factory=list)
    cvss_score: float = 0.0
    tags: list[str] = field(default_factory=list)
    raw_data: dict = field(default_factory=dict)

    # Fingerprint for deduplication
    fingerprint: str = ""

    def compute_fingerprint(self) -> str:
        """Generate a stable fingerprint for deduplication."""
        import hashlib
        parts = [
            self.scanner_name,
            self.rule_id or self.cve_id or self.title,
            self.file_path,
            str(self.line_start),
            self.package_name,
            self.package_version,
        ]
        self.fingerprint = hashlib.sha256(
            "|".join(p for p in parts if p).encode()
        ).hexdigest()[:32]
        return self.fingerprint


@dataclass
class ScanResult:
    """Result of running a single scanner against a single target."""
    scanner_name: str
    scanner_category: ScannerCategory
    status: ScanStatus = ScanStatus.SUCCESS
    vulnerabilities: list[Vulnerability] = field(default_factory=list)

    # Execution metadata
    started_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    duration_seconds: float = 0.0
    exit_code: int = 0

    # Output
    raw_output: str = ""
    raw_output_path: str = ""  # Path to saved raw output file
    sarif_output: dict | None = None

    # Error info
    error: str = ""
    error_type: str = ""  # timeout, crash, parse_error, config_error

    @property
    def finding_count(self) -> int:
        return len(self.vulnerabilities)

    @property
    def critical_count(self) -> int:
        return sum(1 for v in self.vulnerabilities if v.severity == Severity.CRITICAL)

    @property
    def high_count(self) -> int:
        return sum(1 for v in self.vulnerabilities if v.severity == Severity.HIGH)

    def severity_counts(self) -> dict[str, int]:
        counts = {s.value: 0 for s in Severity}
        for v in self.vulnerabilities:
            counts[v.severity.value] += 1
        return counts
```

### 2.2 Abstract Base Scanner

```python
# src/scanners/base.py (continued)

class BaseScanner(abc.ABC):
    """Abstract base class for all scanner plugins.

    To implement a new scanner:
    1. Subclass BaseScanner
    2. Set name, category, execution_mode
    3. Implement is_applicable(), scan(), and parse_output()
    4. Register in the scanner registry
    """

    # Scanner identity (override in subclass)
    name: str = ""
    description: str = ""
    category: ScannerCategory = ScannerCategory.CUSTOM
    execution_mode: ExecutionMode = ExecutionMode.SUBPROCESS
    version: str = "1.0.0"

    # Execution defaults
    default_timeout: int = {SCANNER_TIMEOUT}
    supports_sarif: bool = False

    # Language/technology applicability
    applicable_languages: list[str] = []  # Empty = all languages
    applicable_frameworks: list[str] = []
    requires_files: list[str] = []  # e.g., ["requirements.txt", "package.json"]

    def __init__(self, config: dict | None = None):
        self.config = config or {}
        self.logger = __import__("loguru").logger.bind(scanner=self.name)

    @abc.abstractmethod
    def is_applicable(self, target_path: str, detected_tech: dict) -> bool:
        """Check if this scanner applies to the given target.

        Args:
            target_path: Path to scan target (repo, image, etc.)
            detected_tech: Output of technology detection
                {"languages": ["python", "go"], "frameworks": ["fastapi"],
                 "has_iac": True, "has_docker": True, ...}

        Returns:
            True if scanner should run against this target
        """
        ...

    @abc.abstractmethod
    def build_command(self, target_path: str, output_path: str) -> list[str]:
        """Build the CLI command to execute.

        Args:
            target_path: Path to scan target
            output_path: Path to write scanner output

        Returns:
            Command as list of strings (e.g., ["semgrep", "--json", ...])
        """
        ...

    @abc.abstractmethod
    def parse_output(self, raw_output: str, output_path: str) -> list[Vulnerability]:
        """Parse scanner output into normalized vulnerabilities.

        Args:
            raw_output: stdout from scanner execution
            output_path: Path to output file (if scanner writes to file)

        Returns:
            List of normalized Vulnerability objects
        """
        ...

    def scan(self, target_path: str, output_dir: str, timeout: int | None = None) -> ScanResult:
        """Execute the full scan lifecycle.

        This is the main entry point. Override only if you need custom
        execution logic (e.g., remote API scanners).

        Default implementation:
        1. Build command
        2. Execute via configured execution mode
        3. Parse output
        4. Return ScanResult
        """
        timeout = timeout or self.default_timeout
        output_path = f"{output_dir}/{self.name}.json"
        result = ScanResult(
            scanner_name=self.name,
            scanner_category=self.category,
        )

        try:
            cmd = self.build_command(target_path, output_path)
            self.logger.info(f"Running: {' '.join(cmd[:5])}...")

            # Execute via appropriate runner
            from src.scanners.execution import get_runner
            runner = get_runner(self.execution_mode)
            exec_result = runner.run(
                cmd, cwd=target_path, timeout=timeout,
                scanner_name=self.name,
            )

            result.exit_code = exec_result.exit_code
            result.raw_output = exec_result.stdout
            result.duration_seconds = exec_result.duration

            # Save raw output
            if exec_result.stdout:
                import os
                os.makedirs(output_dir, exist_ok=True)
                with open(output_path, "w") as f:
                    f.write(exec_result.stdout)
                result.raw_output_path = output_path

            # Parse results
            vulnerabilities = self.parse_output(exec_result.stdout, output_path)
            for v in vulnerabilities:
                v.scanner_name = self.name
                v.scanner_category = self.category
                v.compute_fingerprint()
            result.vulnerabilities = vulnerabilities
            result.status = ScanStatus.SUCCESS

        except TimeoutError:
            result.status = ScanStatus.TIMEOUT
            result.error = f"Scanner timed out after {timeout}s"
            result.error_type = "timeout"
        except Exception as e:
            result.status = ScanStatus.FAILED
            result.error = str(e)
            result.error_type = "crash"
            self.logger.error(f"Scanner failed: {e}")

        result.completed_at = datetime.utcnow()
        return result

    # Severity mapping helper
    SEVERITY_MAP: dict[str, Severity] = {
        "critical": Severity.CRITICAL,
        "high": Severity.HIGH,
        "medium": Severity.MEDIUM,
        "moderate": Severity.MEDIUM,
        "low": Severity.LOW,
        "info": Severity.INFO,
        "informational": Severity.INFO,
        "warning": Severity.MEDIUM,
        "error": Severity.HIGH,
    }

    def map_severity(self, raw_severity: str) -> Severity:
        """Map scanner-specific severity to normalized Severity enum."""
        return self.SEVERITY_MAP.get(raw_severity.lower(), Severity.UNKNOWN)
```

### 2.3 Scanner Registry

```python
# src/scanners/registry.py
"""Scanner registry — discover, register, and lookup scanners."""

from typing import Optional
from loguru import logger
from src.scanners.base import BaseScanner, ScannerCategory, ExecutionMode


class ScannerRegistry:
    """Central registry for all scanner plugins.

    Scanners register themselves at import time or via explicit registration.
    The orchestrator queries the registry to determine which scanners to run.
    """

    def __init__(self):
        self._scanners: dict[str, BaseScanner] = {}

    def register(self, scanner: BaseScanner) -> None:
        """Register a scanner plugin."""
        self._scanners[scanner.name] = scanner
        logger.info(f"Registered scanner: {scanner.name} ({scanner.category.value})")

    def get(self, name: str) -> Optional[BaseScanner]:
        """Get a scanner by name."""
        return self._scanners.get(name)

    def list_all(self) -> list[dict]:
        """List all registered scanners."""
        return [
            {
                "name": s.name,
                "description": s.description,
                "category": s.category.value,
                "execution_mode": s.execution_mode.value,
                "languages": s.applicable_languages,
                "supports_sarif": s.supports_sarif,
            }
            for s in self._scanners.values()
        ]

    def find_applicable(self, detected_tech: dict) -> list[BaseScanner]:
        """Find all scanners applicable to the detected technology stack."""
        applicable = []
        for scanner in self._scanners.values():
            try:
                # Pass a dummy target_path — actual check uses detected_tech
                if scanner.is_applicable("", detected_tech):
                    applicable.append(scanner)
            except Exception as e:
                logger.warning(f"Scanner {scanner.name} applicability check failed: {e}")
        return applicable

    def find_by_category(self, category: ScannerCategory) -> list[BaseScanner]:
        """Find all scanners in a category."""
        return [s for s in self._scanners.values() if s.category == category]

    def find_by_name(self, names: list[str]) -> list[BaseScanner]:
        """Find scanners by explicit name list."""
        return [self._scanners[n] for n in names if n in self._scanners]


# Global registry instance
_registry = ScannerRegistry()


def get_registry() -> ScannerRegistry:
    """Get the global scanner registry."""
    return _registry


def register_scanner(scanner: BaseScanner) -> None:
    """Register a scanner in the global registry."""
    _registry.register(scanner)
```

> **AuditGH Reference:** The production base scanner at `src/scanners/base.py` defines `BaseScanner` with `is_applicable()`, `scan()`, and `_run_command()` methods. Scanner registration is handled via `is_scanner_enabled()` in `scripts/scanning/scan_repos.py` which checks environment variables. This plan formalizes that into a proper registry pattern.

---

## 3. Execution Models

### 3.1 Execution Result

```python
# src/scanners/execution/__init__.py
"""Execution layer — run scanners via subprocess, container, or remote API."""

from dataclasses import dataclass
from src.scanners.base import ExecutionMode


@dataclass
class ExecutionResult:
    """Result from any execution runner."""
    exit_code: int = 0
    stdout: str = ""
    stderr: str = ""
    duration: float = 0.0
    timed_out: bool = False
    killed: bool = False


def get_runner(mode: ExecutionMode):
    """Get the appropriate execution runner."""
    if mode == ExecutionMode.SUBPROCESS:
        from src.scanners.execution.subprocess_runner import SubprocessRunner
        return SubprocessRunner()
    elif mode == ExecutionMode.CONTAINER:
        from src.scanners.execution.container_runner import ContainerRunner
        return ContainerRunner()
    elif mode == ExecutionMode.REMOTE:
        from src.scanners.execution.remote_runner import RemoteRunner
        return RemoteRunner()
    raise ValueError(f"Unknown execution mode: {mode}")
```

### 3.2 Safe Subprocess Runner

```python
# src/scanners/execution/subprocess_runner.py
"""Safe subprocess execution with strict timeout and process tree killing."""

import os
import signal
import subprocess
import time
import psutil
from loguru import logger
from src.scanners.execution import ExecutionResult


class SubprocessRunner:
    """Execute scanner CLI tools as subprocesses.

    Safety features:
    - Strict timeout with process tree killing (not just the parent)
    - stdin closure to prevent interactive prompts hanging
    - Partial output capture on timeout
    - Resource limit enforcement
    """

    def run(
        self,
        cmd: list[str],
        cwd: str = "",
        timeout: int = {SCANNER_TIMEOUT},
        env: dict[str, str] | None = None,
        scanner_name: str = "",
    ) -> ExecutionResult:
        """Run a command with strict timeout handling."""
        start_time = time.time()
        result = ExecutionResult()

        # Merge environment
        full_env = os.environ.copy()
        if env:
            full_env.update(env)

        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,  # Prevent interactive hangs
                cwd=cwd or None,
                env=full_env,
                preexec_fn=os.setsid if os.name != "nt" else None,
            )

            try:
                stdout, stderr = process.communicate(timeout=timeout)
                result.exit_code = process.returncode
                result.stdout = stdout.decode("utf-8", errors="replace")
                result.stderr = stderr.decode("utf-8", errors="replace")

            except subprocess.TimeoutExpired:
                logger.warning(f"Scanner {scanner_name} timed out after {timeout}s, killing process tree")
                result.timed_out = True
                result.killed = True

                # Kill entire process tree
                self._kill_process_tree(process.pid)

                # Capture partial output
                try:
                    stdout, stderr = process.communicate(timeout=5)
                    result.stdout = stdout.decode("utf-8", errors="replace")
                    result.stderr = stderr.decode("utf-8", errors="replace")
                except Exception:
                    pass

                result.exit_code = -1
                raise TimeoutError(f"Scanner {scanner_name} timed out after {timeout}s")

        except TimeoutError:
            raise
        except Exception as e:
            result.exit_code = -1
            result.stderr = str(e)

        result.duration = time.time() - start_time
        return result

    def _kill_process_tree(self, pid: int) -> None:
        """Kill a process and all its children."""
        try:
            parent = psutil.Process(pid)
            children = parent.children(recursive=True)

            # Kill children first
            for child in children:
                try:
                    child.kill()
                except psutil.NoSuchProcess:
                    pass

            # Kill parent
            try:
                parent.kill()
            except psutil.NoSuchProcess:
                pass

            # Wait for cleanup
            psutil.wait_procs(children + [parent], timeout=5)

        except psutil.NoSuchProcess:
            pass
        except Exception as e:
            logger.error(f"Failed to kill process tree {pid}: {e}")
            # Fallback: kill process group
            try:
                os.killpg(os.getpgid(pid), signal.SIGKILL)
            except Exception:
                pass
```

### 3.3 Container Runner

```python
# src/scanners/execution/container_runner.py
"""Docker container execution for isolated scanner runs."""

import subprocess
import time
import uuid
from loguru import logger
from src.scanners.execution import ExecutionResult


class ContainerRunner:
    """Execute scanners inside Docker containers.

    Benefits:
    - Complete filesystem isolation
    - Resource limits (CPU, memory)
    - Consistent tool versions
    - No host system pollution
    """

    def __init__(
        self,
        image: str = "{SCANNER_IMAGE}",
        memory_limit: str = "2g",
        cpu_limit: str = "2.0",
    ):
        self.image = image
        self.memory_limit = memory_limit
        self.cpu_limit = cpu_limit

    def run(
        self,
        cmd: list[str],
        cwd: str = "",
        timeout: int = {SCANNER_TIMEOUT},
        env: dict[str, str] | None = None,
        scanner_name: str = "",
    ) -> ExecutionResult:
        """Run scanner command inside a Docker container."""
        container_name = f"scan-{scanner_name}-{uuid.uuid4().hex[:8]}"
        start_time = time.time()
        result = ExecutionResult()

        docker_cmd = [
            "docker", "run",
            "--rm",
            "--name", container_name,
            "--memory", self.memory_limit,
            "--cpus", self.cpu_limit,
            "--network", "none",  # No network access for security
            "--read-only",        # Read-only filesystem
            "--tmpfs", "/tmp:rw,size=512m",
        ]

        # Mount target directory
        if cwd:
            docker_cmd.extend(["-v", f"{cwd}:/workspace:ro"])
            docker_cmd.extend(["-w", "/workspace"])

        # Environment variables
        if env:
            for k, v in env.items():
                docker_cmd.extend(["-e", f"{k}={v}"])

        docker_cmd.append(self.image)
        docker_cmd.extend(cmd)

        try:
            proc = subprocess.run(
                docker_cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                stdin=subprocess.DEVNULL,
            )
            result.exit_code = proc.returncode
            result.stdout = proc.stdout
            result.stderr = proc.stderr

        except subprocess.TimeoutExpired:
            logger.warning(f"Container {container_name} timed out, force removing")
            subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)
            result.timed_out = True
            result.killed = True
            raise TimeoutError(f"Container scanner {scanner_name} timed out after {timeout}s")

        result.duration = time.time() - start_time
        return result
```

### 3.4 Remote API Runner

```python
# src/scanners/execution/remote_runner.py
"""Remote API / SaaS scanner execution."""

import httpx
import time
from loguru import logger
from src.scanners.execution import ExecutionResult


class RemoteRunner:
    """Execute scanners via remote API calls (SaaS integrations).

    Supports:
    - Synchronous API calls (request → response)
    - Async polling (submit → poll → fetch results)
    - Webhook callbacks (submit → wait for webhook)
    """

    def __init__(self, timeout: int = 300):
        self.client = httpx.Client(timeout=timeout)

    def run(
        self,
        cmd: list[str],  # Not used for remote — use config instead
        cwd: str = "",
        timeout: int = {SCANNER_TIMEOUT},
        env: dict[str, str] | None = None,
        scanner_name: str = "",
        **kwargs,
    ) -> ExecutionResult:
        """Execute a remote scanner via API.

        For remote scanners, the 'cmd' parameter is repurposed:
        cmd[0] = HTTP method (GET, POST)
        cmd[1] = URL
        cmd[2:] = Additional args encoded as JSON

        Override this method in specific remote scanner implementations.
        """
        result = ExecutionResult()
        start_time = time.time()

        method = kwargs.get("method", "POST")
        url = kwargs.get("url", "")
        headers = kwargs.get("headers", {})
        payload = kwargs.get("payload", {})

        try:
            response = self.client.request(
                method, url, headers=headers, json=payload, timeout=timeout
            )
            result.exit_code = 0 if response.is_success else response.status_code
            result.stdout = response.text

        except httpx.TimeoutException:
            result.timed_out = True
            raise TimeoutError(f"Remote scanner {scanner_name} timed out after {timeout}s")
        except Exception as e:
            result.exit_code = -1
            result.stderr = str(e)

        result.duration = time.time() - start_time
        return result

    def poll_for_results(
        self,
        check_url: str,
        headers: dict,
        poll_interval: int = 10,
        max_wait: int = 600,
    ) -> str:
        """Poll a remote API until results are ready."""
        elapsed = 0
        while elapsed < max_wait:
            response = self.client.get(check_url, headers=headers)
            data = response.json()

            if data.get("status") in ("completed", "finished", "done"):
                return response.text

            time.sleep(poll_interval)
            elapsed += poll_interval

        raise TimeoutError(f"Polling timed out after {max_wait}s")
```

> **AuditGH Reference:** Production uses the subprocess model via `src/safe_subprocess.py` with strict timeout handling, process tree killing, and stdin closure. All 30+ scanners execute as subprocesses with `subprocess.run()` in `scripts/scanning/scan_repos.py`. This plan adds container and remote execution models on top of the proven subprocess pattern.

---

## 4. Result Normalization & SARIF

### 4.1 SARIF Import/Export

```python
# src/scanners/parsers/sarif.py
"""SARIF (Static Analysis Results Interchange Format) support.

SARIF v2.1.0 is the industry standard for tool interchange.
Reference: https://docs.oasis-open.org/sarif/sarif/v2.1.0/
"""

import json
from typing import Any
from src.scanners.base import Vulnerability, Severity, ScanResult, ScannerCategory


# SARIF severity → our Severity mapping
SARIF_SEVERITY_MAP = {
    "error": Severity.HIGH,
    "warning": Severity.MEDIUM,
    "note": Severity.LOW,
    "none": Severity.INFO,
}

SARIF_LEVEL_MAP = {
    "critical": Severity.CRITICAL,
    "high": Severity.HIGH,
    "medium": Severity.MEDIUM,
    "low": Severity.LOW,
}


def parse_sarif(sarif_data: dict | str) -> list[Vulnerability]:
    """Parse a SARIF document into normalized Vulnerability objects.

    Args:
        sarif_data: SARIF JSON as dict or string

    Returns:
        List of normalized vulnerabilities
    """
    if isinstance(sarif_data, str):
        sarif_data = json.loads(sarif_data)

    vulnerabilities = []

    for run in sarif_data.get("runs", []):
        tool_name = run.get("tool", {}).get("driver", {}).get("name", "unknown")
        rules = {r["id"]: r for r in run.get("tool", {}).get("driver", {}).get("rules", [])}

        for result in run.get("results", []):
            rule_id = result.get("ruleId", "")
            rule = rules.get(rule_id, {})

            # Determine severity
            level = result.get("level", "warning")
            severity = SARIF_SEVERITY_MAP.get(level, Severity.MEDIUM)

            # Check for security-severity in rule properties
            if "properties" in rule:
                sec_sev = rule["properties"].get("security-severity", "")
                if sec_sev:
                    score = float(sec_sev)
                    if score >= 9.0:
                        severity = Severity.CRITICAL
                    elif score >= 7.0:
                        severity = Severity.HIGH
                    elif score >= 4.0:
                        severity = Severity.MEDIUM
                    else:
                        severity = Severity.LOW

            # Extract location
            locations = result.get("locations", [])
            file_path = ""
            line_start = 0
            line_end = 0
            if locations:
                physical = locations[0].get("physicalLocation", {})
                file_path = physical.get("artifactLocation", {}).get("uri", "")
                region = physical.get("region", {})
                line_start = region.get("startLine", 0)
                line_end = region.get("endLine", line_start)

            # Extract CWE from rule tags
            cwe_id = ""
            for tag in rule.get("properties", {}).get("tags", []):
                if tag.startswith("CWE-") or tag.startswith("cwe-"):
                    cwe_id = tag.upper()
                    break

            vuln = Vulnerability(
                title=result.get("message", {}).get("text", rule.get("shortDescription", {}).get("text", rule_id)),
                description=rule.get("fullDescription", {}).get("text", ""),
                severity=severity,
                rule_id=rule_id,
                cwe_id=cwe_id,
                file_path=file_path,
                line_start=line_start,
                line_end=line_end,
                scanner_name=tool_name,
                references=[
                    r.get("url", "") for r in rule.get("helpUri", [])
                    if isinstance(r, dict)
                ] if isinstance(rule.get("helpUri"), list) else (
                    [rule["helpUri"]] if rule.get("helpUri") else []
                ),
                raw_data=result,
            )
            vulnerabilities.append(vuln)

    return vulnerabilities


def export_sarif(scan_result: ScanResult, tool_version: str = "1.0.0") -> dict:
    """Export a ScanResult to SARIF v2.1.0 format.

    Args:
        scan_result: Normalized scan result
        tool_version: Version string for the tool

    Returns:
        SARIF document as dict
    """
    # Collect unique rules
    rules = {}
    results = []

    for vuln in scan_result.vulnerabilities:
        rule_id = vuln.rule_id or vuln.cve_id or f"finding-{vuln.fingerprint[:8]}"

        if rule_id not in rules:
            rules[rule_id] = {
                "id": rule_id,
                "shortDescription": {"text": vuln.title},
                "fullDescription": {"text": vuln.description},
                "properties": {
                    "tags": [vuln.cwe_id] if vuln.cwe_id else [],
                },
            }
            if vuln.cvss_score:
                rules[rule_id]["properties"]["security-severity"] = str(vuln.cvss_score)

        # Map severity to SARIF level
        level_map = {
            Severity.CRITICAL: "error",
            Severity.HIGH: "error",
            Severity.MEDIUM: "warning",
            Severity.LOW: "note",
            Severity.INFO: "none",
        }

        sarif_result: dict[str, Any] = {
            "ruleId": rule_id,
            "level": level_map.get(vuln.severity, "warning"),
            "message": {"text": vuln.title},
        }

        if vuln.file_path:
            sarif_result["locations"] = [{
                "physicalLocation": {
                    "artifactLocation": {"uri": vuln.file_path},
                    "region": {
                        "startLine": vuln.line_start or 1,
                        "endLine": vuln.line_end or vuln.line_start or 1,
                    },
                },
            }]

        results.append(sarif_result)

    return {
        "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {
                "driver": {
                    "name": scan_result.scanner_name,
                    "version": tool_version,
                    "rules": list(rules.values()),
                },
            },
            "results": results,
        }],
    }
```

### 4.2 Scanner-Specific Parsers

```python
# src/scanners/parsers/semgrep.py
"""Semgrep output parser."""

import json
from src.scanners.base import Vulnerability, Severity


def parse_semgrep(raw_output: str) -> list[Vulnerability]:
    """Parse Semgrep JSON output into normalized vulnerabilities."""
    try:
        data = json.loads(raw_output)
    except json.JSONDecodeError:
        return []

    vulnerabilities = []
    for result in data.get("results", []):
        severity_map = {
            "ERROR": Severity.HIGH,
            "WARNING": Severity.MEDIUM,
            "INFO": Severity.LOW,
        }

        extra = result.get("extra", {})
        metadata = extra.get("metadata", {})

        vuln = Vulnerability(
            title=result.get("check_id", ""),
            description=extra.get("message", ""),
            severity=severity_map.get(extra.get("severity", ""), Severity.MEDIUM),
            rule_id=result.get("check_id", ""),
            cwe_id=",".join(metadata.get("cwe", [])) if metadata.get("cwe") else "",
            file_path=result.get("path", ""),
            line_start=result.get("start", {}).get("line", 0),
            line_end=result.get("end", {}).get("line", 0),
            code_snippet=extra.get("lines", ""),
            references=metadata.get("references", []),
            tags=metadata.get("tags", []),
        )
        vulnerabilities.append(vuln)

    return vulnerabilities


# src/scanners/parsers/gitleaks.py
"""Gitleaks output parser."""

import json
from src.scanners.base import Vulnerability, Severity


def parse_gitleaks(raw_output: str) -> list[Vulnerability]:
    """Parse Gitleaks JSON output into normalized vulnerabilities."""
    try:
        data = json.loads(raw_output)
    except json.JSONDecodeError:
        return []

    if not isinstance(data, list):
        return []

    vulnerabilities = []
    for leak in data:
        vuln = Vulnerability(
            title=f"Secret detected: {leak.get('RuleID', 'unknown')}",
            description=leak.get("Description", "Potential secret or credential found"),
            severity=Severity.HIGH,  # Secrets are always high severity
            rule_id=leak.get("RuleID", ""),
            file_path=leak.get("File", ""),
            line_start=leak.get("StartLine", 0),
            line_end=leak.get("EndLine", 0),
            code_snippet=leak.get("Match", "")[: 200],  # Truncate match
            tags=["secret", leak.get("RuleID", "")],
        )
        vulnerabilities.append(vuln)

    return vulnerabilities


# src/scanners/parsers/trivy.py
"""Trivy output parser."""

import json
from src.scanners.base import Vulnerability, Severity


def parse_trivy(raw_output: str) -> list[Vulnerability]:
    """Parse Trivy JSON output into normalized vulnerabilities."""
    try:
        data = json.loads(raw_output)
    except json.JSONDecodeError:
        return []

    vulnerabilities = []
    for result in data.get("Results", []):
        target = result.get("Target", "")
        for vuln_data in result.get("Vulnerabilities", []):
            vuln = Vulnerability(
                title=f"{vuln_data.get('VulnerabilityID', '')}: {vuln_data.get('Title', '')}",
                description=vuln_data.get("Description", ""),
                severity=Severity[vuln_data.get("Severity", "UNKNOWN").upper()]
                    if vuln_data.get("Severity", "").upper() in Severity.__members__
                    else Severity.UNKNOWN,
                cve_id=vuln_data.get("VulnerabilityID", ""),
                package_name=vuln_data.get("PkgName", ""),
                package_version=vuln_data.get("InstalledVersion", ""),
                fixed_version=vuln_data.get("FixedVersion", ""),
                cvss_score=vuln_data.get("CVSS", {}).get("nvd", {}).get("V3Score", 0.0),
                file_path=target,
                references=vuln_data.get("References", [])[:5],
            )
            vulnerabilities.append(vuln)

    return vulnerabilities
```

> **AuditGH Reference:** Each `run_*()` function in `scripts/scanning/scan_repos.py` has inline JSON parsing logic specific to each scanner. CodeQL produces SARIF natively, while Semgrep, Trivy, Gitleaks, and others produce custom JSON. This plan extracts those parsers into dedicated modules with a common `parse_*() → list[Vulnerability]` interface.

---

## 5. Repository Management

### 5.1 Git Repository Target

```python
# src/scanners/targets/git_repo.py
"""Git repository cloning and workspace management."""

import os
import shutil
import tempfile
import subprocess
from dataclasses import dataclass
from loguru import logger


@dataclass
class CloneResult:
    """Result of a repository clone operation."""
    success: bool
    local_path: str = ""
    error: str = ""
    clone_duration: float = 0.0
    repo_size_mb: float = 0.0


class GitRepoTarget:
    """Manage git repository clone, workspace, and cleanup.

    Features:
    - Shallow clone (--depth 1) for speed
    - Token-based authentication
    - Workspace isolation (temp directory per scan)
    - Automatic cleanup
    - Optional full history fetch for commit analysis
    """

    def __init__(self, base_dir: str = ""):
        self.base_dir = base_dir or tempfile.mkdtemp(prefix="scan_")

    def clone(
        self,
        repo_url: str,
        repo_name: str,
        token: str = "",
        shallow: bool = True,
        branch: str = "",
    ) -> CloneResult:
        """Clone a repository into a workspace directory.

        Args:
            repo_url: Git clone URL (https://github.com/org/repo.git)
            repo_name: Human-readable name (org/repo)
            token: GitHub/GitLab access token for private repos
            shallow: Use --depth 1 for speed (default True)
            branch: Specific branch to clone (default: default branch)

        Returns:
            CloneResult with local_path to cloned repo
        """
        import time
        start = time.time()

        # Inject token into URL for authentication
        if token and "github.com" in repo_url:
            repo_url = repo_url.replace(
                "https://github.com",
                f"https://x-access-token:{token}@github.com",
            )

        local_path = os.path.join(self.base_dir, repo_name.replace("/", "_"))

        cmd = ["git", "clone"]
        if shallow:
            cmd.extend(["--depth", "1"])
        if branch:
            cmd.extend(["--branch", branch])
        cmd.extend([repo_url, local_path])

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=300,
                env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
            )

            if result.returncode != 0:
                return CloneResult(success=False, error=result.stderr)

            # Calculate size
            total_size = sum(
                os.path.getsize(os.path.join(dp, f))
                for dp, _, filenames in os.walk(local_path)
                for f in filenames
            )

            return CloneResult(
                success=True,
                local_path=local_path,
                clone_duration=time.time() - start,
                repo_size_mb=total_size / (1024 * 1024),
            )

        except subprocess.TimeoutExpired:
            return CloneResult(success=False, error="Clone timed out after 300s")
        except Exception as e:
            return CloneResult(success=False, error=str(e))

    def fetch_full_history(self, local_path: str) -> bool:
        """Fetch full git history (for commit analysis, blame, etc.)."""
        try:
            subprocess.run(
                ["git", "fetch", "--unshallow"],
                cwd=local_path, capture_output=True, timeout=600,
            )
            return True
        except Exception:
            # Fallback: fetch limited history
            try:
                subprocess.run(
                    ["git", "fetch", "--depth=500"],
                    cwd=local_path, capture_output=True, timeout=300,
                )
                return True
            except Exception:
                return False

    def cleanup(self, local_path: str = "") -> None:
        """Remove cloned repository."""
        path = local_path or self.base_dir
        if os.path.exists(path):
            shutil.rmtree(path, ignore_errors=True)
            logger.debug(f"Cleaned up workspace: {path}")

    def cleanup_all(self) -> None:
        """Remove the entire base directory."""
        self.cleanup(self.base_dir)
```

> **AuditGH Reference:** Production clone logic at `execution/clone_repo.py` uses shallow clone with `x-access-token` authentication. The workspace is created with `setup_temp_dir()` and cleaned after scan. `KEEP_CLONES` env var retains clones for debugging.

---

## 6. Technology Detection

### 6.1 Language and Framework Detection

```python
# src/scanners/detection/languages.py
"""Detect programming languages and frameworks in a repository."""

import os
from collections import Counter
from dataclasses import dataclass, field


# File extension → language mapping
EXTENSION_MAP = {
    ".py": "python", ".pyi": "python",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".go": "go",
    ".java": "java", ".kt": "kotlin",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".cpp": "cpp", ".cc": "cpp", ".c": "c", ".h": "c",
    ".rs": "rust",
    ".swift": "swift",
    ".scala": "scala",
    ".r": "r", ".R": "r",
}

# File patterns that indicate specific technologies
INDICATOR_FILES = {
    "requirements.txt": "python",
    "Pipfile": "python",
    "pyproject.toml": "python",
    "setup.py": "python",
    "package.json": "javascript",
    "yarn.lock": "javascript",
    "pnpm-lock.yaml": "javascript",
    "go.mod": "go",
    "go.sum": "go",
    "pom.xml": "java",
    "build.gradle": "java",
    "Gemfile": "ruby",
    "composer.json": "php",
    "Cargo.toml": "rust",
    "Package.swift": "swift",
}

# IaC file indicators
IAC_INDICATORS = {
    "Dockerfile": "docker",
    "docker-compose.yml": "docker-compose",
    "docker-compose.yaml": "docker-compose",
    ".tf": "terraform",
    "serverless.yml": "serverless",
    "template.yaml": "cloudformation",  # SAM
    "cdk.json": "aws-cdk",
    "pulumi.yaml": "pulumi",
}


@dataclass
class TechDetectionResult:
    """Result of technology detection on a scan target."""
    languages: list[str] = field(default_factory=list)
    primary_language: str = ""
    frameworks: list[str] = field(default_factory=list)
    has_iac: bool = False
    iac_types: list[str] = field(default_factory=list)
    has_docker: bool = False
    has_ci: bool = False
    package_managers: list[str] = field(default_factory=list)
    file_count: int = 0
    total_lines: int = 0


def detect_technologies(repo_path: str) -> TechDetectionResult:
    """Detect all technologies in a repository.

    Walks the repository, identifies languages by file extension,
    detects frameworks by config files, and finds IaC artifacts.
    """
    result = TechDetectionResult()
    lang_counter: Counter = Counter()

    for root, dirs, files in os.walk(repo_path):
        # Skip hidden dirs and common non-code dirs
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in {
            "node_modules", "vendor", "venv", ".venv", "__pycache__",
            "dist", "build", "target", ".git",
        }]

        for filename in files:
            result.file_count += 1
            filepath = os.path.join(root, filename)

            # Language detection by extension
            _, ext = os.path.splitext(filename)
            if ext in EXTENSION_MAP:
                lang_counter[EXTENSION_MAP[ext]] += 1

            # Indicator files
            if filename in INDICATOR_FILES:
                lang_counter[INDICATOR_FILES[filename]] += 1

            # IaC detection
            if filename in IAC_INDICATORS:
                result.has_iac = True
                result.iac_types.append(IAC_INDICATORS[filename])
            elif ext == ".tf":
                result.has_iac = True
                if "terraform" not in result.iac_types:
                    result.iac_types.append("terraform")

            # Docker detection
            if filename in ("Dockerfile", "docker-compose.yml", "docker-compose.yaml"):
                result.has_docker = True

            # CI detection
            if filename in (".github", ".gitlab-ci.yml", "Jenkinsfile", ".circleci"):
                result.has_ci = True

            # Package manager detection
            pkg_mgr_map = {
                "requirements.txt": "pip",
                "Pipfile": "pipenv",
                "pyproject.toml": "poetry",
                "package.json": "npm",
                "yarn.lock": "yarn",
                "pnpm-lock.yaml": "pnpm",
                "go.mod": "go",
                "Gemfile": "bundler",
                "pom.xml": "maven",
                "build.gradle": "gradle",
                "Cargo.toml": "cargo",
                "composer.json": "composer",
            }
            if filename in pkg_mgr_map:
                pm = pkg_mgr_map[filename]
                if pm not in result.package_managers:
                    result.package_managers.append(pm)

    # Finalize
    if lang_counter:
        result.languages = [lang for lang, _ in lang_counter.most_common()]
        result.primary_language = result.languages[0]

    # Detect frameworks
    result.frameworks = detect_frameworks(repo_path, result.languages)

    return result


def detect_frameworks(repo_path: str, languages: list[str]) -> list[str]:
    """Detect web frameworks based on dependency files."""
    frameworks = []

    FRAMEWORK_PATTERNS = {
        "python": {
            "fastapi": ["fastapi", "starlette"],
            "flask": ["flask"],
            "django": ["django"],
        },
        "javascript": {
            "express": ["express"],
            "nextjs": ["next"],
            "react": ["react"],
            "vue": ["vue"],
            "angular": ["@angular/core"],
        },
        "go": {
            "gin": ["github.com/gin-gonic/gin"],
            "echo": ["github.com/labstack/echo"],
            "fiber": ["github.com/gofiber/fiber"],
        },
        "java": {
            "spring": ["spring-boot", "spring-web"],
        },
        "ruby": {
            "rails": ["rails"],
            "sinatra": ["sinatra"],
        },
    }

    for lang in languages:
        if lang not in FRAMEWORK_PATTERNS:
            continue
        for framework, indicators in FRAMEWORK_PATTERNS[lang].items():
            if _check_dependency_file(repo_path, lang, indicators):
                frameworks.append(framework)

    return frameworks


def _check_dependency_file(repo_path: str, lang: str, indicators: list[str]) -> bool:
    """Check if a dependency file contains framework indicators."""
    dep_files = {
        "python": ["requirements.txt", "Pipfile", "pyproject.toml"],
        "javascript": ["package.json"],
        "go": ["go.mod"],
        "java": ["pom.xml", "build.gradle"],
        "ruby": ["Gemfile"],
    }

    for dep_file in dep_files.get(lang, []):
        path = os.path.join(repo_path, dep_file)
        if os.path.exists(path):
            try:
                content = open(path).read().lower()
                if any(ind.lower() in content for ind in indicators):
                    return True
            except Exception:
                pass
    return False
```

> **AuditGH Reference:** Production tech detection at `execution/detect_tech.py` maps file extensions to languages and checks for IaC files. Framework detection at `execution/scan_api.py` (lines 45-74) identifies FastAPI, Express, Spring, Gin, and others. Scanner selection in `scan_repos.py` routes to language-specific scanners based on detected tech.

---

## 7. Scanner Implementations

### 7.1 Semgrep (SAST)

```python
# src/scanners/tools/sast/semgrep.py
"""Semgrep SAST scanner plugin."""

from src.scanners.base import BaseScanner, ScannerCategory, ExecutionMode, Vulnerability
from src.scanners.parsers.semgrep import parse_semgrep


class SemgrepScanner(BaseScanner):
    name = "semgrep"
    description = "Static analysis using Semgrep rules (SAST)"
    category = ScannerCategory.SAST
    execution_mode = ExecutionMode.SUBPROCESS
    default_timeout = 600
    supports_sarif = True
    applicable_languages = ["python", "javascript", "typescript", "go", "java", "ruby", "php", "csharp", "kotlin"]

    def is_applicable(self, target_path: str, detected_tech: dict) -> bool:
        languages = detected_tech.get("languages", [])
        return any(lang in self.applicable_languages for lang in languages)

    def build_command(self, target_path: str, output_path: str) -> list[str]:
        config = self.config.get("config", "auto")
        return [
            "semgrep", "scan",
            "--config", config,
            "--json",
            "--output", output_path,
            "--no-git-ignore",
            "--timeout", str(self.config.get("rule_timeout", 30)),
            target_path,
        ]

    def parse_output(self, raw_output: str, output_path: str) -> list[Vulnerability]:
        import os
        # Prefer file output over stdout (more reliable)
        if os.path.exists(output_path):
            with open(output_path) as f:
                return parse_semgrep(f.read())
        return parse_semgrep(raw_output)
```

### 7.2 Gitleaks (Secrets)

```python
# src/scanners/tools/secrets/gitleaks.py
"""Gitleaks secret scanner plugin."""

from src.scanners.base import BaseScanner, ScannerCategory, ExecutionMode, Vulnerability
from src.scanners.parsers.gitleaks import parse_gitleaks


class GitleaksScanner(BaseScanner):
    name = "gitleaks"
    description = "Detect secrets, API keys, and credentials in source code"
    category = ScannerCategory.SECRETS
    execution_mode = ExecutionMode.SUBPROCESS
    default_timeout = 300
    applicable_languages = []  # Applies to all languages

    def is_applicable(self, target_path: str, detected_tech: dict) -> bool:
        return True  # Secrets can be in any repo

    def build_command(self, target_path: str, output_path: str) -> list[str]:
        return [
            "gitleaks", "detect",
            "--source", target_path,
            "--report-format", "json",
            "--report-path", output_path,
            "--no-banner",
        ]

    def parse_output(self, raw_output: str, output_path: str) -> list[Vulnerability]:
        import os
        if os.path.exists(output_path):
            with open(output_path) as f:
                return parse_gitleaks(f.read())
        return parse_gitleaks(raw_output)
```

### 7.3 Trivy (Dependencies / SCA)

```python
# src/scanners/tools/deps/trivy.py
"""Trivy filesystem vulnerability scanner plugin."""

from src.scanners.base import BaseScanner, ScannerCategory, ExecutionMode, Vulnerability
from src.scanners.parsers.trivy import parse_trivy


class TrivyFSScanner(BaseScanner):
    name = "trivy"
    description = "Vulnerability scanning for dependencies and OS packages"
    category = ScannerCategory.DEPS
    execution_mode = ExecutionMode.SUBPROCESS
    default_timeout = 300
    applicable_languages = []  # Scans any project with dependency files

    def is_applicable(self, target_path: str, detected_tech: dict) -> bool:
        return bool(detected_tech.get("package_managers"))

    def build_command(self, target_path: str, output_path: str) -> list[str]:
        return [
            "trivy", "fs",
            "--format", "json",
            "--output", output_path,
            "--severity", "CRITICAL,HIGH,MEDIUM,LOW",
            target_path,
        ]

    def parse_output(self, raw_output: str, output_path: str) -> list[Vulnerability]:
        import os
        if os.path.exists(output_path):
            with open(output_path) as f:
                return parse_trivy(f.read())
        return parse_trivy(raw_output)
```

### 7.4 Checkov (IaC)

```python
# src/scanners/tools/iac/checkov.py
"""Checkov Infrastructure-as-Code scanner plugin."""

import json
from src.scanners.base import BaseScanner, ScannerCategory, ExecutionMode, Vulnerability, Severity


class CheckovScanner(BaseScanner):
    name = "checkov"
    description = "Infrastructure-as-Code security scanning (Terraform, K8s, Docker, CloudFormation)"
    category = ScannerCategory.IAC
    execution_mode = ExecutionMode.SUBPROCESS
    default_timeout = 600

    def is_applicable(self, target_path: str, detected_tech: dict) -> bool:
        return detected_tech.get("has_iac", False)

    def build_command(self, target_path: str, output_path: str) -> list[str]:
        return [
            "checkov",
            "--directory", target_path,
            "--output", "json",
            "--output-file-path", output_path,
            "--quiet",
            "--compact",
        ]

    def parse_output(self, raw_output: str, output_path: str) -> list[Vulnerability]:
        import os
        content = raw_output
        if os.path.exists(output_path):
            with open(output_path) as f:
                content = f.read()

        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            return []

        vulnerabilities = []
        results = data if isinstance(data, list) else [data]

        for check_type in results:
            for failed in check_type.get("results", {}).get("failed_checks", []):
                vuln = Vulnerability(
                    title=f"{failed.get('check_id', '')}: {failed.get('check_result', {}).get('name', '')}",
                    description=failed.get("description", ""),
                    severity=self._map_checkov_severity(failed.get("severity", "")),
                    rule_id=failed.get("check_id", ""),
                    file_path=failed.get("file_path", ""),
                    line_start=failed.get("file_line_range", [0, 0])[0],
                    line_end=failed.get("file_line_range", [0, 0])[1],
                    tags=["iac", check_type.get("check_type", "")],
                )
                vulnerabilities.append(vuln)

        return vulnerabilities

    def _map_checkov_severity(self, severity: str) -> Severity:
        return {"CRITICAL": Severity.CRITICAL, "HIGH": Severity.HIGH,
                "MEDIUM": Severity.MEDIUM, "LOW": Severity.LOW}.get(
            severity.upper(), Severity.MEDIUM
        )
```

### 7.5 Registering All Scanners

```python
# src/scanners/tools/__init__.py
"""Register all scanner plugins."""

from src.scanners.registry import register_scanner
from src.scanners.tools.sast.semgrep import SemgrepScanner
from src.scanners.tools.secrets.gitleaks import GitleaksScanner
from src.scanners.tools.deps.trivy import TrivyFSScanner
from src.scanners.tools.iac.checkov import CheckovScanner


def register_all_scanners():
    """Register all built-in scanner plugins."""
    register_scanner(SemgrepScanner())
    register_scanner(GitleaksScanner())
    register_scanner(TrivyFSScanner())
    register_scanner(CheckovScanner())
    # Add more scanners here...
```

---

## 8. Scan Orchestration

### 8.1 Scan Orchestrator

```python
# src/scanners/orchestrator.py
"""Scan orchestration — coordinate scanners against targets."""

import asyncio
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from loguru import logger
from src.scanners.base import ScanResult, ScanStatus, BaseScanner
from src.scanners.registry import get_registry
from src.scanners.targets.git_repo import GitRepoTarget, CloneResult
from src.scanners.detection.languages import detect_technologies, TechDetectionResult
from src.scanners.deduplication import deduplicate_findings


@dataclass
class ScanJob:
    """A complete scan job encompassing multiple scanners against one target."""
    job_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    target_name: str = ""
    target_url: str = ""
    organization_id: str = ""
    triggered_by: str = "manual"  # manual, schedule, webhook, api

    # State
    status: ScanStatus = ScanStatus.PENDING
    started_at: datetime | None = None
    completed_at: datetime | None = None

    # Results
    scanner_results: list[ScanResult] = field(default_factory=list)
    total_findings: int = 0
    detected_tech: TechDetectionResult | None = None

    # Config overrides
    scanner_whitelist: list[str] = field(default_factory=list)  # Run only these
    scanner_blacklist: list[str] = field(default_factory=list)  # Skip these
    scan_profile: str = "balanced"  # fast, balanced, deep


class ScanOrchestrator:
    """Orchestrate multi-scanner scans against targets.

    Workflow:
    1. Clone/prepare target
    2. Detect technologies
    3. Select applicable scanners
    4. Execute scanners (sequential or parallel by profile)
    5. Collect and deduplicate results
    6. Ingest into database
    7. Cleanup workspace
    """

    # Scanning profiles control parallelism and scanner selection
    PROFILES = {
        "fast": {
            "parallel": False,
            "categories": ["secrets", "deps"],
            "max_scanners": 5,
        },
        "balanced": {
            "parallel": False,  # Sequential to avoid resource contention
            "categories": ["secrets", "deps", "sast", "iac"],
            "max_scanners": 15,
        },
        "deep": {
            "parallel": False,
            "categories": ["secrets", "deps", "sast", "iac", "sca", "api", "container"],
            "max_scanners": 30,
        },
    }

    def __init__(self, github_token: str = "", keep_clones: bool = False):
        self.registry = get_registry()
        self.github_token = github_token or os.getenv("GITHUB_TOKEN", "")
        self.keep_clones = keep_clones

    async def execute_scan(self, job: ScanJob) -> ScanJob:
        """Execute a complete scan job."""
        job.status = ScanStatus.RUNNING
        job.started_at = datetime.utcnow()
        profile = self.PROFILES.get(job.scan_profile, self.PROFILES["balanced"])

        logger.info(f"Starting scan job {job.job_id} for {job.target_name} (profile={job.scan_profile})")

        # Step 1: Clone target
        repo_target = GitRepoTarget()
        try:
            clone = repo_target.clone(
                repo_url=job.target_url,
                repo_name=job.target_name,
                token=self.github_token,
            )
            if not clone.success:
                job.status = ScanStatus.FAILED
                logger.error(f"Clone failed: {clone.error}")
                return job

            target_path = clone.local_path
            output_dir = os.path.join(target_path, ".scan_output")
            os.makedirs(output_dir, exist_ok=True)

            # Step 2: Detect technologies
            job.detected_tech = detect_technologies(target_path)
            logger.info(
                f"Detected: languages={job.detected_tech.languages}, "
                f"frameworks={job.detected_tech.frameworks}, "
                f"iac={job.detected_tech.has_iac}"
            )

            # Step 3: Select scanners
            scanners = self._select_scanners(job, profile)
            logger.info(f"Selected {len(scanners)} scanners: {[s.name for s in scanners]}")

            # Step 4: Execute scanners
            for scanner in scanners:
                logger.info(f"Running scanner: {scanner.name}")
                try:
                    result = scanner.scan(target_path, output_dir)
                    job.scanner_results.append(result)
                    logger.info(
                        f"  {scanner.name}: {result.status.value}, "
                        f"{result.finding_count} findings "
                        f"({result.duration_seconds:.1f}s)"
                    )
                except Exception as e:
                    logger.error(f"  {scanner.name} crashed: {e}")
                    job.scanner_results.append(ScanResult(
                        scanner_name=scanner.name,
                        scanner_category=scanner.category,
                        status=ScanStatus.FAILED,
                        error=str(e),
                    ))

            # Step 5: Deduplicate findings across scanners
            all_vulns = []
            for r in job.scanner_results:
                all_vulns.extend(r.vulnerabilities)
            deduped = deduplicate_findings(all_vulns)
            job.total_findings = len(deduped)

            # Determine overall status
            statuses = [r.status for r in job.scanner_results]
            if all(s == ScanStatus.SUCCESS for s in statuses):
                job.status = ScanStatus.SUCCESS
            elif any(s == ScanStatus.SUCCESS for s in statuses):
                job.status = ScanStatus.PARTIAL
            else:
                job.status = ScanStatus.FAILED

        finally:
            # Step 6: Cleanup
            if not self.keep_clones:
                repo_target.cleanup_all()

        job.completed_at = datetime.utcnow()
        logger.info(
            f"Scan job {job.job_id} completed: {job.status.value}, "
            f"{job.total_findings} findings from {len(job.scanner_results)} scanners"
        )
        return job

    def _select_scanners(self, job: ScanJob, profile: dict) -> list[BaseScanner]:
        """Select which scanners to run based on tech detection and profile."""
        detected_tech = {
            "languages": job.detected_tech.languages if job.detected_tech else [],
            "frameworks": job.detected_tech.frameworks if job.detected_tech else [],
            "has_iac": job.detected_tech.has_iac if job.detected_tech else False,
            "has_docker": job.detected_tech.has_docker if job.detected_tech else False,
            "package_managers": job.detected_tech.package_managers if job.detected_tech else [],
        }

        # Get applicable scanners
        if job.scanner_whitelist:
            scanners = self.registry.find_by_name(job.scanner_whitelist)
        else:
            scanners = self.registry.find_applicable(detected_tech)

        # Filter by profile categories
        allowed_cats = profile.get("categories", [])
        if allowed_cats:
            scanners = [s for s in scanners if s.category.value in allowed_cats]

        # Remove blacklisted
        if job.scanner_blacklist:
            scanners = [s for s in scanners if s.name not in job.scanner_blacklist]

        # Limit by profile max
        max_scanners = profile.get("max_scanners", 30)
        return scanners[:max_scanners]
```

### 8.2 Finding Deduplication

```python
# src/scanners/deduplication.py
"""Finding deduplication using fingerprints."""

from src.scanners.base import Vulnerability


def deduplicate_findings(vulnerabilities: list[Vulnerability]) -> list[Vulnerability]:
    """Deduplicate findings across multiple scanners.

    Uses fingerprints to identify duplicates. When two scanners report
    the same finding, keeps the one with more detail (longer description,
    higher confidence, more references).
    """
    seen: dict[str, Vulnerability] = {}

    for vuln in vulnerabilities:
        if not vuln.fingerprint:
            vuln.compute_fingerprint()

        if vuln.fingerprint in seen:
            existing = seen[vuln.fingerprint]
            # Keep the richer finding
            if _richness_score(vuln) > _richness_score(existing):
                seen[vuln.fingerprint] = vuln
        else:
            seen[vuln.fingerprint] = vuln

    return list(seen.values())


def _richness_score(vuln: Vulnerability) -> int:
    """Score a finding's information richness for dedup tiebreaking."""
    score = 0
    if vuln.description:
        score += len(vuln.description)
    if vuln.cve_id:
        score += 50
    if vuln.cwe_id:
        score += 30
    if vuln.fixed_version:
        score += 40
    if vuln.code_snippet:
        score += 20
    score += len(vuln.references) * 10
    score += int(vuln.confidence * 100)
    return score
```

---

## 9. Progress Monitoring

### 9.1 Progress Monitor

```python
# src/scanners/execution/progress_monitor.py
"""Monitor scanner subprocess progress to detect stuck processes."""

import time
from dataclasses import dataclass
from typing import Optional
import psutil
from loguru import logger


# Scanner-specific progress keywords
PROGRESS_KEYWORDS: dict[str, list[str]] = {
    "semgrep": ["Scanning", "rules", "files", "findings", "Ran"],
    "trivy": ["Scanning", "Analyzing", "Detected", "Total"],
    "gitleaks": ["Finding", "commits", "secrets"],
    "bandit": ["testing", "candidates", "issues"],
    "checkov": ["Passed", "Failed", "Skipped"],
    "grype": ["Scanning", "Cataloging", "vulnerability"],
    "npm": ["vulnerabilities", "packages"],
    "pip-audit": ["Auditing", "Found", "vulnerabilities"],
    "codeql": ["Extracting", "Analyzing", "Results"],
}


@dataclass
class ProgressMetrics:
    """Progress metrics for a running scanner."""
    output_lines: int = 0
    new_lines_since_check: int = 0
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    elapsed_seconds: float = 0.0
    is_progressing: bool = True
    progress_reason: str = ""
    keywords_matched: list[str] = None

    def __post_init__(self):
        if self.keywords_matched is None:
            self.keywords_matched = []


class ProgressMonitor:
    """Monitor a running scanner process for progress.

    Determines if a scanner is stuck by checking:
    1. New output lines
    2. CPU usage above threshold
    3. Scanner-specific keyword matches
    4. I/O activity

    If no progress for max_idle_time, the scanner is considered stuck.
    """

    def __init__(
        self,
        pid: int,
        scanner_name: str,
        min_cpu_threshold: float = 1.0,
        max_idle_time: int = 180,
    ):
        self.pid = pid
        self.scanner_name = scanner_name
        self.min_cpu_threshold = min_cpu_threshold
        self.max_idle_time = max_idle_time
        self.start_time = time.time()
        self.last_progress_time = time.time()
        self.last_output_lines = 0
        self.keywords = PROGRESS_KEYWORDS.get(scanner_name, [])

    def check(self, current_output_lines: int = 0) -> ProgressMetrics:
        """Check if the scanner is making progress."""
        metrics = ProgressMetrics(
            output_lines=current_output_lines,
            elapsed_seconds=time.time() - self.start_time,
        )

        try:
            proc = psutil.Process(self.pid)
            metrics.cpu_percent = proc.cpu_percent(interval=0.5)
            metrics.memory_mb = proc.memory_info().rss / (1024 * 1024)
        except psutil.NoSuchProcess:
            metrics.is_progressing = False
            metrics.progress_reason = "Process no longer exists"
            return metrics

        # Check for new output
        new_lines = current_output_lines - self.last_output_lines
        metrics.new_lines_since_check = new_lines

        if new_lines > 0:
            self.last_progress_time = time.time()
            self.last_output_lines = current_output_lines
            metrics.is_progressing = True
            metrics.progress_reason = f"+{new_lines} output lines"
            return metrics

        # Check CPU activity
        if metrics.cpu_percent > self.min_cpu_threshold:
            self.last_progress_time = time.time()
            metrics.is_progressing = True
            metrics.progress_reason = f"CPU active ({metrics.cpu_percent:.1f}%)"
            return metrics

        # Check idle time
        idle_time = time.time() - self.last_progress_time
        if idle_time >= self.max_idle_time:
            metrics.is_progressing = False
            metrics.progress_reason = f"Idle for {idle_time:.0f}s (threshold: {self.max_idle_time}s)"
        else:
            metrics.is_progressing = True
            metrics.progress_reason = f"Idle {idle_time:.0f}s (threshold: {self.max_idle_time}s)"

        return metrics

    def is_stuck(self, current_output_lines: int = 0) -> bool:
        """Quick check: is the scanner stuck?"""
        metrics = self.check(current_output_lines)
        return not metrics.is_progressing
```

> **AuditGH Reference:** Production progress monitoring at `src/progress_monitor.py` and `src/progress_helpers.py` tracks CPU usage, output line counts, I/O activity, and scanner-specific keywords. The `monitor_repo_progress()` helper extends timeouts intelligently when a scanner is actively producing output.

---

## 10. Result Ingestion Pipeline

### 10.1 Database Ingestion

```python
# src/scanners/ingestion.py
"""Ingest scan results into the database."""

from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from loguru import logger
from src.scanners.base import ScanResult, Vulnerability, ScanStatus
from src.scanners.orchestrator import ScanJob


class ResultIngester:
    """Ingest scan job results into PostgreSQL.

    Handles:
    - Creating ScanRun records
    - Upserting Finding records (update existing, create new)
    - Resolving findings not seen in latest scan
    - Tracking new vs existing findings
    """

    def __init__(self, db: Session):
        self.db = db

    def ingest_job(self, job: ScanJob) -> dict:
        """Ingest a complete scan job into the database.

        Returns:
            Summary dict with counts of new, existing, resolved findings
        """
        from src.api.models import ScanRun, Finding, Repository
        import uuid

        # Get or create repository
        repo = self.db.query(Repository).filter(
            Repository.full_name == job.target_name
        ).first()

        if not repo:
            logger.warning(f"Repository {job.target_name} not found in DB, skipping ingestion")
            return {"error": "Repository not found"}

        # Create ScanRun record
        scan_run = ScanRun(
            id=uuid.UUID(job.job_id),
            organization_id=repo.organization_id,
            repository_id=repo.id,
            scan_type=job.scan_profile,
            status=job.status.value,
            triggered_by=job.triggered_by,
            started_at=job.started_at,
            completed_at=job.completed_at,
            duration_seconds=int(
                (job.completed_at - job.started_at).total_seconds()
            ) if job.completed_at and job.started_at else 0,
            findings_count=job.total_findings,
            scan_config={
                "scanners": [r.scanner_name for r in job.scanner_results],
                "profile": job.scan_profile,
                "detected_languages": job.detected_tech.languages if job.detected_tech else [],
            },
        )
        self.db.add(scan_run)

        # Collect all existing finding fingerprints for this repo
        existing_fingerprints = set(
            fp for (fp,) in self.db.query(Finding.fingerprint).filter(
                Finding.repository_id == repo.id,
                Finding.status == "open",
            ).all()
            if fp
        )

        new_count = 0
        existing_count = 0
        seen_fingerprints = set()

        # Ingest findings
        for scanner_result in job.scanner_results:
            for vuln in scanner_result.vulnerabilities:
                if not vuln.fingerprint:
                    vuln.compute_fingerprint()
                seen_fingerprints.add(vuln.fingerprint)

                if vuln.fingerprint in existing_fingerprints:
                    # Update existing finding (last seen, scan run)
                    existing_count += 1
                    self.db.query(Finding).filter(
                        Finding.repository_id == repo.id,
                        Finding.fingerprint == vuln.fingerprint,
                    ).update({
                        "scan_run_id": scan_run.id,
                        "updated_at": datetime.utcnow(),
                    })
                else:
                    # Create new finding
                    new_count += 1
                    finding = Finding(
                        organization_id=repo.organization_id,
                        repository_id=repo.id,
                        scan_run_id=scan_run.id,
                        scanner_name=vuln.scanner_name,
                        finding_type=vuln.scanner_category.value,
                        severity=vuln.severity.value,
                        title=vuln.title[:500],
                        description=vuln.description[:5000],
                        file_path=vuln.file_path,
                        line_start=vuln.line_start,
                        line_end=vuln.line_end,
                        code_snippet=vuln.code_snippet[:2000],
                        cve_id=vuln.cve_id,
                        cwe_id=vuln.cwe_id,
                        package_name=vuln.package_name,
                        package_version=vuln.package_version,
                        fixed_version=vuln.fixed_version,
                        status="open",
                        fingerprint=vuln.fingerprint,
                    )
                    self.db.add(finding)

        # Resolve findings not seen in this scan
        resolved_fingerprints = existing_fingerprints - seen_fingerprints
        resolved_count = 0
        if resolved_fingerprints:
            resolved_count = self.db.query(Finding).filter(
                Finding.repository_id == repo.id,
                Finding.fingerprint.in_(resolved_fingerprints),
                Finding.status == "open",
            ).update(
                {"status": "resolved", "resolution": "auto_resolved_by_scan"},
                synchronize_session=False,
            )

        # Update scan run counts
        scan_run.new_findings_count = new_count
        scan_run.resolved_findings_count = resolved_count

        self.db.commit()

        summary = {
            "scan_run_id": str(scan_run.id),
            "new_findings": new_count,
            "existing_findings": existing_count,
            "resolved_findings": resolved_count,
            "total_findings": new_count + existing_count,
        }
        logger.info(f"Ingested: {summary}")
        return summary
```

> **AuditGH Reference:** Production ingestion at `execution/ingest_results.py` creates `ScanRun` records, inserts findings, and tracks new vs existing counts. The `update_scan_run()` function updates status and finding counts after ingestion.

---

## 11. Scan Scheduling

### 11.1 Schedule Executor (APScheduler)

```python
# src/scanners/scheduler.py
"""Scan scheduling with APScheduler."""

import os
from datetime import datetime
from typing import Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session
from loguru import logger


# Time window mapping
TIME_WINDOWS = {
    "morning": 8,     # 8 AM
    "afternoon": 14,  # 2 PM
    "evening": 20,    # 8 PM
    "night": 2,       # 2 AM
}


class ScheduleExecutor:
    """Execute scans based on ScanSchedule records.

    Syncs database schedules to APScheduler jobs.
    Supports: daily, weekly, bi-weekly, monthly frequencies.
    """

    def __init__(self, db_factory, github_token: str = ""):
        self.db_factory = db_factory
        self.github_token = github_token or os.getenv("GITHUB_TOKEN", "")
        self.scheduler = AsyncIOScheduler()

    async def start(self) -> None:
        """Start the scheduler and sync all active schedules."""
        count = await self.sync_schedules()
        self.scheduler.start()
        logger.info(f"Scheduler started with {count} active scan schedules")

    async def stop(self) -> None:
        """Stop the scheduler."""
        self.scheduler.shutdown()

    async def sync_schedules(self) -> int:
        """Load all active schedules from DB and register with APScheduler."""
        from src.api.models import ScanSchedule, Repository

        db = self.db_factory()
        try:
            schedules = db.query(ScanSchedule).filter(
                ScanSchedule.is_active == True
            ).all()

            # Remove existing jobs
            self.scheduler.remove_all_jobs()

            count = 0
            for schedule in schedules:
                repo = db.query(Repository).filter(
                    Repository.id == schedule.repository_id
                ).first()
                if not repo:
                    continue

                trigger = self._build_trigger(schedule)
                if not trigger:
                    continue

                self.scheduler.add_job(
                    self._execute_scan,
                    trigger=trigger,
                    id=str(schedule.id),
                    kwargs={
                        "schedule_id": str(schedule.id),
                        "repo_name": repo.full_name,
                        "repo_url": repo.clone_url,
                        "organization_id": str(schedule.organization_id),
                        "scan_arguments": schedule.scan_arguments or {},
                    },
                    replace_existing=True,
                )
                count += 1

            return count
        finally:
            db.close()

    def _build_trigger(self, schedule) -> Optional[CronTrigger]:
        """Convert a ScanSchedule to an APScheduler CronTrigger."""
        hour = TIME_WINDOWS.get(schedule.time_window, 8)

        if schedule.frequency == "daily":
            return CronTrigger(hour=hour, minute=0)
        elif schedule.frequency == "weekly":
            dow = schedule.day_of_week if schedule.day_of_week is not None else 0
            return CronTrigger(day_of_week=dow, hour=hour, minute=0)
        elif schedule.frequency == "bi-weekly":
            # APScheduler doesn't have native bi-weekly; use weekly + skip logic
            dow = schedule.day_of_week if schedule.day_of_week is not None else 0
            return CronTrigger(day_of_week=dow, hour=hour, minute=0)
        elif schedule.frequency == "monthly":
            return CronTrigger(day=1, hour=hour, minute=0)

        return None

    async def _execute_scan(
        self,
        schedule_id: str,
        repo_name: str,
        repo_url: str,
        organization_id: str,
        scan_arguments: dict,
    ) -> None:
        """Execute a scheduled scan."""
        from src.scanners.orchestrator import ScanOrchestrator, ScanJob
        from src.scanners.ingestion import ResultIngester

        logger.info(f"Scheduled scan triggered: {repo_name} (schedule={schedule_id})")

        # Build scan job
        job = ScanJob(
            target_name=repo_name,
            target_url=repo_url,
            organization_id=organization_id,
            triggered_by="schedule",
            scan_profile=scan_arguments.get("profile", "balanced"),
        )

        # Execute
        orchestrator = ScanOrchestrator(github_token=self.github_token)
        job = await orchestrator.execute_scan(job)

        # Ingest results
        db = self.db_factory()
        try:
            ingester = ResultIngester(db)
            ingester.ingest_job(job)

            # Update schedule execution tracking
            from src.api.models import ScanSchedule
            db.query(ScanSchedule).filter(
                ScanSchedule.id == schedule_id
            ).update({
                "last_executed_at": datetime.utcnow(),
                "last_execution_status": job.status.value,
            })
            db.commit()
        finally:
            db.close()
```

> **AuditGH Reference:** Production scheduling at `src/services/schedule_executor.py` uses APScheduler with CronTrigger, supports daily/weekly/bi-weekly/monthly frequencies, and maps time windows (morning=8, afternoon=14, evening=20, night=2). The `ScanSchedule` model includes AI-recommended schedules with `ai_reasoning`, `ai_confidence`, and `is_locked` for manual overrides.

---

## 12. Scanner Configuration

### 12.1 Configuration Management

```python
# src/scanners/config.py
"""Scanner configuration management."""

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ScannerConfig:
    """Global scanner configuration."""

    # Source control
    github_token: str = field(default_factory=lambda: os.getenv("GITHUB_TOKEN", ""))
    github_api: str = "https://api.github.com"
    organization_name: str = field(default_factory=lambda: os.getenv("GITHUB_ORG", ""))

    # Directories
    clone_dir: str = field(default_factory=lambda: os.getenv("CLONE_DIR", "/tmp/scan_workspace"))
    report_dir: str = field(default_factory=lambda: os.getenv("REPORT_DIR", "vulnerability_reports"))
    keep_clones: bool = field(default_factory=lambda: os.getenv("KEEP_CLONES", "false").lower() == "true")

    # Execution
    default_timeout: int = {SCANNER_TIMEOUT}
    max_scan_duration: int = {MAX_SCAN_DURATION}
    max_parallel_scanners: int = 1  # Sequential by default for stability

    # Scanner enable/disable (override via env: ENABLE_SEMGREP=false)
    enabled_scanners: dict[str, bool] = field(default_factory=dict)

    # Per-scanner config
    semgrep_config: str = "auto"  # Semgrep ruleset
    semgrep_taint_config: str = ""  # Custom taint analysis rules path
    trivy_severity: str = "CRITICAL,HIGH,MEDIUM,LOW"
    syft_format: str = "cyclonedx-json"  # SBOM format
    grype_vex_files: list[str] = field(default_factory=list)

    # Multi-tenant
    organization_id: str = ""

    # Docker scanner
    scanner_image: str = "{SCANNER_IMAGE}"
    docker_memory_limit: str = "2g"
    docker_cpu_limit: str = "2.0"

    def is_scanner_enabled(self, scanner_name: str) -> bool:
        """Check if a specific scanner is enabled."""
        # Check explicit config first
        if scanner_name in self.enabled_scanners:
            return self.enabled_scanners[scanner_name]
        # Check environment variable
        env_var = f"ENABLE_{scanner_name.upper().replace('-', '_')}"
        return os.getenv(env_var, "true").lower() == "true"


def load_config() -> ScannerConfig:
    """Load scanner configuration from environment."""
    return ScannerConfig()
```

### 12.2 Environment Variables

```bash
# .env (Scanner configuration section)

# Source control
GITHUB_TOKEN=ghp_...
GITHUB_ORG={SCAN_TARGET_SOURCE}

# Directories
CLONE_DIR=/tmp/scan_workspace
REPORT_DIR=vulnerability_reports
KEEP_CLONES=false

# Timeouts
SCANNER_TIMEOUT={SCANNER_TIMEOUT}
MAX_SCAN_DURATION={MAX_SCAN_DURATION}

# Scanner enable/disable
ENABLE_SEMGREP=true
ENABLE_GITLEAKS=true
ENABLE_TRIVY=true
ENABLE_BANDIT=true
ENABLE_CHECKOV=true
ENABLE_CODEQL=true
ENABLE_GRYPE=true
ENABLE_TRUFFLEHOG=true

# Per-scanner config
SEMGREP_CONFIG=auto
TRIVY_SEVERITY=CRITICAL,HIGH,MEDIUM,LOW
SYFT_FORMAT=cyclonedx-json

# Docker scanner container
SCANNER_IMAGE={SCANNER_IMAGE}
SCANNER_MEMORY_LIMIT=2g
SCANNER_CPU_LIMIT=2.0

# Scheduling
SCAN_SCHEDULER_ENABLED=true
```

---

## 13. Scanner Docker Container

> Build a reproducible, multi-arch Docker image containing every scanner tool.
> The image is used by both `ContainerRunner` (isolated per-scan containers) and
> the long-running scanner worker service.

### 13.1 Dockerfile.scanner

```dockerfile
# ============================================================
# Dockerfile.scanner — {PROJECT_NAME} Scanner Container
# ============================================================
# Multi-stage build for reproducibility and minimal image size.
# Target: linux/amd64, linux/arm64
#
# Build:
#   docker buildx build --platform linux/amd64,linux/arm64 \
#     -t {SCANNER_IMAGE}:latest -f Dockerfile.scanner .
# ============================================================

# ---- Stage 1: Base OS + system dependencies ----------------
FROM python:3.12-slim AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/root/.local/bin:/usr/local/go/bin:/root/go/bin:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget git unzip jq ca-certificates \
    build-essential libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# ---- Stage 2: Go tools ------------------------------------
FROM base AS go-tools

ARG GO_VERSION=1.22.5
ARG TARGETARCH

RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${TARGETARCH}.tar.gz" \
    | tar -C /usr/local -xzf -

# Go-based scanners
RUN go install github.com/securego/gosec/v2/cmd/gosec@latest \
    && go install golang.org/x/vuln/cmd/govulncheck@latest \
    && go install github.com/zricethezav/gitleaks/v8@latest \
    && go install github.com/trufflesecurity/trufflehog/v3@latest \
    && go install github.com/anchore/grype@latest \
    && go install github.com/anchore/syft@latest

# ---- Stage 3: Python tools (isolated venvs) ---------------
FROM base AS python-tools

# Each Python tool gets its own venv to prevent dependency conflicts
RUN python -m venv /opt/semgrep && \
    /opt/semgrep/bin/pip install --no-cache-dir semgrep

RUN python -m venv /opt/bandit && \
    /opt/bandit/bin/pip install --no-cache-dir bandit

RUN python -m venv /opt/checkov && \
    /opt/checkov/bin/pip install --no-cache-dir checkov

RUN python -m venv /opt/whispers && \
    /opt/whispers/bin/pip install --no-cache-dir whispers

RUN python -m venv /opt/safety && \
    /opt/safety/bin/pip install --no-cache-dir safety

RUN python -m venv /opt/pip-audit && \
    /opt/pip-audit/bin/pip install --no-cache-dir pip-audit

# ---- Stage 4: Binary tools --------------------------------
FROM base AS binary-tools

ARG TARGETARCH
ARG TRIVY_VERSION=0.52.0
ARG CODEQL_VERSION=2.17.0
ARG TERRASCAN_VERSION=1.19.1

# Trivy
RUN curl -fsSL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-${TARGETARCH}.deb" \
    -o /tmp/trivy.deb && dpkg -i /tmp/trivy.deb && rm /tmp/trivy.deb

# Terrascan
RUN curl -fsSL "https://github.com/tenable/terrascan/releases/download/v${TERRASCAN_VERSION}/terrascan_${TERRASCAN_VERSION}_Linux_${TARGETARCH}.tar.gz" \
    | tar -C /usr/local/bin -xzf - terrascan

# CodeQL (amd64 only — ARM falls back to Semgrep)
RUN if [ "${TARGETARCH}" = "amd64" ]; then \
      curl -fsSL "https://github.com/github/codeql-action/releases/download/codeql-bundle-v${CODEQL_VERSION}/codeql-bundle-linux64.tar.gz" \
      | tar -C /opt -xzf - ; \
    fi

# ---- Stage 5: Final image ---------------------------------
FROM base AS final

# Copy Go binaries
COPY --from=go-tools /root/go/bin/ /usr/local/bin/
COPY --from=go-tools /usr/local/go /usr/local/go

# Copy Python venvs
COPY --from=python-tools /opt/semgrep /opt/semgrep
COPY --from=python-tools /opt/bandit /opt/bandit
COPY --from=python-tools /opt/checkov /opt/checkov
COPY --from=python-tools /opt/whispers /opt/whispers
COPY --from=python-tools /opt/safety /opt/safety
COPY --from=python-tools /opt/pip-audit /opt/pip-audit

# Copy binary tools
COPY --from=binary-tools /usr/bin/trivy /usr/bin/trivy
COPY --from=binary-tools /usr/local/bin/terrascan /usr/local/bin/terrascan
COPY --from=binary-tools /opt/codeql* /opt/codeql/

# Symlink Python tools into PATH
RUN ln -s /opt/semgrep/bin/semgrep /usr/local/bin/semgrep && \
    ln -s /opt/bandit/bin/bandit /usr/local/bin/bandit && \
    ln -s /opt/checkov/bin/checkov /usr/local/bin/checkov && \
    ln -s /opt/whispers/bin/whispers /usr/local/bin/whispers && \
    ln -s /opt/safety/bin/safety /usr/local/bin/safety && \
    ln -s /opt/pip-audit/bin/pip-audit /usr/local/bin/pip-audit && \
    ([ -d /opt/codeql/codeql ] && ln -s /opt/codeql/codeql/codeql /usr/local/bin/codeql || true)

# Scanner app code
COPY src/scanners/ /app/src/scanners/
COPY src/models/ /app/src/models/
COPY requirements-scanner.txt /app/

WORKDIR /app

RUN pip install --no-cache-dir -r requirements-scanner.txt

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import sys; sys.exit(0)"

# Non-root user for security
RUN useradd -m -s /bin/bash scanner && \
    mkdir -p /tmp/scan_workspace && \
    chown -R scanner:scanner /tmp/scan_workspace /app

USER scanner

ENTRYPOINT ["python", "-m", "src.scanners.worker"]
CMD ["--mode", "worker"]
```

### 13.2 Tool Verification Script

```python
# src/scanners/verify_tools.py
"""
Verify all scanner tools are installed and accessible.
Run inside the scanner container to validate the image.
"""
import subprocess
import sys
from dataclasses import dataclass


@dataclass
class ToolCheck:
    name: str
    command: list[str]
    expected_in_output: str = ""
    optional: bool = False


TOOL_CHECKS: list[ToolCheck] = [
    # Secret Scanners
    ToolCheck("gitleaks", ["gitleaks", "version"], "gitleaks"),
    ToolCheck("trufflehog", ["trufflehog", "--version"], "trufflehog"),
    ToolCheck("whispers", ["whispers", "--version"], "whispers"),

    # Vulnerability Scanners
    ToolCheck("grype", ["grype", "version"], "grype"),
    ToolCheck("trivy", ["trivy", "version"], "Version"),
    ToolCheck("safety", ["safety", "--version"], "Safety"),
    ToolCheck("pip-audit", ["pip-audit", "--version"], "pip-audit"),
    ToolCheck("syft", ["syft", "version"], "syft"),

    # Static Analysis
    ToolCheck("semgrep", ["semgrep", "--version"], ""),
    ToolCheck("bandit", ["bandit", "--version"], "bandit"),
    ToolCheck("codeql", ["codeql", "version"], "CodeQL", optional=True),  # ARM

    # IaC Scanners
    ToolCheck("checkov", ["checkov", "--version"], ""),
    ToolCheck("terrascan", ["terrascan", "version"], "terrascan"),

    # Go Scanners
    ToolCheck("gosec", ["gosec", "--version"], "gosec", optional=True),
    ToolCheck("govulncheck", ["govulncheck", "-version"], "", optional=True),
]


def verify_tools() -> tuple[list[str], list[str], list[str]]:
    """
    Returns (passed, failed, skipped) tool name lists.
    """
    passed, failed, skipped = [], [], []

    for tool in TOOL_CHECKS:
        try:
            result = subprocess.run(
                tool.command,
                capture_output=True,
                text=True,
                timeout=30,
            )
            output = result.stdout + result.stderr
            if tool.expected_in_output and tool.expected_in_output not in output:
                raise ValueError(f"Expected '{tool.expected_in_output}' not in output")
            passed.append(tool.name)
            print(f"  [PASS] {tool.name}")
        except Exception as exc:
            if tool.optional:
                skipped.append(tool.name)
                print(f"  [SKIP] {tool.name} (optional): {exc}")
            else:
                failed.append(tool.name)
                print(f"  [FAIL] {tool.name}: {exc}")

    return passed, failed, skipped


def main():
    print("=" * 60)
    print(f"  {'{PROJECT_NAME}'} Scanner Tool Verification")
    print("=" * 60)

    passed, failed, skipped = verify_tools()

    print()
    print(f"  Passed:  {len(passed)}")
    print(f"  Failed:  {len(failed)}")
    print(f"  Skipped: {len(skipped)}")
    print("=" * 60)

    if failed:
        print(f"\nFailed tools: {', '.join(failed)}")
        sys.exit(1)

    print("\nAll required tools verified.")
    sys.exit(0)


if __name__ == "__main__":
    main()
```

### 13.3 Docker Compose Service

```yaml
# docker-compose.yml (scanner service fragment)

services:
  scanner:
    build:
      context: .
      dockerfile: Dockerfile.scanner
      args:
        GO_VERSION: "1.22.5"
        TRIVY_VERSION: "0.52.0"
    image: {SCANNER_IMAGE}:latest
    container_name: {PROJECT_NAME}-scanner
    restart: unless-stopped

    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      - REDIS_URL=redis://redis:6379/0
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - CLONE_DIR=/tmp/scan_workspace
      - SCANNER_TIMEOUT=${SCANNER_TIMEOUT:-600}
      - MAX_CONCURRENT_SCANS=${MAX_CONCURRENT_SCANS:-3}
      - LOG_LEVEL=${LOG_LEVEL:-INFO}

    volumes:
      - scanner-workspace:/tmp/scan_workspace
      - /var/run/docker.sock:/var/run/docker.sock:ro  # For ContainerRunner

    deploy:
      resources:
        limits:
          cpus: "${SCANNER_CPU_LIMIT:-4.0}"
          memory: "${SCANNER_MEMORY_LIMIT:-4g}"
        reservations:
          cpus: "1.0"
          memory: "1g"

    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

    healthcheck:
      test: ["CMD", "python", "-c", "import requests; requests.get('http://localhost:8001/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

    networks:
      - internal

  # One-shot tool verification (for CI)
  scanner-verify:
    build:
      context: .
      dockerfile: Dockerfile.scanner
    entrypoint: ["python", "-m", "src.scanners.verify_tools"]
    profiles: ["verify"]
    networks:
      - internal

volumes:
  scanner-workspace:
    driver: local

networks:
  internal:
    driver: bridge
```

### 13.4 Scanner Worker Entry Point

```python
# src/scanners/worker.py
"""
Scanner worker process — long-running service that:
  1. Polls Redis queue for scan jobs
  2. Executes scans via ScanOrchestrator
  3. Reports results back via ResultIngester

Run modes:
  --mode worker   : Continuous queue polling (default)
  --mode once     : Execute one scan and exit (for Kubernetes Jobs)
  --mode verify   : Verify tools and exit
"""
import argparse
import asyncio
import logging
import signal
import sys
from contextlib import asynccontextmanager

from ..database import get_async_session
from .orchestrator import ScanOrchestrator
from .result_ingestion import ResultIngester
from .verify_tools import verify_tools

logger = logging.getLogger(__name__)


class ScannerWorker:
    """Long-running scanner worker process."""

    def __init__(self, redis_url: str, db_url: str, max_concurrent: int = 3):
        self.redis_url = redis_url
        self.db_url = db_url
        self.max_concurrent = max_concurrent
        self._shutdown = asyncio.Event()
        self._active_scans: set[asyncio.Task] = set()

    async def start(self):
        """Start the worker loop."""
        import redis.asyncio as aioredis

        self.redis = aioredis.from_url(self.redis_url)
        self.orchestrator = ScanOrchestrator(max_concurrent=self.max_concurrent)
        self.ingester = ResultIngester()

        logger.info(
            "Scanner worker started (max_concurrent=%d)", self.max_concurrent
        )

        # Register signal handlers
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, self._handle_shutdown)

        try:
            await self._poll_loop()
        finally:
            await self._drain()
            await self.redis.close()
            logger.info("Scanner worker stopped")

    async def _poll_loop(self):
        """Poll Redis for scan jobs."""
        while not self._shutdown.is_set():
            # Wait if at capacity
            if len(self._active_scans) >= self.max_concurrent:
                await asyncio.sleep(1)
                continue

            # BRPOP with 5-second timeout
            result = await self.redis.brpop("scan_queue", timeout=5)
            if result is None:
                continue

            _, job_data = result
            job = ScanJob.from_json(job_data)

            task = asyncio.create_task(self._execute_scan(job))
            self._active_scans.add(task)
            task.add_done_callback(self._active_scans.discard)

    async def _execute_scan(self, job):
        """Execute a single scan job."""
        logger.info("Starting scan job %s for repo %s", job.scan_id, job.repo_url)

        try:
            results = await self.orchestrator.run_scan(
                repo_url=job.repo_url,
                profile=job.profile,
                scanners=job.scanner_overrides,
            )

            async with get_async_session() as session:
                await self.ingester.ingest(
                    session=session,
                    scan_run_id=job.scan_id,
                    results=results,
                    org_id=job.org_id,
                    repo_name=job.repo_name,
                )

            # Notify completion
            await self.redis.publish(
                f"scan_complete:{job.scan_id}",
                json.dumps({"status": "completed", "finding_count": len(results)}),
            )

            logger.info("Scan job %s completed (%d findings)", job.scan_id, len(results))

        except Exception:
            logger.exception("Scan job %s failed", job.scan_id)
            await self.redis.publish(
                f"scan_complete:{job.scan_id}",
                json.dumps({"status": "failed", "error": str(exc)}),
            )

    def _handle_shutdown(self):
        """Graceful shutdown on SIGTERM/SIGINT."""
        logger.info("Shutdown signal received, draining active scans...")
        self._shutdown.set()

    async def _drain(self):
        """Wait for active scans to complete."""
        if self._active_scans:
            logger.info("Waiting for %d active scans...", len(self._active_scans))
            await asyncio.gather(*self._active_scans, return_exceptions=True)


def main():
    parser = argparse.ArgumentParser(description="{PROJECT_NAME} Scanner Worker")
    parser.add_argument(
        "--mode",
        choices=["worker", "once", "verify"],
        default="worker",
        help="Run mode",
    )
    parser.add_argument("--max-concurrent", type=int, default=3)
    parser.add_argument("--redis-url", default="redis://localhost:6379/0")
    parser.add_argument("--db-url", default="postgresql://localhost:5432/{PROJECT_NAME}")

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if args.mode == "verify":
        passed, failed, skipped = verify_tools()
        sys.exit(1 if failed else 0)

    worker = ScannerWorker(
        redis_url=args.redis_url,
        db_url=args.db_url,
        max_concurrent=args.max_concurrent,
    )
    asyncio.run(worker.start())


if __name__ == "__main__":
    main()
```

### 13.5 CI Image Validation

```yaml
# .github/workflows/scanner-image.yml
name: Build & Verify Scanner Image

on:
  push:
    paths:
      - "Dockerfile.scanner"
      - "src/scanners/**"
      - "requirements-scanner.txt"

jobs:
  build-and-verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build scanner image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile.scanner
          platforms: linux/amd64
          load: true
          tags: {SCANNER_IMAGE}:test
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Verify all scanner tools
        run: |
          docker run --rm {SCANNER_IMAGE}:test \
            python -m src.scanners.verify_tools

      - name: Run scanner unit tests
        run: |
          docker run --rm {SCANNER_IMAGE}:test \
            python -m pytest tests/scanners/ -v --tb=short
```

---

## 14. Remote / SaaS Scanner Integration

> Integrate cloud-hosted scanning services (Snyk, SonarCloud, GitHub Advanced
> Security, etc.) alongside local tools. Uses `RemoteRunner` from §3.3.

### 14.1 Remote Scanner Base

```python
# src/scanners/remote/base.py
"""
Base class for remote/SaaS scanner integrations.
Extends BaseScanner with HTTP client, polling, and webhook patterns.
"""
import asyncio
import logging
from abc import abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

import httpx

from ..base import BaseScanner, ScanResult, Vulnerability

logger = logging.getLogger(__name__)


class RemoteAuthType(Enum):
    API_KEY = "api_key"
    BEARER_TOKEN = "bearer_token"
    OAUTH2 = "oauth2"


@dataclass
class RemoteConfig:
    """Configuration for a remote scanner service."""
    base_url: str
    auth_type: RemoteAuthType
    api_key: str | None = None
    bearer_token: str | None = None
    oauth2_client_id: str | None = None
    oauth2_client_secret: str | None = None
    oauth2_token_url: str | None = None
    timeout: int = 300  # seconds
    poll_interval: int = 10  # seconds
    max_poll_attempts: int = 60
    webhook_url: str | None = None  # If set, use webhook instead of polling
    custom_headers: dict[str, str] = field(default_factory=dict)


class RemoteScanner(BaseScanner):
    """
    Base class for remote/SaaS scanner integrations.

    Subclasses implement:
      - submit_scan()   → Submit scan to remote service
      - poll_status()   → Check if scan is complete
      - fetch_results() → Download results when complete
      - parse_remote()  → Convert remote results to Vulnerability list
    """

    def __init__(self, config: RemoteConfig):
        self.config = config
        self._client: httpx.AsyncClient | None = None
        self._oauth_token: str | None = None
        self._token_expires: datetime | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get authenticated HTTP client."""
        if self._client is None:
            headers = {**self.config.custom_headers}

            if self.config.auth_type == RemoteAuthType.API_KEY:
                headers["Authorization"] = f"Token {self.config.api_key}"
            elif self.config.auth_type == RemoteAuthType.BEARER_TOKEN:
                headers["Authorization"] = f"Bearer {self.config.bearer_token}"
            elif self.config.auth_type == RemoteAuthType.OAUTH2:
                token = await self._get_oauth_token()
                headers["Authorization"] = f"Bearer {token}"

            self._client = httpx.AsyncClient(
                base_url=self.config.base_url,
                headers=headers,
                timeout=httpx.Timeout(self.config.timeout),
            )

        return self._client

    async def _get_oauth_token(self) -> str:
        """Obtain or refresh OAuth2 token."""
        if self._oauth_token and self._token_expires and datetime.utcnow() < self._token_expires:
            return self._oauth_token

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.config.oauth2_token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.config.oauth2_client_id,
                    "client_secret": self.config.oauth2_client_secret,
                },
            )
            response.raise_for_status()
            data = response.json()

        self._oauth_token = data["access_token"]
        self._token_expires = datetime.utcnow() + timedelta(
            seconds=data.get("expires_in", 3600) - 60
        )
        return self._oauth_token

    async def run(self, target_path: str, **kwargs) -> ScanResult:
        """
        Execute remote scan:
          1. Submit scan
          2. Poll or wait for webhook
          3. Fetch results
          4. Parse to Vulnerability list
        """
        start = datetime.utcnow()

        try:
            # Step 1: Submit
            scan_id = await self.submit_scan(target_path, **kwargs)
            logger.info("[%s] Submitted remote scan: %s", self.name, scan_id)

            # Step 2: Wait for completion
            if self.config.webhook_url:
                await self._wait_webhook(scan_id)
            else:
                await self._poll_until_complete(scan_id)

            # Step 3: Fetch
            raw_results = await self.fetch_results(scan_id)

            # Step 4: Parse
            vulnerabilities = self.parse_remote(raw_results)

            elapsed = (datetime.utcnow() - start).total_seconds()

            return ScanResult(
                scanner_name=self.name,
                scanner_version=self.version,
                vulnerabilities=vulnerabilities,
                duration_seconds=elapsed,
                success=True,
            )

        except Exception as exc:
            elapsed = (datetime.utcnow() - start).total_seconds()
            logger.error("[%s] Remote scan failed: %s", self.name, exc)
            return ScanResult(
                scanner_name=self.name,
                scanner_version=self.version,
                vulnerabilities=[],
                duration_seconds=elapsed,
                success=False,
                error_message=str(exc),
            )

        finally:
            if self._client:
                await self._client.aclose()
                self._client = None

    async def _poll_until_complete(self, scan_id: str):
        """Poll remote service until scan completes."""
        for attempt in range(self.config.max_poll_attempts):
            status = await self.poll_status(scan_id)

            if status == "completed":
                return
            elif status == "failed":
                raise RuntimeError(f"Remote scan {scan_id} failed")
            elif status in ("queued", "running", "pending"):
                await asyncio.sleep(self.config.poll_interval)
            else:
                raise RuntimeError(f"Unknown remote status: {status}")

        raise TimeoutError(
            f"Remote scan {scan_id} timed out after "
            f"{self.config.max_poll_attempts * self.config.poll_interval}s"
        )

    async def _wait_webhook(self, scan_id: str):
        """
        Wait for webhook callback (implementation depends on
        your web framework — this is a Redis pubsub placeholder).
        """
        import redis.asyncio as aioredis

        redis = aioredis.from_url("redis://localhost:6379/0")
        pubsub = redis.pubsub()
        await pubsub.subscribe(f"webhook:{scan_id}")

        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    return
        finally:
            await pubsub.unsubscribe()
            await redis.close()

    # ---- Subclass interface ----

    @abstractmethod
    async def submit_scan(self, target_path: str, **kwargs) -> str:
        """Submit scan, return remote scan ID."""
        ...

    @abstractmethod
    async def poll_status(self, scan_id: str) -> str:
        """Return status string: queued, running, completed, failed."""
        ...

    @abstractmethod
    async def fetch_results(self, scan_id: str) -> dict[str, Any]:
        """Fetch raw results from remote service."""
        ...

    @abstractmethod
    def parse_remote(self, raw_results: dict[str, Any]) -> list[Vulnerability]:
        """Parse remote results into Vulnerability list."""
        ...
```

### 14.2 Snyk Integration

```python
# src/scanners/remote/snyk.py
"""
Snyk SaaS scanner integration.
Requires SNYK_TOKEN environment variable.
"""
import os
from typing import Any

from ..base import Vulnerability, ScannerCategory
from .base import RemoteScanner, RemoteConfig, RemoteAuthType


class SnykScanner(RemoteScanner):
    name = "snyk"
    version = "api-v1"
    category = ScannerCategory.VULNERABILITY

    def __init__(self):
        config = RemoteConfig(
            base_url="https://api.snyk.io/v1",
            auth_type=RemoteAuthType.API_KEY,
            api_key=os.environ.get("SNYK_TOKEN"),
            poll_interval=15,
            max_poll_attempts=40,
        )
        super().__init__(config)

    def is_applicable(self, detected_tech: dict) -> bool:
        """Snyk supports most language ecosystems."""
        return bool(detected_tech.get("languages") or detected_tech.get("package_managers"))

    async def submit_scan(self, target_path: str, **kwargs) -> str:
        """Import project to Snyk for testing."""
        client = await self._get_client()

        # For GitHub repos, use the import endpoint
        repo_url = kwargs.get("repo_url", "")
        org_id = kwargs.get("snyk_org_id", os.environ.get("SNYK_ORG_ID", ""))

        if repo_url.startswith("https://github.com/"):
            # GitHub integration
            owner_repo = repo_url.replace("https://github.com/", "")
            response = await client.post(
                f"/org/{org_id}/integrations/github/import",
                json={
                    "target": {"owner": owner_repo.split("/")[0], "name": owner_repo.split("/")[1]},
                    "files": [{"path": "/"}],
                },
            )
        else:
            # File-based test
            response = await client.post(
                f"/org/{org_id}/test",
                json={"target": {"path": target_path}},
            )

        response.raise_for_status()
        return response.json().get("id", response.headers.get("location", "").split("/")[-1])

    async def poll_status(self, scan_id: str) -> str:
        client = await self._get_client()
        response = await client.get(f"/import/{scan_id}")
        response.raise_for_status()
        status = response.json().get("status", "pending")
        return {"complete": "completed", "error": "failed"}.get(status, status)

    async def fetch_results(self, scan_id: str) -> dict[str, Any]:
        client = await self._get_client()
        response = await client.get(f"/import/{scan_id}/results")
        response.raise_for_status()
        return response.json()

    def parse_remote(self, raw_results: dict[str, Any]) -> list[Vulnerability]:
        vulnerabilities = []
        for issue in raw_results.get("issues", {}).get("vulnerabilities", []):
            severity_map = {"critical": "critical", "high": "high", "medium": "medium", "low": "low"}
            vulnerabilities.append(Vulnerability(
                rule_id=issue.get("id", ""),
                severity=severity_map.get(issue.get("severity", "").lower(), "medium"),
                message=issue.get("title", ""),
                file_path=issue.get("from", [""])[0] if issue.get("from") else "",
                line_number=0,
                details=issue.get("description", ""),
                cve=issue.get("identifiers", {}).get("CVE", [""])[0] if issue.get("identifiers", {}).get("CVE") else None,
                package_name=issue.get("package", ""),
                installed_version=issue.get("version", ""),
                fixed_version=issue.get("fixedIn", [""])[0] if issue.get("fixedIn") else None,
            ))
        return vulnerabilities
```

### 14.3 SonarCloud Integration

```python
# src/scanners/remote/sonarcloud.py
"""
SonarCloud SaaS scanner integration.
Requires SONAR_TOKEN and SONAR_ORG environment variables.
"""
import os
from typing import Any

from ..base import Vulnerability, ScannerCategory
from .base import RemoteScanner, RemoteConfig, RemoteAuthType


class SonarCloudScanner(RemoteScanner):
    name = "sonarcloud"
    version = "api-v2"
    category = ScannerCategory.SAST

    def __init__(self):
        config = RemoteConfig(
            base_url="https://sonarcloud.io/api",
            auth_type=RemoteAuthType.BEARER_TOKEN,
            bearer_token=os.environ.get("SONAR_TOKEN"),
            poll_interval=20,
            max_poll_attempts=30,
        )
        super().__init__(config)

    def is_applicable(self, detected_tech: dict) -> bool:
        supported = {"python", "javascript", "typescript", "java", "go", "csharp", "ruby"}
        return bool(set(detected_tech.get("languages", [])) & supported)

    async def submit_scan(self, target_path: str, **kwargs) -> str:
        """
        SonarCloud scans are triggered by CI/CD.
        This submits an analysis task via the web API.
        """
        client = await self._get_client()
        project_key = kwargs.get(
            "sonar_project_key",
            os.environ.get("SONAR_PROJECT_KEY", ""),
        )

        response = await client.post(
            "/ce/submit",
            data={
                "projectKey": project_key,
                "projectName": kwargs.get("repo_name", project_key),
            },
        )
        response.raise_for_status()
        return response.json()["taskId"]

    async def poll_status(self, scan_id: str) -> str:
        client = await self._get_client()
        response = await client.get(f"/ce/task", params={"id": scan_id})
        response.raise_for_status()
        status = response.json()["task"]["status"]
        return {
            "PENDING": "queued",
            "IN_PROGRESS": "running",
            "SUCCESS": "completed",
            "FAILED": "failed",
            "CANCELED": "failed",
        }.get(status, status)

    async def fetch_results(self, scan_id: str) -> dict[str, Any]:
        client = await self._get_client()
        project_key = os.environ.get("SONAR_PROJECT_KEY", "")

        # Fetch issues
        all_issues = []
        page = 1
        while True:
            response = await client.get(
                "/issues/search",
                params={
                    "componentKeys": project_key,
                    "resolved": "false",
                    "ps": 500,
                    "p": page,
                },
            )
            response.raise_for_status()
            data = response.json()
            all_issues.extend(data["issues"])
            if page * 500 >= data["total"]:
                break
            page += 1

        return {"issues": all_issues}

    def parse_remote(self, raw_results: dict[str, Any]) -> list[Vulnerability]:
        severity_map = {
            "BLOCKER": "critical",
            "CRITICAL": "critical",
            "MAJOR": "high",
            "MINOR": "medium",
            "INFO": "low",
        }
        vulnerabilities = []
        for issue in raw_results.get("issues", []):
            component = issue.get("component", "")
            # Strip project key prefix from component path
            file_path = component.split(":", 1)[-1] if ":" in component else component

            vulnerabilities.append(Vulnerability(
                rule_id=issue.get("rule", ""),
                severity=severity_map.get(issue.get("severity", ""), "medium"),
                message=issue.get("message", ""),
                file_path=file_path,
                line_number=issue.get("line", 0),
                details=issue.get("message", ""),
            ))
        return vulnerabilities
```

### 14.4 GitHub Advanced Security Integration

```python
# src/scanners/remote/github_security.py
"""
GitHub Advanced Security (GHAS) integration.
Pulls code scanning alerts, secret scanning alerts, and Dependabot alerts
from the GitHub API.
"""
import os
from typing import Any

import httpx

from ..base import Vulnerability, ScannerCategory
from .base import RemoteScanner, RemoteConfig, RemoteAuthType


class GitHubSecurityScanner(RemoteScanner):
    """
    Pull-based scanner — doesn't submit scans, but fetches existing
    alerts from GitHub Advanced Security.
    """
    name = "github_advanced_security"
    version = "api-v3"
    category = ScannerCategory.VULNERABILITY

    def __init__(self):
        config = RemoteConfig(
            base_url="https://api.github.com",
            auth_type=RemoteAuthType.BEARER_TOKEN,
            bearer_token=os.environ.get("GITHUB_TOKEN"),
        )
        super().__init__(config)

    def is_applicable(self, detected_tech: dict) -> bool:
        return True  # Works for any GitHub-hosted repo

    async def submit_scan(self, target_path: str, **kwargs) -> str:
        """No submission needed — GHAS runs automatically. Return repo as ID."""
        return kwargs.get("repo_full_name", "")

    async def poll_status(self, scan_id: str) -> str:
        """Always 'completed' since we're pulling existing alerts."""
        return "completed"

    async def fetch_results(self, scan_id: str) -> dict[str, Any]:
        """Fetch all alert types from GHAS."""
        client = await self._get_client()
        owner, repo = scan_id.split("/")

        results = {"code_scanning": [], "secret_scanning": [], "dependabot": []}

        # Code scanning alerts
        try:
            page = 1
            while True:
                resp = await client.get(
                    f"/repos/{owner}/{repo}/code-scanning/alerts",
                    params={"state": "open", "per_page": 100, "page": page},
                )
                if resp.status_code == 404:
                    break  # GHAS not enabled
                resp.raise_for_status()
                alerts = resp.json()
                if not alerts:
                    break
                results["code_scanning"].extend(alerts)
                page += 1
        except httpx.HTTPStatusError:
            pass

        # Secret scanning alerts
        try:
            resp = await client.get(
                f"/repos/{owner}/{repo}/secret-scanning/alerts",
                params={"state": "open", "per_page": 100},
            )
            if resp.status_code == 200:
                results["secret_scanning"] = resp.json()
        except httpx.HTTPStatusError:
            pass

        # Dependabot alerts
        try:
            resp = await client.get(
                f"/repos/{owner}/{repo}/dependabot/alerts",
                params={"state": "open", "per_page": 100},
            )
            if resp.status_code == 200:
                results["dependabot"] = resp.json()
        except httpx.HTTPStatusError:
            pass

        return results

    def parse_remote(self, raw_results: dict[str, Any]) -> list[Vulnerability]:
        vulnerabilities = []

        # Code scanning alerts
        for alert in raw_results.get("code_scanning", []):
            rule = alert.get("rule", {})
            location = alert.get("most_recent_instance", {}).get("location", {})
            severity_map = {"error": "high", "warning": "medium", "note": "low"}
            vulnerabilities.append(Vulnerability(
                rule_id=f"ghas/{rule.get('id', '')}",
                severity=severity_map.get(rule.get("severity", ""), "medium"),
                message=rule.get("description", alert.get("rule", {}).get("name", "")),
                file_path=location.get("path", ""),
                line_number=location.get("start_line", 0),
                details=alert.get("most_recent_instance", {}).get("message", {}).get("text", ""),
            ))

        # Secret scanning alerts
        for alert in raw_results.get("secret_scanning", []):
            vulnerabilities.append(Vulnerability(
                rule_id=f"ghas-secret/{alert.get('secret_type', '')}",
                severity="critical",
                message=f"Exposed secret: {alert.get('secret_type_display_name', '')}",
                file_path="",  # GHAS doesn't expose file path for secrets
                line_number=0,
                details=f"Created: {alert.get('created_at', '')}",
            ))

        # Dependabot alerts
        for alert in raw_results.get("dependabot", []):
            vuln = alert.get("security_vulnerability", {})
            advisory = alert.get("security_advisory", {})
            severity = vuln.get("severity", advisory.get("severity", "medium"))
            vulnerabilities.append(Vulnerability(
                rule_id=f"dependabot/{advisory.get('ghsa_id', '')}",
                severity=severity,
                message=advisory.get("summary", ""),
                file_path=alert.get("dependency", {}).get("manifest_path", ""),
                line_number=0,
                details=advisory.get("description", ""),
                cve=advisory.get("cve_id"),
                package_name=vuln.get("package", {}).get("name", ""),
                installed_version=vuln.get("vulnerable_version_range", ""),
                fixed_version=vuln.get("first_patched_version", {}).get("identifier"),
            ))

        return vulnerabilities
```

### 14.5 Webhook Receiver

```python
# src/api/routes/webhooks.py
"""
Webhook receiver for remote scanner services.
Publishes events to Redis for waiting RemoteScanner instances.
"""
import hashlib
import hmac
import logging
from fastapi import APIRouter, Request, HTTPException, Header

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


async def _get_redis():
    return aioredis.from_url("redis://localhost:6379/0")


@router.post("/snyk")
async def snyk_webhook(
    request: Request,
    x_snyk_webhook_signature: str = Header(None),
):
    """Receive Snyk webhook callbacks."""
    body = await request.body()

    # Verify signature
    if x_snyk_webhook_signature:
        import os
        secret = os.environ["SNYK_WEBHOOK_SECRET"].encode()
        expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, x_snyk_webhook_signature):
            raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    scan_id = payload.get("project", {}).get("id", "")

    if scan_id:
        redis = await _get_redis()
        await redis.publish(f"webhook:{scan_id}", "completed")
        await redis.close()

    return {"status": "received"}


@router.post("/sonarcloud")
async def sonarcloud_webhook(request: Request):
    """Receive SonarCloud webhook callbacks."""
    payload = await request.json()
    task_id = payload.get("taskId", "")
    status = payload.get("status", "")

    if task_id:
        redis = await _get_redis()
        await redis.publish(f"webhook:{task_id}", status)
        await redis.close()

    return {"status": "received"}


@router.post("/github")
async def github_webhook(
    request: Request,
    x_hub_signature_256: str = Header(None),
):
    """Receive GitHub webhook callbacks for GHAS alerts."""
    body = await request.body()

    # Verify signature
    if x_hub_signature_256:
        import os
        secret = os.environ.get("GITHUB_WEBHOOK_SECRET", "").encode()
        expected = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, x_hub_signature_256):
            raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    event_type = request.headers.get("X-GitHub-Event", "")

    # Handle relevant events
    if event_type in ("code_scanning_alert", "secret_scanning_alert", "dependabot_alert"):
        repo = payload.get("repository", {}).get("full_name", "")
        if repo:
            redis = await _get_redis()
            await redis.publish(f"webhook:github:{repo}", event_type)
            await redis.close()

    return {"status": "received"}
```

### 14.6 Remote Scanner Registry

```python
# src/scanners/remote/__init__.py
"""
Remote scanner registry.
Import and register all remote scanner integrations.
"""
from ..base import ScannerRegistry
from .snyk import SnykScanner
from .sonarcloud import SonarCloudScanner
from .github_security import GitHubSecurityScanner


def register_remote_scanners():
    """Register all available remote scanners (only if configured)."""
    import os

    if os.environ.get("SNYK_TOKEN"):
        ScannerRegistry.register(SnykScanner())

    if os.environ.get("SONAR_TOKEN"):
        ScannerRegistry.register(SonarCloudScanner())

    if os.environ.get("GITHUB_TOKEN"):
        # GHAS uses the same token as repo cloning
        ScannerRegistry.register(GitHubSecurityScanner())
```

---

## 15. Database Models

> SQLAlchemy models for persisting scan runs, findings, schedules, and
> scanner configuration. Integrates with the database design from
> `DATABASE_DESIGN_PLAN.md`.

### 15.1 Scan Run Model

```python
# src/models/scan_run.py
"""
ScanRun — represents a single execution of the scan pipeline against
one repository. Tracks status, timing, scanner selection, and summary
statistics.
"""
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Enum, ForeignKey,
    Text, JSON, Index, UniqueConstraint,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

import uuid

from .base import Base, TimestampMixin, OrgScopedMixin


class ScanStatus(str, enum.Enum):
    QUEUED = "queued"
    CLONING = "cloning"
    DETECTING = "detecting"
    SCANNING = "scanning"
    INGESTING = "ingesting"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ScanRun(Base, TimestampMixin, OrgScopedMixin):
    __tablename__ = "scan_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    repo_url: Mapped[str] = mapped_column(String(500), nullable=False)
    repo_name: Mapped[str] = mapped_column(String(255), nullable=False)
    branch: Mapped[str] = mapped_column(String(255), default="main")
    commit_sha: Mapped[Optional[str]] = mapped_column(String(40))

    status: Mapped[ScanStatus] = mapped_column(
        Enum(ScanStatus), default=ScanStatus.QUEUED, nullable=False
    )
    profile: Mapped[str] = mapped_column(String(50), default="balanced")

    # Timing
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float)

    # Scanner metadata
    scanners_selected: Mapped[Optional[dict]] = mapped_column(JSON)  # ["semgrep", "trivy", ...]
    scanners_completed: Mapped[Optional[dict]] = mapped_column(JSON)
    scanners_failed: Mapped[Optional[dict]] = mapped_column(JSON)

    # Results summary
    total_findings: Mapped[int] = mapped_column(Integer, default=0)
    critical_count: Mapped[int] = mapped_column(Integer, default=0)
    high_count: Mapped[int] = mapped_column(Integer, default=0)
    medium_count: Mapped[int] = mapped_column(Integer, default=0)
    low_count: Mapped[int] = mapped_column(Integer, default=0)

    # Detected technologies
    detected_tech: Mapped[Optional[dict]] = mapped_column(JSON)

    # Error info (if failed)
    error_message: Mapped[Optional[str]] = mapped_column(Text)

    # Trigger
    triggered_by: Mapped[str] = mapped_column(
        String(50), default="manual"
    )  # manual, schedule, webhook, api
    schedule_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("scan_schedules.id"), nullable=True
    )

    # Relationships
    findings: Mapped[list["Finding"]] = relationship(
        "Finding", back_populates="scan_run", cascade="all, delete-orphan"
    )
    schedule: Mapped[Optional["ScanSchedule"]] = relationship(
        "ScanSchedule", back_populates="scan_runs"
    )

    __table_args__ = (
        Index("ix_scan_runs_org_status", "org_id", "status"),
        Index("ix_scan_runs_org_repo", "org_id", "repo_name"),
        Index("ix_scan_runs_created", "created_at"),
    )

    def mark_started(self):
        self.status = ScanStatus.SCANNING
        self.started_at = datetime.utcnow()

    def mark_completed(self, findings_count: int = 0):
        self.status = ScanStatus.COMPLETED
        self.completed_at = datetime.utcnow()
        if self.started_at:
            self.duration_seconds = (self.completed_at - self.started_at).total_seconds()
        self.total_findings = findings_count

    def mark_failed(self, error: str):
        self.status = ScanStatus.FAILED
        self.completed_at = datetime.utcnow()
        self.error_message = error
```

### 15.2 Finding Model

```python
# src/models/finding.py
"""
Finding — individual security finding from a scanner.
Uses fingerprint-based deduplication for idempotent upserts.
"""
import enum
import hashlib
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column, String, Integer, DateTime, Enum, ForeignKey,
    Text, JSON, Index, UniqueConstraint, Boolean,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from .base import Base, TimestampMixin, OrgScopedMixin


class Severity(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class FindingStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"
    SUPPRESSED = "suppressed"
    FALSE_POSITIVE = "false_positive"
    ACCEPTED_RISK = "accepted_risk"


class Finding(Base, TimestampMixin, OrgScopedMixin):
    __tablename__ = "findings"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Deduplication fingerprint
    fingerprint: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True
    )

    # Scanner reference
    scan_run_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("scan_runs.id"), nullable=False
    )
    scanner_name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Finding identity
    rule_id: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[Severity] = mapped_column(Enum(Severity), nullable=False)
    status: Mapped[FindingStatus] = mapped_column(
        Enum(FindingStatus), default=FindingStatus.OPEN, nullable=False
    )

    # Location
    repo_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), default="")
    line_number: Mapped[int] = mapped_column(Integer, default=0)
    column_number: Mapped[int] = mapped_column(Integer, default=0)

    # Content
    message: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[Optional[str]] = mapped_column(Text)
    snippet: Mapped[Optional[str]] = mapped_column(Text)

    # Vulnerability metadata (for SCA findings)
    cve: Mapped[Optional[str]] = mapped_column(String(50))
    cwe: Mapped[Optional[str]] = mapped_column(String(50))
    package_name: Mapped[Optional[str]] = mapped_column(String(255))
    installed_version: Mapped[Optional[str]] = mapped_column(String(100))
    fixed_version: Mapped[Optional[str]] = mapped_column(String(100))

    # SARIF-specific
    sarif_level: Mapped[Optional[str]] = mapped_column(String(50))
    sarif_run_index: Mapped[Optional[int]] = mapped_column(Integer)

    # Tracking
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    suppressed_by: Mapped[Optional[str]] = mapped_column(String(255))
    suppression_reason: Mapped[Optional[str]] = mapped_column(Text)

    # AI analysis
    ai_analysis: Mapped[Optional[dict]] = mapped_column(JSON)
    ai_priority_score: Mapped[Optional[float]] = mapped_column(Integer)
    ai_remediation: Mapped[Optional[str]] = mapped_column(Text)

    # Raw data
    raw_output: Mapped[Optional[dict]] = mapped_column(JSON)

    # Relationships
    scan_run: Mapped["ScanRun"] = relationship("ScanRun", back_populates="findings")

    __table_args__ = (
        Index("ix_findings_org_severity", "org_id", "severity"),
        Index("ix_findings_org_status", "org_id", "status"),
        Index("ix_findings_org_repo", "org_id", "repo_name"),
        Index("ix_findings_fingerprint_org", "fingerprint", "org_id"),
        Index("ix_findings_scanner", "scanner_name"),
        Index("ix_findings_cve", "cve"),
        UniqueConstraint("fingerprint", "org_id", name="uq_finding_fingerprint_org"),
    )

    @staticmethod
    def compute_fingerprint(
        scanner_name: str,
        rule_id: str,
        file_path: str,
        line_number: int,
        package_name: str = "",
    ) -> str:
        """
        SHA-256 fingerprint for deduplication.
        Same finding across scan runs gets the same fingerprint.
        """
        content = f"{scanner_name}:{rule_id}:{file_path}:{line_number}:{package_name}"
        return hashlib.sha256(content.encode()).hexdigest()
```

### 15.3 Scan Schedule Model

```python
# src/models/scan_schedule.py
"""
ScanSchedule — cron-based recurring scan configuration.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String, Integer, DateTime, Boolean, ForeignKey, Text, JSON, Index,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from .base import Base, TimestampMixin, OrgScopedMixin


class ScanSchedule(Base, TimestampMixin, OrgScopedMixin):
    __tablename__ = "scan_schedules"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

    # Target
    repo_url: Mapped[str] = mapped_column(String(500), nullable=False)
    repo_name: Mapped[str] = mapped_column(String(255), nullable=False)
    branch: Mapped[str] = mapped_column(String(255), default="main")

    # Schedule (cron expression)
    cron_expression: Mapped[str] = mapped_column(String(100), nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")

    # Configuration
    profile: Mapped[str] = mapped_column(String(50), default="balanced")
    scanner_overrides: Mapped[Optional[dict]] = mapped_column(JSON)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Execution windows
    window_start: Mapped[Optional[str]] = mapped_column(String(5))  # "22:00"
    window_end: Mapped[Optional[str]] = mapped_column(String(5))    # "06:00"

    # Tracking
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    next_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    max_consecutive_failures: Mapped[int] = mapped_column(Integer, default=3)

    # Creator
    created_by: Mapped[Optional[str]] = mapped_column(String(255))

    # Relationships
    scan_runs: Mapped[list["ScanRun"]] = relationship(
        "ScanRun", back_populates="schedule"
    )

    __table_args__ = (
        Index("ix_schedules_org_enabled", "org_id", "enabled"),
        Index("ix_schedules_next_run", "next_run_at"),
    )

    def record_run(self, success: bool):
        """Update tracking after a scheduled run."""
        self.last_run_at = datetime.utcnow()
        self.run_count += 1
        if success:
            self.consecutive_failures = 0
        else:
            self.failure_count += 1
            self.consecutive_failures += 1
            if self.consecutive_failures >= self.max_consecutive_failures:
                self.enabled = False
```

### 15.4 Scanner Config Model

```python
# src/models/scanner_config.py
"""
ScannerConfig — per-organization scanner configuration stored in the database.
Overrides default scanner settings for specific orgs.
"""
import uuid
from typing import Optional

from sqlalchemy import String, Boolean, Integer, Float, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from .base import Base, TimestampMixin, OrgScopedMixin


class ScannerConfigDB(Base, TimestampMixin, OrgScopedMixin):
    __tablename__ = "scanner_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    scanner_name: Mapped[str] = mapped_column(String(100), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=50)

    # Execution
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=600)
    memory_limit_mb: Mapped[int] = mapped_column(Integer, default=2048)
    cpu_limit: Mapped[float] = mapped_column(Float, default=2.0)

    # Scanner-specific settings (JSON blob)
    custom_config: Mapped[Optional[dict]] = mapped_column(JSON)
    # e.g., {"config": "auto", "severity": "CRITICAL,HIGH", "extra_args": [...]}

    # Custom rules
    custom_rules_path: Mapped[Optional[str]] = mapped_column(String(500))
    ignore_patterns: Mapped[Optional[dict]] = mapped_column(JSON)  # ["*.test.js", "vendor/"]

    __table_args__ = (
        Index("ix_scanner_config_org_name", "org_id", "scanner_name", unique=True),
    )
```

### 15.5 Alembic Migration

```python
# alembic/versions/003_create_scanner_tables.py
"""
Create scanner tables: scan_runs, findings, scan_schedules, scanner_configs.

Revision ID: 003_scanner_tables
Revises: 002_auth_tables
Create Date: {CURRENT_DATE}
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

revision = "003_scanner_tables"
down_revision = "002_auth_tables"
branch_labels = None
depends_on = None


def upgrade():
    # --- scan_runs ---
    op.create_table(
        "scan_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("repo_url", sa.String(500), nullable=False),
        sa.Column("repo_name", sa.String(255), nullable=False),
        sa.Column("branch", sa.String(255), default="main"),
        sa.Column("commit_sha", sa.String(40)),
        sa.Column("status", sa.String(20), nullable=False, default="queued"),
        sa.Column("profile", sa.String(50), default="balanced"),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("duration_seconds", sa.Float),
        sa.Column("scanners_selected", JSON),
        sa.Column("scanners_completed", JSON),
        sa.Column("scanners_failed", JSON),
        sa.Column("total_findings", sa.Integer, default=0),
        sa.Column("critical_count", sa.Integer, default=0),
        sa.Column("high_count", sa.Integer, default=0),
        sa.Column("medium_count", sa.Integer, default=0),
        sa.Column("low_count", sa.Integer, default=0),
        sa.Column("detected_tech", JSON),
        sa.Column("error_message", sa.Text),
        sa.Column("triggered_by", sa.String(50), default="manual"),
        sa.Column("schedule_id", UUID(as_uuid=True), sa.ForeignKey("scan_schedules.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_scan_runs_org_status", "scan_runs", ["org_id", "status"])
    op.create_index("ix_scan_runs_org_repo", "scan_runs", ["org_id", "repo_name"])
    op.create_index("ix_scan_runs_created", "scan_runs", ["created_at"])

    # --- findings ---
    op.create_table(
        "findings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("scan_run_id", UUID(as_uuid=True), sa.ForeignKey("scan_runs.id"), nullable=False),
        sa.Column("scanner_name", sa.String(100), nullable=False),
        sa.Column("rule_id", sa.String(255), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, default="open"),
        sa.Column("repo_name", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(1000), default=""),
        sa.Column("line_number", sa.Integer, default=0),
        sa.Column("column_number", sa.Integer, default=0),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("details", sa.Text),
        sa.Column("snippet", sa.Text),
        sa.Column("cve", sa.String(50)),
        sa.Column("cwe", sa.String(50)),
        sa.Column("package_name", sa.String(255)),
        sa.Column("installed_version", sa.String(100)),
        sa.Column("fixed_version", sa.String(100)),
        sa.Column("sarif_level", sa.String(50)),
        sa.Column("sarif_run_index", sa.Integer),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("suppressed_by", sa.String(255)),
        sa.Column("suppression_reason", sa.Text),
        sa.Column("ai_analysis", JSON),
        sa.Column("ai_priority_score", sa.Integer),
        sa.Column("ai_remediation", sa.Text),
        sa.Column("raw_output", JSON),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_findings_org_severity", "findings", ["org_id", "severity"])
    op.create_index("ix_findings_org_status", "findings", ["org_id", "status"])
    op.create_index("ix_findings_org_repo", "findings", ["org_id", "repo_name"])
    op.create_index("ix_findings_fingerprint_org", "findings", ["fingerprint", "org_id"])
    op.create_index("ix_findings_scanner", "findings", ["scanner_name"])
    op.create_index("ix_findings_cve", "findings", ["cve"])
    op.create_unique_constraint("uq_finding_fingerprint_org", "findings", ["fingerprint", "org_id"])

    # --- scan_schedules ---
    op.create_table(
        "scan_schedules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("repo_url", sa.String(500), nullable=False),
        sa.Column("repo_name", sa.String(255), nullable=False),
        sa.Column("branch", sa.String(255), default="main"),
        sa.Column("cron_expression", sa.String(100), nullable=False),
        sa.Column("timezone", sa.String(50), default="UTC"),
        sa.Column("profile", sa.String(50), default="balanced"),
        sa.Column("scanner_overrides", JSON),
        sa.Column("enabled", sa.Boolean, default=True),
        sa.Column("window_start", sa.String(5)),
        sa.Column("window_end", sa.String(5)),
        sa.Column("last_run_at", sa.DateTime(timezone=True)),
        sa.Column("next_run_at", sa.DateTime(timezone=True)),
        sa.Column("run_count", sa.Integer, default=0),
        sa.Column("failure_count", sa.Integer, default=0),
        sa.Column("consecutive_failures", sa.Integer, default=0),
        sa.Column("max_consecutive_failures", sa.Integer, default=3),
        sa.Column("created_by", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_schedules_org_enabled", "scan_schedules", ["org_id", "enabled"])
    op.create_index("ix_schedules_next_run", "scan_schedules", ["next_run_at"])

    # --- scanner_configs ---
    op.create_table(
        "scanner_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("scanner_name", sa.String(100), nullable=False),
        sa.Column("enabled", sa.Boolean, default=True),
        sa.Column("priority", sa.Integer, default=50),
        sa.Column("timeout_seconds", sa.Integer, default=600),
        sa.Column("memory_limit_mb", sa.Integer, default=2048),
        sa.Column("cpu_limit", sa.Float, default=2.0),
        sa.Column("custom_config", JSON),
        sa.Column("custom_rules_path", sa.String(500)),
        sa.Column("ignore_patterns", JSON),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_scanner_config_org_name", "scanner_configs",
        ["org_id", "scanner_name"], unique=True,
    )


def downgrade():
    op.drop_table("scanner_configs")
    op.drop_table("findings")
    op.drop_table("scan_runs")
    op.drop_table("scan_schedules")
```

---

## 16. API Endpoints

> FastAPI router exposing scan management, findings, scanner registry, and
> schedule CRUD. All endpoints are org-scoped and require authentication.

### 16.1 Scan Management Router

```python
# src/api/routes/scans.py
"""
Scan management API — trigger scans, check status, list history.
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies import get_db, get_current_user, require_role
from ...models.scan_run import ScanRun, ScanStatus

router = APIRouter(prefix="/scans", tags=["scans"])


# ---- Request / Response Schemas ----

class ScanRequest(BaseModel):
    repo_url: str = Field(..., description="Git repository URL to scan")
    branch: str = Field("main", description="Branch to scan")
    profile: str = Field("balanced", description="Scan profile: fast, balanced, deep")
    scanner_overrides: Optional[list[str]] = Field(
        None, description="Override scanner selection (e.g., ['semgrep', 'trivy'])"
    )


class ScanResponse(BaseModel):
    id: uuid.UUID
    repo_url: str
    repo_name: str
    branch: str
    status: str
    profile: str
    triggered_by: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_seconds: Optional[float]
    total_findings: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    detected_tech: Optional[dict]
    scanners_selected: Optional[dict]
    scanners_completed: Optional[dict]
    scanners_failed: Optional[dict]
    error_message: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ScanListResponse(BaseModel):
    items: list[ScanResponse]
    total: int
    page: int
    page_size: int


class ScanSummary(BaseModel):
    total_scans: int
    completed: int
    failed: int
    in_progress: int
    avg_duration_seconds: Optional[float]
    total_findings: int
    critical_findings: int


# ---- Endpoints ----

@router.post("", response_model=ScanResponse, status_code=201)
async def trigger_scan(
    request: ScanRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("analyst")),
):
    """
    Trigger a new scan for a repository.
    Queues the scan for asynchronous execution by the scanner worker.
    """
    import redis.asyncio as aioredis
    import json

    # Extract repo name from URL
    repo_name = request.repo_url.rstrip("/").split("/")[-1].replace(".git", "")

    scan_run = ScanRun(
        org_id=user.org_id,
        repo_url=request.repo_url,
        repo_name=repo_name,
        branch=request.branch,
        profile=request.profile,
        scanners_selected=request.scanner_overrides,
        status=ScanStatus.QUEUED,
        triggered_by="api",
    )
    db.add(scan_run)
    await db.commit()
    await db.refresh(scan_run)

    # Enqueue to Redis
    redis = aioredis.from_url("redis://localhost:6379/0")
    await redis.lpush(
        "scan_queue",
        json.dumps({
            "scan_id": str(scan_run.id),
            "repo_url": request.repo_url,
            "repo_name": repo_name,
            "branch": request.branch,
            "profile": request.profile,
            "scanner_overrides": request.scanner_overrides,
            "org_id": str(user.org_id),
        }),
    )
    await redis.close()

    return scan_run


@router.get("", response_model=ScanListResponse)
async def list_scans(
    status: Optional[str] = Query(None, description="Filter by status"),
    repo_name: Optional[str] = Query(None, description="Filter by repository name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """List scan runs for the current organization."""
    query = select(ScanRun).where(ScanRun.org_id == user.org_id)

    if status:
        query = query.where(ScanRun.status == status)
    if repo_name:
        query = query.where(ScanRun.repo_name.ilike(f"%{repo_name}%"))

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar()

    # Paginate
    query = query.order_by(desc(ScanRun.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    scans = result.scalars().all()

    return ScanListResponse(items=scans, total=total, page=page, page_size=page_size)


@router.get("/summary", response_model=ScanSummary)
async def scan_summary(
    days: int = Query(30, ge=1, le=365, description="Lookback period in days"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get scan summary statistics for the current organization."""
    from datetime import timedelta

    cutoff = datetime.utcnow() - timedelta(days=days)
    base = select(ScanRun).where(
        ScanRun.org_id == user.org_id,
        ScanRun.created_at >= cutoff,
    )

    result = await db.execute(
        select(
            func.count(ScanRun.id).label("total"),
            func.count(ScanRun.id).filter(ScanRun.status == ScanStatus.COMPLETED).label("completed"),
            func.count(ScanRun.id).filter(ScanRun.status == ScanStatus.FAILED).label("failed"),
            func.count(ScanRun.id).filter(
                ScanRun.status.in_([ScanStatus.QUEUED, ScanStatus.SCANNING, ScanStatus.CLONING])
            ).label("in_progress"),
            func.avg(ScanRun.duration_seconds).label("avg_duration"),
            func.sum(ScanRun.total_findings).label("total_findings"),
            func.sum(ScanRun.critical_count).label("critical"),
        ).where(
            ScanRun.org_id == user.org_id,
            ScanRun.created_at >= cutoff,
        )
    )
    row = result.one()

    return ScanSummary(
        total_scans=row.total or 0,
        completed=row.completed or 0,
        failed=row.failed or 0,
        in_progress=row.in_progress or 0,
        avg_duration_seconds=round(row.avg_duration, 1) if row.avg_duration else None,
        total_findings=row.total_findings or 0,
        critical_findings=row.critical or 0,
    )


@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan(
    scan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get details of a specific scan run."""
    scan = await db.get(ScanRun, scan_id)
    if not scan or scan.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.post("/{scan_id}/cancel", response_model=ScanResponse)
async def cancel_scan(
    scan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("analyst")),
):
    """Cancel a queued or running scan."""
    scan = await db.get(ScanRun, scan_id)
    if not scan or scan.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Scan not found")

    if scan.status not in (ScanStatus.QUEUED, ScanStatus.SCANNING, ScanStatus.CLONING):
        raise HTTPException(status_code=400, detail=f"Cannot cancel scan in '{scan.status}' state")

    scan.status = ScanStatus.CANCELLED
    scan.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(scan)

    # Notify worker to cancel
    import redis.asyncio as aioredis
    redis = aioredis.from_url("redis://localhost:6379/0")
    await redis.publish(f"scan_cancel:{scan_id}", "cancel")
    await redis.close()

    return scan


@router.post("/{scan_id}/retry", response_model=ScanResponse, status_code=201)
async def retry_scan(
    scan_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("analyst")),
):
    """Retry a failed scan by creating a new scan run with the same parameters."""
    original = await db.get(ScanRun, scan_id)
    if not original or original.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Scan not found")

    if original.status != ScanStatus.FAILED:
        raise HTTPException(status_code=400, detail="Only failed scans can be retried")

    # Create new scan with same parameters
    new_scan = ScanRun(
        org_id=user.org_id,
        repo_url=original.repo_url,
        repo_name=original.repo_name,
        branch=original.branch,
        profile=original.profile,
        scanners_selected=original.scanners_selected,
        status=ScanStatus.QUEUED,
        triggered_by="retry",
    )
    db.add(new_scan)
    await db.commit()
    await db.refresh(new_scan)

    # Enqueue
    import redis.asyncio as aioredis
    import json
    redis = aioredis.from_url("redis://localhost:6379/0")
    await redis.lpush(
        "scan_queue",
        json.dumps({
            "scan_id": str(new_scan.id),
            "repo_url": new_scan.repo_url,
            "repo_name": new_scan.repo_name,
            "branch": new_scan.branch,
            "profile": new_scan.profile,
            "scanner_overrides": new_scan.scanners_selected,
            "org_id": str(user.org_id),
        }),
    )
    await redis.close()

    return new_scan
```

### 16.2 Findings Router

```python
# src/api/routes/findings.py
"""
Findings API — query, filter, suppress, and export security findings.
"""
import csv
import io
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies import get_db, get_current_user, require_role
from ...models.finding import Finding, Severity, FindingStatus

router = APIRouter(prefix="/findings", tags=["findings"])


# ---- Schemas ----

class FindingResponse(BaseModel):
    id: uuid.UUID
    fingerprint: str
    scan_run_id: uuid.UUID
    scanner_name: str
    rule_id: str
    severity: str
    status: str
    repo_name: str
    file_path: str
    line_number: int
    message: str
    details: Optional[str]
    snippet: Optional[str]
    cve: Optional[str]
    cwe: Optional[str]
    package_name: Optional[str]
    installed_version: Optional[str]
    fixed_version: Optional[str]
    first_seen_at: datetime
    last_seen_at: datetime
    ai_analysis: Optional[dict]
    ai_priority_score: Optional[int]
    ai_remediation: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class FindingListResponse(BaseModel):
    items: list[FindingResponse]
    total: int
    page: int
    page_size: int


class FindingSeveritySummary(BaseModel):
    critical: int
    high: int
    medium: int
    low: int
    info: int
    total: int


class FindingStatusSummary(BaseModel):
    open: int
    resolved: int
    suppressed: int
    false_positive: int
    accepted_risk: int


class SuppressRequest(BaseModel):
    status: str = Field(..., description="New status: suppressed, false_positive, accepted_risk")
    reason: str = Field(..., min_length=10, description="Reason for suppression")


class BulkSuppressRequest(BaseModel):
    finding_ids: list[uuid.UUID]
    status: str
    reason: str = Field(..., min_length=10)


# ---- Endpoints ----

@router.get("", response_model=FindingListResponse)
async def list_findings(
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="Filter by status (open, resolved, suppressed)"),
    scanner: Optional[str] = Query(None),
    repo_name: Optional[str] = Query(None),
    rule_id: Optional[str] = Query(None),
    cve: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Search in message and details"),
    scan_run_id: Optional[uuid.UUID] = Query(None),
    sort_by: str = Query("severity", description="Sort by: severity, first_seen_at, last_seen_at"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """List findings with filtering, search, and pagination."""
    query = select(Finding).where(Finding.org_id == user.org_id)

    if severity:
        query = query.where(Finding.severity == severity)
    if status:
        query = query.where(Finding.status == status)
    else:
        query = query.where(Finding.status == FindingStatus.OPEN)  # Default to open
    if scanner:
        query = query.where(Finding.scanner_name == scanner)
    if repo_name:
        query = query.where(Finding.repo_name.ilike(f"%{repo_name}%"))
    if rule_id:
        query = query.where(Finding.rule_id == rule_id)
    if cve:
        query = query.where(Finding.cve == cve)
    if search:
        query = query.where(
            Finding.message.ilike(f"%{search}%") | Finding.details.ilike(f"%{search}%")
        )
    if scan_run_id:
        query = query.where(Finding.scan_run_id == scan_run_id)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar()

    # Sort
    sort_map = {
        "severity": Finding.severity,
        "first_seen_at": desc(Finding.first_seen_at),
        "last_seen_at": desc(Finding.last_seen_at),
        "scanner": Finding.scanner_name,
    }
    query = query.order_by(sort_map.get(sort_by, Finding.severity))
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    findings = result.scalars().all()

    return FindingListResponse(items=findings, total=total, page=page, page_size=page_size)


@router.get("/summary/severity", response_model=FindingSeveritySummary)
async def severity_summary(
    repo_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get finding counts grouped by severity (open findings only)."""
    base_filter = and_(
        Finding.org_id == user.org_id,
        Finding.status == FindingStatus.OPEN,
    )
    if repo_name:
        base_filter = and_(base_filter, Finding.repo_name == repo_name)

    result = await db.execute(
        select(
            Finding.severity,
            func.count(Finding.id).label("count"),
        )
        .where(base_filter)
        .group_by(Finding.severity)
    )

    counts = {row.severity: row.count for row in result}
    return FindingSeveritySummary(
        critical=counts.get("critical", 0),
        high=counts.get("high", 0),
        medium=counts.get("medium", 0),
        low=counts.get("low", 0),
        info=counts.get("info", 0),
        total=sum(counts.values()),
    )


@router.get("/summary/status", response_model=FindingStatusSummary)
async def status_summary(
    repo_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get finding counts grouped by status."""
    base_filter = Finding.org_id == user.org_id
    if repo_name:
        base_filter = and_(base_filter, Finding.repo_name == repo_name)

    result = await db.execute(
        select(Finding.status, func.count(Finding.id).label("count"))
        .where(base_filter)
        .group_by(Finding.status)
    )

    counts = {row.status: row.count for row in result}
    return FindingStatusSummary(
        open=counts.get("open", 0),
        resolved=counts.get("resolved", 0),
        suppressed=counts.get("suppressed", 0),
        false_positive=counts.get("false_positive", 0),
        accepted_risk=counts.get("accepted_risk", 0),
    )


@router.get("/export/csv")
async def export_csv(
    severity: Optional[str] = Query(None),
    status: str = Query("open"),
    repo_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Export findings as CSV."""
    query = select(Finding).where(
        Finding.org_id == user.org_id,
        Finding.status == status,
    )
    if severity:
        query = query.where(Finding.severity == severity)
    if repo_name:
        query = query.where(Finding.repo_name == repo_name)

    result = await db.execute(query.order_by(Finding.severity))
    findings = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Scanner", "Rule ID", "Severity", "Status", "Repository",
        "File", "Line", "Message", "CVE", "Package", "Installed Version",
        "Fixed Version", "First Seen", "Last Seen",
    ])
    for f in findings:
        writer.writerow([
            str(f.id), f.scanner_name, f.rule_id, f.severity, f.status,
            f.repo_name, f.file_path, f.line_number, f.message, f.cve or "",
            f.package_name or "", f.installed_version or "", f.fixed_version or "",
            f.first_seen_at.isoformat(), f.last_seen_at.isoformat(),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=findings_{datetime.utcnow().strftime('%Y%m%d')}.csv"},
    )


@router.get("/export/sarif")
async def export_sarif(
    scan_run_id: uuid.UUID = Query(..., description="Scan run to export"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Export findings for a scan run in SARIF format."""
    from ...scanners.sarif import export_sarif as to_sarif
    from ...scanners.base import Vulnerability

    findings = (await db.execute(
        select(Finding).where(
            Finding.org_id == user.org_id,
            Finding.scan_run_id == scan_run_id,
        )
    )).scalars().all()

    if not findings:
        raise HTTPException(status_code=404, detail="No findings for this scan run")

    # Convert to Vulnerability objects for SARIF export
    vulns = []
    for f in findings:
        vulns.append(Vulnerability(
            rule_id=f.rule_id,
            severity=f.severity,
            message=f.message,
            file_path=f.file_path,
            line_number=f.line_number,
            details=f.details or "",
            cve=f.cve,
            package_name=f.package_name,
        ))

    # Group by scanner
    by_scanner: dict[str, list] = {}
    for f, v in zip(findings, vulns):
        by_scanner.setdefault(f.scanner_name, []).append(v)

    sarif = to_sarif(by_scanner, tool_name="{PROJECT_NAME}")
    return sarif


@router.get("/{finding_id}", response_model=FindingResponse)
async def get_finding(
    finding_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get a specific finding by ID."""
    finding = await db.get(Finding, finding_id)
    if not finding or finding.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Finding not found")
    return finding


@router.patch("/{finding_id}/suppress", response_model=FindingResponse)
async def suppress_finding(
    finding_id: uuid.UUID,
    request: SuppressRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("analyst")),
):
    """Suppress a finding (mark as false positive, accepted risk, etc.)."""
    valid_statuses = {"suppressed", "false_positive", "accepted_risk"}
    if request.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {valid_statuses}")

    finding = await db.get(Finding, finding_id)
    if not finding or finding.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Finding not found")

    finding.status = request.status
    finding.suppressed_by = user.email
    finding.suppression_reason = request.reason
    await db.commit()
    await db.refresh(finding)
    return finding


@router.post("/bulk/suppress")
async def bulk_suppress(
    request: BulkSuppressRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("analyst")),
):
    """Bulk suppress multiple findings."""
    valid_statuses = {"suppressed", "false_positive", "accepted_risk"}
    if request.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {valid_statuses}")

    updated = 0
    for finding_id in request.finding_ids:
        finding = await db.get(Finding, finding_id)
        if finding and finding.org_id == user.org_id:
            finding.status = request.status
            finding.suppressed_by = user.email
            finding.suppression_reason = request.reason
            updated += 1

    await db.commit()
    return {"updated": updated, "total_requested": len(request.finding_ids)}
```

### 16.3 Scanners Registry Router

```python
# src/api/routes/scanners.py
"""
Scanner registry API — list available scanners, check status, manage configs.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies import get_db, get_current_user, require_role
from ...models.scanner_config import ScannerConfigDB
from ...scanners.base import ScannerRegistry

router = APIRouter(prefix="/scanners", tags=["scanners"])


# ---- Schemas ----

class ScannerInfo(BaseModel):
    name: str
    version: str
    category: str
    execution_modes: list[str]
    enabled: bool
    description: Optional[str] = None


class ScannerConfigRequest(BaseModel):
    enabled: bool = True
    priority: int = Field(50, ge=1, le=100)
    timeout_seconds: int = Field(600, ge=30, le=7200)
    memory_limit_mb: int = Field(2048, ge=256, le=16384)
    cpu_limit: float = Field(2.0, ge=0.5, le=16.0)
    custom_config: Optional[dict] = None
    ignore_patterns: Optional[list[str]] = None


class ScannerConfigResponse(BaseModel):
    id: uuid.UUID
    scanner_name: str
    enabled: bool
    priority: int
    timeout_seconds: int
    memory_limit_mb: int
    cpu_limit: float
    custom_config: Optional[dict]
    ignore_patterns: Optional[dict]

    class Config:
        from_attributes = True


# ---- Endpoints ----

@router.get("", response_model=list[ScannerInfo])
async def list_scanners(
    category: Optional[str] = Query(None, description="Filter by category"),
    user=Depends(get_current_user),
):
    """List all registered scanners."""
    scanners = []
    for name, scanner in ScannerRegistry._scanners.items():
        if category and scanner.category.value != category:
            continue
        scanners.append(ScannerInfo(
            name=scanner.name,
            version=scanner.version,
            category=scanner.category.value,
            execution_modes=[m.value for m in scanner.execution_modes],
            enabled=True,
            description=scanner.__class__.__doc__,
        ))
    return scanners


@router.get("/categories")
async def list_categories(user=Depends(get_current_user)):
    """List scanner categories with counts."""
    categories = {}
    for scanner in ScannerRegistry._scanners.values():
        cat = scanner.category.value
        categories[cat] = categories.get(cat, 0) + 1
    return categories


@router.get("/configs", response_model=list[ScannerConfigResponse])
async def list_scanner_configs(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """List per-organization scanner configurations."""
    result = await db.execute(
        select(ScannerConfigDB).where(ScannerConfigDB.org_id == user.org_id)
    )
    return result.scalars().all()


@router.put("/configs/{scanner_name}", response_model=ScannerConfigResponse)
async def upsert_scanner_config(
    scanner_name: str,
    request: ScannerConfigRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("admin")),
):
    """Create or update scanner configuration for the current organization."""
    # Verify scanner exists
    if scanner_name not in ScannerRegistry._scanners:
        raise HTTPException(status_code=404, detail=f"Scanner '{scanner_name}' not found")

    # Upsert
    result = await db.execute(
        select(ScannerConfigDB).where(
            ScannerConfigDB.org_id == user.org_id,
            ScannerConfigDB.scanner_name == scanner_name,
        )
    )
    config = result.scalar_one_or_none()

    if config:
        config.enabled = request.enabled
        config.priority = request.priority
        config.timeout_seconds = request.timeout_seconds
        config.memory_limit_mb = request.memory_limit_mb
        config.cpu_limit = request.cpu_limit
        config.custom_config = request.custom_config
        config.ignore_patterns = request.ignore_patterns
    else:
        config = ScannerConfigDB(
            org_id=user.org_id,
            scanner_name=scanner_name,
            **request.model_dump(),
        )
        db.add(config)

    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/configs/{scanner_name}", status_code=204)
async def delete_scanner_config(
    scanner_name: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("admin")),
):
    """Delete per-org scanner configuration (reverts to defaults)."""
    result = await db.execute(
        select(ScannerConfigDB).where(
            ScannerConfigDB.org_id == user.org_id,
            ScannerConfigDB.scanner_name == scanner_name,
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    await db.delete(config)
    await db.commit()
```

### 16.4 Schedules Router

```python
# src/api/routes/schedules.py
"""
Scan schedule API — CRUD for recurring scan schedules.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies import get_db, get_current_user, require_role
from ...models.scan_schedule import ScanSchedule

router = APIRouter(prefix="/schedules", tags=["schedules"])


# ---- Schemas ----

class ScheduleRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    repo_url: str
    repo_name: str
    branch: str = "main"
    cron_expression: str = Field(..., description="Cron expression (e.g., '0 2 * * 1')")
    timezone: str = "UTC"
    profile: str = "balanced"
    scanner_overrides: Optional[dict] = None
    enabled: bool = True
    window_start: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    window_end: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")


class ScheduleResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    repo_url: str
    repo_name: str
    branch: str
    cron_expression: str
    timezone: str
    profile: str
    scanner_overrides: Optional[dict]
    enabled: bool
    window_start: Optional[str]
    window_end: Optional[str]
    last_run_at: Optional[str]
    next_run_at: Optional[str]
    run_count: int
    failure_count: int
    consecutive_failures: int
    created_by: Optional[str]

    class Config:
        from_attributes = True


# ---- Endpoints ----

@router.get("", response_model=list[ScheduleResponse])
async def list_schedules(
    enabled_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """List all scan schedules for the organization."""
    query = select(ScanSchedule).where(ScanSchedule.org_id == user.org_id)
    if enabled_only:
        query = query.where(ScanSchedule.enabled == True)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ScheduleResponse, status_code=201)
async def create_schedule(
    request: ScheduleRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("admin")),
):
    """Create a new scan schedule."""
    # Validate cron expression
    try:
        from apscheduler.triggers.cron import CronTrigger
        CronTrigger.from_crontab(request.cron_expression)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid cron expression: {exc}")

    schedule = ScanSchedule(
        org_id=user.org_id,
        created_by=user.email,
        **request.model_dump(),
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)

    # Register with scheduler
    from ...scanners.scheduling import ScheduleExecutor
    executor = ScheduleExecutor.get_instance()
    executor.add_schedule(schedule)

    return schedule


@router.get("/{schedule_id}", response_model=ScheduleResponse)
async def get_schedule(
    schedule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get a specific schedule."""
    schedule = await db.get(ScanSchedule, schedule_id)
    if not schedule or schedule.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.put("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: uuid.UUID,
    request: ScheduleRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("admin")),
):
    """Update a scan schedule."""
    schedule = await db.get(ScanSchedule, schedule_id)
    if not schedule or schedule.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Validate cron
    try:
        from apscheduler.triggers.cron import CronTrigger
        CronTrigger.from_crontab(request.cron_expression)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid cron expression: {exc}")

    for key, value in request.model_dump().items():
        setattr(schedule, key, value)

    await db.commit()
    await db.refresh(schedule)

    # Update scheduler
    from ...scanners.scheduling import ScheduleExecutor
    executor = ScheduleExecutor.get_instance()
    executor.update_schedule(schedule)

    return schedule


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("admin")),
):
    """Delete a scan schedule."""
    schedule = await db.get(ScanSchedule, schedule_id)
    if not schedule or schedule.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Remove from scheduler
    from ...scanners.scheduling import ScheduleExecutor
    executor = ScheduleExecutor.get_instance()
    executor.remove_schedule(str(schedule_id))

    await db.delete(schedule)
    await db.commit()


@router.post("/{schedule_id}/toggle", response_model=ScheduleResponse)
async def toggle_schedule(
    schedule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("admin")),
):
    """Enable or disable a schedule."""
    schedule = await db.get(ScanSchedule, schedule_id)
    if not schedule or schedule.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Schedule not found")

    schedule.enabled = not schedule.enabled
    if schedule.enabled:
        schedule.consecutive_failures = 0  # Reset on re-enable

    await db.commit()
    await db.refresh(schedule)

    # Update scheduler
    from ...scanners.scheduling import ScheduleExecutor
    executor = ScheduleExecutor.get_instance()
    if schedule.enabled:
        executor.add_schedule(schedule)
    else:
        executor.remove_schedule(str(schedule_id))

    return schedule


@router.post("/{schedule_id}/run-now", status_code=201)
async def run_schedule_now(
    schedule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("analyst")),
):
    """Manually trigger a scheduled scan immediately."""
    schedule = await db.get(ScanSchedule, schedule_id)
    if not schedule or schedule.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Schedule not found")

    from ...scanners.scheduling import ScheduleExecutor
    executor = ScheduleExecutor.get_instance()
    scan_id = await executor.trigger_immediate(schedule)

    return {"scan_id": str(scan_id), "message": "Scan triggered"}
```

### 16.5 Router Registration

```python
# src/api/routes/__init__.py
"""
Register all scanner-related routes with the FastAPI app.
"""
from fastapi import FastAPI


def register_scanner_routes(app: FastAPI):
    """Mount all scanner-related routers."""
    from .scans import router as scans_router
    from .findings import router as findings_router
    from .scanners import router as scanners_router
    from .schedules import router as schedules_router
    from .webhooks import router as webhooks_router

    app.include_router(scans_router, prefix="/api/v1")
    app.include_router(findings_router, prefix="/api/v1")
    app.include_router(scanners_router, prefix="/api/v1")
    app.include_router(schedules_router, prefix="/api/v1")
    app.include_router(webhooks_router, prefix="/api/v1")
```

### 16.6 API Endpoint Summary

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| **Scans** | | | |
| `POST` | `/api/v1/scans` | Trigger new scan | analyst+ |
| `GET` | `/api/v1/scans` | List scans (paginated, filtered) | user+ |
| `GET` | `/api/v1/scans/summary` | Scan statistics | user+ |
| `GET` | `/api/v1/scans/{id}` | Get scan details | user+ |
| `POST` | `/api/v1/scans/{id}/cancel` | Cancel queued/running scan | analyst+ |
| `POST` | `/api/v1/scans/{id}/retry` | Retry failed scan | analyst+ |
| **Findings** | | | |
| `GET` | `/api/v1/findings` | List findings (paginated, filtered) | user+ |
| `GET` | `/api/v1/findings/summary/severity` | Severity breakdown | user+ |
| `GET` | `/api/v1/findings/summary/status` | Status breakdown | user+ |
| `GET` | `/api/v1/findings/export/csv` | Export as CSV | user+ |
| `GET` | `/api/v1/findings/export/sarif` | Export as SARIF | user+ |
| `GET` | `/api/v1/findings/{id}` | Get finding details | user+ |
| `PATCH` | `/api/v1/findings/{id}/suppress` | Suppress finding | analyst+ |
| `POST` | `/api/v1/findings/bulk/suppress` | Bulk suppress | analyst+ |
| **Scanners** | | | |
| `GET` | `/api/v1/scanners` | List registered scanners | user+ |
| `GET` | `/api/v1/scanners/categories` | Scanner category counts | user+ |
| `GET` | `/api/v1/scanners/configs` | List org scanner configs | user+ |
| `PUT` | `/api/v1/scanners/configs/{name}` | Upsert scanner config | admin+ |
| `DELETE` | `/api/v1/scanners/configs/{name}` | Delete scanner config | admin+ |
| **Schedules** | | | |
| `GET` | `/api/v1/schedules` | List schedules | user+ |
| `POST` | `/api/v1/schedules` | Create schedule | admin+ |
| `GET` | `/api/v1/schedules/{id}` | Get schedule | user+ |
| `PUT` | `/api/v1/schedules/{id}` | Update schedule | admin+ |
| `DELETE` | `/api/v1/schedules/{id}` | Delete schedule | admin+ |
| `POST` | `/api/v1/schedules/{id}/toggle` | Enable/disable schedule | admin+ |
| `POST` | `/api/v1/schedules/{id}/run-now` | Trigger immediate run | analyst+ |
| **Webhooks** | | | |
| `POST` | `/api/v1/webhooks/snyk` | Snyk callback | HMAC |
| `POST` | `/api/v1/webhooks/sonarcloud` | SonarCloud callback | — |
| `POST` | `/api/v1/webhooks/github` | GitHub GHAS callback | HMAC |

---

## 17. Validation Checklist

> Comprehensive checklist covering all 16 prior sections. Each item should
> be verified before considering the scanner subsystem production-ready.

### 17.1 Architecture & Plugin System (§1-§2)

- [ ] `BaseScanner` abstract class enforces `name`, `version`, `category`, `is_applicable()`, `build_command()`, `parse_output()`
- [ ] `ScannerRegistry` supports `register()`, `get()`, `get_applicable()`, `list_all()`
- [ ] Scanner categories cover: `SECRET`, `VULNERABILITY`, `SAST`, `IAC`, `SCA`, `CONTAINER`, `LICENSE`
- [ ] Execution modes cover: `SUBPROCESS`, `CONTAINER`, `REMOTE`
- [ ] `ScanResult` dataclass includes: scanner_name, version, vulnerabilities, duration, success, error_message, raw_output
- [ ] `Vulnerability` dataclass includes: rule_id, severity, message, file_path, line_number, details, CVE, CWE, package info
- [ ] Adding a new scanner requires only: subclass `BaseScanner` + call `ScannerRegistry.register()`

### 17.2 Execution Models (§3)

- [ ] `SubprocessRunner` uses `asyncio.create_subprocess_exec` with configurable timeout
- [ ] Process tree kill via `psutil` on timeout (not just parent PID)
- [ ] Stdout/stderr captured without deadlock (using `process.communicate()`)
- [ ] `ContainerRunner` uses Docker SDK with resource limits (memory, CPU)
- [ ] Container runs with `read_only=True`, `network_disabled=True` by default
- [ ] Container auto-removed after execution (`auto_remove=True`)
- [ ] `RemoteRunner` supports HTTP POST + polling pattern
- [ ] All runners return `RunnerResult(exit_code, stdout, stderr, duration, timed_out)`

### 17.3 SARIF & Output Normalization (§4)

- [ ] `parse_sarif()` handles SARIF v2.1.0 with multiple runs
- [ ] `export_sarif()` produces valid SARIF v2.1.0 JSON
- [ ] Scanner-specific parsers exist for: Semgrep (JSON), Gitleaks (JSON), Trivy (JSON), Grype (JSON), Bandit (JSON), Checkov (JSON)
- [ ] Severity normalization maps each scanner's levels to: critical, high, medium, low, info
- [ ] Parser errors are caught and logged without crashing the scan pipeline

### 17.4 Repository Management (§5)

- [ ] Shallow clone (`--depth 1`) by default
- [ ] Token-based auth injects token into clone URL
- [ ] Clone directory isolated per scan run (UUID-based path)
- [ ] Cleanup removes clone directory on success
- [ ] `KEEP_CLONES=true` preserves for debugging
- [ ] Git errors surface as clear error messages

### 17.5 Technology Detection (§6)

- [ ] Language detection from file extensions (15+ languages)
- [ ] Framework detection from dependency files (package.json, requirements.txt, go.mod, etc.)
- [ ] IaC detection (Terraform, CloudFormation, Kubernetes, Ansible, Docker)
- [ ] Package manager detection (npm, pip, go mod, maven, gradle, cargo, etc.)
- [ ] Detection runs before scanner selection to filter applicable scanners

### 17.6 Scanner Implementations (§7)

- [ ] At minimum: Semgrep, Gitleaks, Trivy FS, Bandit, Checkov, Grype, TruffleHog
- [ ] Each scanner's `is_applicable()` checks `detected_tech` correctly
- [ ] Each scanner's `build_command()` produces valid CLI invocation with JSON output
- [ ] Each scanner's `parse_output()` handles empty results, errors, and normal output
- [ ] Scanner-specific configuration loaded from environment or `ScannerConfig`

### 17.7 Scan Orchestration (§8)

- [ ] `ScanOrchestrator` implements full pipeline: clone → detect → select → execute → deduplicate → ingest
- [ ] Scan profiles work: `fast` (top 3 scanners), `balanced` (applicable), `deep` (all + remote)
- [ ] Parallel scanner execution respects `max_concurrent` limit via semaphore
- [ ] Scanner failures don't abort entire scan (other scanners continue)
- [ ] Finding deduplication uses SHA-256 fingerprint of scanner_name + rule_id + file_path + line + package
- [ ] `ScanJob` tracks: scan_id, repo_url, profile, org_id, scanner_overrides

### 17.8 Progress Monitoring (§9)

- [ ] CPU usage tracked via `psutil.Process.cpu_percent()`
- [ ] Output line counting provides throughput metric
- [ ] Scanner-specific keyword detection (e.g., "Scanning rule" for Semgrep)
- [ ] Idle detection triggers alert after configurable idle threshold
- [ ] Progress state accessible via API for frontend display
- [ ] Timeout enforcement separate from progress monitoring

### 17.9 Result Ingestion (§10)

- [ ] Fingerprint-based upsert: new findings get `OPEN`, existing findings get `last_seen_at` updated
- [ ] Auto-resolution: findings not seen in latest scan marked `RESOLVED`
- [ ] Severity counts updated on `ScanRun` model after ingestion
- [ ] Bulk insert for performance (batch size configurable)
- [ ] Transaction wraps full ingestion (atomic commit)
- [ ] `first_seen_at` preserved across re-detections

### 17.10 Scheduling (§11)

- [ ] APScheduler with `AsyncIOScheduler` and cron triggers
- [ ] Cron expression validation on schedule create/update
- [ ] Time window enforcement (only run during specified hours)
- [ ] Consecutive failure tracking with auto-disable threshold
- [ ] Schedule enable/disable toggle
- [ ] Manual "run now" trigger for existing schedules
- [ ] Schedule state persists in database (survives service restart)

### 17.11 Configuration (§12)

- [ ] Per-scanner configuration: timeout, memory, CPU, custom rules
- [ ] Per-organization overrides stored in `scanner_configs` table
- [ ] Environment variable fallbacks for all settings
- [ ] Scanner enable/disable flags (global + per-org)
- [ ] Ignore patterns for file/directory exclusion

### 17.12 Docker Container (§13)

- [ ] Multi-stage Dockerfile produces minimal image
- [ ] Multi-arch build (linux/amd64 + linux/arm64)
- [ ] Each Python tool in isolated venv (no dependency conflicts)
- [ ] Tool verification script validates all installed tools
- [ ] CI pipeline builds and verifies image on every change
- [ ] Non-root user for runtime security
- [ ] Health check configured
- [ ] Scanner worker entrypoint supports: worker, once, verify modes

### 17.13 Remote/SaaS Integration (§14)

- [ ] `RemoteScanner` base class with submit → poll → fetch → parse pattern
- [ ] Snyk integration with API key auth and project import
- [ ] SonarCloud integration with bearer token and task polling
- [ ] GitHub Advanced Security integration (code scanning + secrets + Dependabot)
- [ ] Webhook receiver with HMAC signature verification
- [ ] Remote scanners registered conditionally (only when API keys present)
- [ ] OAuth2 token refresh for services that require it

### 17.14 Database Models (§15)

- [ ] `ScanRun` model: status tracking, timing, scanner metadata, severity counts
- [ ] `Finding` model: fingerprint dedup, severity/status enums, location, CVE/CWE, AI fields
- [ ] `ScanSchedule` model: cron expression, execution windows, failure tracking
- [ ] `ScannerConfigDB` model: per-org scanner overrides with JSON custom_config
- [ ] All models use `OrgScopedMixin` for multi-tenant isolation
- [ ] All models use `TimestampMixin` for created_at/updated_at
- [ ] Alembic migration creates all tables with proper indexes and constraints
- [ ] Foreign keys: findings → scan_runs, scan_runs → scan_schedules

### 17.15 API Endpoints (§16)

- [ ] Scan CRUD: trigger, list, get, cancel, retry (5 endpoints)
- [ ] Scan summary statistics endpoint
- [ ] Findings: list with filters, get, suppress, bulk suppress (5+ endpoints)
- [ ] Finding severity and status summary endpoints
- [ ] CSV and SARIF export endpoints
- [ ] Scanner registry: list scanners, categories, configs, upsert config, delete config
- [ ] Schedule CRUD: list, create, get, update, delete, toggle, run-now (7 endpoints)
- [ ] Webhook receivers: Snyk, SonarCloud, GitHub (3 endpoints)
- [ ] All endpoints org-scoped with proper RBAC (user, analyst, admin)
- [ ] Pagination on list endpoints with `page` and `page_size`
- [ ] Proper HTTP status codes: 201 for creates, 204 for deletes, 404 for not found

### 17.16 Testing Requirements

- [ ] Unit tests for each `BaseScanner` subclass (mock subprocess, verify parse_output)
- [ ] Unit tests for SARIF import/export
- [ ] Unit tests for technology detection
- [ ] Unit tests for finding deduplication (fingerprint stability)
- [ ] Integration tests for `ScanOrchestrator` (mock scanners, verify pipeline)
- [ ] Integration tests for result ingestion (upsert, auto-resolve)
- [ ] API endpoint tests for all routes (FastAPI TestClient)
- [ ] Container build test in CI (verify all tools present)
- [ ] Load test: concurrent scan execution under backpressure
- [ ] End-to-end test: trigger scan → execute → ingest → query findings

### 17.17 Security & Operations

- [ ] No secrets in scanner output (redact tokens from clone URLs)
- [ ] Scanner containers run as non-root with no network access
- [ ] Clone directories cleaned up even on error (finally block)
- [ ] Rate limiting on scan trigger endpoint
- [ ] Webhook signature verification for all remote callbacks
- [ ] Graceful shutdown: drain active scans on SIGTERM
- [ ] Prometheus metrics: scans_triggered, scans_completed, scan_duration, findings_ingested
- [ ] Structured logging with scan_id correlation
- [ ] Dead letter queue for failed scan jobs
- [ ] Alert on consecutive schedule failures

---

*End of Scanner Tool Implementation Plan — {PROJECT_NAME}*
