#!/usr/bin/env bash
# Pre-load common base images into the mock ACR.
#
# Usage: ./scripts/seed-images.sh [mock-registry]
#
# This mirrors the most commonly used base images from your projects
# into the mock ACR so they're available for local development.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REGISTRY="${1:-localhost:5100}"

echo "Seeding mock ACR at ${REGISTRY} with common base images..."
echo ""

IMAGES=(
    "python:3.12-slim"
    "node:20-alpine"
    "postgres:16-alpine"
    "redis:7-alpine"
    "nginx:alpine"
    "alpine:latest"
    "golang:1.21-alpine"
)

FAILED=0
for IMAGE in "${IMAGES[@]}"; do
    echo "--- ${IMAGE} ---"
    if bash "${SCRIPT_DIR}/mirror-image.sh" "$IMAGE" "$REGISTRY"; then
        echo ""
    else
        echo "  FAILED to mirror ${IMAGE} (skipping)"
        FAILED=$((FAILED + 1))
        echo ""
    fi
done

echo "==============================="
echo "Seeding complete!"
echo "  Mirrored: $((${#IMAGES[@]} - FAILED)) of ${#IMAGES[@]} images"
if [[ $FAILED -gt 0 ]]; then
    echo "  Failed: ${FAILED} (check if images exist and Docker daemon is running)"
fi
echo ""
echo "Verify with: curl -s http://${REGISTRY}/v2/_catalog | python3 -m json.tool"
