"""Tests for the Scanner Gateway server handler."""

import pytest

from forge.adapters.scanner_gateway.device_registry import DeviceRegistry
from forge.adapters.scanner_gateway.server import (
    MockScannerServiceHandler,
)


@pytest.fixture()
def registry() -> DeviceRegistry:
    reg = DeviceRegistry()
    reg.register(device_id="dev-001", device_model="TC52")
    return reg


@pytest.fixture()
def handler(registry: DeviceRegistry) -> MockScannerServiceHandler:
    return MockScannerServiceHandler(registry, max_batch_size=10)


# ── Lifecycle ───────────────────────────────────────────────────


class TestHandlerLifecycle:
    """Verify handler start/stop behavior."""

    @pytest.mark.asyncio()
    async def test_rejects_before_start(self, handler):
        resp = await handler.submit_scan_batch(
            device_id="dev-001",
            scans=[{"scan_id": "s1", "barcode_value": "BC001"}],
        )
        assert resp.rejected == 1
        assert "not running" in resp.errors[0].lower()

    @pytest.mark.asyncio()
    async def test_accepts_after_start(self, handler):
        await handler.start()
        resp = await handler.submit_scan_batch(
            device_id="dev-001",
            scans=[{"scan_id": "s1", "barcode_value": "BC001"}],
        )
        assert resp.accepted == 1
        assert resp.rejected == 0

    @pytest.mark.asyncio()
    async def test_stats_after_start(self, handler):
        await handler.start()
        assert handler.stats["total_batches"] == 0
        assert handler.stats["total_accepted"] == 0

    @pytest.mark.asyncio()
    async def test_stop_logs_stats(self, handler):
        await handler.start()
        await handler.stop()
        # No error on stop


# ── SubmitScanBatch ─────────────────────────────────────────────


class TestSubmitScanBatch:
    """Verify scan batch submission and validation."""

    @pytest.mark.asyncio()
    async def test_valid_batch(self, handler):
        await handler.start()
        resp = await handler.submit_scan_batch(
            device_id="dev-001",
            scans=[
                {"scan_id": "s1", "barcode_value": "BC001"},
                {"scan_id": "s2", "barcode_value": "BC002"},
            ],
            batch_id="batch-001",
        )
        assert resp.accepted == 2
        assert resp.rejected == 0
        assert handler.stats["total_batches"] == 1

    @pytest.mark.asyncio()
    async def test_unregistered_device_rejected(self, handler):
        await handler.start()
        resp = await handler.submit_scan_batch(
            device_id="dev-unknown",
            scans=[{"scan_id": "s1", "barcode_value": "BC001"}],
        )
        assert resp.rejected == 1
        assert "not registered" in resp.errors[0].lower()

    @pytest.mark.asyncio()
    async def test_batch_size_exceeded(self, handler):
        """Batch larger than max_batch_size is fully rejected."""
        await handler.start()
        scans = [
            {"scan_id": f"s{i}", "barcode_value": f"BC{i}"}
            for i in range(15)
        ]
        resp = await handler.submit_scan_batch(
            device_id="dev-001", scans=scans,
        )
        assert resp.rejected == 15
        assert "exceeds max" in resp.errors[0].lower()

    @pytest.mark.asyncio()
    async def test_missing_scan_id_rejected(self, handler):
        await handler.start()
        resp = await handler.submit_scan_batch(
            device_id="dev-001",
            scans=[{"barcode_value": "BC001"}],
        )
        assert resp.rejected == 1
        assert "scan_id" in resp.errors[0].lower()

    @pytest.mark.asyncio()
    async def test_missing_barcode_rejected(self, handler):
        await handler.start()
        resp = await handler.submit_scan_batch(
            device_id="dev-001",
            scans=[{"scan_id": "s1"}],
        )
        assert resp.rejected == 1
        assert "barcode_value" in resp.errors[0].lower()

    @pytest.mark.asyncio()
    async def test_partial_batch_mixed_valid_invalid(self, handler):
        await handler.start()
        resp = await handler.submit_scan_batch(
            device_id="dev-001",
            scans=[
                {"scan_id": "s1", "barcode_value": "BC001"},  # valid
                {"scan_id": "s2"},  # missing barcode
                {"barcode_value": "BC003"},  # missing scan_id
            ],
        )
        assert resp.accepted == 1
        assert resp.rejected == 2

    @pytest.mark.asyncio()
    async def test_events_queued(self, handler):
        """Accepted scan events appear in the queue."""
        await handler.start()
        await handler.submit_scan_batch(
            device_id="dev-001",
            scans=[{"scan_id": "s1", "barcode_value": "BC001"}],
        )
        assert handler.queue.qsize() == 1
        event = handler.queue.get_nowait()
        assert event["scan_id"] == "s1"
        assert event["device_id"] == "dev-001"

    @pytest.mark.asyncio()
    async def test_server_metadata_stamped(self, handler):
        """Queued events have server metadata added."""
        await handler.start()
        await handler.submit_scan_batch(
            device_id="dev-001",
            scans=[{"scan_id": "s1", "barcode_value": "BC001"}],
            batch_id="batch-42",
        )
        event = handler.queue.get_nowait()
        assert event["_batch_id"] == "batch-42"
        assert "_server_received_at" in event

    @pytest.mark.asyncio()
    async def test_queue_full_backpressure(self, handler):
        """When the queue is full, remaining events are rejected."""
        # Create handler with tiny queue
        small_handler = MockScannerServiceHandler(
            handler._registry, max_queue_size=2, max_batch_size=10,
        )
        await small_handler.start()

        resp = await small_handler.submit_scan_batch(
            device_id="dev-001",
            scans=[
                {"scan_id": f"s{i}", "barcode_value": f"BC{i}"}
                for i in range(5)
            ],
        )
        # 2 accepted (queue fills), 3rd triggers QueueFull → break
        # The break stops processing, so remaining scans are rejected
        assert resp.accepted == 2
        assert resp.rejected >= 1  # at least the one that triggered break
        assert "backpressure" in resp.errors[-1].lower()


# ── Heartbeat ───────────────────────────────────────────────────


class TestHeartbeat:
    """Verify device heartbeat handling."""

    @pytest.mark.asyncio()
    async def test_heartbeat_registered_device(self, handler):
        resp = await handler.heartbeat(device_id="dev-001")
        assert resp.acknowledged is True

    @pytest.mark.asyncio()
    async def test_heartbeat_unknown_device(self, handler):
        resp = await handler.heartbeat(device_id="dev-unknown")
        assert resp.acknowledged is False

    @pytest.mark.asyncio()
    async def test_heartbeat_with_telemetry(self, handler, registry):
        await handler.heartbeat(
            device_id="dev-001",
            battery_pct=75,
            signal_strength=-50,
        )
        device = registry.get("dev-001")
        assert device.metadata["battery_pct"] == 75


# ── RegisterDevice ──────────────────────────────────────────────


class TestRegisterDevice:
    """Verify device registration via the handler."""

    @pytest.mark.asyncio()
    async def test_register_new_device(self, handler, registry):
        resp = await handler.register_device(
            device_id="dev-new",
            device_model="TC77",
            app_version="2.0",
        )
        assert resp.success is True
        assert registry.is_registered("dev-new")

    @pytest.mark.asyncio()
    async def test_register_empty_id_rejected(self, handler):
        resp = await handler.register_device(device_id="")
        assert resp.success is False

    @pytest.mark.asyncio()
    async def test_register_returns_device_id(self, handler):
        resp = await handler.register_device(device_id="dev-new")
        assert resp.device_id == "dev-new"


# ── inject_scans (test helper) ─────────────────────────────────


class TestInjectScans:
    """Verify the test helper for direct queue injection."""

    def test_inject_scans_queues_events(self, handler):
        count = handler.inject_scans([
            {"scan_id": "s1", "barcode_value": "BC001"},
            {"scan_id": "s2", "barcode_value": "BC002"},
        ])
        assert count == 2
        assert handler.queue.qsize() == 2

    def test_inject_scans_respects_queue_limit(self):
        reg = DeviceRegistry()
        small_handler = MockScannerServiceHandler(
            reg, max_queue_size=1,
        )
        count = small_handler.inject_scans([
            {"scan_id": "s1", "barcode_value": "BC001"},
            {"scan_id": "s2", "barcode_value": "BC002"},
        ])
        assert count == 1
