"""Fixtures for the FMTS governance tests: the schema, a runner, and a small module in a
temporary repository that meets all eleven requirements."""

from __future__ import annotations

import copy
import json
import shutil
from typing import TYPE_CHECKING, Any

import pytest

from forge.governance.facts import SCHEMA_PATH as FACTS_SCHEMA_PATH
from forge.governance.fmts import REPO_ROOT, SCHEMA_PATH
from forge.governance.fmts.runners.fmts_runner import FMTSRunner
from forge.governance.shared.runner import add_spec_hash, approve_spec_hash

if TYPE_CHECKING:
    from pathlib import Path

FACTS_SPEC = FACTS_SCHEMA_PATH.parent.parent / "specs" / "forge-wms.facts.json"
ADAPTER_DIR = REPO_ROOT / "src" / "forge" / "adapters" / "forge_wms"

BACKLOG = """# Backlog

| ID | Sev | Problem | Where | Fix |
|---|---|---|---|---|
| FB-900 | Med | An open item. | `x` | Do it. |
| FB-901 | Med | **Done 2026-11-17.** A closed item. | `x` | Done. |
| FB-902 | Low | **Fixed 2026-11-17.** Another closed item. | `x` | Done. |
"""

ROLES = {
    "module_id": "forge-wms",
    "roles": [
        {"role_id": "wms-viewer", "scopes": ["wms:barrel:read", "wms:lot:read"]},
        {"role_id": "wms-operator", "scopes": ["wms:barrel:move"], "inherits": ["wms-viewer"]},
    ],
}


def sign(spec: dict[str, Any]) -> dict[str, Any]:
    """Hash the spec and approve it, as the owner would."""
    spec.pop("integrity", None)
    add_spec_hash(spec, changed_by="test")
    approve_spec_hash(spec, approved_by="reh3376")
    return spec


@pytest.fixture(scope="session")
def schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture
def runner() -> FMTSRunner:
    return FMTSRunner(schema_path=SCHEMA_PATH)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A repository holding one module: the WMS adapter's files, its approved FACTS
    spec, a roles file and a backlog."""
    module = tmp_path / "src" / "wms"
    shutil.copytree(ADAPTER_DIR, module, ignore=shutil.ignore_patterns("__pycache__"))
    (tmp_path / "specs").mkdir()
    shutil.copy(FACTS_SPEC, tmp_path / "specs" / "forge-wms.facts.json")
    (tmp_path / "specs" / "roles.json").write_text(json.dumps(ROLES), encoding="utf-8")
    (tmp_path / "BACKLOG.md").write_text(BACKLOG, encoding="utf-8")
    return tmp_path


def _base_spec() -> dict[str, Any]:
    return {
        "spec_version": "0.2.0",
        "module_identity": {
            "module_id": "forge-wms",
            "name": "Warehouse management integration",
            "alias": "wms",
            "version": "0.1.0",
            "kind": "integration",
            "language": "python",
            "source_paths": ["src/wms"],
        },
        "hub_link": {"protocol": "grpc", "service": "forge.v1.AdapterService"},
        "references": {
            "facts": {"path": "specs/forge-wms.facts.json", "adapter_id": "forge-wms"},
            "manifest": "src/wms/manifest.json",
            "roles": "specs/roles.json",
        },
        "baseline": {f"M-{n}": "met" for n in range(1, 12)},
        "waivers": [],
        "time_contract": {
            "hub": {"exchange": "four-timestamp", "fail_closed": True},
            "plant_floor_devices": "none",
            "databases": [
                {
                    "name": "forge-core",
                    "owner": "hub",
                    "engine": "PostgreSQL",
                    "access": "read-write",
                    "credential": "forge-issued",
                    "written_time_source": "module-clock",
                    "fail_closed": True,
                }
            ],
            "third_party_systems": [
                {
                    "name": "forge-wms",
                    "interface": "graphql",
                    "clock_read_method": "http-date-header",
                    "tolerance_class": "it-lan",
                    "clock_probe_interval_seconds": 30,
                    "offset_reported": True,
                    "fail_closed": True,
                }
            ],
        },
        "user_interface": {"ships_ui_code": False, "screens": False},
        "scaffold": {"template": "python-adapter"},
        "metadata": {"note": "test fixture"},
    }


@pytest.fixture
def spec() -> dict[str, Any]:
    """A signed spec that meets all eleven requirements in ``repo``."""
    return sign(_base_spec())


@pytest.fixture
def unsigned() -> dict[str, Any]:
    """The same spec without its integrity block, to mutate and then ``sign``."""
    return copy.deepcopy(_base_spec())
