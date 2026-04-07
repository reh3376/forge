"""Scanner Gateway Adapter — edge device ingestion hub.

Two-tier architecture:
  1. Android devices connect to a ScannerService gRPC server (gateway)
  2. Gateway translates scan events to ContextualRecords
  3. Spoke router dispatches to WMS/IMS/QMS adapters based on scan type

This is the first Forge adapter that:
  - Runs a gRPC server (Android-facing) instead of being a pure client
  - Routes events to multiple target spokes from a single input stream
  - Manages edge device identity and authentication

Data flow:
    Android Device ──gRPC──► ScannerServiceHandler ──queue──►
    Adapter.collect() ──► ContextualRecord ──► SpokeClient ──► Hub
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from forge.adapters.base.interface import (
    AdapterBase,
    DiscoveryProvider,
    SubscriptionProvider,
)
from forge.adapters.scanner_gateway.config import ScannerGatewayConfig
from forge.adapters.scanner_gateway.context import build_record_context
from forge.adapters.scanner_gateway.device_registry import DeviceRegistry
from forge.adapters.scanner_gateway.record_builder import build_contextual_record
from forge.adapters.scanner_gateway.server import (
    MockScannerServiceHandler,
    ScannerServiceHandler,
)
from forge.adapters.scanner_gateway.spoke_router import SpokeRouter
from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterHealth,
    AdapterManifest,
    AdapterState,
    AdapterTier,
    ConnectionParam,
    DataContract,
)

logger = logging.getLogger(__name__)

_MANIFEST_PATH = Path(__file__).parent / "manifest.json"


def _load_manifest() -> AdapterManifest:
    """Load and parse the adapter manifest from manifest.json."""
    raw = json.loads(_MANIFEST_PATH.read_text())
    return AdapterManifest(
        adapter_id=raw["adapter_id"],
        name=raw["name"],
        version=raw["version"],
        type=raw.get("type", "INGESTION"),
        protocol=raw["protocol"],
        tier=AdapterTier(raw["tier"]),
        capabilities=AdapterCapabilities(**raw.get("capabilities", {})),
        data_contract=DataContract(**raw.get("data_contract", {})),
        health_check_interval_ms=raw.get("health_check_interval_ms", 10_000),
        connection_params=[
            ConnectionParam(**p) for p in raw.get("connection_params", [])
        ],
        auth_methods=raw.get("auth_methods", ["none"]),
        metadata=raw.get("metadata", {}),
    )


class ScannerGatewayAdapter(
    AdapterBase,
    SubscriptionProvider,
    DiscoveryProvider,
):
    """Forge adapter for QR/barcode scanner edge devices.

    Receives scan events from Android handheld scanners via a
    lightweight ScannerService gRPC contract, translates them to
    Forge ContextualRecords, and routes them to the appropriate
    spoke adapter (WMS, IMS, QMS) based on scan type.

    Capabilities: read + subscribe + discover (no write, no backfill).
    Backfill is not supported because scan events are ephemeral —
    the authoritative record lives in the target spoke, not the scanner.

    Two collection modes:
      - Live mode: Server handler queues scan events as they arrive
        from Android devices. collect() drains the queue.
      - Test mode: inject_records() or handler.inject_scans() pre-loads
        events for deterministic testing.
    """

    manifest: AdapterManifest = _load_manifest()

    def __init__(self) -> None:
        super().__init__()
        self._config: ScannerGatewayConfig | None = None
        self._router: SpokeRouter | None = None
        self._registry: DeviceRegistry = DeviceRegistry()
        self._handler: ScannerServiceHandler | None = None
        self._subscriptions: dict[str, Any] = {}
        self._consecutive_failures: int = 0
        self._last_healthy: datetime | None = None

    # ── Component injection (for testing / production swap) ────

    @property
    def registry(self) -> DeviceRegistry:
        """The device registry — tracks registered Android devices."""
        return self._registry

    @property
    def handler(self) -> ScannerServiceHandler | None:
        """The server handler — receives RPCs from Android devices."""
        return self._handler

    def set_handler(self, handler: ScannerServiceHandler) -> None:
        """Inject a ScannerServiceHandler implementation.

        In production, the hub injects a GrpcScannerServiceHandler
        that runs a real grpc.aio server. For testing, use
        MockScannerServiceHandler.
        """
        self._handler = handler

    # ── Lifecycle (AdapterBase) ─────────────────────────────────

    async def configure(self, params: dict[str, Any]) -> None:
        """Validate and store connection parameters.

        If no handler has been injected via set_handler(), creates a
        MockScannerServiceHandler as a fallback for testing/conformance.
        """
        self._config = ScannerGatewayConfig(**params)
        self._router = SpokeRouter(
            wms_adapter_id=self._config.wms_adapter_id,
            ims_adapter_id=self._config.ims_adapter_id,
            qms_adapter_id=self._config.qms_adapter_id,
        )

        if self._handler is None:
            self._handler = MockScannerServiceHandler(
                self._registry,
                max_batch_size=self._config.max_batch_size,
            )

        self._state = AdapterState.REGISTERED
        logger.info(
            "Scanner Gateway configured: listen=%s, routes=%s",
            self._config.listen_address,
            sorted(self._router.target_adapter_ids()),
        )

    async def start(self) -> None:
        """Begin active operation — start ScannerService handler.

        Starts the server handler to accept RPCs from Android devices.
        In production this starts a grpc.aio server; for testing the
        MockScannerServiceHandler marks itself as accepting calls.
        """
        if self._config is None:
            msg = "Adapter not configured — call configure() first"
            raise RuntimeError(msg)

        self._state = AdapterState.CONNECTING

        if self._handler is not None:
            await self._handler.start()

        self._state = AdapterState.HEALTHY
        self._last_healthy = datetime.now(tz=timezone.utc)
        logger.info(
            "Scanner Gateway started (state=%s, listen=%s, devices=%d)",
            self._state,
            self._config.listen_address,
            self._registry.device_count,
        )

    async def stop(self) -> None:
        """Graceful shutdown — stop handler and clear state."""
        if self._handler is not None:
            await self._handler.stop()
        self._subscriptions.clear()
        self._state = AdapterState.STOPPED
        logger.info("Scanner Gateway stopped")

    async def health(self) -> AdapterHealth:
        """Return current health status.

        Includes device registry summary in the health metadata.
        Tracks consecutive failures for degraded/failed transitions.
        """
        # Check device health for degradation and recovery signals
        if (
            self._state in (AdapterState.HEALTHY, AdapterState.DEGRADED)
            and self._registry.device_count > 0
        ):
            online = self._registry.online_count
            if online == 0:
                self._consecutive_failures += 1
                if self._consecutive_failures >= 10:
                    self._state = AdapterState.FAILED
                elif self._consecutive_failures >= 3:
                    self._state = AdapterState.DEGRADED
            else:
                self._consecutive_failures = 0
                self._last_healthy = datetime.now(tz=timezone.utc)
                self._state = AdapterState.HEALTHY

        return AdapterHealth(
            adapter_id=self.adapter_id,
            state=self._state,
            last_healthy=self._last_healthy,
            records_collected=self._records_collected,
            records_failed=self._records_failed,
        )

    # ── Core read interface (AdapterBase) ───────────────────────

    async def collect(self):
        """Yield ContextualRecords from scan events.

        Two sources of scan events, checked in priority order:

        1. Live queue: The server handler queues events as they arrive
           from Android devices. collect() drains all currently queued
           events without blocking (non-blocking poll).

        2. Injected records: For testing, inject_records() pre-loads
           events that are yielded on the next collect() call.

        Each event is translated to a ContextualRecord and annotated
        with routing metadata (which spoke(s) to deliver to).
        """
        # Phase 2: Queue-based collection from server handler
        if self._handler is not None and hasattr(self._handler, "queue"):
            queue: asyncio.Queue[dict[str, Any]] = self._handler.queue
            has_yielded = False

            while not queue.empty():
                try:
                    scan_event = queue.get_nowait()
                except asyncio.QueueEmpty:
                    break

                try:
                    record = self._translate_and_route(scan_event)
                    self._records_collected += 1
                    has_yielded = True
                    yield record
                except Exception:
                    self._records_failed += 1
                    logger.exception("Failed to map scan event from queue")

            if has_yielded:
                return

        # Phase 1 fallback: injected records
        for scan_event in self._pending_records:
            try:
                record = self._translate_and_route(scan_event)
                self._records_collected += 1
                yield record
            except Exception:
                self._records_failed += 1
                logger.exception("Failed to map scan event")

    def _translate_and_route(self, scan_event: dict[str, Any]):
        """Translate a scan event dict to a routed ContextualRecord.

        This is the shared translation path for both live-queue and
        injected-record collection modes.
        """
        context = build_record_context(scan_event)
        record = build_contextual_record(
            scan_event=scan_event,
            context=context,
            adapter_id=self.adapter_id,
            adapter_version=self.manifest.version,
        )

        # Annotate with routing info
        if self._router:
            scan_type = scan_event.get("scan_type", "")
            targets = self._router.route(str(scan_type))
            record.context.extra["_routed_to"] = [
                t.adapter_id for t in targets
            ]

        return record

    def inject_records(self, records: list[dict[str, Any]]) -> None:
        """Inject raw scan event data for testing."""
        self._pending_records = list(records)

    @property
    def _pending_records(self) -> list[dict[str, Any]]:
        return getattr(self, "_injected_records", [])

    @_pending_records.setter
    def _pending_records(self, value: list[dict[str, Any]]) -> None:
        self._injected_records = value

    # ── SubscriptionProvider ────────────────────────────────────

    async def subscribe(
        self,
        tags: list[str],
        callback: Any,
    ) -> str:
        """Subscribe to scan event streams.

        Tags correspond to scan type filters (e.g.,
        'scanner.scan.entry', 'scanner.scan.asset_receive').
        """
        import uuid

        sub_id = str(uuid.uuid4())
        self._subscriptions[sub_id] = {
            "tags": tags,
            "callback": callback,
        }
        logger.info("Scanner Gateway subscription %s: tags=%s", sub_id, tags)
        return sub_id

    async def unsubscribe(self, subscription_id: str) -> None:
        """Cancel a subscription."""
        self._subscriptions.pop(subscription_id, None)

    # ── DiscoveryProvider ───────────────────────────────────────

    async def discover(self) -> list[dict[str, Any]]:
        """Enumerate available scan event types.

        Returns the 12 scan types defined in scanner.v1.ScanType,
        plus the device management endpoints.
        """
        return [
            {
                "tag_path": "scanner.scan.entry",
                "data_type": "event",
                "description": "Barrel entry scan (WMS)",
            },
            {
                "tag_path": "scanner.scan.dump",
                "data_type": "event",
                "description": "Barrel dump scan (WMS)",
            },
            {
                "tag_path": "scanner.scan.withdrawal",
                "data_type": "event",
                "description": "Barrel withdrawal scan (WMS)",
            },
            {
                "tag_path": "scanner.scan.relocation",
                "data_type": "event",
                "description": "Barrel relocation scan (WMS)",
            },
            {
                "tag_path": "scanner.scan.inspection",
                "data_type": "event",
                "description": "Barrel inspection scan (WMS + IMS)",
            },
            {
                "tag_path": "scanner.scan.inventory",
                "data_type": "event",
                "description": "Inventory count scan (WMS + IMS)",
            },
            {
                "tag_path": "scanner.scan.label_verification",
                "data_type": "event",
                "description": "Label verification scan (WMS)",
            },
            {
                "tag_path": "scanner.scan.asset_receive",
                "data_type": "event",
                "description": "Asset receipt scan (IMS)",
            },
            {
                "tag_path": "scanner.scan.asset_move",
                "data_type": "event",
                "description": "Asset move scan (IMS)",
            },
            {
                "tag_path": "scanner.scan.asset_install",
                "data_type": "event",
                "description": "Asset installation scan (IMS)",
            },
            {
                "tag_path": "scanner.scan.sample_collect",
                "data_type": "event",
                "description": "Sample collection scan (QMS)",
            },
            {
                "tag_path": "scanner.scan.sample_bind",
                "data_type": "event",
                "description": "Sample binding to batch/asset scan (QMS)",
            },
            {
                "tag_path": "scanner.device.heartbeat",
                "data_type": "event",
                "description": "Device health and status heartbeat",
            },
            {
                "tag_path": "scanner.device.registration",
                "data_type": "entity",
                "description": "Device registration and identity",
            },
        ]
