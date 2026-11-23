"""PLC connections for the hosted OT module (FB-069).

The control runtime writes recipe setpoints and CIP commands to Standard
tags, and :class:`~forge.modules.ot.control.runtime.RegistryTagIO` routes
those to the ``OpcUaProvider`` that owns the tag's ``connection_name``.
This module builds those providers from the ``connections`` section of
the control configuration and keeps them alive:

* one :class:`~forge.modules.ot.opcua_client.client.OpcUaClient` +
  :class:`~forge.modules.ot.tag_engine.providers.opcua_provider.OpcUaProvider`
  per enabled connection, registered on one ``AcquisitionEngine`` (shared
  with the i3X browse API so PLCs show up as namespaces);
* start-up with fault isolation — a PLC that is down does not stop the
  module, its provider is ``FAILED`` and retried with exponential back-off;
* a supervisor that restarts a provider whose client dropped to
  ``DISCONNECTED``/``FAILED`` and re-subscribes after the client
  reconnected on its own (nothing in the tag engine did either before);
* a clock gate per connection (FB-093, one-clock record P-5): a connection whose clock
  cannot be read, or is outside its tolerance class, for three consecutive probes stops
  delivering (its provider is stopped, no restart loop applies) until three consecutive
  good probes; the refusal is on the status, raised to the listeners and never silent;
* a synchronous :meth:`PlcConnectionManager.status` for the REST status.

``asyncua`` is only imported by the default factories, so a hub without
the ``ot`` extra still starts when no connections are configured.
"""

from __future__ import annotations

import asyncio
import contextlib
import inspect
import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from forge.modules.ot.opcua_client.paths import PathNormalizer
from forge.modules.ot.opcua_client.types import ConnectionState
from forge.modules.ot.tag_engine.providers.acquisition import AcquisitionEngine
from forge.modules.ot.tag_engine.providers.base import ProviderState
from forge_core.clock import (
    CLOCK_OK,
    SERVER_LINK,
    ClockEstimate,
    ClockGate,
    ClockGateTransition,
    ClockOffsetTracker,
    ClockRefusedError,
    ClockSample,
    source_clock_name,
)

if TYPE_CHECKING:
    from forge.modules.ot.control.config import PlcConnectionSpec
    from forge.modules.ot.tag_engine.registry import TagRegistry
    from forge_core.models.adapter import TimeGovernance

logger = logging.getLogger(__name__)

#: ``client_factory(spec)`` → something with the ``OpcUaClient`` surface the
#: provider uses (``connect``, ``disconnect``, ``subscribe``, ``unsubscribe``,
#: ``read``, ``write``, ``health``).
ClientFactory = Callable[["PlcConnectionSpec"], Any]
#: ``provider_factory(name, registry, client, normalizer)`` → a ``BaseProvider``.
ProviderFactory = Callable[[str, "TagRegistry", Any, PathNormalizer], Any]

DEFAULT_RETRY_MAX_SECONDS = 60.0
#: ``Server_ServerStatus_CurrentTime`` — every OPC-UA server has it (FB-070).
LIVENESS_NODE = "i=2258"
#: The shortest clock probe cadence an operator may set at runtime (one-clock record P-2).
MIN_CLOCK_PROBE_INTERVAL_SECONDS = 1.0
#: The class an OT link is held to when neither its spec nor the module's FACTS section
#: declares one (one-clock record P-8: polled values from NTP-synced devices and servers).
DEFAULT_OT_TOLERANCE_CLASS = "T0"
#: ``listener(connection_name, transition)``: called when a connection's clock is refused,
#: refused for another cause, or cleared (FB-093). May be a coroutine function.
ClockStateListener = Callable[[str, ClockGateTransition], Any]


class OpcUaCurrentTimeReader:
    """The OPC UA :class:`~forge_core.clock.ClockReader`: ``ServerStatus.CurrentTime``.

    One read of ``i=2258`` yields T3 between Forge's T1 and T4; it is also the liveness
    probe (FB-070), since a dead session cannot answer it. ``None`` when the server
    answered without a clock value.
    """

    def __init__(self, client: Any, *, now: Callable[[], datetime]) -> None:
        self._client = client
        self._now = now

    async def read_clock(self) -> ClockSample | None:
        sent_at = self._now()
        values = await self._client.read([LIVENESS_NODE])
        received_at = self._now()
        first = values[0] if values else None
        server_time = getattr(first, "value", None)
        if not isinstance(server_time, datetime):
            return None
        if server_time.tzinfo is None:  # OPC UA DateTime is UTC by definition
            server_time = server_time.replace(tzinfo=UTC)
        return ClockSample(sent_at, server_time, received_at, service="CurrentTime")


def default_client_factory(spec: PlcConnectionSpec) -> Any:
    """Build a real ``OpcUaClient`` (imports asyncua)."""
    from forge.modules.ot.opcua_client.client import OpcUaClient
    from forge.modules.ot.opcua_client.security import SecurityConfig
    from forge.modules.ot.opcua_client.types import OpcUaEndpoint

    if spec.security_policy == "None":
        security = SecurityConfig.no_security()
    else:
        security = SecurityConfig.basic256_sha256(
            spec.certificate_path or "",
            spec.private_key_path or "",
            trust_dir=spec.trust_dir,
            server_certificate_path=spec.server_certificate_path,
        )
    endpoint = OpcUaEndpoint(
        url=spec.endpoint,
        name=spec.name,
        security_policy=spec.security_policy,
        certificate_path=spec.certificate_path,
        private_key_path=spec.private_key_path,
        server_certificate_path=spec.server_certificate_path,
        session_timeout_ms=spec.session_timeout_ms,
        request_timeout_ms=spec.request_timeout_ms,
        reconnect_interval_ms=spec.reconnect_interval_ms,
        max_reconnect_attempts=spec.max_reconnect_attempts,
    )
    return OpcUaClient(endpoint, name=spec.name, security=security)


def client_health(client: Any) -> Any:
    """``client.health``, a property on ``OpcUaClient`` and a method on the test doubles."""
    health = getattr(client, "health", None)
    return health() if callable(health) else health


def default_provider_factory(
    name: str, registry: TagRegistry, client: Any, normalizer: PathNormalizer
) -> Any:
    from forge.modules.ot.tag_engine.providers.opcua_provider import OpcUaProvider

    return OpcUaProvider(name=name, registry=registry, client=client, path_normalizer=normalizer)


@dataclass
class _Entry:
    spec: PlcConnectionSpec
    provider: Any
    client: Any
    backoff: float
    #: Fail closed on this connection's clock (FB-093, one-clock record P-5).
    gate: ClockGate
    restarts: int = 0
    failures: int = 0
    last_error: str | None = None
    next_retry_at: datetime | None = None
    last_connection_state: ConnectionState | None = None
    resubscribes: int = 0
    last_probe_at: datetime | None = None
    probes: int = 0
    probe_failures: int = 0
    #: The clock this connection's probe and tap measure (``server:WHK01`` or, for a
    #: PLC-embedded server declared ``device``, ``device:WHK01``), one-clock record P-2.
    clock_id: str = ""
    #: The probe cadence in force: the spec's value until an operator changes it at runtime.
    clock_probe_interval: float = 30.0
    clock_probe_set_by: str | None = None
    clock_probe_set_at: datetime | None = None
    clock_samples: int = 0
    #: Probe answers that carried no clock value; three in a row refuse the connection.
    clock_unreadable: int = 0
    #: Times this connection entered a refused clock state (FB-093).
    clock_refusals: int = 0


class PlcConnectionManager:
    """Own the OPC-UA providers for the configured PLC connections.

    Args:
        specs: Connection specs; disabled ones are skipped.
        registry: The tag registry the providers push values into.
        engine: Shared ``AcquisitionEngine`` (the host passes the one the i3X
            router reports on); a private one is created when omitted.
        site_prefix: First tag-path segment for the ``PathNormalizer``.
        client_factory / provider_factory: Test hooks; the defaults build
            ``OpcUaClient`` / ``OpcUaProvider``.
        poll_interval: Supervisor period in seconds; ``0`` disables the
            background task (``check()`` can still be called).
        retry_max: Cap for the per-connection restart back-off.
        now: Clock, injectable for tests.
        time_governance: The module's FACTS ``time_governance`` section; it gives the
            tolerance class of a connection whose spec declares none (FB-093).
    """

    def __init__(
        self,
        specs: Iterable[PlcConnectionSpec],
        registry: TagRegistry,
        *,
        engine: AcquisitionEngine | None = None,
        site_prefix: str = "WH",
        client_factory: ClientFactory | None = None,
        provider_factory: ProviderFactory | None = None,
        poll_interval: float = 5.0,
        retry_max: float = DEFAULT_RETRY_MAX_SECONDS,
        now: Callable[[], datetime] | None = None,
        offsets: ClockOffsetTracker | None = None,
        time_governance: TimeGovernance | None = None,
    ) -> None:
        self.engine = engine or AcquisitionEngine()
        #: Server-clock offsets from the liveness probe (FB-089).
        self.offsets: ClockOffsetTracker = offsets or ClockOffsetTracker()
        self._registry = registry
        self._poll_interval = poll_interval
        self._retry_max = retry_max
        self._now = now or (lambda: datetime.now(UTC))
        self._entries: dict[str, _Entry] = {}
        self._task: asyncio.Task[None] | None = None
        self._started = False
        self._checks = 0
        self._clock_listeners: list[ClockStateListener] = []
        enabled = [spec for spec in specs if spec.enabled]
        namespace_map = {spec.namespace_index: spec.name for spec in enabled}
        self.normalizer = PathNormalizer(
            site_prefix=site_prefix,
            namespace_map=namespace_map if len(namespace_map) == len(enabled) else {},
            connection_map={spec.name: spec.namespace_index for spec in enabled},
        )
        make_client = client_factory or default_client_factory
        make_provider = provider_factory or default_provider_factory
        for spec in enabled:
            client = make_client(spec)
            provider = make_provider(spec.name, registry, client, self.normalizer)
            self.engine.add_provider(provider, priority=50)
            clock_id = (
                source_clock_name(spec.source_timestamp_origin or "server", spec.name)
                or f"server:{spec.name}"
            )
            tolerance_class = spec.tolerance_class or (
                time_governance.tolerance_class_for(spec.name)
                if time_governance is not None
                else DEFAULT_OT_TOLERANCE_CLASS
            )
            entry = _Entry(
                spec=spec,
                provider=provider,
                client=client,
                backoff=max(spec.reconnect_interval_ms / 1000.0, 0.1),
                gate=ClockGate(clock_id, tolerance_class=tolerance_class),
                clock_id=clock_id,
                clock_probe_interval=spec.clock_probe_interval_seconds,
            )
            self._entries[spec.name] = entry
            # Every response the client receives also measures the server's clock
            # (FB-094 step 2); the samples land in the same series as the probe's.
            set_sink = getattr(client, "set_clock_sink", None)
            if callable(set_sink):
                set_sink(lambda sample, e=entry: self._record_clock_sample(e, sample))

    # -- introspection --------------------------------------------------------

    @property
    def names(self) -> list[str]:
        return list(self._entries)

    @property
    def started(self) -> bool:
        return self._started

    def provider(self, name: str) -> Any:
        return self._entry(name).provider

    def add_clock_listener(self, listener: ClockStateListener) -> None:
        """Be told when a connection's clock is refused or cleared (FB-093)."""
        self._clock_listeners.append(listener)

    def clock_refusal_cause(self, name: str) -> str | None:
        """Why connection ``name`` is refused for its clock, or None while it delivers."""
        entry = self._entries.get(name)
        return entry.gate.cause if entry is not None and entry.gate.refused else None

    def clock_refusals(self) -> dict[str, dict[str, Any]]:
        """Every connection refused for its clock right now, with its gate's description."""
        return {
            name: entry.gate.describe()
            for name, entry in sorted(self._entries.items())
            if entry.gate.refused
        }

    def _entry(self, name: str) -> _Entry:
        entry = self._entries.get(name)
        if entry is None:
            msg = f"unknown PLC connection '{name}' (configured: {sorted(self._entries)})"
            raise KeyError(msg)
        return entry

    # -- lifecycle ------------------------------------------------------------

    async def start(self) -> None:
        if self._started:
            return
        await self.engine.start()  # provider failures are isolated and logged
        for entry in self._entries.values():
            await self._note_outcome(entry)
        self._started = True
        if self._poll_interval > 0 and self._entries:
            self._task = asyncio.create_task(self._supervise(), name="forge-ot-plc-supervisor")
        logger.info(
            "PLC connections started: %d/%d connected",
            self.connected_count(),
            len(self._entries),
        )

    async def stop(self) -> None:
        if not self._started:
            return
        self._started = False
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        await self.engine.stop()

    async def _supervise(self) -> None:
        while self._started:
            await asyncio.sleep(self._poll_interval)
            try:
                await self.check()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("PLC connection supervisor failed")

    # -- supervision ----------------------------------------------------------

    async def check(self) -> list[str]:
        """One supervisor pass; returns what it did (for logs and tests)."""
        self._checks += 1
        actions: list[str] = []
        now = self._now()
        for name, entry in self._entries.items():
            if entry.gate.refused:
                # Refused for its clock (FB-093): nothing is pulled and the restart loop
                # does not apply; only the probe runs, to see the clock come back.
                if self._probe_due(entry, now):
                    probe = await self._probe_refused(entry, now)
                    if probe is not None:
                        actions.append(probe)
                entry.last_connection_state = self._connection_state(entry)
                continue
            provider = entry.provider
            state = self._connection_state(entry)
            dropped = provider.state == ProviderState.RUNNING and state in (
                ConnectionState.DISCONNECTED,
                ConnectionState.FAILED,
            )
            if provider.state == ProviderState.FAILED or dropped:
                if entry.next_retry_at is not None and now < entry.next_retry_at:
                    entry.last_connection_state = state
                    continue
                actions.append(
                    await self._restart(entry, reason="dropped" if dropped else "failed")
                )
            elif (
                provider.state == ProviderState.RUNNING
                and state == ConnectionState.CONNECTED
                and entry.last_connection_state not in (None, ConnectionState.CONNECTED)
            ):
                # The client reconnected on its own; its subscriptions are gone.
                try:
                    await provider.resubscribe()
                    entry.resubscribes += 1
                    actions.append(f"{name}: resubscribed after reconnect")
                except Exception as exc:
                    entry.last_error = f"resubscribe failed: {exc}"
                    actions.append(f"{name}: {entry.last_error}")
            elif (
                provider.state == ProviderState.RUNNING
                and state == ConnectionState.CONNECTED
                and self._probe_due(entry, now)
            ):
                probe = await self._probe(entry, now)
                if probe is not None:
                    actions.append(probe)
            entry.last_connection_state = self._connection_state(entry)
        for action in actions:
            logger.info("PLC supervisor: %s", action)
        return actions

    def _probe_due(self, entry: _Entry, now: datetime) -> bool:
        if entry.last_probe_at is None:
            return True
        return (now - entry.last_probe_at).total_seconds() >= entry.clock_probe_interval

    async def _probe(self, entry: _Entry, now: datetime) -> str | None:
        """Read the server clock on the cadence; a failure means the session is dead.

        The read is ``ServerStatus.CurrentTime`` (FB-070's liveness probe), so every
        probe is also a clock measurement (FB-089, FB-094 step 2): the offset is taken
        against Forge's clock at the round trip's midpoint, the way NTP does, so the
        transit delay cancels, and the sample lands in the series of the clock this
        connection declared (``clock_id``).
        """
        entry.probes += 1
        entry.last_probe_at = now
        timeout = max(entry.spec.request_timeout_ms / 1000.0, 0.1)
        reader = OpcUaCurrentTimeReader(entry.client, now=self._now)
        try:
            sample = await asyncio.wait_for(reader.read_clock(), timeout=timeout)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            entry.probe_failures += 1
            entry.last_error = f"liveness probe failed: {type(exc).__name__}: {exc}"
            logger.warning("PLC %s unresponsive: %s", entry.spec.name, entry.last_error)
            return await self._restart(entry, reason="unresponsive")
        if sample is None:
            # The session lives but the clock could not be read: counted, visible on the
            # status, and the third in a row refuses the connection (CLOCK_UNREADABLE).
            entry.clock_unreadable += 1
            entry.last_error = "clock probe: the server answered without a clock value"
            logger.warning("PLC %s: %s", entry.spec.name, entry.last_error)
            return await self._judge(
                entry, None, now, detail="the server answered without a clock value"
            )
        self._record_clock_sample(entry, sample)
        return await self._judge(entry, sample.offset_seconds, sample.received_at)

    async def _probe_refused(self, entry: _Entry, now: datetime) -> str | None:
        """Probe the clock of a connection refused for it (FB-093, one-clock record P-5).

        The provider is stopped, so the probe opens a session of its own, reads
        ``CurrentTime`` and closes it: nothing is subscribed and nothing is written
        through it. A probe that fails counts as unreadable; three consecutive good
        probes clear the refusal and the connection resumes.
        """
        entry.probes += 1
        entry.last_probe_at = now
        timeout = max(entry.spec.request_timeout_ms / 1000.0, 0.1)
        reader = OpcUaCurrentTimeReader(entry.client, now=self._now)
        try:
            await asyncio.wait_for(entry.client.connect(), timeout=timeout)
            sample = await asyncio.wait_for(reader.read_clock(), timeout=timeout)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            entry.probe_failures += 1
            detail = f"the probe failed: {type(exc).__name__}: {exc}"
            return await self._judge(entry, None, now, detail=detail)
        finally:
            with contextlib.suppress(Exception):
                await entry.client.disconnect()
        if sample is None:
            entry.clock_unreadable += 1
            return await self._judge(
                entry, None, now, detail="the server answered without a clock value"
            )
        self._record_clock_sample(entry, sample)
        return await self._judge(entry, sample.offset_seconds, sample.received_at)

    async def _judge(
        self, entry: _Entry, offset_seconds: float | None, at: datetime, *, detail: str = ""
    ) -> str | None:
        """Hand one probe to the connection's clock gate and act on what it decides."""
        transition = entry.gate.observe(offset_seconds, at, detail=detail)
        if transition is None:
            return None
        name = entry.spec.name
        if transition.refused:
            entry.last_error = transition.cause
            entry.next_retry_at = None
            if transition.previous == CLOCK_OK:
                entry.clock_refusals += 1
                # Fail closed: stop pulling. A refusal, not a recovery: no restart loop.
                await entry.provider.stop()
            logger.error("PLC %s refused, %s: %s", name, transition.state, transition.cause)
            await self._notify(name, transition)
            return f"{name}: {transition.state}: {transition.cause}"
        logger.warning("PLC %s clock refusal cleared: %s", name, transition.cause)
        await self._notify(name, transition)
        entry.last_error = None
        outcome = await self._restart(entry, reason="clock back inside tolerance")
        return f"{transition.cause}; {outcome}"

    async def _notify(self, name: str, transition: ClockGateTransition) -> None:
        """Tell every listener; a listener that fails never hides the refusal itself."""
        for listener in list(self._clock_listeners):
            try:
                result = listener(name, transition)
                if inspect.isawaitable(result):
                    await result
            except Exception:
                logger.exception("clock state listener failed for %s", name)

    def _record_clock_sample(self, entry: _Entry, sample: ClockSample) -> None:
        """One measurement of the connection's clock, from the probe or the tap."""
        entry.clock_samples += 1
        self.offsets.observe(
            entry.spec.name,
            SERVER_LINK,
            sample.offset_seconds,
            sample.received_at,
            round_trip=sample.round_trip_seconds,
            clock_id=entry.clock_id,
            tolerance_seconds=entry.gate.tolerance_seconds,
        )

    def clock_estimate(self, name: str) -> ClockEstimate | None:
        """The current estimate of the clock connection ``name`` declared (FB-094 step 3).

        For the correction on entry (one-clock record P-3, P-10); None until the probe or
        the response-header tap has read the clock.
        """
        entry = self._entries.get(name)
        if entry is None:
            return None
        stats = self.offsets.clock(name, entry.clock_id)
        return ClockEstimate.from_stats(stats) if stats is not None else None

    def set_clock_probe_interval(
        self, name: str, seconds: float, *, requested_by: str = ""
    ) -> dict[str, Any]:
        """Change one connection's clock probe cadence at runtime (one-clock record P-2).

        The owner's condition (2026-11-03): the cadence is a dynamic per-connection
        variable the user adjusts as needed, no restart. The value in force and who set
        it are on the connection status. Raises ``KeyError`` for an unknown connection
        and ``ValueError`` below the 1 s minimum.
        """
        entry = self._entry(name)
        if seconds < MIN_CLOCK_PROBE_INTERVAL_SECONDS:
            msg = (
                f"clock probe interval for '{name}' must be at least "
                f"{MIN_CLOCK_PROBE_INTERVAL_SECONDS:g} s; got {seconds!r}"
            )
            raise ValueError(msg)
        previous = entry.clock_probe_interval
        entry.clock_probe_interval = float(seconds)
        entry.clock_probe_set_by = requested_by or "anonymous"
        entry.clock_probe_set_at = self._now()
        logger.info(
            "PLC %s: clock probe interval %gs -> %gs (by %s)",
            name,
            previous,
            entry.clock_probe_interval,
            entry.clock_probe_set_by,
        )
        return self._status_for(entry)

    async def restart(self, name: str, *, requested_by: str = "") -> dict[str, Any]:
        """Operator-requested restart of one connection; returns its status.

        ``requested_by`` (the hub user over REST, FB-082) is logged with the
        outcome so the supervisor log says who restarted what. A connection refused
        for its clock is not restarted (FB-093): ``ClockRefusedError`` names the cause,
        and the connection resumes by itself after three good probes.
        """
        entry = self._entry(name)
        if entry.gate.refused:
            cause = entry.gate.cause or entry.gate.state
            logger.warning(
                "PLC %s: restart requested by %s refused: %s",
                name,
                requested_by or "anonymous",
                cause,
            )
            raise ClockRefusedError(
                f"connection '{name}' is refused for its clock and is not restarted: {cause}",
                cause=entry.gate.state.lower(),
            )
        reason = f"requested by {requested_by}" if requested_by else "requested"
        logger.info("PLC supervisor: %s", await self._restart(entry, reason=reason))
        return self._status_for(entry)

    async def _restart(self, entry: _Entry, *, reason: str) -> str:
        name = entry.spec.name
        entry.restarts += 1
        try:
            await self.engine.restart_provider(name)
        except Exception as exc:
            entry.failures += 1
            entry.last_error = f"{type(exc).__name__}: {exc}"
            entry.next_retry_at = self._now_plus(entry.backoff)
            entry.backoff = min(entry.backoff * 2, self._retry_max)
            return (
                f"{name}: restart ({reason}) failed: {entry.last_error}; "
                f"retry at {entry.next_retry_at:%H:%M:%S}"
            )
        entry.backoff = max(entry.spec.reconnect_interval_ms / 1000.0, 0.1)
        entry.next_retry_at = None
        entry.last_error = None
        entry.last_connection_state = self._connection_state(entry)
        return f"{name}: reconnected ({reason})"

    async def _note_outcome(self, entry: _Entry) -> None:
        """Record a provider's start-up outcome (error text, first retry time)."""
        provider = entry.provider
        entry.last_connection_state = self._connection_state(entry)
        if provider.state == ProviderState.FAILED:
            health = await provider.health()
            entry.failures += 1
            entry.last_error = str(health.get("error") or "start failed")
            entry.next_retry_at = self._now_plus(entry.backoff)
            entry.backoff = min(entry.backoff * 2, self._retry_max)
            logger.warning(
                "PLC connection %s failed to start: %s (retry at %s)",
                entry.spec.name,
                entry.last_error,
                entry.next_retry_at,
            )

    def _now_plus(self, seconds: float) -> datetime:
        from datetime import timedelta

        return self._now() + timedelta(seconds=seconds)

    @staticmethod
    def _connection_state(entry: _Entry) -> ConnectionState:
        try:
            return ConnectionState(client_health(entry.client).state)
        except Exception:
            return ConnectionState.DISCONNECTED

    # -- status ---------------------------------------------------------------

    def connected_count(self) -> int:
        return sum(
            1
            for entry in self._entries.values()
            if entry.provider.state == ProviderState.RUNNING
            and self._connection_state(entry) == ConnectionState.CONNECTED
        )

    def _status_for(self, entry: _Entry) -> dict[str, Any]:
        health: Any = None
        with contextlib.suppress(Exception):
            health = client_health(entry.client)
        return {
            "name": entry.spec.name,
            "endpoint": entry.spec.endpoint,
            "security_policy": entry.spec.security_policy,
            "provider_state": entry.provider.state.value,
            "connection_state": self._connection_state(entry).value,
            "connected": (
                entry.provider.state == ProviderState.RUNNING
                and self._connection_state(entry) == ConnectionState.CONNECTED
            ),
            "subscribed_tags": getattr(entry.provider, "subscribed_tag_count", 0),
            "connected_since": (
                health.connected_since.isoformat()
                if health is not None and health.connected_since
                else None
            ),
            "latency_ms": health.latency_ms if health is not None else None,
            "client_reconnects": health.reconnect_count if health is not None else 0,
            "restarts": entry.restarts,
            "failures": entry.failures,
            "resubscribes": entry.resubscribes,
            "probes": entry.probes,
            "probe_failures": entry.probe_failures,
            "last_probe_at": entry.last_probe_at.isoformat() if entry.last_probe_at else None,
            # the clock this connection measures (one-clock record P-2): its id, the probe
            # cadence in force and who set it, and the rolling offset statistics
            "clock_id": entry.clock_id,
            "clock_probe_interval_seconds": entry.clock_probe_interval,
            "clock_probe_interval_source": (
                f"set by {entry.clock_probe_set_by} at {entry.clock_probe_set_at.isoformat()}"
                if entry.clock_probe_set_at is not None
                else "config"
            ),
            "clock_samples": entry.clock_samples,
            "clock_unreadable": entry.clock_unreadable,
            # fail closed (FB-093, one-clock record P-5): OK, CLOCK_UNREADABLE or
            # CLOCK_OUT_OF_TOLERANCE, with the cause, since when and the class held to
            "clock_state": entry.gate.state,
            "clock_refusals": entry.clock_refusals,
            "clock_gate": entry.gate.describe(),
            "server_clock": (
                server_clock.model_dump(mode="json")
                if (server_clock := self.offsets.clocks(entry.spec.name).get(entry.clock_id))
                else None
            ),
            "last_error": entry.last_error,
            "next_retry_at": entry.next_retry_at.isoformat() if entry.next_retry_at else None,
        }

    def status(self) -> dict[str, Any]:
        return {
            "started": self._started,
            "supervisor": {
                "running": self._task is not None and not self._task.done(),
                "poll_interval_seconds": self._poll_interval,
                "checks": self._checks,
            },
            "total": len(self._entries),
            "connected": self.connected_count(),
            "clock_refused": sorted(self.clock_refusals()),
            "connections": {name: self._status_for(e) for name, e in sorted(self._entries.items())},
        }
