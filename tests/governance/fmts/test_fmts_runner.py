"""FMTSRunner: parity, a module that meets every requirement, and each way of failing one."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from forge.governance.fmts import SCHEMA_PATH
from forge.governance.fmts.runners.fmts_runner import (
    ADMIN_WAIVABLE,
    CONFORMANCE_KIT,
    REQUIREMENTS,
    FMTSRunner,
    load_backlog,
)
from forge.governance.shared.runner import VerdictStatus, check_schema_runner_parity
from tests.governance.fmts.conftest import sign

if TYPE_CHECKING:
    from pathlib import Path

    from forge.governance.shared.runner import FxTSReport, FxTSVerdict

PASS, FAIL, SKIP = VerdictStatus.PASS, VerdictStatus.FAIL, VerdictStatus.SKIP
REASON = "The interim bridge keeps this until its replacement exists."


async def _run(runner: FMTSRunner, spec: dict, repo: Path, **kwargs: Any) -> FxTSReport:
    return await runner.run(target="forge-wms", spec=spec, repo_root=repo, **kwargs)


def _by_id(report: FxTSReport) -> dict[str, FxTSVerdict]:
    return {v.check_id: v for v in report.verdicts}


def _messages(verdict: FxTSVerdict) -> str:
    return " | ".join(v.message for v in verdict.violations)


async def _one(runner: FMTSRunner, spec: dict, repo: Path, check: str) -> FxTSVerdict:
    return _by_id(await _run(runner, sign(spec), repo))[f"fmts:{check}"]


def _waive(spec: dict, requirement: str, item: str = "FB-900") -> None:
    spec["baseline"][requirement] = "waived"
    spec["waivers"].append({"requirement": requirement, "reason": REASON, "backlog_item": item})


class TestParity:
    def test_enforced_fields_equal_the_schema(self, runner: FMTSRunner, schema: dict) -> None:
        wanted = set(schema["properties"]) | {
            f"$.{field}"
            for definition in schema["$defs"].values()
            for field in definition.get("properties", {})
        }
        assert runner.implemented_fields() == wanted
        assert check_schema_runner_parity(schema, runner.implemented_fields()) == []

    async def test_no_spec_is_an_error(self, runner: FMTSRunner) -> None:
        report = await runner.run(target="nothing")
        assert [(v.check_id, v.status) for v in report.verdicts] == [
            ("fmts:spec-load", VerdictStatus.ERROR)
        ]
        assert not report.passed


class TestAModuleThatMeetsTheBaseline:
    async def test_every_static_requirement_passes(self, runner, spec, repo) -> None:
        report = await _run(runner, spec, repo)
        verdicts = _by_id(report)
        assert report.passed and report.hash_verified is True and report.framework == "FMTS"
        assert report.total == 29
        for requirement in ("m1", "m2", "m3", "m8", "m9", "m10", "m11"):
            assert verdicts[f"fmts:{requirement}"].status == PASS, verdicts[f"fmts:{requirement}"]
        for check in (
            "schema-valid",
            "identity-match",
            "hash-verified",
            "hash-approved",
            "enum-parity",
            "source-paths",
            "waivers",
            "metadata",
        ):
            assert verdicts[f"fmts:{check}"].status == PASS, verdicts[f"fmts:{check}"]

    async def test_a_module_the_kit_cannot_drive_is_reported_as_not_checked(
        self, runner, spec, repo
    ) -> None:
        """The fixture module lives outside ``src/forge``, so the kit cannot import it."""
        verdicts = _by_id(await _run(runner, spec, repo))
        assert CONFORMANCE_KIT == ("M-4", "M-5", "M-6", "M-7")
        for requirement in ("m4", "m5", "m6", "m7"):
            verdict = verdicts[f"fmts:{requirement}"]
            assert verdict.status == SKIP
            assert "NOT CHECKED" in verdict.message and "FB-155" in verdict.message
            assert "not in an importable Forge package" in verdict.message
            assert verdict.evidence == {"waived": False, "unverified": True, "blocked_on": "FB-155"}

    async def test_a_runner_handed_no_kit_says_so(self, spec, repo) -> None:
        """The kit belongs to the hub and is handed in (D-17, S-1); without it nothing is
        claimed: the four requirements are not checked, with the reason."""
        verdicts = _by_id(await _run(FMTSRunner(schema_path=SCHEMA_PATH), spec, repo))
        for requirement in ("m4", "m5", "m6", "m7"):
            verdict = verdicts[f"fmts:{requirement}"]
            assert verdict.status == SKIP
            assert "no conformance kit was handed to this runner" in verdict.message

    async def test_a_module_off_the_python_template_is_reported_as_not_checked(
        self, runner, unsigned, repo
    ) -> None:
        unsigned["scaffold"]["template"] = "none"
        _waive(unsigned, "M-11")
        verdict = await _one(runner, unsigned, repo, "m4")
        assert verdict.status == SKIP and "not on the python-adapter template" in verdict.message

    async def test_one_verdict_per_requirement(self, runner, spec, repo) -> None:
        verdicts = _by_id(await _run(runner, spec, repo))
        assert [f"fmts:m{n}" for n in range(1, 17)] == [
            f"fmts:{r.lower().replace('-', '')}" for r in REQUIREMENTS
        ]
        assert all(f"fmts:m{n}" in verdicts for n in range(1, 17))


class TestTheTransportRequirements:
    """M-12 to M-16: the D-12 amendment of 2026-11-19 (FB-165)."""

    async def test_a_claim_of_met_is_reported_as_not_checked(self, runner, spec, repo) -> None:
        verdicts = _by_id(await _run(runner, spec, repo))
        for check in ("m12", "m13", "m14"):
            verdict = verdicts[f"fmts:{check}"]
            assert verdict.status == SKIP and verdict.message.startswith("NOT CHECKED")
            assert verdict.evidence["blocked_on"] == "FB-164"

    async def test_a_module_with_no_downward_writes_is_not_bound(self, runner, spec, repo) -> None:
        verdicts = _by_id(await _run(runner, spec, repo))
        assert verdicts["fmts:transport"].status == PASS
        for check in ("m15", "m16"):
            assert verdicts[f"fmts:{check}"].status == PASS
            assert verdicts[f"fmts:{check}"].evidence == {"not_applicable": True}

    async def test_not_applicable_must_be_true(self, runner, unsigned, repo) -> None:
        unsigned["transport"]["process_control_writes"] = True
        verdict = await _one(runner, unsigned, repo, "m15")
        assert verdict.status == FAIL and "is required" in _messages(verdict)

    async def test_a_module_not_bound_claims_not_applicable(self, runner, unsigned, repo) -> None:
        unsigned["baseline"]["M-16"] = "met"
        verdict = await _one(runner, unsigned, repo, "transport")
        assert verdict.status == FAIL and "claim not_applicable" in _messages(verdict)

    async def test_the_declarations_are_held_to_the_facts_spec(
        self, runner, unsigned, repo
    ) -> None:
        # The fixture's FACTS spec declares no write capability.
        unsigned["transport"]["business_write_backs"] = True
        unsigned["baseline"]["M-16"] = "met"
        verdict = await _one(runner, unsigned, repo, "transport")
        assert verdict.status == FAIL and "declares no write capability" in _messages(verdict)

    async def test_facts_write_needs_a_declaration(self, runner, unsigned, repo) -> None:
        path = repo / "specs" / "forge-wms.facts.json"
        facts = json.loads(path.read_text(encoding="utf-8"))
        facts["capabilities"]["write"] = True
        path.write_text(json.dumps(facts), encoding="utf-8")
        verdict = await _one(runner, unsigned, repo, "transport")
        assert verdict.status == FAIL and "declares neither" in _messages(verdict)

    async def test_only_the_conditional_requirements_can_be_not_applicable(
        self, runner, unsigned, repo, schema
    ) -> None:
        unsigned["baseline"]["M-12"] = "not_applicable"
        report = await _run(runner, sign(unsigned), repo)
        assert _by_id(report)["fmts:schema-valid"].status == FAIL


class TestFunctionIntegrationAndDataClasses:
    """FMTS 2.0.0 (FB-153): values chosen from governed lists the owner approves."""

    async def test_the_reference_module_passes_all_four_checks(self, runner, spec, repo) -> None:
        verdicts = _by_id(await _run(runner, spec, repo))
        for check in ("lists", "function", "integration", "transport"):
            assert verdicts[f"fmts:{check}"].status == PASS, verdicts[f"fmts:{check}"]

    async def test_a_function_outside_the_list_fails(self, runner, unsigned, repo) -> None:
        unsigned["module_identity"]["function"] = "warehouse"
        verdict = await _one(runner, unsigned, repo, "function")
        assert verdict.status == FAIL and "not in the governed list" in _messages(verdict)

    async def test_only_an_integration_module_has_an_integration_section(
        self, runner, unsigned, repo
    ) -> None:
        unsigned["module_identity"]["kind"] = "management"
        report = await _run(runner, sign(unsigned), repo)
        assert _by_id(report)["fmts:schema-valid"].status == FAIL
        del unsigned["integration"]
        unsigned["time_contract"]["third_party_systems"] = []
        verdict = await _one(runner, unsigned, repo, "integration")
        assert verdict.status == PASS and "Not an integration module" in verdict.message

    async def test_an_integration_module_must_declare_its_application(
        self, runner, unsigned, repo
    ) -> None:
        del unsigned["integration"]
        report = await _run(runner, sign(unsigned), repo)
        assert _by_id(report)["fmts:schema-valid"].status == FAIL

    async def test_an_interface_outside_the_list_fails(self, runner, unsigned, repo) -> None:
        unsigned["integration"]["interfaces"] = ["graphql", "soap"]
        verdict = await _one(runner, unsigned, repo, "integration")
        assert verdict.status == FAIL and "'soap' is not in the governed list" in _messages(verdict)

    async def test_the_direction_agrees_with_the_declared_writes(
        self, runner, unsigned, repo
    ) -> None:
        unsigned["integration"]["direction"] = "both"
        verdict = await _one(runner, unsigned, repo, "integration")
        assert verdict.status == FAIL and "declares no downward writes" in _messages(verdict)

    async def test_a_data_class_outside_the_list_fails(self, runner, unsigned, repo) -> None:
        unsigned["transport"]["data_classes"].append("telemetry")
        verdict = await _one(runner, unsigned, repo, "transport")
        assert verdict.status == FAIL and "'telemetry' is not in the governed list" in _messages(
            verdict
        )

    async def test_the_classes_agree_with_the_declared_writes(self, runner, unsigned, repo) -> None:
        unsigned["transport"]["data_classes"].append("control")
        verdict = await _one(runner, unsigned, repo, "transport")
        assert verdict.status == FAIL
        assert "declares 'control' but transport.process_control_writes is false" in _messages(
            verdict
        )

    async def test_backfill_in_facts_means_historical(self, runner, unsigned, repo) -> None:
        unsigned["transport"]["data_classes"].remove("historical")
        verdict = await _one(runner, unsigned, repo, "transport")
        assert verdict.status == FAIL and "carries 'historical'" in _messages(verdict)

    async def test_a_met_buffer_and_last_will_are_declared(self, runner, unsigned, repo) -> None:
        del unsigned["transport"]["store_and_forward"]
        del unsigned["transport"]["last_will"]
        messages = _messages(await _one(runner, unsigned, repo, "transport"))
        assert "M-13 is claimed met" in messages and "M-14 is claimed met" in messages

    async def test_a_waived_buffer_need_not_be_declared(self, runner, unsigned, repo) -> None:
        del unsigned["transport"]["store_and_forward"]
        _waive(unsigned, "M-13")
        assert (await _one(runner, unsigned, repo, "transport")).status == PASS

    async def test_the_buffer_ranges_and_strategies_are_checked(
        self, runner, unsigned, repo
    ) -> None:
        buffer = unsigned["transport"]["store_and_forward"]
        buffer["size_bytes"] = {"min": 10, "max": 5}
        buffer["pruning"] = ["drop-oldest", "drop-random"]
        messages = _messages(await _one(runner, unsigned, repo, "transport"))
        assert "min is larger than max" in messages and "'drop-random' is not in" in messages

    async def test_an_unapproved_list_fails_every_module(
        self, runner, unsigned, repo, tmp_path
    ) -> None:
        import shutil

        from forge.governance.shared import lists

        copy = tmp_path / "lists"
        shutil.copytree(lists.LISTS_DIR, copy)
        path = lists.list_path(lists.MODULE_FUNCTIONS, copy)
        document = json.loads(path.read_text(encoding="utf-8"))
        document["entries"].append({"id": "warehouse", "description": "Added without approval."})
        path.write_text(json.dumps(document), encoding="utf-8")
        report = await runner.run(
            target="forge-wms", spec=sign(unsigned), repo_root=repo, lists_dir=copy
        )
        verdict = _by_id(report)["fmts:lists"]
        assert verdict.status == FAIL and "module-functions" in _messages(verdict)


class TestPlumbing:
    async def test_identity_mismatch_fails(self, runner, spec, repo) -> None:
        report = await runner.run(target="other-module", spec=spec, repo_root=repo)
        assert _by_id(report)["fmts:identity-match"].status == FAIL

    async def test_schema_failure_stops_the_requirement_checks(self, runner, unsigned, repo):
        del unsigned["time_contract"]
        report = await _run(runner, sign(unsigned), repo)
        assert [v.check_id for v in report.verdicts] == [
            "fmts:schema-valid",
            "fmts:identity-match",
            "fmts:hash-verified",
            "fmts:hash-approved",
            "fmts:enum-parity",
            "fmts:schema-current",
        ]
        assert _by_id(report)["fmts:schema-valid"].status == FAIL and not report.passed

    async def test_an_edited_spec_fails_its_hash(self, runner, spec, repo) -> None:
        spec["module_identity"]["version"] = "9.0.0"
        verdicts = _by_id(await _run(runner, spec, repo))
        assert verdicts["fmts:hash-verified"].status == FAIL

    async def test_an_unapproved_spec_fails(self, runner, spec, repo) -> None:
        from forge.governance.shared.runner import add_spec_hash

        spec.pop("integrity")
        add_spec_hash(spec, changed_by="test")
        report = await _run(runner, spec, repo)
        assert _by_id(report)["fmts:hash-approved"].status == FAIL and not report.passed

    async def test_no_integrity_block_fails_both_hash_checks(self, runner, spec, repo) -> None:
        spec.pop("integrity")
        verdicts = _by_id(await _run(runner, spec, repo))
        assert verdicts["fmts:hash-verified"].status == FAIL
        assert verdicts["fmts:hash-approved"].status == FAIL

    async def test_a_missing_source_path_fails(self, runner, unsigned, repo) -> None:
        unsigned["module_identity"]["source_paths"].append("src/nowhere")
        assert (await _one(runner, unsigned, repo, "source-paths")).status == FAIL

    async def test_a_source_path_outside_the_repository_fails(self, runner, unsigned, repo):
        unsigned["module_identity"]["source_paths"].append("../outside")
        verdict = await _one(runner, unsigned, repo, "source-paths")
        assert verdict.status == FAIL and "../outside" in _messages(verdict)

    def test_load_backlog_reads_open_and_closed_items(self, repo) -> None:
        assert load_backlog(repo) == {"FB-900": True, "FB-901": False, "FB-902": False}
        assert load_backlog(repo / "nowhere") == {}


class TestWaivers:
    async def test_a_waived_requirement_is_skipped_and_named(self, runner, unsigned, repo) -> None:
        unsigned["scaffold"]["template"] = "none"
        _waive(unsigned, "M-11")
        report = await _run(runner, sign(unsigned), repo)
        verdicts = _by_id(report)
        assert report.passed
        assert verdicts["fmts:waivers"].status == PASS
        assert verdicts["fmts:waivers"].evidence == {
            "waived": ["M-11"],
            "backlog_items": {"M-11": "FB-900"},
            "admin_waivers": [],
            "approved_by": "reh3376",
        }
        waived = verdicts["fmts:m11"]
        assert waived.status == SKIP and waived.message.startswith("WAIVED until FB-900")
        assert REASON in waived.message and waived.evidence["waived"] is True

    async def test_without_the_waiver_the_requirement_is_enforced(self, runner, unsigned, repo):
        unsigned["scaffold"]["template"] = "none"
        assert (await _one(runner, unsigned, repo, "m11")).status == FAIL

    async def test_a_closed_backlog_item_expires_the_waiver(self, runner, unsigned, repo) -> None:
        for item in ("FB-901", "FB-902"):
            spec = json.loads(json.dumps(unsigned))
            _waive(spec, "M-9", item)
            verdict = await _one(runner, spec, repo, "waivers")
            assert verdict.status == FAIL and "expired" in _messages(verdict)

    async def test_an_unknown_backlog_item_fails(self, runner, unsigned, repo) -> None:
        _waive(unsigned, "M-9", "FB-999")
        verdict = await _one(runner, unsigned, repo, "waivers")
        assert verdict.status == FAIL and "not in BACKLOG.md" in _messages(verdict)

    async def test_the_backlog_can_be_passed_in(self, runner, unsigned, repo) -> None:
        _waive(unsigned, "M-9", "FB-999")
        report = await _run(runner, sign(unsigned), repo, backlog={"FB-999": True})
        assert _by_id(report)["fmts:waivers"].status == PASS

    async def test_time_keeping_is_waived_only_with_admin_privileges(
        self, runner, unsigned, repo
    ) -> None:
        from forge.governance.shared.runner import add_spec_hash

        assert frozenset({"M-3", "M-4", "M-15"}) == ADMIN_WAIVABLE
        for requirement in sorted(ADMIN_WAIVABLE):
            spec = json.loads(json.dumps(unsigned))
            if requirement == "M-15":  # binds only a module that declares the writes
                spec["transport"]["process_control_writes"] = True
            _waive(spec, requirement)
            # Stamped but not approved: the waiver does not count yet.
            add_spec_hash(spec, changed_by="test")
            verdicts = _by_id(await _run(runner, spec, repo))
            assert verdicts["fmts:waivers"].status == FAIL
            assert "admin privileges" in _messages(verdicts["fmts:waivers"])
            # Approved: it counts, and is named on the run like any other waiver.
            verdicts = _by_id(await _run(runner, sign(spec), repo))
            waivers = verdicts["fmts:waivers"]
            assert waivers.status == PASS
            assert waivers.evidence["admin_waivers"] == [requirement]
            assert waivers.evidence["approved_by"] == "reh3376"
            skipped = verdicts[f"fmts:{requirement.lower().replace('-', '')}"]
            assert skipped.status == SKIP and skipped.message.startswith("WAIVED until FB-900")

    async def test_an_ordinary_waiver_does_not_wait_for_approval(
        self, runner, unsigned, repo
    ) -> None:
        from forge.governance.shared.runner import add_spec_hash

        _waive(unsigned, "M-9")
        add_spec_hash(unsigned, changed_by="test")
        verdicts = _by_id(await _run(runner, unsigned, repo))
        assert verdicts["fmts:waivers"].status == PASS
        assert verdicts["fmts:hash-approved"].status == FAIL

    async def test_a_running_requirement_can_be_waived(self, runner, unsigned, repo) -> None:
        _waive(unsigned, "M-7")
        verdict = await _one(runner, unsigned, repo, "m7")
        assert verdict.status == SKIP and verdict.message.startswith("WAIVED")

    async def test_claim_and_waiver_must_agree(self, runner, unsigned, repo) -> None:
        claimed = json.loads(json.dumps(unsigned))
        claimed["baseline"]["M-9"] = "waived"
        verdict = await _one(runner, claimed, repo, "waivers")
        assert verdict.status == FAIL and "no waiver names it" in _messages(verdict)
        # A claim with no waiver is not skipped: the requirement is still enforced.
        assert (await _one(runner, claimed, repo, "m9")).status == PASS

        _waive(unsigned, "M-9")
        unsigned["baseline"]["M-9"] = "met"
        verdict = await _one(runner, unsigned, repo, "waivers")
        assert verdict.status == FAIL and "claims 'met'" in _messages(verdict)
        assert (await _one(runner, unsigned, repo, "m9")).status == PASS

    async def test_a_requirement_is_waived_once(self, runner, unsigned, repo) -> None:
        _waive(unsigned, "M-9")
        _waive(unsigned, "M-9")
        verdict = await _one(runner, unsigned, repo, "waivers")
        assert verdict.status == FAIL and "more than once" in _messages(verdict)


class TestM1HubLink:
    async def test_a_hub_rest_route_in_the_source_fails(self, runner, unsigned, repo) -> None:
        (repo / "src" / "wms" / "push.py").write_text(
            'URL = "http://hub:8000/v1/records"\n', encoding="utf-8"
        )
        verdict = await _one(runner, unsigned, repo, "m1")
        assert verdict.status == FAIL and "/v1/records" in _messages(verdict)

    async def test_vendored_directories_are_not_scanned(self, runner, unsigned, repo) -> None:
        vendored = repo / "src" / "wms" / "node_modules" / "pkg"
        vendored.mkdir(parents=True)
        (vendored / "index.js").write_text("fetch('/v1/records')\n", encoding="utf-8")
        assert (await _one(runner, unsigned, repo, "m1")).status == PASS


class TestM2Facts:
    async def test_a_missing_facts_spec_fails(self, runner, unsigned, repo) -> None:
        unsigned["references"]["facts"]["path"] = "specs/none.facts.json"
        verdict = await _one(runner, unsigned, repo, "m2")
        assert verdict.status == FAIL and "file not found" in _messages(verdict)

    async def test_the_adapter_id_must_match(self, runner, unsigned, repo) -> None:
        unsigned["references"]["facts"]["adapter_id"] = "whk-other"
        assert (await _one(runner, unsigned, repo, "m2")).status == FAIL

    async def test_an_edited_facts_spec_fails(self, runner, unsigned, repo) -> None:
        path = repo / "specs" / "forge-wms.facts.json"
        facts = json.loads(path.read_text(encoding="utf-8"))
        facts["adapter_identity"]["name"] = "Changed after approval"
        path.write_text(json.dumps(facts), encoding="utf-8")
        verdict = await _one(runner, unsigned, repo, "m2")
        assert verdict.status == FAIL and "hash does not verify" in _messages(verdict)

    async def test_an_unapproved_facts_spec_fails(self, runner, unsigned, repo) -> None:
        path = repo / "specs" / "forge-wms.facts.json"
        facts = json.loads(path.read_text(encoding="utf-8"))
        facts["integrity"]["hash_state"] = "pending_review"
        path.write_text(json.dumps(facts), encoding="utf-8")
        verdict = await _one(runner, unsigned, repo, "m2")
        assert verdict.status == FAIL and "not approved" in _messages(verdict)

    async def test_the_manifest_must_match_the_facts_identity(self, runner, unsigned, repo):
        path = repo / "src" / "wms" / "manifest.json"
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["version"] = "7.0.0"
        path.write_text(json.dumps(manifest), encoding="utf-8")
        verdict = await _one(runner, unsigned, repo, "m2")
        assert verdict.status == FAIL and "manifest version" in _messages(verdict)

    async def test_the_manifest_schema_ref_must_match(self, runner, unsigned, repo) -> None:
        path = repo / "src" / "wms" / "manifest.json"
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["data_contract"]["schema_ref"] = "forge://schemas/forge-wms/v9.9.9"
        path.write_text(json.dumps(manifest), encoding="utf-8")
        verdict = await _one(runner, unsigned, repo, "m2")
        assert verdict.status == FAIL and "the hub refuses that registration" in _messages(verdict)

    async def test_a_missing_manifest_fails(self, runner, unsigned, repo) -> None:
        unsigned["references"]["manifest"] = "src/wms/none.json"
        assert (await _one(runner, unsigned, repo, "m2")).status == FAIL


class TestM3TimeContract:
    async def test_an_integration_module_declares_its_system(self, runner, unsigned, repo):
        unsigned["time_contract"]["third_party_systems"] = []
        verdict = await _one(runner, unsigned, repo, "m3")
        assert verdict.status == FAIL and "integration module" in _messages(verdict)

    async def test_a_management_module_needs_no_third_party_system(self, runner, unsigned, repo):
        unsigned["module_identity"]["kind"] = "management"
        del unsigned["integration"]  # only an integration module declares one
        unsigned["time_contract"]["third_party_systems"] = []
        assert (await _one(runner, unsigned, repo, "m3")).status == PASS

    async def test_a_readable_clock_declares_class_cadence_and_offset(
        self, runner, unsigned, repo
    ) -> None:
        system = unsigned["time_contract"]["third_party_systems"][0]
        del system["tolerance_class"], system["offset_reported"]
        verdict = await _one(runner, unsigned, repo, "m3")
        assert verdict.status == FAIL
        assert "tolerance_class" in _messages(verdict) and "offset_reported" in _messages(verdict)

    async def test_an_unreadable_clock_is_declared_with_its_polling_interval(
        self, runner, unsigned, repo
    ) -> None:
        unsigned["time_contract"]["third_party_systems"] = [
            {
                "name": "legacy",
                "interface": "rest",
                "clock_read_method": "unreadable",
                "polling_interval_seconds": 60,
                "fail_closed": True,
            }
        ]
        assert (await _one(runner, unsigned, repo, "m3")).status == PASS

        del unsigned["time_contract"]["third_party_systems"][0]["polling_interval_seconds"]
        verdict = await _one(runner, unsigned, repo, "m3")
        assert verdict.status == FAIL and "uncertainty" in _messages(verdict)

    async def test_an_unreadable_clock_claims_no_tolerance(self, runner, unsigned, repo) -> None:
        unsigned["time_contract"]["third_party_systems"] = [
            {
                "name": "legacy",
                "interface": "rest",
                "clock_read_method": "unreadable",
                "polling_interval_seconds": 60,
                "tolerance_class": "it-lan",
                "fail_closed": True,
            }
        ]
        verdict = await _one(runner, unsigned, repo, "m3")
        assert verdict.status == FAIL and "does not apply" in _messages(verdict)

    async def test_a_written_hub_database_names_its_time_source(self, runner, unsigned, repo):
        del unsigned["time_contract"]["databases"][0]["written_time_source"]
        verdict = await _one(runner, unsigned, repo, "m3")
        assert verdict.status == FAIL and "never from the database's now()" in _messages(verdict)

    async def test_a_read_only_hub_database_needs_no_time_source(self, runner, unsigned, repo):
        database = unsigned["time_contract"]["databases"][0]
        database["access"] = "read"
        del database["written_time_source"]
        assert (await _one(runner, unsigned, repo, "m3")).status == PASS

    async def test_a_hub_database_clock_is_not_the_modules_to_declare(
        self, runner, unsigned, repo
    ) -> None:
        unsigned["time_contract"]["databases"][0]["tolerance_class"] = "it-lan"
        verdict = await _one(runner, unsigned, repo, "m3")
        assert verdict.status == FAIL and "only to a third-party database" in _messages(verdict)

    async def test_a_third_party_database_clock_is_measured(self, runner, unsigned, repo) -> None:
        database = {
            "name": "wms-db",
            "owner": "third-party",
            "access": "read",
            "credential": "third-party-issued",
            "fail_closed": True,
        }
        unsigned["time_contract"]["databases"].append(database)
        verdict = await _one(runner, unsigned, repo, "m3")
        assert verdict.status == FAIL and "clock_read_method" in _messages(verdict)

        database.update(
            clock_read_method="sql-server-time",
            tolerance_class="it-lan",
            clock_probe_interval_seconds=30,
            offset_reported=True,
        )
        assert (await _one(runner, unsigned, repo, "m3")).status == PASS

    async def test_an_ot_module_declares_its_devices(self, runner, unsigned, repo) -> None:
        unsigned["module_identity"]["kind"] = "ot"
        del unsigned["integration"]  # only an integration module declares one
        verdict = await _one(runner, unsigned, repo, "m3")
        assert verdict.status == FAIL and "plant-floor devices" in _messages(verdict)

    async def test_declared_devices_need_a_clock_read_method_in_facts(
        self, runner, unsigned, repo
    ) -> None:
        # The WMS FACTS spec names no clock_read_method and stamps 'server', not 'forge'.
        unsigned["time_contract"]["plant_floor_devices"] = "declared-in-facts"
        verdict = await _one(runner, unsigned, repo, "m3")
        assert verdict.status == FAIL and "clock_read_method" in _messages(verdict)

    async def test_names_are_unique(self, runner, unsigned, repo) -> None:
        systems = unsigned["time_contract"]["third_party_systems"]
        systems.append(dict(systems[0]))
        verdict = await _one(runner, unsigned, repo, "m3")
        assert verdict.status == FAIL and "more than once" in _messages(verdict)

    async def test_the_hub_class_comes_from_facts(self, runner, unsigned, repo) -> None:
        verdict = await _one(runner, unsigned, repo, "m3")
        assert verdict.evidence == {"hub_tolerance_class": "it-lan"}


class TestM8Credentials:
    async def test_a_database_of_its_own_fails(self, runner, unsigned, repo) -> None:
        unsigned["time_contract"]["databases"].append(
            {
                "name": "own",
                "owner": "module",
                "access": "read-write",
                "credential": "module-held",
                "written_time_source": "module-clock",
                "fail_closed": True,
            }
        )
        verdict = await _one(runner, unsigned, repo, "m8")
        assert verdict.status == FAIL
        assert "module's own database" in _messages(verdict)
        assert "holds itself" in _messages(verdict)

    async def test_a_hub_database_takes_a_forge_issued_credential(self, runner, unsigned, repo):
        unsigned["time_contract"]["databases"][0]["credential"] = "third-party-issued"
        assert (await _one(runner, unsigned, repo, "m8")).status == FAIL

    async def test_forge_does_not_issue_third_party_credentials(self, runner, unsigned, repo):
        unsigned["time_contract"]["databases"].append(
            {
                "name": "wms-db",
                "owner": "third-party",
                "access": "read",
                "credential": "forge-issued",
                "clock_read_method": "unreadable",
                "polling_interval_seconds": 60,
                "fail_closed": True,
            }
        )
        assert (await _one(runner, unsigned, repo, "m8")).status == FAIL


class TestM9UserInterface:
    async def test_declared_ui_code_fails(self, runner, unsigned, repo) -> None:
        unsigned["user_interface"]["ships_ui_code"] = True
        assert (await _one(runner, unsigned, repo, "m9")).status == FAIL

    async def test_ui_source_files_fail_whatever_is_declared(self, runner, unsigned, repo):
        (repo / "src" / "wms" / "Page.tsx").write_text("export {}\n", encoding="utf-8")
        verdict = await _one(runner, unsigned, repo, "m9")
        assert verdict.status == FAIL and "Page.tsx" in _messages(verdict)

    async def test_screens_need_an_fvts_spec(self, runner, unsigned, repo) -> None:
        unsigned["user_interface"]["screens"] = True
        verdict = await _one(runner, unsigned, repo, "m9")
        assert verdict.status == FAIL and "names no FVTS spec" in _messages(verdict)

    async def test_an_fvts_spec_must_exist_and_belong_to_the_module(
        self, runner, unsigned, repo
    ) -> None:
        unsigned["user_interface"]["screens"] = True
        unsigned["references"]["fvts"] = ["specs/wms.fvts.json"]
        assert (await _one(runner, unsigned, repo, "m9")).status == FAIL

        view = repo / "specs" / "wms.fvts.json"
        view.write_text(json.dumps({"view_identity": {"owner_module": "other"}}), encoding="utf-8")
        verdict = await _one(runner, unsigned, repo, "m9")
        assert verdict.status == FAIL and "belongs to 'other'" in _messages(verdict)

        view.write_text(
            json.dumps({"view_identity": {"owner_module": "forge-wms"}}), encoding="utf-8"
        )
        assert (await _one(runner, unsigned, repo, "m9")).status == PASS

    async def test_the_display_module_is_not_bound(self, runner, unsigned, repo) -> None:
        (repo / "src" / "wms" / "Page.tsx").write_text("export {}\n", encoding="utf-8")
        unsigned["module_identity"]["kind"] = "display"
        del unsigned["integration"]  # only an integration module declares one
        unsigned["user_interface"]["ships_ui_code"] = True
        verdict = await _one(runner, unsigned, repo, "m9")
        assert verdict.status == PASS and "does not bind it" in verdict.message

        unsigned["user_interface"]["ships_ui_code"] = False
        assert (await _one(runner, unsigned, repo, "m9")).status == FAIL


class TestM10Roles:
    async def test_no_roles_file_fails(self, runner, unsigned, repo) -> None:
        del unsigned["references"]["roles"]
        verdict = await _one(runner, unsigned, repo, "m10")
        assert verdict.status == FAIL and "names no roles file" in _messages(verdict)

    async def test_a_missing_or_empty_roles_file_fails(self, runner, unsigned, repo) -> None:
        unsigned["references"]["roles"] = "specs/none.json"
        assert (await _one(runner, unsigned, repo, "m10")).status == FAIL
        unsigned["references"]["roles"] = "specs/roles.json"
        (repo / "specs" / "roles.json").write_text('{"roles": []}', encoding="utf-8")
        assert (await _one(runner, unsigned, repo, "m10")).status == FAIL

    async def test_roles_are_checked(self, runner, unsigned, repo) -> None:
        (repo / "specs" / "roles.json").write_text(
            json.dumps(
                {
                    "roles": [
                        {"role_id": "Bad Id", "scopes": ["wms:barrel:read"]},
                        {"role_id": "wms-a", "scopes": ["not a scope"]},
                        {"role_id": "wms-b", "scopes": [], "inherits": ["wms-missing"]},
                        {"role_id": "wms-c", "scopes": []},
                        {"role_id": "wms-d", "scopes": ["wms:*"]},
                        {"role_id": "wms-d", "scopes": ["wms:*"]},
                    ]
                }
            ),
            encoding="utf-8",
        )
        verdict = await _one(runner, unsigned, repo, "m10")
        text = _messages(verdict)
        assert verdict.status == FAIL and len(verdict.violations) == 6
        for expected in (
            "not a kebab-case id",
            "is not a scope",
            "does not define",
            "grants no scope",
            "is repeated",
        ):
            assert expected in text

    async def test_declared_roles_are_reported(self, runner, unsigned, repo) -> None:
        verdict = await _one(runner, unsigned, repo, "m10")
        assert verdict.evidence == {"roles": ["wms-viewer", "wms-operator"]}


class TestM11Scaffold:
    async def test_a_missing_template_file_fails(self, runner, unsigned, repo) -> None:
        (repo / "src" / "wms" / "record_builder.py").unlink()
        verdict = await _one(runner, unsigned, repo, "m11")
        assert verdict.status == FAIL and "record_builder.py" in _messages(verdict)

    async def test_the_template_must_fit_the_language(self, runner, unsigned, repo) -> None:
        unsigned["module_identity"]["language"] = "go"
        verdict = await _one(runner, unsigned, repo, "m11")
        assert verdict.status == FAIL and "is for python, not go" in _messages(verdict)

    async def test_the_go_layout_is_checked(self, runner, unsigned, repo) -> None:
        unsigned["module_identity"]["language"] = "go"
        unsigned["scaffold"]["template"] = "go-module"
        verdict = await _one(runner, unsigned, repo, "m11")
        assert verdict.status == FAIL and "spec/manifest.json" in _messages(verdict)

        module = repo / "src" / "wms"
        (module / "backend").mkdir()
        (module / "cmd").mkdir()
        (module / "spec").mkdir()
        (module / "spec" / "manifest.json").write_text("{}", encoding="utf-8")
        assert (await _one(runner, unsigned, repo, "m11")).status == PASS
