"""Every FACTS spec validates against ``facts.schema.json`` and the runner's
vocabulary is the schema's (BACKLOG FB-080).

``ot-module`` is the one exception until FB-079 settles the OT vocabulary
(ROADMAP D-8). It is marked ``xfail(strict=True)``: the day it validates, this
file must change, and ``KNOWN_VOCABULARY_FAILURES`` in
``test_ot_module_spec.py`` shrinks with it.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest
from jsonschema import Draft202012Validator

from forge.governance.facts import SCHEMA_PATH
from forge.governance.facts.runners.facts_runner import (
    PACKAGED_SCHEMA_PATH,
    VOCABULARY,
    FACTSRunner,
    FactsVocabulary,
    schema_enum,
)
from forge.governance.shared.runner import VerdictStatus, verify_spec_hash

if TYPE_CHECKING:
    from pathlib import Path

SPECS_DIR = SCHEMA_PATH.parent.parent / "specs"
SPEC_PATHS = sorted(SPECS_DIR.glob("*.facts.json"))

#: adapter_id → why the spec does not validate yet (and which item fixes it).
VOCABULARY_GAPS = {
    "ot-module": "FB-079 / D-8: the OT spec uses an OPC-UA vocabulary FACTS v0.1.0 lacks",
}


def _spec_id(path: Path) -> str:
    return path.name.removesuffix(".facts.json")


def _param(path: Path, *, xfail_gaps: bool) -> pytest.ParameterSet:
    name = _spec_id(path)
    marks = []
    if xfail_gaps and name in VOCABULARY_GAPS:
        marks.append(pytest.mark.xfail(strict=True, reason=VOCABULARY_GAPS[name]))
    return pytest.param(path, id=name, marks=marks)


CONFORMING = [_param(p, xfail_gaps=True) for p in SPEC_PATHS]
EVERY = [_param(p, xfail_gaps=False) for p in SPEC_PATHS]


@pytest.fixture(scope="module")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def validator(schema: dict) -> Draft202012Validator:
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


@pytest.fixture(scope="module")
def runner() -> FACTSRunner:
    return FACTSRunner(schema_path=SCHEMA_PATH)


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class TestEverySpec:
    def test_specs_are_present(self) -> None:
        assert {_spec_id(p) for p in SPEC_PATHS} >= {"forge-mes", "whk-wms", "ot-module"}

    @pytest.mark.parametrize("path", CONFORMING)
    def test_validates_against_schema(self, validator: Draft202012Validator, path: Path) -> None:
        errors = sorted(validator.iter_errors(_load(path)), key=lambda e: list(e.absolute_path))
        assert not errors, "\n".join(
            f"/{'/'.join(str(s) for s in e.absolute_path)}: {e.message[:120]}" for e in errors
        )

    @pytest.mark.parametrize("path", CONFORMING)
    @pytest.mark.asyncio()
    async def test_runner_schema_valid_verdict(self, runner: FACTSRunner, path: Path) -> None:
        spec = _load(path)
        report = await runner.run(target=spec["adapter_identity"]["adapter_id"], spec=spec)
        verdict = next(v for v in report.verdicts if v.check_id == "facts:schema-valid")
        assert verdict.status is VerdictStatus.PASS, verdict.message

    @pytest.mark.parametrize("path", EVERY)
    def test_hash_matches_content(self, path: Path) -> None:
        ok, msg = verify_spec_hash(_load(path))
        assert ok, msg

    @pytest.mark.parametrize("path", EVERY)
    def test_integrity_block_is_schema_valid(self, schema: dict, path: Path) -> None:
        """Even the OT spec's integrity block conforms (FB-073); only its content lags."""
        block_schema = dict(schema["properties"]["integrity"])
        block_schema["$schema"] = schema["$schema"]
        errors = list(Draft202012Validator(block_schema).iter_errors(_load(path)["integrity"]))
        assert not errors, [e.message for e in errors]


class TestVocabularyParity:
    def test_runner_vocabulary_is_the_schema(self, schema: dict) -> None:
        for attr, path in FactsVocabulary.PATHS.items():
            assert getattr(VOCABULARY, attr) == schema_enum(schema, *path), attr

    def test_packaged_schema_is_the_package_schema(self) -> None:
        assert PACKAGED_SCHEMA_PATH.resolve() == SCHEMA_PATH.resolve()

    def test_vocabulary_the_specs_rely_on(self) -> None:
        assert {"grpc_unary", "grpc_stream", "grpc_server_unary", "grpc_server_stream"} <= (
            VOCABULARY.source_types
        )
        assert {"mtls", "device_token"} <= VOCABULARY.auth_methods
        assert "push" in VOCABULARY.collection_modes
        assert {"enum_normalize", "composite"} <= VOCABULARY.enrichment_rule_types

    def test_schema_enum_rejects_unknown_path(self, schema: dict) -> None:
        with pytest.raises(KeyError):
            schema_enum(schema, "adapter_identity", "colour")

    def test_runner_reads_vocabulary_from_its_own_schema(
        self, tmp_path: Path, schema: dict
    ) -> None:
        narrowed = json.loads(json.dumps(schema))
        narrowed["properties"]["adapter_identity"]["properties"]["tier"]["enum"] = ["OT"]
        path = tmp_path / "narrow.schema.json"
        path.write_text(json.dumps(narrowed), encoding="utf-8")
        assert FACTSRunner(schema_path=path).vocabulary.tiers == frozenset({"OT"})

    def test_default_runner_uses_the_packaged_schema(self) -> None:
        runner = FACTSRunner()
        assert runner.schema is not None
        assert runner.vocabulary == VOCABULARY


class TestSchemaValidCheck:
    @pytest.mark.asyncio()
    async def test_one_violation_per_offending_path(self, runner: FACTSRunner) -> None:
        spec = _load(SPECS_DIR / "whk-wms.facts.json")
        spec["data_contract"]["data_sources"][0]["source_type"] = "telepathy"
        spec["lifecycle"]["magic_timeout_ms"] = 1
        report = await runner.run(target="whk-wms", spec=spec)
        verdict = next(v for v in report.verdicts if v.check_id == "facts:schema-valid")
        assert verdict.status is VerdictStatus.FAIL
        by_field = {v.field: v for v in verdict.violations}
        assert set(by_field) == {"/data_contract/data_sources/0/source_type", "/lifecycle"}
        assert by_field["/data_contract/data_sources/0/source_type"].expected == "enum"
        assert by_field["/lifecycle"].expected == "additionalProperties"
        assert "2 schema violation(s)" in verdict.message

    @pytest.mark.asyncio()
    async def test_is_the_first_verdict(self, runner: FACTSRunner) -> None:
        spec = _load(SPECS_DIR / "whk-wms.facts.json")
        report = await runner.run(target="whk-wms", spec=spec)
        assert report.verdicts[0].check_id == "facts:schema-valid"

    @pytest.mark.asyncio()
    async def test_large_offending_values_are_summarised(self, runner: FACTSRunner) -> None:
        spec = _load(SPECS_DIR / "whk-wms.facts.json")
        spec["surprise"] = {"deep": list(range(50))}
        report = await runner.run(target="whk-wms", spec=spec)
        verdict = next(v for v in report.verdicts if v.check_id == "facts:schema-valid")
        (violation,) = verdict.violations
        assert violation.field == "/"
        assert violation.actual.startswith("<dict of ")
