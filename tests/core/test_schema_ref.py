"""The one schema-reference grammar and its three roles (FB-008)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from forge.core.models.adapter import DataContract
from forge.core.models.contextual_record import RecordLineage
from forge.core.schema_ref import (
    SchemaRef,
    SchemaRefError,
    is_schema_ref,
    parse_schema_ref,
    require_schema_id,
    require_version_ref,
    require_versioned_ref,
)


class TestGrammar:
    @pytest.mark.parametrize(
        ("text", "spoke", "entity", "version", "role"),
        [
            ("forge://schemas/whk-wms/v0.1.0", "whk-wms", None, "0.1.0", "contract"),
            ("forge://schemas/opcua-generic/v1", "opcua-generic", None, "1", "contract"),
            ("forge://schemas/whk-wms/Barrel", "whk-wms", "Barrel", None, "schema"),
            ("forge://schemas/whk-wms/Barrel/v1.0.0", "whk-wms", "Barrel", "1.0.0", "version"),
            ("forge://schemas/ot-module/settings/v1", "ot-module", "settings", "1", "version"),
            ("forge://schemas/ot-module/bridge/v0.3.0", "ot-module", "bridge", "0.3.0", "version"),
            (
                "forge://schemas/forge-mes/v0.11.0-beta.1",
                "forge-mes",
                None,
                "0.11.0-beta.1",
                "contract",
            ),
            ("forge://schemas/whk-wms", "whk-wms", None, None, "spoke"),
        ],
    )
    def test_parses_every_role(self, text, spoke, entity, version, role):
        ref = parse_schema_ref(text)
        assert (ref.spoke, ref.entity, ref.version, ref.role) == (spoke, entity, version, role)
        assert str(ref) == text
        assert is_schema_ref(text)

    @pytest.mark.parametrize(
        "text",
        [
            "",
            "whk-wms/Barrel",
            "http://example.com/schema",
            "forge://schemas/",
            "forge://schemas/whk-wms/",
            "forge://schemas/whk-wms/v0.3.0/bridge",  # the old OT bridge form
            "forge://schemas/whk-wms/Barrel/1.0.0",  # version without its v
            "forge://schemas/whk-wms/v1/v2",
            "forge://schemas/whk-wms/Barrel/Extra",
            "forge://schemas/whk-wms/1Barrel",
        ],
    )
    def test_rejects_what_is_not_the_grammar(self, text):
        assert not is_schema_ref(text)
        with pytest.raises(SchemaRefError, match="not a schema reference"):
            parse_schema_ref(text)

    def test_schema_id_and_versioned(self):
        ref = parse_schema_ref("forge://schemas/whk-wms/Barrel/v3")
        assert str(ref.schema_id) == "forge://schemas/whk-wms/Barrel"
        assert str(ref.schema_id.versioned(4)) == "forge://schemas/whk-wms/Barrel/v4"
        assert parse_schema_ref("forge://schemas/whk-wms/v1").schema_id is None
        assert SchemaRef("whk-wms", "Barrel", "1.0.0") == parse_schema_ref(
            "forge://schemas/whk-wms/Barrel/v1.0.0"
        )


class TestRoleRequirements:
    def test_versioned_ref_takes_contract_and_version_refs(self):
        assert require_versioned_ref("forge://schemas/whk-wms/v0.1.0")
        assert require_versioned_ref("forge://schemas/whk-wms/Barrel/v1.0.0")
        with pytest.raises(SchemaRefError, match="must name a version"):
            require_versioned_ref("forge://schemas/whk-wms/Barrel")
        with pytest.raises(SchemaRefError, match=r"lineage\.schema_ref must name a version"):
            require_versioned_ref("forge://schemas/whk-wms", field="lineage.schema_ref")

    def test_schema_id_takes_only_an_unversioned_entity(self):
        assert require_schema_id("forge://schemas/whk-wms/Barrel")
        for text in ("forge://schemas/whk-wms/v1", "forge://schemas/whk-wms/Barrel/v1"):
            with pytest.raises(SchemaRefError, match="must be a schema id"):
                require_schema_id(text)

    def test_version_ref_takes_only_a_versioned_entity(self):
        assert require_version_ref("forge://schemas/whk-wms/Barrel/v1.0.0")
        for text in ("forge://schemas/whk-wms/v1", "forge://schemas/whk-wms/Barrel"):
            with pytest.raises(SchemaRefError, match="must be a version ref"):
                require_version_ref(text)


class TestModelsHoldTheGrammar:
    def test_data_contract_needs_a_versioned_ref(self):
        assert DataContract(schema_ref="forge://schemas/forge-mes/v0.1.0").schema_ref
        with pytest.raises(ValidationError, match="schema_ref must name a version"):
            DataContract(schema_ref="forge://schemas/forge-mes/Lot")
        with pytest.raises(ValidationError, match="not a schema reference"):
            DataContract(schema_ref="forge://schemas/forge-mes/v0.1.0/extra")

    def test_record_lineage_needs_a_versioned_ref(self):
        ok = RecordLineage(
            schema_ref="forge://schemas/ot-module/bridge/v0.3.0",
            adapter_id="ot-module",
            adapter_version="0.3.0",
        )
        assert ok.schema_ref.endswith("/bridge/v0.3.0")
        with pytest.raises(ValidationError, match=r"lineage\.schema_ref must name a version"):
            RecordLineage(
                schema_ref="forge://schemas/ot-module/bridge", adapter_id="ot", adapter_version="1"
            )
