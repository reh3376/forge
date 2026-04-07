"""Tests for the BOSC IMS service-specific collectors."""

import pytest

from forge.adapters.bosc_ims.client import MockBoscImsClient
from forge.adapters.bosc_ims.collectors import (
    collect_asset_snapshots,
    collect_compliance,
    collect_events,
    collect_locations,
    collect_suppliers,
)

_ADAPTER_ID = "bosc-ims"
_ADAPTER_VERSION = "0.1.0"


def _make_client() -> MockBoscImsClient:
    """Create a mock client with representative test data."""
    client = MockBoscImsClient()
    client.seed_events([
        {
            "event_id": "evt-001",
            "asset_id": "asset-001",
            "actor_id": "USR-01",
            "event_type": "TRANSACTION_TYPE_ASSET_RECEIVED",
            "occurred_at": "2026-04-06T14:00:00+00:00",
            "payload": {"part_id": "PART-001", "quantity": 10},
        },
        {
            "event_id": "evt-002",
            "asset_id": "asset-002",
            "actor_id": "USR-02",
            "event_type": "TRANSACTION_TYPE_SHIPPED",
            "occurred_at": "2026-04-06T15:00:00+00:00",
        },
    ])
    client.seed_assets([
        {
            "id": "asset-001",
            "part_id": "PART-001",
            "current_location_id": "LOC-RECV",
            "disposition": "QUARANTINED",
            "system_state": "ACTIVE",
            "asset_state": "NEW",
        },
    ])
    client.seed_locations([
        {
            "id": "loc-1",
            "name": "Warehouse-A",
            "location_type": "WAREHOUSE",
            "warehouse_id": "WH-01",
        },
        {
            "id": "loc-2",
            "name": "Bay-3",
            "location_type": "BAY",
            "parent_id": "loc-1",
        },
    ])
    client.seed_suppliers([
        {
            "id": "sup-1",
            "name": "Precision Cast",
            "supplier_type": "OEM",
            "status": "ACTIVE",
        },
    ])
    client.seed_compliance({
        "asset-001": {
            "tests": [{"test_id": "t1", "result": "PASS"}],
            "documents": [{"doc_id": "d1", "type": "CoC"}],
            "gaps": [],
        },
    })
    return client


# ── Event Collector ──────────────────────────────────────────────


class TestCollectEvents:
    """Verify the primary event collection path."""

    @pytest.mark.asyncio()
    async def test_collects_all_events(self):
        client = _make_client()
        records = [
            r async for r in collect_events(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
            )
        ]
        assert len(records) == 2

    @pytest.mark.asyncio()
    async def test_event_source_is_bosc(self):
        client = _make_client()
        records = [
            r async for r in collect_events(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
            )
        ]
        assert records[0].source.system == "bosc-ims"
        assert records[0].source.adapter_id == "bosc-ims"

    @pytest.mark.asyncio()
    async def test_event_tag_paths(self):
        client = _make_client()
        records = [
            r async for r in collect_events(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
            )
        ]
        assert records[0].source.tag_path == "bosc.event.asset_received"
        assert records[1].source.tag_path == "bosc.event.shipped"

    @pytest.mark.asyncio()
    async def test_asset_enrichment(self):
        client = _make_client()
        records = [
            r async for r in collect_events(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
                enrich_assets=True,
            )
        ]
        # asset-001 exists in mock, so first event should be enriched
        ctx = records[0].context
        assert ctx.area == "LOC-RECV"
        assert ctx.extra["disposition"] == "QUARANTINED"

    @pytest.mark.asyncio()
    async def test_no_enrichment(self):
        client = _make_client()
        records = [
            r async for r in collect_events(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
                enrich_assets=False,
            )
        ]
        # Without enrichment, context comes from event only
        assert len(records) == 2

    @pytest.mark.asyncio()
    async def test_incremental_since(self):
        from datetime import datetime, timezone

        client = _make_client()
        since = datetime(2026, 4, 6, 14, 30, tzinfo=timezone.utc)
        records = [
            r async for r in collect_events(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
                since=since,
            )
        ]
        # Only evt-002 (15:00) is after since (14:30)
        assert len(records) == 1
        assert records[0].source.tag_path == "bosc.event.shipped"

    @pytest.mark.asyncio()
    async def test_limit(self):
        client = _make_client()
        records = [
            r async for r in collect_events(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
                limit=1,
            )
        ]
        assert len(records) == 1

    @pytest.mark.asyncio()
    async def test_lineage_chain(self):
        client = _make_client()
        records = [
            r async for r in collect_events(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
            )
        ]
        chain = records[0].lineage.transformation_chain
        assert "bosc.v1.TransactionEvent" in chain


# ── Location Collector ───────────────────────────────────────────


class TestCollectLocations:
    """Verify inventory location collection."""

    @pytest.mark.asyncio()
    async def test_collects_all_locations(self):
        client = _make_client()
        records = [
            r async for r in collect_locations(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
            )
        ]
        assert len(records) == 2

    @pytest.mark.asyncio()
    async def test_location_tag_path(self):
        client = _make_client()
        records = [
            r async for r in collect_locations(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
            )
        ]
        assert records[0].source.tag_path == "bosc.inventory.location"

    @pytest.mark.asyncio()
    async def test_location_context(self):
        client = _make_client()
        records = [
            r async for r in collect_locations(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
            )
        ]
        assert records[0].context.area == "Warehouse-A"
        assert records[0].context.extra["location_id"] == "loc-1"

    @pytest.mark.asyncio()
    async def test_location_lineage(self):
        client = _make_client()
        records = [
            r async for r in collect_locations(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
            )
        ]
        assert "bosc.v1.InventoryLocation" in records[0].lineage.transformation_chain


# ── Supplier Collector ───────────────────────────────────────────


class TestCollectSuppliers:
    """Verify supplier entity collection."""

    @pytest.mark.asyncio()
    async def test_collects_all_suppliers(self):
        client = _make_client()
        records = [
            r async for r in collect_suppliers(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
            )
        ]
        assert len(records) == 1

    @pytest.mark.asyncio()
    async def test_supplier_tag_path(self):
        client = _make_client()
        records = [
            r async for r in collect_suppliers(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
            )
        ]
        assert records[0].source.tag_path == "bosc.supplier"

    @pytest.mark.asyncio()
    async def test_supplier_context(self):
        client = _make_client()
        records = [
            r async for r in collect_suppliers(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
            )
        ]
        extra = records[0].context.extra
        assert extra["supplier_name"] == "Precision Cast"
        assert extra["supplier_type"] == "OEM"

    @pytest.mark.asyncio()
    async def test_supplier_lineage(self):
        client = _make_client()
        records = [
            r async for r in collect_suppliers(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
            )
        ]
        assert "bosc.v1.Supplier" in records[0].lineage.transformation_chain


# ── Asset Snapshot Collector ─────────────────────────────────────


class TestCollectAssetSnapshots:
    """Verify asset snapshot collection."""

    @pytest.mark.asyncio()
    async def test_collects_known_asset(self):
        client = _make_client()
        records = [
            r async for r in collect_asset_snapshots(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
                asset_ids=["asset-001"],
            )
        ]
        assert len(records) == 1
        assert records[0].source.tag_path == "bosc.asset.snapshot"

    @pytest.mark.asyncio()
    async def test_skips_unknown_asset(self):
        client = _make_client()
        records = [
            r async for r in collect_asset_snapshots(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
                asset_ids=["nonexistent"],
            )
        ]
        assert len(records) == 0

    @pytest.mark.asyncio()
    async def test_asset_snapshot_lineage(self):
        client = _make_client()
        records = [
            r async for r in collect_asset_snapshots(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
                asset_ids=["asset-001"],
            )
        ]
        assert "bosc.v1.Asset" in records[0].lineage.transformation_chain


# ── Compliance Collector ─────────────────────────────────────────


class TestCollectCompliance:
    """Verify compliance data collection."""

    @pytest.mark.asyncio()
    async def test_collects_compliance(self):
        client = _make_client()
        records = [
            r async for r in collect_compliance(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
                asset_ids=["asset-001"],
            )
        ]
        assert len(records) == 1
        assert records[0].source.tag_path == "bosc.compliance.test_record"

    @pytest.mark.asyncio()
    async def test_skips_unknown_asset(self):
        client = _make_client()
        records = [
            r async for r in collect_compliance(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
                asset_ids=["nonexistent"],
            )
        ]
        assert len(records) == 0

    @pytest.mark.asyncio()
    async def test_compliance_context(self):
        client = _make_client()
        records = [
            r async for r in collect_compliance(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
                asset_ids=["asset-001"],
            )
        ]
        extra = records[0].context.extra
        assert extra["asset_id"] == "asset-001"
        assert extra["test_count"] == 1
        assert extra["document_count"] == 1

    @pytest.mark.asyncio()
    async def test_compliance_lineage(self):
        client = _make_client()
        records = [
            r async for r in collect_compliance(
                client,
                adapter_id=_ADAPTER_ID,
                adapter_version=_ADAPTER_VERSION,
                asset_ids=["asset-001"],
            )
        ]
        chain = records[0].lineage.transformation_chain
        assert "bosc.v1.ComplianceService.GetAssetComplianceStatus" in chain
