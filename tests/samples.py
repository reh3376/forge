"""Sample records, manifests and health reports for tests.

Shared between forge-core's tests and the hub's, so it lives at the root beside
``tests/otel.py`` and ``tests/tls.py``. Each tree's ``conftest.py`` offers the first three
as fixtures of the same names.
"""

from __future__ import annotations

import datetime as _dt_mod
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

from forge_core.models.adapter import (
    AdapterCapabilities,
    AdapterHealth,
    AdapterManifest,
    AdapterState,
    AdapterTier,
    ConnectionParam,
    DataContract,
)
from forge_core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)


def sample_record() -> ContextualRecord:
    """A fully populated ContextualRecord for round-trip testing."""
    return ContextualRecord(
        record_id=UUID("01234567-89ab-cdef-0123-456789abcdef"),
        source=RecordSource(
            adapter_id="forge-wms",
            system="forge-wms-prod",
            tag_path="Area1/Fermenter3/Temperature",
            connection_id="conn-001",
        ),
        timestamp=RecordTimestamp(
            source_time=datetime(2026, 4, 5, 14, 30, 0, 123000, tzinfo=UTC),
            server_time=datetime(2026, 4, 5, 14, 30, 0, 150000, tzinfo=UTC),
            ingestion_time=datetime(2026, 4, 5, 14, 30, 0, 200000, tzinfo=UTC),
        ),
        value=RecordValue(
            raw=78.4,
            engineering_units="°F",
            quality=QualityCode.GOOD,
            data_type="float64",
        ),
        context=RecordContext(
            equipment_id="FERM-003",
            area="Fermentation",
            site="Louisville",
            batch_id="B2026-0405-003",
            lot_id="L2026-0405",
            recipe_id="R-BOURBON-001",
            operating_mode="PRODUCTION",
            shift_id="B",
            operator_id="OP-042",
            extra={"line": "Line-1", "nested": {"key": "val"}},
        ),
        lineage=RecordLineage(
            schema_ref="forge://schemas/forge-wms/v0.1.0",
            adapter_id="forge-wms",
            adapter_version="0.1.0",
            transformation_chain=["collect", "enrich_context"],
        ),
    )


def sample_manifest() -> AdapterManifest:
    """A fully populated AdapterManifest for round-trip testing."""
    return AdapterManifest(
        adapter_id="forge-wms",
        name="Whiskey House WMS Adapter",
        version="0.1.0",
        type="INGESTION",
        protocol="graphql+amqp",
        tier=AdapterTier.MES_MOM,
        capabilities=AdapterCapabilities(
            read=True,
            write=False,
            subscribe=True,
            backfill=True,
            discover=True,
        ),
        data_contract=DataContract(
            schema_ref="forge://schemas/forge-wms/v0.1.0",
            output_format="contextual_record",
            context_fields=["equipment_id", "lot_id", "batch_id"],
        ),
        health_check_interval_ms=30000,
        connection_params=[
            ConnectionParam(
                name="graphql_url",
                description="WMS GraphQL endpoint",
                required=True,
                secret=False,
            ),
            ConnectionParam(
                name="azure_client_secret",
                description="Azure client secret",
                required=True,
                secret=True,
            ),
        ],
        auth_methods=["azure_entra_id", "bearer_token"],
        metadata={"spoke": "forge-wms", "source_lines": 507000},
    )


def sample_health() -> AdapterHealth:
    """A fully populated AdapterHealth for round-trip testing."""
    return AdapterHealth(
        adapter_id="forge-wms",
        state=AdapterState.HEALTHY,
        last_check=datetime(2026, 4, 5, 14, 35, 0, tzinfo=UTC),
        last_healthy=datetime(2026, 4, 5, 14, 35, 0, tzinfo=UTC),
        error_message=None,
        records_collected=1234,
        records_failed=5,
        uptime_seconds=3600.5,
    )


def make_record_batch(
    count: int = 10,
    equipment_id: str = "FERM-003",
    base_value: float = 78.4,
    unit: str = "°F",
    adapter: str = "forge-wms",
    base_time: datetime | None = None,
    interval: timedelta | None = None,
) -> list[ContextualRecord]:
    """Generate a batch of ContextualRecords for testing."""
    base = base_time or datetime(2026, 4, 5, 14, 0, 0, tzinfo=_dt_mod.UTC)
    step = interval or timedelta(minutes=1)

    records = []
    for i in range(count):
        records.append(
            ContextualRecord(
                record_id=uuid4(),
                source=RecordSource(
                    adapter_id=adapter,
                    system=f"{adapter}-prod",
                    tag_path=f"Area1/{equipment_id}/Temperature",
                ),
                timestamp=RecordTimestamp(
                    source_time=base + step * i,
                    ingestion_time=base + step * i + timedelta(milliseconds=200),
                ),
                value=RecordValue(
                    raw=base_value + (i * 0.1),
                    engineering_units=unit,
                    quality=QualityCode.GOOD,
                    data_type="float64",
                ),
                context=RecordContext(
                    equipment_id=equipment_id,
                    batch_id="B2026-0405-003",
                    lot_id="L2026-0405",
                    operating_mode="PRODUCTION",
                    shift_id="B",
                ),
                lineage=RecordLineage(
                    schema_ref=f"forge://schemas/{adapter}/v0.1.0",
                    adapter_id=adapter,
                    adapter_version="0.1.0",
                    transformation_chain=["collect"],
                ),
            )
        )
    return records


REPO_ROOT = Path(__file__).resolve().parents[1]


def module_package_dir(module: str) -> Path:
    """The Python package folder of a module, in the standard structure (D-17 §10.3)."""
    return REPO_ROOT / "forge-modules" / module / "src" / "python" / module.replace("-", "_")


def module_manifest_path(module: str) -> Path:
    return module_package_dir(module) / "manifest.json"


def module_manifest(module: str) -> AdapterManifest:
    """A real module's manifest. The hub's tests register with one until they have a sample
    module of their own (BACKLOG FB-239)."""
    return AdapterManifest.model_validate(
        json.loads(module_manifest_path(module).read_text(encoding="utf-8"))
    )
