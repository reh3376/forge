"""fvts.schema.json: meta-valid, the reference spec validates, the encoded safety rules hold."""

from __future__ import annotations

from typing import Any

import pytest
from jsonschema import Draft202012Validator


@pytest.fixture(scope="module")
def validator(schema: dict[str, Any]) -> Draft202012Validator:
    return Draft202012Validator(schema)


def errors(validator: Draft202012Validator, spec: dict[str, Any]) -> list[str]:
    return [e.message for e in validator.iter_errors(spec)]


def test_schema_is_valid_draft_2020_12(schema: dict[str, Any]) -> None:
    Draft202012Validator.check_schema(schema)
    assert schema["$id"] == "forge://governance/fvts/v0.1.0"
    assert len(schema["required"]) == 13
    assert len(schema["properties"]) == 15  # 13 required + metadata + integrity


def test_reference_spec_validates(validator: Draft202012Validator, reference_spec: dict) -> None:
    assert errors(validator, reference_spec) == []


def _drop_status(spec: dict[str, Any]) -> None:
    spec["actions"][0]["handled_statuses"].remove("PENDING")


def _six_states(spec: dict[str, Any]) -> None:
    spec["alarms"]["states"].remove("SHELVED")


@pytest.mark.parametrize(
    ("mutate", "fragment"),
    [
        (
            lambda s: s["actions"][0].__setitem__("required_role", "VIEWER"),
            "'VIEWER' is not one of",
        ),
        (lambda s: s["actions"][0].__setitem__("confirmation", "none"), "'none' is not one of"),
        (lambda s: s["actions"][0].__setitem__("interlock_feedback", False), "True was expected"),
        (_drop_status, "is too short"),
        (lambda s: s["actions"][0].__setitem__("audit", False), "True was expected"),
        (lambda s: s["actions"][2].__setitem__("reason_code_required", False), "True was expected"),
        (lambda s: s["surfaces"][0].__setitem__("authoring", "coded"), "'configured' was expected"),
        (
            lambda s: s["alarms"]["priority_tokens"].__setitem__("HIGH", "brand.red"),
            "does not match",
        ),
        (_six_states, "is too short"),
        (
            lambda s: s["data_bindings"]["points"][3].pop("enum_labels"),
            "'enum_labels' is a required",
        ),
        (
            lambda s: s["data_bindings"]["points"][0].pop("engineering_units"),
            "'engineering_units' is a required",
        ),
        (
            lambda s: s["live_updates"].__setitem__("on_disconnect", "freeze"),
            "'mark_all_stale' was",
        ),
        (
            lambda s: s["live_updates"].__setitem__("max_update_rate_hz", 25),
            "greater than the maximum",
        ),
        (
            lambda s: s["history"]["decimation"].__setitem__("location", "client"),
            "'server' was expected",
        ),
        (lambda s: s.__setitem__("widgets", []), "Additional properties are not allowed"),
        (lambda s: s["integrity"].__setitem__("hash_state", "draft"), "'draft' is not one of"),
    ],
)
def test_schema_rejects_unsafe_contracts(
    validator: Draft202012Validator, spec: dict[str, Any], mutate: Any, fragment: str
) -> None:
    mutate(spec)
    found = errors(validator, spec)
    assert any(fragment in message for message in found), found
