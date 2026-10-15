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
* a synchronous :meth:`PlcConnectionManager.status` for the REST status.

``asyncua`` is only imported by the default factories, so a hub without
the ``ot`` extra still starts when no connections are configured.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from forge.modules.ot.opcua_client.paths import PathNormalizer
from forge.modules.ot.opcua_client.types import ConnectionState
from forge.modules.ot.tag_engine.providers.acquisition import AcquisitionEngine
from forge.modules.ot.tag_engine.providers.base import ProviderState

if TYPE_CHECKING:
    from forge.modules.ot.control.config import PlcConnectionSpec
    from forge.modules.ot.tag_engine.registry import TagRegistry

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
    restarts: int = 0
    failures: int = 0
    last_error: str | None = None
    next_retry_at: datetime | None = None
    last_connection_state: ConnectionState | None = None
    resubscribes: int = 0
    last_probe_at: datetime | None = None
    probes: int = 0
    probe_failures: int = 0


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
    ) -> None:
        self.engine = engine or AcquisitionEngine()
        self._registry = registry
        self._poll_interval = poll_interval
        self._retry_max = retry_max
        self._now = now or (lambda: datetime.now(UTC))
        self._entries: dict[str, _Entry] = {}
        self._task: asyncio.Task[None] | None = None
        self._started = False
        self._checks = 0
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
            self._entries[spec.name] = _Entry(
                spec=spec,
                provider=provider,
                client=client,
                backoff=max(spec.reconnect_interval_ms / 1000.0, 0.1),
            )

    # -- introspection --------------------------------------------------------

    @property
    def names(self) -> list[str]:
        return list(self._entries)

    @property
    def started(self) -> bool:
        return self._started

    def provider(self, name: str) -> Any:
        return self._entry(name).provider

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
        interval = entry.spec.liveness_interval_seconds
        if interval <= 0:
            return False
        if entry.last_probe_at is None:
            return True
        return (now - entry.last_probe_at).total_seconds() >= interval

    async def _probe(self, entry: _Entry, now: datetime) -> str | None:
        """Read the server clock; a failure means the session is dead (FB-070)."""
        entry.probes += 1
        entry.last_probe_at = now
        timeout = max(entry.spec.request_timeout_ms / 1000.0, 0.1)
        try:
            await asyncio.wait_for(entry.client.read([LIVENESS_NODE]), timeout=timeout)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            entry.probe_failures += 1
            entry.last_error = f"liveness probe failed: {type(exc).__name__}: {exc}"
            logger.warning("PLC %s unresponsive: %s", entry.spec.name, entry.last_error)
            return await self._restart(entry, reason="unresponsive")
        return None

    async def restart(self, name: str) -> dict[str, Any]:
        """Operator-requested restart of one connection; returns its status."""
        entry = self._entry(name)
        await self._restart(entry, reason="requested")
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
            return ConnectionState(entry.client.health().state)
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
            health = entry.client.health()
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
            "connections": {name: self._status_for(e) for name, e in sorted(self._entries.items())},
        }
