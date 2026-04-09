"""Service-specific collectors for the BOSC IMS adapter.

Each collector targets one BOSC IMS gRPC service, calls the relevant
RPCs via the BoscImsClient, and yields ContextualRecords. The adapter's
collect() method fans out across collectors to produce a unified stream.

Collection modes:
  - Event collection: Incremental poll of TransactionEvents (primary)
  - Entity collection: Snapshot of current state (locations, suppliers,
    parts, compliance) for discovery/backfill
  - Asset enrichment: Optional per-event fetch of the associated Asset
    to populate three-dimensional state context

All collectors return async generators, keeping memory usage bounded
regardless of the number of records.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from forge.adapters.bosc_ims.context import build_record_context
from forge.adapters.bosc_ims.record_builder import (
    build_asset_record,
    build_contextual_record,
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

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from forge.adapters.bosc_ims.client import BoscImsClient

logger = logging.getLogger(__name__)


# ── Event collector (primary data path) ──────────────────────────


async def collect_events(
    client: BoscImsClient,
    *,
    adapter_id: str,
    adapter_version: str,
    since: datetime | None = None,
    limit: int = 100,
    enrich_assets: bool = True,
) -> AsyncIterator[ContextualRecord]:
    """Collect TransactionEvents from the BOSC IMS event log.

    This is the primary ingress path. Events are fetched incrementally
    using the 'since' watermark. For each event, the associated Asset
    is optionally fetched to enrich context with current state.

    Yields:
        ContextualRecord for each TransactionEvent.
    """
    events = await client.list_recent_events(since=since, limit=limit)
    logger.debug("Collected %d events (since=%s)", len(events), since)

    for event in events:
        try:
            asset = None
            if enrich_assets:
                asset_id = event.get("asset_id")
                if asset_id:
                    asset = await client.get_asset(asset_id)

            context = build_record_context(event, asset=asset)
            record = build_contextual_record(
                raw_event=event,
                context=context,
                adapter_id=adapter_id,
                adapter_version=adapter_version,
                asset=asset,
            )
            yield record

        except Exception:
            logger.exception(
                "Failed to collect event: %s",
                event.get("event_id", "unknown"),
            )


# ── Location collector ───────────────────────────────────────────


async def collect_locations(
    client: BoscImsClient,
    *,
    adapter_id: str,
    adapter_version: str,
) -> AsyncIterator[ContextualRecord]:
    """Collect InventoryLocation snapshots.

    Maps each location to a ContextualRecord with tag_path
    'bosc.inventory.location'. Used during discovery and periodic
    entity sync.

    Yields:
        ContextualRecord for each InventoryLocation.
    """
    locations = await client.list_locations()
    now = datetime.now(tz=UTC)

    for loc in locations:
        try:
            import json

            yield ContextualRecord(
                source=RecordSource(
                    adapter_id=adapter_id,
                    system="bosc-ims",
                    tag_path="bosc.inventory.location",
                    connection_id=loc.get("id"),
                ),
                timestamp=RecordTimestamp(
                    source_time=now,
                    server_time=now,
                    ingestion_time=now,
                ),
                value=RecordValue(
                    raw=json.dumps(loc, default=str, ensure_ascii=False),
                    quality=QualityCode.GOOD,
                    data_type="json",
                ),
                context=RecordContext(
                    area=loc.get("name"),
                    site=loc.get("warehouse_id"),
                    extra={
                        "location_id": loc.get("id", ""),
                        "location_type": loc.get("location_type", ""),
                        "parent_id": loc.get("parent_id", ""),
                    },
                ),
                lineage=RecordLineage(
                    schema_ref="forge://schemas/bosc-ims/v0.1.0",
                    adapter_id=adapter_id,
                    adapter_version=adapter_version,
                    transformation_chain=[
                        "bosc.v1.InventoryLocation",
                        "forge.adapters.bosc_ims.collectors.collect_locations",
                    ],
                ),
            )

        except Exception:
            logger.exception(
                "Failed to collect location: %s",
                loc.get("id", "unknown"),
            )


# ── Supplier collector ───────────────────────────────────────────


async def collect_suppliers(
    client: BoscImsClient,
    *,
    adapter_id: str,
    adapter_version: str,
) -> AsyncIterator[ContextualRecord]:
    """Collect Supplier entity snapshots.

    Maps each supplier to a ContextualRecord with tag_path
    'bosc.supplier'. Used during discovery and periodic entity sync.

    Yields:
        ContextualRecord for each Supplier.
    """
    suppliers = await client.list_suppliers()
    now = datetime.now(tz=UTC)

    for supplier in suppliers:
        try:
            import json

            yield ContextualRecord(
                source=RecordSource(
                    adapter_id=adapter_id,
                    system="bosc-ims",
                    tag_path="bosc.supplier",
                    connection_id=supplier.get("id"),
                ),
                timestamp=RecordTimestamp(
                    source_time=now,
                    server_time=now,
                    ingestion_time=now,
                ),
                value=RecordValue(
                    raw=json.dumps(
                        supplier, default=str, ensure_ascii=False,
                    ),
                    quality=QualityCode.GOOD,
                    data_type="json",
                ),
                context=RecordContext(
                    extra={
                        "supplier_id": supplier.get("id", ""),
                        "supplier_name": supplier.get("name", ""),
                        "supplier_type": supplier.get("supplier_type", ""),
                        "status": supplier.get("status", ""),
                    },
                ),
                lineage=RecordLineage(
                    schema_ref="forge://schemas/bosc-ims/v0.1.0",
                    adapter_id=adapter_id,
                    adapter_version=adapter_version,
                    transformation_chain=[
                        "bosc.v1.Supplier",
                        "forge.adapters.bosc_ims.collectors.collect_suppliers",
                    ],
                ),
            )

        except Exception:
            logger.exception(
                "Failed to collect supplier: %s",
                supplier.get("id", "unknown"),
            )


# ── Asset snapshot collector ─────────────────────────────────────


async def collect_asset_snapshots(
    client: BoscImsClient,
    *,
    adapter_id: str,
    adapter_version: str,
    asset_ids: list[str],
) -> AsyncIterator[ContextualRecord]:
    """Collect current Asset snapshots by ID.

    Used during backfill or when the hub requests a point-in-time
    snapshot of specific assets. Each asset is fetched individually
    and mapped to a ContextualRecord via build_asset_record().

    Yields:
        ContextualRecord for each Asset found.
    """
    for asset_id in asset_ids:
        try:
            asset = await client.get_asset(asset_id)
            if asset is None:
                logger.warning("Asset not found: %s", asset_id)
                continue

            yield build_asset_record(
                asset=asset,
                adapter_id=adapter_id,
                adapter_version=adapter_version,
            )

        except Exception:
            logger.exception(
                "Failed to collect asset snapshot: %s", asset_id,
            )


# ── Compliance collector ─────────────────────────────────────────


async def collect_compliance(
    client: BoscImsClient,
    *,
    adapter_id: str,
    adapter_version: str,
    asset_ids: list[str],
) -> AsyncIterator[ContextualRecord]:
    """Collect compliance status for specific assets.

    Fetches compliance test records and documents for each asset,
    yielding a ContextualRecord per asset. Used during discovery
    or when compliance data is requested by the hub.

    Yields:
        ContextualRecord for each asset's compliance status.
    """
    now = datetime.now(tz=UTC)

    for asset_id in asset_ids:
        try:
            compliance = await client.get_asset_compliance(asset_id)
            if compliance is None:
                continue

            import json

            yield ContextualRecord(
                source=RecordSource(
                    adapter_id=adapter_id,
                    system="bosc-ims",
                    tag_path="bosc.compliance.test_record",
                    connection_id=asset_id,
                ),
                timestamp=RecordTimestamp(
                    source_time=now,
                    server_time=now,
                    ingestion_time=now,
                ),
                value=RecordValue(
                    raw=json.dumps(
                        compliance, default=str, ensure_ascii=False,
                    ),
                    quality=QualityCode.GOOD,
                    data_type="json",
                ),
                context=RecordContext(
                    extra={
                        "asset_id": asset_id,
                        "test_count": len(
                            compliance.get("tests", []),
                        ),
                        "document_count": len(
                            compliance.get("documents", []),
                        ),
                        "gaps": compliance.get("gaps", []),
                    },
                ),
                lineage=RecordLineage(
                    schema_ref="forge://schemas/bosc-ims/v0.1.0",
                    adapter_id=adapter_id,
                    adapter_version=adapter_version,
                    transformation_chain=[
                        "bosc.v1.ComplianceService.GetAssetComplianceStatus",
                        "forge.adapters.bosc_ims.collectors.collect_compliance",
                    ],
                ),
            )

        except Exception:
            logger.exception(
                "Failed to collect compliance for asset: %s", asset_id,
            )
