#!/usr/bin/env bash
set -euo pipefail

# -------------------------------------------------------------------
# mock-github-start.sh — Start the Mock GitHub API service
# -------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SERVICE_NAME="mock-github"
COMPOSE_FILE="docker-compose.mock-github.yml"
HOST_PORT=3006
CONTAINER_PORT=8090
HEALTH_URL="http://localhost:${HOST_PORT}/rate_limit"

# Defaults
DETACH=""
BUILD_MODE=""
CHECK_PORTS=true

usage() {
    cat <<EOF
Usage: mock-github-start.sh [OPTIONS]

Start the Mock GitHub API service via Docker Compose.

Options:
  --build            Build image before starting
  --rebuild          Force full rebuild with no cache
  -d, --detach       Run in detached mode (background)
  --no-check-ports   Skip port conflict check
  -h, --help         Show this help message

Examples:
  scripts/mock-github-start.sh -d          # Start in background
  scripts/mock-github-start.sh --build -d  # Rebuild and start
EOF
}

# ---- Parse arguments ----
while [[ $# -gt 0 ]]; do
    case "$1" in
        --build)        BUILD_MODE="build"; shift ;;
        --rebuild)      BUILD_MODE="rebuild"; shift ;;
        -d|--detach)    DETACH="-d"; shift ;;
        --no-check-ports) CHECK_PORTS=false; shift ;;
        -h|--help)      usage; exit 0 ;;
        *)
            echo "Error: Unknown option '$1'" >&2
            echo "Run 'mock-github-start.sh --help' for usage." >&2
            exit 1
            ;;
    esac
done

cd "$PROJECT_ROOT"

# ---- Kill conflicting processes on the port ----
kill_port_process() {
    local port=$1
    local pids
    pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    if [[ -z "$pids" ]]; then
        return 0
    fi
    for pid in $pids; do
        local pname
        pname=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
        echo "  Killing PID $pid ($pname) on port $port"
        kill "$pid" 2>/dev/null || true
    done
    sleep 1
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "  Force killing PID $pid on port $port"
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
}

# ---- Stop existing instance if running ----
if docker compose -f "$COMPOSE_FILE" ps -q "$SERVICE_NAME" 2>/dev/null | grep -q .; then
    echo "$SERVICE_NAME is already running. Stopping existing container..."
    docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true
    echo "Existing container stopped."
    echo ""
fi

# ---- Port conflict check ----
if [[ "$CHECK_PORTS" == true ]]; then
    if lsof -iTCP:"$HOST_PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "Clearing port conflict on $HOST_PORT..."
        kill_port_process "$HOST_PORT"
        echo "Port cleared."
        echo ""
    fi
fi

# ---- Build if requested ----
if [[ "$BUILD_MODE" == "build" ]]; then
    echo "Building image..."
    docker compose -f "$COMPOSE_FILE" build "$SERVICE_NAME"
elif [[ "$BUILD_MODE" == "rebuild" ]]; then
    echo "Rebuilding image (no cache)..."
    docker compose -f "$COMPOSE_FILE" build --no-cache "$SERVICE_NAME"
fi

# ---- Start service ----
echo "Starting $SERVICE_NAME on port $HOST_PORT..."
docker compose -f "$COMPOSE_FILE" up $DETACH "$SERVICE_NAME"

# ---- Summary (detached mode only) ----
if [[ -n "$DETACH" ]]; then
    echo ""
    echo "$SERVICE_NAME started."
    echo "  URL:     http://localhost:$HOST_PORT"
    echo "  Health:  $HEALTH_URL"
    echo "  Logs:    docker compose -f $COMPOSE_FILE logs -f"
fi
