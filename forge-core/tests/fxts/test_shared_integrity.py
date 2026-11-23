"""The two hash verdicts every framework gives (D-14, F-4; BACKLOG FB-159)."""

from __future__ import annotations

import json
from typing import Any

from forge_core.fxts import FXTS_ROOT
from forge_core.fxts.facts import SCHEMA_PATH as FACTS_SCHEMA
from forge_core.fxts.facts.runners.facts_runner import FACTSRunner
from forge_core.fxts.shared.runner import (
    FxTSRunner,
    FxTSVerdict,
    VerdictStatus,
    add_spec_hash,
    approve_spec_hash,
)

PASS, FAIL = VerdictStatus.PASS, VerdictStatus.FAIL
FACTS_SPEC = FXTS_ROOT / "facts" / "specs" / "forge-wms.facts.json"


class BareRunner(FxTSRunner):
    """A framework that writes nothing of its own about integrity."""

    framework = "FXTS"

    def implemented_fields(self) -> set[str]:
        return set()

    async def _run_checks(self, target: str, **kwargs: Any) -> list[FxTSVerdict]:
        return []


def _statuses(report: Any, prefix: str) -> dict[str, VerdictStatus]:
    return {
        v.check_id: v.status
        for v in report.verdicts
        if v.check_id in (f"{prefix}:hash-verified", f"{prefix}:hash-approved")
    }


class TestEveryFrameworkGetsThem:
    async def test_a_new_framework_gets_both_without_writing_anything(self) -> None:
        spec: dict[str, Any] = {"name": "x"}
        add_spec_hash(spec, changed_by="test")
        approve_spec_hash(spec, approved_by="owner")
        report = await BareRunner().run(target="x", spec=spec)
        assert _statuses(report, "fxts") == {"fxts:hash-verified": PASS, "fxts:hash-approved": PASS}
        assert report.passed

    async def test_a_spec_without_a_hash_fails_both(self) -> None:
        report = await BareRunner().run(target="x", spec={"name": "x"})
        assert _statuses(report, "fxts") == {"fxts:hash-verified": FAIL, "fxts:hash-approved": FAIL}
        assert not report.passed
        assert "no integrity block" in report.verdicts[0].message

    async def test_an_edited_spec_fails_its_hash(self) -> None:
        spec: dict[str, Any] = {"name": "x"}
        add_spec_hash(spec, changed_by="test")
        approve_spec_hash(spec, approved_by="owner")
        spec["name"] = "changed after approval"
        report = await BareRunner().run(target="x", spec=spec)
        assert _statuses(report, "fxts")["fxts:hash-verified"] == FAIL and not report.passed

    async def test_an_unapproved_spec_fails_approval_only(self) -> None:
        spec: dict[str, Any] = {"name": "x"}
        add_spec_hash(spec, changed_by="test")
        report = await BareRunner().run(target="x", spec=spec)
        assert _statuses(report, "fxts") == {"fxts:hash-verified": PASS, "fxts:hash-approved": FAIL}

    async def test_no_spec_no_verdicts(self) -> None:
        report = await BareRunner().run(target="x")
        assert report.verdicts == []


class TestTheFrameworksThatDidNotFail:
    async def test_facts_fails_a_spec_edited_after_approval(self) -> None:
        """Before FB-159 this was a side signal and the run could still pass."""
        spec = json.loads(FACTS_SPEC.read_text(encoding="utf-8"))
        runner = FACTSRunner(schema_path=FACTS_SCHEMA)
        clean = await runner.run(target="forge-wms", spec=spec)
        assert _statuses(clean, "facts") == {
            "facts:hash-verified": PASS,
            "facts:hash-approved": PASS,
        }
        spec["adapter_identity"]["name"] += " (edited)"
        edited = await runner.run(target="forge-wms", spec=spec)
        assert _statuses(edited, "facts")["facts:hash-verified"] == FAIL and not edited.passed
