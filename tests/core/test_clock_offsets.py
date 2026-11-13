"""Clock-offset measurement (one clock, FB-089): rolling stats, the tolerance alert, metrics."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import pytest

from forge.core import telemetry
from forge.core.clock import (
    CLOCK_TOLERANCE_ENV,
    DEFAULT_CLOCK_TOLERANCE_SECONDS,
    SERVER_LINK,
    SOURCE_LINK,
    SPOKE_LINK,
    ClockOffsetTracker,
    clock_tolerance_seconds,
)
from forge.core.models.contextual_record import RecordTimestamp
from tests.otel import metric_reader

T0 = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)

_metric_reader = metric_reader


class TestTolerance:
    def test_default_when_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv(CLOCK_TOLERANCE_ENV, raising=False)
        assert clock_tolerance_seconds() == DEFAULT_CLOCK_TOLERANCE_SECONDS

    @pytest.mark.parametrize(
        ("raw", "expected"), [("0.25", 0.25), ("abc", 1.0), ("-1", 1.0), ("", 1.0)]
    )
    def test_env_value(self, monkeypatch: pytest.MonkeyPatch, raw: str, expected: float) -> None:
        monkeypatch.setenv(CLOCK_TOLERANCE_ENV, raw)
        assert clock_tolerance_seconds() == expected

    def test_tracker_reads_the_env_at_construction(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv(CLOCK_TOLERANCE_ENV, "0.05")
        assert ClockOffsetTracker().tolerance_seconds == 0.05


class TestRollingStats:
    def test_window_keeps_the_last_samples(self) -> None:
        tracker = ClockOffsetTracker(tolerance_seconds=10, window=3)
        for i, seconds in enumerate([1.0, 2.0, 3.0, 4.0]):
            stats = tracker.observe("a", SPOKE_LINK, seconds, T0 + timedelta(seconds=i))
        assert stats.samples == 3 and stats.window == 3
        assert stats.last_seconds == 4.0 and stats.mean_seconds == 3.0
        assert (
            stats.min_seconds == 2.0 and stats.max_seconds == 4.0 and stats.max_abs_seconds == 4.0
        )
        assert stats.measured_at == T0 + timedelta(seconds=3)
        assert stats.within_tolerance and stats.breaches == 0

    def test_max_abs_sees_negative_offsets(self) -> None:
        tracker = ClockOffsetTracker(tolerance_seconds=10)
        tracker.observe("a", SPOKE_LINK, -5.0, T0)
        stats = tracker.observe("a", SPOKE_LINK, 1.0, T0)
        assert stats.max_abs_seconds == 5.0 and stats.min_seconds == -5.0

    def test_stats_are_per_adapter_and_link(self) -> None:
        tracker = ClockOffsetTracker(tolerance_seconds=10)
        tracker.observe("a", SPOKE_LINK, 1.0, T0)
        tracker.observe("a", SERVER_LINK, 2.0, T0, round_trip=0.01)
        tracker.observe("b", SPOKE_LINK, 3.0, T0)
        assert set(tracker.stats("a")) == {SPOKE_LINK, SERVER_LINK}
        assert tracker.stats("a")[SERVER_LINK].round_trip_seconds == 0.01
        assert tracker.stats("b")[SPOKE_LINK].last_seconds == 3.0
        assert tracker.stats("c") == {}
        assert tracker.adapters() == ["a", "b"]
        described = tracker.describe()
        assert described["tolerance_seconds"] == 10 and described["breaches"] == 0
        assert set(described["adapters"]) == {"a", "b"}
        assert described["adapters"]["a"][SERVER_LINK]["measured_at"] == "2026-06-01T12:00:00Z"
        assert described["clocks"] == {}

    def test_the_estimate_is_an_exponentially_weighted_mean(self) -> None:
        """NTP's discipline weight: each sample moves the estimate an eighth of the way (P-2)."""
        tracker = ClockOffsetTracker(tolerance_seconds=10)
        first = tracker.observe("a", SERVER_LINK, 8.0, T0, round_trip=0.4)
        assert first.estimate_seconds == 8.0 and first.estimate_uncertainty_seconds == 0.2
        second = tracker.observe("a", SERVER_LINK, 0.0, T0, round_trip=0.1)
        assert second.estimate_seconds == 7.0 and second.estimate_uncertainty_seconds == 0.05
        third = tracker.observe("a", SERVER_LINK, 0.0, T0)
        assert third.estimate_seconds == 6.125 and third.estimate_uncertainty_seconds is None
        assert tracker.clock("a", "server:x") is None

    def test_named_clocks_are_kept_apart_from_the_record_series(self) -> None:
        """A probe or tap names the clock it read (FB-094 step 2); records feed the link series."""
        tracker = ClockOffsetTracker(tolerance_seconds=10)
        tracker.observe("WHK01", SERVER_LINK, 0.5, T0, clock_id="server:WHK01", round_trip=0.004)
        tracker.observe("WHK01", SERVER_LINK, 0.7, T0, clock_id="server:WHK01")
        tracker.observe("WHK01", SERVER_LINK, -1.0, T0, clock_id="device:PLC7")
        tracker.observe("WHK01", SERVER_LINK, 2.0, T0)  # from a record's server_time
        clocks = tracker.clocks("WHK01")
        assert set(clocks) == {"server:WHK01", "device:PLC7"}
        assert (
            clocks["server:WHK01"].samples == 2
            and clocks["server:WHK01"].clock_id == "server:WHK01"
        )
        assert clocks["server:WHK01"].last_seconds == 0.7
        assert (
            clocks["device:PLC7"].last_seconds == -1.0 and clocks["device:PLC7"].link == SERVER_LINK
        )
        assert tracker.stats("WHK01")[SERVER_LINK].samples == 1  # the unnamed series stays its own
        assert tracker.stats("WHK01")[SERVER_LINK].clock_id is None
        assert tracker.clocks("nobody") == {}
        described = tracker.describe()
        assert set(described["clocks"]["WHK01"]) == {"server:WHK01", "device:PLC7"}
        assert described["adapters"]["WHK01"][SERVER_LINK]["last_seconds"] == 2.0


class TestToleranceAlert:
    def test_breach_warns_once_then_recovers(self, caplog: pytest.LogCaptureFixture) -> None:
        breaches: list[tuple[str, str]] = []
        tracker = ClockOffsetTracker(
            tolerance_seconds=0.5, on_breach=lambda aid, s: breaches.append((aid, s.link))
        )
        with caplog.at_level(logging.INFO, logger="forge.core.clock"):
            assert tracker.observe("a", SPOKE_LINK, 0.1, T0).within_tolerance
            out = tracker.observe("a", SPOKE_LINK, 2.0, T0)
            assert not out.within_tolerance and out.breaches == 1
            still = tracker.observe("a", SPOKE_LINK, 2.5, T0)
            assert not still.within_tolerance and still.breaches == 2
            back = tracker.observe("a", SPOKE_LINK, -0.2, T0)
            assert back.within_tolerance and back.breaches == 2
        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warnings) == 1 and "out of tolerance" in warnings[0].getMessage()
        assert "a spoke clock is +2.000s" in warnings[0].getMessage()
        assert any("back inside tolerance" in r.getMessage() for r in caplog.records)
        assert breaches == [("a", SPOKE_LINK)]
        assert tracker.breaches == 2

    def test_negative_offsets_breach_too(self) -> None:
        tracker = ClockOffsetTracker(tolerance_seconds=0.5)
        assert not tracker.observe("a", SERVER_LINK, -0.75, T0).within_tolerance


class TestObserveRecord:
    def test_every_link_a_record_allows(self) -> None:
        tracker = ClockOffsetTracker(tolerance_seconds=10)
        ts = RecordTimestamp(
            source_time=T0,
            server_time=T0 + timedelta(seconds=1),
            ingestion_time=T0 + timedelta(seconds=5),  # the hub's receipt (FB-087)
            sent_time=T0 + timedelta(seconds=3),  # the spoke's clock at send
        )
        observed = tracker.observe_record("a", ts)
        assert observed[SPOKE_LINK].last_seconds == -2.0  # spoke - hub
        assert observed[SERVER_LINK].last_seconds == -4.0  # server - hub
        assert observed[SOURCE_LINK].last_seconds == -1.0  # source - server
        assert all(s.measured_at == ts.ingestion_time for s in observed.values())

    def test_only_the_links_the_stamps_allow(self) -> None:
        tracker = ClockOffsetTracker(tolerance_seconds=10)
        assert tracker.observe_record("a", RecordTimestamp(source_time=T0, ingestion_time=T0)) == {}
        only_server = tracker.observe_record(
            "a", RecordTimestamp(source_time=T0, server_time=T0, ingestion_time=T0)
        )
        assert set(only_server) == {SERVER_LINK, SOURCE_LINK}
        only_spoke = tracker.observe_record(
            "a", RecordTimestamp(source_time=T0, ingestion_time=T0, sent_time=T0)
        )
        assert set(only_spoke) == {SPOKE_LINK}


class TestTelemetry:
    def test_samples_and_breaches_reach_opentelemetry(self) -> None:
        reader = _metric_reader()
        if reader is None:
            pytest.skip("another MeterProvider owns this process")
        tracker = ClockOffsetTracker(tolerance_seconds=0.5)
        tracker.observe("otel-spoke", SPOKE_LINK, 0.1, T0)
        tracker.observe("otel-spoke", SPOKE_LINK, 3.0, T0)
        data = reader.get_metrics_data()
        by_name = {
            m.name: m for rm in data.resource_metrics for sm in rm.scope_metrics for m in sm.metrics
        }
        gauge = by_name[telemetry.CLOCK_OFFSET]
        points = [
            p
            for p in gauge.data.data_points
            if p.attributes.get(telemetry.ATTR_ADAPTER_ID) == "otel-spoke"
        ]
        assert points and points[0].attributes[telemetry.ATTR_CLOCK_LINK] == SPOKE_LINK
        assert points[0].value == pytest.approx(3.0)  # a gauge: the last sample

        counter = by_name[telemetry.CLOCK_OUT_OF_TOLERANCE]
        breaches = [
            p.value
            for p in counter.data.data_points
            if p.attributes.get(telemetry.ATTR_ADAPTER_ID) == "otel-spoke"
        ]
        assert breaches == [1]

    def test_a_clock_behind_its_hub_reaches_the_metric(self) -> None:
        """A negative offset is a real measurement; a histogram would have dropped it."""
        reader = _metric_reader()
        if reader is None:
            pytest.skip("another MeterProvider owns this process")
        ClockOffsetTracker(tolerance_seconds=5.0).observe("otel-behind", SERVER_LINK, -2.5, T0)
        data = reader.get_metrics_data()
        points = [
            p
            for rm in data.resource_metrics
            for sm in rm.scope_metrics
            for m in sm.metrics
            if m.name == telemetry.CLOCK_OFFSET
            for p in m.data.data_points
            if p.attributes.get(telemetry.ATTR_ADAPTER_ID) == "otel-behind"
        ]
        assert points and points[0].value == pytest.approx(-2.5)

    def test_a_named_clock_is_an_attribute_of_the_metric(self) -> None:
        reader = _metric_reader()
        if reader is None:
            pytest.skip("another MeterProvider owns this process")
        ClockOffsetTracker(tolerance_seconds=5.0).observe(
            "otel-named", SERVER_LINK, 0.25, T0, clock_id="device:PLC7"
        )
        data = reader.get_metrics_data()
        points = [
            p
            for rm in data.resource_metrics
            for sm in rm.scope_metrics
            for m in sm.metrics
            if m.name == telemetry.CLOCK_OFFSET
            for p in m.data.data_points
            if p.attributes.get(telemetry.ATTR_ADAPTER_ID) == "otel-named"
        ]
        assert points and points[0].attributes[telemetry.ATTR_CLOCK_ID] == "device:PLC7"
