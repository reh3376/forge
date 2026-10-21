"""OpenTelemetry instruments for the hub.

Forge instruments with the OpenTelemetry *API* only: with no SDK configured the
instruments are no-ops, and a deployment that sets a ``MeterProvider`` (the
Grafana stack, FOTS) receives the measurements without a code change. Metric
names follow the ``forge.<area>.<measure>`` convention FOTS references.
"""

from __future__ import annotations

from opentelemetry import metrics

METER_NAME = "forge.hub"

#: Measured clock offset of a spoke, server or source against the clock it is
#: governed by (seconds; positive means the measured clock is ahead).
CLOCK_OFFSET = "forge.clock.offset"
#: Clock-offset samples outside the configured tolerance.
CLOCK_OUT_OF_TOLERANCE = "forge.clock.out_of_tolerance"

ATTR_ADAPTER_ID = "forge.adapter_id"
ATTR_CLOCK_LINK = "forge.clock.link"

_meter = metrics.get_meter(METER_NAME)
_clock_offset = _meter.create_histogram(
    CLOCK_OFFSET,
    unit="s",
    description=(
        "Measured clock offset of a spoke, server or source against the clock it is "
        "governed by; positive means the measured clock is ahead (one clock, FB-089)."
    ),
)
_clock_out_of_tolerance = _meter.create_counter(
    CLOCK_OUT_OF_TOLERANCE,
    unit="1",
    description="Clock-offset samples outside the configured tolerance (FB-089).",
)


def record_clock_offset(adapter_id: str, link: str, seconds: float) -> None:
    """Record one clock-offset sample for ``adapter_id`` on ``link``."""
    _clock_offset.record(seconds, attributes={ATTR_ADAPTER_ID: adapter_id, ATTR_CLOCK_LINK: link})


def record_clock_breach(adapter_id: str, link: str) -> None:
    """Count one clock-offset sample outside tolerance for ``adapter_id`` on ``link``."""
    _clock_out_of_tolerance.add(1, attributes={ATTR_ADAPTER_ID: adapter_id, ATTR_CLOCK_LINK: link})
