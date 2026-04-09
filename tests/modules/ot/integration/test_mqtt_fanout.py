"""Integration test: MQTT fan-out pipeline.

Tests the full path: tag change → TagPublisher → topic resolution →
MQTT publish → verify correct topic/payload structure.
"""

import json
import pytest

from forge.modules.ot.mqtt.publisher import MqttConfig, OTMqttPublisher
from forge.modules.ot.mqtt.topic_router import TopicRouter, TopicType
from forge.modules.ot.mqtt.tag_publisher import TagPublisher
from forge.modules.ot.mqtt.rate_limiter import MqttRateLimiter, RateLimiterConfig


class TestMqttFanoutPipeline:
    """Integration: tag change → MQTT publish with topic routing."""

    @pytest.fixture
    async def pipeline(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        await pub.start()
        router = TopicRouter(site="whk01")
        tag_pub = TagPublisher(pub, router)
        yield tag_pub, pub
        await pub.stop()

    @pytest.mark.asyncio
    async def test_tag_change_publishes_correct_topic(self, pipeline):
        tag_pub, mqtt_pub = pipeline

        await tag_pub.publish_tag_change(
            tag_path="Distillery01/TIT_2010/Out_PV",
            value=78.4,
            quality="GOOD",
            timestamp="2026-04-08T12:00:00Z",
            engineering_units="degF",
            equipment_id="TIT_2010",
            area="Distillery01",
        )

        assert len(mqtt_pub._client.published) == 1
        msg = mqtt_pub._client.published[0]

        # Verify topic structure
        assert msg["topic"] == "whk/whk01/Distillery01/ot/tags/Distillery01/TIT_2010/Out_PV"

        # Verify payload
        payload = json.loads(msg["payload"])
        assert payload["tag"] == "Distillery01/TIT_2010/Out_PV"
        assert payload["v"] == 78.4
        assert payload["q"] == "GOOD"
        assert payload["eu"] == "degF"
        assert payload["eid"] == "TIT_2010"

    @pytest.mark.asyncio
    async def test_health_publishes_retained(self, pipeline):
        tag_pub, mqtt_pub = pipeline

        await tag_pub.publish_health(
            plc_id="PLC_L83_001",
            connected=True,
            area="Distillery01",
            latency_ms=4.7,
            scan_class="fast",
        )

        msg = mqtt_pub._client.published[0]
        assert msg["topic"] == "whk/whk01/Distillery01/ot/health/PLC_L83_001"
        assert msg["qos"] == 1
        assert msg["retain"] is True

        payload = json.loads(msg["payload"])
        assert payload["connected"] is True
        assert payload["latency_ms"] == 4.7

    @pytest.mark.asyncio
    async def test_equipment_status_per_field(self, pipeline):
        tag_pub, mqtt_pub = pipeline

        # Publish multiple fields for the same equipment
        await tag_pub.publish_equipment_status("CIP_001", "cipState", "RUNNING", area="Distillery01")
        await tag_pub.publish_equipment_status("CIP_001", "mode", "AUTO", area="Distillery01")
        await tag_pub.publish_equipment_status("CIP_001", "faultActive", False, area="Distillery01")

        assert len(mqtt_pub._client.published) == 3
        topics = [m["topic"] for m in mqtt_pub._client.published]
        assert "whk/whk01/Distillery01/equipment/CIP_001/cipState" in topics
        assert "whk/whk01/Distillery01/equipment/CIP_001/mode" in topics
        assert "whk/whk01/Distillery01/equipment/CIP_001/faultActive" in topics

    @pytest.mark.asyncio
    async def test_alarm_publishes(self, pipeline):
        tag_pub, mqtt_pub = pipeline

        await tag_pub.publish_alarm(
            alarm_id="a1",
            alarm_name="HIGH_TEMP",
            state="ACTIVE_UNACK",
            priority="CRITICAL",
            tag_path="TIT_2010/Out_PV",
            value=185.0,
            setpoint=180.0,
            timestamp="2026-04-08T12:00:00Z",
            area="Distillery01",
        )

        msg = mqtt_pub._client.published[0]
        assert "ot/alarms/HIGH_TEMP" in msg["topic"]
        payload = json.loads(msg["payload"])
        assert payload["priority"] == "CRITICAL"
        assert payload["v"] == 185.0
        assert payload["sp"] == 180.0


class TestMqttFanoutWithRateLimiter:
    """Integration: rate limiter gates publish throughput."""

    @pytest.mark.asyncio
    async def test_rate_limiter_throttles_burst(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        await pub.start()
        router = TopicRouter(site="whk01")
        tag_pub = TagPublisher(pub, router)
        limiter = MqttRateLimiter(RateLimiterConfig(
            default_rate=0.001, default_burst=2.0,
        ))

        published = 0
        throttled = 0
        for i in range(5):
            tag_path = "Distillery01/TIT_2010/Out_PV"
            if limiter.should_publish(tag_path):
                await tag_pub.publish_tag_change(
                    tag_path, value=float(i), quality="GOOD",
                    timestamp="2026-04-08T12:00:00Z", area="Distillery01",
                )
                published += 1
            else:
                limiter.set_pending(tag_path, {"v": float(i)})
                throttled += 1

        assert published == 2  # Burst capacity
        assert throttled == 3
        assert limiter.pending_count == 1  # Latest pending value (overwrites)

        await pub.stop()

    @pytest.mark.asyncio
    async def test_disconnected_buffers_then_drains(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        router = TopicRouter(site="whk01")
        tag_pub = TagPublisher(pub, router)

        # Publish while disconnected — should buffer
        await tag_pub.publish_tag_change(
            "TIT/Out_PV", 78.4, "GOOD", "2026-04-08T12:00:00Z",
        )
        assert pub.buffer_size == 1

        # Connect — buffer drains
        await pub.start()
        assert pub.buffer_size == 0
        assert pub.publish_count == 1

        await pub.stop()
