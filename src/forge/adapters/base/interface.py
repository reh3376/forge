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
import logging
from typing import TYPE_CHECKING, Any

from forge.core.clock import TimeGovernanceConflictError
from forge.core.models.adapter import (
    AdapterHealth,
    AdapterManifest,
    AdapterState,
)

if TYPE_CHECKING:
    from collections.abc import AsyncIterator
    from datetime import datetime

    from forge.core.models.contextual_record import ContextualRecord

logger = logging.getLogger(__name__)

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
        self._refusals: dict[str, int] = {}
        self._last_refusal: str | None = None

    @property
    def adapter_id(self) -> str:
        return self.manifest.adapter_id

    @property
    def state(self) -> AdapterState:
        return self._state

    @property
    def source_timestamp_origin(self) -> str | None:
        """The origin declared for the clock that stamps this adapter's values.

        The FACTS ``time_governance`` section on the manifest is the governed declaration
        (one-clock record P-4, FB-090); the config model's ``source_timestamp_origin`` is
        the fallback for a manifest without it. None until declared. A value without a
        source stamp is refused unless the origin is ``forge`` (FB-088).
        """
        governance = getattr(self.manifest, "time_governance", None)
        if governance is not None:
            return governance.source_timestamp_origin
        return getattr(getattr(self, "_config", None), "source_timestamp_origin", None)

    def check_time_governance(self) -> None:
        """Refuse connection parameters that contradict the FACTS declaration (FB-090).

        ``configure`` calls it once the config model is built. A ``source_timestamp_origin``
        parameter that differs from the manifest's ``time_governance`` declaration is a
        refusal like any other: counted on the health under ``time_governance_conflict``,
        logged, and raised so the configure call fails loudly instead of letting one
        declaration silently win. A parameter that repeats the declaration passes; so does
        a manifest without the section, where the parameter stands in until FB-093.
        """
        governance = getattr(self.manifest, "time_governance", None)
        configured = getattr(getattr(self, "_config", None), "source_timestamp_origin", None)
        if governance is None or configured is None:
            return
        if configured == governance.source_timestamp_origin:
            return
        exc = TimeGovernanceConflictError(
            adapter_id=self.adapter_id,
            declared=governance.source_timestamp_origin,
            configured=configured,
        )
        self.refuse(exc)
        raise exc

    @abc.abstractmethod
    async def collect(self) -> AsyncIterator[ContextualRecord]:
        """Yield contextual records from the source system.

        This is the primary data ingestion method. The hub calls
        ``collect()`` on a schedule or in response to a trigger.
        Each yielded record is validated against the adapter's
        data contract before entering the governance pipeline.
        """
        yield  # pragma: no cover — abstract async generator

    def refuse(self, exc: Exception, *, cause: str | None = None) -> None:
        """Count a value this adapter refused rather than invent something about it.

        A refusal is never silent (owner, 2026-11-03). It counts on ``records_failed``
        and under its cause in ``refusals``; its message becomes ``last_refusal`` and
        the health's ``error_message``; the adapter goes DEGRADED while it is HEALTHY;
        the first refusal per cause is logged as a warning, every one counts on the
        ``forge.ingest.refused`` metric. ``cause`` defaults to the exception's ``cause``
        attribute (``SourceStampMissingError.cause``, FB-088). A restart returns the adapter
        to HEALTHY; the probe-based recovery is FB-093.
        """
        from forge.core import telemetry

        cause = cause or getattr(exc, "cause", None) or type(exc).__name__
        first = cause not in self._refusals
        self._refusals[cause] = self._refusals.get(cause, 0) + 1
        self._records_failed += 1
        self._last_refusal = str(exc)
        if self._state == AdapterState.HEALTHY:
            self._state = AdapterState.DEGRADED
        telemetry.record_refusal(self.adapter_id, cause)
        log = logger.warning if first else logger.debug
        log("%s refused a value (%s): %s", self.adapter_id, cause, exc)

    def refusal_health(self, error_message: str | None = None) -> dict[str, Any]:
        """The refusal fields of this adapter's ``AdapterHealth`` (``**self.refusal_health()``).

        ``error_message`` is the adapter's own message when it has one, else the last
        refusal, so the cause travels on the wire field the health contract already has.
        """
        return {
            "refusals": dict(self._refusals),
            "last_refusal": self._last_refusal,
            "error_message": error_message or self._last_refusal,
        }

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
