"""Acquisition engine — orchestrates N tag providers concurrently.

The AcquisitionEngine is the top-level coordinator for all data flowing
into the tag system.  It manages:

    1. Multiple OpcUaProviders (one per PLC connection)
    2. One MemoryProvider (shared across all Memory tags)
    3. One ExpressionProvider (wires into TagEngine)
    4. Future: QueryProvider, EventProvider, VirtualProvider

Startup order matters:
    1. MemoryProvider first (initializes default values that expressions may read)
    2. OpcUaProviders next (starts PLC subscriptions)
    3. ExpressionProvider last (runs initial evaluation after sources have values)

Shutdown is reverse order.

Design decisions:
    D1: Providers are registered by name.  No two providers can share a name.
    D2: Health aggregation: if ANY provider is FAILED, the engine reports degraded.
    D3: Provider failures are isolated — one PLC going down doesn't stop others.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from forge.modules.ot.tag_engine.providers.base import BaseProvider, ProviderState

logger = logging.getLogger(__name__)


class AcquisitionEngine:
    """Orchestrates N tag providers with ordered startup/shutdown."""

    def __init__(self) -> None:
        self._providers: dict[str, BaseProvider] = {}
        self._start_order: list[str] = []
        self._running = False

    @property
    def running(self) -> bool:
        return self._running

    @property
    def provider_count(self) -> int:
        return len(self._providers)

    def add_provider(self, provider: BaseProvider, *, priority: int = 50) -> None:
        """Register a provider.

        Priority determines startup order (lower = earlier):
            10 — MemoryProvider (defaults must exist before expressions read them)
            50 — OpcUaProviders (PLC subscriptions)
            90 — ExpressionProvider (needs source values to exist)

        Raises ValueError if name is already registered.
        """
        if provider.name in self._providers:
            raise ValueError(f"Provider already registered: {provider.name}")
        self._providers[provider.name] = provider
        # Rebuild start order based on priority
        # Store priority as a tuple for sorting
        if not hasattr(self, "_priorities"):
            self._priorities: dict[str, int] = {}
        self._priorities[provider.name] = priority
        self._start_order = sorted(
            self._providers.keys(),
            key=lambda n: self._priorities.get(n, 50),
        )
        logger.debug(
            "Added provider %s (priority=%d, total=%d)",
            provider.name,
            priority,
            len(self._providers),
        )

    def get_provider(self, name: str) -> BaseProvider | None:
        """Get a provider by name."""
        return self._providers.get(name)

    async def start(self) -> None:
        """Start all providers in priority order.

        Provider failures are logged but don't prevent other providers
        from starting (fault isolation).
        """
        if self._running:
            return
        self._running = True
        logger.info(
            "AcquisitionEngine starting %d providers: %s",
            len(self._start_order),
            self._start_order,
        )

        for name in self._start_order:
            provider = self._providers[name]
            try:
                await provider.start()
            except Exception:
                logger.exception("Provider %s failed to start", name)
                # Don't re-raise — other providers should still start

        running = sum(
            1 for p in self._providers.values() if p.state == ProviderState.RUNNING
        )
        logger.info(
            "AcquisitionEngine started: %d/%d providers running",
            running,
            len(self._providers),
        )

    async def stop(self) -> None:
        """Stop all providers in reverse priority order."""
        if not self._running:
            return
        self._running = False
        logger.info("AcquisitionEngine stopping")

        # Stop in reverse order
        for name in reversed(self._start_order):
            provider = self._providers[name]
            try:
                await provider.stop()
            except Exception:
                logger.exception("Error stopping provider %s", name)

        logger.info("AcquisitionEngine stopped")

    async def health(self) -> dict[str, Any]:
        """Aggregate health from all providers."""
        provider_health = {}
        for name, provider in self._providers.items():
            provider_health[name] = await provider.health()

        states = [p.state for p in self._providers.values()]
        if all(s == ProviderState.RUNNING for s in states):
            overall = "healthy"
        elif any(s == ProviderState.FAILED for s in states):
            overall = "degraded"
        elif all(s == ProviderState.STOPPED for s in states):
            overall = "stopped"
        else:
            overall = "partial"

        return {
            "status": overall,
            "running": self._running,
            "providers": provider_health,
            "total_providers": len(self._providers),
            "running_providers": sum(
                1 for s in states if s == ProviderState.RUNNING
            ),
        }

    async def restart_provider(self, name: str) -> bool:
        """Restart a single provider (stop + start).

        Returns True if the provider was found and restart was attempted.
        """
        provider = self._providers.get(name)
        if provider is None:
            return False
        logger.info("Restarting provider %s", name)
        await provider.stop()
        await provider.start()
        return True
