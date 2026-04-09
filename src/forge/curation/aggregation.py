"""Aggregation engine — group and roll up ContextualRecords.

Aggregation takes a batch of ContextualRecords, groups them by
configurable context keys and time buckets, and applies aggregation
functions (MIN, MAX, AVG, SUM, COUNT, FIRST, LAST) to produce
summary records.

This is the in-memory equivalent of TimescaleDB continuous aggregates.
When real storage is wired in (F20-F22), these aggregations can be
pushed down to the database for performance.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.curation.normalization import TimeBucketer


class AggregationFunction(StrEnum):
    """Supported aggregation functions."""

    MIN = "MIN"
    MAX = "MAX"
    AVG = "AVG"
    SUM = "SUM"
    COUNT = "COUNT"
    FIRST = "FIRST"
    LAST = "LAST"
    MEDIAN = "MEDIAN"
    STDDEV = "STDDEV"


@dataclass
class AggregationSpec:
    """Specification for how to aggregate a set of records.

    group_by: context field names to group by (e.g. ["equipment_id", "batch_id"])
    time_window: time bucketing window name (e.g. "5min", "1hr")
    functions: aggregation functions to apply to the raw value
    """

    group_by: list[str] = field(default_factory=lambda: ["equipment_id"])
    time_window: str = "5min"
    functions: list[AggregationFunction] = field(
        default_factory=lambda: [AggregationFunction.AVG],
    )
    product_id: str = ""  # which data product this aggregation feeds
    tag: str = ""  # optional label for this aggregation


def _extract_group_key(
    record: ContextualRecord,
    group_by: list[str],
    bucketer: TimeBucketer,
) -> tuple[datetime, tuple[tuple[str, str], ...]]:
    """Extract a grouping key from a record: (bucket_time, context_values)."""
    bucket_time = bucketer.bucket(record.timestamp.source_time)

    context_dict = record.context.model_dump(exclude={"extra"})
    context_values = []
    for key in sorted(group_by):
        val = context_dict.get(key) or record.context.extra.get(key, "")
        context_values.append((key, str(val) if val else ""))

    return bucket_time, tuple(context_values)


def _apply_function(func: AggregationFunction, values: list[float]) -> float:
    """Apply an aggregation function to a list of numeric values."""
    if not values:
        return 0.0

    if func == AggregationFunction.MIN:
        return min(values)
    if func == AggregationFunction.MAX:
        return max(values)
    if func == AggregationFunction.AVG:
        return statistics.mean(values)
    if func == AggregationFunction.SUM:
        return sum(values)
    if func == AggregationFunction.COUNT:
        return float(len(values))
    if func == AggregationFunction.FIRST:
        return values[0]
    if func == AggregationFunction.LAST:
        return values[-1]
    if func == AggregationFunction.MEDIAN:
        return statistics.median(values)
    if func == AggregationFunction.STDDEV:
        return statistics.stdev(values) if len(values) > 1 else 0.0

    msg = f"Unknown aggregation function: {func}"
    raise ValueError(msg)


def aggregate_records(
    records: list[ContextualRecord],
    spec: AggregationSpec,
) -> list[ContextualRecord]:
    """Group records by context keys + time bucket and apply aggregation functions.

    Returns one ContextualRecord per group per aggregation function.
    The output record's source is "forge-curation" and lineage tracks
    the aggregation.
    """
    if not records:
        return []

    bucketer = TimeBucketer.from_name(spec.time_window)

    # Group records
    groups: dict[
        tuple[datetime, tuple[tuple[str, str], ...]],
        list[ContextualRecord],
    ] = defaultdict(list)

    for record in records:
        key = _extract_group_key(record, spec.group_by, bucketer)
        groups[key].append(record)

    # Aggregate each group
    output: list[ContextualRecord] = []

    for (bucket_time, context_values), group_records in sorted(groups.items()):
        # Extract numeric values (skip non-numeric)
        numeric_values: list[float] = []
        for r in group_records:
            if isinstance(r.value.raw, (int, float)):
                numeric_values.append(float(r.value.raw))

        if not numeric_values:
            continue

        # Reconstruct context from group key
        context_dict: dict[str, Any] = {}
        for key, val in context_values:
            if val:
                context_dict[key] = val

        # Source from first record in group (representative)
        first_record = group_records[0]
        source_adapter = first_record.source.adapter_id
        source_system = first_record.source.system
        tag_path = first_record.source.tag_path

        for func in spec.functions:
            agg_value = _apply_function(func, numeric_values)
            func_label = func.value.lower()

            agg_record = ContextualRecord(
                record_id=uuid4(),
                source=RecordSource(
                    adapter_id=source_adapter,
                    system=source_system,
                    tag_path=f"{tag_path}/{func_label}" if tag_path else func_label,
                ),
                timestamp=RecordTimestamp(
                    source_time=bucket_time,
                    server_time=datetime.now(UTC),
                    ingestion_time=datetime.now(UTC),
                ),
                value=RecordValue(
                    raw=agg_value,
                    engineering_units=first_record.value.engineering_units,
                    quality=QualityCode.GOOD,
                    data_type="float64",
                ),
                context=RecordContext(**context_dict),
                lineage=RecordLineage(
                    schema_ref=f"forge://curation/{spec.product_id or 'default'}/v0.1.0",
                    adapter_id="forge-curation",
                    adapter_version="0.1.0",
                    transformation_chain=[
                        "collect",
                        "normalize",
                        f"time_bucket_{spec.time_window}",
                        f"aggregate_{func_label}",
                    ],
                ),
            )
            output.append(agg_record)

    return output
