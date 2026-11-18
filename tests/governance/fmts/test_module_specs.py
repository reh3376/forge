"""The gate: every module in the repository against its FMTS spec (BACKLOG FB-136).

Each spec under ``src/forge/governance/fmts/specs`` runs through the FMTSRunner against
this checkout. Every check must pass or be a named skip, except the failures listed
here. Each listed failure is a known gap with a backlog item, and its entry is removed
when the gap is closed:

* ``fmts:hash-approved`` on every spec the owner has not approved yet: they are
  ``pending_review``. Nobody writes that approval on the owner's behalf. ``forge-wms`` is
  approved (2026-11-18) and has no allowed failure.
* ``fmts:waivers`` on ``forge-mes``: its waiver of M-3 is a time-keeping waiver, which
  counts only with admin privileges, that is once the owner approves the spec (Q-10).
* ``forge-mes`` stays ``pending_review``: the owner approves a module spec only when the
  conformance kit has run M-4 to M-7 against the module, and the kit cannot drive the
  interim bridge, a TypeScript process (FB-155).

M-4 to M-7 are run by the conformance kit for the modules on the Python adapter template.
``NOT_RUN`` names what the kit did not check and why: M-6 where a module has no sample
events for the kit, and all four for the two modules the kit cannot drive (FB-155).
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
    # approved by the owner on 2026-11-18: no failure is allowed
    "forge-wms": frozenset(),
    "forge-cmms": frozenset(),
    "forge-integ-erp-netsuite": frozenset(),
    "forge-nms": frozenset(),
    "forge-historian": frozenset(),
    "forge-ims": frozenset(),
    "forge-scanner": frozenset(),  # its M-3 waiver counts: approved with admin privileges
    "forge-ot": frozenset(),
    "forge-mes": PENDING_APPROVAL | {"fmts:waivers"},
}
WAIVED: dict[str, dict[str, str]] = {
    "forge-mes": {
        "M-3": "FB-145",
        "M-8": "FB-057",
        "M-9": "FB-143",
        "M-10": "FB-141",
        "M-11": "FB-076",
    },
    "forge-ot": {"M-10": "FB-141", "M-11": "FB-146"},
    "forge-scanner": {"M-3": "FB-117", "M-10": "FB-141"},
}
ROLES_ONLY = {"M-10": "FB-141"}
#: Requirements the conformance kit did not check, per module. Everything else of
#: M-4 to M-7 was run against the module and passed.
NO_SAMPLE_EVENTS = frozenset({"M-6"})
NOT_RUN: dict[str, frozenset[str]] = {
    # these four have sample events for the kit, so all four requirements are checked
    "forge-wms": frozenset(),
    "forge-cmms": frozenset(),
    "forge-integ-erp-netsuite": frozenset(),
    "forge-nms": frozenset(),
    "forge-historian": frozenset(),
    "forge-ims": frozenset(),
    "forge-mes": frozenset({"M-4", "M-5", "M-6", "M-7"}),  # TypeScript, another process
    "forge-ot": frozenset(),  # off the template; driven through its own conformance.py hook
}

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
    not_run = {_check(r) for r in NOT_RUN.get(module_id, NO_SAMPLE_EVENTS) if r not in waived}
    assert by_status.get(VerdictStatus.SKIP, set()) == not_run | {_check(r) for r in waived}
    ran = {_check(r) for r in CONFORMANCE_KIT} - not_run - {_check(r) for r in waived}
    assert ran <= by_status.get(VerdictStatus.PASS, set())
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
    assert aliases["forge-integ-erp-netsuite"] == "netsuite"


def test_only_the_interim_bridge_is_not_python_from_the_template() -> None:
    templates = {m: _load(m)["scaffold"]["template"] for m in MODULE_IDS}
    assert {m for m, t in templates.items() if t == "none"} == {"forge-mes", "forge-ot"}
    kinds = {m: _load(m)["module_identity"]["kind"] for m in MODULE_IDS}
    assert kinds["forge-mes"] == "management" and kinds["forge-ot"] == "ot"
    management = {
        "forge-mes",
        "forge-wms",
        "forge-cmms",
        "forge-nms",
        "forge-historian",
        "forge-ims",
        "forge-scanner",
    }
    assert {m for m, k in kinds.items() if k == "management"} == management
    assert {m for m, k in kinds.items() if k == "integration"} == {"forge-integ-erp-netsuite"}
