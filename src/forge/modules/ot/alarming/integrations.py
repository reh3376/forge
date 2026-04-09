"""Cross-module alarm integrations.

Registers listeners on the AlarmEngine to propagate alarm state changes to:
- MQTT (retained messages on alarm topics, QoS 1)
- RabbitMQ (structured events for cross-module workflows)
- CMMS (auto-create work requests for CRITICAL/HIGH alarms)
- NextTrend (annotations on tag history)
- Scripting (@forge.on_alarm handler dispatch)
- ContextualRecord (Forge decision-quality pipeline)

Each integration is a standalone class that registers itself as an
engine listener.  The ``AlarmIntegrationHub`` coordinates startup/shutdown
of all integrations.

3.3.7: MQTT acknowledge subscriber — subscribes to
``whk/whk01/{area}/ot/alarms/{alarm_id}/ack`` to allow remote
acknowledgment from dashboards/mobile apps.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Awaitable, Protocol

from forge.modules.ot.alarming.models import (
    AlarmEvent,
    AlarmPriority,
)
from forge.modules.ot.alarming.engine import AlarmEngine

logger = logging.getLogger("forge.alarm.integrations")


# ---------------------------------------------------------------------------
# Protocols for external dependencies (avoid hard coupling)
# ---------------------------------------------------------------------------


class MqttPublisher(Protocol):
    """Protocol for MQTT publishing (matches OTMqttPublisher interface)."""

    async def publish(self, topic: str, payload: str, *, qos: int = 0, retain: bool = False) -> None: ...
    async def subscribe(self, topic: str, callback: Callable) -> None: ...


class RabbitMqPublisher(Protocol):
    """Protocol for RabbitMQ event publishing."""

    async def publish_event(self, exchange: str, routing_key: str, payload: dict) -> None: ...


class CmmsAdapter(Protocol):
    """Protocol for CMMS work request creation."""

    async def create_work_request(self, payload: dict) -> str: ...


class HistorianAnnotator(Protocol):
    """Protocol for NextTrend annotation writing."""

    async def write_annotation(self, tag_path: str, timestamp: str, text: str, **kwargs: Any) -> None: ...


class ScriptDispatcher(Protocol):
    """Protocol for dispatching to @forge.on_alarm scripts."""

    async def dispatch_alarm_event(
        self,
        alarm_id: str,
        alarm_name: str,
        state: str,
        priority: str,
        tag_path: str,
        value: Any,
        setpoint: Any,
        timestamp: str,
        area: str,
        equipment_id: str,
    ) -> None: ...


class ContextualRecordWriter(Protocol):
    """Protocol for writing ContextualRecords to the Forge pipeline."""

    async def write(self, record: dict) -> None: ...


# ---------------------------------------------------------------------------
# MQTT Alarm Publisher (3.3.1)
# ---------------------------------------------------------------------------


class AlarmMqttPublisher:
    """Publishes alarm state changes to MQTT topics.

    Topic pattern: ``whk/whk01/{area}/ot/alarms/{alarm_id}``
    Payload: JSON with state, priority, tag_path, value, setpoint, timestamp, equipment_id
    QoS: 1, Retained: True (so dashboards get latest state on subscribe)
    """

    def __init__(
        self,
        mqtt: MqttPublisher,
        *,
        topic_prefix: str = "whk/whk01",
    ) -> None:
        self._mqtt = mqtt
        self._prefix = topic_prefix

    async def on_alarm_event(self, event: AlarmEvent) -> None:
        area = event.area or "global"
        topic = f"{self._prefix}/{area}/ot/alarms/{event.alarm_id}"

        payload = json.dumps({
            "alarm_id": event.alarm_id,
            "name": event.name,
            "state": event.new_state,
            "previous_state": event.previous_state,
            "action": event.action,
            "priority": event.priority,
            "tag_path": event.tag_path,
            "value": _safe_value(event.value),
            "setpoint": _safe_value(event.setpoint),
            "timestamp": event.timestamp.isoformat() if isinstance(event.timestamp, datetime) else str(event.timestamp),
            "equipment_id": event.equipment_id,
            "area": event.area,
        })

        # Clear retained message when alarm returns to NORMAL
        if event.new_state == "NORMAL":
            await self._mqtt.publish(topic, "", qos=1, retain=True)
        else:
            await self._mqtt.publish(topic, payload, qos=1, retain=True)

        logger.debug("Alarm MQTT: %s → %s", topic, event.new_state)


# ---------------------------------------------------------------------------
# MQTT Acknowledge Subscriber (3.3.7)
# ---------------------------------------------------------------------------


class AlarmMqttAckSubscriber:
    """Subscribes to alarm acknowledge topics for remote ack.

    Topic pattern: ``whk/whk01/+/ot/alarms/+/ack``
    Payload: JSON with ``operator`` and optional ``auth_token`` fields.
    """

    def __init__(
        self,
        engine: AlarmEngine,
        mqtt: MqttPublisher,
        *,
        topic_prefix: str = "whk/whk01",
    ) -> None:
        self._engine = engine
        self._mqtt = mqtt
        self._prefix = topic_prefix

    async def start(self) -> None:
        pattern = f"{self._prefix}/+/ot/alarms/+/ack"
        await self._mqtt.subscribe(pattern, self._on_ack_message)
        logger.info("Alarm MQTT ack subscriber started: %s", pattern)

    async def _on_ack_message(self, topic: str, payload: bytes | str) -> None:
        """Handle incoming acknowledge message."""
        try:
            parts = topic.split("/")
            # Extract alarm_id from topic: .../alarms/{alarm_id}/ack
            alarm_id_idx = parts.index("alarms") + 1
            alarm_id = parts[alarm_id_idx]
        except (ValueError, IndexError):
            logger.warning("Malformed alarm ack topic: %s", topic)
            return

        try:
            data = json.loads(payload if isinstance(payload, str) else payload.decode())
            operator = data.get("operator", "mqtt-remote")
        except (json.JSONDecodeError, UnicodeDecodeError):
            operator = "mqtt-remote"

        result = await self._engine.acknowledge_alarm(alarm_id, operator=operator)
        if result:
            logger.info("Remote alarm ack: %s by %s", alarm_id, operator)
        else:
            logger.warning("Remote alarm ack failed: %s (not found or not ackable)", alarm_id)


# ---------------------------------------------------------------------------
# RabbitMQ Event Publisher (3.3.2)
# ---------------------------------------------------------------------------


class AlarmRabbitMqPublisher:
    """Publishes structured alarm events to RabbitMQ.

    Exchange: ``forge.alarms``
    Routing key: ``alarm.{action}.{priority}`` (e.g. ``alarm.TRIGGER.HIGH``)
    """

    EXCHANGE = "forge.alarms"

    def __init__(self, rabbit: RabbitMqPublisher) -> None:
        self._rabbit = rabbit

    async def on_alarm_event(self, event: AlarmEvent) -> None:
        routing_key = f"alarm.{event.action}.{event.priority}"
        payload = event.to_dict()
        await self._rabbit.publish_event(self.EXCHANGE, routing_key, payload)
        logger.debug("Alarm RabbitMQ: %s → %s", routing_key, event.new_state)


# ---------------------------------------------------------------------------
# CMMS Work Order Creator (3.3.3)
# ---------------------------------------------------------------------------

_CMMS_PRIORITIES = {AlarmPriority.CRITICAL.value, AlarmPriority.HIGH.value}


class AlarmCmmsIntegration:
    """Auto-creates CMMS work requests for CRITICAL and HIGH alarms.

    Only triggers on TRIGGER actions (not on ack/clear/shelve).
    """

    def __init__(self, cmms: CmmsAdapter) -> None:
        self._cmms = cmms

    async def on_alarm_event(self, event: AlarmEvent) -> None:
        if event.action != "TRIGGER":
            return
        if event.priority not in _CMMS_PRIORITIES:
            return

        payload = {
            "alarm_id": event.alarm_id,
            "alarm_name": event.name,
            "priority": event.priority,
            "tag_path": event.tag_path,
            "value": _safe_value(event.value),
            "setpoint": _safe_value(event.setpoint),
            "equipment_id": event.equipment_id,
            "area": event.area,
            "description": event.detail or f"Alarm triggered: {event.name}",
            "timestamp": event.timestamp.isoformat() if isinstance(event.timestamp, datetime) else str(event.timestamp),
        }

        try:
            work_request_id = await self._cmms.create_work_request(payload)
            logger.info("CMMS work request created: %s for alarm %s",
                        work_request_id, event.alarm_id)
        except Exception:
            logger.exception("Failed to create CMMS work request for alarm %s",
                             event.alarm_id)


# ---------------------------------------------------------------------------
# NextTrend Annotation Writer (3.3.4)
# ---------------------------------------------------------------------------


class AlarmHistorianAnnotation:
    """Writes alarm events as annotations on NextTrend tag history."""

    def __init__(self, historian: HistorianAnnotator) -> None:
        self._historian = historian

    async def on_alarm_event(self, event: AlarmEvent) -> None:
        if not event.tag_path:
            return

        ts = event.timestamp.isoformat() if isinstance(event.timestamp, datetime) else str(event.timestamp)
        text = f"[{event.priority}] {event.name}: {event.previous_state} → {event.new_state}"

        try:
            await self._historian.write_annotation(
                tag_path=event.tag_path,
                timestamp=ts,
                text=text,
                alarm_id=event.alarm_id,
                priority=event.priority,
                action=event.action,
            )
        except Exception:
            logger.exception("Failed to write historian annotation for alarm %s",
                             event.alarm_id)


# ---------------------------------------------------------------------------
# Script Dispatcher Integration (3.3.8)
# ---------------------------------------------------------------------------


class AlarmScriptDispatch:
    """Dispatches alarm events to @forge.on_alarm script handlers."""

    def __init__(self, dispatcher: ScriptDispatcher) -> None:
        self._dispatcher = dispatcher

    async def on_alarm_event(self, event: AlarmEvent) -> None:
        ts = event.timestamp.isoformat() if isinstance(event.timestamp, datetime) else str(event.timestamp)
        try:
            await self._dispatcher.dispatch_alarm_event(
                alarm_id=event.alarm_id,
                alarm_name=event.name,
                state=event.new_state,
                priority=event.priority,
                tag_path=event.tag_path,
                value=event.value,
                setpoint=event.setpoint,
                timestamp=ts,
                area=event.area or "",
                equipment_id=event.equipment_id or "",
            )
        except Exception:
            logger.exception("Failed to dispatch alarm script event for %s",
                             event.alarm_id)


# ---------------------------------------------------------------------------
# ContextualRecord Writer (3.3.6)
# ---------------------------------------------------------------------------


class AlarmContextualRecordWriter:
    """Produces ContextualRecords from alarm events.

    These records feed into the Forge decision-quality pipeline,
    providing alarm-specific context fields.
    """

    def __init__(self, writer: ContextualRecordWriter) -> None:
        self._writer = writer

    async def on_alarm_event(self, event: AlarmEvent) -> None:
        ts = event.timestamp.isoformat() if isinstance(event.timestamp, datetime) else str(event.timestamp)
        record = {
            "record_type": "alarm_event",
            "source_module": "ot",
            "timestamp": ts,
            "alarm_id": event.alarm_id,
            "alarm_name": event.name,
            "alarm_type": event.alarm_type,
            "state_transition": f"{event.previous_state} → {event.new_state}",
            "action": event.action,
            "priority": event.priority,
            "tag_path": event.tag_path,
            "value": _safe_value(event.value),
            "setpoint": _safe_value(event.setpoint),
            "area": event.area,
            "equipment_id": event.equipment_id,
            "operator": event.operator,
            "context": {
                "alarm_priority": event.priority,
                "alarm_action": event.action,
                "tag_path": event.tag_path,
                "equipment_id": event.equipment_id,
            },
        }

        try:
            await self._writer.write(record)
        except Exception:
            logger.exception("Failed to write ContextualRecord for alarm %s",
                             event.alarm_id)


# ---------------------------------------------------------------------------
# Integration Hub (coordinates all integrations)
# ---------------------------------------------------------------------------


@dataclass
class IntegrationConfig:
    """Configuration for which integrations to enable."""

    mqtt_enabled: bool = True
    mqtt_ack_enabled: bool = True
    rabbitmq_enabled: bool = False
    cmms_enabled: bool = False
    historian_enabled: bool = False
    scripting_enabled: bool = True
    contextual_record_enabled: bool = True
    topic_prefix: str = "whk/whk01"


class AlarmIntegrationHub:
    """Coordinates startup/shutdown of all alarm integrations.

    Usage::

        hub = AlarmIntegrationHub(engine, config)
        hub.set_mqtt(mqtt_publisher)
        hub.set_script_dispatcher(script_engine)
        await hub.start()  # Registers all listeners
        # ... engine runs ...
        await hub.stop()   # Unregisters all listeners
    """

    def __init__(
        self,
        engine: AlarmEngine,
        config: IntegrationConfig | None = None,
    ) -> None:
        self._engine = engine
        self._config = config or IntegrationConfig()
        self._integrations: list[Any] = []
        self._listeners: list[Callable] = []

        # Optional dependencies (set before start())
        self._mqtt: MqttPublisher | None = None
        self._rabbit: RabbitMqPublisher | None = None
        self._cmms: CmmsAdapter | None = None
        self._historian: HistorianAnnotator | None = None
        self._script_dispatcher: ScriptDispatcher | None = None
        self._record_writer: ContextualRecordWriter | None = None

    def set_mqtt(self, mqtt: MqttPublisher) -> None:
        self._mqtt = mqtt

    def set_rabbitmq(self, rabbit: RabbitMqPublisher) -> None:
        self._rabbit = rabbit

    def set_cmms(self, cmms: CmmsAdapter) -> None:
        self._cmms = cmms

    def set_historian(self, historian: HistorianAnnotator) -> None:
        self._historian = historian

    def set_script_dispatcher(self, dispatcher: ScriptDispatcher) -> None:
        self._script_dispatcher = dispatcher

    def set_contextual_record_writer(self, writer: ContextualRecordWriter) -> None:
        self._record_writer = writer

    async def start(self) -> None:
        """Register all enabled integrations as engine listeners."""
        cfg = self._config

        if cfg.mqtt_enabled and self._mqtt:
            pub = AlarmMqttPublisher(self._mqtt, topic_prefix=cfg.topic_prefix)
            self._register(pub.on_alarm_event)
            self._integrations.append(pub)

            if cfg.mqtt_ack_enabled:
                ack_sub = AlarmMqttAckSubscriber(
                    self._engine, self._mqtt, topic_prefix=cfg.topic_prefix
                )
                await ack_sub.start()
                self._integrations.append(ack_sub)

        if cfg.rabbitmq_enabled and self._rabbit:
            rmq = AlarmRabbitMqPublisher(self._rabbit)
            self._register(rmq.on_alarm_event)
            self._integrations.append(rmq)

        if cfg.cmms_enabled and self._cmms:
            cmms = AlarmCmmsIntegration(self._cmms)
            self._register(cmms.on_alarm_event)
            self._integrations.append(cmms)

        if cfg.historian_enabled and self._historian:
            hist = AlarmHistorianAnnotation(self._historian)
            self._register(hist.on_alarm_event)
            self._integrations.append(hist)

        if cfg.scripting_enabled and self._script_dispatcher:
            script = AlarmScriptDispatch(self._script_dispatcher)
            self._register(script.on_alarm_event)
            self._integrations.append(script)

        if cfg.contextual_record_enabled and self._record_writer:
            cr = AlarmContextualRecordWriter(self._record_writer)
            self._register(cr.on_alarm_event)
            self._integrations.append(cr)

        logger.info("Alarm integration hub started with %d integrations",
                     len(self._integrations))

    async def stop(self) -> None:
        """Unregister all listeners."""
        for listener in self._listeners:
            self._engine.remove_listener(listener)
        self._listeners.clear()
        self._integrations.clear()
        logger.info("Alarm integration hub stopped")

    def _register(self, callback: Callable) -> None:
        self._engine.add_listener(callback)
        self._listeners.append(callback)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _safe_value(v: Any) -> Any:
    """Ensure value is JSON-serializable."""
    if isinstance(v, (str, int, float, bool, type(None))):
        return v
    return str(v)
