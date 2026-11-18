"""proto_bridge leaves the receipt stamp to the hub (one clock, FB-087)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

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
    assert ts.spoke_time is None


def test_the_spoke_s_send_time_crosses_the_wire_as_spoke_time() -> None:
    """spoke_time is proto field 10 since FB-092; before, it was hub-local as sent_time."""
    ts = RecordTimestamp(source_time=SOURCE, ingestion_time=SPOKE, spoke_time=KEPT)
    msg = record_timestamp_to_proto(ts)
    assert msg.HasField("spoke_time")
    back = proto_to_record_timestamp(msg)
    assert back.ingestion_time == SPOKE
    assert "ingestion_time" in back.model_fields_set
    assert back.spoke_time == KEPT

    # a spoke that sends none leaves the field absent, not zero
    plain = record_timestamp_to_proto(RecordTimestamp(source_time=SOURCE))
    assert not plain.HasField("spoke_time")
    assert proto_to_record_timestamp(plain).spoke_time is None


def test_the_one_clock_fields_cross_the_wire_and_absence_stays_absent() -> None:
    """source_clock and source_uncertainty_seconds (FB-088): present when set, None when not."""
    ts = RecordTimestamp(source_time=SOURCE, source_clock="forge", source_uncertainty_seconds=0.0)
    back = proto_to_record_timestamp(record_timestamp_to_proto(ts))
    assert back.source_clock == "forge"
    assert back.source_uncertainty_seconds == 0.0  # a real bound of zero, not "unset"

    plain = proto_to_record_timestamp(
        record_timestamp_to_proto(RecordTimestamp(source_time=SOURCE))
    )
    assert plain.source_clock is None and plain.source_uncertainty_seconds is None
    msg = record_timestamp_to_proto(RecordTimestamp(source_time=SOURCE))
    assert msg.source_clock == "" and not msg.HasField("source_uncertainty_seconds")


def test_the_correction_fields_cross_the_wire() -> None:
    """source_time_as_sent, source_offset_seconds and time_quality (FB-094 step 3)."""
    from forge.core.clock import TimeQuality

    ts = RecordTimestamp(
        source_time=SOURCE,
        source_time_as_sent=SOURCE + timedelta(seconds=2),
        source_clock="device:WHK01",
        source_offset_seconds=2.0,
        source_uncertainty_seconds=0.105,
        time_quality=TimeQuality(synchronized=True, clock_failure=False, accuracy_class="T0"),
    )
    msg = record_timestamp_to_proto(ts)
    assert msg.HasField("source_time_as_sent") and msg.HasField("source_offset_seconds")
    assert msg.time_quality.synchronized is True and not msg.time_quality.HasField(
        "leap_seconds_known"
    )
    back = proto_to_record_timestamp(msg)
    assert back.source_time_as_sent == SOURCE + timedelta(seconds=2)
    assert back.source_offset_seconds == 2.0 and back.source_clock == "device:WHK01"
    assert back.time_quality == TimeQuality(
        synchronized=True, clock_failure=False, leap_seconds_known=None, accuracy_class="T0"
    )

    plain = proto_to_record_timestamp(
        record_timestamp_to_proto(RecordTimestamp(source_time=SOURCE))
    )
    assert plain.source_time_as_sent is None and plain.source_offset_seconds is None
    assert plain.time_quality is None
