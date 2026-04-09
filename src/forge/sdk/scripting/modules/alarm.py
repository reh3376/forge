"""forge.alarm — ISA-18.2 alarm SDK module.

Replaces Ignition's alarm pipeline with a Python-native interface.
Scripts use this to query active alarms, acknowledge alarms, and
trigger custom alarms programmatically.

The alarm engine itself (Phase 3) manages the ISA-18.2 state machine.
This module is the scripting facade over it.

Usage in scripts::

    import forge

    active = await forge.alarm.get_active(area="Distillery01")
    await forge.alarm.ack("alarm-id-123", operator="jsmith")
    await forge.alarm.trigger(
        "HIGH_TEMP",
        tag_path="WH/WHK01/Distillery01/TIT_2010/Out_PV",
        priority="HIGH",
        value=185.0,
        setpoint=180.0,
    )
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("forge.alarm")


# ---------------------------------------------------------------------------
# Alarm data models
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AlarmInfo:
    """Snapshot of an alarm's current state."""

    alarm_id: str
    name: str
    state: str  # NORMAL, ACTIVE_UNACK, ACTIVE_ACK, CLEAR_UNACK, etc.
    priority: str  # CRITICAL, HIGH, MEDIUM, LOW, DIAGNOSTIC
    tag_path: str
    value: Any = None
    setpoint: Any = None
    timestamp: str = ""
    area: str = ""
    equipment_id: str = ""
    description: str = ""
    shelved: bool = False
    suppressed: bool = False


# ---------------------------------------------------------------------------
# AlarmModule
# ---------------------------------------------------------------------------


class AlarmModule:
    """The forge.alarm SDK module — bound to the alarm engine at runtime."""

    def __init__(self) -> None:
        self._engine: Any = None  # AlarmEngine, set via bind()

    def bind(self, engine: Any) -> None:
        """Bind to an AlarmEngine instance. Called by ScriptEngine on startup."""
        self._engine = engine
        logger.debug("forge.alarm bound to AlarmEngine")

    def _check_bound(self) -> None:
        if self._engine is None:
            raise RuntimeError(
                "forge.alarm is not bound to an AlarmEngine. "
                "Alarms require Phase 3 (Alarm Engine) to be implemented. "
                "This module can only be used inside a running ScriptEngine "
                "with an active alarm engine."
            )

    async def get_active(
        self,
        *,
        area: str | None = None,
        priority: str | None = None,
        limit: int = 100,
    ) -> list[AlarmInfo]:
        """Get currently active alarms.

        Args:
            area: Filter by area (optional).
            priority: Filter by priority (optional).
            limit: Maximum number of alarms to return.

        Returns:
            List of AlarmInfo snapshots.
        """
        self._check_bound()
        # Delegate to alarm engine (Phase 3)
        raw = await self._engine.get_active_alarms(
            area=area, priority=priority, limit=limit
        )
        return [
            AlarmInfo(
                alarm_id=a.get("alarm_id", ""),
                name=a.get("name", ""),
                state=a.get("state", ""),
                priority=a.get("priority", ""),
                tag_path=a.get("tag_path", ""),
                value=a.get("value"),
                setpoint=a.get("setpoint"),
                timestamp=a.get("timestamp", ""),
                area=a.get("area", ""),
                equipment_id=a.get("equipment_id", ""),
            )
            for a in raw
        ]

    async def ack(self, alarm_id: str, *, operator: str = "") -> bool:
        """Acknowledge an active alarm.

        Args:
            alarm_id: The alarm instance ID.
            operator: Operator name (for audit trail).

        Returns:
            True if the alarm was acknowledged.
        """
        self._check_bound()
        return await self._engine.acknowledge_alarm(alarm_id, operator=operator)

    async def trigger(
        self,
        name: str,
        *,
        tag_path: str = "",
        priority: str = "MEDIUM",
        value: Any = None,
        setpoint: Any = None,
        description: str = "",
        area: str = "",
        equipment_id: str = "",
    ) -> str:
        """Trigger a custom alarm programmatically.

        Args:
            name: Alarm name.
            tag_path: Associated tag path.
            priority: Alarm priority level.
            value: Current value that triggered the alarm.
            setpoint: Threshold that was exceeded.
            description: Human-readable description.
            area: Equipment area.
            equipment_id: Equipment identifier.

        Returns:
            The alarm instance ID.
        """
        self._check_bound()
        return await self._engine.trigger_alarm(
            name=name,
            tag_path=tag_path,
            priority=priority,
            value=value,
            setpoint=setpoint,
            description=description,
            area=area,
            equipment_id=equipment_id,
        )

    async def shelve(self, alarm_id: str, *, duration_minutes: int = 60, reason: str = "") -> bool:
        """Shelve an alarm for a specified duration.

        Shelved alarms are suppressed from active displays but continue
        to be recorded in the alarm history.
        """
        self._check_bound()
        return await self._engine.shelve_alarm(
            alarm_id, duration_minutes=duration_minutes, reason=reason
        )

    async def unshelve(self, alarm_id: str) -> bool:
        """Unshelve a previously shelved alarm."""
        self._check_bound()
        return await self._engine.unshelve_alarm(alarm_id)

    async def get_history(
        self,
        *,
        start: str | None = None,
        end: str | None = None,
        area: str | None = None,
        limit: int = 100,
    ) -> list[AlarmInfo]:
        """Query alarm history.

        Args:
            start: ISO-8601 start time (optional).
            end: ISO-8601 end time (optional).
            area: Filter by area (optional).
            limit: Maximum results.
        """
        self._check_bound()
        raw = await self._engine.get_alarm_history(
            start=start, end=end, area=area, limit=limit
        )
        return [
            AlarmInfo(
                alarm_id=a.get("alarm_id", ""),
                name=a.get("name", ""),
                state=a.get("state", ""),
                priority=a.get("priority", ""),
                tag_path=a.get("tag_path", ""),
                value=a.get("value"),
                setpoint=a.get("setpoint"),
                timestamp=a.get("timestamp", ""),
                area=a.get("area", ""),
            )
            for a in raw
        ]


# Module-level singleton
_instance = AlarmModule()

get_active = _instance.get_active
ack = _instance.ack
trigger = _instance.trigger
shelve = _instance.shelve
unshelve = _instance.unshelve
get_history = _instance.get_history
bind = _instance.bind
