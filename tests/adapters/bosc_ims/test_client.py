"""Tests for the BOSC IMS client abstraction."""

import pytest

from forge.adapters.bosc_ims.client import MockBoscImsClient

# ── Mock Client Lifecycle ────────────────────────────────────────


class TestMockClientLifecycle:
    """Verify MockBoscImsClient lifecycle operations."""

    @pytest.mark.asyncio()
    async def test_connect(self):
        client = MockBoscImsClient()
        assert not client._connected
        await client.connect()
        assert client._connected

    @pytest.mark.asyncio()
    async def test_close(self):
        client = MockBoscImsClient()
        await client.connect()
        await client.close()
        assert not client._connected

    @pytest.mark.asyncio()
    async def test_health_check_when_connected(self):
        client = MockBoscImsClient()
        await client.connect()
        assert await client.health_check() is True

    @pytest.mark.asyncio()
    async def test_health_check_when_disconnected(self):
        client = MockBoscImsClient()
        assert await client.health_check() is False


# ── Event Operations ─────────────────────────────────────────────


class TestMockClientEvents:
    """Verify event seeding and retrieval."""

    @pytest.mark.asyncio()
    async def test_list_recent_events_empty(self):
        client = MockBoscImsClient()
        events = await client.list_recent_events()
        assert events == []

    @pytest.mark.asyncio()
    async def test_list_recent_events_seeded(self):
        client = MockBoscImsClient()
        client.seed_events([
            {
                "event_id": "evt-001",
                "asset_id": "a1",
                "event_type": "TRANSACTION_TYPE_ASSET_RECEIVED",
                "occurred_at": "2026-04-06T14:00:00+00:00",
            },
            {
                "event_id": "evt-002",
                "asset_id": "a2",
                "event_type": "TRANSACTION_TYPE_SHIPPED",
                "occurred_at": "2026-04-06T15:00:00+00:00",
            },
        ])
        events = await client.list_recent_events()
        assert len(events) == 2

    @pytest.mark.asyncio()
    async def test_list_recent_events_with_limit(self):
        client = MockBoscImsClient()
        client.seed_events([
            {"event_id": f"evt-{i}", "occurred_at": f"2026-04-06T{i:02d}:00:00+00:00"}
            for i in range(10)
        ])
        events = await client.list_recent_events(limit=3)
        assert len(events) == 3

    @pytest.mark.asyncio()
    async def test_list_recent_events_with_since(self):
        from datetime import UTC, datetime

        client = MockBoscImsClient()
        client.seed_events([
            {
                "event_id": "evt-old",
                "occurred_at": "2026-04-05T10:00:00+00:00",
            },
            {
                "event_id": "evt-new",
                "occurred_at": "2026-04-06T15:00:00+00:00",
            },
        ])
        since = datetime(2026, 4, 6, 0, 0, tzinfo=UTC)
        events = await client.list_recent_events(since=since)
        assert len(events) == 1
        assert events[0]["event_id"] == "evt-new"


# ── Asset Operations ─────────────────────────────────────────────


class TestMockClientAssets:
    """Verify asset seeding and retrieval."""

    @pytest.mark.asyncio()
    async def test_get_asset_not_found(self):
        client = MockBoscImsClient()
        assert await client.get_asset("nonexistent") is None

    @pytest.mark.asyncio()
    async def test_get_asset_found(self):
        client = MockBoscImsClient()
        client.seed_assets([
            {
                "id": "asset-001",
                "part_id": "PART-BOLT",
                "disposition": "SERVICEABLE",
                "system_state": "ACTIVE",
                "asset_state": "NEW",
            },
        ])
        asset = await client.get_asset("asset-001")
        assert asset is not None
        assert asset["disposition"] == "SERVICEABLE"


# ── Entity Operations ────────────────────────────────────────────


class TestMockClientEntities:
    """Verify entity seeding and retrieval."""

    @pytest.mark.asyncio()
    async def test_list_locations_empty(self):
        client = MockBoscImsClient()
        assert await client.list_locations() == []

    @pytest.mark.asyncio()
    async def test_list_locations_seeded(self):
        client = MockBoscImsClient()
        client.seed_locations([
            {"id": "loc-1", "name": "Warehouse-A"},
            {"id": "loc-2", "name": "Warehouse-B"},
        ])
        locations = await client.list_locations()
        assert len(locations) == 2

    @pytest.mark.asyncio()
    async def test_list_suppliers_seeded(self):
        client = MockBoscImsClient()
        client.seed_suppliers([
            {"id": "sup-1", "name": "Precision Cast"},
        ])
        suppliers = await client.list_suppliers()
        assert len(suppliers) == 1
        assert suppliers[0]["name"] == "Precision Cast"

    @pytest.mark.asyncio()
    async def test_get_part_found(self):
        client = MockBoscImsClient()
        client.seed_parts([
            {"id": "part-1", "part_number": "BOLT-A286-001"},
        ])
        part = await client.get_part("part-1")
        assert part is not None
        assert part["part_number"] == "BOLT-A286-001"

    @pytest.mark.asyncio()
    async def test_get_asset_compliance(self):
        client = MockBoscImsClient()
        client.seed_compliance({
            "asset-001": {
                "tests": [{"test_id": "t1", "result": "PASS"}],
                "documents": [{"doc_id": "d1"}],
                "gaps": [],
            },
        })
        comp = await client.get_asset_compliance("asset-001")
        assert comp is not None
        assert len(comp["tests"]) == 1

    @pytest.mark.asyncio()
    async def test_get_compliance_gaps(self):
        client = MockBoscImsClient()
        client.seed_compliance({
            "asset-002": {
                "tests": [],
                "documents": [],
                "gaps": [{"gap_id": "g1", "severity": "HIGH"}],
            },
        })
        gaps = await client.get_compliance_gaps("asset-002")
        assert len(gaps) == 1
        assert gaps[0]["severity"] == "HIGH"
