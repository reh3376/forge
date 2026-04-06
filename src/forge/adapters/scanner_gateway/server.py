"""ScannerService server handler — Android-facing gRPC service.

This module defines the server-side handler for the scanner.v1
ScannerService contract. Android devices connect to this server
and submit scan batches, heartbeats, and device registrations.

Architecture:
    Android Device ──gRPC──► ScannerServiceHandler ──queue──► Adapter.collect()

The handler validates incoming requests, manages device identity
through the DeviceRegistry, and queues scan events into an
asyncio.Queue that the adapter's collect() method drains.

Two implementations:
  - GrpcScannerServiceHandler: Production handler using grpc.aio.
    Requires scanner.v1 compiled stubs on sys.path.
  - MockScannerServiceHandler: Test handler for injecting scan events
    without a real gRPC server. All tests use this.
"""

from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any

from forge.adapters.scanner_gateway.device_registry import DeviceRegistry  # noqa: TC001

logger = logging.getLogger(__name__)


# ── Response types ──────────────────────────────────────────────


class ScanBatchResponse:
    """Response returned after processing a SubmitScanBatch RPC."""

    __slots__ = ("accepted", "errors", "rejected")

    def __init__(
        self,
        accepted: int = 0,
        rejected: int = 0,
        errors: list[str] | None = None,
    ) -> None:
        self.accepted = accepted
        self.rejected = rejected
        self.errors = errors or []

    def to_dict(self) -> dict[str, Any]:
        return {
            "accepted": self.accepted,
            "rejected": self.rejected,
            "errors": self.errors,
        }


class HeartbeatResponse:
    """Response returned after processing a Heartbeat RPC."""

    __slots__ = ("acknowledged", "server_time")

    def __init__(self, acknowledged: bool = True) -> None:
        self.acknowledged = acknowledged
        self.server_time = datetime.now(tz=UTC).isoformat()


class RegisterDeviceResponse:
    """Response returned after processing a RegisterDevice RPC."""

    __slots__ = ("device_id", "message", "success")

    def __init__(
        self,
        success: bool = True,
        message: str = "",
        device_id: str = "",
    ) -> None:
        self.success = success
        self.message = message
        self.device_id = device_id


# ── Handler protocol ───────────────────────────────────────────


class ScannerServiceHandler(ABC):
    """Abstract interface for the Android-facing ScannerService.

    Each method corresponds to one RPC in the scanner.v1 proto:
      - SubmitScanBatch: Android sends a batch of scan events
      - Heartbeat: Device health ping
      - RegisterDevice: Device identity registration

    Implementations queue accepted scan events into the adapter's
    collection pipeline via an asyncio.Queue.
    """

    @abstractmethod
    async def submit_scan_batch(
        self,
        *,
        device_id: str,
        scans: list[dict[str, Any]],
        batch_id: str | None = None,
    ) -> ScanBatchResponse:
        """Process a batch of scan events from an Android device.

        Validates the device is registered, validates each scan event,
        and queues accepted events for the adapter's collect() pipeline.

        Args:
            device_id: The sending device's ID.
            scans: List of scan event dicts (scanner.v1.ScanEvent).
            batch_id: Optional client-assigned batch identifier.

        Returns:
            ScanBatchResponse with accepted/rejected counts.
        """

    @abstractmethod
    async def heartbeat(
        self,
        *,
        device_id: str,
        battery_pct: int | None = None,
        signal_strength: int | None = None,
        operator_id: str | None = None,
    ) -> HeartbeatResponse:
        """Process a device heartbeat.

        Args:
            device_id: The sending device's ID.
            battery_pct: Optional battery level (0-100).
            signal_strength: Optional WiFi/cellular signal (-100 to 0 dBm).
            operator_id: Current operator logged into the device.

        Returns:
            HeartbeatResponse acknowledging receipt.
        """

    @abstractmethod
    async def register_device(
        self,
        *,
        device_id: str,
        device_model: str = "",
        os_version: str = "",
        app_version: str = "",
        site_id: str | None = None,
    ) -> RegisterDeviceResponse:
        """Register a device with the gateway.

        Args:
            device_id: Unique device identifier (CUIDv2).
            device_model: Hardware model string.
            os_version: Android OS version.
            app_version: Scanner app version.
            site_id: Which site/warehouse this device belongs to.

        Returns:
            RegisterDeviceResponse confirming registration.
        """

    @abstractmethod
    async def start(self) -> None:
        """Start accepting RPCs."""

    @abstractmethod
    async def stop(self) -> None:
        """Stop accepting RPCs and drain the queue."""


# ── Mock implementation ─────────────────────────────────────────


class MockScannerServiceHandler(ScannerServiceHandler):
    """In-memory handler for testing and conformance validation.

    Scan events are queued in an asyncio.Queue that the adapter's
    collect() method drains. The queue has a bounded size to prevent
    memory exhaustion if the adapter falls behind.
    """

    def __init__(
        self,
        registry: DeviceRegistry,
        *,
        max_queue_size: int = 10_000,
        max_batch_size: int = 500,
    ) -> None:
        self._registry = registry
        self._queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(
            maxsize=max_queue_size,
        )
        self._max_batch_size = max_batch_size
        self._running = False
        self._total_accepted = 0
        self._total_rejected = 0
        self._total_batches = 0

    @property
    def queue(self) -> asyncio.Queue[dict[str, Any]]:
        """The scan event queue — adapter.collect() reads from this."""
        return self._queue

    @property
    def stats(self) -> dict[str, int]:
        """Handler statistics for diagnostics."""
        return {
            "total_batches": self._total_batches,
            "total_accepted": self._total_accepted,
            "total_rejected": self._total_rejected,
            "queue_size": self._queue.qsize(),
        }

    async def submit_scan_batch(
        self,
        *,
        device_id: str,
        scans: list[dict[str, Any]],
        batch_id: str | None = None,
    ) -> ScanBatchResponse:
        """Validate and queue scan events from a device."""
        if not self._running:
            return ScanBatchResponse(
                rejected=len(scans),
                errors=["Server not running"],
            )

        # Validate device is registered
        if not self._registry.is_registered(device_id):
            return ScanBatchResponse(
                rejected=len(scans),
                errors=[f"Device not registered: {device_id}"],
            )

        # Enforce batch size limit
        if len(scans) > self._max_batch_size:
            return ScanBatchResponse(
                rejected=len(scans),
                errors=[
                    f"Batch size {len(scans)} exceeds max {self._max_batch_size}",
                ],
            )

        self._total_batches += 1
        accepted = 0
        rejected = 0
        errors: list[str] = []
        now = datetime.now(tz=UTC)

        for scan in scans:
            # Validate required fields
            if not scan.get("scan_id"):
                rejected += 1
                errors.append("Missing scan_id")
                continue
            if not scan.get("barcode_value"):
                rejected += 1
                errors.append(
                    f"Missing barcode_value in scan {scan.get('scan_id', '?')}",
                )
                continue

            # Stamp server metadata
            enriched = dict(scan)
            enriched["device_id"] = device_id
            enriched["_batch_id"] = batch_id
            enriched["_server_received_at"] = now.isoformat()

            try:
                self._queue.put_nowait(enriched)
                accepted += 1
            except asyncio.QueueFull:
                rejected += 1
                errors.append("Queue full — backpressure")
                break  # Stop processing this batch

        self._total_accepted += accepted
        self._total_rejected += rejected

        logger.debug(
            "Batch from %s: accepted=%d rejected=%d (batch_id=%s)",
            device_id, accepted, rejected, batch_id,
        )
        return ScanBatchResponse(
            accepted=accepted, rejected=rejected, errors=errors,
        )

    async def heartbeat(
        self,
        *,
        device_id: str,
        battery_pct: int | None = None,
        signal_strength: int | None = None,
        operator_id: str | None = None,
    ) -> HeartbeatResponse:
        """Record a device heartbeat."""
        record = self._registry.record_heartbeat(
            device_id,
            battery_pct=battery_pct,
            signal_strength=signal_strength,
            operator_id=operator_id,
        )
        if record is None:
            return HeartbeatResponse(acknowledged=False)
        return HeartbeatResponse(acknowledged=True)

    async def register_device(
        self,
        *,
        device_id: str,
        device_model: str = "",
        os_version: str = "",
        app_version: str = "",
        site_id: str | None = None,
    ) -> RegisterDeviceResponse:
        """Register a device with the gateway."""
        if not device_id:
            return RegisterDeviceResponse(
                success=False,
                message="device_id is required",
            )

        self._registry.register(
            device_id=device_id,
            device_model=device_model,
            os_version=os_version,
            app_version=app_version,
            site_id=site_id,
        )
        return RegisterDeviceResponse(
            success=True,
            message="Device registered",
            device_id=device_id,
        )

    async def start(self) -> None:
        """Mark the handler as accepting RPCs."""
        self._running = True
        logger.info("MockScannerServiceHandler started")

    async def stop(self) -> None:
        """Stop accepting RPCs."""
        self._running = False
        logger.info(
            "MockScannerServiceHandler stopped (stats=%s)",
            self.stats,
        )

    def inject_scans(self, scans: list[dict[str, Any]]) -> int:
        """Inject scan events directly into the queue (test helper).

        Bypasses device validation — used in tests where you want
        to test the adapter's collect() without going through the
        full submit_scan_batch flow.

        Returns the number of events injected.
        """
        count = 0
        for scan in scans:
            try:
                self._queue.put_nowait(scan)
                count += 1
            except asyncio.QueueFull:
                break
        return count
