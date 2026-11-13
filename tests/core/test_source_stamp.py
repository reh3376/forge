"""A source stamp is never invented (one clock, FB-088; D-9 step 1)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from forge.core.clock import (
    FORGE_CLOCK,
    SERVER_LINK,
    SOURCE_TIMESTAMP_ORIGINS,
    ClockEstimate,
    ClockOffsetTracker,
    SourceStampMissingError,
    TimeQuality,
    resolve_source_stamp,
    source_clock_name,
)
from forge.core.models.contextual_record import RecordTimestamp

STAMP = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)
READ_AT = datetime(2026, 6, 1, 12, 0, 3, tzinfo=UTC)


class TestSourceClockName:
    def test_the_four_origins_of_the_record(self) -> None:
        assert SOURCE_TIMESTAMP_ORIGINS == ("device", "server", "edge", "forge")
        assert source_clock_name("device", "WHK01") == "device:WHK01"
        assert source_clock_name("server", "ignition") == "server:ignition"
        assert source_clock_name("edge", "node-7") == "edge:node-7"
        assert source_clock_name("forge", "anything") == FORGE_CLOCK

    def test_undeclared_and_unnamed(self) -> None:
        assert source_clock_name(None) is None
        assert source_clock_name("device", None) is None  # no connection name to attach

    def test_unknown_origin_is_a_configuration_error(self) -> None:
        with pytest.raises(ValueError, match="source_timestamp_origin must be one of"):
            source_clock_name("plc", "WHK01")


class TestResolveSourceStamp:
    def test_a_stamp_the_source_sent_is_the_source_time(self) -> None:
        stamp = resolve_source_stamp(STAMP, origin=None, read_at=READ_AT, adapter_id="a")
        assert stamp.source_time == STAMP
        assert stamp.source_clock is None and stamp.source_uncertainty_seconds is None

    def test_a_declared_origin_names_the_stamping_clock(self) -> None:
        stamp = resolve_source_stamp(
            STAMP, origin="device", read_at=READ_AT, adapter_id="a", connection="WHK01"
        )
        assert stamp.source_clock == "device:WHK01"

    def test_a_connection_declared_forge_keeps_a_stamp_it_sends(self) -> None:
        # the declaration-against-wire check is FB-094's; the real stamp is kept, unnamed
        stamp = resolve_source_stamp(STAMP, origin="forge", read_at=READ_AT, adapter_id="a")
        assert stamp.source_time == STAMP and stamp.source_clock is None

    def test_without_a_stamp_only_origin_forge_may_stand_in(self) -> None:
        stamp = resolve_source_stamp(
            None, origin="forge", read_at=READ_AT, poll_bound_seconds=0.5, adapter_id="a"
        )
        assert stamp.source_time == READ_AT
        assert stamp.source_clock == FORGE_CLOCK
        assert stamp.source_uncertainty_seconds == 0.5

    @pytest.mark.parametrize("origin", [None, "device", "server", "edge"])
    def test_without_a_stamp_every_other_origin_refuses(self, origin: str | None) -> None:
        with pytest.raises(SourceStampMissingError) as info:
            resolve_source_stamp(
                None,
                origin=origin,
                read_at=READ_AT,
                adapter_id="whk-wms",
                connection="wms-prod",
                tag_path="wms.barrel.fill",
                detail="unparseable timestamp 'yesterday'",
            )
        exc = info.value
        assert exc.cause == "source_stamp_missing"
        assert exc.adapter_id == "whk-wms" and exc.connection == "wms-prod"
        assert exc.tag_path == "wms.barrel.fill"
        message = str(exc)
        assert message.startswith("whk-wms: a value on connection wms-prod, tag wms.barrel.fill")
        assert "(unparseable timestamp 'yesterday')" in message
        assert "does not declare source_timestamp_origin: forge" in message
        assert "FB-088" in message

    def test_the_message_without_a_place(self) -> None:
        with pytest.raises(SourceStampMissingError, match=r"^rest: a value arrived without"):
            resolve_source_stamp(None, origin=None, read_at=READ_AT, adapter_id="rest")

    def test_an_unknown_origin_is_refused_as_configuration(self) -> None:
        with pytest.raises(ValueError, match="must be one of"):
            resolve_source_stamp(None, origin="plc", read_at=READ_AT, adapter_id="a")


class TestRecordTimestampFields:
    """The two step-1 fields of the one-clock record's P-3 on RecordTimestamp."""

    def test_defaults_are_undeclared(self) -> None:
        ts = RecordTimestamp(source_time=STAMP)
        assert ts.source_clock is None and ts.source_uncertainty_seconds is None
        assert "source_clock" not in RecordTimestamp.TIME_BASES

    @pytest.mark.parametrize("clock", ["forge", "device:WHK01", "server:ignition", "edge:n1"])
    def test_source_clock_takes_the_record_s_shapes(self, clock: str) -> None:
        assert RecordTimestamp(source_time=STAMP, source_clock=clock).source_clock == clock

    @pytest.mark.parametrize("clock", ["plc:WHK01", "device", "device:", "Forge", ""])
    def test_source_clock_rejects_other_shapes(self, clock: str) -> None:
        with pytest.raises(ValidationError):
            RecordTimestamp(source_time=STAMP, source_clock=clock)

    def test_uncertainty_is_a_non_negative_bound(self) -> None:
        assert (
            RecordTimestamp(source_time=STAMP, source_uncertainty_seconds=0).model_dump()[
                "source_uncertainty_seconds"
            ]
            == 0
        )
        with pytest.raises(ValidationError):
            RecordTimestamp(source_time=STAMP, source_uncertainty_seconds=-0.1)

    def test_json_round_trip(self) -> None:
        ts = RecordTimestamp(
            source_time=STAMP, source_clock="forge", source_uncertainty_seconds=1.0
        )
        back = RecordTimestamp.model_validate(ts.model_dump(mode="json"))
        assert back.source_clock == "forge" and back.source_uncertainty_seconds == 1.0


class TestCorrectionOnEntry:
    """A measured clock corrects the stamp where it enters (one-clock record P-3, P-10)."""

    ESTIMATE = ClockEstimate(
        clock_id="device:WHK01",
        offset_seconds=2.0,
        uncertainty_seconds=0.005,
        within_tolerance=True,
    )

    def test_the_stamp_is_corrected_and_everything_done_is_recorded(self) -> None:
        stamp = resolve_source_stamp(
            STAMP,
            origin="device",
            read_at=READ_AT,
            sampling_bound_seconds=1.0,  # the tag's scan interval (P-6)
            adapter_id="ot",
            connection="WHK01",
            clock=self.ESTIMATE,
        )
        assert stamp.source_time == STAMP - timedelta(seconds=2)
        assert stamp.source_time_as_sent == STAMP
        assert stamp.source_offset_seconds == 2.0
        assert stamp.source_clock == "device:WHK01"
        assert stamp.source_uncertainty_seconds == pytest.approx(1.005)  # half RTT + sampling
        assert stamp.time_quality == TimeQuality(synchronized=True, clock_failure=False)
        fields = stamp.timestamp_fields()
        assert set(fields) == {
            "source_time",
            "source_time_as_sent",
            "source_clock",
            "source_offset_seconds",
            "source_uncertainty_seconds",
            "time_quality",
        }
        record = RecordTimestamp(**fields)
        assert record.source_time_as_sent == STAMP and record.source_offset_seconds == 2.0

    def test_a_breaching_clock_says_so_in_the_time_quality(self) -> None:
        estimate = ClockEstimate("device:WHK01", 5.0, None, within_tolerance=False)
        stamp = resolve_source_stamp(
            STAMP,
            origin="device",
            read_at=READ_AT,
            adapter_id="ot",
            connection="WHK01",
            clock=estimate,
        )
        assert stamp.time_quality is not None and stamp.time_quality.synchronized is False
        assert stamp.source_uncertainty_seconds == 0.0  # no round trip known, no sampling bound

    def test_an_estimate_of_another_clock_does_not_apply(self) -> None:
        """Only the clock that stamped the value may correct it."""
        stamp = resolve_source_stamp(
            STAMP,
            origin="server",
            read_at=READ_AT,
            adapter_id="ot",
            connection="WHK01",
            clock=self.ESTIMATE,
        )
        assert stamp.source_time == STAMP and stamp.source_offset_seconds is None
        assert stamp.source_time_as_sent == STAMP and stamp.source_clock == "server:WHK01"
        assert stamp.time_quality is None

    def test_an_undeclared_connection_is_not_corrected(self) -> None:
        stamp = resolve_source_stamp(
            STAMP,
            origin=None,
            read_at=READ_AT,
            adapter_id="ot",
            connection="WHK01",
            clock=self.ESTIMATE,
        )
        assert stamp.source_time == STAMP and stamp.source_offset_seconds is None
        assert stamp.source_time_as_sent == STAMP

    def test_forge_s_own_read_time_has_nothing_as_sent(self) -> None:
        stamp = resolve_source_stamp(None, origin="forge", read_at=READ_AT, adapter_id="ot")
        assert stamp.source_time_as_sent is None and stamp.source_offset_seconds is None

    def test_the_estimate_comes_from_the_tracker_s_filtered_offset(self) -> None:
        tracker = ClockOffsetTracker(tolerance_seconds=5.0)
        tracker.observe(
            "WHK01", SERVER_LINK, 2.0, READ_AT, round_trip=0.010, clock_id="device:WHK01"
        )
        tracker.observe(
            "WHK01", SERVER_LINK, 1.0, READ_AT, round_trip=0.020, clock_id="device:WHK01"
        )
        estimate = ClockEstimate.from_stats(tracker.clock("WHK01", "device:WHK01"))
        assert estimate.clock_id == "device:WHK01"
        assert estimate.offset_seconds == pytest.approx(1.875)  # 2 + (1 - 2) / 8
        assert estimate.uncertainty_seconds == pytest.approx(0.010)
        assert estimate.within_tolerance is True
        assert estimate.correct(STAMP) == STAMP - timedelta(seconds=1.875)


class TestTimeQuality:
    def test_defaults_mean_unknown(self) -> None:
        quality = TimeQuality()
        assert quality.synchronized is None and quality.accuracy_class == "unspecified"

    @pytest.mark.parametrize("cls", ["T0", "T1", "T5", "unspecified"])
    def test_accuracy_classes_are_iec_61850_5(self, cls: str) -> None:
        assert TimeQuality(accuracy_class=cls).accuracy_class == cls

    def test_an_unknown_class_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            TimeQuality(accuracy_class="T9")

    def test_the_record_carries_it_and_rejects_a_naive_stamp_as_sent(self) -> None:
        ts = RecordTimestamp(
            source_time=STAMP,
            source_time_as_sent=STAMP,
            source_offset_seconds=-0.5,
            time_quality=TimeQuality(synchronized=True, accuracy_class="T0"),
        )
        dumped = ts.model_dump(mode="json")
        assert dumped["source_offset_seconds"] == -0.5
        assert dumped["time_quality"]["accuracy_class"] == "T0"
        with pytest.raises(ValidationError, match="source_time_as_sent must be timezone-aware"):
            RecordTimestamp(source_time=STAMP, source_time_as_sent=STAMP.replace(tzinfo=None))


class TestSamplingBound:
    """The acquisition's bound goes on every stamped value (one-clock record P-6)."""

    def test_an_uncorrected_stamp_carries_the_sampling_bound(self) -> None:
        stamp = resolve_source_stamp(
            STAMP,
            origin="server",
            read_at=READ_AT,
            adapter_id="ot",
            connection="WHK01",
            sampling_bound_seconds=1.0,
        )
        assert stamp.source_uncertainty_seconds == 1.0 and stamp.source_offset_seconds is None

    def test_an_event_the_source_stamped_at_the_instant_has_none(self) -> None:
        stamp = resolve_source_stamp(STAMP, origin=None, read_at=READ_AT, adapter_id="whk-wms")
        assert stamp.source_uncertainty_seconds is None

    def test_a_corrected_stamp_adds_the_clock_s_bound(self) -> None:
        estimate = ClockEstimate("server:WHK01", 1.0, 0.002, within_tolerance=True)
        stamp = resolve_source_stamp(
            STAMP,
            origin="server",
            read_at=READ_AT,
            adapter_id="ot",
            connection="WHK01",
            clock=estimate,
            sampling_bound_seconds=0.5,
            poll_bound_seconds=9.0,
        )
        assert stamp.source_uncertainty_seconds == pytest.approx(0.502)

    def test_forge_s_own_read_time_uses_the_poll_bound(self) -> None:
        stamp = resolve_source_stamp(
            None,
            origin="forge",
            read_at=READ_AT,
            adapter_id="ot",
            poll_bound_seconds=5.0,
            sampling_bound_seconds=0.5,
        )
        assert stamp.source_uncertainty_seconds == 5.0
