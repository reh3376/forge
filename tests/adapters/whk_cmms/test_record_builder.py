"""Tests for CMMS record builder — assembling complete ContextualRecords."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from forge.adapters.whk_cmms.context import build_record_context
from forge.adapters.whk_cmms.record_builder import build_contextual_record
from forge.core.models.contextual_record import QualityCode


class TestRecordBuilder:
    """Test ContextualRecord assembly from raw CMMS messages."""

    def test_source_adapter_id(self):
        raw = {
            "entity_type": "WorkOrder",
            "globalId": "WO-001",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.source.adapter_id == "whk-cmms"

    def test_source_system(self):
        raw = {
            "entity_type": "WorkOrder",
            "globalId": "WO-001",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.source.system == "whk-cmms"

    def test_tag_path_format(self):
        raw = {
            "entity_type": "WorkOrder",
            "event_type": "create",
            "globalId": "WO-2026-001",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        # Format: cmms.<entity_type>.<event_type>.<id>
        assert record.source.tag_path == "cmms.workorder.create.WO-2026-001"

    def test_tag_path_without_id(self):
        raw = {
            "entity_type": "WorkOrder",
            "event_type": "query",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        # Format without ID: cmms.<entity_type>.<event_type>
        assert record.source.tag_path == "cmms.workorder.query"

    def test_connection_id(self):
        raw = {
            "entity_type": "WorkOrder",
            "globalId": "WO-001",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.source.connection_id == "whk.cmms.workorder"

    def test_timestamp_source_time(self):
        raw = {
            "entity_type": "WorkOrder",
            "updatedAt": "2026-04-07T10:30:00Z",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.timestamp.source_time is not None
        assert isinstance(record.timestamp.source_time, datetime)

    def test_timestamp_server_time(self):
        raw = {
            "entity_type": "WorkOrder",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.timestamp.server_time is not None
        assert isinstance(record.timestamp.server_time, datetime)

    def test_timestamp_ingestion_time(self):
        raw = {
            "entity_type": "WorkOrder",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.timestamp.ingestion_time is not None
        assert isinstance(record.timestamp.ingestion_time, datetime)

    def test_value_is_json(self):
        raw = {
            "entity_type": "WorkOrder",
            "globalId": "WO-001",
            "name": "PM - Tank Inspection",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.value.data_type == "json"
        # Verify it's valid JSON
        parsed = json.loads(record.value.raw)
        assert parsed["entity_type"] == "WorkOrder"

    def test_value_quality_good(self):
        raw = {
            "entity_type": "WorkOrder",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.value.quality == QualityCode.GOOD

    def test_lineage_adapter_id(self):
        raw = {
            "entity_type": "WorkOrder",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.lineage.adapter_id == "whk-cmms"

    def test_lineage_adapter_version(self):
        raw = {
            "entity_type": "WorkOrder",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.lineage.adapter_version == "0.1.0"

    def test_lineage_schema_ref(self):
        raw = {
            "entity_type": "WorkOrder",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.lineage.schema_ref == "forge://schemas/whk-cmms/v0.1.0"

    def test_lineage_transformation_chain(self):
        raw = {
            "entity_type": "WorkOrder",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        chain = record.lineage.transformation_chain
        assert len(chain) >= 2
        assert "build_contextual_record" in chain[-1]

    def test_context_preserved(self):
        raw = {
            "entity_type": "WorkOrder",
            "globalId": "WO-001",
            "assetId": "ASSET-001",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.context.equipment_id == context.equipment_id
        assert record.context.extra == context.extra

    def test_graphql_response_envelope(self):
        """Test handling of GraphQL response with 'data' wrapper."""
        raw = {
            "data": {
                "entity_type": "WorkOrder",
                "globalId": "WO-001",
                "name": "PM",
            }
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.source.tag_path.startswith("cmms.workorder")

    def test_rabbitmq_message_envelope(self):
        """Test handling of RabbitMQ message without outer 'data' wrapper."""
        raw = {
            "entity_type": "WorkOrder",
            "globalId": "WO-001",
            "name": "PM",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert record.source.tag_path.startswith("cmms.workorder")

    def test_value_contains_all_fields(self):
        raw = {
            "entity_type": "WorkOrder",
            "globalId": "WO-001",
            "name": "PM - Tank Inspection",
            "status": "SCHEDULED",
            "assetId": "ASSET-001",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        payload = json.loads(record.value.raw)
        assert payload["name"] == "PM - Tank Inspection"
        assert payload["status"] == "SCHEDULED"

    def test_missing_timestamp_defaults_to_now(self):
        raw = {
            "entity_type": "WorkOrder",
            "globalId": "WO-001",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        # timestamp.source_time should be set (default to now)
        assert record.timestamp.source_time is not None

    def test_entity_type_case_lowercase_in_tag_path(self):
        """Test that entity type is lowercase in tag path."""
        raw = {
            "entity_type": "WorkOrder",
            "event_type": "create",
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        assert "workorder" in record.source.tag_path
        assert "WorkOrder" not in record.source.tag_path

    def test_complex_nested_payload(self):
        """Test that complex nested payloads are preserved as JSON."""
        raw = {
            "entity_type": "WorkOrder",
            "globalId": "WO-001",
            "name": "PM",
            "maintenanceTechAssigned": ["tech_001", "tech_002"],
            "asset": {
                "id": "ASSET-001",
                "path": "Distillery01.Utility01.Neutralization01",
            },
        }
        context = build_record_context(raw)
        record = build_contextual_record(
            raw_event=raw,
            context=context,
            adapter_id="whk-cmms",
            adapter_version="0.1.0",
        )
        payload = json.loads(record.value.raw)
        assert len(payload["maintenanceTechAssigned"]) == 2
        assert payload["asset"]["id"] == "ASSET-001"
