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

#: Values an adapter refused rather than invent something about them, by cause: a
#: source stamp the source did not send (FB-088); the clock refusals of FB-093 join it.
INGEST_REFUSED = "forge.ingest.refused"

ATTR_ADAPTER_ID = "forge.adapter_id"
ATTR_CLOCK_LINK = "forge.clock.link"
#: The clock a probe or tap read (``server:WHK01``), when the sample names one (FB-094).
ATTR_CLOCK_ID = "forge.clock.id"
ATTR_REFUSAL_CAUSE = "forge.refusal.cause"

_meter = metrics.get_meter(METER_NAME)
# A gauge, not a histogram: the offset is signed, and an OpenTelemetry histogram drops a
# negative amount with a warning, so a clock behind its hub never reached the metric
# until FB-088 found it (2026-11-13).
_clock_offset = _meter.create_gauge(
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
_ingest_refused = _meter.create_counter(
    INGEST_REFUSED,
    unit="1",
    description=(
        "Values an adapter refused rather than invent something about them, by cause "
        "(source_stamp_missing, FB-088); never silent (owner, 2026-11-03)."
    ),
)


def _clock_attributes(adapter_id: str, link: str, clock_id: str | None) -> dict[str, str]:
    attributes = {ATTR_ADAPTER_ID: adapter_id, ATTR_CLOCK_LINK: link}
    if clock_id:
        attributes[ATTR_CLOCK_ID] = clock_id
    return attributes


def record_clock_offset(
    adapter_id: str, link: str, seconds: float, *, clock_id: str | None = None
) -> None:
    """Record one clock-offset sample for ``adapter_id`` on ``link`` (signed)."""
    _clock_offset.set(seconds, attributes=_clock_attributes(adapter_id, link, clock_id))


def record_clock_breach(adapter_id: str, link: str, *, clock_id: str | None = None) -> None:
    """Count one clock-offset sample outside tolerance for ``adapter_id`` on ``link``."""
    _clock_out_of_tolerance.add(1, attributes=_clock_attributes(adapter_id, link, clock_id))


def record_refusal(adapter_id: str, cause: str) -> None:
    """Count one value ``adapter_id`` refused, under ``cause``."""
    _ingest_refused.add(1, attributes={ATTR_ADAPTER_ID: adapter_id, ATTR_REFUSAL_CAUSE: cause})
