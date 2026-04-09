"""Tests for the WHK NMS adapter lifecycle, collection, and capabilities."""

from __future__ import annotations

import pytest

from forge.adapters.whk_nms import WhkNmsAdapter
from forge.core.models.adapter import AdapterState

# ── Test Fixtures ──────────────────────────────────────────────

_VALID_CONFIG = {
    "nms_api_url": "http://localhost:8000/api/v1",
    "nms_ws_url": "ws://localhost:8000/api/v1/events/stream",
    "poll_interval_seconds": 60,
}

_SAMPLE_DEVICE_MESSAGE = {
    "entity_type": "network_device",
    "event_type": "device_discovery",
    "id": "dev-001",
    "ip_address": "10.0.0.1",
    "name": "core-router-01",
    "type": "router",
    "health_status": "healthy",
    "is_critical": True,
    "is_ot_device": False,
    "location": "data-center-1",
    "device_metadata": {
        "serial_number": "SN-123456",
        "vendor": "Cisco",
        "model": "ASR9000",
        "mac_address": "00:11:22:33:44:55",
    },
}

_SAMPLE_TRAP_MESSAGE = {
    "entity_type": "network_device",
    "event_type": "snmp_trap",
    "id": "trap-001",
    "device_id": "plc-001",
    "device_ip": "10.1.0.50",
    "trap_type": "linkDown",
    "oid": "1.3.6.1.6.3.1.1.5.3",
    "severity": "high",
    "trap_time": "2026-04-07T14:30:00Z",
}

_SAMPLE_ALERT_MESSAGE = {
    "entity_type": "network_device",
    "event_type": "infrastructure_alert",
    "id": "alert-001",
    "device_id": "switch-01",
    "device_ip": "10.0.0.2",
    "name": "HighCpuUsage",
    "description": "CPU usage exceeded 85%",
    "condition": "cpu > 85%",
    "severity": "high",
    "alert_time": "2026-04-07T14:35:00Z",
}

_SAMPLE_SECURITY_MESSAGE = {
    "entity_type": "security_event",
    "event_type": "security_event",
    "id": "sec-001",
    "device_id": "firewall-01",
    "source_ip": "192.168.1.100",
    "event_type": "ips_signature_match",
    "threat_type": "exploit_attempt",
    "action": "blocked",
    "severity": "critical",
    "timestamp": "2026-04-07T14:40:00Z",
}

_SAMPLE_BASELINE_MESSAGE = {
    "entity_type": "network_device",
    "event_type": "baseline_anomaly",
    "id": "dev-099",
    "ip_address": "10.2.0.99",
    "name": "suspicious-device",
    "type": "workstation",
    "baseline_status": "suspicious",
    "suspicious_reason": "Unusual outbound traffic pattern detected",
    "health_status": "healthy",
    "location": "warehouse-floor",
}

_SAMPLE_SPOF_MESSAGE = {
    "entity_type": "network_device",
    "event_type": "spof_detection",
    "id": "spof-001",
    "device_id": "core-switch-01",
    "ip_address": "10.0.0.3",
    "spof_type": "gateway_router",
    "blast_radius": 45,
    "affected_services": ["production_network", "scada_network", "office_network"],
    "detected_at": "2026-04-07T14:25:00Z",
}


# ── Manifest Tests ─────────────────────────────────────────────


class TestManifest:
    def test_adapter_id(self):
        adapter = WhkNmsAdapter()
        assert adapter.manifest.adapter_id == "whk-nms"

    def test_adapter_name(self):
        adapter = WhkNmsAdapter()
        assert "Network Management System" in adapter.manifest.name

    def test_tier(self):
        adapter = WhkNmsAdapter()
        assert adapter.manifest.tier.value == "MES_MOM"

    def test_protocol(self):
        adapter = WhkNmsAdapter()
        assert adapter.manifest.protocol == "rest+websocket"

    def test_capabilities(self):
        adapter = WhkNmsAdapter()
        caps = adapter.manifest.capabilities
        assert caps.read is True
        assert caps.write is False
        assert caps.subscribe is True
        assert caps.backfill is True
        assert caps.discover is True

    def test_data_contract_schema_ref(self):
        adapter = WhkNmsAdapter()
        assert adapter.manifest.data_contract.schema_ref == "forge://schemas/whk-nms/v0.1.0"

    def test_data_contract_context_fields(self):
        adapter = WhkNmsAdapter()
        fields = adapter.manifest.data_contract.context_fields
        assert "cross_system_id" in fields
        assert "source_system" in fields
        assert "entity_type" in fields
        assert "event_type" in fields
        assert "device_ip" in fields
        assert "device_category" in fields
        assert "severity" in fields
        assert "blast_radius" in fields

    def test_connection_params_count(self):
        adapter = WhkNmsAdapter()
        assert len(adapter.manifest.connection_params) == 5

    def test_required_connection_params(self):
        adapter = WhkNmsAdapter()
        required = [p.name for p in adapter.manifest.connection_params if p.required]
        assert "nms_api_url" in required


# ── Lifecycle Tests ────────────────────────────────────────────


class TestLifecycle:
    @pytest.mark.asyncio
    async def test_configure(self):
        adapter = WhkNmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        assert adapter._state == AdapterState.REGISTERED
        assert adapter._config is not None

    @pytest.mark.asyncio
    async def test_configure_missing_required_param(self):
        adapter = WhkNmsAdapter()
        with pytest.raises(Exception):  # Pydantic validation error
            await adapter.configure({"nms_ws_url": "ws://..."})

    @pytest.mark.asyncio
    async def test_start_without_configure(self):
        adapter = WhkNmsAdapter()
        with pytest.raises(RuntimeError, match="not configured"):
            await adapter.start()

    @pytest.mark.asyncio
    async def test_start_after_configure(self):
        adapter = WhkNmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        assert adapter._state == AdapterState.HEALTHY

    @pytest.mark.asyncio
    async def test_stop(self):
        adapter = WhkNmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        await adapter.stop()
        assert adapter._state == AdapterState.STOPPED

    @pytest.mark.asyncio
    async def test_health_check(self):
        adapter = WhkNmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        health = await adapter.health()
        assert health.adapter_id == "whk-nms"
        assert health.state == AdapterState.HEALTHY
        assert health.uptime_seconds >= 0


# ── Collection Tests ───────────────────────────────────────────


class TestCollect:
    @pytest.mark.asyncio
    async def test_collect_device(self):
        adapter = WhkNmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_DEVICE_MESSAGE])

        records = []
        async for record in adapter.collect():
            records.append(record)

        assert len(records) == 1
        record = records[0]
        assert record.source.adapter_id == "whk-nms"
        assert record.source.system == "whk-nms"
        assert "network_device" in record.source.tag_path
        assert record.context.extra["entity_type"] == "network_device"
        assert record.context.extra["device_ip"] == "10.0.0.1"

    @pytest.mark.asyncio
    async def test_collect_trap_event(self):
        adapter = WhkNmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_TRAP_MESSAGE])

        records = []
        async for record in adapter.collect():
            records.append(record)

        assert len(records) == 1
        record = records[0]
        assert record.context.extra["event_type"] == "snmp_trap"
        # device_ip field should be in extra if present in raw message
        assert record.source.tag_path.endswith("snmp_trap") or "snmp_trap" in record.source.tag_path

    @pytest.mark.asyncio
    async def test_collect_multiple_records(self):
        adapter = WhkNmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([
            _SAMPLE_DEVICE_MESSAGE,
            _SAMPLE_TRAP_MESSAGE,
            _SAMPLE_ALERT_MESSAGE,
        ])

        records = []
        async for record in adapter.collect():
            records.append(record)

        assert len(records) == 3

    @pytest.mark.asyncio
    async def test_collect_records_cleared_on_stop(self):
        adapter = WhkNmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_DEVICE_MESSAGE])
        await adapter.stop()

        # After stop, pending records should be cleared
        records = []
        async for _ in adapter.collect():
            records.append(_)

        assert len(records) == 0


# ── Discovery Tests ────────────────────────────────────────────


class TestDiscover:
    @pytest.mark.asyncio
    async def test_discover_returns_endpoints(self):
        adapter = WhkNmsAdapter()
        discovery = await adapter.discover()

        assert "adapter_id" in discovery
        assert discovery["adapter_id"] == "whk-nms"
        assert "rest_endpoints" in discovery
        assert "websocket_endpoints" in discovery
        assert discovery["total_rest_endpoints"] == 13
        assert discovery["total_websocket_endpoints"] == 1

    @pytest.mark.asyncio
    async def test_discover_rest_endpoints_structure(self):
        adapter = WhkNmsAdapter()
        discovery = await adapter.discover()

        endpoints = discovery["rest_endpoints"]
        assert len(endpoints) > 0

        # Check first endpoint structure
        endpoint = endpoints[0]
        assert "entity_name" in endpoint
        assert "path" in endpoint
        assert "method" in endpoint
        assert "forge_entity_type" in endpoint
        assert "collection_mode" in endpoint


# ── Subscription Tests ─────────────────────────────────────────


class TestSubscription:
    @pytest.mark.asyncio
    async def test_subscribe_to_topic(self):
        adapter = WhkNmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()

        await adapter.subscribe("events/stream")
        assert "events/stream" in adapter._subscriptions

    @pytest.mark.asyncio
    async def test_unsubscribe_from_topic(self):
        adapter = WhkNmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()

        await adapter.subscribe("events/stream")
        await adapter.unsubscribe("events/stream")
        assert "events/stream" not in adapter._subscriptions


# ── Record Counting Tests ──────────────────────────────────────


class TestRecordCounting:
    @pytest.mark.asyncio
    async def test_records_collected_incremented(self):
        adapter = WhkNmsAdapter()
        await adapter.configure(_VALID_CONFIG)
        await adapter.start()
        adapter.inject_records([_SAMPLE_DEVICE_MESSAGE, _SAMPLE_TRAP_MESSAGE])

        initial_count = adapter._records_collected
        async for _ in adapter.collect():
            pass

        assert adapter._records_collected == initial_count + 2
