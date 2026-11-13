"""Tests for the OT record builder — tag + enrichment → ContextualRecord."""

from datetime import UTC, datetime, timedelta

import pytest

from forge.core.clock import ClockEstimate, SourceStampMissingError
from forge.core.models.contextual_record import (
    ContextualRecord,
)
from forge.core.models.contextual_record import (
    QualityCode as CoreQualityCode,
)
from forge.modules.ot.context.record_builder import _map_quality, build_ot_record
from forge.modules.ot.context.resolvers import EnrichmentContext
from forge.modules.ot.opcua_client.types import DataType, QualityCode
from forge.modules.ot.tag_engine.models import MemoryTag, StandardTag, TagValue

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
    now = datetime.now(tz=UTC)
    return TagValue(
        value=78.4,
        quality=QualityCode.GOOD,
        timestamp=now,
        source_timestamp=now - timedelta(milliseconds=40),
        server_timestamp=now - timedelta(milliseconds=20),
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
        assert record.timestamp.server_time == sample_value.server_timestamp
        assert record.timestamp.ingestion_time is not None
        assert record.timestamp.source_clock is None  # the connection has not declared one
        assert record.timestamp.source_uncertainty_seconds is None

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

    def test_empty_enrichment_produces_none_context(
        self, sample_tag, sample_value, empty_enrichment
    ):
        record = build_ot_record(
            tag=sample_tag, tag_value=sample_value, enrichment=empty_enrichment
        )
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

    def test_value_without_source_stamp_is_refused_unless_the_connection_declared_forge(
        self, sample_tag, full_enrichment
    ):
        """One clock (FB-088): the OT builder never invents a source time."""
        read_at = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)
        value = TagValue(value=1.0, quality=QualityCode.GOOD, timestamp=read_at)
        with pytest.raises(SourceStampMissingError, match="connection WHK01, tag WH/WHK01"):
            build_ot_record(tag=sample_tag, tag_value=value, enrichment=full_enrichment)
        with pytest.raises(SourceStampMissingError):
            build_ot_record(
                tag=sample_tag,
                tag_value=value,
                enrichment=full_enrichment,
                source_timestamp_origin="device",
            )
        record = build_ot_record(
            tag=sample_tag,
            tag_value=value,
            enrichment=full_enrichment,
            source_timestamp_origin="forge",
        )
        # Forge's read time (the registry's timestamp) stands in, the record says so, and
        # the tag's scan interval (STANDARD, 1 s) is the uncertainty until FB-094's bound
        assert record.timestamp.source_time == read_at
        assert record.timestamp.source_clock == "forge"
        assert record.timestamp.source_uncertainty_seconds == 1.0
        assert record.timestamp.server_time is None

    def test_declared_origin_names_the_clock_on_a_stamped_value(
        self, sample_tag, sample_value, full_enrichment
    ):
        record = build_ot_record(
            tag=sample_tag,
            tag_value=sample_value,
            enrichment=full_enrichment,
            source_timestamp_origin="device",
        )
        assert record.timestamp.source_time == sample_value.source_timestamp
        assert record.timestamp.source_clock == "device:WHK01"

    def test_a_measured_clock_corrects_the_stamps_on_entry(self, sample_tag, full_enrichment):
        """The device's offset is subtracted where the stamp enters (one-clock record P-3, P-10)."""
        read_at = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)
        value = TagValue(
            value=1.0,
            quality=QualityCode.GOOD,
            timestamp=read_at,
            source_timestamp=read_at + timedelta(seconds=2),  # the PLC runs 2 s ahead
            server_timestamp=read_at + timedelta(seconds=2, milliseconds=10),
        )
        estimate = ClockEstimate("device:WHK01", 2.0, 0.004, within_tolerance=True)
        record = build_ot_record(
            tag=sample_tag,
            tag_value=value,
            enrichment=full_enrichment,
            source_timestamp_origin="device",
            clock=estimate,
        )
        ts = record.timestamp
        assert ts.source_time == read_at  # corrected to master time
        assert ts.source_time_as_sent == read_at + timedelta(seconds=2)
        assert ts.source_offset_seconds == 2.0 and ts.source_clock == "device:WHK01"
        assert ts.server_time == read_at + timedelta(milliseconds=10)  # the same clock, corrected
        assert ts.source_uncertainty_seconds == pytest.approx(1.004)  # half RTT + 1 s scan
        assert ts.time_quality is not None and ts.time_quality.synchronized is True

    def test_without_a_measured_clock_the_stamp_stands_as_sent(
        self, sample_tag, sample_value, full_enrichment
    ):
        record = build_ot_record(
            tag=sample_tag,
            tag_value=sample_value,
            enrichment=full_enrichment,
            source_timestamp_origin="device",
        )
        ts = record.timestamp
        assert ts.source_time == sample_value.source_timestamp == ts.source_time_as_sent
        assert ts.source_offset_seconds is None and ts.time_quality is None
        assert ts.server_time == sample_value.server_timestamp

    def test_an_estimate_of_another_clock_does_not_correct(
        self, sample_tag, sample_value, full_enrichment
    ):
        record = build_ot_record(
            tag=sample_tag,
            tag_value=sample_value,
            enrichment=full_enrichment,
            source_timestamp_origin="server",
            clock=ClockEstimate("device:WHK01", 2.0, None, True),
        )
        assert record.timestamp.source_offset_seconds is None
        assert record.timestamp.source_time == sample_value.source_timestamp

    def test_forge_born_tag_has_forge_as_its_source_clock(self, full_enrichment):
        """A memory tag has no connection: Forge's clock is its source clock by nature."""
        tag = MemoryTag(path="WH/WHK01/Calc/Setpoint", data_type=DataType.DOUBLE)
        read_at = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)
        value = TagValue(value=50.0, quality=QualityCode.GOOD, timestamp=read_at)
        record = build_ot_record(tag=tag, tag_value=value, enrichment=full_enrichment)
        assert record.timestamp.source_time == read_at
        assert record.timestamp.source_clock == "forge"
        assert record.source.connection_id is None

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
