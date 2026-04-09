"""forge.file — Sandboxed file I/O SDK module.

Replaces Ignition's ``system.file.*`` functions with sandboxed file
operations restricted to configured directories.

Scripts can only read/write files within an explicitly configured
base directory (the module's ``data/`` directory by default).  This
prevents scripts from accessing arbitrary filesystem paths.

Usage in scripts::

    import forge

    content = await forge.file.read_text("reports/daily.csv")
    await forge.file.write_text("exports/summary.txt", content)
    exists = await forge.file.exists("config/params.json")
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("forge.file")


# ---------------------------------------------------------------------------
# FileModule
# ---------------------------------------------------------------------------


class FileModule:
    """The forge.file SDK module — sandboxed file I/O.

    All paths are relative to the configured base directory.
    Absolute paths and path traversal (``../``) are rejected.
    """

    def __init__(self) -> None:
        self._base_dir: Path | None = None
        self._max_file_size_mb: float = 50.0

    def bind(self, base_dir: str | Path, max_file_size_mb: float = 50.0) -> None:
        """Bind to a base directory for file operations.

        Args:
            base_dir: Root directory for script file access.
            max_file_size_mb: Maximum file size in MB for write operations.
        """
        self._base_dir = Path(base_dir).resolve()
        self._max_file_size_mb = max_file_size_mb
        logger.debug("forge.file bound to %s (max %sMB)", self._base_dir, max_file_size_mb)

    def _check_bound(self) -> None:
        if self._base_dir is None:
            raise RuntimeError(
                "forge.file is not bound to a base directory. "
                "This module can only be used inside a running ScriptEngine."
            )

    def _resolve_path(self, relative_path: str) -> Path:
        """Resolve and validate a relative path within the sandbox.

        Raises:
            ValueError: If the path escapes the sandbox.
        """
        self._check_bound()
        assert self._base_dir is not None

        # Reject absolute paths
        if relative_path.startswith("/") or relative_path.startswith("\\"):
            raise ValueError(f"Absolute paths are not allowed: {relative_path!r}")

        # Reject path traversal
        if ".." in relative_path:
            raise ValueError(f"Path traversal is not allowed: {relative_path!r}")

        resolved = (self._base_dir / relative_path).resolve()

        # Ensure the resolved path is still under base_dir
        if not str(resolved).startswith(str(self._base_dir)):
            raise ValueError(
                f"Path escapes the sandbox: {relative_path!r} "
                f"resolves to {resolved}, outside {self._base_dir}"
            )

        return resolved

    async def read_text(self, path: str, encoding: str = "utf-8") -> str:
        """Read a file as text.

        Args:
            path: Relative path within the file sandbox.
            encoding: File encoding (default UTF-8).

        Returns:
            File contents as a string.

        Replaces: ``system.file.readFileAsString(filepath)``
        """
        resolved = self._resolve_path(path)
        if not resolved.exists():
            raise FileNotFoundError(f"File not found: {path!r}")
        return resolved.read_text(encoding=encoding)

    async def read_bytes(self, path: str) -> bytes:
        """Read a file as bytes.

        Replaces: ``system.file.readFileAsBytes(filepath)``
        """
        resolved = self._resolve_path(path)
        if not resolved.exists():
            raise FileNotFoundError(f"File not found: {path!r}")
        return resolved.read_bytes()

    async def write_text(self, path: str, content: str, encoding: str = "utf-8") -> int:
        """Write text to a file.

        Creates parent directories if they don't exist.

        Args:
            path: Relative path within the file sandbox.
            content: Text content to write.
            encoding: File encoding.

        Returns:
            Number of bytes written.

        Replaces: ``system.file.writeFile(filepath, data)``
        """
        resolved = self._resolve_path(path)
        encoded = content.encode(encoding)

        # Check size limit
        size_mb = len(encoded) / (1024 * 1024)
        if size_mb > self._max_file_size_mb:
            raise ValueError(
                f"File too large: {size_mb:.1f}MB exceeds limit of {self._max_file_size_mb}MB"
            )

        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_bytes(encoded)
        return len(encoded)

    async def write_bytes(self, path: str, content: bytes) -> int:
        """Write bytes to a file.

        Returns:
            Number of bytes written.
        """
        resolved = self._resolve_path(path)

        size_mb = len(content) / (1024 * 1024)
        if size_mb > self._max_file_size_mb:
            raise ValueError(
                f"File too large: {size_mb:.1f}MB exceeds limit of {self._max_file_size_mb}MB"
            )

        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_bytes(content)
        return len(content)

    async def exists(self, path: str) -> bool:
        """Check if a file exists.

        Replaces: ``system.file.fileExists(filepath)``
        """
        resolved = self._resolve_path(path)
        return resolved.exists()

    async def list_dir(self, path: str = "") -> list[str]:
        """List files and directories at a path.

        Returns:
            List of names (not full paths).
        """
        resolved = self._resolve_path(path) if path else self._base_dir
        assert resolved is not None
        if not resolved.is_dir():
            raise NotADirectoryError(f"Not a directory: {path!r}")
        return sorted(item.name for item in resolved.iterdir())

    async def delete(self, path: str) -> bool:
        """Delete a file.

        Returns:
            True if the file was deleted, False if it didn't exist.
        """
        resolved = self._resolve_path(path)
        if not resolved.exists():
            return False
        if resolved.is_dir():
            raise ValueError(f"Cannot delete directory: {path!r}")
        resolved.unlink()
        return True

    async def size(self, path: str) -> int:
        """Get the size of a file in bytes."""
        resolved = self._resolve_path(path)
        if not resolved.exists():
            raise FileNotFoundError(f"File not found: {path!r}")
        return resolved.stat().st_size


# Module-level singleton
_instance = FileModule()

read_text = _instance.read_text
read_bytes = _instance.read_bytes
write_text = _instance.write_text
write_bytes = _instance.write_bytes
exists = _instance.exists
list_dir = _instance.list_dir
delete = _instance.delete
size = _instance.size
bind = _instance.bind
