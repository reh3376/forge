"""The Python dependencies are locked (FB-096).

``uv.lock`` is committed and every installer (CI, the hub image, the README's quick start) runs
``uv sync --locked``, which fails when ``pyproject.toml`` and the lock disagree, so a dependency
moves only through a committed re-lock. These tests hold the lock to the manifest and the
installers to the lock without touching the network.
"""

import re
import tomllib
from pathlib import Path
from typing import Any

from packaging.requirements import Requirement

ROOT = Path(__file__).resolve().parents[1]
SYNC = "uv sync --locked"


def _pyproject() -> dict[str, Any]:
    return tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]


def _lock() -> dict[str, Any]:
    return tomllib.loads((ROOT / "uv.lock").read_text(encoding="utf-8"))


def _normalise(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _declared(project: dict[str, Any]) -> dict[tuple[str, str | None], str]:
    """``(name, extra)`` → specifier for every requirement the manifest declares."""
    groups = [(None, project["dependencies"]), *project["optional-dependencies"].items()]
    declared: dict[tuple[str, str | None], str] = {}
    for extra, specs in groups:
        for spec in specs:
            requirement = Requirement(spec)
            declared[(_normalise(requirement.name), extra)] = str(requirement.specifier)
    return declared


class TestTheLockMatchesTheManifest:
    def test_the_recorded_requirements_are_the_manifest(self):
        """uv records the manifest it resolved; ``--locked`` compares against it in CI."""
        project = _pyproject()
        (entry,) = [p for p in _lock()["package"] if p["name"] == project["name"]]
        assert entry["source"] == {"editable": "."}
        recorded: dict[tuple[str, str | None], str] = {}
        for dist in entry["metadata"]["requires-dist"]:
            marker = dist.get("marker")
            extra = None
            if marker is not None:
                match = re.fullmatch(r"extra == '(\w+)'", marker)
                assert match is not None, marker
                extra = match.group(1)
            recorded[(dist["name"], extra)] = dist.get("specifier", "")
        assert recorded == _declared(project)

    def test_requires_python_agrees(self):
        assert _lock()["requires-python"] == _pyproject()["requires-python"]

    def test_every_declared_package_is_locked(self):
        locked = {p["name"] for p in _lock()["package"]}
        assert {name for name, _ in _declared(_pyproject())} <= locked

    def test_the_exact_pins_are_the_locked_versions(self):
        """ruff and asyncua are pinned exactly in the manifest; the lock resolves to those."""
        versions = {p["name"]: p["version"] for p in _lock()["package"]}
        pins = {
            name: spec.removeprefix("==")
            for (name, _), spec in _declared(_pyproject()).items()
            if spec.startswith("==")
        }
        assert set(pins) == {"ruff", "asyncua"}
        assert {name: versions[name] for name in pins} == pins


class TestEveryInstallerReadsTheLock:
    def test_ci(self):
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        assert f"{SYNC} --extra dev --extra ot" in ci
        assert "uv pip install" not in ci

    def test_the_hub_image(self):
        dockerfile = (ROOT / "deploy" / "docker" / "Dockerfile.forge").read_text(encoding="utf-8")
        assert "COPY pyproject.toml uv.lock ./" in dockerfile
        assert f"{SYNC} --no-install-project --extra ot" in dockerfile  # dependencies first
        assert f"{SYNC} --extra ot" in dockerfile  # then the project, same extras
        assert "uv pip install" not in dockerfile
        ignored = (ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines()
        assert ignored[2:7] == ["*", "!pyproject.toml", "!uv.lock", "!README.md", "!src/"]

    def test_the_quick_start(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        assert f"{SYNC} --extra dev --extra ot" in readme
