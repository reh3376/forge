"""Tests for ERPI record builder — ContextualRecord assembly."""

from __future__ import annotations

import json

import pytest

from forge.adapters.whk_erpi.context import build_record_context
from forge.adapters.whk_erpi.record_builder import build_contextual_record
from forge.core.models.contextual_record import QualityCode


_SAMPLE_EVENT = {
    "data": {
        "event_type": "create",
        "recordName": "Item",
        "data": {
            "id": "cuid_item_001",
            "globalId": "ITEM-NS-00412",
            "name": "Corn - #2 Yellow Dent",
            "transactionInitiator": "ERP",
            "transactionStatus": "PENDING",
            "transactionType": "CREATE",
            "createdAt": "2026-04-07T10:00:00Z",
            "updatedAt": "2026-04-07T10:30:00Z",
        },
        "messageId": "msg-001",
    },
}


class TestRecordBuilder:
    def _build(self, raw=None):
        raw = raw or _SAMPLE_EVENT
        ctx = build_record_context(raw)
        return build_contextual_record(
            raw_event=raw,
            context=ctx,
            adapter_id="whk-erpi",
            adapter_version="0.1.0",
        )

    def test_source_adapter_id(self):
        record = self._build()
        assert record.source.adapter_id == "whk-erpi"

    def test_source_system(self):
        record = self._build()
        assert record.source.system == "whk-erpi"

    def test_tag_path_format(self):
        record = self._build()
        assert record.source.tag_path == "erpi.item.create.ITEM-NS-00412"

    def test_connection_id(self):
        record = self._build()
        assert record.source.connection_id == "wh.whk01.distillery01.item"

    def test_timestamp_source_time(self):
        record = self._build()
        # Should use updatedAt (preferred over createdAt)
        assert record.timestamp.source_time.hour == 10
        assert record.timestamp.source_time.minute == 30

    def test_timestamp_ingestion_time(self):
        record = self._build()
        assert record.timestamp.ingestion_time is not None

    def test_value_is_json(self):
        record = self._build()
        assert record.value.data_type == "json"
        payload = json.loads(record.value.raw)
        assert payload["name"] == "Corn - #2 Yellow Dent"
        assert payload["globalId"] == "ITEM-NS-00412"

    def test_value_quality_good(self):
        record = self._build()
        assert record.value.quality == QualityCode.GOOD

    def test_lineage_schema_ref(self):
        record = self._build()
        assert record.lineage.schema_ref == "forge://schemas/whk-erpi/v0.1.0"

    def test_lineage_adapter(self):
        record = self._build()
        assert record.lineage.adapter_id == "whk-erpi"
        assert record.lineage.adapter_version == "0.1.0"

    def test_lineage_transformation_chain(self):
        record = self._build()
        chain = record.lineage.transformation_chain
        assert len(chain) == 3
        assert chain[0] == "erpi.v1.Item"
        assert "context.build_record_context" in chain[1]
        assert "record_builder.build_contextual_record" in chain[2]

    def test_context_preserved(self):
        record = self._build()
        assert record.context.extra["cross_system_id"] == "ITEM-NS-00412"
        assert record.context.extra["entity_type"] == "Item"

    def test_missing_timestamp_defaults_to_now(self):
        raw = {
            "data": {
                "event_type": "create",
                "recordName": "Account",
                "data": {"globalId": "ACC-001"},
            },
        }
        record = self._build(raw)
        assert record.timestamp.source_time is not None

    def test_barrel_entity_tag_path(self):
        raw = {
            "data": {
                "event_type": "update",
                "recordName": "Barrel",
                "data": {
                    "globalId": "BRL-001",
                    "updatedAt": "2026-04-07T14:00:00Z",
                },
            },
        }
        record = self._build(raw)
        assert record.source.tag_path == "erpi.barrel.update.BRL-001"
        assert record.source.connection_id == "wh.whk01.distillery01.barrel"
