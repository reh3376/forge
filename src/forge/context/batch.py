"""Batch/lot tracker — manages active production runs.

Provides BatchStore ABC with InMemory implementation for tracking
active batches, looking up by equipment, and managing lifecycle.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from copy import deepcopy
from datetime import UTC, datetime

from forge.context.models import Batch, BatchStatus


class BatchStore(ABC):
    """Abstract storage for batch/lot tracking."""

    @abstractmethod
    async def save(self, batch: Batch) -> None: ...

    @abstractmethod
    async def get(self, batch_id: str) -> Batch | None: ...

    @abstractmethod
    async def get_active_for_equipment(self, equipment_id: str) -> Batch | None:
        """Get the currently active batch on an equipment."""
        ...

    @abstractmethod
    async def list_active(self) -> list[Batch]: ...

    @abstractmethod
    async def complete(self, batch_id: str) -> bool:
        """Mark a batch as completed with current timestamp."""
        ...

    @abstractmethod
    async def delete(self, batch_id: str) -> bool: ...


class InMemoryBatchStore(BatchStore):
    """In-memory batch store for development and testing."""

    def __init__(self) -> None:
        self._entries: dict[str, Batch] = {}

    async def save(self, batch: Batch) -> None:
        self._entries[batch.batch_id] = batch

    async def get(self, batch_id: str) -> Batch | None:
        entry = self._entries.get(batch_id)
        return deepcopy(entry) if entry else None

    async def get_active_for_equipment(self, equipment_id: str) -> Batch | None:
        for b in self._entries.values():
            if b.equipment_id == equipment_id and b.status == BatchStatus.ACTIVE:
                return deepcopy(b)
        return None

    async def list_active(self) -> list[Batch]:
        return [
            deepcopy(b)
            for b in self._entries.values()
            if b.status == BatchStatus.ACTIVE
        ]

    async def complete(self, batch_id: str) -> bool:
        batch = self._entries.get(batch_id)
        if batch is None:
            return False
        batch.status = BatchStatus.COMPLETED
        batch.ended_at = datetime.now(UTC)
        return True

    async def delete(self, batch_id: str) -> bool:
        return self._entries.pop(batch_id, None) is not None
