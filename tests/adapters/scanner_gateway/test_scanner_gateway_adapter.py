"""Tests for the Scanner Gateway adapter lifecycle, manifest, and data flow."""

import pytest

from forge.adapters.scanner_gateway.adapter import ScannerGatewayAdapter
from forge.adapters.scanner_gateway.device_registry import DeviceRegistry
from forge.adapters.scanner_gateway.server import MockScannerServiceHandler
from forge.core.models.adapter import AdapterState, AdapterTier

# ── Manifest Tests ─────────────────────────────────────────────────


class TestManifest:
    """Verify manifest loads correctly from manifest.json."""

    def test_adapter_id(self):
        assert ScannerGatewayAdapter.manifest.adapter_id == "scanner-gateway"

    def test_version(self):
        assert ScannerGatewayAdapter.manifest.version == "0.1.0"

    def test_type_is_ingestion(self):
        assert ScannerGatewayAdapter.manifest.type == "INGESTION"

    def test_protocol_is_grpc(self):
        assert ScannerGatewayAdapter.manifest.protocol == "grpc+protobuf"

    def test_tier_is_ot(self):
        assert ScannerGatewayAdapter.manifest.tier == AdapterTier.OT

    def test_capabilities(self):
        caps = ScannerGatewayAdapter.manifest.capabilities
        assert caps.read is True
        assert caps.write is False
        assert caps.subscribe is True
        assert caps.backfill is False
        assert caps.discover is True

    def test_connection_params_count(self):
        assert len(ScannerGatewayAdapter.manifest.connection_params) == 7

    def test_required_params(self):
        required = [
            p.name
            for p in ScannerGatewayAdapter.manifest.connection_params
            if p.required
        ]
        assert sorted(required) == [
            "device_token_secret",
            "gateway_listen_port",
            "wms_adapter_id",
        ]

    def test_auth_methods(self):
        assert "device_token" in ScannerGatewayAdapter.manifest.auth_methods
        assert "mtls" in ScannerGatewayAdapter.manifest.auth_methods

    def test_data_contract_schema_ref(self):
        assert (
            ScannerGatewayAdapter.manifest.data_contract.schema_ref
            == "forge://schemas/scanner-gateway/v0.1.0"
        )

    def test_data_contract_context_fields(self):
        fields = ScannerGatewayAdapter.manifest.data_contract.context_fields
        assert "scan_id" in fields
        assert "scan_type" in fields
        assert "barcode_value" in fields
        assert "device_id" in fields

    def test_metadata_proto_package(self):
        assert (
            ScannerGatewayAdapter.manifest.metadata["proto_package"]
            == "scanner.v1"
        )

    def test_metadata_scan_types(self):
        assert ScannerGatewayAdapter.manifest.metadata["scan_types"] == 12


# ── Lifecycle Tests ────────────────────────────────────────────────


_VALID_CONFIG = {
    "gateway_listen_host": "0.0.0.0",
    "gateway_listen_port": 50060,
    "wms_adapter_id": "whk-wms",
    "ims_adapter_id": "bosc-ims",
    "device_token_secret": "test-secret-key-for-device-auth",
}


class TestLifecycle:
    """Verify adapter lifecycle state transitions."""

    @pytest.fixture()
    def adapter(self):
        return ScannerGatewayAdapter()

    @pytest.mark.asyncio()
    async def test_initial_state_is_registered(self, adapter):
        assert adapter._state == AdapterState.REGISTERED

    @pytest.mark.asyncio()
    async def test_configure_sets_state(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        assert adapter._state == AdapterState.REGISTERED

    @pytest.mark.asyncio()
    async def test_configure_stores_config(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        assert adapter._config is not None
        assert adapter._config.listen_address == "0.0.0.0:50060"

    @pytest.mark.asyncio()
    async def test_configure_creates_router(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        assert adapter._router is not None
        ids = adapter._router.target_adapter_ids()
        assert "whk-wms" in ids
        assert "bosc-ims" in ids

    @pytest.mark.asyncio()
    async def test_start_sets_healthy(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        assert adapter._state == AdapterState.HEALTHY

    @pytest.mark.asyncio()
    async def test_start_without_configure_raises(self, adapter):
        with pytest.raises(RuntimeError, match="not configured"):
            await adapter.start()

    @pytest.mark.asyncio()
    async def test_stop_sets_stopped(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        await adapter.stop()
        assert adapter._state == AdapterState.STOPPED

    @pytest.mark.asyncio()
    async def test_health_returns_adapter_health(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        health = await adapter.health()
        assert health.adapter_id == "scanner-gateway"
        assert health.state == AdapterState.HEALTHY

    @pytest.mark.asyncio()
    async def test_health_tracks_records(self, adapter):
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        health = await adapter.health()
        assert health.records_collected == 0
        assert health.records_failed == 0

    @pytest.mark.asyncio()
    async def test_configure_creates_handler(self, adapter):
        """configure() creates a MockScannerServiceHandler if none injected."""
        await adapter.configure(_VALID_CONFIG)
        assert adapter.handler is not None

    @pytest.mark.asyncio()
    async def test_configure_preserves_injected_handler(self, adapter):
        """If a handler was injected, configure() does not replace it."""
        registry = DeviceRegistry()
        custom_handler = MockScannerServiceHandler(registry)
        adapter.set_handler(custom_handler)
        await adapter.configure(_VALID_CONFIG)
        assert adapter.handler is custom_handler

    @pytest.mark.asyncio()
    async def test_registry_accessible(self, adapter):
        """The device registry is accessible via property."""
        assert adapter.registry is not None
        assert adapter.registry.device_count == 0

    @pytest.mark.asyncio()
    async def test_start_starts_handler(self, adapter):
        """start() delegates to handler.start()."""
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        # MockScannerServiceHandler._running is True after start
        assert adapter.handler._running is True

    @pytest.mark.asyncio()
    async def test_stop_stops_handler(self, adapter):
        """stop() delegates to handler.stop()."""
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        await adapter.stop()
        assert adapter.handler._running is False


# ── Collect Tests ──────────────────────────────────────────────────


class TestCollect:
    """Verify the collect() async generator yields ContextualRecords."""

    async def _make_adapter(self):
        adapter = ScannerGatewayAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        return adapter

    @pytest.mark.asyncio()
    async def test_collect_empty(self):
        adapter = await self._make_adapter()
        records = [r async for r in adapter.collect()]
        assert records == []

    @pytest.mark.asyncio()
    async def test_collect_yields_records(self):
        adapter = await self._make_adapter()
        adapter.inject_records([
            {
                "scan_id": "scan-001",
                "scan_type": "SCAN_TYPE_ENTRY",
                "barcode_value": "WHK-BBL-12345",
                "device_id": "DEV-001",
                "operator_id": "OP-001",
                "location_string": "Warehouse-A/Bay-3",
                "scanned_at": "2026-04-06T14:30:00+00:00",
            },
        ])
        records = [r async for r in adapter.collect()]
        assert len(records) == 1
        assert records[0].source.adapter_id == "scanner-gateway"
        assert records[0].source.system == "scanner-gateway"

    @pytest.mark.asyncio()
    async def test_collect_tag_path(self):
        adapter = await self._make_adapter()
        adapter.inject_records([
            {
                "scan_id": "scan-002",
                "scan_type": "SCAN_TYPE_DUMP",
                "barcode_value": "WHK-BBL-99999",
                "scanned_at": "2026-04-06T15:00:00+00:00",
            },
        ])
        records = [r async for r in adapter.collect()]
        assert records[0].source.tag_path == "scanner.scan.dump"

    @pytest.mark.asyncio()
    async def test_collect_routing_annotation(self):
        adapter = await self._make_adapter()
        adapter.inject_records([
            {
                "scan_id": "scan-003",
                "scan_type": "SCAN_TYPE_INSPECTION",
                "barcode_value": "WHK-BBL-55555",
                "scanned_at": "2026-04-06T16:00:00+00:00",
            },
        ])
        records = [r async for r in adapter.collect()]
        routed_to = records[0].context.extra["_routed_to"]
        assert "whk-wms" in routed_to
        assert "bosc-ims" in routed_to

    @pytest.mark.asyncio()
    async def test_collect_increments_counter(self):
        adapter = await self._make_adapter()
        adapter.inject_records([
            {
                "scan_id": "s1",
                "scan_type": "SCAN_TYPE_ENTRY",
                "barcode_value": "B1",
                "scanned_at": "2026-04-06T10:00:00+00:00",
            },
            {
                "scan_id": "s2",
                "scan_type": "SCAN_TYPE_DUMP",
                "barcode_value": "B2",
                "scanned_at": "2026-04-06T11:00:00+00:00",
            },
        ])
        _ = [r async for r in adapter.collect()]
        health = await adapter.health()
        assert health.records_collected == 2

    @pytest.mark.asyncio()
    async def test_collect_record_lineage(self):
        adapter = await self._make_adapter()
        adapter.inject_records([
            {
                "scan_id": "scan-lin",
                "scan_type": "SCAN_TYPE_RELOCATION",
                "barcode_value": "BBL-LIN",
                "scanned_at": "2026-04-06T12:00:00+00:00",
            },
        ])
        records = [r async for r in adapter.collect()]
        lineage = records[0].lineage
        assert lineage.adapter_id == "scanner-gateway"
        assert lineage.adapter_version == "0.1.0"
        assert (
            lineage.schema_ref
            == "forge://schemas/scanner-gateway/v0.1.0"
        )
        assert "scanner.v1.ScanEvent" in lineage.transformation_chain


# ── Subscription Tests ─────────────────────────────────────────────


class TestSubscription:
    """Verify subscription management."""

    @pytest.mark.asyncio()
    async def test_subscribe_returns_id(self):
        adapter = ScannerGatewayAdapter()
        sub_id = await adapter.subscribe(
            tags=["scanner.scan.entry"],
            callback=lambda msg: None,
        )
        assert isinstance(sub_id, str)
        assert len(sub_id) > 0

    @pytest.mark.asyncio()
    async def test_unsubscribe_removes(self):
        adapter = ScannerGatewayAdapter()
        sub_id = await adapter.subscribe(
            tags=["scanner.scan.dump"],
            callback=lambda m: None,
        )
        assert sub_id in adapter._subscriptions
        await adapter.unsubscribe(sub_id)
        assert sub_id not in adapter._subscriptions


# ── Discovery Tests ────────────────────────────────────────────────


class TestDiscovery:
    """Verify data source discovery."""

    @pytest.mark.asyncio()
    async def test_discover_returns_sources(self):
        adapter = ScannerGatewayAdapter()
        sources = await adapter.discover()
        assert len(sources) == 14

    @pytest.mark.asyncio()
    async def test_discover_sources_have_tag_path(self):
        adapter = ScannerGatewayAdapter()
        sources = await adapter.discover()
        for source in sources:
            assert "tag_path" in source
            assert "data_type" in source

    @pytest.mark.asyncio()
    async def test_discover_includes_barrel_scans(self):
        adapter = ScannerGatewayAdapter()
        sources = await adapter.discover()
        tags = [s["tag_path"] for s in sources]
        assert "scanner.scan.entry" in tags
        assert "scanner.scan.dump" in tags
        assert "scanner.scan.withdrawal" in tags

    @pytest.mark.asyncio()
    async def test_discover_includes_device_events(self):
        adapter = ScannerGatewayAdapter()
        sources = await adapter.discover()
        tags = [s["tag_path"] for s in sources]
        assert "scanner.device.heartbeat" in tags
        assert "scanner.device.registration" in tags


# ── Queue-Based Collection Tests (Phase 2) ────────────────────────


class TestQueueCollection:
    """Verify collect() drains the server handler queue."""

    async def _make_adapter(self):
        adapter = ScannerGatewayAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        return adapter

    @pytest.mark.asyncio()
    async def test_collect_from_queue(self):
        """collect() yields records from the handler queue."""
        adapter = await self._make_adapter()
        handler = adapter.handler
        handler.inject_scans([
            {
                "scan_id": "q-001",
                "scan_type": "SCAN_TYPE_ENTRY",
                "barcode_value": "BBL-Q-001",
                "scanned_at": "2026-04-06T14:00:00+00:00",
            },
        ])
        records = [r async for r in adapter.collect()]
        assert len(records) == 1
        assert records[0].source.tag_path == "scanner.scan.entry"

    @pytest.mark.asyncio()
    async def test_collect_queue_drains_all(self):
        """collect() drains all queued events in one call."""
        adapter = await self._make_adapter()
        handler = adapter.handler
        handler.inject_scans([
            {
                "scan_id": f"q-{i}",
                "scan_type": "SCAN_TYPE_DUMP",
                "barcode_value": f"BBL-{i}",
                "scanned_at": "2026-04-06T15:00:00+00:00",
            }
            for i in range(5)
        ])
        records = [r async for r in adapter.collect()]
        assert len(records) == 5

    @pytest.mark.asyncio()
    async def test_collect_queue_routing(self):
        """Queue-collected events get routing annotations."""
        adapter = await self._make_adapter()
        handler = adapter.handler
        handler.inject_scans([
            {
                "scan_id": "q-route",
                "scan_type": "SCAN_TYPE_INSPECTION",
                "barcode_value": "BBL-R",
                "scanned_at": "2026-04-06T16:00:00+00:00",
            },
        ])
        records = [r async for r in adapter.collect()]
        routed = records[0].context.extra["_routed_to"]
        assert "whk-wms" in routed
        assert "bosc-ims" in routed

    @pytest.mark.asyncio()
    async def test_collect_queue_takes_priority_over_injected(self):
        """When queue has events, injected records are skipped."""
        adapter = await self._make_adapter()
        adapter.inject_records([
            {
                "scan_id": "inj-1",
                "scan_type": "SCAN_TYPE_ENTRY",
                "barcode_value": "INJ-1",
                "scanned_at": "2026-04-06T10:00:00+00:00",
            },
        ])
        handler = adapter.handler
        handler.inject_scans([
            {
                "scan_id": "queue-1",
                "scan_type": "SCAN_TYPE_DUMP",
                "barcode_value": "QUE-1",
                "scanned_at": "2026-04-06T11:00:00+00:00",
            },
        ])
        records = [r async for r in adapter.collect()]
        # Only queue events, not injected
        assert len(records) == 1
        assert "QUE-1" in records[0].value.raw

    @pytest.mark.asyncio()
    async def test_collect_falls_back_to_injected(self):
        """When queue is empty, falls back to injected records."""
        adapter = await self._make_adapter()
        adapter.inject_records([
            {
                "scan_id": "fb-1",
                "scan_type": "SCAN_TYPE_RELOCATION",
                "barcode_value": "FB-1",
                "scanned_at": "2026-04-06T12:00:00+00:00",
            },
        ])
        records = [r async for r in adapter.collect()]
        assert len(records) == 1
        assert "FB-1" in records[0].value.raw


# ── End-to-End: Device → Handler → Adapter ────────────────────────


class TestEndToEnd:
    """Verify the full flow: device registers → submits batch → adapter collects."""

    @pytest.mark.asyncio()
    async def test_full_flow(self):
        """Device registration, batch submission, and adapter collection."""
        adapter = ScannerGatewayAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()

        handler = adapter.handler

        # 1. Register a device
        reg_resp = await handler.register_device(
            device_id="flow-dev-001",
            device_model="TC52",
            app_version="1.5.0",
            site_id="warehouse-A",
        )
        assert reg_resp.success is True
        assert adapter.registry.is_registered("flow-dev-001")

        # 2. Device sends heartbeat
        hb_resp = await handler.heartbeat(
            device_id="flow-dev-001",
            battery_pct=90,
        )
        assert hb_resp.acknowledged is True

        # 3. Device submits scan batch
        batch_resp = await handler.submit_scan_batch(
            device_id="flow-dev-001",
            scans=[
                {
                    "scan_id": "flow-s1",
                    "scan_type": "SCAN_TYPE_ENTRY",
                    "barcode_value": "WHK-BBL-12345",
                    "scanned_at": "2026-04-06T14:30:00+00:00",
                    "operator_id": "OP-01",
                    "location_string": "Warehouse-A/Bay-3",
                },
                {
                    "scan_id": "flow-s2",
                    "scan_type": "SCAN_TYPE_ASSET_RECEIVE",
                    "barcode_value": "BOSC-AST-67890",
                    "scanned_at": "2026-04-06T14:31:00+00:00",
                    "operator_id": "OP-01",
                },
            ],
            batch_id="flow-batch-001",
        )
        assert batch_resp.accepted == 2
        assert batch_resp.rejected == 0

        # 4. Adapter collects and translates
        records = [r async for r in adapter.collect()]
        assert len(records) == 2

        # Verify first record (barrel entry → WMS)
        entry_record = records[0]
        assert entry_record.source.tag_path == "scanner.scan.entry"
        assert "whk-wms" in entry_record.context.extra["_routed_to"]

        # Verify second record (asset receive → IMS)
        asset_record = records[1]
        assert asset_record.source.tag_path == "scanner.scan.asset_receive"
        assert "bosc-ims" in asset_record.context.extra["_routed_to"]

    @pytest.mark.asyncio()
    async def test_rejected_device_no_records(self):
        """Scans from unregistered devices don't produce records."""
        adapter = ScannerGatewayAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()

        handler = adapter.handler
        resp = await handler.submit_scan_batch(
            device_id="unregistered-dev",
            scans=[{"scan_id": "s1", "barcode_value": "BC"}],
        )
        assert resp.rejected == 1

        records = [r async for r in adapter.collect()]
        assert len(records) == 0

    @pytest.mark.asyncio()
    async def test_health_degrades_with_offline_devices(self):
        """Health degrades when all registered devices go offline."""
        adapter = ScannerGatewayAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()

        # Register a device but don't send heartbeats
        adapter.registry.register(device_id="silent-dev")

        # After enough health checks with 0 online, state degrades
        for _ in range(3):
            await adapter.health()

        health = await adapter.health()
        assert health.state in (AdapterState.DEGRADED, AdapterState.FAILED)

    @pytest.mark.asyncio()
    async def test_health_recovers_with_heartbeat(self):
        """Health recovers when devices come back online."""
        adapter = ScannerGatewayAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()

        adapter.registry.register(device_id="blink-dev")

        # Degrade
        for _ in range(4):
            await adapter.health()

        # Heartbeat brings it back
        adapter.registry.record_heartbeat("blink-dev")
        health = await adapter.health()
        assert health.state == AdapterState.HEALTHY
