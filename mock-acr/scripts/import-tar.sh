#!/usr/bin/env bash
# Import images from a `docker save` tar archive into mock ACR.
#
# Usage: ./scripts/import-tar.sh <tarfile> [mock-registry-url]
#
# Examples:
#   docker save python:3.12-slim -o python.tar
#   ./scripts/import-tar.sh python.tar
#   ./scripts/import-tar.sh python.tar http://localhost:5100
#
# This uses the mock ACR's admin /import endpoint.

set -euo pipefail

TAR_FILE="${1:?Usage: import-tar.sh <tarfile> [mock-registry-url]}"
REGISTRY_URL="${2:-http://localhost:5100}"

if [[ ! -f "$TAR_FILE" ]]; then
    echo "Error: File not found: $TAR_FILE"
    exit 1
fi

echo "Importing ${TAR_FILE} into mock ACR at ${REGISTRY_URL}..."

RESPONSE=$(curl -sf -X POST \
    -F "file=@${TAR_FILE}" \
    "${REGISTRY_URL}/admin/import")

if [[ $? -ne 0 ]]; then
    echo "Error: Import failed. Is mock ACR running at ${REGISTRY_URL}?"
    exit 1
fi

echo "$RESPONSE" | python3 -m json.tool
echo ""
echo "Import complete!"
