# ruff: noqa: E402, UP017, UP042
"""Shared fixtures for transport layer tests."""

from __future__ import annotations

import datetime as _dt_mod
import enum
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

# Python 3.10 compat patches (sandbox is 3.10, code targets 3.12+)
if not hasattr(_dt_mod, "UTC"):
    _dt_mod.UTC = _dt_mod.timezone.utc

if not hasattr(enum, "StrEnum"):
    class StrEnum(str, enum.Enum):
        pass
    enum.StrEnum = StrEnum

import pytest

# Ensure src/ and proto_gen/ are importable
_src = Path(__file__).resolve().parent.parent.parent / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))
_proto_gen = _src / "forge" / "proto_gen"
if str(_proto_gen) not in sys.path:
    sys.path.insert(0, str(_proto_gen))

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
            source_time=datetime(2026, 4, 5, 14, 30, 0, 123000, tzinfo=timezone.utc),
            server_time=datetime(2026, 4, 5, 14, 30, 0, 150000, tzinfo=timezone.utc),
            ingestion_time=datetime(2026, 4, 5, 14, 30, 0, 200000, tzinfo=timezone.utc),
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
            shift="B",
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
            read=True, write=False, subscribe=True, backfill=True, discover=True,
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
        last_check=datetime(2026, 4, 5, 14, 35, 0, tzinfo=timezone.utc),
        last_healthy=datetime(2026, 4, 5, 14, 35, 0, tzinfo=timezone.utc),
        error_message=None,
        records_collected=1234,
        records_failed=5,
        uptime_seconds=3600.5,
    )
