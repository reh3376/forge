"""BOSC IMS gRPC client abstraction.

Decouples the adapter from compiled bosc.v1 protobuf stubs by defining
a protocol (ABC) for the operations the adapter needs. Two implementations:

  - GrpcBoscImsClient: Production client using grpcio + compiled stubs.
    Requires bosc.v1 generated code on sys.path.
  - MockBoscImsClient: Test/conformance client returning canned data.
    No external dependencies.

The adapter code programs against the BoscImsClient ABC, never importing
bosc.v1 stubs directly. When the Forge platform is deployed alongside
BOSC IMS, the real client is injected at configure() time.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


# ── Client protocol ──────────────────────────────────────────────


class BoscImsClient(ABC):
    """Abstract interface for communicating with BOSC IMS services.

    Each method corresponds to one or more gRPC RPCs on the Go core.
    Methods return plain dicts — the adapter's context/record builders
    handle the mapping to ContextualRecords.
    """

    # ── AssetService ─────────────────────────────────────────────

    @abstractmethod
    async def get_asset(self, asset_id: str) -> dict[str, Any] | None:
        """Fetch a single asset by ID.

        Maps to: bosc.v1.AssetService.GetAsset
        """

    @abstractmethod
    async def list_recent_events(
        self,
        *,
        since: datetime | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Fetch recent TransactionEvents.

        In production, this calls a List/Stream RPC or queries the
        append-only event log. The 'since' parameter enables incremental
        collection by returning only events after the given timestamp.

        Maps to: bosc.v1.AssetService (future ListTransactionEvents or
        Phase 3 StreamTransactionEvents).
        """

    # ── InventoryService ─────────────────────────────────────────

    @abstractmethod
    async def list_locations(self) -> list[dict[str, Any]]:
        """Fetch all inventory locations.

        Maps to: bosc.v1.InventoryService.ListLocations
        """

    @abstractmethod
    async def get_receipt(self, receipt_id: str) -> dict[str, Any] | None:
        """Fetch a receiving document by ID.

        Maps to: bosc.v1.InventoryService.GetReceipt
        """

    # ── ComplianceService ────────────────────────────────────────

    @abstractmethod
    async def get_asset_compliance(
        self, asset_id: str,
    ) -> dict[str, Any] | None:
        """Fetch compliance status for an asset.

        Returns test records and documents. Maps to:
        bosc.v1.ComplianceService.GetAssetComplianceStatus
        """

    @abstractmethod
    async def get_compliance_gaps(
        self, asset_id: str,
    ) -> list[dict[str, Any]]:
        """Fetch compliance gaps for an asset.

        Maps to: bosc.v1.ComplianceService.GetComplianceGaps
        """

    # ── CatalogService ───────────────────────────────────────────

    @abstractmethod
    async def get_part(self, part_id: str) -> dict[str, Any] | None:
        """Fetch a catalog part by ID.

        Maps to: bosc.v1.CatalogService.GetPart
        """

    # ── SupplierService ──────────────────────────────────────────

    @abstractmethod
    async def list_suppliers(self) -> list[dict[str, Any]]:
        """Fetch all suppliers.

        Maps to: bosc.v1.SupplierService.ListSuppliers
        """

    # ── Streaming (Phase 3) ─────────────────────────────────────

    @abstractmethod
    async def stream_transaction_events(
        self,
        *,
        event_types: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Stream TransactionEvents from the Go core.

        In production, this calls a server-streaming gRPC RPC
        (StreamTransactionEvents) and yields events as they arrive.
        For the mock, returns any buffered egress events.

        Maps to: bosc.v1.AssetService.StreamTransactionEvents (Phase 3)
        """

    @abstractmethod
    async def send_intelligence(
        self, event: dict[str, Any],
    ) -> bool:
        """Send a HubIntelligenceEvent to the BOSC IMS Go core.

        Used for Hub → BOSC inbound intelligence delivery.
        Returns True if accepted.

        Maps to: bosc.v1.HubService.DeliverIntelligence (future)
        """

    # ── Lifecycle ────────────────────────────────────────────────

    @abstractmethod
    async def connect(self) -> None:
        """Establish connection to the BOSC IMS gRPC server."""

    @abstractmethod
    async def close(self) -> None:
        """Close the gRPC channel."""

    @abstractmethod
    async def health_check(self) -> bool:
        """Perform a lightweight health check.

        Returns True if the server is reachable and responsive.
        """


# ── Mock implementation ──────────────────────────────────────────


class MockBoscImsClient(BoscImsClient):
    """In-memory client for testing and conformance validation.

    Pre-populated with representative BOSC IMS data that exercises
    the full context/record builder pipeline.
    """

    def __init__(self) -> None:
        self._connected = False
        self._events: list[dict[str, Any]] = []
        self._assets: dict[str, dict[str, Any]] = {}
        self._locations: list[dict[str, Any]] = []
        self._suppliers: list[dict[str, Any]] = []
        self._compliance: dict[str, dict[str, Any]] = {}
        self._parts: dict[str, dict[str, Any]] = {}
        self._egress_events: list[dict[str, Any]] = []
        self._intelligence_inbox: list[dict[str, Any]] = []

    # ── Data injection (test helpers) ────────────────────────────

    def seed_events(self, events: list[dict[str, Any]]) -> None:
        """Seed the mock with TransactionEvent dicts."""
        self._events = list(events)

    def seed_assets(self, assets: list[dict[str, Any]]) -> None:
        """Seed the mock with Asset dicts (keyed by 'id')."""
        self._assets = {a["id"]: a for a in assets}

    def seed_locations(self, locations: list[dict[str, Any]]) -> None:
        """Seed the mock with InventoryLocation dicts."""
        self._locations = list(locations)

    def seed_suppliers(self, suppliers: list[dict[str, Any]]) -> None:
        """Seed the mock with Supplier dicts."""
        self._suppliers = list(suppliers)

    def seed_compliance(
        self, compliance: dict[str, dict[str, Any]],
    ) -> None:
        """Seed compliance records keyed by asset_id."""
        self._compliance = dict(compliance)

    def seed_parts(self, parts: list[dict[str, Any]]) -> None:
        """Seed the mock with Part dicts (keyed by 'id')."""
        self._parts = {p["id"]: p for p in parts}

    def seed_egress_events(
        self, events: list[dict[str, Any]],
    ) -> None:
        """Seed egress events (HubEgressEvent-shaped dicts)."""
        self._egress_events = list(events)

    # ── AssetService ─────────────────────────────────────────────

    async def get_asset(self, asset_id: str) -> dict[str, Any] | None:
        return self._assets.get(asset_id)

    async def list_recent_events(
        self,
        *,
        since: datetime | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        events = self._events
        if since is not None:
            events = [
                e for e in events
                if _event_timestamp(e) > since
            ]
        return events[:limit]

    # ── InventoryService ─────────────────────────────────────────

    async def list_locations(self) -> list[dict[str, Any]]:
        return list(self._locations)

    async def get_receipt(self, receipt_id: str) -> dict[str, Any] | None:
        # Mock: receipts not seeded by default
        return None

    # ── ComplianceService ────────────────────────────────────────

    async def get_asset_compliance(
        self, asset_id: str,
    ) -> dict[str, Any] | None:
        return self._compliance.get(asset_id)

    async def get_compliance_gaps(
        self, asset_id: str,
    ) -> list[dict[str, Any]]:
        comp = self._compliance.get(asset_id, {})
        return comp.get("gaps", [])

    # ── CatalogService ───────────────────────────────────────────

    async def get_part(self, part_id: str) -> dict[str, Any] | None:
        return self._parts.get(part_id)

    # ── SupplierService ──────────────────────────────────────────

    async def list_suppliers(self) -> list[dict[str, Any]]:
        return list(self._suppliers)

    # ── Streaming (Phase 3) ─────────────────────────────────────

    async def stream_transaction_events(
        self,
        *,
        event_types: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        events = list(self._egress_events)
        if event_types:
            events = [
                e for e in events
                if e.get("inner_event", {}).get("event_type") in event_types
            ]
        # Drain after reading (simulates streaming consumption)
        self._egress_events.clear()
        return events

    async def send_intelligence(
        self, event: dict[str, Any],
    ) -> bool:
        self._intelligence_inbox.append(event)
        return True

    # ── Lifecycle ────────────────────────────────────────────────

    async def connect(self) -> None:
        self._connected = True
        logger.info("MockBoscImsClient connected")

    async def close(self) -> None:
        self._connected = False
        logger.info("MockBoscImsClient closed")

    async def health_check(self) -> bool:
        return self._connected


def _event_timestamp(event: dict[str, Any]) -> datetime:
    """Extract a comparable timestamp from an event dict."""
    raw = event.get("occurred_at")
    if raw is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if isinstance(raw, datetime):
        if raw.tzinfo is None:
            return raw.replace(tzinfo=timezone.utc)
        return raw
    try:
        raw_str = str(raw).replace("Z", "+00:00")
        return datetime.fromisoformat(raw_str)
    except (ValueError, TypeError):
        return datetime.min.replace(tzinfo=timezone.utc)
