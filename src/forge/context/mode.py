"""Operating mode detector — resolves current equipment mode.

Provides ModeStore for explicit mode state tracking (set by adapters
or control systems) and simple inference when no explicit state exists.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from copy import deepcopy

from forge.context.models import ModeState, OperatingMode


class ModeStore(ABC):
    """Abstract storage for equipment operating mode state."""

    @abstractmethod
    async def set_mode(self, state: ModeState) -> None: ...

    @abstractmethod
    async def get_mode(self, equipment_id: str) -> ModeState | None: ...

    @abstractmethod
    async def list_all(self) -> list[ModeState]: ...


class InMemoryModeStore(ModeStore):
    """In-memory mode store for development and testing."""

    def __init__(self) -> None:
        self._modes: dict[str, ModeState] = {}

    async def set_mode(self, state: ModeState) -> None:
        self._modes[state.equipment_id] = state

    async def get_mode(self, equipment_id: str) -> ModeState | None:
        entry = self._modes.get(equipment_id)
        return deepcopy(entry) if entry else None

    async def list_all(self) -> list[ModeState]:
        return [deepcopy(m) for m in self._modes.values()]


def infer_mode(
    batch_active: bool,
    equipment_status: str = "active",
) -> OperatingMode:
    """Simple mode inference when no explicit state is available.

    Rules:
        - equipment in maintenance → MAINTENANCE
        - active batch on equipment → PRODUCTION
        - no active batch → IDLE
    """
    if equipment_status == "maintenance":
        return OperatingMode.MAINTENANCE
    if batch_active:
        return OperatingMode.PRODUCTION
    return OperatingMode.IDLE
