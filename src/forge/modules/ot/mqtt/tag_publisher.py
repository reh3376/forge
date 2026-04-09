"""TagPublisher — publishes tag value changes, health, and equipment status.

This module wires the OT Module's tag change events to MQTT publish
calls.  Each tag value change is serialized to a JSON payload and
published to the topic resolved by the TopicRouter.

Design decisions:
    D1: Payload format is a flat JSON object — no wrapping, no nesting.
        This keeps payloads small and compatible with NextTrend, MES,
        and any MQTT-consuming dashboard.
    D2: Health messages are published as retained messages with QoS 1.
        New subscribers immediately get the last-known PLC state.
    D3: Equipment status fields are published individually (one topic
        per field: cipState, mode, faultActive).  This allows selective
        subscription — MES only subscribes to the fields it needs.
    D4: All timestamps are ISO 8601 UTC.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from forge.modules.ot.mqtt.publisher import OTMqttPublisher
from forge.modules.ot.mqtt.topic_router import TopicRouter, TopicType

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------


def build_tag_payload(
    tag_path: str,
    value: Any,
    quality: str,
    timestamp: str,
    engineering_units: str = "",
    equipment_id: str = "",
    area: str = "",
) -> dict[str, Any]:
    """Build a JSON payload for a tag value change."""
    payload: dict[str, Any] = {
        "tag": tag_path,
        "v": value,
        "q": quality,
        "ts": timestamp,
    }
    if engineering_units:
        payload["eu"] = engineering_units
    if equipment_id:
        payload["eid"] = equipment_id
    if area:
        payload["area"] = area
    return payload


def build_health_payload(
    plc_id: str,
    connected: bool,
    latency_ms: float = 0.0,
    scan_class: str = "",
    error: str = "",
) -> dict[str, Any]:
    """Build a JSON payload for PLC health status."""
    return {
        "plc": plc_id,
        "connected": connected,
        "latency_ms": round(latency_ms, 1),
        "scan_class": scan_class,
        "ts": datetime.now(tz=timezone.utc).isoformat(),
        "error": error,
    }


def build_equipment_payload(
    equipment_id: str,
    field_name: str,
    value: Any,
    area: str = "",
) -> dict[str, Any]:
    """Build a JSON payload for an equipment status field."""
    return {
        "eid": equipment_id,
        "field": field_name,
        "v": value,
        "area": area,
        "ts": datetime.now(tz=timezone.utc).isoformat(),
    }


def build_alarm_payload(
    alarm_id: str,
    alarm_name: str,
    state: str,
    priority: str,
    tag_path: str,
    value: Any,
    setpoint: Any,
    timestamp: str,
    area: str = "",
) -> dict[str, Any]:
    """Build a JSON payload for an alarm event."""
    return {
        "id": alarm_id,
        "name": alarm_name,
        "state": state,
        "priority": priority,
        "tag": tag_path,
        "v": value,
        "sp": setpoint,
        "area": area,
        "ts": timestamp,
    }


# ---------------------------------------------------------------------------
# TagPublisher
# ---------------------------------------------------------------------------


class TagPublisher:
    """Publishes tag values, health, and equipment status over MQTT.

    Connects the OT Module's internal events to the MQTT transport.

    Usage::

        publisher = OTMqttPublisher(config)
        router = TopicRouter(site="whk01")
        tag_pub = TagPublisher(publisher, router)

        await tag_pub.publish_tag_change(
            tag_path="Distillery01/TIT_2010/Out_PV",
            value=78.4, quality="GOOD",
            timestamp="2026-04-08T12:00:00Z",
            area="Distillery01",
        )
    """

    def __init__(
        self,
        publisher: OTMqttPublisher,
        router: TopicRouter,
    ) -> None:
        self._publisher = publisher
        self._router = router

        # Metrics
        self._tag_publish_count: int = 0
        self._health_publish_count: int = 0
        self._equipment_publish_count: int = 0
        self._alarm_publish_count: int = 0
        self._error_count: int = 0

    # ------------------------------------------------------------------
    # Tag value publishing
    # ------------------------------------------------------------------

    async def publish_tag_change(
        self,
        tag_path: str,
        value: Any,
        quality: str,
        timestamp: str,
        engineering_units: str = "",
        equipment_id: str = "",
        area: str = "",
    ) -> bool:
        """Publish a tag value change to MQTT.

        Returns True if published (or buffered), False on error.
        """
        resolved = self._router.resolve_tag(tag_path, area=area)
        payload = build_tag_payload(
            tag_path=tag_path,
            value=value,
            quality=quality,
            timestamp=timestamp,
            engineering_units=engineering_units,
            equipment_id=equipment_id,
            area=area,
        )

        try:
            await self._publisher.publish(
                resolved.topic, payload,
                qos=resolved.qos, retain=resolved.retain,
            )
            self._tag_publish_count += 1
            return True
        except Exception as exc:
            self._error_count += 1
            logger.error("Failed to publish tag %s: %s", tag_path, exc)
            return False

    # ------------------------------------------------------------------
    # Health publishing
    # ------------------------------------------------------------------

    async def publish_health(
        self,
        plc_id: str,
        connected: bool,
        area: str = "",
        latency_ms: float = 0.0,
        scan_class: str = "",
        error: str = "",
    ) -> bool:
        """Publish PLC connection health status.

        Health messages are retained (QoS 1) so new subscribers
        immediately see the last-known state.
        """
        resolved = self._router.resolve_health(plc_id, area=area)
        payload = build_health_payload(
            plc_id=plc_id,
            connected=connected,
            latency_ms=latency_ms,
            scan_class=scan_class,
            error=error,
        )

        try:
            await self._publisher.publish(
                resolved.topic, payload,
                qos=resolved.qos, retain=resolved.retain,
            )
            self._health_publish_count += 1
            return True
        except Exception as exc:
            self._error_count += 1
            logger.error("Failed to publish health for %s: %s", plc_id, exc)
            return False

    # ------------------------------------------------------------------
    # Equipment status publishing
    # ------------------------------------------------------------------

    async def publish_equipment_status(
        self,
        equipment_id: str,
        field_name: str,
        value: Any,
        area: str = "",
    ) -> bool:
        """Publish an equipment status field (cipState, mode, faultActive, etc.).

        Each field is published as a separate retained message, allowing
        selective subscription by downstream consumers.
        """
        resolved = self._router.resolve_equipment(
            equipment_id, field_name, area=area,
        )
        payload = build_equipment_payload(
            equipment_id=equipment_id,
            field_name=field_name,
            value=value,
            area=area,
        )

        try:
            await self._publisher.publish(
                resolved.topic, payload,
                qos=resolved.qos, retain=resolved.retain,
            )
            self._equipment_publish_count += 1
            return True
        except Exception as exc:
            self._error_count += 1
            logger.error(
                "Failed to publish equipment %s.%s: %s",
                equipment_id, field_name, exc,
            )
            return False

    # ------------------------------------------------------------------
    # Alarm publishing
    # ------------------------------------------------------------------

    async def publish_alarm(
        self,
        alarm_id: str,
        alarm_name: str,
        state: str,
        priority: str,
        tag_path: str,
        value: Any,
        setpoint: Any,
        timestamp: str,
        area: str = "",
    ) -> bool:
        """Publish an alarm event to MQTT."""
        resolved = self._router.resolve_alarm(alarm_name, area=area)
        payload = build_alarm_payload(
            alarm_id=alarm_id,
            alarm_name=alarm_name,
            state=state,
            priority=priority,
            tag_path=tag_path,
            value=value,
            setpoint=setpoint,
            timestamp=timestamp,
            area=area,
        )

        try:
            await self._publisher.publish(
                resolved.topic, payload,
                qos=resolved.qos, retain=resolved.retain,
            )
            self._alarm_publish_count += 1
            return True
        except Exception as exc:
            self._error_count += 1
            logger.error("Failed to publish alarm %s: %s", alarm_name, exc)
            return False

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_stats(self) -> dict[str, int]:
        """Return publish statistics."""
        return {
            "tag_publishes": self._tag_publish_count,
            "health_publishes": self._health_publish_count,
            "equipment_publishes": self._equipment_publish_count,
            "alarm_publishes": self._alarm_publish_count,
            "errors": self._error_count,
        }
