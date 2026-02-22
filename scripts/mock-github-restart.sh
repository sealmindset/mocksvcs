#!/usr/bin/env bash
set -euo pipefail

# -------------------------------------------------------------------
# mock-github-restart.sh — Restart the Mock GitHub API service
# -------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SERVICE_NAME="mock-github"
COMPOSE_FILE="docker-compose.mock-github.yml"
HOST_PORT=3006

BUILD_MODE=""
HARD=false

usage() {
    cat <<EOF
Usage: mock-github-restart.sh [OPTIONS]

Restart the Mock GitHub API service.

Options:
  --build     Rebuild image before restarting
  --hard      Full stop + start (docker compose down + up)
  -h, --help  Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --build)    BUILD_MODE="build"; shift ;;
        --hard)     HARD=true; shift ;;
        -h|--help)  usage; exit 0 ;;
        *)
            echo "Error: Unknown option '$1'" >&2
            exit 1
            ;;
    esac
done

cd "$PROJECT_ROOT"

if [[ "$HARD" == true ]]; then
    echo "Performing hard restart (full teardown and start)..."
    docker compose -f "$COMPOSE_FILE" down --remove-orphans
    echo ""
    START_ARGS="-d"
    if [[ "$BUILD_MODE" == "build" ]]; then
        START_ARGS="$START_ARGS --build"
    fi
    exec "$SCRIPT_DIR/mock-github-start.sh" $START_ARGS
fi

# ---- Soft restart ----
if [[ "$BUILD_MODE" == "build" ]]; then
    echo "Stopping $SERVICE_NAME..."
    docker compose -f "$COMPOSE_FILE" stop "$SERVICE_NAME"
    echo "Rebuilding image..."
    docker compose -f "$COMPOSE_FILE" build "$SERVICE_NAME"
    echo "Starting $SERVICE_NAME..."
    docker compose -f "$COMPOSE_FILE" up -d "$SERVICE_NAME"
else
    echo "Restarting $SERVICE_NAME..."
    docker compose -f "$COMPOSE_FILE" restart "$SERVICE_NAME"
fi

echo ""
echo "Restart complete. http://localhost:$HOST_PORT"
