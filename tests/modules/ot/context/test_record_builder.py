"""Tests for the OT record builder — tag + enrichment → ContextualRecord."""

import pytest
from datetime import datetime, timezone

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode as CoreQualityCode,
)
from forge.modules.ot.context.record_builder import build_ot_record, _map_quality
from forge.modules.ot.context.resolvers import EnrichmentContext
from forge.modules.ot.tag_engine.models import StandardTag, MemoryTag, TagValue, TagType
from forge.modules.ot.opcua_client.types import DataType, QualityCode


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_tag() -> StandardTag:
    return StandardTag(
        path="WH/WHK01/Distillery01/TIT_2010/Out_PV",
        data_type=DataType.DOUBLE,
        description="Fermenter temperature",
        engineering_units="degF",
        opcua_node_id="ns=2;s=Distillery01.TIT_2010.Out_PV",
        connection_name="WHK01",
    )


@pytest.fixture
def sample_value() -> TagValue:
    now = datetime.now(tz=timezone.utc)
    return TagValue(
        value=78.4,
        quality=QualityCode.GOOD,
        timestamp=now,
        source_timestamp=now,
    )


@pytest.fixture
def full_enrichment() -> EnrichmentContext:
    return EnrichmentContext(
        site="WH",
        area="Distillery01",
        equipment_id="TIT_2010",
        batch_id="B2026-0408-001",
        lot_id="L-001",
        recipe_id="R-BOURBON-01",
        operating_mode="PRODUCTION",
    )


@pytest.fixture
def empty_enrichment() -> EnrichmentContext:
    return EnrichmentContext()


# ---------------------------------------------------------------------------
# build_ot_record
# ---------------------------------------------------------------------------


class TestBuildOtRecord:

    def test_produces_contextual_record(self, sample_tag, sample_value, full_enrichment):
        record = build_ot_record(tag=sample_tag, tag_value=sample_value, enrichment=full_enrichment)
        assert isinstance(record, ContextualRecord)

    def test_record_source_fields(self, sample_tag, sample_value, full_enrichment):
        record = build_ot_record(tag=sample_tag, tag_value=sample_value, enrichment=full_enrichment)
        assert record.source.adapter_id == "forge-ot-module"
        assert record.source.system == "forge-ot"
        assert record.source.tag_path == "WH/WHK01/Distillery01/TIT_2010/Out_PV"
        assert record.source.connection_id == "WHK01"

    def test_record_timestamp_fields(self, sample_tag, sample_value, full_enrichment):
        record = build_ot_record(tag=sample_tag, tag_value=sample_value, enrichment=full_enrichment)
        assert record.timestamp.source_time == sample_value.source_timestamp
        assert record.timestamp.server_time == sample_value.timestamp
        assert record.timestamp.ingestion_time is not None

    def test_record_value_fields(self, sample_tag, sample_value, full_enrichment):
        record = build_ot_record(tag=sample_tag, tag_value=sample_value, enrichment=full_enrichment)
        assert record.value.raw == 78.4
        assert record.value.engineering_units == "degF"
        assert record.value.quality == CoreQualityCode.GOOD
        assert record.value.data_type == DataType.DOUBLE.value

    def test_record_context_from_enrichment(self, sample_tag, sample_value, full_enrichment):
        record = build_ot_record(tag=sample_tag, tag_value=sample_value, enrichment=full_enrichment)
        assert record.context.site == "WH"
        assert record.context.area == "Distillery01"
        assert record.context.equipment_id == "TIT_2010"
        assert record.context.batch_id == "B2026-0408-001"
        assert record.context.lot_id == "L-001"
        assert record.context.recipe_id == "R-BOURBON-01"
        assert record.context.operating_mode == "PRODUCTION"

    def test_record_lineage(self, sample_tag, sample_value, full_enrichment):
        record = build_ot_record(tag=sample_tag, tag_value=sample_value, enrichment=full_enrichment)
        assert record.lineage.schema_ref == "forge://schemas/ot-module/v0.1.0"
        assert record.lineage.adapter_id == "forge-ot-module"
        assert record.lineage.adapter_version == "0.1.0"
        assert "context_enrichment" in record.lineage.transformation_chain

    def test_record_has_unique_id(self, sample_tag, sample_value, full_enrichment):
        r1 = build_ot_record(tag=sample_tag, tag_value=sample_value, enrichment=full_enrichment)
        r2 = build_ot_record(tag=sample_tag, tag_value=sample_value, enrichment=full_enrichment)
        assert r1.record_id != r2.record_id

    def test_empty_enrichment_produces_none_context(self, sample_tag, sample_value, empty_enrichment):
        record = build_ot_record(tag=sample_tag, tag_value=sample_value, enrichment=empty_enrichment)
        assert record.context.site is None
        assert record.context.area is None
        assert record.context.batch_id is None
        assert record.context.operating_mode is None

    def test_memory_tag_no_connection_id(self, sample_value, full_enrichment):
        tag = MemoryTag(
            path="WH/WHK01/Distillery01/Setpoint/Temp",
            data_type=DataType.DOUBLE,
        )
        record = build_ot_record(tag=tag, tag_value=sample_value, enrichment=full_enrichment)
        assert record.source.connection_id is None

    def test_source_timestamp_fallback(self, sample_tag, full_enrichment):
        """When source_timestamp is None, source_time falls back to timestamp."""
        val = TagValue(
            value=100.0,
            quality=QualityCode.GOOD,
            timestamp=datetime.now(tz=timezone.utc),
            source_timestamp=None,
        )
        record = build_ot_record(tag=sample_tag, tag_value=val, enrichment=full_enrichment)
        assert record.timestamp.source_time == val.timestamp

    def test_custom_adapter_id(self, sample_tag, sample_value, full_enrichment):
        record = build_ot_record(
            tag=sample_tag,
            tag_value=sample_value,
            enrichment=full_enrichment,
            adapter_id="custom-adapter",
            adapter_version="2.0.0",
        )
        assert record.source.adapter_id == "custom-adapter"
        assert record.lineage.adapter_version == "2.0.0"


# ---------------------------------------------------------------------------
# _map_quality
# ---------------------------------------------------------------------------


class TestMapQuality:

    def test_good(self):
        assert _map_quality("GOOD") == CoreQualityCode.GOOD

    def test_uncertain(self):
        assert _map_quality("UNCERTAIN") == CoreQualityCode.UNCERTAIN

    def test_bad(self):
        assert _map_quality("BAD") == CoreQualityCode.BAD

    def test_not_available(self):
        assert _map_quality("NOT_AVAILABLE") == CoreQualityCode.NOT_AVAILABLE

    def test_unknown_defaults_to_not_available(self):
        assert _map_quality("SOMETHING_ELSE") == CoreQualityCode.NOT_AVAILABLE
