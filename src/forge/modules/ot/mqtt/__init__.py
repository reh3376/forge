"""Forge OT Module — MQTT Pub/Sub Engine.

Provides tag value fan-out, health publishing, equipment status,
and command subscription over MQTT.  Replaces Ignition's Cirrus Link
MQTT Transmission module.

Key components:
    - OTMqttPublisher: Async MQTT client with auto-reconnect
    - TopicRouter: Template-based topic resolution
    - TagPublisher: Publishes tag value changes to MQTT topics
    - MqttSubscriber: Subscribes to command topics (MES, recipe)
    - RateLimiter: Per-tag throttle to prevent broker overload
"""

from forge.modules.ot.mqtt.publisher import OTMqttPublisher, MqttConfig
from forge.modules.ot.mqtt.topic_router import TopicRouter, TopicTemplate

__all__ = [
    "OTMqttPublisher",
    "MqttConfig",
    "TopicRouter",
    "TopicTemplate",
]
