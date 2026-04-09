"""Forge Core MQTT Broker — embedded publish/subscribe message bus.

Provides a lightweight MQTT 3.1.1 broker built on asyncio that serves
as the default internal message bus for all Forge modules.  This
eliminates the need for an external Mosquitto or RabbitMQ deployment
for single-site installations.

Architecture:
    ┌─────────────────────────────────────────────┐
    │              ForgeMqttBroker                 │
    │  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
    │  │ Listener  │  │ Sessions │  │  Topic    │ │
    │  │ (TCP)     │──│ Manager  │──│  Engine   │ │
    │  └──────────┘  └──────────┘  └───────────┘ │
    │                                ┌───────────┐ │
    │                                │  Retain   │ │
    │                                │  Store    │ │
    │                                └───────────┘ │
    └─────────────────────────────────────────────┘

Components:
    - ForgeMqttBroker: Main broker class, manages lifecycle
    - MqttSession: Per-client connection handler (MQTT 3.1.1 protocol)
    - TopicEngine: Subscription matching, message fan-out
    - RetainStore: Retained message storage (in-memory, optional disk)

Key design decisions:
    D1: Pure asyncio — no threads, no external deps.  Uses
        asyncio.start_server for TCP listener.
    D2: MQTT 3.1.1 (not 5.0) — sufficient for OT/manufacturing
        use cases, simpler to implement correctly.
    D3: QoS 0 and 1 only — QoS 2 adds complexity with minimal
        benefit for sensor data and event streams.
    D4: In-memory topic tree — O(1) exact match, O(n) wildcard
        match where n is the number of subscriptions (not topics).
    D5: Retained messages stored in-memory with optional periodic
        snapshot to disk for crash recovery.
    D6: System topics ($SYS/) for broker metrics, accessible by
        any connected client.
"""

from forge.core.broker.broker import ForgeMqttBroker, BrokerConfig
from forge.core.broker.topic_engine import TopicEngine
from forge.core.broker.session import MqttSession

__all__ = [
    "ForgeMqttBroker",
    "BrokerConfig",
    "TopicEngine",
    "MqttSession",
]
