"""Integration test: SparkplugB encoding + MQTT publish.

Tests the full SparkplugB path: tag change → SparkplugB encoding →
MQTT publish to correct spBv1.0 topic namespace.
"""

import json
import pytest

from forge.modules.ot.mqtt.publisher import MqttConfig, OTMqttPublisher
from forge.modules.ot.mqtt.sparkplug import (
    SparkplugEncoder,
    SparkplugMetric,
    SparkplugDataType,
    infer_sparkplug_type,
)


class TestSparkplugPublishPipeline:
    """Integration: SparkplugB birth → data → death via MQTT publisher."""

    @pytest.fixture
    async def setup(self):
        pub = OTMqttPublisher(MqttConfig(reconnect_enabled=False))
        await pub.start()
        encoder = SparkplugEncoder(group_id="WHK", edge_node_id="ForgeOT-01")
        yield pub, encoder
        await pub.stop()

    @pytest.mark.asyncio
    async def test_full_sparkplug_lifecycle(self, setup):
        pub, encoder = setup

        # 1. Node BIRTH
        topic, payload = encoder.build_node_birth(metrics=[
            SparkplugMetric(name="temp", datatype=SparkplugDataType.DOUBLE, value=78.4),
            SparkplugMetric(name="pressure", datatype=SparkplugDataType.DOUBLE, value=14.7),
        ])
        await pub.publish(topic, payload, qos=1, retain=True)

        # 2. Device BIRTH
        topic, payload = encoder.build_device_birth("Distillery01", metrics=[
            SparkplugMetric(name="TIT_2010/Out_PV", datatype=SparkplugDataType.DOUBLE, value=78.4),
        ])
        await pub.publish(topic, payload, qos=1)

        # 3. Device DATA (multiple updates)
        for val in [78.5, 78.6, 78.7]:
            topic, payload = encoder.build_device_data("Distillery01", metrics=[
                SparkplugMetric(name="TIT_2010/Out_PV", datatype=SparkplugDataType.DOUBLE, value=val),
            ])
            await pub.publish(topic, payload)

        # 4. Device DEATH
        topic, payload = encoder.build_device_death("Distillery01")
        await pub.publish(topic, payload, qos=1)

        # 5. Node DEATH
        topic, payload = encoder.build_node_death()
        await pub.publish(topic, payload, qos=1, retain=True)

        # Verify all messages published
        assert pub.publish_count == 7  # NBIRTH + DBIRTH + 3 DDATA + DDEATH + NDEATH

        # Verify topic namespaces
        topics = [m["topic"] for m in pub._client.published]
        assert topics[0] == "spBv1.0/WHK/NBIRTH/ForgeOT-01"
        assert topics[1] == "spBv1.0/WHK/DBIRTH/ForgeOT-01/Distillery01"
        assert all(t == "spBv1.0/WHK/DDATA/ForgeOT-01/Distillery01" for t in topics[2:5])
        assert topics[5] == "spBv1.0/WHK/DDEATH/ForgeOT-01/Distillery01"
        assert topics[6] == "spBv1.0/WHK/NDEATH/ForgeOT-01"

    @pytest.mark.asyncio
    async def test_sequence_numbers_increment(self, setup):
        pub, encoder = setup

        # Birth resets seq to 0
        _, payload = encoder.build_node_birth()
        await pub.publish("spBv1.0/WHK/NBIRTH/ForgeOT-01", payload)

        seqs = []
        for i in range(5):
            _, payload = encoder.build_device_data("dev", metrics=[
                SparkplugMetric(name="sensor", value=float(i)),
            ])
            seqs.append(payload["seq"])
            await pub.publish(f"spBv1.0/WHK/DDATA/ForgeOT-01/dev", payload)

        assert seqs == [1, 2, 3, 4, 5]

    @pytest.mark.asyncio
    async def test_alias_consistency(self, setup):
        pub, encoder = setup

        # Birth assigns aliases
        metrics = [
            SparkplugMetric(name="temp", value=78.4),
            SparkplugMetric(name="pressure", value=14.7),
        ]
        _, birth_payload = encoder.build_node_birth(metrics)
        birth_aliases = {m["name"]: m["alias"] for m in birth_payload["metrics"]}

        # Data should use same aliases
        _, data_payload = encoder.build_device_data("", metrics=[
            SparkplugMetric(name="temp", value=79.0),
        ])
        # Note: device data aliases include device_id prefix, so they'll be different
        # But within the same device, aliases should be consistent
        data_aliases_1 = {m["name"]: m["alias"] for m in data_payload["metrics"]}

        _, data_payload_2 = encoder.build_device_data("", metrics=[
            SparkplugMetric(name="temp", value=80.0),
        ])
        data_aliases_2 = {m["name"]: m["alias"] for m in data_payload_2["metrics"]}

        # Same metric name should get same alias
        assert data_aliases_1["temp"] == data_aliases_2["temp"]
