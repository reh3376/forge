"""The hub <-> spoke time exchange: NTP's four timestamps (FB-092, one-clock record P-9)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from forge_core.clock import SERVER_LINK, SPOKE_LINK, ClockOffsetTracker, TimeExchange
from forge_core.link import proto_bridge, serialization
from forge_core.models.adapter import AdapterHealth, AdapterState, HubTime, SpokeTime
from forge_core.models.contextual_record import RecordTimestamp
from forge_core.proto_gen.forge.v1 import adapter_pb2

HUB = datetime(2026, 6, 1, 12, tzinfo=UTC)


def ms(n: float) -> timedelta:
    return timedelta(milliseconds=n)


def exchange(skew_seconds: float, out_ms: float, back_ms: float, hub_ms: float = 5) -> TimeExchange:
    """An exchange with a spoke whose clock is ``skew_seconds`` ahead of the hub's."""
    skew = timedelta(seconds=skew_seconds)
    t2 = HUB + ms(out_ms)
    t3 = t2 + ms(hub_ms)
    return TimeExchange(HUB + skew, t2, t3, t3 + ms(back_ms) + skew)


def test_a_symmetric_path_gives_the_exact_offset_whatever_the_hub_took() -> None:
    measured = exchange(2.0, 4, 4, hub_ms=250)
    assert measured.offset_seconds == pytest.approx(-2.0)  # hub minus spoke: the spoke is ahead
    assert measured.round_trip_seconds == pytest.approx(0.008)  # the hub's 250 ms drop out
    assert measured.uncertainty_seconds == pytest.approx(0.004)


def test_an_asymmetric_path_errs_by_at_most_half_the_round_trip() -> None:
    measured = exchange(-0.5, 1, 9)  # the spoke is half a second behind; 1 ms out, 9 ms back
    assert measured.round_trip_seconds == pytest.approx(0.010)
    assert abs(measured.offset_seconds - 0.5) <= measured.uncertainty_seconds + 1e-9
    assert measured.offset_seconds != pytest.approx(0.5)  # the asymmetry does show


def test_the_spoke_link_is_two_way_once_an_exchange_is_reported() -> None:
    tracker = ClockOffsetTracker(tolerance_seconds=1.0)
    # before any exchange: one-way, from the record's own stamps, and it carries the delay
    stamps = RecordTimestamp(source_time=HUB, ingestion_time=HUB, spoke_time=HUB - ms(300))
    one_way = tracker.observe_record("forge-wms", stamps)[SPOKE_LINK]
    assert one_way.last_seconds == pytest.approx(-0.3) and one_way.round_trip_seconds is None
    assert not tracker.measured_two_way("forge-wms")

    stats = tracker.observe_exchange(
        "forge-wms", offset_seconds=-0.020, round_trip_seconds=0.004, at=HUB
    )
    assert tracker.measured_two_way("forge-wms")
    assert stats.last_seconds == pytest.approx(0.020)  # the series is spoke minus hub
    assert stats.round_trip_seconds == 0.004 and stats.estimate_uncertainty_seconds == 0.002
    assert stats.samples == 1  # the one-way samples were another measurement: dropped
    assert stats.tolerance_seconds == 1.0  # no class given: the tracker's own

    # with the spoke's declared class the two-way series is held to it (it-lan, 10 ms)
    held = tracker.observe_exchange(
        "forge-wms",
        offset_seconds=-0.020,
        round_trip_seconds=0.004,
        at=HUB,
        tolerance_seconds=0.010,
    )
    assert held.tolerance_seconds == 0.010 and held.within_tolerance is False
    assert held.samples == 2

    # the spoke's records no longer feed its spoke link; the other links still come from them
    more = RecordTimestamp(
        source_time=HUB, server_time=HUB, ingestion_time=HUB, spoke_time=HUB - ms(300)
    )
    observed = tracker.observe_record("forge-wms", more)
    assert SPOKE_LINK not in observed and SERVER_LINK in observed
    assert tracker.stats("forge-wms")[SPOKE_LINK].samples == 2
    # a spoke that has not reported an exchange is still measured one-way
    assert SPOKE_LINK in tracker.observe_record("whk-mes", stamps)
    assert not tracker.measured_two_way("whk-mes")


def test_the_exchange_messages_cross_both_serializers() -> None:
    spoke = SpokeTime(
        transmit_time=HUB,
        offset_seconds=-0.02,
        round_trip_seconds=0.004,
        measured_at=HUB - timedelta(seconds=30),
    )
    assert proto_bridge.proto_to_spoke_time(proto_bridge.spoke_time_to_proto(spoke)) == spoke
    assert serialization.proto_to_spoke_time(serialization.spoke_time_to_proto(spoke)) == spoke

    first = SpokeTime(transmit_time=HUB)  # a spoke's first request: T1 and nothing to report
    message = proto_bridge.spoke_time_to_proto(first)
    assert not message.HasField("offset_seconds") and not message.HasField("measured_at")
    assert proto_bridge.proto_to_spoke_time(message) == first
    assert serialization.proto_to_spoke_time(serialization.spoke_time_to_proto(first)) == first

    # no T1 is no exchange: a spoke from before FB-092
    assert proto_bridge.proto_to_spoke_time(adapter_pb2.SpokeTime()) is None
    assert serialization.proto_to_spoke_time(None) is None
    assert serialization.proto_to_spoke_time({}) is None

    hub = HubTime(receive_time=HUB, transmit_time=HUB + ms(3))
    assert proto_bridge.proto_to_hub_time(proto_bridge.hub_time_to_proto(hub)) == hub
    assert serialization.proto_to_hub_time(serialization.hub_time_to_proto(hub)) == hub
    # no T2/T3 is a hub from before FB-092
    assert proto_bridge.proto_to_hub_time(adapter_pb2.HubTime()) is None
    assert serialization.proto_to_hub_time({}) is None


def test_health_carries_the_hub_s_half_of_the_exchange() -> None:
    health = AdapterHealth(
        adapter_id="forge-wms",
        state=AdapterState.HEALTHY,
        hub_time=HubTime(receive_time=HUB, transmit_time=HUB + ms(2)),
    )
    assert proto_bridge.proto_to_health(proto_bridge.health_to_proto(health)).hub_time == (
        health.hub_time
    )
    wire = serialization.pydantic_to_proto(health)
    assert serialization.proto_to_pydantic(wire, "AdapterHealth").hub_time == health.hub_time
    plain = AdapterHealth(adapter_id="forge-wms", state=AdapterState.HEALTHY)
    assert proto_bridge.proto_to_health(proto_bridge.health_to_proto(plain)).hub_time is None
    assert "hub_time" not in serialization.pydantic_to_proto(plain)


def test_the_exchange_s_times_are_utc_like_every_other() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        SpokeTime(transmit_time=datetime(2026, 6, 1, 12))  # noqa: DTZ001 - the naive input is the point
    with pytest.raises(ValueError, match="timezone-aware"):
        HubTime(receive_time=HUB, transmit_time=datetime(2026, 6, 1, 12))  # noqa: DTZ001
