"""AlarmEngine — runtime alarm management coordinator.

Provides the async API contract that ``AlarmModule`` (forge.alarm SDK) binds to.
Manages alarm configurations, live alarm instances, the event journal, and
flood suppression.

Thread safety: all mutation is serialized through ``asyncio.Lock``.
The engine is designed for single-process operation inside the Forge OT Module.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Callable, Awaitable

from forge.modules.ot.alarming.models import (
    AlarmAction,
    AlarmConfig,
    AlarmEvent,
    AlarmInstance,
    AlarmPriority,
    AlarmState,
    AlarmType,
    ThresholdConfig,
)
from forge.modules.ot.alarming.state_machine import (
    AlarmStateMachine,
    InvalidTransition,
    TransitionResult,
)

logger = logging.getLogger("forge.alarm.engine")


# ---------------------------------------------------------------------------
# Callback type for alarm state change notifications
# ---------------------------------------------------------------------------

AlarmCallback = Callable[[AlarmEvent], Awaitable[None]]


# ---------------------------------------------------------------------------
# Engine configuration
# ---------------------------------------------------------------------------

DEFAULT_MAX_ACTIVE_PER_AREA = 200
DEFAULT_JOURNAL_MAX = 100_000


# ---------------------------------------------------------------------------
# AlarmEngine
# ---------------------------------------------------------------------------


class AlarmEngine:
    """Runtime alarm engine with ISA-18.2 state machine.

    This is the object that ``AlarmModule.bind(engine)`` receives.
    All public methods are ``async`` so they can be called from
    scripting handlers and the REST API.

    Args:
        max_active_per_area: Flood suppression threshold per area.
        journal_max: Maximum journal entries before oldest are evicted.
    """

    def __init__(
        self,
        *,
        max_active_per_area: int = DEFAULT_MAX_ACTIVE_PER_AREA,
        journal_max: int = DEFAULT_JOURNAL_MAX,
    ) -> None:
        self._sm = AlarmStateMachine()
        self._lock = asyncio.Lock()

        # Alarm configurations by tag_path
        self._configs: dict[str, AlarmConfig] = {}

        # Live alarm instances by alarm_id
        self._instances: dict[str, AlarmInstance] = {}

        # Index: tag_path+alarm_type → alarm_id (for dedup on threshold alarms)
        self._tag_alarm_index: dict[str, str] = {}

        # Event journal (bounded deque)
        self._journal: deque[AlarmEvent] = deque(maxlen=journal_max)

        # Flood suppression
        self._max_active_per_area = max_active_per_area

        # Listeners for state change events
        self._listeners: list[AlarmCallback] = []

        # Stats
        self._total_triggered = 0
        self._total_acknowledged = 0
        self._total_cleared = 0

    # ------------------------------------------------------------------
    # Configuration management
    # ------------------------------------------------------------------

    async def register_config(self, config: AlarmConfig) -> None:
        """Register or update alarm configuration for a tag."""
        async with self._lock:
            self._configs[config.tag_path] = config
            logger.debug("Registered alarm config for %s (%d thresholds)",
                         config.tag_path, len(config.thresholds))

    async def unregister_config(self, tag_path: str) -> bool:
        """Remove alarm configuration for a tag. Returns True if found."""
        async with self._lock:
            return self._configs.pop(tag_path, None) is not None

    async def get_config(self, tag_path: str) -> AlarmConfig | None:
        """Get alarm configuration for a tag."""
        return self._configs.get(tag_path)

    async def get_all_configs(self) -> list[AlarmConfig]:
        """Get all registered alarm configurations."""
        return list(self._configs.values())

    # ------------------------------------------------------------------
    # Listener management
    # ------------------------------------------------------------------

    def add_listener(self, callback: AlarmCallback) -> None:
        """Register a callback for alarm state changes."""
        self._listeners.append(callback)

    def remove_listener(self, callback: AlarmCallback) -> None:
        """Remove a previously registered callback."""
        try:
            self._listeners.remove(callback)
        except ValueError:
            pass

    # ------------------------------------------------------------------
    # SDK API (called by AlarmModule)
    # ------------------------------------------------------------------

    async def get_active_alarms(
        self,
        *,
        area: str | None = None,
        priority: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Get active alarm instances as dicts (for SDK consumption)."""
        active_states = {
            AlarmState.ACTIVE_UNACK,
            AlarmState.ACTIVE_ACK,
            AlarmState.CLEAR_UNACK,
            AlarmState.SUPPRESSED,
            AlarmState.SHELVED,
        }
        results = []
        for inst in self._instances.values():
            if inst.state not in active_states:
                continue
            if area and inst.area != area:
                continue
            if priority and inst.priority.value != priority:
                continue
            results.append(inst.to_dict())

        # Sort by priority rank (most severe first), then by timestamp
        results.sort(key=lambda d: (
            AlarmPriority(d["priority"]).rank,
            d["timestamp"],
        ))
        return results[:limit]

    async def acknowledge_alarm(
        self, alarm_id: str, *, operator: str = ""
    ) -> bool:
        """Acknowledge an alarm. Returns True on success."""
        async with self._lock:
            inst = self._instances.get(alarm_id)
            if inst is None:
                return False

            try:
                result = self._sm.transition(inst, AlarmAction.ACKNOWLEDGE)
            except InvalidTransition:
                logger.warning("Cannot acknowledge alarm %s in state %s",
                               alarm_id, inst.state.value)
                return False

            inst.ack_operator = operator
            inst.ack_time = datetime.now(timezone.utc)
            self._total_acknowledged += 1

            event = self._make_event(inst, result, operator=operator)
            self._record_event(event)

            # If transition leads to NORMAL, clean up
            if inst.state == AlarmState.NORMAL:
                self._remove_instance(inst)

            await self._notify(event)
            return True

    async def trigger_alarm(
        self,
        *,
        name: str,
        tag_path: str = "",
        priority: str = "MEDIUM",
        value: Any = None,
        setpoint: Any = None,
        description: str = "",
        area: str = "",
        equipment_id: str = "",
        alarm_type: AlarmType = AlarmType.CUSTOM,
    ) -> str:
        """Trigger a custom alarm. Returns the alarm_id."""
        async with self._lock:
            return await self._trigger_internal(
                name=name,
                tag_path=tag_path,
                priority=AlarmPriority(priority),
                value=value,
                setpoint=setpoint,
                description=description,
                area=area,
                equipment_id=equipment_id,
                alarm_type=alarm_type,
            )

    async def clear_alarm(self, alarm_id: str) -> bool:
        """Clear an alarm (process condition returned to normal)."""
        async with self._lock:
            inst = self._instances.get(alarm_id)
            if inst is None:
                return False

            try:
                result = self._sm.transition(inst, AlarmAction.CLEAR)
            except InvalidTransition:
                return False

            self._total_cleared += 1
            event = self._make_event(inst, result)
            self._record_event(event)

            if inst.state == AlarmState.NORMAL:
                self._remove_instance(inst)

            await self._notify(event)
            return True

    async def shelve_alarm(
        self,
        alarm_id: str,
        *,
        duration_minutes: int = 60,
        reason: str = "",
    ) -> bool:
        """Shelve an alarm for maintenance."""
        async with self._lock:
            inst = self._instances.get(alarm_id)
            if inst is None:
                return False

            try:
                result = self._sm.transition(inst, AlarmAction.SHELVE)
            except InvalidTransition:
                return False

            inst.shelve_reason = reason
            inst.shelved_until = datetime.now(timezone.utc)  # Simplified — real impl uses timedelta
            event = self._make_event(inst, result, detail=f"shelved for {duration_minutes}m: {reason}")
            self._record_event(event)
            await self._notify(event)
            return True

    async def unshelve_alarm(self, alarm_id: str) -> bool:
        """Unshelve a previously shelved alarm."""
        async with self._lock:
            inst = self._instances.get(alarm_id)
            if inst is None:
                return False

            try:
                result = self._sm.transition(inst, AlarmAction.UNSHELVE)
            except InvalidTransition:
                return False

            inst.shelved_until = None
            inst.shelve_reason = ""
            event = self._make_event(inst, result)
            self._record_event(event)

            if inst.state == AlarmState.NORMAL:
                self._remove_instance(inst)

            await self._notify(event)
            return True

    async def suppress_alarm(self, alarm_id: str, *, reason: str = "") -> bool:
        """Suppress an alarm (flood control or programmatic)."""
        async with self._lock:
            inst = self._instances.get(alarm_id)
            if inst is None:
                return False

            try:
                result = self._sm.transition(inst, AlarmAction.SUPPRESS)
            except InvalidTransition:
                return False

            inst.suppress_reason = reason
            event = self._make_event(inst, result, detail=f"suppressed: {reason}")
            self._record_event(event)
            await self._notify(event)
            return True

    async def disable_alarm(self, alarm_id: str) -> bool:
        """Take alarm out of service."""
        async with self._lock:
            inst = self._instances.get(alarm_id)
            if inst is None:
                return False

            try:
                result = self._sm.transition(inst, AlarmAction.DISABLE)
            except InvalidTransition:
                return False

            event = self._make_event(inst, result, detail="out of service")
            self._record_event(event)
            await self._notify(event)
            return True

    async def enable_alarm(self, alarm_id: str) -> bool:
        """Return alarm to service."""
        async with self._lock:
            inst = self._instances.get(alarm_id)
            if inst is None:
                return False

            try:
                result = self._sm.transition(inst, AlarmAction.ENABLE)
            except InvalidTransition:
                return False

            event = self._make_event(inst, result, detail="returned to service")
            self._record_event(event)

            if inst.state == AlarmState.NORMAL:
                self._remove_instance(inst)

            await self._notify(event)
            return True

    async def reset_alarm(self, alarm_id: str, *, operator: str = "") -> bool:
        """Force-reset an alarm to NORMAL (admin override)."""
        async with self._lock:
            inst = self._instances.get(alarm_id)
            if inst is None:
                return False

            try:
                result = self._sm.transition(inst, AlarmAction.RESET)
            except InvalidTransition:
                return False

            event = self._make_event(inst, result, operator=operator, detail="admin reset")
            self._record_event(event)
            self._remove_instance(inst)
            await self._notify(event)
            return True

    async def get_alarm_history(
        self,
        *,
        start: str | None = None,
        end: str | None = None,
        area: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Query the event journal."""
        results: list[dict[str, Any]] = []

        for ev in reversed(self._journal):
            if area and ev.area != area:
                continue
            if start and ev.timestamp.isoformat() < start:
                continue
            if end and ev.timestamp.isoformat() > end:
                continue
            results.append(ev.to_dict())
            if len(results) >= limit:
                break

        return results

    # ------------------------------------------------------------------
    # Tag value processing (called by alarm detector)
    # ------------------------------------------------------------------

    async def process_tag_value(
        self, tag_path: str, value: Any, quality: str = "GOOD"
    ) -> list[AlarmEvent]:
        """Evaluate a tag value against its alarm configuration.

        Called by the AlarmDetector when a new tag value arrives.
        Returns a list of alarm events generated.
        """
        config = self._configs.get(tag_path)
        if config is None or not config.enabled:
            return []

        events: list[AlarmEvent] = []

        async with self._lock:
            for threshold in config.thresholds:
                evt = await self._evaluate_threshold(
                    config, threshold, value, quality
                )
                if evt is not None:
                    events.append(evt)

        return events

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def get_stats(self) -> dict[str, Any]:
        """Engine statistics."""
        area_counts: dict[str, int] = defaultdict(int)
        for inst in self._instances.values():
            if inst.state != AlarmState.NORMAL:
                area_counts[inst.area or "(none)"] += 1

        return {
            "active_alarms": len(self._instances),
            "total_triggered": self._total_triggered,
            "total_acknowledged": self._total_acknowledged,
            "total_cleared": self._total_cleared,
            "journal_size": len(self._journal),
            "configs_registered": len(self._configs),
            "active_per_area": dict(area_counts),
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    async def _trigger_internal(
        self,
        *,
        name: str,
        tag_path: str,
        priority: AlarmPriority,
        value: Any,
        setpoint: Any,
        description: str,
        area: str,
        equipment_id: str,
        alarm_type: AlarmType,
    ) -> str:
        """Create or re-trigger an alarm instance. Must hold self._lock."""
        # Check for existing alarm on this tag+type (dedup)
        dedup_key = f"{tag_path}:{alarm_type.value}"
        existing_id = self._tag_alarm_index.get(dedup_key)
        if existing_id and existing_id in self._instances:
            inst = self._instances[existing_id]
            if inst.state in (AlarmState.CLEAR_UNACK, AlarmState.NORMAL):
                # Re-trigger
                try:
                    result = self._sm.transition(inst, AlarmAction.TRIGGER)
                    inst.value = value
                    inst.timestamp = datetime.now(timezone.utc)
                    self._total_triggered += 1
                    event = self._make_event(inst, result)
                    self._record_event(event)
                    await self._notify(event)
                    return inst.alarm_id
                except InvalidTransition:
                    pass
            elif inst.state in (AlarmState.ACTIVE_UNACK, AlarmState.ACTIVE_ACK):
                # Already active — update value but don't re-trigger
                inst.value = value
                return inst.alarm_id

        # Flood check
        if not self._flood_check(area):
            logger.warning("Alarm flood suppression: area=%s at max capacity", area)
            return ""

        # New alarm instance
        inst = AlarmInstance(
            name=name,
            alarm_type=alarm_type,
            state=AlarmState.NORMAL,
            priority=priority,
            tag_path=tag_path,
            value=value,
            setpoint=setpoint,
            area=area,
            equipment_id=equipment_id,
            description=description,
        )

        result = self._sm.transition(inst, AlarmAction.TRIGGER)
        self._instances[inst.alarm_id] = inst
        self._tag_alarm_index[dedup_key] = inst.alarm_id
        self._total_triggered += 1

        event = self._make_event(inst, result)
        self._record_event(event)
        await self._notify(event)
        return inst.alarm_id

    async def _evaluate_threshold(
        self,
        config: AlarmConfig,
        threshold: ThresholdConfig,
        value: Any,
        quality: str,
    ) -> AlarmEvent | None:
        """Evaluate a single threshold. Must hold self._lock.

        Returns the generated event if a state change occurred, else None.
        """
        # Quality alarms
        if threshold.alarm_type == AlarmType.QUALITY:
            if quality != "GOOD":
                alarm_id = await self._trigger_internal(
                    name=f"{config.tag_path}:QUALITY",
                    tag_path=config.tag_path,
                    priority=threshold.priority,
                    value=quality,
                    setpoint="GOOD",
                    description=threshold.description or f"Quality degraded to {quality}",
                    area=config.area,
                    equipment_id=config.equipment_id,
                    alarm_type=AlarmType.QUALITY,
                )
                if alarm_id:
                    return self._journal[-1] if self._journal else None
            else:
                # Quality restored — try to clear
                return await self._try_clear_by_type(config.tag_path, AlarmType.QUALITY)
            return None

        # Numeric thresholds require float-convertible value
        try:
            fval = float(value)
        except (TypeError, ValueError):
            return None

        sp = threshold.setpoint
        db = threshold.deadband
        triggered = False

        if threshold.alarm_type in (AlarmType.HI, AlarmType.HIHI):
            triggered = fval >= sp
            # Check deadband for clear
            clear_val = sp - db
            clear_condition = fval < clear_val
        elif threshold.alarm_type in (AlarmType.LO, AlarmType.LOLO):
            triggered = fval <= sp
            clear_val = sp + db
            clear_condition = fval > clear_val
        elif threshold.alarm_type == AlarmType.DIGITAL:
            triggered = bool(value)
            clear_condition = not bool(value)
        else:
            return None

        if triggered:
            alarm_id = await self._trigger_internal(
                name=f"{config.tag_path}:{threshold.alarm_type.value}",
                tag_path=config.tag_path,
                priority=threshold.priority,
                value=value,
                setpoint=sp,
                description=threshold.description or f"{threshold.alarm_type.value} alarm",
                area=config.area,
                equipment_id=config.equipment_id,
                alarm_type=threshold.alarm_type,
            )
            if alarm_id:
                return self._journal[-1] if self._journal else None
        elif clear_condition:
            return await self._try_clear_by_type(config.tag_path, threshold.alarm_type)

        return None

    async def _try_clear_by_type(
        self, tag_path: str, alarm_type: AlarmType
    ) -> AlarmEvent | None:
        """Try to clear an alarm by tag_path and type. Must hold self._lock."""
        dedup_key = f"{tag_path}:{alarm_type.value}"
        alarm_id = self._tag_alarm_index.get(dedup_key)
        if not alarm_id or alarm_id not in self._instances:
            return None

        inst = self._instances[alarm_id]
        try:
            result = self._sm.transition(inst, AlarmAction.CLEAR)
        except InvalidTransition:
            return None

        self._total_cleared += 1
        event = self._make_event(inst, result)
        self._record_event(event)

        if inst.state == AlarmState.NORMAL:
            self._remove_instance(inst)

        await self._notify(event)
        return event

    def _flood_check(self, area: str) -> bool:
        """Return True if area has capacity for another alarm."""
        if not area:
            return True
        count = sum(
            1
            for inst in self._instances.values()
            if inst.area == area and inst.state != AlarmState.NORMAL
        )
        return count < self._max_active_per_area

    def _remove_instance(self, inst: AlarmInstance) -> None:
        """Remove a NORMAL alarm from tracking."""
        self._instances.pop(inst.alarm_id, None)
        dedup_key = f"{inst.tag_path}:{inst.alarm_type.value}"
        if self._tag_alarm_index.get(dedup_key) == inst.alarm_id:
            self._tag_alarm_index.pop(dedup_key, None)

    def _make_event(
        self,
        inst: AlarmInstance,
        result: TransitionResult,
        *,
        operator: str = "",
        detail: str = "",
    ) -> AlarmEvent:
        """Build a journal event from an instance + transition result."""
        return AlarmEvent(
            alarm_id=inst.alarm_id,
            name=inst.name,
            alarm_type=inst.alarm_type.value,
            previous_state=result.previous_state.value,
            new_state=result.new_state.value,
            action=result.action.value,
            priority=inst.priority.value,
            tag_path=inst.tag_path,
            value=inst.value,
            setpoint=inst.setpoint,
            area=inst.area,
            equipment_id=inst.equipment_id,
            operator=operator,
            detail=detail,
        )

    def _record_event(self, event: AlarmEvent) -> None:
        """Append event to journal (bounded deque handles eviction)."""
        self._journal.append(event)

    async def _notify(self, event: AlarmEvent) -> None:
        """Notify all registered listeners of a state change."""
        for listener in self._listeners:
            try:
                await listener(event)
            except Exception:
                logger.exception("Alarm listener error")
