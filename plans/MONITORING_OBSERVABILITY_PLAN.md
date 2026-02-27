# Phase 12: Monitoring & Observability Plan

> **Purpose:** Implement production-grade monitoring, observability, and alerting for a FastAPI application. This plan provides complete instrumentation for logs, metrics, traces, health checks, error tracking, and operational dashboards, enabling proactive incident response and SLA compliance.
>
> **Reference Implementation:** [AuditGH](../README.md) -- all logging patterns, health check endpoints, CloudWatch integration, and audit logging conventions are derived from AuditGH's production codebase.

---

## Placeholder Legend

| Placeholder | Description | Example (AuditGH) |
|---|---|---|
| `{PROJECT_NAME}` | Lowercase project identifier | `auditgh` |
| `{PROJECT_TITLE}` | Human-readable project title | `AuditGH Security Portal` |
| `{AWS_REGION}` | AWS region for CloudWatch | `us-east-1` |
| `{AWS_ACCOUNT_ID}` | AWS account ID | `123456789012` |
| `{LOG_GROUP}` | CloudWatch log group name | `/ecs/{PROJECT_NAME}/api` |
| `{LOG_GROUP_WORKER}` | Worker log group name | `/ecs/{PROJECT_NAME}/worker` |
| `{ALERT_EMAIL}` | Email for critical alerts | `platform-oncall@company.com` |
| `{ALERT_SLACK_WEBHOOK}` | Slack webhook URL | `https://hooks.slack.com/services/T00/B00/xxx` |
| `{SENTRY_DSN}` | Sentry Data Source Name | `https://xxx@o123.ingest.sentry.io/456` |
| `{SENTRY_ENVIRONMENT}` | Sentry environment tag | `production`, `staging`, `dev` |
| `{GRAFANA_URL}` | Grafana dashboard URL | `https://grafana.company.com` |
| `{PROMETHEUS_PORT}` | Prometheus metrics port | `9090` |
| `{CRIBL_INGEST_URL}` | Cribl Stream HTTP ingest endpoint | `https://cribl.company.com:10080/events` |
| `{CRIBL_AUTH_TOKEN}` | Cribl authentication token | `Bearer cribl_token_xxx` |
| `{MINIO_ENDPOINT}` | MinIO fallback endpoint | `http://minio:9000` |
| `{MINIO_BUCKET}` | Log storage bucket | `{PROJECT_NAME}-logs` |

---

## Section 1: Observability Architecture

### The Three Pillars

```
┌─────────────────────────────────────────────────────────────┐
│                    Observability Stack                       │
├──────────────┬──────────────┬──────────────┬───────────────┤
│    LOGS      │   METRICS    │   TRACES     │     ALERTS    │
├──────────────┼──────────────┼──────────────┼───────────────┤
│  • Loguru    │  Prometheus  │ OpenTelemetry│   CloudWatch  │
│  • Cribl     │  StatsD      │   Jaeger     │   PagerDuty   │
│  • CloudWatch│  Custom      │   X-Ray      │   Slack       │
│  • MinIO     │              │              │               │
└──────────────┴──────────────┴──────────────┴───────────────┘
        │              │              │              │
        └──────────────┴──────────────┴──────────────┘
                            │
                 ┌──────────┴──────────┐
                 │   Unified Dashboards │
                 │   • Grafana          │
                 │   • CloudWatch       │
                 │   • DataDog          │
                 └─────────────────────┘
```

### Data Flow

1. **Application** → Structured JSON logs → **Loguru** → **Cribl/CloudWatch**
2. **Application** → Metrics counters/gauges → **Prometheus** → **Grafana/CloudWatch**
3. **Application** → Distributed traces → **OpenTelemetry** → **Jaeger/X-Ray**
4. **CloudWatch** → Metric filters/alarms → **SNS** → **PagerDuty/Slack**

### File Structure

```
{PROJECT_NAME}/
├── src/
│   ├── api/
│   │   ├── middleware/
│   │   │   ├── logging.py           # Request lifecycle logging
│   │   │   ├── metrics.py           # Prometheus middleware
│   │   │   └── tracing.py           # OpenTelemetry middleware
│   │   └── utils/
│   │       ├── cribl_logger.py      # Cribl Stream integration
│   │       ├── instrumentation.py   # External call instrumentation
│   │       ├── redaction.py         # PII/secret redaction
│   │       └── metrics.py           # Custom metrics registry
│   ├── monitoring/
│   │   ├── health.py                # Health check endpoints
│   │   ├── metrics.py               # Application metrics
│   │   ├── tracing.py               # Trace context management
│   │   └── sentry.py                # Sentry error tracking
│   └── rbac/
│       └── audit.py                 # Security audit logging
├── infrastructure/
│   ├── cloudwatch/
│   │   ├── log_groups.tf            # CloudWatch log groups
│   │   ├── metric_filters.tf        # Log-based metrics
│   │   ├── alarms.tf                # CloudWatch alarms
│   │   └── dashboards.tf            # CloudWatch dashboards
│   └── grafana/
│       ├── api_health.json          # API health dashboard
│       ├── database.json            # Database metrics dashboard
│       └── business_metrics.json   # Business KPIs
└── tests/
    └── monitoring/
        ├── test_health.py           # Health check tests
        ├── test_metrics.py          # Metrics endpoint tests
        └── test_logging.py          # Log format tests
```

---

## Section 2: Structured Logging with Loguru

### Dependencies

```toml
# pyproject.toml
[project.dependencies]
loguru = "^0.7.2"
httpx = "^0.27.0"  # For Cribl HTTP transport
minio = "^7.2.0"   # For log fallback storage
```

### Logger Configuration

**File: `src/api/utils/cribl_logger.py`**

```python
"""
Cribl Logger - Structured logging with HTTP transport to Cribl Stream

Provides three-tier logging:
1. Cribl Stream (primary) - centralized log aggregation
2. MinIO (fallback) - when Cribl unavailable
3. stdout (always) - local development

Log Structure:
- timestamp, level, message, source
- app_context: org_id, user_id, request_id
- security_audit: action, resource, outcome
"""

import os
import sys
import json
import threading
import queue
from datetime import datetime
from typing import Optional, Dict, Any
from contextlib import contextmanager
import contextvars

from loguru import logger as loguru_logger
import httpx
from minio import Minio

from .redaction import redact_string, redact_dict


# Thread-local storage for request context
_request_context: contextvars.ContextVar[Dict[str, Any]] = contextvars.ContextVar(
    'request_context', default={}
)


class CriblLoggerConfig:
    """Configuration for Cribl logger, loaded from database or environment."""

    def __init__(self):
        self.enabled = os.environ.get("CRIBL_ENABLED", "false").lower() == "true"
        self.ingest_url = os.environ.get("CRIBL_INGEST_URL", "{CRIBL_INGEST_URL}")
        self.auth_token = os.environ.get("CRIBL_AUTH_TOKEN", "{CRIBL_AUTH_TOKEN}")
        self.verify_ssl = os.environ.get("CRIBL_VERIFY_SSL", "true").lower() == "true"
        self.log_levels = os.environ.get("CRIBL_LOG_LEVELS", "INFO,WARNING,ERROR,CRITICAL").split(",")
        self.include_app_context = True
        self.include_security_audit = True
        self.redact_sensitive_data = os.environ.get("CRIBL_REDACT_SENSITIVE", "true").lower() == "true"

        # MinIO fallback configuration
        self.minio_fallback = os.environ.get("MINIO_FALLBACK", "true").lower() == "true"
        self.minio_endpoint = os.environ.get("MINIO_ENDPOINT", "{MINIO_ENDPOINT}")
        self.minio_bucket = os.environ.get("MINIO_BUCKET", "{MINIO_BUCKET}")
        self.minio_access_key = os.environ.get("MINIO_ACCESS_KEY", "admin")
        self.minio_secret_key = os.environ.get("MINIO_SECRET_KEY", "password")

        self._last_refresh = None

    def load_from_db(self):
        """Load configuration from database settings table."""
        try:
            from ..database import SessionLocal
            from .. import models

            db = SessionLocal()
            try:
                config = db.query(models.CriblConfig).first()
                if config:
                    self.enabled = config.enabled or False
                    self.ingest_url = config.ingest_url or ""
                    self.auth_token = config.auth_token or ""
                    self.verify_ssl = config.verify_ssl if config.verify_ssl is not None else True
                    self.log_levels = config.log_levels or ["INFO", "WARNING", "ERROR", "CRITICAL"]
                self._last_refresh = datetime.utcnow()
            finally:
                db.close()
        except Exception as e:
            print(f"[CriblLogger] Failed to load config from DB: {e}")

    def should_refresh(self) -> bool:
        """Check if config should be refreshed (every 60 seconds)."""
        if self._last_refresh is None:
            return True
        return (datetime.utcnow() - self._last_refresh).total_seconds() > 60


class CriblLogSink:
    """
    Custom Loguru sink that forwards logs to Cribl Stream.

    Uses a background thread with a queue to avoid blocking main thread.
    Falls back to MinIO storage when Cribl is unavailable.
    """

    def __init__(self, config: CriblLoggerConfig):
        self.config = config
        self._queue: queue.Queue = queue.Queue(maxsize=10000)
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._minio_client: Optional[Any] = None

    def start(self):
        """Start the background log forwarding thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._process_queue, daemon=True)
        self._thread.start()

    def stop(self):
        """Stop the background thread and flush remaining logs."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

    def write(self, message):
        """Called by Loguru for each log message."""
        if not self.config.enabled:
            return

        record = message.record
        level_name = record["level"].name

        if level_name not in self.config.log_levels:
            return

        log_entry = self._format_log_entry(record)

        try:
            self._queue.put_nowait(log_entry)
        except queue.Full:
            # Drop log if queue is full (prevents memory exhaustion)
            pass

    def _format_log_entry(self, record) -> Dict[str, Any]:
        """Format a log record into standard JSON structure."""
        entry = {
            "timestamp": record["time"].isoformat(),
            "level": record["level"].name,
            "message": str(record["message"]),
            "source": "api",
            "service": "{PROJECT_NAME}",
            "environment": os.environ.get("ENVIRONMENT", "development"),
            "host": os.environ.get("HOSTNAME", "localhost"),
            "module": record["module"],
            "function": record["function"],
            "line": record["line"]
        }

        # Add request context (org_id, user_id, request_id)
        if self.config.include_app_context:
            ctx = _request_context.get()
            if ctx:
                entry["app_context"] = {
                    "org_id": ctx.get("org_id"),
                    "org_name": ctx.get("org_name"),
                    "user_id": ctx.get("user_id"),
                    "request_id": ctx.get("request_id"),
                    "session_id": ctx.get("session_id")
                }

        # Add security audit context (action, resource, outcome)
        if self.config.include_security_audit:
            extra = record.get("extra", {})
            if any(k in extra for k in ["action", "resource", "outcome"]):
                entry["security_audit"] = {
                    "action": extra.get("action"),
                    "resource": extra.get("resource"),
                    "resource_id": extra.get("resource_id"),
                    "outcome": extra.get("outcome"),
                    "ip_address": extra.get("ip_address"),
                    "user_agent": extra.get("user_agent")
                }

        # Add extra fields (excluding security audit fields)
        extra = record.get("extra", {})
        filtered_extra = {k: v for k, v in extra.items()
                         if k not in ["action", "resource", "resource_id", "outcome", "ip_address", "user_agent"]}
        if filtered_extra:
            entry["extra"] = filtered_extra

        # Apply PII/secret redaction
        if self.config.redact_sensitive_data:
            try:
                entry["message"] = redact_string(str(entry["message"]))
                if "app_context" in entry:
                    entry["app_context"] = redact_dict(entry["app_context"])
                if "security_audit" in entry:
                    entry["security_audit"] = redact_dict(entry["security_audit"])
                if "extra" in entry:
                    entry["extra"] = redact_dict(entry["extra"])
            except Exception as e:
                print(f"[CriblLogger] Redaction failed: {e}")

        return entry

    def _process_queue(self):
        """Background thread that processes log queue in batches."""
        batch = []
        batch_size = 100
        flush_interval = 5.0  # seconds
        last_flush = datetime.utcnow()

        while self._running or not self._queue.empty():
            try:
                entry = self._queue.get(timeout=1.0)
                batch.append(entry)

                should_flush = (
                    len(batch) >= batch_size or
                    (datetime.utcnow() - last_flush).total_seconds() >= flush_interval
                )

                if should_flush and batch:
                    self._send_batch(batch)
                    batch = []
                    last_flush = datetime.utcnow()

            except queue.Empty:
                if batch:
                    self._send_batch(batch)
                    batch = []
                    last_flush = datetime.utcnow()
            except Exception as e:
                print(f"[CriblLogger] Queue processing error: {e}")

        # Flush remaining logs on shutdown
        if batch:
            self._send_batch(batch)

    def _send_batch(self, batch: list):
        """Send batch to Cribl or MinIO fallback."""
        if not batch:
            return

        # Refresh config periodically
        if self.config.should_refresh():
            self.config.load_from_db()

        # Try Cribl first
        if self.config.ingest_url and self.config.enabled:
            success = self._send_to_cribl(batch)
            if success:
                return

        # Fallback to MinIO
        if self.config.minio_fallback:
            self._store_in_minio(batch)

    def _send_to_cribl(self, batch: list) -> bool:
        """Send log batch to Cribl Stream via HTTP."""
        try:
            headers = {"Content-Type": "application/x-ndjson"}
            if self.config.auth_token:
                headers["Authorization"] = self.config.auth_token

            # Format as newline-delimited JSON
            ndjson_payload = "\n".join(json.dumps(entry) for entry in batch)

            with httpx.Client(verify=self.config.verify_ssl, timeout=30.0) as client:
                response = client.post(
                    self.config.ingest_url,
                    content=ndjson_payload,
                    headers=headers
                )

            return response.status_code in [200, 201, 202, 204]

        except Exception as e:
            print(f"[CriblLogger] Failed to send to Cribl: {e}")
            return False

    def _store_in_minio(self, batch: list):
        """Store log batch in MinIO as fallback."""
        try:
            if not self._minio_client:
                endpoint = self.config.minio_endpoint.replace("http://", "").replace("https://", "")
                secure = self.config.minio_endpoint.startswith("https://")
                self._minio_client = Minio(
                    endpoint,
                    access_key=self.config.minio_access_key,
                    secret_key=self.config.minio_secret_key,
                    secure=secure
                )

                # Create bucket if not exists
                if not self._minio_client.bucket_exists(self.config.minio_bucket):
                    self._minio_client.make_bucket(self.config.minio_bucket)

            # Organize by date hierarchy: logs/YYYY/MM/DD/HH/
            timestamp = datetime.utcnow()
            object_name = f"logs/{timestamp.strftime('%Y/%m/%d/%H')}/{timestamp.strftime('%Y%m%d_%H%M%S_%f')}.ndjson"

            ndjson_content = "\n".join(json.dumps(entry) for entry in batch)

            from io import BytesIO
            data = BytesIO(ndjson_content.encode('utf-8'))
            data_length = len(ndjson_content.encode('utf-8'))

            self._minio_client.put_object(
                self.config.minio_bucket,
                object_name,
                data,
                data_length,
                content_type="application/x-ndjson"
            )

        except Exception as e:
            print(f"[CriblLogger] Failed to store in MinIO: {e}")


_cribl_config: Optional[CriblLoggerConfig] = None
_cribl_sink: Optional[CriblLogSink] = None


def setup_cribl_logger():
    """
    Set up Cribl logger with Loguru.

    Call during application startup (in main.py startup event).
    """
    global _cribl_config, _cribl_sink

    _cribl_config = CriblLoggerConfig()
    _cribl_config.load_from_db()

    _cribl_sink = CriblLogSink(_cribl_config)
    _cribl_sink.start()

    # Get minimum log level from environment (default: INFO)
    min_level = os.environ.get("LOG_LEVEL", "INFO").upper()

    # Add Cribl sink to Loguru
    loguru_logger.add(
        _cribl_sink.write,
        format="{message}",
        level=min_level,
        enqueue=False  # Already using queue in CriblLogSink
    )

    # Also add JSON stdout sink for ECS/CloudWatch
    loguru_logger.add(
        sys.stdout,
        format="{message}",
        level=min_level,
        serialize=True  # JSON output for CloudWatch
    )

    loguru_logger.info(f"Cribl logger initialized (enabled={_cribl_config.enabled}, level={min_level})")


def shutdown_cribl_logger():
    """Shutdown Cribl logger gracefully (flush remaining logs)."""
    global _cribl_sink
    if _cribl_sink:
        _cribl_sink.stop()


@contextmanager
def log_context(**kwargs):
    """
    Context manager to set request-scoped logging context.

    Usage:
        with log_context(org_id="uuid", user_id="uuid", request_id="uuid"):
            logger.info("This log will include the context")
    """
    token = _request_context.set(kwargs)
    try:
        yield
    finally:
        _request_context.reset(token)


def set_log_context(**kwargs):
    """Set logging context for current request."""
    current = _request_context.get()
    updated = {**current, **kwargs}
    _request_context.set(updated)


def clear_log_context():
    """Clear logging context (call after request completes)."""
    _request_context.set({})


logger = loguru_logger
```

### PII/Secret Redaction

**File: `src/api/utils/redaction.py`**

```python
"""
Data redaction utilities for PII and secret scrubbing in logs.

Redacts:
- API keys, tokens, passwords
- Email addresses, SSNs, credit cards
- IP addresses (optional)
- Custom patterns via regex
"""

import re
from typing import Any, Dict, List

# Patterns to redact (compiled for performance)
PATTERNS = [
    # API keys and tokens
    (re.compile(r'(agh_[a-zA-Z0-9_-]{20,})'), '[REDACTED_API_KEY]'),
    (re.compile(r'(Bearer\s+[A-Za-z0-9\-._~+/]+=*)'), 'Bearer [REDACTED_TOKEN]'),
    (re.compile(r'(ghp_[a-zA-Z0-9]{36})'), '[REDACTED_GITHUB_TOKEN]'),
    (re.compile(r'(gho_[a-zA-Z0-9]{36})'), '[REDACTED_GITHUB_OAUTH]'),

    # AWS credentials
    (re.compile(r'(AKIA[0-9A-Z]{16})'), '[REDACTED_AWS_KEY]'),
    (re.compile(r'(aws_secret_access_key\s*=\s*)([^\s]+)'), r'\1[REDACTED]'),

    # Passwords
    (re.compile(r'(password["\s:=]+)([^\s",}]+)', re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r'(passwd["\s:=]+)([^\s",}]+)', re.IGNORECASE), r'\1[REDACTED]'),

    # Email addresses
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'), '[REDACTED_EMAIL]'),

    # Credit cards
    (re.compile(r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b'), '[REDACTED_CC]'),

    # SSN
    (re.compile(r'\b\d{3}-\d{2}-\d{4}\b'), '[REDACTED_SSN]'),

    # Private IPs (optional - enable if needed)
    # (re.compile(r'\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b'), '[REDACTED_IP]'),
    # (re.compile(r'\b172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}\b'), '[REDACTED_IP]'),
    # (re.compile(r'\b192\.168\.\d{1,3}\.\d{1,3}\b'), '[REDACTED_IP]'),
]


def redact_string(text: str) -> str:
    """
    Redact sensitive data from a string.

    Args:
        text: Input string (log message, JSON, etc.)

    Returns:
        Redacted string with sensitive patterns replaced
    """
    if not isinstance(text, str):
        return text

    for pattern, replacement in PATTERNS:
        text = pattern.sub(replacement, text)

    return text


def redact_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recursively redact sensitive data from a dictionary.

    Args:
        data: Dictionary potentially containing sensitive data

    Returns:
        New dictionary with sensitive values redacted
    """
    if not isinstance(data, dict):
        return data

    redacted = {}
    for key, value in data.items():
        # Redact specific keys
        if key.lower() in ['password', 'passwd', 'secret', 'token', 'api_key', 'authorization']:
            redacted[key] = '[REDACTED]'
        elif isinstance(value, str):
            redacted[key] = redact_string(value)
        elif isinstance(value, dict):
            redacted[key] = redact_dict(value)
        elif isinstance(value, list):
            redacted[key] = [redact_dict(v) if isinstance(v, dict) else redact_string(v) if isinstance(v, str) else v for v in value]
        else:
            redacted[key] = value

    return redacted
```

---

## Section 3: Request/Response Middleware

**File: `src/api/middleware/logging.py`**

```python
"""
Request Logging Middleware for lifecycle event tracking.

Logs:
- REQUEST_START: method, path, client IP, user agent, request_id
- REQUEST_END: status code, duration_ms, bytes_sent, performance category
- REQUEST_ERROR: unhandled exceptions with traceback
- SLOW_REQUEST: warning for requests exceeding thresholds

Features:
- UUID request_id for correlation
- X-Request-ID response header
- Client IP from X-Forwarded-For
- Automatic context propagation
"""

import time
import uuid
import traceback
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from loguru import logger

from src.api.utils.cribl_logger import set_log_context, clear_log_context


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log request lifecycle with correlation IDs.

    Generates unique request_id and logs:
    - REQUEST_START: Initial request details
    - REQUEST_END: Response status and duration
    - REQUEST_ERROR: Unhandled exceptions with traceback
    """

    async def dispatch(self, request: Request, call_next):
        # Generate correlation ID
        request_id = str(uuid.uuid4())

        # Extract client IP (X-Forwarded-For or request.client)
        client_ip = self._get_client_ip(request)
        user_agent = request.headers.get("User-Agent", "unknown")

        # Log REQUEST_START
        start_time = time.time()
        logger.bind(
            event_type="REQUEST_START",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            client_ip=client_ip,
            user_agent=user_agent
        ).info(f"REQUEST_START: {request.method} {request.url.path}")

        # Set log context for downstream logs
        context = {"request_id": request_id}

        # Extract org context (set by OrganizationContextMiddleware)
        if hasattr(request.state, "org_id"):
            context["org_id"] = request.state.org_id
        if hasattr(request.state, "org_name"):
            context["org_name"] = request.state.org_name

        # Extract user context (set by auth middleware)
        if hasattr(request.state, "user"):
            user = request.state.user
            if hasattr(user, "sub"):
                context["user_id"] = user.sub
            elif isinstance(user, dict) and "sub" in user:
                context["user_id"] = user["sub"]

        # Extract session ID from cookies
        session_id = request.cookies.get("session")
        if session_id:
            context["session_id"] = session_id

        set_log_context(**context)

        try:
            # Process request
            response = await call_next(request)

            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000

            # Extract response size
            content_length = response.headers.get("content-length", "unknown")

            # Categorize performance
            if duration_ms < 100:
                perf_category = "FAST"
            elif duration_ms < 500:
                perf_category = "NORMAL"
            elif duration_ms < 2000:
                perf_category = "SLOW"
            else:
                perf_category = "CRITICAL"

            # Log REQUEST_END
            logger.bind(
                event_type="REQUEST_END",
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=round(duration_ms, 2),
                perf_category=perf_category,
                bytes_sent=content_length
            ).info(f"REQUEST_END: {request.method} {request.url.path} - {response.status_code} ({round(duration_ms, 2)}ms, {perf_category})")

            # Warn on slow requests
            if perf_category in ["SLOW", "CRITICAL"]:
                logger.bind(
                    event_type="SLOW_REQUEST",
                    request_id=request_id,
                    duration_ms=round(duration_ms, 2)
                ).warning(f"SLOW_REQUEST: {request.method} {request.url.path} took {round(duration_ms, 2)}ms")

            # Inject X-Request-ID header
            response.headers["X-Request-ID"] = request_id

            return response

        except Exception as e:
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000
            tb = traceback.format_exc()

            # Log REQUEST_ERROR
            logger.bind(
                event_type="REQUEST_ERROR",
                request_id=request_id,
                error_type=type(e).__name__,
                error_message=str(e),
                traceback=tb,
                duration_ms=round(duration_ms, 2)
            ).error(f"REQUEST_ERROR: {request.method} {request.url.path} - {type(e).__name__}: {str(e)}")

            # Re-raise to let FastAPI handle error response
            raise

        finally:
            # Clear log context after request
            clear_log_context()

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from X-Forwarded-For or request.client."""
        x_forwarded_for = request.headers.get("X-Forwarded-For")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        if request.client:
            return request.client.host
        return "unknown"
```

---

## Section 4: Application Metrics (Prometheus)

### Dependencies

```toml
# pyproject.toml
[project.dependencies]
prometheus-client = "^0.20.0"
prometheus-fastapi-instrumentator = "^7.0.0"
```

### Prometheus Middleware

**File: `src/api/middleware/metrics.py`**

```python
"""
Prometheus metrics middleware for FastAPI.

Metrics:
- http_requests_total: Total requests by method, path, status
- http_request_duration_seconds: Request latency histogram
- http_requests_in_progress: Active requests gauge
- http_request_size_bytes: Request payload size
- http_response_size_bytes: Response payload size
"""

from prometheus_client import Counter, Histogram, Gauge, Summary
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
import time

# Define metrics
REQUEST_COUNT = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status_code']
)

REQUEST_DURATION = Histogram(
    'http_request_duration_seconds',
    'HTTP request latency',
    ['method', 'endpoint'],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

REQUESTS_IN_PROGRESS = Gauge(
    'http_requests_in_progress',
    'HTTP requests currently being processed',
    ['method', 'endpoint']
)

REQUEST_SIZE = Summary(
    'http_request_size_bytes',
    'HTTP request payload size',
    ['method', 'endpoint']
)

RESPONSE_SIZE = Summary(
    'http_response_size_bytes',
    'HTTP response payload size',
    ['method', 'endpoint']
)


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Middleware to collect Prometheus metrics for HTTP requests."""

    async def dispatch(self, request: Request, call_next):
        # Normalize endpoint (remove UUID/ID path segments)
        endpoint = self._normalize_endpoint(request.url.path)
        method = request.method

        # Track request size
        request_size = int(request.headers.get("content-length", 0))
        REQUEST_SIZE.labels(method=method, endpoint=endpoint).observe(request_size)

        # Track in-progress requests
        REQUESTS_IN_PROGRESS.labels(method=method, endpoint=endpoint).inc()

        start_time = time.time()
        try:
            response = await call_next(request)

            # Track response metrics
            duration = time.time() - start_time
            status_code = response.status_code

            REQUEST_COUNT.labels(method=method, endpoint=endpoint, status_code=status_code).inc()
            REQUEST_DURATION.labels(method=method, endpoint=endpoint).observe(duration)

            response_size = int(response.headers.get("content-length", 0))
            RESPONSE_SIZE.labels(method=method, endpoint=endpoint).observe(response_size)

            return response

        finally:
            REQUESTS_IN_PROGRESS.labels(method=method, endpoint=endpoint).dec()

    def _normalize_endpoint(self, path: str) -> str:
        """
        Normalize endpoint path by removing UUIDs and IDs.

        Examples:
            /api/findings/123e4567-e89b-12d3-a456-426614174000 -> /api/findings/{id}
            /api/repos/42/scans -> /api/repos/{id}/scans
        """
        import re
        # Replace UUIDs
        path = re.sub(r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/{id}', path, flags=re.IGNORECASE)
        # Replace numeric IDs
        path = re.sub(r'/\d+', '/{id}', path)
        return path
```

### Custom Application Metrics

**File: `src/monitoring/metrics.py`**

```python
"""
Custom application metrics for business and operational KPIs.

Metrics:
- app_user_logins_total: Total successful logins
- app_api_key_requests_total: Total API key authentications
- app_scan_executions_total: Total security scans
- app_findings_created_total: Total findings created
- app_database_query_duration_seconds: Database query latency
- app_external_api_calls_total: External API calls (GitHub, etc.)
"""

from prometheus_client import Counter, Histogram, Gauge

# Authentication metrics
USER_LOGINS = Counter(
    'app_user_logins_total',
    'Total successful user logins',
    ['method']  # oauth, break_glass, api_key
)

API_KEY_REQUESTS = Counter(
    'app_api_key_requests_total',
    'Total API key authentication requests',
    ['status']  # success, invalid, expired
)

# Business metrics
SCAN_EXECUTIONS = Counter(
    'app_scan_executions_total',
    'Total security scan executions',
    ['tool', 'status']  # tool: gitleaks, semgrep; status: success, failure
)

FINDINGS_CREATED = Counter(
    'app_findings_created_total',
    'Total security findings created',
    ['severity', 'tool']
)

FINDINGS_REMEDIATED = Counter(
    'app_findings_remediated_total',
    'Total findings marked as remediated',
    ['severity']
)

# Database metrics
DB_QUERY_DURATION = Histogram(
    'app_database_query_duration_seconds',
    'Database query execution time',
    ['operation'],  # select, insert, update, delete
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0]
)

DB_CONNECTIONS = Gauge(
    'app_database_connections_active',
    'Active database connections'
)

# External API metrics
EXTERNAL_API_CALLS = Counter(
    'app_external_api_calls_total',
    'Total external API calls',
    ['service', 'endpoint', 'status']  # service: github, jira
)

EXTERNAL_API_DURATION = Histogram(
    'app_external_api_duration_seconds',
    'External API call duration',
    ['service', 'endpoint'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0]
)

# Cache metrics
CACHE_HITS = Counter(
    'app_cache_hits_total',
    'Total cache hits',
    ['cache_type']  # redis, local
)

CACHE_MISSES = Counter(
    'app_cache_misses_total',
    'Total cache misses',
    ['cache_type']
)
```

### Metrics Endpoint

**File: `src/api/main.py` (add to main.py)**

```python
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response

@app.get("/metrics", summary="Prometheus metrics", tags=["monitoring"], include_in_schema=False)
async def prometheus_metrics():
    """Expose Prometheus metrics for scraping."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
```

---

## Section 5: Database Metrics

**File: `src/monitoring/database.py`**

```python
"""
Database connection pool and query performance monitoring.

Tracks:
- Connection pool size and utilization
- Query execution time by operation type
- Slow query detection
- Connection leaks
"""

import time
from contextlib import contextmanager
from functools import wraps
from loguru import logger
from src.monitoring.metrics import DB_QUERY_DURATION, DB_CONNECTIONS


@contextmanager
def track_query(operation: str):
    """
    Context manager to track database query performance.

    Usage:
        with track_query("select"):
            result = db.query(Model).all()
    """
    start_time = time.time()
    try:
        yield
    finally:
        duration = time.time() - start_time
        DB_QUERY_DURATION.labels(operation=operation).observe(duration)

        # Log slow queries (>1s)
        if duration > 1.0:
            logger.bind(
                event_type="SLOW_QUERY",
                operation=operation,
                duration_ms=round(duration * 1000, 2)
            ).warning(f"SLOW_QUERY: {operation} took {round(duration * 1000, 2)}ms")


def update_connection_pool_metrics(engine):
    """
    Update connection pool metrics from SQLAlchemy engine.

    Call periodically (every 60s) to track pool utilization.
    """
    pool = engine.pool
    DB_CONNECTIONS.set(pool.checkedout())


# SQLAlchemy event listeners for automatic query tracking
def setup_database_instrumentation(engine):
    """
    Set up SQLAlchemy event listeners for query instrumentation.

    Call during application startup after engine creation.
    """
    from sqlalchemy import event

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        context._query_start_time = time.time()

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        duration = time.time() - context._query_start_time

        # Determine operation type from SQL statement
        operation = "unknown"
        sql_lower = statement.lower().strip()
        if sql_lower.startswith("select"):
            operation = "select"
        elif sql_lower.startswith("insert"):
            operation = "insert"
        elif sql_lower.startswith("update"):
            operation = "update"
        elif sql_lower.startswith("delete"):
            operation = "delete"

        DB_QUERY_DURATION.labels(operation=operation).observe(duration)

        # Log slow queries
        if duration > 1.0:
            logger.bind(
                event_type="SLOW_QUERY",
                operation=operation,
                duration_ms=round(duration * 1000, 2),
                sql=statement[:200]  # First 200 chars
            ).warning(f"SLOW_QUERY: {operation} took {round(duration * 1000, 2)}ms")
```

---

## Section 6: Redis Metrics

**File: `src/monitoring/redis.py`**

```python
"""
Redis cache performance monitoring.

Tracks:
- Cache hit/miss ratios
- Connection pool stats
- Memory usage
- Command execution time
"""

import time
from functools import wraps
from loguru import logger
from src.monitoring.metrics import CACHE_HITS, CACHE_MISSES

def track_cache_operation(cache_type: str = "redis"):
    """
    Decorator to track cache hit/miss rates.

    Usage:
        @track_cache_operation("redis")
        def get_from_cache(key):
            value = redis_client.get(key)
            if value is None:
                raise KeyError("cache miss")
            return value
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                result = func(*args, **kwargs)
                CACHE_HITS.labels(cache_type=cache_type).inc()
                return result
            except (KeyError, ValueError):
                CACHE_MISSES.labels(cache_type=cache_type).inc()
                raise
        return wrapper
    return decorator


def get_redis_info(redis_client) -> dict:
    """
    Collect Redis server stats for monitoring dashboard.

    Returns dict with:
    - connected_clients: Active connections
    - used_memory: Memory usage in bytes
    - used_memory_human: Human-readable memory
    - total_commands_processed: Total commands executed
    - instantaneous_ops_per_sec: Current ops/sec
    """
    try:
        info = redis_client.info()
        return {
            "connected_clients": info.get("connected_clients", 0),
            "used_memory": info.get("used_memory", 0),
            "used_memory_human": info.get("used_memory_human", "0B"),
            "total_commands_processed": info.get("total_commands_processed", 0),
            "instantaneous_ops_per_sec": info.get("instantaneous_ops_per_sec", 0),
            "keyspace_hits": info.get("keyspace_hits", 0),
            "keyspace_misses": info.get("keyspace_misses", 0),
        }
    except Exception as e:
        logger.error(f"Failed to collect Redis info: {e}")
        return {}
```

---

## Section 7: Health Check Endpoints

**File: `src/monitoring/health.py`**

```python
"""
Health check endpoints for Kubernetes liveness/readiness probes.

Endpoints:
- GET /health: Shallow health check (always returns 200)
- GET /health/ready: Readiness check (DB, Redis, external deps)
- GET /health/live: Liveness check (application still responsive)
"""

from datetime import datetime
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text
from loguru import logger

router = APIRouter(prefix="/health", tags=["monitoring"])


@router.get(
    "",
    summary="Basic health check",
    response_model=None,
    responses={
        200: {"description": "Service is healthy"},
    },
)
async def health_check():
    """
    Basic health check endpoint (always returns 200 if service is running).

    Use for basic uptime monitoring. Does not check dependencies.
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "service": "{PROJECT_NAME}",
        "version": "1.0.0"
    }


@router.get(
    "/ready",
    summary="Readiness probe",
    response_model=None,
    responses={
        200: {"description": "Service is ready to accept traffic"},
        503: {"description": "Service is not ready (dependencies unhealthy)"},
    },
)
async def readiness_check():
    """
    Readiness probe for Kubernetes/ECS.

    Checks all critical dependencies:
    - Database connection
    - Redis connection
    - (Optional) External API reachability

    Returns 503 if any dependency is unhealthy.
    """
    from ..database import SessionLocal
    from ..auth.tokens import redis_client

    health_status = {
        "status": "ready",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "checks": {},
        "service": "{PROJECT_NAME}"
    }

    all_healthy = True

    # Check database
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        health_status["checks"]["database"] = "healthy"
    except Exception as e:
        health_status["checks"]["database"] = f"unhealthy: {str(e)}"
        all_healthy = False

    # Check Redis
    try:
        redis_client.ping()
        health_status["checks"]["redis"] = "healthy"
    except Exception as e:
        health_status["checks"]["redis"] = f"unhealthy: {str(e)}"
        all_healthy = False

    # Check external APIs (optional - remove if not needed)
    # try:
    #     import httpx
    #     response = httpx.get("https://api.github.com", timeout=5.0)
    #     if response.status_code == 200:
    #         health_status["checks"]["github_api"] = "healthy"
    #     else:
    #         health_status["checks"]["github_api"] = f"unhealthy: HTTP {response.status_code}"
    #         all_healthy = False
    # except Exception as e:
    #     health_status["checks"]["github_api"] = f"unhealthy: {str(e)}"
    #     all_healthy = False

    if not all_healthy:
        health_status["status"] = "not_ready"
        logger.bind(event_type="HEALTH_CHECK_FAILED", checks=health_status["checks"]).warning("Readiness check failed")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=health_status)

    logger.bind(event_type="HEALTH_CHECK_SUCCESS").debug("Readiness check passed")
    return health_status


@router.get(
    "/live",
    summary="Liveness probe",
    response_model=None,
    responses={
        200: {"description": "Service is alive"},
        503: {"description": "Service is unresponsive (should be restarted)"},
    },
)
async def liveness_check():
    """
    Liveness probe for Kubernetes/ECS.

    Checks if application is still responsive and not deadlocked.
    Should be lightweight (no external dependencies).

    Returns 503 if application is in unrecoverable state.
    """
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "service": "{PROJECT_NAME}"
    }
```

### Add to main.py

```python
# In src/api/main.py
from src.monitoring.health import router as health_router
app.include_router(health_router)
```

---

## Section 8: Distributed Tracing (OpenTelemetry)

### Dependencies

```toml
# pyproject.toml
[project.dependencies]
opentelemetry-api = "^1.22.0"
opentelemetry-sdk = "^1.22.0"
opentelemetry-instrumentation-fastapi = "^0.43b0"
opentelemetry-instrumentation-sqlalchemy = "^0.43b0"
opentelemetry-instrumentation-redis = "^0.43b0"
opentelemetry-instrumentation-httpx = "^0.43b0"
opentelemetry-exporter-jaeger = "^1.22.0"
opentelemetry-exporter-otlp = "^1.22.0"  # For AWS X-Ray
```

### OpenTelemetry Setup

**File: `src/monitoring/tracing.py`**

```python
"""
OpenTelemetry distributed tracing setup for FastAPI.

Exporters:
- Jaeger (local development)
- AWS X-Ray (production)
- Console (debugging)

Automatically instruments:
- FastAPI requests
- SQLAlchemy queries
- Redis operations
- HTTPX external calls
"""

import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter


def setup_tracing(app, db_engine):
    """
    Set up OpenTelemetry tracing for FastAPI application.

    Args:
        app: FastAPI application instance
        db_engine: SQLAlchemy engine for database instrumentation

    Environment Variables:
        OTEL_ENABLED: Enable tracing (default: false)
        OTEL_SERVICE_NAME: Service name for traces
        OTEL_EXPORTER: Exporter type (jaeger, otlp, console)
        JAEGER_AGENT_HOST: Jaeger agent hostname
        JAEGER_AGENT_PORT: Jaeger agent port
        OTEL_EXPORTER_OTLP_ENDPOINT: OTLP endpoint (for AWS X-Ray)
    """
    if os.environ.get("OTEL_ENABLED", "false").lower() != "true":
        print("[Tracing] OpenTelemetry disabled")
        return

    service_name = os.environ.get("OTEL_SERVICE_NAME", "{PROJECT_NAME}")
    environment = os.environ.get("ENVIRONMENT", "development")

    # Create resource with service metadata
    resource = Resource.create({
        "service.name": service_name,
        "service.version": "1.0.0",
        "deployment.environment": environment,
    })

    # Create tracer provider
    provider = TracerProvider(resource=resource)

    # Configure exporter based on environment
    exporter_type = os.environ.get("OTEL_EXPORTER", "jaeger")

    if exporter_type == "jaeger":
        exporter = JaegerExporter(
            agent_host_name=os.environ.get("JAEGER_AGENT_HOST", "localhost"),
            agent_port=int(os.environ.get("JAEGER_AGENT_PORT", "6831")),
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
        print(f"[Tracing] Jaeger exporter configured ({os.environ.get('JAEGER_AGENT_HOST', 'localhost')}:{os.environ.get('JAEGER_AGENT_PORT', '6831')})")

    elif exporter_type == "otlp":
        # For AWS X-Ray or generic OTLP collector
        exporter = OTLPSpanExporter(
            endpoint=os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "localhost:4317"),
            insecure=os.environ.get("OTEL_EXPORTER_OTLP_INSECURE", "true").lower() == "true",
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
        print(f"[Tracing] OTLP exporter configured ({os.environ.get('OTEL_EXPORTER_OTLP_ENDPOINT', 'localhost:4317')})")

    elif exporter_type == "console":
        # Debug mode - print traces to console
        exporter = ConsoleSpanExporter()
        provider.add_span_processor(BatchSpanProcessor(exporter))
        print("[Tracing] Console exporter configured (debug mode)")

    # Set as global tracer provider
    trace.set_tracer_provider(provider)

    # Auto-instrument FastAPI
    FastAPIInstrumentor.instrument_app(app)

    # Auto-instrument SQLAlchemy
    SQLAlchemyInstrumentor().instrument(engine=db_engine)

    # Auto-instrument Redis
    RedisInstrumentor().instrument()

    # Auto-instrument HTTPX (for external API calls)
    HTTPXClientInstrumentor().instrument()

    print(f"[Tracing] OpenTelemetry initialized (service={service_name}, exporter={exporter_type})")


def get_tracer(name: str):
    """
    Get a tracer for manual span creation.

    Usage:
        tracer = get_tracer(__name__)
        with tracer.start_as_current_span("operation_name"):
            # ... operation code ...
    """
    return trace.get_tracer(name)
```

### Manual Span Creation

```python
# Example: Adding custom spans in application code
from src.monitoring.tracing import get_tracer

tracer = get_tracer(__name__)

async def process_security_scan(repo_id: str):
    with tracer.start_as_current_span("process_security_scan") as span:
        span.set_attribute("repo_id", repo_id)
        span.set_attribute("scan_type", "gitleaks")

        # ... scan logic ...

        span.set_attribute("findings_count", 42)
        span.add_event("scan_completed", {"status": "success"})
```

---

## Section 9: Error Tracking (Sentry)

### Dependencies

```toml
# pyproject.toml
[project.dependencies]
sentry-sdk = {extras = ["fastapi"], version = "^1.40.0"}
```

### Sentry Setup

**File: `src/monitoring/sentry.py`**

```python
"""
Sentry error tracking and performance monitoring.

Features:
- Automatic exception capture
- Performance transaction tracking
- User context enrichment
- Breadcrumb trails
- Release tracking
"""

import os
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.redis import RedisIntegration
from sentry_sdk.integrations.httpx import HttpxIntegration


def setup_sentry():
    """
    Initialize Sentry error tracking.

    Environment Variables:
        SENTRY_DSN: Sentry Data Source Name
        SENTRY_ENVIRONMENT: Environment tag (production, staging, dev)
        SENTRY_TRACES_SAMPLE_RATE: Performance sampling rate (0.0-1.0)
        SENTRY_PROFILES_SAMPLE_RATE: Profiling sampling rate (0.0-1.0)
    """
    dsn = os.environ.get("SENTRY_DSN", "{SENTRY_DSN}")
    environment = os.environ.get("SENTRY_ENVIRONMENT", "{SENTRY_ENVIRONMENT}")

    if not dsn or dsn == "{SENTRY_DSN}":
        print("[Sentry] Disabled (no DSN configured)")
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,

        # Integrations
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
            RedisIntegration(),
            HttpxIntegration(),
        ],

        # Performance monitoring
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),

        # Profiling (CPU/memory usage)
        profiles_sample_rate=float(os.environ.get("SENTRY_PROFILES_SAMPLE_RATE", "0.1")),

        # Release tracking
        release=os.environ.get("APP_VERSION", "1.0.0"),

        # Error filtering
        before_send=before_send_filter,

        # PII scrubbing
        send_default_pii=False,
    )

    print(f"[Sentry] Initialized (env={environment}, traces_sample_rate={os.environ.get('SENTRY_TRACES_SAMPLE_RATE', '0.1')})")


def before_send_filter(event, hint):
    """
    Filter events before sending to Sentry.

    - Ignore 404 errors
    - Ignore health check errors
    - Scrub sensitive data
    """
    # Ignore 404 Not Found
    if event.get("exception"):
        for exception in event["exception"].get("values", []):
            if exception.get("type") == "HTTPException" and "404" in str(exception.get("value", "")):
                return None

    # Ignore health check errors
    request = event.get("request", {})
    if "/health" in request.get("url", ""):
        return None

    return event


def set_user_context(user_id: str, email: str = None, org_id: str = None):
    """
    Set user context for Sentry events.

    Call after authentication to enrich error reports with user info.
    """
    sentry_sdk.set_user({
        "id": user_id,
        "email": email,
        "org_id": org_id
    })


def add_breadcrumb(category: str, message: str, level: str = "info", data: dict = None):
    """
    Add breadcrumb for debugging context.

    Breadcrumbs appear in Sentry error reports to show events leading up to error.

    Args:
        category: Breadcrumb category (e.g., "auth", "database", "api")
        message: Human-readable message
        level: Severity (debug, info, warning, error)
        data: Additional context dict
    """
    sentry_sdk.add_breadcrumb(
        category=category,
        message=message,
        level=level,
        data=data or {}
    )


def capture_exception(exception: Exception, context: dict = None):
    """
    Manually capture exception with additional context.

    Use for caught exceptions that should still be tracked.
    """
    if context:
        sentry_sdk.set_context("custom", context)
    sentry_sdk.capture_exception(exception)
```

### Add to main.py

```python
# In src/api/main.py startup event
from src.monitoring.sentry import setup_sentry

@app.on_event("startup")
async def startup_event():
    # ... existing startup code ...
    setup_sentry()
```

---

## Section 10: CloudWatch Integration

### Log Groups Configuration

**File: `infrastructure/cloudwatch/log_groups.tf`**

```hcl
# CloudWatch Log Groups for ECS services

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/{PROJECT_NAME}/api"
  retention_in_days = 30  # Adjust based on compliance requirements

  tags = {
    Name        = "{PROJECT_NAME}-api-logs"
    Environment = var.environment
    Service     = "api"
  }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/{PROJECT_NAME}/worker"
  retention_in_days = 30

  tags = {
    Name        = "{PROJECT_NAME}-worker-logs"
    Environment = var.environment
    Service     = "worker"
  }
}

resource "aws_cloudwatch_log_group" "nginx" {
  name              = "/ecs/{PROJECT_NAME}/nginx"
  retention_in_days = 7  # Shorter retention for access logs

  tags = {
    Name        = "{PROJECT_NAME}-nginx-logs"
    Environment = var.environment
    Service     = "nginx"
  }
}

# Subscription filter to forward logs to external SIEM (optional)
resource "aws_cloudwatch_log_subscription_filter" "api_to_siem" {
  count           = var.enable_log_forwarding ? 1 : 0
  name            = "{PROJECT_NAME}-api-to-siem"
  log_group_name  = aws_cloudwatch_log_group.api.name
  filter_pattern  = ""  # Forward all logs
  destination_arn = var.log_destination_arn
}
```

### Metric Filters

**File: `infrastructure/cloudwatch/metric_filters.tf`**

```hcl
# Metric filters to extract metrics from structured logs

# 5xx Error Rate
resource "aws_cloudwatch_log_metric_filter" "api_5xx_errors" {
  name           = "{PROJECT_NAME}-api-5xx-errors"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "[time, request_id, level, msg, status_code=5*]"

  metric_transformation {
    name      = "API5xxErrors"
    namespace = "{PROJECT_NAME}/API"
    value     = "1"
    unit      = "Count"
    dimensions = {
      Environment = var.environment
    }
  }
}

# 4xx Error Rate
resource "aws_cloudwatch_log_metric_filter" "api_4xx_errors" {
  name           = "{PROJECT_NAME}-api-4xx-errors"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "[time, request_id, level, msg, status_code=4*]"

  metric_transformation {
    name      = "API4xxErrors"
    namespace = "{PROJECT_NAME}/API"
    value     = "1"
    unit      = "Count"
    dimensions = {
      Environment = var.environment
    }
  }
}

# Slow Request Rate (>2s)
resource "aws_cloudwatch_log_metric_filter" "slow_requests" {
  name           = "{PROJECT_NAME}-slow-requests"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "{ $.event_type = \"SLOW_REQUEST\" }"

  metric_transformation {
    name      = "SlowRequests"
    namespace = "{PROJECT_NAME}/API"
    value     = "1"
    unit      = "Count"
    dimensions = {
      Environment = var.environment
    }
  }
}

# Authorization Failures (potential security incident)
resource "aws_cloudwatch_log_metric_filter" "auth_failures" {
  name           = "{PROJECT_NAME}-auth-failures"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "{ $.event_type = \"authorization.denied\" }"

  metric_transformation {
    name      = "AuthorizationFailures"
    namespace = "{PROJECT_NAME}/Security"
    value     = "1"
    unit      = "Count"
    dimensions = {
      Environment = var.environment
    }
  }
}

# Database Slow Queries
resource "aws_cloudwatch_log_metric_filter" "slow_queries" {
  name           = "{PROJECT_NAME}-slow-queries"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "{ $.event_type = \"SLOW_QUERY\" }"

  metric_transformation {
    name      = "SlowDatabaseQueries"
    namespace = "{PROJECT_NAME}/Database"
    value     = "1"
    unit      = "Count"
    dimensions = {
      Environment = var.environment
    }
  }
}

# External API Failures
resource "aws_cloudwatch_log_metric_filter" "external_api_failures" {
  name           = "{PROJECT_NAME}-external-api-failures"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "{ $.event_type = \"EXTERNAL_CALL_ERROR\" }"

  metric_transformation {
    name      = "ExternalAPIFailures"
    namespace = "{PROJECT_NAME}/External"
    value     = "1"
    unit      = "Count"
    dimensions = {
      Environment = var.environment
    }
  }
}
```

### CloudWatch Insights Queries

**File: `infrastructure/cloudwatch/insights_queries.md`**

```markdown
# Useful CloudWatch Insights Queries

## Top 10 Slowest API Endpoints
```
fields @timestamp, request_id, method, path, duration_ms
| filter event_type = "REQUEST_END"
| sort duration_ms desc
| limit 10
```

## 5xx Errors by Endpoint (Last Hour)
```
fields @timestamp, method, path, status_code, error_message
| filter event_type = "REQUEST_ERROR" and status_code >= 500
| stats count() by path
| sort count desc
```

## Authorization Failures by User
```
fields @timestamp, user_id, resource, action, reason
| filter event_type = "authorization.denied"
| stats count() by user_id
| sort count desc
```

## Database Query Performance
```
fields @timestamp, operation, duration_ms, sql
| filter event_type = "SLOW_QUERY"
| sort duration_ms desc
| limit 50
```

## Request Volume by Endpoint
```
fields @timestamp, method, path
| filter event_type = "REQUEST_END"
| stats count() by path
| sort count desc
```

## P99 Latency by Endpoint
```
fields duration_ms, path
| filter event_type = "REQUEST_END"
| stats pct(duration_ms, 99) as p99_latency by path
| sort p99_latency desc
```
```

---

## Section 11: Alerting Rules

### CloudWatch Alarms

**File: `infrastructure/cloudwatch/alarms.tf`**

```hcl
# ============================================================================
# API Health Alarms
# ============================================================================

# High 5xx Error Rate
resource "aws_cloudwatch_metric_alarm" "api_5xx_high" {
  alarm_name          = "{PROJECT_NAME}-api-5xx-high-{var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "API5xxErrors"
  namespace           = "{PROJECT_NAME}/API"
  period              = 300  # 5 minutes
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "API 5xx error rate exceeds 10 errors in 5 minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    Environment = var.environment
  }

  alarm_actions = [
    aws_sns_topic.critical_alerts.arn
  ]

  tags = {
    Severity = "Critical"
    Team     = "Platform"
  }
}

# High P99 Latency
resource "aws_cloudwatch_metric_alarm" "api_latency_p99_high" {
  alarm_name          = "{PROJECT_NAME}-api-latency-p99-high-{var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "http_request_duration_seconds"
  namespace           = "{PROJECT_NAME}/API"
  period              = 300
  extended_statistic  = "p99"
  threshold           = 2.0  # 2 seconds
  alarm_description   = "API P99 latency exceeds 2 seconds"
  treat_missing_data  = "notBreaching"

  alarm_actions = [
    aws_sns_topic.warning_alerts.arn
  ]

  tags = {
    Severity = "Warning"
    Team     = "Platform"
  }
}

# API Target Unhealthy
resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_targets" {
  alarm_name          = "{PROJECT_NAME}-alb-unhealthy-targets-{var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 0
  alarm_description   = "ALB has unhealthy targets"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TargetGroup  = aws_lb_target_group.api.arn_suffix
    LoadBalancer = aws_lb.main.arn_suffix
  }

  alarm_actions = [
    aws_sns_topic.critical_alerts.arn
  ]

  tags = {
    Severity = "Critical"
    Team     = "Platform"
  }
}

# ============================================================================
# Database Alarms
# ============================================================================

# High Database CPU
resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  alarm_name          = "{PROJECT_NAME}-rds-cpu-high-{var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS CPU utilization exceeds 80%"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  alarm_actions = [
    aws_sns_topic.warning_alerts.arn
  ]

  tags = {
    Severity = "Warning"
    Team     = "Platform"
  }
}

# Database Connection Exhaustion
resource "aws_cloudwatch_metric_alarm" "rds_connections_high" {
  alarm_name          = "{PROJECT_NAME}-rds-connections-high-{var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 80  # Adjust based on max_connections setting
  alarm_description   = "RDS connection count approaching limit"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  alarm_actions = [
    aws_sns_topic.critical_alerts.arn
  ]

  tags = {
    Severity = "Critical"
    Team     = "Platform"
  }
}

# Database Storage Low
resource "aws_cloudwatch_metric_alarm" "rds_storage_low" {
  alarm_name          = "{PROJECT_NAME}-rds-storage-low-{var.environment}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 10737418240  # 10 GB in bytes
  alarm_description   = "RDS free storage space below 10 GB"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  alarm_actions = [
    aws_sns_topic.warning_alerts.arn
  ]

  tags = {
    Severity = "Warning"
    Team     = "Platform"
  }
}

# Slow Query Rate
resource "aws_cloudwatch_metric_alarm" "slow_queries_high" {
  alarm_name          = "{PROJECT_NAME}-slow-queries-high-{var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "SlowDatabaseQueries"
  namespace           = "{PROJECT_NAME}/Database"
  period              = 300
  statistic           = "Sum"
  threshold           = 20
  alarm_description   = "High rate of slow database queries (>1s)"
  treat_missing_data  = "notBreaching"

  alarm_actions = [
    aws_sns_topic.warning_alerts.arn
  ]

  tags = {
    Severity = "Warning"
    Team     = "Database"
  }
}

# ============================================================================
# Redis Alarms
# ============================================================================

# Redis High CPU
resource "aws_cloudwatch_metric_alarm" "redis_cpu_high" {
  alarm_name          = "{PROJECT_NAME}-redis-cpu-high-{var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 75
  alarm_description   = "Redis CPU utilization exceeds 75%"
  treat_missing_data  = "notBreaching"

  dimensions = {
    CacheClusterId = aws_elasticache_cluster.redis.id
  }

  alarm_actions = [
    aws_sns_topic.warning_alerts.arn
  ]

  tags = {
    Severity = "Warning"
    Team     = "Platform"
  }
}

# Redis Memory High
resource "aws_cloudwatch_metric_alarm" "redis_memory_high" {
  alarm_name          = "{PROJECT_NAME}-redis-memory-high-{var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 60
  statistic           = "Average"
  threshold           = 90
  alarm_description   = "Redis memory usage exceeds 90%"
  treat_missing_data  = "notBreaching"

  dimensions = {
    CacheClusterId = aws_elasticache_cluster.redis.id
  }

  alarm_actions = [
    aws_sns_topic.critical_alerts.arn
  ]

  tags = {
    Severity = "Critical"
    Team     = "Platform"
  }
}

# ============================================================================
# Security Alarms
# ============================================================================

# High Authorization Failure Rate (potential attack)
resource "aws_cloudwatch_metric_alarm" "auth_failures_high" {
  alarm_name          = "{PROJECT_NAME}-auth-failures-high-{var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "AuthorizationFailures"
  namespace           = "{PROJECT_NAME}/Security"
  period              = 300
  statistic           = "Sum"
  threshold           = 50
  alarm_description   = "High rate of authorization failures (potential attack)"
  treat_missing_data  = "notBreaching"

  alarm_actions = [
    aws_sns_topic.security_alerts.arn
  ]

  tags = {
    Severity = "Critical"
    Team     = "Security"
  }
}

# ============================================================================
# SNS Topics for Alerting
# ============================================================================

resource "aws_sns_topic" "critical_alerts" {
  name = "{PROJECT_NAME}-critical-alerts-{var.environment}"

  tags = {
    Severity = "Critical"
  }
}

resource "aws_sns_topic" "warning_alerts" {
  name = "{PROJECT_NAME}-warning-alerts-{var.environment}"

  tags = {
    Severity = "Warning"
  }
}

resource "aws_sns_topic" "security_alerts" {
  name = "{PROJECT_NAME}-security-alerts-{var.environment}"

  tags = {
    Severity = "Critical"
    Type     = "Security"
  }
}

# Email subscriptions
resource "aws_sns_topic_subscription" "critical_email" {
  topic_arn = aws_sns_topic.critical_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email  # {ALERT_EMAIL}
}

# Slack webhook subscription (via Lambda)
resource "aws_sns_topic_subscription" "critical_slack" {
  topic_arn = aws_sns_topic.critical_alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_notifier.arn
}
```

### Slack Notification Lambda

**File: `infrastructure/lambda/slack_notifier.py`**

```python
"""
Lambda function to forward CloudWatch alarms to Slack.

Environment Variables:
- SLACK_WEBHOOK_URL: Slack incoming webhook URL
"""

import json
import os
import urllib3

http = urllib3.PoolManager()

SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "{ALERT_SLACK_WEBHOOK}")

# Emoji map for alarm states
STATE_EMOJI = {
    "ALARM": ":rotating_light:",
    "OK": ":white_check_mark:",
    "INSUFFICIENT_DATA": ":question:"
}

# Color map for alarm severity
SEVERITY_COLOR = {
    "Critical": "danger",
    "Warning": "warning",
    "Info": "good"
}


def lambda_handler(event, context):
    """Forward SNS alarm message to Slack."""
    message = json.loads(event["Records"][0]["Sns"]["Message"])

    alarm_name = message.get("AlarmName", "Unknown")
    new_state = message.get("NewStateValue", "UNKNOWN")
    reason = message.get("NewStateReason", "No reason provided")
    timestamp = message.get("StateChangeTime", "Unknown")

    # Determine severity from alarm name or default to Warning
    severity = "Warning"
    if "critical" in alarm_name.lower():
        severity = "Critical"
    elif "security" in alarm_name.lower():
        severity = "Critical"

    # Build Slack message
    slack_message = {
        "text": f"{STATE_EMOJI.get(new_state, ':warning:')} CloudWatch Alarm: {alarm_name}",
        "attachments": [
            {
                "color": SEVERITY_COLOR.get(severity, "warning"),
                "fields": [
                    {"title": "Alarm", "value": alarm_name, "short": True},
                    {"title": "State", "value": new_state, "short": True},
                    {"title": "Severity", "value": severity, "short": True},
                    {"title": "Time", "value": timestamp, "short": True},
                    {"title": "Reason", "value": reason, "short": False}
                ]
            }
        ]
    }

    # Send to Slack
    encoded_msg = json.dumps(slack_message).encode("utf-8")
    response = http.request("POST", SLACK_WEBHOOK_URL, body=encoded_msg)

    return {
        "statusCode": response.status,
        "body": json.dumps("Notification sent to Slack")
    }
```

---

## Section 12: Dashboards

### CloudWatch Dashboard

**File: `infrastructure/cloudwatch/dashboards.tf`**

```hcl
resource "aws_cloudwatch_dashboard" "api_health" {
  dashboard_name = "{PROJECT_NAME}-api-health-{var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      # Request Rate
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", { stat = "Sum", label = "Total Requests" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "API Request Rate"
          yAxis = {
            left = { min = 0 }
          }
        }
      },

      # Error Rates
      {
        type = "metric"
        properties = {
          metrics = [
            ["{PROJECT_NAME}/API", "API5xxErrors", { stat = "Sum", label = "5xx Errors", color = "#d62728" }],
            [".", "API4xxErrors", { stat = "Sum", label = "4xx Errors", color = "#ff7f0e" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "API Error Rates"
          yAxis = {
            left = { min = 0 }
          }
        }
      },

      # P50/P99 Latency
      {
        type = "metric"
        properties = {
          metrics = [
            ["{PROJECT_NAME}/API", "http_request_duration_seconds", { stat = "p50", label = "P50 Latency" }],
            ["...", { stat = "p99", label = "P99 Latency", color = "#d62728" }]
          ]
          period = 300
          region = var.aws_region
          title  = "API Latency (P50/P99)"
          yAxis = {
            left = { min = 0, label = "Seconds" }
          }
        }
      },

      # Database Connections
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/RDS", "DatabaseConnections", { DBInstanceIdentifier = aws_db_instance.main.id }]
          ]
          period = 60
          stat   = "Average"
          region = var.aws_region
          title  = "Database Connections"
          yAxis = {
            left = { min = 0 }
          }
        }
      },

      # Database CPU
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", { DBInstanceIdentifier = aws_db_instance.main.id }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Database CPU Utilization"
          yAxis = {
            left = { min = 0, max = 100, label = "Percent" }
          }
        }
      },

      # Redis Memory
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ElastiCache", "DatabaseMemoryUsagePercentage", { CacheClusterId = aws_elasticache_cluster.redis.id }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Redis Memory Usage"
          yAxis = {
            left = { min = 0, max = 100, label = "Percent" }
          }
        }
      }
    ]
  })
}
```

### Grafana Dashboard (JSON)

**File: `infrastructure/grafana/api_health.json`**

```json
{
  "dashboard": {
    "title": "{PROJECT_TITLE} - API Health",
    "tags": ["api", "monitoring"],
    "timezone": "UTC",
    "panels": [
      {
        "id": 1,
        "title": "Request Rate (req/s)",
        "type": "graph",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "rate(http_requests_total{service=\"{PROJECT_NAME}\"}[5m])",
            "legendFormat": "{{ method }} {{ endpoint }}"
          }
        ],
        "yaxes": [
          { "label": "req/s", "min": 0 }
        ]
      },
      {
        "id": 2,
        "title": "Error Rate (5xx)",
        "type": "graph",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "rate(http_requests_total{service=\"{PROJECT_NAME}\",status_code=~\"5..\"}[5m])",
            "legendFormat": "{{ endpoint }}"
          }
        ],
        "yaxes": [
          { "label": "errors/s", "min": 0 }
        ],
        "alert": {
          "conditions": [
            {
              "evaluator": { "params": [10], "type": "gt" },
              "operator": { "type": "and" },
              "query": { "params": ["A", "5m", "now"] },
              "reducer": { "params": [], "type": "avg" },
              "type": "query"
            }
          ],
          "executionErrorState": "alerting",
          "frequency": "60s",
          "handler": 1,
          "name": "High 5xx Error Rate",
          "noDataState": "no_data",
          "notifications": []
        }
      },
      {
        "id": 3,
        "title": "P99 Latency",
        "type": "graph",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service=\"{PROJECT_NAME}\"}[5m]))",
            "legendFormat": "{{ endpoint }}"
          }
        ],
        "yaxes": [
          { "label": "seconds", "min": 0 }
        ]
      },
      {
        "id": 4,
        "title": "Database Query Duration (P99)",
        "type": "graph",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "histogram_quantile(0.99, rate(app_database_query_duration_seconds_bucket{service=\"{PROJECT_NAME}\"}[5m]))",
            "legendFormat": "{{ operation }}"
          }
        ],
        "yaxes": [
          { "label": "seconds", "min": 0 }
        ]
      },
      {
        "id": 5,
        "title": "Cache Hit Rate",
        "type": "stat",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "rate(app_cache_hits_total{service=\"{PROJECT_NAME}\"}[5m]) / (rate(app_cache_hits_total{service=\"{PROJECT_NAME}\"}[5m]) + rate(app_cache_misses_total{service=\"{PROJECT_NAME}\"}[5m])) * 100"
          }
        ],
        "options": {
          "unit": "percent",
          "decimals": 1
        }
      }
    ]
  }
}
```

---

## Section 13: Audit Logging

**File: `src/rbac/audit.py`**

```python
"""
Security audit logging for compliance (SOC2, GDPR, HIPAA).

Events:
- authorization.granted: Successful authorization
- authorization.denied: Failed authorization (security incident)
- data.access: Read access to sensitive resources
- data.modification: Write/update/delete operations
- admin.action: Privileged administrative operations
- role.assignment: Role grants/revocations

Best Practices:
- Log ALL authorization decisions
- Log failures at WARNING level
- Never log PII/secrets
- Include complete context
- Immutable audit trail
"""

from typing import Optional, Dict, Any, List
from datetime import datetime
from loguru import logger
from src.auth.models import User
import json

# Import Cribl logger for audit forwarding
try:
    from src.api.utils.cribl_logger import log_audit_event
    CRIBL_AVAILABLE = True
except ImportError:
    CRIBL_AVAILABLE = False
    def log_audit_event(event_type: str, event_data: Dict[str, Any]) -> None:
        print(f"[AuditLog] {json.dumps(event_data)}")


# Event type constants
AUTHORIZATION_GRANTED = "authorization.granted"
AUTHORIZATION_DENIED = "authorization.denied"
DATA_ACCESS = "data.access"
DATA_MODIFICATION = "data.modification"
ADMIN_ACTION = "admin.action"
ROLE_ASSIGNMENT = "role.assignment"


def audit_authorization(
    user: User,
    tenant_id: str,
    resource: str,
    action: str,
    granted: bool,
    reason: Optional[str] = None,
    required_permissions: Optional[List[str]] = None,
    user_permissions: Optional[List[str]] = None
) -> None:
    """
    Log authorization decision.

    Args:
        user: Authenticated user
        tenant_id: Organization/tenant ID
        resource: Resource being accessed
        action: Action being performed
        granted: Authorization result
        reason: Human-readable reason
        required_permissions: Required permissions
        user_permissions: User's actual permissions
    """
    event_type = AUTHORIZATION_GRANTED if granted else AUTHORIZATION_DENIED

    event = {
        "event_type": event_type,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "user": {
            "id": user.sub,
            "email": user.email,
            "roles": user.roles
        },
        "tenant_id": tenant_id,
        "resource": resource,
        "action": action,
        "granted": granted,
        "reason": reason,
        "required_permissions": required_permissions or [],
        "user_permissions": user_permissions or []
    }

    # Log to Cribl/stdout
    log_audit_event(event_type, event)

    # Also log via Loguru for local development
    log_level = "info" if granted else "warning"
    logger.bind(
        event_type=event_type,
        user_id=user.sub,
        tenant_id=tenant_id,
        resource=resource,
        action=action,
        granted=granted
    ).log(log_level.upper(), f"Authorization: {action} {resource} - {'GRANTED' if granted else 'DENIED'}")


def audit_data_access(
    user: User,
    tenant_id: str,
    resource_type: str,
    resource_ids: List[str],
    operation: str,
    count: int = 1
) -> None:
    """
    Log data access event.

    Args:
        user: Authenticated user
        tenant_id: Organization/tenant ID
        resource_type: Type of resource (findings, repositories, etc.)
        resource_ids: List of resource IDs accessed
        operation: Operation performed (read, list, export)
        count: Number of records accessed
    """
    event = {
        "event_type": DATA_ACCESS,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "user": {
            "id": user.sub,
            "email": user.email
        },
        "tenant_id": tenant_id,
        "resource_type": resource_type,
        "resource_ids": resource_ids[:10],  # Limit to first 10 IDs
        "operation": operation,
        "count": count
    }

    log_audit_event(DATA_ACCESS, event)

    logger.bind(
        event_type=DATA_ACCESS,
        user_id=user.sub,
        resource_type=resource_type,
        count=count
    ).info(f"Data access: {operation} {count} {resource_type}")


def audit_data_modification(
    user: User,
    tenant_id: str,
    resource_type: str,
    resource_id: str,
    operation: str,
    changes: Optional[Dict[str, Any]] = None
) -> None:
    """
    Log data modification event.

    Args:
        user: Authenticated user
        tenant_id: Organization/tenant ID
        resource_type: Type of resource
        resource_id: Resource ID
        operation: Operation (create, update, delete)
        changes: Dict of changed fields (before/after)
    """
    event = {
        "event_type": DATA_MODIFICATION,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "user": {
            "id": user.sub,
            "email": user.email
        },
        "tenant_id": tenant_id,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "operation": operation,
        "changes": changes or {}
    }

    log_audit_event(DATA_MODIFICATION, event)

    logger.bind(
        event_type=DATA_MODIFICATION,
        user_id=user.sub,
        resource_type=resource_type,
        operation=operation
    ).info(f"Data modification: {operation} {resource_type}/{resource_id}")


def audit_admin_action(
    user: User,
    action: str,
    target: str,
    details: Optional[Dict[str, Any]] = None
) -> None:
    """
    Log privileged administrative action.

    Args:
        user: Admin user
        action: Action performed (reset_database, delete_tenant, etc.)
        target: Target of action
        details: Additional context
    """
    event = {
        "event_type": ADMIN_ACTION,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "user": {
            "id": user.sub,
            "email": user.email,
            "roles": user.roles
        },
        "action": action,
        "target": target,
        "details": details or {}
    }

    log_audit_event(ADMIN_ACTION, event)

    logger.bind(
        event_type=ADMIN_ACTION,
        user_id=user.sub,
        action=action
    ).warning(f"Admin action: {action} on {target}")


def audit_role_assignment(
    actor: User,
    target_user_id: str,
    tenant_id: str,
    roles_added: List[str],
    roles_removed: List[str]
) -> None:
    """
    Log role assignment/revocation.

    Args:
        actor: User performing role change
        target_user_id: User receiving role change
        tenant_id: Organization/tenant ID
        roles_added: Roles granted
        roles_removed: Roles revoked
    """
    event = {
        "event_type": ROLE_ASSIGNMENT,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "actor": {
            "id": actor.sub,
            "email": actor.email
        },
        "target_user_id": target_user_id,
        "tenant_id": tenant_id,
        "roles_added": roles_added,
        "roles_removed": roles_removed
    }

    log_audit_event(ROLE_ASSIGNMENT, event)

    logger.bind(
        event_type=ROLE_ASSIGNMENT,
        actor_id=actor.sub,
        target_user_id=target_user_id
    ).info(f"Role assignment: +{roles_added} -{roles_removed}")
```

---

## Section 14: Frontend Monitoring

### Error Boundaries (React)

**File: `frontend/components/ErrorBoundary.tsx`**

```typescript
import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    // Send to Sentry
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack
        }
      }
    });
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>We've been notified and are working on a fix.</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

### Web Vitals Tracking

**File: `frontend/utils/webVitals.ts`**

```typescript
import { getCLS, getFID, getFCP, getLCP, getTTFB, Metric } from 'web-vitals';

// Send metrics to analytics endpoint
function sendToAnalytics(metric: Metric) {
  const body = JSON.stringify({
    metric: metric.name,
    value: metric.value,
    id: metric.id,
    navigationType: metric.navigationType,
    timestamp: Date.now(),
    page: window.location.pathname
  });

  // Use sendBeacon if available (doesn't block page unload)
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics/vitals', body);
  } else {
    fetch('/api/analytics/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    });
  }
}

export function reportWebVitals() {
  getCLS(sendToAnalytics);   // Cumulative Layout Shift
  getFID(sendToAnalytics);   // First Input Delay
  getFCP(sendToAnalytics);   // First Contentful Paint
  getLCP(sendToAnalytics);   // Largest Contentful Paint
  getTTFB(sendToAnalytics);  // Time to First Byte
}
```

### User Analytics

**File: `frontend/utils/analytics.ts`**

```typescript
interface AnalyticsEvent {
  event: string;
  properties?: Record<string, any>;
  user_id?: string;
  session_id?: string;
}

class Analytics {
  private sessionId: string;
  private userId?: string;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
  }

  private getOrCreateSessionId(): string {
    let sessionId = sessionStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('analytics_session_id', sessionId);
    }
    return sessionId;
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  track(event: string, properties?: Record<string, any>) {
    const payload: AnalyticsEvent = {
      event,
      properties: {
        ...properties,
        page: window.location.pathname,
        referrer: document.referrer,
        timestamp: new Date().toISOString()
      },
      session_id: this.sessionId,
      user_id: this.userId
    };

    fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => console.error('Analytics error:', err));
  }

  pageView() {
    this.track('page_view', {
      title: document.title,
      path: window.location.pathname
    });
  }
}

export const analytics = new Analytics();
```

---

## Section 15: Operational Runbooks

### Runbook Template

**File: `docs/runbooks/TEMPLATE.md`**

```markdown
# Runbook: [Alert Name]

## Alert Description
Brief description of what triggers this alert.

## Severity
- [ ] Critical (immediate action required)
- [ ] Warning (action required within 1 hour)
- [ ] Info (investigate during business hours)

## Symptoms
- What the user experiences when this alert fires
- Observable behavior or metrics

## Impact
- User-facing impact (service degradation, downtime, etc.)
- Affected components/services

## Diagnosis

### Quick Checks
1. Check dashboard: [Link to relevant dashboard]
2. Review recent deployments: `kubectl get pods -n {PROJECT_NAME}`
3. Check CloudWatch Logs: [Link to CloudWatch Insights query]

### Investigation Steps
```bash
# Step 1: Check application logs
aws logs tail {LOG_GROUP} --follow --filter-pattern "ERROR"

# Step 2: Check database connections
psql -h {DB_HOST} -U {DB_USER} -c "SELECT count(*) FROM pg_stat_activity;"

# Step 3: Check Redis
redis-cli -h {REDIS_HOST} INFO stats
```

## Resolution

### Immediate Actions
1. [First action to mitigate]
2. [Second action]

### Short-term Fix
```bash
# Commands to resolve the issue
```

### Long-term Solution
- Root cause prevention
- Code/infrastructure changes needed

## Escalation
- Primary: Platform Team (#platform-oncall)
- Secondary: Engineering Lead (@tech-lead)
- Emergency: CTO (@cto)

## Related Alerts
- [Related Alert 1]
- [Related Alert 2]

## Post-Incident
- [ ] Update runbook with lessons learned
- [ ] Create Jira ticket for root cause fix
- [ ] Update monitoring thresholds if needed
```

### Example: High 5xx Error Rate

**File: `docs/runbooks/high_5xx_errors.md`**

```markdown
# Runbook: High 5xx Error Rate

## Alert Description
API 5xx error rate exceeds 10 errors in 5 minutes.

## Severity
**Critical** - Immediate action required

## Symptoms
- Users see "Internal Server Error" messages
- API requests fail intermittently
- Dashboard shows spike in 5xx errors

## Impact
- Users cannot complete actions
- Data operations may be lost
- SLA violation risk

## Diagnosis

### Quick Checks
1. Dashboard: https://{GRAFANA_URL}/d/api-health
2. Recent deployments: Check last 30 minutes
3. CloudWatch Logs: Filter by ERROR level

### Investigation Steps

```bash
# 1. Check error distribution by endpoint
aws logs insights query-id $(aws logs start-query \
  --log-group-name {LOG_GROUP} \
  --start-time $(date -u -d '10 minutes ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string 'fields @timestamp, path, error_type, error_message | filter status_code >= 500 | stats count() by path' \
  --output text --query 'queryId')

# 2. Check database health
psql -h {DB_HOST} -U {DB_USER} -c "
  SELECT count(*) as connections, state
  FROM pg_stat_activity
  GROUP BY state;"

# 3. Check Redis connectivity
redis-cli -h {REDIS_HOST} PING

# 4. Check external API status
curl -I https://api.github.com
```

## Resolution

### Immediate Actions
1. **Roll back** if recent deployment:
   ```bash
   kubectl rollout undo deployment/{PROJECT_NAME}-api -n {PROJECT_NAME}
   ```

2. **Scale up** if capacity issue:
   ```bash
   kubectl scale deployment/{PROJECT_NAME}-api --replicas=6 -n {PROJECT_NAME}
   ```

3. **Restart pods** if memory leak suspected:
   ```bash
   kubectl rollout restart deployment/{PROJECT_NAME}-api -n {PROJECT_NAME}
   ```

### Database Connection Exhaustion
If error logs show "too many connections":
```sql
-- Kill idle connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
AND state_change < now() - interval '10 minutes';
```

### External API Failures
If GitHub/Jira API is down:
1. Enable circuit breaker in settings
2. Switch to cached data mode
3. Communicate to users via status page

## Escalation
- Primary: @platform-oncall (Slack: #platform-oncall)
- Secondary: @sre-lead
- Emergency: @vp-engineering

## Related Alerts
- Database Connection High
- Slow Request Rate High
- ALB Unhealthy Targets

## Post-Incident
- [ ] Review error logs and identify root cause
- [ ] Create post-mortem document
- [ ] Update error handling/retry logic
- [ ] Adjust alarm thresholds if false positive
```

---

## Section 16: Validation Checklist

### Pre-Production Checklist

```markdown
## Logging
- [ ] Loguru configured with JSON output
- [ ] Cribl Stream integration tested
- [ ] MinIO fallback working
- [ ] PII/secret redaction verified
- [ ] Request correlation IDs present in all logs
- [ ] Log levels configurable via environment variable
- [ ] CloudWatch log groups created
- [ ] Log retention policies set (30 days for API, 7 days for access logs)

## Metrics
- [ ] Prometheus metrics endpoint (`/metrics`) accessible
- [ ] HTTP request metrics collected (rate, latency, errors)
- [ ] Database query metrics instrumented
- [ ] Redis cache hit/miss metrics tracked
- [ ] External API call metrics recorded
- [ ] Business metrics (scans, findings, logins) implemented
- [ ] Metric cardinality reviewed (no high-cardinality labels)

## Health Checks
- [ ] `/health` endpoint returns 200
- [ ] `/health/ready` checks database connectivity
- [ ] `/health/ready` checks Redis connectivity
- [ ] `/health/live` lightweight and fast (<100ms)
- [ ] Health checks used in ECS/K8s probes
- [ ] Health check failures logged

## Tracing
- [ ] OpenTelemetry initialized
- [ ] FastAPI auto-instrumentation enabled
- [ ] SQLAlchemy queries traced
- [ ] Redis operations traced
- [ ] HTTPX external calls traced
- [ ] Custom spans added for critical operations
- [ ] Trace context propagated across services

## Error Tracking
- [ ] Sentry SDK initialized
- [ ] FastAPI integration enabled
- [ ] Error grouping working correctly
- [ ] User context enriched on errors
- [ ] 404 errors filtered out
- [ ] Health check errors ignored
- [ ] Release tags configured

## CloudWatch
- [ ] Log groups created in Terraform
- [ ] Metric filters deployed (5xx, 4xx, slow requests)
- [ ] Alarms configured (critical and warning)
- [ ] SNS topics created for alerts
- [ ] Email subscriptions verified
- [ ] Slack notifications tested
- [ ] Dashboards created and shared

## Alerting
- [ ] Critical alarms route to PagerDuty/on-call
- [ ] Warning alarms route to Slack
- [ ] Security alarms route to security team
- [ ] Alarm thresholds tuned to avoid false positives
- [ ] Escalation policies documented
- [ ] Runbooks created for all critical alerts

## Audit Logging
- [ ] Authorization events logged (granted + denied)
- [ ] Data access events logged
- [ ] Data modification events logged
- [ ] Admin actions logged
- [ ] Role assignments logged
- [ ] Audit logs immutable (write-only)
- [ ] Audit logs forwarded to SIEM

## Frontend Monitoring
- [ ] Error boundaries implemented
- [ ] Sentry frontend SDK configured
- [ ] Web Vitals tracked (CLS, FID, FCP, LCP, TTFB)
- [ ] User analytics events sent
- [ ] Session tracking implemented

## Documentation
- [ ] Runbooks created for common alerts
- [ ] Dashboards documented
- [ ] CloudWatch Insights queries saved
- [ ] Escalation paths documented
- [ ] Monitoring architecture diagram created

## Testing
- [ ] Load test conducted with monitoring enabled
- [ ] Logs verified under high load
- [ ] Metrics accuracy validated
- [ ] Alert thresholds tested with synthetic errors
- [ ] Failover scenarios tested (DB down, Redis down)
- [ ] Log volume estimated and storage costs calculated

## Security
- [ ] Metrics endpoint behind authentication (or internal-only)
- [ ] PII redacted from all logs
- [ ] Secrets redacted from error messages
- [ ] Audit logs encrypted at rest
- [ ] Access to monitoring tools restricted by RBAC
```

---

## Environment Variables Reference

```bash
# ============================================================================
# Logging Configuration
# ============================================================================
LOG_LEVEL=INFO                                  # Minimum log level (DEBUG, INFO, WARNING, ERROR)
CRIBL_ENABLED=true                              # Enable Cribl Stream integration
CRIBL_INGEST_URL={CRIBL_INGEST_URL}            # Cribl HTTP ingest endpoint
CRIBL_AUTH_TOKEN={CRIBL_AUTH_TOKEN}            # Cribl authentication token
CRIBL_VERIFY_SSL=true                           # Verify SSL for Cribl endpoint
CRIBL_REDACT_SENSITIVE=true                     # Enable PII/secret redaction
MINIO_FALLBACK=true                             # Use MinIO as fallback
MINIO_ENDPOINT={MINIO_ENDPOINT}                # MinIO endpoint
MINIO_BUCKET={MINIO_BUCKET}                    # MinIO bucket name
MINIO_ACCESS_KEY=admin                          # MinIO access key
MINIO_SECRET_KEY=password                       # MinIO secret key

# ============================================================================
# Tracing Configuration
# ============================================================================
OTEL_ENABLED=true                               # Enable OpenTelemetry
OTEL_SERVICE_NAME={PROJECT_NAME}               # Service name for traces
OTEL_EXPORTER=jaeger                            # Exporter type (jaeger, otlp, console)
JAEGER_AGENT_HOST=localhost                     # Jaeger agent hostname
JAEGER_AGENT_PORT=6831                          # Jaeger agent port
OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4317     # OTLP endpoint (for AWS X-Ray)
OTEL_EXPORTER_OTLP_INSECURE=true               # Use insecure connection

# ============================================================================
# Error Tracking (Sentry)
# ============================================================================
SENTRY_DSN={SENTRY_DSN}                        # Sentry Data Source Name
SENTRY_ENVIRONMENT={SENTRY_ENVIRONMENT}        # Environment tag (production, staging)
SENTRY_TRACES_SAMPLE_RATE=0.1                   # Performance sampling rate (0.0-1.0)
SENTRY_PROFILES_SAMPLE_RATE=0.1                 # Profiling sampling rate (0.0-1.0)

# ============================================================================
# CloudWatch Configuration
# ============================================================================
AWS_REGION={AWS_REGION}                        # AWS region
AWS_ACCOUNT_ID={AWS_ACCOUNT_ID}                # AWS account ID
LOG_GROUP={LOG_GROUP}                          # CloudWatch log group
LOG_RETENTION_DAYS=30                           # Log retention period

# ============================================================================
# Alerting Configuration
# ============================================================================
ALERT_EMAIL={ALERT_EMAIL}                      # Email for critical alerts
ALERT_SLACK_WEBHOOK={ALERT_SLACK_WEBHOOK}      # Slack webhook URL
PAGERDUTY_INTEGRATION_KEY=xxx                   # PagerDuty integration key (optional)
```

---

## Quick Start Guide

### 1. Install Dependencies

```bash
# Python dependencies
poetry add loguru prometheus-client prometheus-fastapi-instrumentator \
           opentelemetry-api opentelemetry-sdk \
           opentelemetry-instrumentation-fastapi \
           opentelemetry-instrumentation-sqlalchemy \
           opentelemetry-instrumentation-redis \
           sentry-sdk httpx minio

# Optional: Development tools
poetry add --dev pytest-cov locust  # For load testing
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Update with your values
vi .env
```

### 3. Initialize Monitoring

```python
# In src/api/main.py startup event
from src.api.utils.cribl_logger import setup_cribl_logger
from src.monitoring.tracing import setup_tracing
from src.monitoring.sentry import setup_sentry
from src.monitoring.database import setup_database_instrumentation

@app.on_event("startup")
async def startup_event():
    # Logging
    setup_cribl_logger()

    # Tracing
    setup_tracing(app, engine)

    # Error tracking
    setup_sentry()

    # Database instrumentation
    setup_database_instrumentation(engine)

    logger.info("Monitoring initialized")
```

### 4. Add Health Check Router

```python
# In src/api/main.py
from src.monitoring.health import router as health_router
app.include_router(health_router)
```

### 5. Deploy Infrastructure

```bash
# Deploy CloudWatch resources
cd infrastructure/cloudwatch
terraform init
terraform plan
terraform apply

# Deploy Grafana dashboards
cd ../grafana
# Import JSON files via Grafana UI or API
```

### 6. Verify Monitoring

```bash
# Check metrics endpoint
curl http://localhost:8000/metrics

# Check health endpoints
curl http://localhost:8000/health
curl http://localhost:8000/health/ready
curl http://localhost:8000/health/live

# Trigger test error
curl -X POST http://localhost:8000/api/test/error

# Check Sentry for captured error
# Check CloudWatch Logs for error entry
```

---

## Cost Estimation

### AWS CloudWatch (Monthly)

| Resource | Volume | Cost |
|---|---|---|
| Log ingestion (API) | 100 GB | $50 |
| Log storage (30 days) | 3 TB | $30 |
| Custom metrics | 50 metrics | $15 |
| Alarms | 20 alarms | $10 |
| Dashboards | 5 dashboards | $15 |
| **Total** | | **$120/month** |

### Third-Party SaaS (Monthly)

| Service | Plan | Cost |
|---|---|---|
| Sentry | Team (10 users) | $26 |
| Grafana Cloud | Pro | $49 |
| PagerDuty | Professional | $41/user |
| DataDog (optional) | Pro | $15/host |

### Self-Hosted (Monthly)

| Component | Resources | Cost (AWS) |
|---|---|---|
| Prometheus | t3.medium | $30 |
| Grafana | t3.small | $15 |
| Jaeger | t3.small | $15 |
| MinIO | t3.medium + 500GB EBS | $45 |
| **Total** | | **$105/month** |

---

## Summary

This monitoring and observability plan provides:

1. **Comprehensive Logging**: Structured JSON logs via Loguru, forwarded to Cribl/CloudWatch with PII redaction
2. **Rich Metrics**: Prometheus instrumentation for HTTP, database, Redis, and business KPIs
3. **Distributed Tracing**: OpenTelemetry integration with Jaeger/X-Ray for request flow visibility
4. **Robust Health Checks**: Kubernetes/ECS-ready liveness and readiness probes
5. **Error Tracking**: Sentry integration with user context and breadcrumbs
6. **Proactive Alerting**: CloudWatch alarms with SNS/Slack/PagerDuty notifications
7. **Operational Dashboards**: CloudWatch and Grafana dashboards for real-time monitoring
8. **Compliance-Ready Audit Logs**: Immutable security audit trail for SOC2/GDPR
9. **Frontend Monitoring**: Web Vitals, error boundaries, and user analytics
10. **Runbook Templates**: Actionable runbooks for common incidents

**Next Steps:**
1. Customize placeholders for your project
2. Deploy CloudWatch infrastructure via Terraform
3. Configure Sentry/Cribl/Grafana SaaS accounts
4. Load test with monitoring enabled
5. Tune alert thresholds based on baseline metrics
6. Create runbooks for your top 10 alerts

**Reference Implementation**: All patterns derived from [AuditGH](https://github.com/sleepnumber/auditgh) production monitoring stack.
```

---

