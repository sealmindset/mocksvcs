# mock-acr

A lightweight mock Azure Container Registry that implements the Docker Registry V2 API. Supports `docker pull`, `docker push`, and image import from tar files.

**Purpose:** Eliminate the need to disable Zscaler for Docker image pulls from ACR during local development.

## Quick Start

```bash
# Start the mock ACR
docker compose up -d

# Verify it's running
curl http://localhost:5100/health

# Mirror an image into it (requires Docker daemon + internet for first pull)
./scripts/mirror-image.sh python:3.12-slim

# Pull from mock ACR (no Zscaler needed!)
docker pull localhost:5100/library/python:3.12-slim
```

## How It Works

1. **Mock ACR** runs locally on port 5100 and implements the Docker Registry V2 protocol
2. **Images are loaded** via `docker push`, tar import, mirror script, or **pulled automatically from Docker Hub** (pull-through proxy)
3. **Dockerfiles** reference the mock registry instead of the real ACR
4. **No Zscaler interaction** -- all pulls are local or proxied through Python (which handles Zscaler's TLS inspection)

### Workflow: Replace ACR in Dockerfiles

```dockerfile
# Before (requires Zscaler disabled):
FROM myacr.azurecr.io/platform/python-base:3.12

# After (works with Zscaler enabled):
FROM localhost:5100/platform/python-base:3.12
```

## Pull-Through Proxy (Recommended)

When an image isn't found locally, mock-acr automatically fetches it from Docker Hub and caches it for future pulls. This works **with Zscaler enabled** because the upstream fetch uses Python's `httpx` (which bypasses Zscaler's TLS interception issues that break Docker's native client).

```bash
# Just pull -- if the image isn't cached, mock-acr fetches it from Docker Hub automatically
docker pull localhost:5100/library/busybox:latest

# Second pull is instant (served from cache)
docker pull localhost:5100/library/busybox:latest

# Works with any Docker Hub image
docker pull localhost:5100/library/python:3.12-slim
docker pull localhost:5100/library/node:20-slim
```

The proxy handles multi-arch manifest lists automatically, resolving to your current platform (arm64 or amd64).

### Proxy Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_ACR_PROXY_ENABLED` | `true` | Enable/disable pull-through proxy |
| `MOCK_ACR_PROXY_UPSTREAM_URL` | `https://registry-1.docker.io` | Upstream registry URL |
| `MOCK_ACR_PROXY_TLS_VERIFY` | `false` | Verify TLS certs for upstream (disable for Zscaler) |
| `MOCK_ACR_PROXY_CA_CERT` | `` | Path to CA bundle (e.g., Zscaler root CA) for verified upstream |

To disable the proxy and only serve locally-loaded images:

```bash
MOCK_ACR_PROXY_ENABLED=false docker compose up -d
```

## Loading Images (Manual)

These methods are useful for pre-seeding images or loading from private registries that the proxy can't reach.

### Option 1: Mirror from Docker Hub or ACR

When you DO have access (Zscaler off, or from a machine with access):

```bash
# Mirror a public image
./scripts/mirror-image.sh python:3.12-slim

# Mirror from your real ACR
./scripts/mirror-image.sh myacr.azurecr.io/platform/base:latest

# Seed all common base images at once
./scripts/seed-images.sh
```

### Option 2: Import from tar

```bash
# On a machine with ACR access:
docker pull myacr.azurecr.io/platform/base:latest
docker save myacr.azurecr.io/platform/base:latest -o base.tar

# On any machine (no ACR access needed):
./scripts/import-tar.sh base.tar
```

### Option 3: Direct push

```bash
docker tag myimage:latest localhost:5100/myimage:latest
docker push localhost:5100/myimage:latest
```

## API Endpoints

### Docker Registry V2 (used by `docker pull`/`docker push`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v2/` | Version check (triggers auth flow) |
| GET | `/v2/_catalog` | List repositories |
| GET | `/v2/{name}/tags/list` | List tags for a repository |
| GET | `/v2/{name}/manifests/{ref}` | Pull manifest (by tag or digest) |
| HEAD | `/v2/{name}/manifests/{ref}` | Check manifest exists |
| PUT | `/v2/{name}/manifests/{ref}` | Push manifest |
| GET | `/v2/{name}/blobs/{digest}` | Pull blob (layer or config) |
| HEAD | `/v2/{name}/blobs/{digest}` | Check blob exists |
| POST | `/v2/{name}/blobs/uploads/` | Start blob upload |
| PATCH | `/v2/{name}/blobs/uploads/{id}` | Upload blob chunk |
| PUT | `/v2/{name}/blobs/uploads/{id}` | Complete blob upload |

### Auth (ACR-compatible, always succeeds)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/oauth2/token` | Get bearer token (always grants access) |
| GET/POST | `/oauth2/exchange` | Exchange refresh token |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/admin/stats` | Registry statistics |
| GET | `/admin/repositories` | List all repos with tags |
| POST | `/admin/import` | Import from tar file |

## Configuration

All settings via environment variables (prefix `MOCK_ACR_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_ACR_PORT` | `5100` | Server port |
| `MOCK_ACR_REGISTRY_HOST` | `localhost:5100` | Registry hostname (for auth challenges) |
| `MOCK_ACR_DATA_DIR` | `/data` | Storage directory |
| `MOCK_ACR_PROXY_ENABLED` | `true` | Enable pull-through proxy |
| `MOCK_ACR_PROXY_UPSTREAM_URL` | `https://registry-1.docker.io` | Upstream registry |
| `MOCK_ACR_PROXY_TLS_VERIFY` | `false` | Verify upstream TLS (set `false` for Zscaler) |
| `MOCK_ACR_PROXY_CA_CERT` | `` | CA bundle path for verified upstream |
| `MOCK_ACR_TOKEN_LIFETIME` | `3600` | Auth token lifetime in seconds |

## Docker Daemon Configuration

For `localhost`, Docker allows HTTP (insecure) registries by default. For other hostnames (like `mockacr.azurecr.io`), add to Docker daemon config:

```json
{
  "insecure-registries": ["mockacr.azurecr.io:5100"]
}
```

Then add to `/etc/hosts`:
```
127.0.0.1 mockacr.azurecr.io
```

## Integration with Other Projects

Add mock-acr to any project's docker-compose.yml:

```yaml
services:
  mock-acr:
    build: ../mocksvcs/mock-acr
    ports:
      - "5100:5100"
    volumes:
      - acr-data:/data

volumes:
  acr-data:
```

## Storage

Images are stored on a Docker volume (`acr-data`) that persists across container restarts. To reset:

```bash
docker compose down -v  # removes the volume
docker compose up -d    # fresh start
```
