"""Tests for TagPublisher — tag, health, equipment, and alarm publishing."""

import pytest

from forge.modules.ot.mqtt.publisher import MqttConfig, OTMqttPublisher
from forge.modules.ot.mqtt.topic_router import TopicRouter
from forge.modules.ot.mqtt.tag_publisher import (
    TagPublisher,
    build_tag_payload,
    build_health_payload,
    build_equipment_payload,
    build_alarm_payload,
)


# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------


class TestPayloadBuilders:

    def test_tag_payload_minimal(self):
        p = build_tag_payload("TIT/Out_PV", 78.4, "GOOD", "2026-04-08T12:00:00Z")
        assert p["tag"] == "TIT/Out_PV"
        assert p["v"] == 78.4
        assert p["q"] == "GOOD"
        assert p["ts"] == "2026-04-08T12:00:00Z"
        assert "eu" not in p  # Optional, not included

    def test_tag_payload_full(self):
        p = build_tag_payload(
            "TIT/Out_PV", 78.4, "GOOD", "2026-04-08T12:00:00Z",
            engineering_units="degF", equipment_id="EQ001", area="Distillery01",
        )
        assert p["eu"] == "degF"
        assert p["eid"] == "EQ001"
        assert p["area"] == "Distillery01"

    def test_health_payload(self):
        p = build_health_payload("PLC_001", True, latency_ms=12.3, scan_class="fast")
        assert p["plc"] == "PLC_001"
        assert p["connected"] is True
        assert p["latency_ms"] == 12.3
        assert "ts" in p

    def test_equipment_payload(self):
        p = build_equipment_payload("CIP_001", "cipState", "RUNNING", area="Distillery01")
        assert p["eid"] == "CIP_001"
        assert p["field"] == "cipState"
        assert p["v"] == "RUNNING"

    def test_alarm_payload(self):
        p = build_alarm_payload(
            "a1", "HIGH_TEMP", "ACTIVE", "CRITICAL",
            "TIT/Out_PV", 185.0, 180.0, "2026-04-08T12:00:00Z",
        )
        assert p["name"] == "HIGH_TEMP"
        assert p["priority"] == "CRITICAL"
        assert p["v"] == 185.0
        assert p["sp"] == 180.0


# ---------------------------------------------------------------------------
# TagPublisher integration
# ---------------------------------------------------------------------------


class TestTagPublisher:

    @pytest.fixture
    async def setup(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        await pub.start()
        router = TopicRouter(site="whk01")
        tag_pub = TagPublisher(pub, router)
        yield tag_pub, pub
        await pub.stop()

    @pytest.mark.asyncio
    async def test_publish_tag_change(self, setup):
        tag_pub, mqtt_pub = setup
        result = await tag_pub.publish_tag_change(
            tag_path="Distillery01/TIT_2010/Out_PV",
            value=78.4, quality="GOOD",
            timestamp="2026-04-08T12:00:00Z",
            area="Distillery01",
        )
        assert result is True
        assert tag_pub.get_stats()["tag_publishes"] == 1
        assert len(mqtt_pub._client.published) == 1

    @pytest.mark.asyncio
    async def test_publish_health(self, setup):
        tag_pub, mqtt_pub = setup
        result = await tag_pub.publish_health(
            plc_id="PLC_001", connected=True,
            area="Distillery01", latency_ms=5.2,
        )
        assert result is True
        assert tag_pub.get_stats()["health_publishes"] == 1

    @pytest.mark.asyncio
    async def test_publish_equipment_status(self, setup):
        tag_pub, mqtt_pub = setup
        result = await tag_pub.publish_equipment_status(
            equipment_id="CIP_001", field_name="cipState",
            value="RUNNING", area="Distillery01",
        )
        assert result is True
        assert tag_pub.get_stats()["equipment_publishes"] == 1

    @pytest.mark.asyncio
    async def test_publish_alarm(self, setup):
        tag_pub, mqtt_pub = setup
        result = await tag_pub.publish_alarm(
            alarm_id="a1", alarm_name="HIGH_TEMP",
            state="ACTIVE", priority="CRITICAL",
            tag_path="TIT/Out_PV", value=185.0, setpoint=180.0,
            timestamp="2026-04-08T12:00:00Z",
        )
        assert result is True
        assert tag_pub.get_stats()["alarm_publishes"] == 1

    @pytest.mark.asyncio
    async def test_multiple_publishes(self, setup):
        tag_pub, mqtt_pub = setup
        for i in range(5):
            await tag_pub.publish_tag_change(
                f"tag/{i}", float(i), "GOOD", "2026-04-08T12:00:00Z",
            )
        stats = tag_pub.get_stats()
        assert stats["tag_publishes"] == 5
        assert len(mqtt_pub._client.published) == 5
