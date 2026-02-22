#!/usr/bin/env bash
set -euo pipefail

# -------------------------------------------------------------------
# mock-cribl-shutdown.sh — Stop the Mock Cribl Stream service
# -------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SERVICE_NAME="mock-cribl"
COMPOSE_FILE="docker-compose.mock-cribl.yml"
HOST_PORT=3005

CLEAN=false

usage() {
    cat <<EOF
Usage: mock-cribl-shutdown.sh [OPTIONS]

Stop the Mock Cribl Stream service.

Options:
  --clean     Remove volumes and images
  -h, --help  Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --clean)    CLEAN=true; shift ;;
        -h|--help)  usage; exit 0 ;;
        *)
            echo "Error: Unknown option '$1'" >&2
            exit 1
            ;;
    esac
done

cd "$PROJECT_ROOT"

if [[ "$CLEAN" == true ]]; then
    echo "Stopping $SERVICE_NAME and removing volumes/images..."
    docker compose -f "$COMPOSE_FILE" down -v --rmi local --remove-orphans
else
    echo "Stopping $SERVICE_NAME..."
    docker compose -f "$COMPOSE_FILE" down --remove-orphans
fi

# ---- Clean up any leftover process on the port ----
cleanup_port() {
    local port=$1
    local pids
    pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        echo "Cleaning up leftover process on port $port..."
        for pid in $pids; do
            kill "$pid" 2>/dev/null || true
        done
        sleep 1
        for pid in $pids; do
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        done
        echo "Port cleaned up."
    fi
}

cleanup_port "$HOST_PORT"

echo ""
echo "$SERVICE_NAME stopped."
