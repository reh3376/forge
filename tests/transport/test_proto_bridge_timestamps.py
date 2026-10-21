"""proto_bridge leaves the receipt stamp to the hub (one clock, FB-087)."""

from __future__ import annotations

from datetime import UTC, datetime

from forge.core.models.contextual_record import RecordTimestamp
from forge.transport.proto_bridge import (
    proto_to_record_timestamp,
    record_msg,
    record_timestamp_to_proto,
)

SOURCE = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
SPOKE = datetime(2026, 1, 1, 12, 0, 1, tzinfo=UTC)
KEPT = datetime(2026, 1, 1, 11, 59, 59, tzinfo=UTC)


def test_unset_ingestion_time_is_left_to_the_hub() -> None:
    msg = record_msg.RecordTimestamp()
    msg.source_time.FromDatetime(SOURCE)
    ts = proto_to_record_timestamp(msg)
    assert ts.source_time == SOURCE
    assert "ingestion_time" not in ts.model_fields_set
    assert ts.sent_time is None


def test_a_sent_stamp_arrives_as_ingestion_time_and_sent_time_stays_off_the_wire() -> None:
    ts = RecordTimestamp(source_time=SOURCE, ingestion_time=SPOKE, sent_time=KEPT)
    msg = record_timestamp_to_proto(ts)
    back = proto_to_record_timestamp(msg)
    assert back.ingestion_time == SPOKE
    assert "ingestion_time" in back.model_fields_set
    assert back.sent_time is None  # hub-local: the pipeline sets it on receipt
