# ruff: noqa: E402
"""Shared fixtures for transport layer tests."""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest

# Ensure src/ and proto_gen/ are importable
_src = Path(__file__).resolve().parent.parent.parent / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))
# NOTE: the generated stubs import `forge.proto_gen.forge.v1`, so proto_gen must NOT be
# prepended to sys.path: doing so shadows the real `forge` package whenever this
# conftest loads before any other test module has imported forge (BACKLOG FB-058).

from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterHealth,
    AdapterManifest,
    AdapterState,
    AdapterTier,
    ConnectionParam,
    DataContract,
)
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)


@pytest.fixture()
def sample_record() -> ContextualRecord:
    """A fully populated ContextualRecord for round-trip testing."""
    return ContextualRecord(
        record_id=UUID("01234567-89ab-cdef-0123-456789abcdef"),
        source=RecordSource(
            adapter_id="whk-wms",
            system="whk-wms-prod",
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
            schema_ref="forge://schemas/whk-wms/v0.1.0",
            adapter_id="whk-wms",
            adapter_version="0.1.0",
            transformation_chain=["collect", "enrich_context"],
        ),
    )


@pytest.fixture()
def sample_manifest() -> AdapterManifest:
    """A fully populated AdapterManifest for round-trip testing."""
    return AdapterManifest(
        adapter_id="whk-wms",
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
            schema_ref="forge://schemas/whk-wms/v0.1.0",
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
        metadata={"spoke": "whk-wms", "source_lines": 507000},
    )


@pytest.fixture()
def sample_health() -> AdapterHealth:
    """A fully populated AdapterHealth for round-trip testing."""
    return AdapterHealth(
        adapter_id="whk-wms",
        state=AdapterState.HEALTHY,
        last_check=datetime(2026, 4, 5, 14, 35, 0, tzinfo=UTC),
        last_healthy=datetime(2026, 4, 5, 14, 35, 0, tzinfo=UTC),
        error_message=None,
        records_collected=1234,
        records_failed=5,
        uptime_seconds=3600.5,
    )
