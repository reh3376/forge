"""The FMTS schema: what it accepts and what it refuses."""

from __future__ import annotations

from typing import Any

import pytest
from jsonschema import Draft202012Validator

from forge.governance.facts import SCHEMA_PATH as FACTS_SCHEMA_PATH
from forge.governance.fmts.runners.fmts_runner import REQUIREMENTS
from forge.governance.shared.runner import load_schema


def _errors(schema: dict, spec: dict) -> list[str]:
    return [e.message for e in Draft202012Validator(schema).iter_errors(spec)]


class TestSchema:
    def test_is_a_valid_draft_2020_12_schema(self, schema: dict) -> None:
        Draft202012Validator.check_schema(schema)
        assert schema["$id"] == "forge://fxts/fmts/v1.0.0"
        assert schema["properties"]["spec_version"]["const"] == "1.0.0"

    def test_the_reference_spec_validates(self, schema: dict, spec: dict) -> None:
        assert _errors(schema, spec) == []

    def test_baseline_lists_the_sixteen_requirements(self, schema: dict) -> None:
        baseline = schema["properties"]["baseline"]
        assert baseline["required"] == list(REQUIREMENTS) == [f"M-{n}" for n in range(1, 17)]
        assert set(baseline["properties"]) == set(REQUIREMENTS)

    def test_tolerance_classes_mirror_facts(self, schema: dict) -> None:
        facts = load_schema(FACTS_SCHEMA_PATH)
        governance = facts["properties"]["time_governance"]["properties"]
        assert schema["$defs"]["toleranceClass"]["enum"] == governance["tolerance_class"]["enum"]

    @pytest.mark.parametrize(
        ("path", "value"),
        [
            (("hub_link", "protocol"), "rest"),
            (("hub_link", "service"), "forge.v1.Other"),
            (("time_contract", "hub", "fail_closed"), False),
            (("time_contract", "hub", "exchange"), "none"),
            (("time_contract", "databases", 0, "fail_closed"), False),
            (("time_contract", "databases", 0, "written_time_source"), "database-now"),
            (("time_contract", "third_party_systems", 0, "fail_closed"), False),
            (("time_contract", "third_party_systems", 0, "offset_reported"), False),
            (("time_contract", "third_party_systems", 0, "tolerance_class"), "loose"),
            (("module_identity", "kind"), "adapter"),
            (("module_identity", "module_id"), "Not Kebab"),
            (("module_identity", "alias"), "Has-Dash"),
            (("module_identity", "alias"), "x"),
            (("module_identity", "source_paths"), []),
            (("baseline", "M-3"), "ignored"),
            (("spec_version",), "9.9.9"),
        ],
    )
    def test_refuses(self, schema: dict, spec: dict, path: tuple, value: Any) -> None:
        node: Any = spec
        for key in path[:-1]:
            node = node[key]
        node[path[-1]] = value
        assert _errors(schema, spec)

    @pytest.mark.parametrize(
        "section",
        [
            "module_identity",
            "hub_link",
            "references",
            "baseline",
            "waivers",
            "time_contract",
            "user_interface",
            "scaffold",
        ],
    )
    def test_every_section_is_required(self, schema: dict, spec: dict, section: str) -> None:
        del spec[section]
        assert _errors(schema, spec)

    def test_unknown_fields_are_refused(self, schema: dict, spec: dict) -> None:
        spec["time_contract"]["databases"][0]["trust_me"] = True
        assert _errors(schema, spec)

    def test_a_waiver_names_a_requirement_a_reason_and_a_backlog_item(
        self, schema: dict, spec: dict
    ) -> None:
        spec["waivers"] = [{"requirement": "M-9", "reason": "short", "backlog_item": "later"}]
        errors = " ".join(_errors(schema, spec))
        assert "short" in errors and "later" in errors
