"""Abstract adapter interface — the contract every spoke must fulfil.

Forge knows nothing about adapter internals. It only knows what the
adapter's manifest declares and that the adapter conforms to this
interface. FACTS specs govern what conformance means.

Capability mixins (SubscriptionProvider, WritableAdapter, BackfillProvider,
DiscoveryProvider) are optional — an adapter implements only the ones
it declares in its manifest's capabilities.
"""

from __future__ import annotations

import abc
from typing import TYPE_CHECKING, Any

from forge.core.models.adapter import (
    AdapterHealth,
    AdapterManifest,
    AdapterState,
)

if TYPE_CHECKING:
    from collections.abc import AsyncIterator
    from datetime import datetime

    from forge.core.models.contextual_record import ContextualRecord

# ---------------------------------------------------------------------------
# Lifecycle mixin
# ---------------------------------------------------------------------------

class AdapterLifecycle(abc.ABC):
    """Lifecycle hooks the hub calls on every adapter."""

    @abc.abstractmethod
    async def configure(self, params: dict[str, Any]) -> None:
        """Receive connection parameters (after validation against manifest).

        Secrets are decrypted by the hub before being passed here.
        The adapter must NOT log or persist secret values.
        """

    @abc.abstractmethod
    async def start(self) -> None:
        """Begin active operation (connect, subscribe, poll)."""

    @abc.abstractmethod
    async def stop(self) -> None:
        """Graceful shutdown — flush buffers, close connections."""

    @abc.abstractmethod
    async def health(self) -> AdapterHealth:
        """Return current health status.

        Called periodically by the hub at the interval declared in
        the manifest's health_check_interval_ms.
        """


# ---------------------------------------------------------------------------
# Core read interface — every adapter must implement this
# ---------------------------------------------------------------------------

class AdapterBase(AdapterLifecycle):
    """Base class for all Forge adapters.

    Subclasses MUST:
      1. Set ``manifest`` as a class or instance attribute.
      2. Implement all abstract methods from AdapterLifecycle.
      3. Implement ``collect()`` to yield ContextualRecords.

    Subclasses MAY additionally implement one or more capability mixins.
    """

    manifest: AdapterManifest

    def __init__(self) -> None:
        self._state: AdapterState = AdapterState.REGISTERED
        self._records_collected: int = 0
        self._records_failed: int = 0

    @property
    def adapter_id(self) -> str:
        return self.manifest.adapter_id

    @property
    def state(self) -> AdapterState:
        return self._state

    @abc.abstractmethod
    async def collect(self) -> AsyncIterator[ContextualRecord]:
        """Yield contextual records from the source system.

        This is the primary data ingestion method. The hub calls
        ``collect()`` on a schedule or in response to a trigger.
        Each yielded record is validated against the adapter's
        data contract before entering the governance pipeline.
        """
        yield  # pragma: no cover — abstract async generator

    async def validate_record(self, record: ContextualRecord) -> bool:
        """Optional pre-send validation hook.

        Default implementation checks that required context fields
        declared in the manifest's data_contract are present.
        Override for adapter-specific validation.
        """
        required = self.manifest.data_contract.context_fields
        ctx = record.context
        for field_name in required:
            if getattr(ctx, field_name, None) is None and field_name not in ctx.extra:
                return False
        return True


# ---------------------------------------------------------------------------
# Capability mixins — implement only what the manifest declares
# ---------------------------------------------------------------------------

class SubscriptionProvider(abc.ABC):
    """Adapter that can push records via subscription/callback."""

    @abc.abstractmethod
    async def subscribe(
        self,
        tags: list[str],
        callback: Any,  # typed as Callable in concrete implementations
    ) -> str:
        """Subscribe to value changes on the listed tags.

        Returns a subscription_id that can be used to unsubscribe.
        """

    @abc.abstractmethod
    async def unsubscribe(self, subscription_id: str) -> None:
        """Cancel an active subscription."""


class WritableAdapter(abc.ABC):
    """Adapter that can write values back to the source system."""

    @abc.abstractmethod
    async def write(
        self,
        tag_path: str,
        value: Any,
        *,
        confirm: bool = True,
    ) -> bool:
        """Write a value to the source system.

        Args:
            tag_path: The target tag/point in the source system.
            value: The value to write (adapter handles type coercion).
            confirm: If True, read back after write to confirm.

        Returns:
            True if the write (and optional confirmation) succeeded.
        """


class BackfillProvider(abc.ABC):
    """Adapter that can retrieve historical data ranges."""

    @abc.abstractmethod
    async def backfill(
        self,
        tags: list[str],
        start: datetime,
        end: datetime,
        *,
        max_records: int | None = None,
    ) -> AsyncIterator[ContextualRecord]:
        """Yield historical records for the given time range.

        Used during initial onboarding and gap recovery.
        """
        yield  # pragma: no cover

    @abc.abstractmethod
    async def get_earliest_timestamp(self, tag: str) -> datetime | None:
        """Return the earliest available timestamp for a tag, or None."""


class DiscoveryProvider(abc.ABC):
    """Adapter that can enumerate available tags/points in the source system."""

    @abc.abstractmethod
    async def discover(self) -> list[dict[str, Any]]:
        """Return a list of available tags/points.

        Each dict should contain at minimum:
          - tag_path: str
          - data_type: str
          - description: str (if available)
          - engineering_units: str (if available)
        """
