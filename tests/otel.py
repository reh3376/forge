"""The one in-memory OpenTelemetry reader the metric tests share.

The API lets a process bind a ``MeterProvider`` once; the first test to need one binds a
provider with this reader, and every later test finds that reader again.
"""

from __future__ import annotations

from opentelemetry import metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader

_READER = InMemoryMetricReader()


def metric_reader() -> InMemoryMetricReader | None:
    """The process's in-memory reader, or None when another SDK provider owns the process."""
    current = metrics.get_meter_provider()
    if isinstance(current, MeterProvider):
        for reader in current._all_metric_readers:
            if isinstance(reader, InMemoryMetricReader):
                return reader
        return None
    metrics.set_meter_provider(MeterProvider(metric_readers=[_READER]))
    return _READER


def metrics_by_name(reader: InMemoryMetricReader) -> dict:
    data = reader.get_metrics_data()
    return {
        metric.name: metric
        for resource_metrics in data.resource_metrics
        for scope_metrics in resource_metrics.scope_metrics
        for metric in scope_metrics.metrics
    }
