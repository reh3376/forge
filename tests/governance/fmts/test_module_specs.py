"""The gate: every module in the repository against its FMTS spec (BACKLOG FB-136).

Each spec under ``src/forge/governance/fmts/specs`` runs through the FMTSRunner against
this checkout. Every check must pass or be a named skip, except the failures listed
here. Each listed failure is a known gap with a backlog item, and its entry is removed
when the gap is closed:

* ``fmts:hash-approved`` on every spec: the specs are ``pending_review`` until the owner
  approves each hash. Nobody writes that approval on the owner's behalf.
* ``fmts:waivers`` on ``forge-mes``: its waiver of M-3 is a time-keeping waiver, which
  counts only with admin privileges, that is once the owner approves the spec (Q-10).
* ``fmts:m2`` on ``ot-module``: the OT module's manifests disagree with its approved
  FACTS spec (FB-144).
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from forge.governance.facts import SCHEMA_PATH as FACTS_SCHEMA_PATH
from forge.governance.fmts import REPO_ROOT, SPECS_DIR
from forge.governance.fmts.runners.fmts_runner import CONFORMANCE_KIT, FMTSRunner, load_backlog
from forge.governance.shared.runner import VerdictStatus

FACTS_SPECS_DIR = FACTS_SCHEMA_PATH.parent.parent / "specs"

PENDING_APPROVAL = frozenset({"fmts:hash-approved"})
ALLOWED_FAILURES: dict[str, frozenset[str]] = {
    "forge-mes": PENDING_APPROVAL | {"fmts:waivers"},
    "ot-module": PENDING_APPROVAL | {"fmts:m2"},
}
WAIVED: dict[str, dict[str, str]] = {
    "forge-mes": {
        "M-3": "FB-145",
        "M-8": "FB-057",
        "M-9": "FB-143",
        "M-10": "FB-141",
        "M-11": "FB-076",
    },
    "ot-module": {"M-10": "FB-141", "M-11": "FB-146"},
}
ROLES_ONLY = {"M-10": "FB-141"}

SPEC_FILES = sorted(SPECS_DIR.glob("*.fmts.json"))
MODULE_IDS = [path.name.removesuffix(".fmts.json") for path in SPEC_FILES]


def _load(module_id: str) -> dict[str, Any]:
    return json.loads((SPECS_DIR / f"{module_id}.fmts.json").read_text(encoding="utf-8"))


def _check(requirement: str) -> str:
    return f"fmts:{requirement.lower().replace('-', '')}"


def test_every_facts_spec_has_a_module_spec() -> None:
    adapters = sorted(
        json.loads(path.read_text(encoding="utf-8"))["adapter_identity"]["adapter_id"]
        for path in FACTS_SPECS_DIR.glob("*.facts.json")
    )
    assert adapters == MODULE_IDS
    assert len(MODULE_IDS) == 9


@pytest.mark.parametrize("module_id", MODULE_IDS)
async def test_module_meets_its_spec(runner: FMTSRunner, module_id: str) -> None:
    spec = _load(module_id)
    assert spec["module_identity"]["module_id"] == module_id
    report = await runner.run(target=module_id, spec=spec)
    by_status: dict[VerdictStatus, set[str]] = {}
    for verdict in report.verdicts:
        by_status.setdefault(verdict.status, set()).add(verdict.check_id)

    assert report.total == 19 and report.hash_verified is True
    assert by_status.get(VerdictStatus.NOT_IMPLEMENTED, set()) == set()  # schema-runner parity
    assert by_status.get(VerdictStatus.ERROR, set()) == set()
    assert by_status.get(VerdictStatus.FAIL, set()) == ALLOWED_FAILURES.get(
        module_id, PENDING_APPROVAL
    )

    waived = WAIVED.get(module_id, ROLES_ONLY)
    unverified = {_check(r) for r in CONFORMANCE_KIT if r not in waived}
    assert by_status.get(VerdictStatus.SKIP, set()) == unverified | {_check(r) for r in waived}
    assert {w["requirement"]: w["backlog_item"] for w in spec["waivers"]} == waived


@pytest.mark.parametrize("module_id", MODULE_IDS)
def test_every_waiver_names_an_open_backlog_item(module_id: str) -> None:
    backlog = load_backlog(REPO_ROOT)
    for waiver in _load(module_id)["waivers"]:
        assert backlog.get(waiver["backlog_item"]) is True, waiver


def test_every_module_has_an_alias_of_its_own() -> None:
    aliases = {m: _load(m)["module_identity"]["alias"] for m in MODULE_IDS}
    assert len(set(aliases.values())) == len(MODULE_IDS), aliases
    assert not set(aliases.values()) & set(MODULE_IDS)  # an alias is never another module's id
    assert aliases["forge-wms"] == "wms" and aliases["forge-mes"] == "mes"
    assert aliases["forge-erpi"] == "erpi"


def test_only_the_interim_bridge_is_not_python_from_the_template() -> None:
    templates = {m: _load(m)["scaffold"]["template"] for m in MODULE_IDS}
    assert {m for m, t in templates.items() if t == "none"} == {"forge-mes", "ot-module"}
    kinds = {m: _load(m)["module_identity"]["kind"] for m in MODULE_IDS}
    assert kinds["forge-mes"] == "management" and kinds["ot-module"] == "ot"
    management = {"forge-mes", "forge-wms", "forge-cmms", "forge-erpi", "forge-nms"}
    assert {m for m, k in kinds.items() if k == "management"} == management
    assert {m for m, k in kinds.items() if k == "integration"} == {
        "bosc-ims",
        "next-trend",
        "scanner-gateway",
    }
