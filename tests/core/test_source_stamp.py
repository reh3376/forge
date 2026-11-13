"""A source stamp is never invented (one clock, FB-088; D-9 step 1)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from forge.core.clock import (
    FORGE_CLOCK,
    SOURCE_TIMESTAMP_ORIGINS,
    SourceStampMissingError,
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
