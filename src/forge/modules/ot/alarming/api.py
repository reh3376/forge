"""Alarm REST API — CRUD for alarm config, active/historical queries, actions.

Provides the HTTP interface contract for the alarm engine.
Actual HTTP framework wiring (FastAPI routes) happens at the module level.
This module defines the request/response models and handler logic.

Endpoints:
    GET    /alarms/active         — Query active alarms (filter by area, priority)
    GET    /alarms/history        — Query alarm event journal
    GET    /alarms/config         — List all alarm configurations
    GET    /alarms/config/{path}  — Get alarm config for a tag
    POST   /alarms/config         — Register/update alarm configuration
    DELETE /alarms/config/{path}  — Remove alarm configuration
    POST   /alarms/{id}/ack       — Acknowledge an alarm
    POST   /alarms/{id}/shelve    — Shelve an alarm
    POST   /alarms/{id}/unshelve  — Unshelve an alarm
    POST   /alarms/{id}/suppress  — Suppress an alarm
    POST   /alarms/{id}/reset     — Reset an alarm (admin)
    GET    /alarms/stats          — Engine statistics
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, asdict
from typing import Any

from forge.modules.ot.alarming.models import (
    AlarmConfig,
    AlarmPriority,
    AlarmType,
    ThresholdConfig,
)
from forge.modules.ot.alarming.engine import AlarmEngine

logger = logging.getLogger("forge.alarm.api")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


@dataclass
class AlarmConfigRequest:
    """Request to register/update alarm configuration."""

    tag_path: str
    area: str = ""
    equipment_id: str = ""
    enabled: bool = True
    thresholds: list[dict[str, Any]] | None = None


@dataclass
class AckRequest:
    operator: str = ""


@dataclass
class ShelveRequest:
    duration_minutes: int = 60
    reason: str = ""


@dataclass
class ApiResponse:
    success: bool
    data: Any = None
    error: str | None = None

    def to_dict(self) -> dict:
        d = {"success": self.success}
        if self.data is not None:
            d["data"] = self.data
        if self.error is not None:
            d["error"] = self.error
        return d


# ---------------------------------------------------------------------------
# API Handler
# ---------------------------------------------------------------------------


class AlarmApiHandler:
    """Stateless handler that bridges HTTP requests to the AlarmEngine.

    This class does not depend on any HTTP framework — it accepts
    and returns plain Python dicts.  The framework adapter (FastAPI,
    Flask, etc.) converts HTTP ↔ dict.
    """

    def __init__(self, engine: AlarmEngine) -> None:
        self._engine = engine

    async def get_active(
        self,
        area: str | None = None,
        priority: str | None = None,
        limit: int = 100,
    ) -> dict:
        alarms = await self._engine.get_active_alarms(
            area=area, priority=priority, limit=limit
        )
        return ApiResponse(success=True, data=alarms).to_dict()

    async def get_history(
        self,
        start: str | None = None,
        end: str | None = None,
        area: str | None = None,
        limit: int = 100,
    ) -> dict:
        events = await self._engine.get_alarm_history(
            start=start, end=end, area=area, limit=limit
        )
        return ApiResponse(success=True, data=events).to_dict()

    async def get_all_configs(self) -> dict:
        configs = await self._engine.get_all_configs()
        return ApiResponse(
            success=True,
            data=[_config_to_dict(c) for c in configs],
        ).to_dict()

    async def get_config(self, tag_path: str) -> dict:
        config = await self._engine.get_config(tag_path)
        if config is None:
            return ApiResponse(success=False, error="Config not found").to_dict()
        return ApiResponse(success=True, data=_config_to_dict(config)).to_dict()

    async def register_config(self, request: dict) -> dict:
        try:
            config = _dict_to_config(request)
        except (KeyError, ValueError) as e:
            return ApiResponse(success=False, error=str(e)).to_dict()

        await self._engine.register_config(config)
        return ApiResponse(success=True, data={"tag_path": config.tag_path}).to_dict()

    async def delete_config(self, tag_path: str) -> dict:
        found = await self._engine.unregister_config(tag_path)
        if not found:
            return ApiResponse(success=False, error="Config not found").to_dict()
        return ApiResponse(success=True).to_dict()

    async def acknowledge(self, alarm_id: str, operator: str = "") -> dict:
        result = await self._engine.acknowledge_alarm(alarm_id, operator=operator)
        if not result:
            return ApiResponse(success=False, error="Alarm not found or cannot be acknowledged").to_dict()
        return ApiResponse(success=True).to_dict()

    async def shelve(
        self, alarm_id: str, duration_minutes: int = 60, reason: str = ""
    ) -> dict:
        result = await self._engine.shelve_alarm(
            alarm_id, duration_minutes=duration_minutes, reason=reason
        )
        if not result:
            return ApiResponse(success=False, error="Alarm not found or cannot be shelved").to_dict()
        return ApiResponse(success=True).to_dict()

    async def unshelve(self, alarm_id: str) -> dict:
        result = await self._engine.unshelve_alarm(alarm_id)
        if not result:
            return ApiResponse(success=False, error="Alarm not found or cannot be unshelved").to_dict()
        return ApiResponse(success=True).to_dict()

    async def suppress(self, alarm_id: str, reason: str = "") -> dict:
        result = await self._engine.suppress_alarm(alarm_id, reason=reason)
        if not result:
            return ApiResponse(success=False, error="Alarm not found or cannot be suppressed").to_dict()
        return ApiResponse(success=True).to_dict()

    async def reset(self, alarm_id: str, operator: str = "") -> dict:
        result = await self._engine.reset_alarm(alarm_id, operator=operator)
        if not result:
            return ApiResponse(success=False, error="Alarm not found or cannot be reset").to_dict()
        return ApiResponse(success=True).to_dict()

    async def get_stats(self) -> dict:
        stats = self._engine.get_stats()
        return ApiResponse(success=True, data=stats).to_dict()


# ---------------------------------------------------------------------------
# Conversion helpers
# ---------------------------------------------------------------------------


def _config_to_dict(config: AlarmConfig) -> dict:
    return {
        "tag_path": config.tag_path,
        "area": config.area,
        "equipment_id": config.equipment_id,
        "enabled": config.enabled,
        "thresholds": [
            {
                "alarm_type": t.alarm_type.value,
                "setpoint": t.setpoint,
                "deadband": t.deadband,
                "delay_seconds": t.delay_seconds,
                "priority": t.priority.value,
                "description": t.description,
            }
            for t in config.thresholds
        ],
    }


def _dict_to_config(d: dict) -> AlarmConfig:
    thresholds = []
    for t in d.get("thresholds", []):
        thresholds.append(
            ThresholdConfig(
                alarm_type=AlarmType(t["alarm_type"]),
                setpoint=float(t["setpoint"]),
                deadband=float(t.get("deadband", 0.0)),
                delay_seconds=float(t.get("delay_seconds", 0.0)),
                priority=AlarmPriority(t.get("priority", "MEDIUM")),
                description=t.get("description", ""),
            )
        )

    return AlarmConfig(
        tag_path=d["tag_path"],
        area=d.get("area", ""),
        equipment_id=d.get("equipment_id", ""),
        enabled=d.get("enabled", True),
        thresholds=thresholds,
    )
