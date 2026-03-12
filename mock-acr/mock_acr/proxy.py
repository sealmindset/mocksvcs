"""Pull-through proxy for upstream registries (Docker Hub by default).

When a manifest or blob isn't found locally, this module fetches it from the
upstream registry and stores it in the local store for future pulls.

Uses Python's httpx which respects the system certificate store -- this means
it can fetch through Zscaler's SSL inspection where Docker's own TLS client
fails. This is the key insight that makes the proxy work.
"""

from __future__ import annotations

import logging
import ssl
from typing import TYPE_CHECKING, Any

import httpx

from mock_acr.config import settings


def _build_verify() -> bool | ssl.SSLContext:
    """Build the verify parameter for httpx based on config."""
    if settings.proxy_ca_cert:
        ctx = ssl.create_default_context(cafile=settings.proxy_ca_cert)
        return ctx
    return settings.proxy_tls_verify

if TYPE_CHECKING:
    from mock_acr.store import RegistryStore

logger = logging.getLogger("mock_acr.proxy")

# Manifest media types to request from upstream (in preference order)
ACCEPT_MANIFEST = ", ".join([
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.oci.image.index.v1+json",
    "application/json",
])


async def _get_upstream_token(client: httpx.AsyncClient, repository: str) -> str | None:
    """Get a bearer token for pulling from Docker Hub (anonymous access)."""
    try:
        resp = await client.get(
            settings.proxy_auth_url,
            params={
                "service": settings.proxy_auth_service,
                "scope": f"repository:{repository}:pull",
            },
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token") or data.get("access_token")
    except Exception as e:
        logger.warning("Failed to get upstream token for %s: %s", repository, e)
    return None


async def proxy_manifest(
    store: RegistryStore,
    repository: str,
    reference: str,
) -> tuple[bytes, str] | None:
    """Fetch a manifest from upstream, store it locally, and return it.

    Returns (manifest_bytes, content_type) or None if upstream doesn't have it.
    """
    if not settings.proxy_enabled:
        return None

    # Docker Hub library images need "library/" prefix
    upstream_repo = repository
    if "/" not in repository:
        upstream_repo = f"library/{repository}"

    logger.info("Proxying manifest: %s:%s from upstream", repository, reference)

    async with httpx.AsyncClient(verify=_build_verify()) as client:
        token = await _get_upstream_token(client, upstream_repo)
        if token is None:
            logger.warning("Could not get upstream token for %s", upstream_repo)
            return None

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": ACCEPT_MANIFEST,
        }

        try:
            url = f"{settings.proxy_upstream_url}/v2/{upstream_repo}/manifests/{reference}"
            resp = await client.get(url, headers=headers, timeout=30, follow_redirects=True)
        except Exception as e:
            logger.warning("Failed to fetch manifest %s:%s: %s", repository, reference, e)
            return None

        if resp.status_code != 200:
            logger.info("Upstream returned %d for %s:%s", resp.status_code, repository, reference)
            return None

        manifest_bytes = resp.content
        content_type = resp.headers.get(
            "content-type",
            "application/vnd.docker.distribution.manifest.v2+json",
        )

        # Handle manifest lists (multi-arch) -- resolve to the current platform
        if "manifest.list" in content_type or "image.index" in content_type:
            resolved = await _resolve_manifest_list(
                client, token, upstream_repo, manifest_bytes, content_type,
            )
            if resolved is not None:
                # Store the manifest list itself
                store.put_manifest(repository, reference, manifest_bytes, content_type)
                # Also store the resolved platform-specific manifest
                platform_bytes, platform_ct, platform_digest = resolved
                store.put_manifest(repository, reference, platform_bytes, platform_ct)
                return platform_bytes, platform_ct

        # Store locally for future pulls
        store.put_manifest(repository, reference, manifest_bytes, content_type)
        logger.info("Cached manifest: %s:%s", repository, reference)
        return manifest_bytes, content_type


async def _resolve_manifest_list(
    client: httpx.AsyncClient,
    token: str,
    upstream_repo: str,
    list_bytes: bytes,
    list_ct: str,
) -> tuple[bytes, str, str] | None:
    """Resolve a manifest list to the platform-specific manifest for linux/arm64 or linux/amd64."""
    import json
    import platform

    try:
        manifest_list = json.loads(list_bytes)
    except Exception:
        return None

    manifests = manifest_list.get("manifests", [])
    if not manifests:
        return None

    # Detect current platform
    machine = platform.machine().lower()
    if machine in ("arm64", "aarch64"):
        target_arch = "arm64"
    else:
        target_arch = "amd64"

    # Find matching platform manifest
    target_digest = None
    for m in manifests:
        p = m.get("platform", {})
        if p.get("os") == "linux" and p.get("architecture") == target_arch:
            target_digest = m["digest"]
            break

    # Fallback to first linux manifest
    if target_digest is None:
        for m in manifests:
            p = m.get("platform", {})
            if p.get("os") == "linux":
                target_digest = m["digest"]
                break

    if target_digest is None:
        return None

    # Fetch the platform-specific manifest
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": ACCEPT_MANIFEST,
    }
    try:
        url = f"{settings.proxy_upstream_url}/v2/{upstream_repo}/manifests/{target_digest}"
        resp = await client.get(url, headers=headers, timeout=30, follow_redirects=True)
        if resp.status_code == 200:
            ct = resp.headers.get("content-type", "application/vnd.docker.distribution.manifest.v2+json")
            return resp.content, ct, target_digest
    except Exception as e:
        logger.warning("Failed to resolve manifest list: %s", e)

    return None


async def proxy_blob(
    store: RegistryStore,
    repository: str,
    digest: str,
) -> bool:
    """Fetch a blob from upstream and store it locally.

    Returns True if the blob was fetched and stored, False otherwise.
    """
    if not settings.proxy_enabled:
        return False

    upstream_repo = repository
    if "/" not in repository:
        upstream_repo = f"library/{repository}"

    logger.info("Proxying blob: %s %s from upstream", repository, digest)

    async with httpx.AsyncClient(verify=_build_verify()) as client:
        token = await _get_upstream_token(client, upstream_repo)
        if token is None:
            return False

        headers = {"Authorization": f"Bearer {token}"}

        try:
            url = f"{settings.proxy_upstream_url}/v2/{upstream_repo}/blobs/{digest}"
            resp = await client.get(url, headers=headers, timeout=120, follow_redirects=True)
        except Exception as e:
            logger.warning("Failed to fetch blob %s: %s", digest, e)
            return False

        if resp.status_code != 200:
            logger.info("Upstream returned %d for blob %s", resp.status_code, digest)
            return False

        store.put_blob(digest, resp.content)
        logger.info("Cached blob: %s (%d bytes)", digest, len(resp.content))
        return True
