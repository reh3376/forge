"""An adapter's refusal is never silent (owner, 2026-11-03; FB-088)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import pytest

from forge.adapters.base.interface import AdapterBase
from forge.core import telemetry
from forge.core.clock import SourceStampMissingError
from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterHealth,
    AdapterManifest,
    AdapterState,
    AdapterTier,
    DataContract,
)
from tests.otel import metric_reader, metrics_by_name

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from forge.core.models.contextual_record import ContextualRecord


class _Adapter(AdapterBase):
    manifest = AdapterManifest(
        adapter_id="refusing",
        name="Refusing",
        version="0.1.0",
        protocol="rest",
        tier=AdapterTier.MES_MOM,
        capabilities=AdapterCapabilities(read=True),
        data_contract=DataContract(schema_ref="forge://schemas/refusing/v0.1.0"),
    )

    async def configure(self, params: dict) -> None:  # pragma: no cover - interface
        self._config = params

    async def start(self) -> None:
        self._state = AdapterState.HEALTHY

    async def stop(self) -> None:  # pragma: no cover - interface
        self._state = AdapterState.STOPPED

    async def health(self) -> AdapterHealth:
        return AdapterHealth(
            adapter_id=self.adapter_id,
            state=self._state,
            records_collected=self._records_collected,
            records_failed=self._records_failed,
            **self.refusal_health(),
        )

    async def collect(self) -> AsyncIterator[ContextualRecord]:  # pragma: no cover - interface
        yield  # type: ignore[misc]


def _refusal(tag: str = "t") -> SourceStampMissingError:
    return SourceStampMissingError(adapter_id="refusing", connection="c", tag_path=tag)


@pytest.mark.asyncio
async def test_a_refusal_counts_degrades_and_names_its_cause(caplog) -> None:
    adapter = _Adapter()
    await adapter.start()
    with caplog.at_level(logging.DEBUG, logger="forge.adapters.base.interface"):
        adapter.refuse(_refusal("a"))
        adapter.refuse(_refusal("b"))
    health = await adapter.health()
    assert health.state == AdapterState.DEGRADED
    assert health.records_failed == 2
    assert health.refusals == {"source_stamp_missing": 2}
    assert health.last_refusal is not None and "tag b" in health.last_refusal
    assert health.error_message == health.last_refusal
    # the first refusal per cause is a warning; the rest stay out of the log's way
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1 and "refused a value (source_stamp_missing)" in warnings[0].message


@pytest.mark.asyncio
async def test_the_adapter_s_own_error_message_wins_on_the_wire_field() -> None:
    adapter = _Adapter()
    await adapter.start()
    adapter.refuse(_refusal())
    fields = adapter.refusal_health("Connection refused")
    assert fields["error_message"] == "Connection refused"
    assert fields["refusals"] == {"source_stamp_missing": 1}


@pytest.mark.asyncio
async def test_a_refusal_does_not_hide_a_worse_state() -> None:
    adapter = _Adapter()
    adapter._state = AdapterState.FAILED
    adapter.refuse(_refusal())
    assert adapter.state == AdapterState.FAILED


@pytest.mark.asyncio
async def test_a_refusal_without_a_cause_attribute_uses_the_exception_type() -> None:
    adapter = _Adapter()
    adapter.refuse(ValueError("odd"))
    adapter.refuse(ValueError("odder"), cause="custom")
    assert adapter._refusals == {"ValueError": 1, "custom": 1}


def test_refusals_reach_opentelemetry() -> None:
    reader = metric_reader()
    if reader is None:
        pytest.skip("another MeterProvider owns this process")
    adapter = _Adapter()
    # its own adapter id: the counter is cumulative across the tests of this process
    adapter.manifest = _Adapter.manifest.model_copy(update={"adapter_id": "refusing-otel"})
    adapter.refuse(_refusal())
    adapter.refuse(_refusal())
    counter = metrics_by_name(reader)[telemetry.INGEST_REFUSED]
    points = [
        p
        for p in counter.data.data_points
        if p.attributes.get(telemetry.ATTR_ADAPTER_ID) == "refusing-otel"
    ]
    assert len(points) == 1 and points[0].value == 2
    assert points[0].attributes[telemetry.ATTR_REFUSAL_CAUSE] == "source_stamp_missing"
