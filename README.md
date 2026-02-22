# mocksvcs

Mock API services for local development and testing. Each service runs independently as a Docker Compose stack with its own lifecycle scripts.

## Services

| Service | Description | Host Port | Container Port | Health Check |
|---------|-------------|-----------|----------------|--------------|
| **mock-cribl** | Cribl Stream HTTP Source emulator for structured log ingestion | 3005 | 10080 | `GET /health` |
| **mock-github** | GitHub REST API mock covering repos, PRs, checks, actions, code scanning | 3006 | 8090 | `GET /rate_limit` |
| **mock-oidc** | OIDC/OAuth2 identity provider with authorization code flow | 3007 | 10090 | `GET /health` |

All services are built with Python 3.12 / FastAPI and use in-memory storage (data resets on container restart).

## Quick Start

```bash
# Start a service in the background
scripts/mock-cribl-start.sh -d
scripts/mock-github-start.sh -d
scripts/mock-oidc-start.sh -d

# Verify it's running
curl http://localhost:3005/health
curl http://localhost:3006/rate_limit
curl http://localhost:3007/health
```

## Scripts

Each service has three scripts in `scripts/`. All scripts auto-detect the project root, stop existing containers, and kill processes occupying required ports before starting.

### start

```bash
scripts/mock-cribl-start.sh [OPTIONS]
scripts/mock-github-start.sh [OPTIONS]
scripts/mock-oidc-start.sh [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `-d`, `--detach` | Run in background |
| `--build` | Build image before starting |
| `--rebuild` | Force full rebuild with no cache |
| `--no-check-ports` | Skip port conflict check |
| `-h`, `--help` | Show help |

### restart

```bash
scripts/mock-cribl-restart.sh [OPTIONS]
scripts/mock-github-restart.sh [OPTIONS]
scripts/mock-oidc-restart.sh [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--build` | Rebuild image before restarting |
| `--hard` | Full teardown and start (docker compose down + up) |
| `-h`, `--help` | Show help |

### shutdown

```bash
scripts/mock-cribl-shutdown.sh [OPTIONS]
scripts/mock-github-shutdown.sh [OPTIONS]
scripts/mock-oidc-shutdown.sh [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--clean` | Remove volumes and images |
| `-h`, `--help` | Show help |

## Service Details

---

### Mock Cribl Stream

Emulates a [Cribl Stream](https://cribl.io/) HTTP Source. Accepts structured JSON log events and stores them in an in-memory circular buffer (default 10,000 events) for querying.

**Authentication**: Bearer token (default: `mock-cribl-dev-token`)

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/cribl/ingest` | Ingest JSON array of log events |
| POST | `/cribl/_bulk` | Ingest NDJSON (newline-delimited) events |
| POST | `/api/v1/auth/login` | Authenticate and receive token |
| GET | `/api/v1/health` | Health check with event count |
| GET | `/debug/events` | Query events (filter by level, service, scan_id, message) |
| GET | `/debug/stats` | Event statistics |
| DELETE | `/debug/events` | Clear all events |

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_CRIBL_AUTH_TOKEN` | `mock-cribl-dev-token` | Bearer token for ingest auth |
| `MOCK_CRIBL_MAX_EVENTS` | `10000` | Circular buffer capacity |

#### Example

```bash
# Ingest events
curl -X POST http://localhost:3005/cribl/ingest \
  -H "Authorization: Bearer mock-cribl-dev-token" \
  -H "Content-Type: application/json" \
  -d '[{"service":"myapp","level":"info","message":"hello"}]'

# Query events
curl "http://localhost:3005/debug/events?level=info&service=myapp"
```

---

### Mock GitHub API

Mock implementation of the GitHub REST API. Covers repositories, branches, commits, pull requests, issues, comments, check runs/suites, code scanning (SARIF uploads), Actions workflows/runs/jobs/artifacts, secrets, variables, and more.

**Authentication**: Accepts any `Bearer` or `token` value in the `Authorization` header.

#### Endpoint Groups

| Group | Endpoints | Key Paths |
|-------|-----------|-----------|
| Auth & User | 2 | `/user`, `/rate_limit` |
| Repositories | 4 | `/repos/{owner}/{repo}`, `/user/repos`, `/orgs/{org}/repos` |
| Branches | 2 | `/repos/{owner}/{repo}/branches` |
| Commits & Statuses | 5 | `/repos/{owner}/{repo}/commits`, `.../statuses/{sha}` |
| Pull Requests | 8 | `/repos/{owner}/{repo}/pulls` |
| Issues & Comments | 5 | `.../issues/{n}/comments`, `.../issues/comments/{id}` |
| Check Runs | 6 | `.../check-runs`, `.../commits/{ref}/check-runs` |
| Check Suites | 5 | `.../check-suites` |
| Code Scanning | 5 | `.../code-scanning/alerts`, `.../code-scanning/sarifs` |
| Workflows | 5 | `.../actions/workflows` |
| Workflow Runs | 9 | `.../actions/runs` |
| Jobs | 3 | `.../actions/jobs` |
| Artifacts | 5 | `.../actions/artifacts` |
| Secrets | 5 | `.../actions/secrets` |
| Variables | 5 | `.../actions/variables` |
| Permissions & Caches | 5 | `.../actions/permissions`, `.../actions/caches` |
| Debug | 3 | `/debug/store` |

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_GITHUB_DEFAULT_USER_LOGIN` | `mock-user` | Authenticated user login |
| `MOCK_GITHUB_DEFAULT_ORG` | `mock-org` | Default organization name |
| `MOCK_GITHUB_AUTO_CREATE_REPOS` | `true` | Auto-create repos on first access |
| `MOCK_GITHUB_LOG_LEVEL` | `info` | Log verbosity |

#### Example

```bash
# Create a repository
curl -X POST http://localhost:3006/user/repos \
  -H "Authorization: token mock-token" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-repo"}'

# Create a pull request
curl -X POST http://localhost:3006/repos/mock-user/my-repo/pulls \
  -H "Authorization: token mock-token" \
  -H "Content-Type: application/json" \
  -d '{"title":"Fix bug","head":"feature","base":"main"}'

# Upload SARIF
curl -X POST http://localhost:3006/repos/mock-user/my-repo/code-scanning/sarifs \
  -H "Authorization: token mock-token" \
  -H "Content-Type: application/json" \
  -d '{"commit_sha":"abc123","ref":"refs/heads/main","sarif":"<base64>"}'

# Debug: see all stored data
curl http://localhost:3006/debug/store
```

---

### Mock OIDC Server

Fully functional OIDC/OAuth2 identity provider implementing the authorization code flow. Serves a browser-based user picker for interactive login and supports automated login via `login_hint`.

**Split URL architecture**: The discovery document returns `localhost` URLs for browser-facing endpoints (authorize, logout) and container-hostname URLs for backend-facing endpoints (token, userinfo, JWKS). This allows both browser redirects and container-to-container calls to work in Docker.

#### Pre-seeded Data

**Client** (default):
- Client ID: `mock-oidc-client`
- Client Secret: `mock-oidc-secret`
- Redirect URIs: `http://localhost:3000/api/auth/callback`, `http://localhost:3001/api/v1/auth/callback`

**Users** (3 test identities):

| Subject | Email | Name |
|---------|-------|------|
| `mock-admin` | `admin@zapper.local` | Mock Admin |
| `mock-analyst` | `analyst@zapper.local` | Mock Analyst |
| `mock-user` | `user@zapper.local` | Mock User |

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/.well-known/openid-configuration` | OIDC discovery document |
| GET | `/authorize` | Authorization endpoint (user picker or auto-redirect) |
| POST | `/authorize/select` | User selection form handler |
| POST | `/token` | Token exchange (auth code and refresh token grants) |
| POST | `/token/introspect` | Token introspection (RFC 7662) |
| POST | `/token/revoke` | Token revocation (RFC 7009) |
| GET | `/userinfo` | User claims (requires Bearer token) |
| GET | `/jwks` | JSON Web Key Set (RS256 public key) |
| GET/POST/PUT/DELETE | `/clients[/{client_id}]` | Client registration CRUD |
| GET/POST/PUT/DELETE | `/users[/{sub}]` | Mock user CRUD |
| GET | `/logout` | End session (optional `post_logout_redirect_uri`) |
| GET | `/health` | Health check |
| GET/DELETE | `/debug/store` | Store stats / reset all data |
| GET | `/debug/tokens` | List issued tokens |

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_OIDC_EXTERNAL_BASE_URL` | `http://localhost:3007` | Browser-facing base URL |
| `MOCK_OIDC_INTERNAL_BASE_URL` | `http://mock-oidc:10090` | Container-facing base URL |
| `MOCK_OIDC_DEFAULT_CLIENT_ID` | `mock-oidc-client` | Pre-seeded client ID |
| `MOCK_OIDC_DEFAULT_CLIENT_SECRET` | `mock-oidc-secret` | Pre-seeded client secret |
| `MOCK_OIDC_ACCESS_TOKEN_LIFETIME` | `3600` | Access token TTL (seconds) |
| `MOCK_OIDC_ID_TOKEN_LIFETIME` | `3600` | ID token TTL (seconds) |
| `MOCK_OIDC_REFRESH_TOKEN_LIFETIME` | `86400` | Refresh token TTL (seconds) |
| `MOCK_OIDC_STRICT_REDIRECT_URI` | `false` | Enforce redirect URI validation |
| `MOCK_OIDC_REQUIRE_CLIENT_SECRET` | `false` | Require client secret on token exchange |

#### Example

```bash
# Discovery
curl http://localhost:3007/.well-known/openid-configuration

# Browser: visit the authorize endpoint to see the user picker
open "http://localhost:3007/authorize?client_id=mock-oidc-client&redirect_uri=http://localhost:3000/api/auth/callback&response_type=code&scope=openid%20profile%20email"

# Automated login (skips picker, auto-redirects)
# Add login_hint=mock-admin to auto-select a user

# List users
curl http://localhost:3007/users

# Create a custom user
curl -X POST http://localhost:3007/users \
  -H "Content-Type: application/json" \
  -d '{"sub":"dev-user","email":"dev@example.com","name":"Dev User"}'

# Reset all data
curl -X DELETE http://localhost:3007/debug/store
```

## Running Tests

Each service has a pytest test suite. Run tests from the repo root:

```bash
# Install test dependencies (once per service)
pip install -r mock_cribl/requirements-test.txt
pip install -r mock_github/requirements-test.txt
pip install -r mock_oidc/requirements-test.txt

# Run tests
pytest mock_cribl/tests/ -v
pytest mock_github/tests/ -v
pytest mock_oidc/tests/ -v
```

## Project Structure

```
mocksvcs/
  mock_cribl/              # Mock Cribl Stream service
    routes/                # auth, health, ingest, debug
    tests/                 # pytest suite
    Dockerfile
    requirements.txt
  mock_github/             # Mock GitHub API service
    models/                # Pydantic models per domain
    routes/                # repos, pulls, checks, actions, etc.
    tests/                 # pytest suite
    Dockerfile
    requirements.txt
  mock_oidc/               # Mock OIDC/OAuth2 service
    routes/                # discovery, authorize, token, userinfo, etc.
    tests/                 # pytest suite
    Dockerfile
    requirements.txt
  scripts/                 # Lifecycle scripts (start/restart/shutdown per service)
  docker-compose.mock-cribl.yml
  docker-compose.mock-github.yml
  docker-compose.mock-oidc.yml
```
