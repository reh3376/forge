"""Base provider — lifecycle contract for all tag data sources.

Every provider implements:
    start()  — begin acquiring data (subscribe, connect, poll)
    stop()   — graceful shutdown (unsubscribe, disconnect, flush)
    health() — return current operational state

Providers do NOT evaluate tags — that's the TagEngine's job.
Providers push raw values into the TagRegistry via update_value().
"""

from __future__ import annotations

import enum
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

from forge.modules.ot.tag_engine.registry import TagRegistry

logger = logging.getLogger(__name__)


class ProviderState(str, enum.Enum):
    """Operational state of a tag provider."""

    IDLE = "idle"           # Constructed but not started
    STARTING = "starting"   # In the process of connecting/subscribing
    RUNNING = "running"     # Actively providing data
    STOPPING = "stopping"   # Graceful shutdown in progress
    STOPPED = "stopped"     # Clean shutdown complete
    FAILED = "failed"       # Unrecoverable error


class BaseProvider(ABC):
    """Abstract base for all tag providers.

    Subclasses must implement:
        _start()  — provider-specific startup logic
        _stop()   — provider-specific shutdown logic
        _health() — return a dict of health metrics
    """

    def __init__(
        self,
        name: str,
        registry: TagRegistry,
    ) -> None:
        self.name = name
        self._registry = registry
        self._state = ProviderState.IDLE
        self._started_at: datetime | None = None
        self._error: str | None = None

    @property
    def state(self) -> ProviderState:
        return self._state

    @property
    def is_running(self) -> bool:
        return self._state == ProviderState.RUNNING

    async def start(self) -> None:
        """Start the provider.  Idempotent — does nothing if already running."""
        if self._state == ProviderState.RUNNING:
            return
        self._state = ProviderState.STARTING
        self._error = None
        try:
            await self._start()
            self._state = ProviderState.RUNNING
            self._started_at = datetime.now(timezone.utc)
            logger.info("Provider %s started", self.name)
        except Exception as e:
            self._state = ProviderState.FAILED
            self._error = str(e)
            logger.exception("Provider %s failed to start", self.name)
            raise

    async def stop(self) -> None:
        """Stop the provider gracefully.  Idempotent."""
        if self._state in (ProviderState.STOPPED, ProviderState.IDLE):
            return
        self._state = ProviderState.STOPPING
        try:
            await self._stop()
        except Exception:
            logger.exception("Error stopping provider %s", self.name)
        finally:
            self._state = ProviderState.STOPPED
            logger.info("Provider %s stopped", self.name)

    async def health(self) -> dict[str, Any]:
        """Return health metrics for this provider."""
        base = {
            "name": self.name,
            "state": self._state.value,
            "started_at": self._started_at.isoformat() if self._started_at else None,
            "error": self._error,
        }
        if self._state == ProviderState.RUNNING:
            base.update(await self._health())
        return base

    @abstractmethod
    async def _start(self) -> None:
        """Provider-specific startup logic."""

    @abstractmethod
    async def _stop(self) -> None:
        """Provider-specific shutdown logic."""

    @abstractmethod
    async def _health(self) -> dict[str, Any]:
        """Provider-specific health metrics."""
