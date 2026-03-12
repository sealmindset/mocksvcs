#!/usr/bin/env bash
# Mirror a Docker image into the mock ACR.
#
# Usage: ./scripts/mirror-image.sh <source-image> [mock-registry]
#
# Examples:
#   ./scripts/mirror-image.sh python:3.12-slim
#   ./scripts/mirror-image.sh node:20-alpine localhost:5100
#   ./scripts/mirror-image.sh myacr.azurecr.io/platform/base:latest localhost:5100
#
# This pulls the image from the source, re-tags it for the mock registry,
# and pushes it. Requires the mock ACR to be running.

set -euo pipefail

SOURCE_IMAGE="${1:?Usage: mirror-image.sh <source-image> [mock-registry]}"
REGISTRY="${2:-localhost:5100}"

# Strip any existing registry prefix to get the image name
# e.g., "myacr.azurecr.io/platform/base:latest" -> "platform/base:latest"
# e.g., "python:3.12-slim" -> "python:3.12-slim"
IMAGE_NAME="$SOURCE_IMAGE"
if [[ "$IMAGE_NAME" == *"."*"/"* ]]; then
    # Has a registry prefix (contains a dot before the first slash)
    IMAGE_NAME="${IMAGE_NAME#*/}"
fi

# For Docker Hub library images (e.g., "python:3.12-slim"), prefix with "library/"
if [[ "$IMAGE_NAME" != *"/"* ]]; then
    TARGET="${REGISTRY}/library/${IMAGE_NAME}"
else
    TARGET="${REGISTRY}/${IMAGE_NAME}"
fi

echo "Mirroring: ${SOURCE_IMAGE} -> ${TARGET}"

echo "  Pulling ${SOURCE_IMAGE}..."
docker pull "${SOURCE_IMAGE}" --quiet

echo "  Tagging as ${TARGET}..."
docker tag "${SOURCE_IMAGE}" "${TARGET}"

echo "  Pushing to mock ACR..."
docker push "${TARGET}" --quiet

echo "  Done! Image available at: ${TARGET}"
