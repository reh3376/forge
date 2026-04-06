# ruff: noqa: E402, UP017, UP042
"""Performance benchmark: JSON vs Protobuf-compatible serialization.

Measures the throughput of converting ContextualRecords between
Pydantic models and proto-compatible dicts vs raw JSON serialization.

Run: python benchmarks/bench_transport.py
"""

from __future__ import annotations

import datetime as _dt_mod
import enum
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

# Python 3.10 compat
if not hasattr(_dt_mod, "UTC"):
    _dt_mod.UTC = _dt_mod.timezone.utc
if not hasattr(enum, "StrEnum"):
    class StrEnum(str, enum.Enum):
        pass
    enum.StrEnum = StrEnum

# Ensure src/ is importable
_src = Path(__file__).resolve().parent.parent / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.transport.serialization import proto_to_pydantic, pydantic_to_proto


def make_record() -> ContextualRecord:
    """Create a realistic ContextualRecord for benchmarking."""
    return ContextualRecord(
        record_id=uuid4(),
        source=RecordSource(
            adapter_id="whk-wms",
            system="whk-wms-prod",
            tag_path="Area1/Fermenter3/Temperature",
        ),
        timestamp=RecordTimestamp(
            source_time=datetime.now(timezone.utc),
            server_time=datetime.now(timezone.utc),
            ingestion_time=datetime.now(timezone.utc),
        ),
        value=RecordValue(
            raw=78.4,
            engineering_units="°F",
            quality=QualityCode.GOOD,
            data_type="float64",
        ),
        context=RecordContext(
            equipment_id="FERM-003",
            batch_id="B2026-0405-003",
            lot_id="L2026-0405",
            recipe_id="R-BOURBON-001",
            operating_mode="PRODUCTION",
            shift="B",
            extra={"line": "Line-1"},
        ),
        lineage=RecordLineage(
            schema_ref="forge://schemas/whk-wms/v0.1.0",
            adapter_id="whk-wms",
            adapter_version="0.1.0",
            transformation_chain=["collect", "enrich_context"],
        ),
    )


def bench_json_serialization(records: list[ContextualRecord], iterations: int) -> float:
    """Benchmark: Pydantic model_dump → JSON string → model_validate."""
    start = time.perf_counter()
    for _ in range(iterations):
        for record in records:
            json_str = record.model_dump_json()
            ContextualRecord.model_validate_json(json_str)
    elapsed = time.perf_counter() - start
    return elapsed


def bench_proto_serialization(records: list[ContextualRecord], iterations: int) -> float:
    """Benchmark: pydantic_to_proto → proto_to_pydantic."""
    start = time.perf_counter()
    for _ in range(iterations):
        for record in records:
            proto_dict = pydantic_to_proto(record)
            proto_to_pydantic(proto_dict, "ContextualRecord")
    elapsed = time.perf_counter() - start
    return elapsed


def bench_proto_serialize_only(records: list[ContextualRecord], iterations: int) -> float:
    """Benchmark: pydantic_to_proto only (serialize direction)."""
    start = time.perf_counter()
    for _ in range(iterations):
        for record in records:
            pydantic_to_proto(record)
    elapsed = time.perf_counter() - start
    return elapsed


def bench_json_serialize_only(records: list[ContextualRecord], iterations: int) -> float:
    """Benchmark: model_dump_json only (serialize direction)."""
    start = time.perf_counter()
    for _ in range(iterations):
        for record in records:
            record.model_dump_json()
    elapsed = time.perf_counter() - start
    return elapsed


def main() -> None:
    batch_size = 1000
    iterations = 10
    total_ops = batch_size * iterations

    print("Forge Transport Benchmark")
    print(f"  Batch size: {batch_size} records")
    print(f"  Iterations: {iterations}")
    print(f"  Total ops:  {total_ops}")
    print()

    records = [make_record() for _ in range(batch_size)]

    # Warmup
    bench_proto_serialization(records[:10], 1)
    bench_json_serialization(records[:10], 1)

    # Benchmark
    json_rt = bench_json_serialization(records, iterations)
    proto_rt = bench_proto_serialization(records, iterations)
    json_ser = bench_json_serialize_only(records, iterations)
    proto_ser = bench_proto_serialize_only(records, iterations)

    print(f"{'Method':<35} {'Time (s)':>10} {'Ops/sec':>12} {'vs JSON':>10}")
    print("-" * 70)

    json_rt_ops = total_ops / json_rt
    proto_rt_ops = total_ops / proto_rt
    json_ser_ops = total_ops / json_ser
    proto_ser_ops = total_ops / proto_ser

    print(
        f"{'JSON round-trip':<35} {json_rt:>10.3f} {json_rt_ops:>12,.0f} {'baseline':>10}"
    )
    print(
        f"{'Proto dict round-trip':<35} {proto_rt:>10.3f} {proto_rt_ops:>12,.0f}"
        f" {proto_rt_ops / json_rt_ops:>9.2f}x"
    )
    print(
        f"{'JSON serialize only':<35} {json_ser:>10.3f} {json_ser_ops:>12,.0f} {'baseline':>10}"
    )
    print(
        f"{'Proto dict serialize only':<35} {proto_ser:>10.3f} {proto_ser_ops:>12,.0f}"
        f" {proto_ser_ops / json_ser_ops:>9.2f}x"
    )

    # Size comparison
    sample = records[0]
    json_bytes = len(sample.model_dump_json().encode())
    proto_dict_bytes = len(json.dumps(pydantic_to_proto(sample)).encode())
    print()
    print(f"Wire size (JSON):      {json_bytes:>6} bytes")
    print(f"Wire size (proto dict): {proto_dict_bytes:>6} bytes")
    print("Note: Real protobuf binary would be ~50-70% smaller than proto dict JSON")


if __name__ == "__main__":
    main()
