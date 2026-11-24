"""Every module in the repository against its FMTS spec (BACKLOG FB-136).

Each module's spec (``forge-modules/<module>/fxts/fmts``) runs through the FMTSRunner
against this checkout. A check may fail or not run only where an accepted gap that the
owner approved says so (``forge-core/fxts/accepted-gaps.json``, read through
``forge_hub.cli.governance.accepted_checks``; FB-266). A waived requirement is read from
the spec itself, which the owner approved: changing a waiver changes the spec's hash.

M-4 to M-7 are run by the conformance kit for the modules on the Python adapter template.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from forge_core.fxts import locations
from forge_core.fxts.fmts import REPO_ROOT
from forge_core.fxts.fmts.runners.fmts_runner import CONFORMANCE_KIT, FMTSRunner, load_backlog
from forge_core.fxts.shared.runner import RunOutcome, VerdictStatus
from forge_hub.cli import governance as governance_cli

NOT_APPLICABLE: dict[str, set[str]] = {"forge-ot": {"M-16"}, "forge-mes": {"M-15"}}
NO_DOWNWARD_WRITES = {"M-15", "M-16"}
SPEC_FILES = locations.spec_files("fmts", "*.fmts.json")
MODULE_IDS = [path.name.removesuffix(".fmts.json") for path in SPEC_FILES]


def _load(module_id: str) -> dict[str, Any]:
    return json.loads(
        locations.spec_path("fmts", f"{module_id}.fmts.json").read_text(encoding="utf-8")
    )


def _check(requirement: str) -> str:
    return f"fmts:{requirement.lower().replace('-', '')}"


def test_every_facts_spec_has_a_module_spec() -> None:
    adapters = sorted(
        json.loads(path.read_text(encoding="utf-8"))["adapter_identity"]["adapter_id"]
        for path in locations.spec_files("facts", "*.facts.json")
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

    assert report.total == 29 and report.hash_verified is True
    assert by_status.get(VerdictStatus.NOT_IMPLEMENTED, set()) == set()  # schema-runner parity
    assert by_status.get(VerdictStatus.ERROR, set()) == set()
    name = f"{module_id}.fmts.json"
    failed = by_status.get(VerdictStatus.FAIL, set())
    not_run = by_status.get(VerdictStatus.NOT_RUN, set())
    assert failed == governance_cli.accepted_checks("fmts", name, "FAIL"), failed
    assert not_run == governance_cli.accepted_checks("fmts", name, "NOT_RUN"), not_run
    waived = {_check(w["requirement"]) for w in spec["waivers"]}
    assert by_status.get(VerdictStatus.WAIVED, set()) == waived
    # Every module waives something, so no module's run passes: it is incomplete, or it
    # fails. That is the true state of the nine today (D-14 F-7, FB-265, FB-272).
    assert waived and not report.passed
    assert report.outcome is (RunOutcome.FAIL if failed else RunOutcome.INCOMPLETE)
    ran = {_check(r) for r in CONFORMANCE_KIT} - not_run - waived
    assert ran <= by_status.get(VerdictStatus.PASS, set())
    not_bound = {r for r, claim in spec["baseline"].items() if claim == "not_applicable"}
    assert not_bound == NOT_APPLICABLE.get(module_id, NO_DOWNWARD_WRITES)
    assert {_check(r) for r in not_bound} <= by_status.get(VerdictStatus.PASS, set())


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
