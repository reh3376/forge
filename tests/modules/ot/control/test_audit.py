"""Tests for control write audit trail.

Covers:
- WriteAuditLogger dispatches to sinks
- Sink failure isolation
- ContextualRecordAuditSink record format
- MqttAuditSink topic and payload
- LogAuditSink logging
- WriteAuditQuery filtering (tag, requestor, status, area)
- WriteAuditQuery stats delegation
"""

import logging
from unittest.mock import AsyncMock

import pytest

from forge.modules.ot.control.audit import (
    ContextualRecordAuditSink,
    LogAuditSink,
    MqttAuditSink,
    WriteAuditLogger,
    WriteAuditQuery,
)
from forge.modules.ot.control.authorization import WriteAuthorizer
from forge.modules.ot.control.interlock import InterlockEngine
from forge.modules.ot.control.models import (
    DataType,
    TagWriteConfig,
    WritePermission,
    WriteRequest,
    WriteResult,
    WriteRole,
    WriteStatus,
)
from forge.modules.ot.control.validation import WriteValidator
from forge.modules.ot.control.write_engine import ControlWriteEngine

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_result(
    tag_path: str = "WH/WHK01/Distillery01/TIT_2010/SP",
    status: WriteStatus = WriteStatus.CONFIRMED,
    **kw,
) -> WriteResult:
    req = WriteRequest(
        tag_path=tag_path,
        value=100.0,
        requestor="op1",
        role=WriteRole.OPERATOR,
        area="Distillery01",
        equipment_id="TIT_2010",
        reason="setpoint change",
    )
    return WriteResult(request=req, status=status, **kw)


def _build_engine() -> ControlWriteEngine:
    validator = WriteValidator()
    validator.register_tag(
        TagWriteConfig(
            tag_path="WH/WHK01/Distillery01/TIT_2010/SP",
            data_type=DataType.FLOAT,
            min_value=0.0,
            max_value=200.0,
        )
    )
    validator.register_tag(
        TagWriteConfig(
            tag_path="WH/WHK01/Granary/T01/SP",
            data_type=DataType.FLOAT,
            min_value=0.0,
            max_value=100.0,
        )
    )

    authorizer = WriteAuthorizer()
    authorizer.add_permission(
        WritePermission(
            permission_id="all",
            area_pattern="*",
            tag_pattern="**",
            min_role=WriteRole.OPERATOR,
        )
    )

    return ControlWriteEngine(
        validator=validator,
        interlock_engine=InterlockEngine(),
        authorizer=authorizer,
    )


# ---------------------------------------------------------------------------
# WriteAuditLogger
# ---------------------------------------------------------------------------


class TestWriteAuditLogger:
    @pytest.mark.asyncio
    async def test_dispatches_to_sinks(self):
        sink1 = AsyncMock()
        sink2 = AsyncMock()

        audit = WriteAuditLogger()
        audit.add_sink(sink1)
        audit.add_sink(sink2)

        result = _make_result()
        await audit.on_write_result(result)

        sink1.write_audit_record.assert_called_once()
        sink2.write_audit_record.assert_called_once()

    @pytest.mark.asyncio
    async def test_sink_failure_isolated(self):
        bad_sink = AsyncMock()
        bad_sink.write_audit_record = AsyncMock(side_effect=RuntimeError("fail"))
        good_sink = AsyncMock()

        audit = WriteAuditLogger()
        audit.add_sink(bad_sink)
        audit.add_sink(good_sink)

        result = _make_result()
        await audit.on_write_result(result)

        good_sink.write_audit_record.assert_called_once()

    def test_add_remove_sink(self):
        audit = WriteAuditLogger()
        sink = AsyncMock()
        audit.add_sink(sink)
        assert audit.sink_count == 1
        audit.remove_sink(sink)
        assert audit.sink_count == 0

    @pytest.mark.asyncio
    async def test_record_contains_expected_fields(self):
        sink = AsyncMock()
        audit = WriteAuditLogger()
        audit.add_sink(sink)

        result = _make_result()
        await audit.on_write_result(result)

        record = sink.write_audit_record.call_args[0][0]
        assert record["tag_path"] == "WH/WHK01/Distillery01/TIT_2010/SP"
        assert record["status"] == "CONFIRMED"
        assert record["requestor"] == "op1"
        assert record["role"] == "OPERATOR"


# ---------------------------------------------------------------------------
# ContextualRecordAuditSink
# ---------------------------------------------------------------------------


class TestContextualRecordAuditSink:
    @pytest.mark.asyncio
    async def test_writes_a_contextual_record_to_the_sink(self):
        sink_store = AsyncMock()
        sink = ContextualRecordAuditSink(sink_store, site="whk01")

        record = _make_result().to_dict()
        await sink.write_audit_record(record)

        sink_store.write_batch.assert_called_once()
        batch = sink_store.write_batch.call_args[0][0]
        assert len(batch) == 1 and sink.records_written == 1
        cr = batch[0]
        assert cr.source.adapter_id == "forge-ot-module" and cr.source.system == "forge-ot"
        assert cr.source.tag_path == "ot.control.write.WH/WHK01/Distillery01/TIT_2010/SP"
        assert cr.context.area == "Distillery01" and cr.context.site == "whk01"
        assert cr.context.operator_id == record["requestor"]
        assert cr.context.event_type == "control.write"
        assert cr.context.extra["target_tag_path"] == "WH/WHK01/Distillery01/TIT_2010/SP"
        assert cr.context.extra["write_status"] == record["status"]
        assert cr.value.raw["requested_value"] == record["requested_value"]
        assert cr.lineage.schema_ref == "forge://schemas/ot-module/v0.1.0"
        assert cr.lineage.transformation_chain == ["ot:control-write-engine"]
        assert cr.timestamp.source_time.isoformat() == record["timestamp"]

    @pytest.mark.asyncio
    async def test_quality_follows_the_outcome(self):
        from forge.core.models.contextual_record import QualityCode as CoreQuality
        from forge.modules.ot.control.audit import write_result_to_record

        base = _make_result().to_dict()
        confirmed = write_result_to_record({**base, "status": "CONFIRMED"})
        unconfirmed = write_result_to_record({**base, "status": "UNCONFIRMED"})
        rejected = write_result_to_record(
            {
                **base,
                "status": "REJECTED_INTERLOCK",
                "interlock_error": "IL-1 blocked",
                "interlock_rule_id": "IL-1",
            }
        )
        assert confirmed.value.quality is CoreQuality.GOOD
        assert unconfirmed.value.quality is CoreQuality.UNCERTAIN
        assert rejected.value.quality is CoreQuality.BAD
        assert rejected.context.extra["error"] == "IL-1 blocked"
        assert rejected.context.extra["interlock_rule_id"] == "IL-1"
        # Odd timestamps never break the audit path.
        weird = write_result_to_record({**base, "timestamp": "not-a-date", "completed_at": None})
        assert weird.timestamp.source_time.tzinfo is not None

    @pytest.mark.asyncio
    async def test_review_fields_reach_the_record(self):
        """FB-074: origin, reason code, staging and the review rejection are audited."""
        from forge.modules.ot.control.audit import write_result_to_record

        base = _make_result().to_dict()
        assert base["origin"] == "OPERATOR"
        plain = write_result_to_record(base)
        assert plain.context.extra["write_origin"] == "OPERATOR"
        assert "reason_code" not in plain.context.extra and "staged_at" not in plain.context.extra

        committed = write_result_to_record(
            {
                **base,
                "reason_code": "setpoint_tune",
                "staged_at": "2026-10-17T12:00:00+00:00",
                "review_passed": True,
            }
        )
        assert committed.context.extra["reason_code"] == "setpoint_tune"
        assert committed.context.extra["staged_at"] == "2026-10-17T12:00:00+00:00"

        refused = write_result_to_record(
            {
                **base,
                "status": "REJECTED_REVIEW",
                "review_error": "Tag X requires a reason code",
                "stage_attempt": True,
            }
        )
        assert refused.context.extra["error"] == "Tag X requires a reason code"
        assert refused.context.extra["stage_attempt"] is True
        assert refused.value.quality.value == "BAD"

        system = write_result_to_record({**base, "origin": "SYSTEM"})
        assert system.context.extra["write_origin"] == "SYSTEM"
        legacy = write_result_to_record({k: v for k, v in base.items() if k != "origin"})
        assert legacy.context.extra["write_origin"] == "OPERATOR"


# ---------------------------------------------------------------------------
# MqttAuditSink
# ---------------------------------------------------------------------------


class TestMqttAuditSink:
    @pytest.mark.asyncio
    async def test_publishes_audit_record(self):
        mqtt = AsyncMock()
        sink = MqttAuditSink(mqtt, topic_prefix="whk/whk01")

        record = _make_result().to_dict()
        await sink.write_audit_record(record)

        mqtt.publish.assert_called_once()
        call_args = mqtt.publish.call_args
        topic = call_args[0][0]
        assert "Distillery01/ot/control/audit/" in topic
        assert call_args[1]["qos"] == 1
        assert call_args[1]["retain"] is False

    @pytest.mark.asyncio
    async def test_global_area_fallback(self):
        mqtt = AsyncMock()
        sink = MqttAuditSink(mqtt)

        record = _make_result(tag_path="t/tag").to_dict()
        record["area"] = ""
        await sink.write_audit_record(record)

        topic = mqtt.publish.call_args[0][0]
        assert "global/ot/control/audit" in topic


# ---------------------------------------------------------------------------
# LogAuditSink
# ---------------------------------------------------------------------------


class TestLogAuditSink:
    @pytest.mark.asyncio
    async def test_logs_record(self, caplog):
        sink = LogAuditSink(log_level=logging.INFO)

        with caplog.at_level(logging.INFO, logger="forge.ot.control.audit"):
            record = _make_result().to_dict()
            await sink.write_audit_record(record)

        assert "WRITE_AUDIT" in caplog.text
        assert "CONFIRMED" in caplog.text
        assert "TIT_2010" in caplog.text


# ---------------------------------------------------------------------------
# WriteAuditQuery
# ---------------------------------------------------------------------------


class TestWriteAuditQuery:
    @pytest.mark.asyncio
    async def test_query_all(self):
        engine = _build_engine()
        await engine.execute(
            WriteRequest(
                tag_path="WH/WHK01/Distillery01/TIT_2010/SP",
                value=100.0,
                requestor="op1",
                role=WriteRole.OPERATOR,
                area="Distillery01",
            )
        )
        await engine.execute(
            WriteRequest(
                tag_path="WH/WHK01/Granary/T01/SP",
                value=50.0,
                requestor="op2",
                role=WriteRole.ENGINEER,
                area="Granary",
            )
        )

        query = WriteAuditQuery(engine)
        results = query.query()
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_filter_by_tag(self):
        engine = _build_engine()
        await engine.execute(
            WriteRequest(
                tag_path="WH/WHK01/Distillery01/TIT_2010/SP",
                value=100.0,
                requestor="op1",
                role=WriteRole.OPERATOR,
                area="Distillery01",
            )
        )
        await engine.execute(
            WriteRequest(
                tag_path="WH/WHK01/Granary/T01/SP",
                value=50.0,
                requestor="op2",
                role=WriteRole.ENGINEER,
                area="Granary",
            )
        )

        query = WriteAuditQuery(engine)
        results = query.query(tag_path="WH/WHK01/Distillery01/TIT_2010/SP")
        assert len(results) == 1
        assert results[0]["tag_path"] == "WH/WHK01/Distillery01/TIT_2010/SP"

    @pytest.mark.asyncio
    async def test_filter_by_requestor(self):
        engine = _build_engine()
        await engine.execute(
            WriteRequest(
                tag_path="WH/WHK01/Distillery01/TIT_2010/SP",
                value=100.0,
                requestor="op1",
                role=WriteRole.OPERATOR,
                area="Distillery01",
            )
        )
        await engine.execute(
            WriteRequest(
                tag_path="WH/WHK01/Granary/T01/SP",
                value=50.0,
                requestor="op2",
                role=WriteRole.ENGINEER,
                area="Granary",
            )
        )

        query = WriteAuditQuery(engine)
        results = query.query(requestor="op2")
        assert len(results) == 1
        assert results[0]["requestor"] == "op2"

    @pytest.mark.asyncio
    async def test_filter_by_status(self):
        engine = _build_engine()
        # Confirmed
        await engine.execute(
            WriteRequest(
                tag_path="WH/WHK01/Distillery01/TIT_2010/SP",
                value=100.0,
                requestor="op1",
                role=WriteRole.OPERATOR,
                area="Distillery01",
            )
        )
        # Rejected (out of range)
        await engine.execute(
            WriteRequest(
                tag_path="WH/WHK01/Distillery01/TIT_2010/SP",
                value=999.0,
                requestor="op1",
                role=WriteRole.OPERATOR,
                area="Distillery01",
            )
        )

        query = WriteAuditQuery(engine)
        rejected = query.query(status="REJECTED_VALIDATION")
        assert len(rejected) == 1

    @pytest.mark.asyncio
    async def test_filter_by_area(self):
        engine = _build_engine()
        await engine.execute(
            WriteRequest(
                tag_path="WH/WHK01/Distillery01/TIT_2010/SP",
                value=100.0,
                requestor="op1",
                role=WriteRole.OPERATOR,
                area="Distillery01",
            )
        )
        await engine.execute(
            WriteRequest(
                tag_path="WH/WHK01/Granary/T01/SP",
                value=50.0,
                requestor="op2",
                role=WriteRole.ENGINEER,
                area="Granary",
            )
        )

        query = WriteAuditQuery(engine)
        results = query.query(area="Granary")
        assert len(results) == 1

    @pytest.mark.asyncio
    async def test_stats(self):
        engine = _build_engine()
        await engine.execute(
            WriteRequest(
                tag_path="WH/WHK01/Distillery01/TIT_2010/SP",
                value=100.0,
                requestor="op1",
                role=WriteRole.OPERATOR,
                area="Distillery01",
            )
        )

        query = WriteAuditQuery(engine)
        stats = query.get_stats()
        assert stats["total_writes"] == 1
        assert stats["confirmed"] == 1
