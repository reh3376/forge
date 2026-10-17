"""FVTSRunner: schema-runner parity, then every check on the reference spec and unsafe variants."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from forge.governance.fvts import SCHEMA_PATH
from forge.governance.fvts.renderer import GoldenMessage
from forge.governance.fvts.runners.fvts_runner import FVTSRunner, tag_pattern, write_tags
from forge.governance.shared.runner import (
    VerdictStatus,
    add_spec_hash,
    approve_spec_hash,
    check_schema_runner_parity,
)
from forge.modules.ot.control.config import load_control_config

PASS, FAIL = VerdictStatus.PASS, VerdictStatus.FAIL
WRITE_CONFIG_PATH = (
    Path(__file__).resolve().parents[3] / "deploy" / "ot" / "ot-control.example.json"
)
CONTEXT = {"site": "whk01", "area": "Area1", "equipment_id": "Fermenter3", "operating_mode": "Run"}


def _messages(v: Any) -> str:
    return " | ".join(x.message for x in v.violations)


# ---------------------------------------------------------------------------
# Parity and plumbing
# ---------------------------------------------------------------------------


class TestParity:
    def test_enforced_fields_equal_the_schema(self, runner: FVTSRunner, schema: dict) -> None:
        wanted = set(schema["properties"]) | {
            f"$.{field}"
            for definition in schema["$defs"].values()
            for field in definition.get("properties", {})
        }
        assert runner.implemented_fields() == wanted
        assert check_schema_runner_parity(schema, runner.implemented_fields()) == []

    async def test_reference_run_has_no_parity_or_error_verdicts(self, runner, spec) -> None:
        report = await runner.run(target="ot-module-views", spec=spec)
        statuses = {v.status for v in report.verdicts}
        assert VerdictStatus.NOT_IMPLEMENTED not in statuses
        assert VerdictStatus.ERROR not in statuses
        assert report.total == 19
        assert report.framework == "FVTS" and report.hash_verified is True

    async def test_no_spec_is_an_error(self, runner: FVTSRunner) -> None:
        report = await runner.run(target="nothing")
        assert [(v.check_id, v.status) for v in report.verdicts] == [
            ("fvts:spec-load", VerdictStatus.ERROR)
        ]

    async def test_runner_without_schema_reports_errors_not_passes(self, spec: dict) -> None:
        report = await FVTSRunner().run(target="ot-module-views", spec=spec)
        errored = {v.check_id for v in report.verdicts if v.status is VerdictStatus.ERROR}
        assert errored == {"fvts:schema-valid", "fvts:enum-parity"}


class TestSchemaValid:
    async def test_reference_passes(self, check, spec) -> None:
        assert (await check(spec, "fvts:schema-valid")).status is PASS

    async def test_violation_names_the_json_path(self, check, spec) -> None:
        spec["actions"][0]["required_role"] = "VIEWER"
        verdict = await check(spec, "fvts:schema-valid")
        assert verdict.status is FAIL
        assert verdict.violations[0].field == "actions/0/required_role"


class TestIdentityAndIntegrity:
    async def test_identity_must_match_target(self, runner, spec, facts_specs) -> None:
        report = await runner.run(target="someone-else", spec=spec, facts_specs=facts_specs)
        verdict = next(v for v in report.verdicts if v.check_id == "fvts:identity-match")
        assert verdict.status is FAIL and "does not match target" in verdict.message

    async def test_reference_hash_verifies_but_awaits_approval(self, check, spec) -> None:
        assert (await check(spec, "fvts:hash-verified")).status is PASS
        approved = await check(spec, "fvts:hash-approved")
        assert approved.status is FAIL and "pending_review" in approved.message
        assert approved.violations[0].severity == "warning"

    async def test_tampered_content_fails_hash_verified(self, check, spec) -> None:
        spec["scope"]["multi_site"] = True
        verdict = await check(spec, "fvts:hash-verified")
        assert verdict.status is FAIL and "mismatch" in verdict.message

    async def test_restamped_and_approved_passes(self, check, spec) -> None:
        spec["metadata"]["notes"] = "edited in a test"
        add_spec_hash(spec, source="agent", changed_by="test")
        assert (await check(spec, "fvts:hash-verified")).status is PASS
        assert (await check(spec, "fvts:hash-approved")).status is FAIL  # modified, unapproved
        approve_spec_hash(spec, approved_by="owner")
        approved = await check(spec, "fvts:hash-approved")
        assert approved.status is PASS and approved.evidence["approved_by"] == "owner"

    async def test_missing_integrity_fails_both(self, check, spec) -> None:
        del spec["integrity"]
        assert (await check(spec, "fvts:hash-verified")).status is FAIL
        assert (await check(spec, "fvts:hash-approved")).status is FAIL


class TestEnumParity:
    async def test_schema_mirrors_the_python_models(self, check, spec) -> None:
        verdict = await check(spec, "fvts:enum-parity")
        assert verdict.status is PASS
        assert set(verdict.evidence) == {
            "qualityCode",
            "contextField",
            "timestampBasis",
            "alarmState",
            "alarmPriority",
            "alarmOperation",
            "role",
            "writeStatus",
        }
        assert verdict.evidence["alarmOperation"] == [
            "ACKNOWLEDGE",
            "DISABLE",
            "ENABLE",
            "RESET",
            "SHELVE",
            "UNSHELVE",
        ]

    async def test_drift_is_detected(self, schema, spec, facts_specs, tmp_path) -> None:
        drifted = copy.deepcopy(schema)
        drifted["$defs"]["alarmState"]["enum"].remove("SHELVED")
        drifted["$defs"]["role"]["enum"].append("SUPERUSER")
        path = tmp_path / "fvts.schema.json"
        path.write_text(json.dumps(drifted), encoding="utf-8")
        report = await FVTSRunner(schema_path=path).run(
            target="ot-module-views", spec=spec, facts_specs=facts_specs
        )
        verdict = next(v for v in report.verdicts if v.check_id == "fvts:enum-parity")
        assert verdict.status is FAIL
        assert "missing ['SHELVED']" in _messages(verdict)
        assert "extra ['SUPERUSER']" in _messages(verdict)


# ---------------------------------------------------------------------------
# Cross-references
# ---------------------------------------------------------------------------


class TestOwnerInFacts:
    async def test_reference_owner_and_bindings(self, check, spec) -> None:
        verdict = await check(spec, "fvts:owner-in-facts")
        assert verdict.status is PASS
        assert verdict.evidence == {"owner_module": "ot-module", "bound_adapters": ["ot-module"]}

    async def test_unknown_owner(self, check, spec) -> None:
        spec["view_identity"]["owner_module"] = "ghost-module"
        verdict = await check(spec, "fvts:owner-in-facts")
        assert verdict.status is FAIL and "has no FACTS spec" in verdict.message

    async def test_bound_adapter_without_facts(self, check, spec) -> None:
        spec["data_bindings"]["points"][0]["source"]["adapter_id"] = "ghost-adapter"
        verdict = await check(spec, "fvts:owner-in-facts")
        assert "bound adapter 'ghost-adapter' has no FACTS spec" in _messages(verdict)

    async def test_facts_ref_must_exist(self, check, spec) -> None:
        spec["view_identity"]["facts_spec_ref"] = "src/nowhere/ot-module.facts.json"
        verdict = await check(spec, "fvts:owner-in-facts")
        assert verdict.status is FAIL and "does not exist" in _messages(verdict)


class TestReferences:
    async def test_duplicate_ids(self, check, spec) -> None:
        spec["data_bindings"]["points"].append(copy.deepcopy(spec["data_bindings"]["points"][0]))
        spec["surfaces"].append(copy.deepcopy(spec["surfaces"][1]))
        verdict = await check(spec, "fvts:unique-ids")
        assert verdict.status is FAIL
        assert "duplicate point_id: ['ferm.temperature']" in _messages(verdict)
        assert "duplicate surface_id: ['ferm.trend']" in _messages(verdict)

    async def test_surface_refs(self, check, spec) -> None:
        assert (await check(spec, "fvts:surface-refs")).status is PASS
        spec["surfaces"][0]["points"].append("ferm.pressure")
        spec["surfaces"][2]["actions"].append("alarm.nuke")
        verdict = await check(spec, "fvts:surface-refs")
        assert verdict.status is FAIL
        assert "unknown point 'ferm.pressure'" in _messages(verdict)
        assert "unknown action 'alarm.nuke'" in _messages(verdict)


class TestActionTarget:
    async def test_reference_without_write_config(self, check, spec) -> None:
        verdict = await check(spec, "fvts:action-target")
        assert verdict.status is PASS
        assert verdict.evidence == {
            "tag_write_actions": ["ferm.write_temperature_sp"],
            "write_config": "not provided",
        }

    async def test_missing_target_point(self, check, spec) -> None:
        spec["actions"][0]["target_point"] = "ferm.nothing"
        verdict = await check(spec, "fvts:action-target")
        assert "targets undeclared point 'ferm.nothing'" in _messages(verdict)

    async def test_owner_without_write_capability(self, check, spec, facts_specs) -> None:
        facts = copy.deepcopy(facts_specs)
        facts["ot-module"]["capabilities"]["write"] = False
        verdict = await check(spec, "fvts:action-target", facts_specs=facts)
        assert verdict.status is FAIL and "capabilities.write=false" in _messages(verdict)

    async def test_point_bound_to_another_adapter(self, check, spec) -> None:
        spec["data_bindings"]["points"][1]["source"]["adapter_id"] = "forge-mes"
        verdict = await check(spec, "fvts:action-target")
        assert "bound to adapter 'forge-mes', not the owner 'ot-module'" in _messages(verdict)

    async def test_alarm_operation_needs_alarms(self, check, spec) -> None:
        spec["alarms"] = {"enabled": False}
        verdict = await check(spec, "fvts:action-target")
        assert "alarms.enabled is false" in _messages(verdict)

    async def test_write_config_rejects_the_invented_fermenter_tag(self, check, spec) -> None:
        """FB-078: the reference points are placeholders until real OT tags replace them."""
        config = load_control_config(WRITE_CONFIG_PATH)
        verdict = await check(spec, "fvts:action-target", write_config=config)
        assert verdict.status is FAIL
        assert "no write_tags entry matches '{area}/{equipment_id}/TemperatureSP'" in _messages(
            verdict
        )
        assert verdict.evidence["write_config"] == "checked"

    async def test_write_config_accepts_a_real_writable_tag(self, check, spec) -> None:
        point = spec["data_bindings"]["points"][1]
        point["source"]["tag_path"] = "WH/{site}/Cooker01/TIT_2010/SP"
        config = load_control_config(WRITE_CONFIG_PATH)
        assert (await check(spec, "fvts:action-target", write_config=config)).status is PASS

        point["range"] = {"lo": 32, "hi": 250}  # tag allows 0..212
        verdict = await check(spec, "fvts:action-target", write_config=config)
        assert "display range exceeds the writable range" in _messages(verdict)

        point["range"] = {"lo": 32, "hi": 212}
        point["data_type"] = "BOOLEAN"
        verdict = await check(spec, "fvts:action-target", write_config=config)
        assert "point is BOOLEAN but tag 'WH/WHK01/Cooker01/TIT_2010/SP' is FLOAT" in _messages(
            verdict
        )

    async def test_write_config_as_dict_and_unwritable_tag(self, check, spec) -> None:
        spec["data_bindings"]["points"][1]["source"]["tag_path"] = "Plant/Line1/SP"
        config = {
            "write_tags": [{"tag_path": "Plant/Line1/SP", "data_type": "FLOAT", "writable": False}]
        }
        verdict = await check(spec, "fvts:action-target", write_config=config)
        assert "tag 'Plant/Line1/SP' is not writable" in _messages(verdict)
        assert write_tags(config)[0]["min_value"] is None

    def test_tag_pattern_matches_one_segment_per_placeholder(self) -> None:
        pattern = tag_pattern("{area}/{equipment_id}/Temperature.SP")
        assert pattern.match("Area1/Fermenter3/Temperature.SP")
        assert not pattern.match("Area1/Fermenter3/Sub/Temperature.SP")
        assert not pattern.match("Area1/Fermenter3/TemperatureXSP")


# ---------------------------------------------------------------------------
# Profiles
# ---------------------------------------------------------------------------


class TestProfiles:
    async def test_action_profile_permitted(self, check, spec) -> None:
        assert (await check(spec, "fvts:action-profile-permitted")).status is PASS
        spec["actions"][0]["allowed_profiles"].append("web")  # tag write from a browser
        spec["actions"][2]["allowed_profiles"].append("mobile")  # SHELVE from a phone
        verdict = await check(spec, "fvts:action-profile-permitted")
        assert verdict.status is FAIL
        assert "tag_write is not permitted on 'web'" in _messages(verdict)
        assert "SHELVE is not permitted on 'mobile'" in _messages(verdict)

    async def test_action_profile_must_be_supported(self, check, spec) -> None:
        spec["render_profiles"]["supported"] = ["desktop_hmi"]
        verdict = await check(spec, "fvts:action-profile-permitted")
        assert "allows 'web', not in render_profiles.supported" in _messages(verdict)

    async def test_profile_supported(self, check, spec) -> None:
        assert (await check(spec, "fvts:profile-supported")).status is PASS
        spec["render_profiles"]["supported"] = ["desktop_hmi", "web"]
        verdict = await check(spec, "fvts:profile-supported")
        assert verdict.status is FAIL
        found = _messages(verdict)
        assert "surfaces[ferm.trend].allowed_profiles lists 'desktop_app'" in found
        assert "settings.allowed_profiles lists 'desktop_app'" in found
        assert "render_profiles.overrides lists 'mobile'" in found

    async def test_profile_baseline_reference_effective_limits(self, check, spec) -> None:
        verdict = await check(spec, "fvts:profile-baseline")
        assert verdict.status is PASS
        effective = verdict.evidence["effective"]
        assert effective["desktop_hmi"]["max_update_rate_hz"] == 4.0  # spec ceiling below baseline
        assert effective["mobile"]["max_update_rate_hz"] == 1.0
        assert effective["web"] == {
            "max_update_rate_hz": 4.0,
            "writes_permitted": False,
            "alarm_operations": ["ACKNOWLEDGE"],
        }

    async def test_profile_baseline_rejects_loosening(self, check, spec) -> None:
        spec["render_profiles"]["overrides"] = {
            "mobile": {"max_update_rate_hz": 30},
            "web": {"writes_permitted": True, "alarm_operations_permitted": True},
        }
        verdict = await check(spec, "fvts:profile-baseline")
        assert verdict.status is FAIL
        found = _messages(verdict)
        assert "loosens the 'mobile' rate ceiling (30 > 1 Hz)" in found
        assert "grants tag writes on 'web'" in found
        assert "claims all alarm operations on 'web'" in found

    async def test_profile_baseline_tightening_is_allowed_and_applied(self, check, spec) -> None:
        spec["render_profiles"]["overrides"] = {
            "desktop_hmi": {"writes_permitted": False, "max_update_rate_hz": 2},
        }
        verdict = await check(spec, "fvts:profile-baseline")
        assert verdict.status is PASS
        assert verdict.evidence["effective"]["desktop_hmi"]["writes_permitted"] is False
        # The tightened profile now forbids the setpoint write the spec allows on it.
        permitted = await check(spec, "fvts:action-profile-permitted")
        assert "tag_write is not permitted on 'desktop_hmi'" in _messages(permitted)

    async def test_profile_action_filter(self, check, spec) -> None:
        verdict = await check(spec, "fvts:profile-action-filter")
        assert verdict.status is PASS
        table = verdict.evidence["filter"]
        assert table["ferm.overview@web"] == {
            "visible": ["alarm.acknowledge"],
            "hidden": ["ferm.write_temperature_sp", "alarm.shelve"],
        }
        assert table["ferm.overview@desktop_hmi"]["hidden"] == []
        spec["surfaces"][1]["allowed_profiles"] = ["mobile"]
        spec["surfaces"][1]["actions"] = ["alarm.shelve"]
        verdict = await check(spec, "fvts:profile-action-filter")
        assert "hidden on every profile the surface allows" in _messages(verdict)

    async def test_cross_site_read_only(self, check, spec) -> None:
        assert (await check(spec, "fvts:cross-site-read-only")).status is PASS
        spec["scope"]["multi_site"] = True
        verdict = await check(spec, "fvts:cross-site-read-only")
        assert (
            verdict.status is FAIL
            and "reaches tag_write 'ferm.write_temperature_sp'" in verdict.message
        )
        spec["surfaces"][0]["actions"].remove("ferm.write_temperature_sp")
        assert (await check(spec, "fvts:cross-site-read-only")).status is PASS

    async def test_isa101_required_for_hmi_screens(self, check, spec) -> None:
        spec["design_system"]["isa101_high_performance"] = False
        verdict = await check(spec, "fvts:isa101-required")
        assert verdict.status is FAIL and "['ferm.overview'] require" in verdict.message
        spec["surfaces"][0]["kind"] = "dashboard"
        assert (await check(spec, "fvts:isa101-required")).status is PASS

    async def test_range_sane(self, check, spec) -> None:
        assert (await check(spec, "fvts:range-sane")).status is PASS
        spec["data_bindings"]["points"][0]["range"] = {"lo": 212, "hi": 212}
        spec["live_updates"]["reconnect"] = {"initial_backoff_ms": 20000, "max_backoff_ms": 15000}
        verdict = await check(spec, "fvts:range-sane")
        assert verdict.status is FAIL
        assert "range lo=212 is not below hi=212" in _messages(verdict)
        assert "initial_backoff_ms 20000 exceeds max_backoff_ms 15000" in _messages(verdict)


# ---------------------------------------------------------------------------
# Conformance evidence
# ---------------------------------------------------------------------------


class TestConformance:
    async def test_paths_exist_in_this_checkout(self, check, spec) -> None:
        assert (await check(spec, "fvts:conformance-paths")).status is PASS

    async def test_paths_missing_elsewhere(self, check, spec, tmp_path) -> None:
        verdict = await check(
            spec, "fvts:conformance-paths", repo_root=tmp_path, golden_messages=[]
        )
        assert verdict.status is FAIL
        assert {v.field for v in verdict.violations} == {
            "conformance_tests.suite_path",
            "conformance_tests.golden_messages_path",
        }

    async def test_golden_messages_render_on_every_renderer_under_test(self, check, spec) -> None:
        verdict = await check(spec, "fvts:golden-messages")
        assert verdict.status is PASS, verdict.message
        renderers = verdict.evidence["renderers"]
        assert renderers["desktop_hmi"] == {"rendered": 12, "skipped": 0, "errors": 0}
        assert renderers["web"] == {"rendered": 10, "skipped": 2, "errors": 0}
        assert "06_action_result_write.json[1]" in verdict.evidence["messages"]

    async def test_golden_message_breaking_the_contract_fails(self, check, spec) -> None:
        bad = GoldenMessage(
            "bad.json",
            {
                "message_type": "subscription_update",
                "now": "2026-10-16T12:00:00Z",
                "updates": [
                    {
                        "point_id": "ferm.pressure",
                        "value": {"raw": 1, "quality": "GOOD"},
                        "timestamp": {"source_time": "2026-10-16T12:00:00Z"},
                        "context": CONTEXT,
                    }
                ],
            },
        )
        verdict = await check(spec, "fvts:golden-messages", golden_messages=[bad])
        assert verdict.status is FAIL
        assert "desktop_hmi: bad.json: point 'ferm.pressure' is not declared" in _messages(verdict)
        assert "web: bad.json: point 'ferm.pressure' is not declared" in _messages(verdict)

    async def test_no_renderers_or_messages_is_unverified(self, check, spec) -> None:
        spec["conformance_tests"].pop("renderers_under_test")
        verdict = await check(spec, "fvts:golden-messages", golden_messages=[])
        assert verdict.status is FAIL
        assert {v.field for v in verdict.violations} == {
            "conformance_tests.renderers_under_test",
            "conformance_tests.golden_messages_path",
        }

    async def test_metadata_must_be_an_object(self, check, spec) -> None:
        spec["metadata"] = "free text"
        assert (await check(spec, "fvts:metadata")).status is FAIL


@pytest.mark.parametrize("schema_path", [SCHEMA_PATH])
def test_schema_path_is_the_package_schema(schema_path: Path) -> None:
    assert schema_path.name == "fvts.schema.json" and schema_path.is_file()
