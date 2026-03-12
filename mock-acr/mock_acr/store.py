"""Filesystem-backed storage for Docker Registry V2 blobs and manifests."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import threading
import uuid
from pathlib import Path
from typing import Any


class RegistryStore:
    """Thread-safe filesystem store for OCI/Docker registry data.

    Directory layout under data_dir:
        blobs/sha256/{digest}           -- raw blob content
        manifests/{repo}/{reference}    -- manifest JSON (tag or digest)
        uploads/{uuid}                  -- in-progress blob uploads
    """

    def __init__(self, data_dir: str) -> None:
        self._root = Path(data_dir)
        self._lock = threading.Lock()
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        (self._root / "blobs" / "sha256").mkdir(parents=True, exist_ok=True)
        (self._root / "manifests").mkdir(parents=True, exist_ok=True)
        (self._root / "uploads").mkdir(parents=True, exist_ok=True)

    # ---- Blobs ----

    def blob_path(self, digest: str) -> Path:
        algo, hex_hash = digest.split(":", 1)
        return self._root / "blobs" / algo / hex_hash

    def has_blob(self, digest: str) -> bool:
        return self.blob_path(digest).exists()

    def get_blob(self, digest: str) -> Path | None:
        p = self.blob_path(digest)
        return p if p.exists() else None

    def blob_size(self, digest: str) -> int:
        p = self.blob_path(digest)
        return p.stat().st_size if p.exists() else 0

    def put_blob(self, digest: str, data: bytes) -> None:
        p = self.blob_path(digest)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def delete_blob(self, digest: str) -> bool:
        p = self.blob_path(digest)
        if p.exists():
            p.unlink()
            return True
        return False

    # ---- Uploads (chunked blob uploads) ----

    def create_upload(self) -> str:
        upload_id = uuid.uuid4().hex
        upload_path = self._root / "uploads" / upload_id
        upload_path.write_bytes(b"")
        return upload_id

    def get_upload_path(self, upload_id: str) -> Path | None:
        p = self._root / "uploads" / upload_id
        return p if p.exists() else None

    def append_upload(self, upload_id: str, data: bytes) -> int:
        p = self._root / "uploads" / upload_id
        if not p.exists():
            return -1
        with self._lock:
            with open(p, "ab") as f:
                f.write(data)
            return p.stat().st_size

    def complete_upload(self, upload_id: str, expected_digest: str) -> str | None:
        """Finalize upload: verify digest, move to blobs. Returns digest or None."""
        p = self._root / "uploads" / upload_id
        if not p.exists():
            return None

        data = p.read_bytes()
        actual_digest = "sha256:" + hashlib.sha256(data).hexdigest()

        if expected_digest and expected_digest != actual_digest:
            return None

        self.put_blob(actual_digest, data)
        p.unlink()
        return actual_digest

    def cancel_upload(self, upload_id: str) -> bool:
        p = self._root / "uploads" / upload_id
        if p.exists():
            p.unlink()
            return True
        return False

    # ---- Manifests ----

    def _manifest_dir(self, repository: str) -> Path:
        return self._root / "manifests" / repository

    def _manifest_path(self, repository: str, reference: str) -> Path:
        safe_ref = reference.replace(":", "_")
        return self._manifest_dir(repository) / safe_ref

    def has_manifest(self, repository: str, reference: str) -> bool:
        return self._manifest_path(repository, reference).exists()

    def get_manifest(self, repository: str, reference: str) -> tuple[bytes, str] | None:
        """Returns (manifest_bytes, content_type) or None."""
        p = self._manifest_path(repository, reference)
        if not p.exists():
            return None
        meta_path = Path(str(p) + ".meta")
        content_type = "application/vnd.docker.distribution.manifest.v2+json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text())
            content_type = meta.get("content_type", content_type)
        return p.read_bytes(), content_type

    def put_manifest(self, repository: str, reference: str, data: bytes, content_type: str) -> str:
        """Store manifest. Returns its digest."""
        digest = "sha256:" + hashlib.sha256(data).hexdigest()

        d = self._manifest_dir(repository)
        d.mkdir(parents=True, exist_ok=True)

        # Store by tag reference
        p = self._manifest_path(repository, reference)
        p.write_bytes(data)
        Path(str(p) + ".meta").write_text(json.dumps({"content_type": content_type}))

        # Also store by digest so pull-by-digest works
        digest_path = self._manifest_path(repository, digest)
        if not digest_path.exists():
            digest_path.write_bytes(data)
            Path(str(digest_path) + ".meta").write_text(json.dumps({"content_type": content_type}))

        # Also store manifest content as a blob (some clients expect this)
        self.put_blob(digest, data)

        return digest

    def delete_manifest(self, repository: str, reference: str) -> bool:
        p = self._manifest_path(repository, reference)
        if p.exists():
            p.unlink()
            meta = Path(str(p) + ".meta")
            if meta.exists():
                meta.unlink()
            return True
        return False

    def manifest_digest(self, repository: str, reference: str) -> str | None:
        p = self._manifest_path(repository, reference)
        if not p.exists():
            return None
        data = p.read_bytes()
        return "sha256:" + hashlib.sha256(data).hexdigest()

    # ---- Catalog & Tags ----

    def list_repositories(self) -> list[str]:
        manifest_root = self._root / "manifests"
        repos: list[str] = []
        if not manifest_root.exists():
            return repos
        for dirpath, dirnames, filenames in os.walk(manifest_root):
            manifest_files = [f for f in filenames if not f.endswith(".meta")]
            if manifest_files:
                rel = os.path.relpath(dirpath, manifest_root)
                repos.append(rel)
        return sorted(set(repos))

    def list_tags(self, repository: str) -> list[str]:
        d = self._manifest_dir(repository)
        if not d.exists():
            return []
        tags: list[str] = []
        for f in d.iterdir():
            if f.is_file() and not f.name.endswith(".meta") and not f.name.startswith("sha256_"):
                tags.append(f.name)
        return sorted(tags)

    # ---- Stats ----

    def stats(self) -> dict[str, Any]:
        repos = self.list_repositories()
        blob_dir = self._root / "blobs" / "sha256"
        blob_count = len(list(blob_dir.iterdir())) if blob_dir.exists() else 0
        total_tags = sum(len(self.list_tags(r)) for r in repos)
        return {
            "repositories": len(repos),
            "tags": total_tags,
            "blobs": blob_count,
        }

    # ---- Import from Docker save tar ----

    def import_tar(self, tar_path: str) -> list[dict[str, Any]]:
        """Import images from a `docker save` tar archive.

        Returns list of imported images [{repository, tag, digest}].
        """
        import gzip
        import io
        import tarfile

        imported: list[dict[str, Any]] = []

        with tarfile.open(tar_path, "r") as tar:
            # Read manifest.json from the tar
            manifest_member = tar.getmember("manifest.json")
            manifest_data = tar.extractfile(manifest_member)
            if manifest_data is None:
                return imported
            tar_manifest = json.loads(manifest_data.read())

            for entry in tar_manifest:
                config_file = entry["Config"]
                repo_tags = entry.get("RepoTags", [])
                layers = entry["Layers"]

                # Store config blob
                config_member = tar.extractfile(config_file)
                if config_member is None:
                    continue
                config_bytes = config_member.read()
                config_digest = "sha256:" + hashlib.sha256(config_bytes).hexdigest()
                self.put_blob(config_digest, config_bytes)

                # Store layer blobs (gzip if not already)
                layer_descriptors: list[dict[str, Any]] = []
                for layer_file in layers:
                    layer_member = tar.extractfile(layer_file)
                    if layer_member is None:
                        continue
                    layer_bytes = layer_member.read()

                    # Gzip the layer if it's not already gzipped
                    if layer_bytes[:2] != b"\x1f\x8b":
                        buf = io.BytesIO()
                        with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
                            gz.write(layer_bytes)
                        layer_bytes = buf.getvalue()

                    layer_digest = "sha256:" + hashlib.sha256(layer_bytes).hexdigest()
                    self.put_blob(layer_digest, layer_bytes)
                    layer_descriptors.append({
                        "mediaType": "application/vnd.docker.image.rootfs.diff.tar.gzip",
                        "size": len(layer_bytes),
                        "digest": layer_digest,
                    })

                # Build a Docker manifest v2
                manifest = {
                    "schemaVersion": 2,
                    "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
                    "config": {
                        "mediaType": "application/vnd.docker.container.image.v1+json",
                        "size": len(config_bytes),
                        "digest": config_digest,
                    },
                    "layers": layer_descriptors,
                }
                manifest_bytes = json.dumps(manifest, indent=2).encode()
                content_type = "application/vnd.docker.distribution.manifest.v2+json"

                for repo_tag in repo_tags:
                    if ":" in repo_tag:
                        repository, tag = repo_tag.rsplit(":", 1)
                    else:
                        repository = repo_tag
                        tag = "latest"

                    # Strip registry prefix if present (e.g., localhost:5100/myimage -> myimage)
                    if "/" in repository:
                        parts = repository.split("/", 1)
                        # If first part looks like a registry (has a dot or colon), strip it
                        if "." in parts[0] or ":" in parts[0]:
                            repository = parts[1]

                    digest = self.put_manifest(repository, tag, manifest_bytes, content_type)
                    imported.append({
                        "repository": repository,
                        "tag": tag,
                        "digest": digest,
                    })

        return imported
