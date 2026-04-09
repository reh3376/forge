"""Tests for the forge.file SDK module."""

import os
import tempfile
from pathlib import Path

import pytest

from forge.sdk.scripting.modules.file import FileModule


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sandbox_dir(tmp_path):
    """Create a temporary sandbox directory with some test files."""
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "test.txt").write_text("hello world")
    (tmp_path / "data" / "config.json").write_text('{"key": "value"}')
    return tmp_path


@pytest.fixture
def fm(sandbox_dir):
    """Create a bound FileModule."""
    module = FileModule()
    module.bind(sandbox_dir)
    return module


# ---------------------------------------------------------------------------
# Binding
# ---------------------------------------------------------------------------


class TestBinding:
    """Tests for module binding."""

    def test_unbound_raises(self):
        fm = FileModule()
        with pytest.raises(RuntimeError, match="not bound"):
            fm._resolve_path("test.txt")

    def test_bind(self, sandbox_dir):
        fm = FileModule()
        fm.bind(sandbox_dir)
        assert fm._base_dir is not None


# ---------------------------------------------------------------------------
# Path validation
# ---------------------------------------------------------------------------


class TestPathValidation:
    """Tests for sandbox path validation."""

    def test_absolute_path_rejected(self, fm):
        with pytest.raises(ValueError, match="Absolute"):
            fm._resolve_path("/etc/passwd")

    def test_traversal_rejected(self, fm):
        with pytest.raises(ValueError, match="traversal"):
            fm._resolve_path("../../../etc/passwd")

    def test_relative_path_resolved(self, fm):
        resolved = fm._resolve_path("data/test.txt")
        assert resolved.exists()

    def test_windows_absolute_rejected(self, fm):
        with pytest.raises(ValueError, match="Absolute"):
            fm._resolve_path("\\windows\\system32")


# ---------------------------------------------------------------------------
# Read operations
# ---------------------------------------------------------------------------


class TestRead:
    """Tests for file read operations."""

    @pytest.mark.asyncio
    async def test_read_text(self, fm):
        content = await fm.read_text("data/test.txt")
        assert content == "hello world"

    @pytest.mark.asyncio
    async def test_read_bytes(self, fm):
        content = await fm.read_bytes("data/test.txt")
        assert content == b"hello world"

    @pytest.mark.asyncio
    async def test_read_nonexistent(self, fm):
        with pytest.raises(FileNotFoundError):
            await fm.read_text("nonexistent.txt")


# ---------------------------------------------------------------------------
# Write operations
# ---------------------------------------------------------------------------


class TestWrite:
    """Tests for file write operations."""

    @pytest.mark.asyncio
    async def test_write_text(self, fm):
        written = await fm.write_text("output.txt", "test content")
        assert written > 0
        content = await fm.read_text("output.txt")
        assert content == "test content"

    @pytest.mark.asyncio
    async def test_write_creates_dirs(self, fm):
        await fm.write_text("new/nested/dir/file.txt", "hello")
        content = await fm.read_text("new/nested/dir/file.txt")
        assert content == "hello"

    @pytest.mark.asyncio
    async def test_write_bytes(self, fm):
        await fm.write_bytes("binary.dat", b"\x00\x01\x02")
        content = await fm.read_bytes("binary.dat")
        assert content == b"\x00\x01\x02"

    @pytest.mark.asyncio
    async def test_write_too_large(self, fm):
        fm._max_file_size_mb = 0.001  # 1KB limit
        with pytest.raises(ValueError, match="too large"):
            await fm.write_text("big.txt", "x" * 2000)


# ---------------------------------------------------------------------------
# Existence and listing
# ---------------------------------------------------------------------------


class TestExistsAndList:
    """Tests for existence checks and directory listing."""

    @pytest.mark.asyncio
    async def test_exists_true(self, fm):
        assert await fm.exists("data/test.txt") is True

    @pytest.mark.asyncio
    async def test_exists_false(self, fm):
        assert await fm.exists("nonexistent.txt") is False

    @pytest.mark.asyncio
    async def test_list_dir(self, fm):
        files = await fm.list_dir("data")
        assert "test.txt" in files
        assert "config.json" in files

    @pytest.mark.asyncio
    async def test_list_dir_root(self, fm):
        files = await fm.list_dir()
        assert "data" in files

    @pytest.mark.asyncio
    async def test_list_dir_not_a_dir(self, fm):
        with pytest.raises(NotADirectoryError):
            await fm.list_dir("data/test.txt")


# ---------------------------------------------------------------------------
# Delete and size
# ---------------------------------------------------------------------------


class TestDeleteAndSize:
    """Tests for delete and size operations."""

    @pytest.mark.asyncio
    async def test_delete_existing(self, fm):
        result = await fm.delete("data/test.txt")
        assert result is True
        assert await fm.exists("data/test.txt") is False

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, fm):
        result = await fm.delete("nonexistent.txt")
        assert result is False

    @pytest.mark.asyncio
    async def test_delete_directory_rejected(self, fm):
        with pytest.raises(ValueError, match="directory"):
            await fm.delete("data")

    @pytest.mark.asyncio
    async def test_size(self, fm):
        size = await fm.size("data/test.txt")
        assert size == 11  # "hello world"

    @pytest.mark.asyncio
    async def test_size_nonexistent(self, fm):
        with pytest.raises(FileNotFoundError):
            await fm.size("nonexistent.txt")
