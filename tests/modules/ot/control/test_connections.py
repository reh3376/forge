"""PlcConnectionManager: one supervised OPC-UA provider per configured PLC (FB-069)."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from forge.modules.ot.control import PlcConnectionManager, PlcConnectionSpec, RegistryTagIO
from forge.modules.ot.control.connections import (
    LIVENESS_NODE,
    default_client_factory,
    default_provider_factory,
)
from forge.modules.ot.opcua_client.types import (
    ConnectionHealth,
    ConnectionState,
    DataType,
    DataValue,
    QualityCode,
)
from forge.modules.ot.tag_engine.models import StandardTag
from forge.modules.ot.tag_engine.providers.acquisition import AcquisitionEngine
from forge.modules.ot.tag_engine.providers.base import ProviderState
from forge.modules.ot.tag_engine.registry import TagRegistry

SP = "WH/WHK01/Cooker01/TIT_2010/SP"
PV = "WH/WHK01/Cooker01/TIT_2010/PV"
OTHER = "WH/WHK02/Granary01/TIT_1010/PV"
SP_NODE = "ns=2;s=Cooker01.TIT_2010.SP"
PV_NODE = "ns=2;s=Cooker01.TIT_2010.PV"


class FakeUaClient:
    """The OpcUaClient surface OpcUaProvider uses, with a controllable link."""

    def __init__(self, spec: PlcConnectionSpec) -> None:
        self.spec = spec
        self.down = False
        self.state = ConnectionState.DISCONNECTED
        self.values: dict[str, Any] = {}
        self.connects = 0
        self.subscriptions: list[tuple[int, list[str]]] = []
        self.callbacks: dict[int, Any] = {}
        self.reconnect_count = 0
        self.probe_fail = False
        self.probed = 0
        self._next = 1

    async def connect(self) -> None:
        self.connects += 1
        if self.down:
            self.state = ConnectionState.FAILED
            msg = f"{self.spec.endpoint} refused"
            raise ConnectionError(msg)
        self.state = ConnectionState.CONNECTED

    async def disconnect(self) -> None:
        self.state = ConnectionState.DISCONNECTED
        self.callbacks.clear()

    async def subscribe(self, node_ids, callback, *, interval_ms=500.0, queue_size=10) -> int:
        if self.state != ConnectionState.CONNECTED:
            msg = "not connected"
            raise ConnectionError(msg)
        sid = self._next
        self._next += 1
        self.subscriptions.append((sid, list(node_ids)))
        self.callbacks[sid] = callback
        return sid

    async def unsubscribe(self, sid: int) -> None:
        self.callbacks.pop(sid, None)

    async def read(self, node_ids, *, max_age_ms=0):
        if self.state != ConnectionState.CONNECTED:
            msg = "not connected"
            raise ConnectionError(msg)
        if list(node_ids) == [LIVENESS_NODE]:
            self.probed += 1
            if self.probe_fail:
                msg = "session timed out"
                raise TimeoutError(msg)
        return [DataValue(value=self.values.get(n), quality=QualityCode.GOOD) for n in node_ids]

    async def write(self, node_id, value, *, data_type=None) -> None:
        if self.state != ConnectionState.CONNECTED:
            msg = "not connected"
            raise ConnectionError(msg)
        self.values[node_id] = value

    def health(self) -> ConnectionHealth:
        return ConnectionHealth(
            endpoint_url=self.spec.endpoint,
            connection_name=self.spec.name,
            state=self.state,
            reconnect_count=self.reconnect_count,
            latency_ms=1.5,
        )

    async def push(self, node_id: str, value: Any) -> None:
        """A monitored item changed on the PLC."""
        for callback in list(self.callbacks.values()):
            await callback(node_id, DataValue(value=value, quality=QualityCode.GOOD))


class Clock:
    def __init__(self) -> None:
        self.t = datetime(2026, 6, 1, 8, tzinfo=UTC)

    def now(self) -> datetime:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += timedelta(seconds=seconds)


def spec(name: str = "WHK01", **kw: Any) -> PlcConnectionSpec:
    kw.setdefault("endpoint", "opc.tcp://10.0.0.1:4840")
    kw.setdefault("reconnect_interval_ms", 1000)
    kw.setdefault("liveness_interval_seconds", 0)
    return PlcConnectionSpec(name=name, **kw)


async def registry_with_tags() -> TagRegistry:
    registry = TagRegistry()
    for path, node, connection in (
        (SP, SP_NODE, "WHK01"),
        (PV, PV_NODE, "WHK01"),
        (OTHER, "ns=2;s=Granary01.TIT_1010.PV", "WHK02"),
    ):
        await registry.register(
            StandardTag(
                path=path, data_type=DataType.FLOAT, opcua_node_id=node, connection_name=connection
            )
        )
    return registry


def make(
    specs: list[PlcConnectionSpec],
    registry: TagRegistry,
    *,
    poll: float = 0.0,
    clock: Clock | None = None,
    engine: AcquisitionEngine | None = None,
) -> tuple[PlcConnectionManager, dict[str, FakeUaClient]]:
    clients: dict[str, FakeUaClient] = {}

    def factory(s: PlcConnectionSpec) -> FakeUaClient:
        clients[s.name] = FakeUaClient(s)
        return clients[s.name]

    manager = PlcConnectionManager(
        specs,
        registry,
        engine=engine,
        client_factory=factory,
        poll_interval=poll,
        retry_max=8.0,
        now=clock.now if clock else None,
    )
    return manager, clients


async def wait_for(predicate, *, timeout: float = 3.0) -> None:
    async with asyncio.timeout(timeout):
        while not predicate():
            await asyncio.sleep(0.01)


async def test_start_connects_subscribes_and_serves_tag_io() -> None:
    registry = await registry_with_tags()
    engine = AcquisitionEngine()
    manager, clients = make([spec(), spec("WHK02", enabled=False)], registry, engine=engine)
    assert manager.names == ["WHK01"] and manager.engine is engine
    assert manager.normalizer.connection_map == {"WHK01": 2}

    await manager.start()
    client = clients["WHK01"]
    provider = manager.provider("WHK01")
    assert provider.state is ProviderState.RUNNING and client.connects == 1
    assert sorted(client.subscriptions[0][1]) == sorted([SP_NODE, PV_NODE])
    status = manager.status()
    assert status["started"] and status["total"] == 1 and status["connected"] == 1
    conn = status["connections"]["WHK01"]
    assert conn["connected"] and conn["subscribed_tags"] == 2
    assert conn["provider_state"] == ProviderState.RUNNING.value
    assert conn["connection_state"] == "CONNECTED" and conn["latency_ms"] == 1.5
    assert status["supervisor"]["running"] is False  # poll 0: no background task

    # Standard tags reach the PLC through the provider the engine owns.
    io = RegistryTagIO(registry, acquisition=engine)
    await io.write_tag(SP, 150.0)
    assert client.values[SP_NODE] == 150.0
    assert await io.read_tag(SP) == 150.0
    await client.push(PV_NODE, 72.5)
    assert (await registry.get_value(PV)).value == 72.5
    with pytest.raises(RuntimeError, match="no OPC-UA provider"):
        await io.write_tag(OTHER, 1.0)  # WHK02 is disabled

    await manager.stop()
    assert client.state is ConnectionState.DISCONNECTED
    assert provider.state is ProviderState.STOPPED and not manager.status()["started"]
    await manager.stop()  # idempotent


async def test_plc_down_at_start_is_isolated_and_retried_with_backoff() -> None:
    registry = await registry_with_tags()
    clock = Clock()
    manager, clients = make([spec()], registry, clock=clock)
    client = clients["WHK01"]
    client.down = True

    await manager.start()  # does not raise: provider failures are isolated
    assert manager.started
    provider = manager.provider("WHK01")
    assert provider.state is ProviderState.FAILED
    conn = manager.status()["connections"]["WHK01"]
    assert not conn["connected"] and "refused" in conn["last_error"] and conn["failures"] == 1
    assert conn["next_retry_at"] == (clock.t + timedelta(seconds=1)).isoformat()

    assert await manager.check() == []  # back-off not elapsed
    clock.advance(1.5)
    actions = await manager.check()
    assert len(actions) == 1 and "restart (failed) failed" in actions[0]
    conn = manager.status()["connections"]["WHK01"]
    assert conn["failures"] == 2 and conn["restarts"] == 1
    assert conn["next_retry_at"] == (clock.t + timedelta(seconds=2)).isoformat()  # doubled

    client.down = False
    clock.advance(1)
    assert await manager.check() == []  # still inside the doubled back-off
    clock.advance(2)
    assert await manager.check() == ["WHK01: reconnected (failed)"]
    assert provider.state is ProviderState.RUNNING and client.subscriptions
    conn = manager.status()["connections"]["WHK01"]
    assert conn["connected"] and conn["last_error"] is None and conn["next_retry_at"] is None
    assert conn["restarts"] == 2
    await manager.stop()


async def test_dropped_link_restarts_the_provider() -> None:
    registry = await registry_with_tags()
    manager, clients = make([spec()], registry, clock=Clock())
    await manager.start()
    client = clients["WHK01"]
    client.state = ConnectionState.DISCONNECTED  # asyncua lost the session

    assert await manager.check() == ["WHK01: reconnected (dropped)"]
    assert client.connects == 2 and client.state is ConnectionState.CONNECTED
    assert manager.status()["connections"]["WHK01"]["restarts"] == 1
    assert await manager.check() == []
    await manager.stop()


async def test_client_self_reconnect_triggers_resubscribe() -> None:
    registry = await registry_with_tags()
    manager, clients = make([spec()], registry, clock=Clock())
    await manager.start()
    client = clients["WHK01"]

    client.state = ConnectionState.RECONNECTING
    assert await manager.check() == []  # the client's own loop is working on it
    client.state = ConnectionState.CONNECTED
    client.reconnect_count = 1
    assert await manager.check() == ["WHK01: resubscribed after reconnect"]
    assert len(client.subscriptions) == 2 and client.connects == 1
    conn = manager.status()["connections"]["WHK01"]
    assert conn["resubscribes"] == 1 and conn["client_reconnects"] == 1
    assert await manager.check() == []
    await manager.stop()


async def test_supervisor_task_recovers_in_the_background() -> None:
    registry = await registry_with_tags()
    manager, clients = make([spec(reconnect_interval_ms=100)], registry, poll=0.01)
    client = clients["WHK01"]
    client.down = True
    await manager.start()
    assert manager.status()["supervisor"]["running"] is True
    assert manager.provider("WHK01").state is ProviderState.FAILED

    client.down = False
    await wait_for(lambda: manager.provider("WHK01").state is ProviderState.RUNNING)
    assert manager.status()["supervisor"]["checks"] >= 1
    await manager.stop()
    assert manager.status()["supervisor"]["running"] is False


async def test_operator_restart_and_unknown_names(caplog: pytest.LogCaptureFixture) -> None:
    registry = await registry_with_tags()
    manager, clients = make([spec()], registry, clock=Clock())
    await manager.start()
    status = await manager.restart("WHK01")
    assert status["restarts"] == 1 and status["connected"] and clients["WHK01"].connects == 2
    # the supervisor log says who asked (the hub user over REST, FB-082)
    with caplog.at_level(logging.INFO, logger="forge.modules.ot.control.connections"):
        status = await manager.restart("WHK01", requested_by="alice")
    assert status["restarts"] == 2 and clients["WHK01"].connects == 3
    assert "WHK01: reconnected (requested by alice)" in caplog.text
    with pytest.raises(KeyError, match="nope"):
        await manager.restart("nope")
    with pytest.raises(KeyError):
        manager.provider("nope")
    await manager.stop()


async def test_default_factories_build_the_real_stack() -> None:
    registry = await registry_with_tags()
    client = default_client_factory(spec(endpoint="opc.tcp://127.0.0.1:4840"))
    assert client.name == "WHK01" and client.endpoint.url == "opc.tcp://127.0.0.1:4840"
    assert client.security.policy.value == "None"
    provider = default_provider_factory(
        "WHK01", registry, client, PlcConnectionManager([], registry).normalizer
    )
    assert provider.name == "WHK01" and provider.client is client
    with pytest.raises(Exception, match=r"cert|Cert|No such"):
        default_client_factory(
            spec(
                security_policy="Basic256Sha256",
                certificate_path="/nonexistent/client.pem",
                private_key_path="/nonexistent/client.key",
            )
        )


def test_spec_validation() -> None:
    with pytest.raises(ValueError, match=r"opc\.tcp"):
        spec(endpoint="http://plc:4840")
    with pytest.raises(ValueError, match="certificate_path"):
        spec(security_policy="Basic256Sha256")
    ok = spec(security_policy="Basic256Sha256", certificate_path="c.pem", private_key_path="c.key")
    assert ok.security_policy == "Basic256Sha256" and ok.enabled


async def test_liveness_probe_catches_a_silently_dead_session() -> None:
    """A session that answers nothing is restarted even though its state says CONNECTED (FB-070)."""
    registry = await registry_with_tags()
    clock = Clock()
    manager, clients = make([spec(liveness_interval_seconds=10)], registry, clock=clock)
    await manager.start()
    client = clients["WHK01"]

    assert await manager.check() == [] and client.probed == 1  # first pass probes at once
    clock.advance(5)
    assert await manager.check() == [] and client.probed == 1  # interval not elapsed
    clock.advance(5)
    assert await manager.check() == [] and client.probed == 2
    conn = manager.status()["connections"]["WHK01"]
    assert conn["probes"] == 2 and conn["probe_failures"] == 0
    assert conn["last_probe_at"] == clock.t.isoformat()

    client.probe_fail = True
    clock.advance(10)
    actions = await manager.check()
    assert actions == ["WHK01: reconnected (unresponsive)"]
    assert client.connects == 2 and client.state is ConnectionState.CONNECTED
    conn = manager.status()["connections"]["WHK01"]
    assert conn["probe_failures"] == 1 and conn["restarts"] == 1 and conn["last_error"] is None

    disabled, dclients = make([spec(liveness_interval_seconds=0)], registry, clock=clock)
    await disabled.start()
    clock.advance(100)
    assert await disabled.check() == [] and dclients["WHK01"].probed == 0
    await disabled.stop()
    await manager.stop()


async def test_liveness_probe_measures_the_server_clock() -> None:
    """Every probe answer is the server clock: its hub offset is kept and alerted (FB-089)."""
    registry = await registry_with_tags()
    clock = Clock()
    manager, clients = make([spec(liveness_interval_seconds=10)], registry, clock=clock)
    await manager.start()
    client = clients["WHK01"]

    client.values[LIVENESS_NODE] = clock.t + timedelta(seconds=3)  # server 3 s ahead of the hub
    await manager.check()
    server_clock = manager.status()["connections"]["WHK01"]["server_clock"]
    assert server_clock["last_seconds"] == 3.0 and server_clock["round_trip_seconds"] == 0.0
    assert server_clock["within_tolerance"] is False and server_clock["breaches"] == 1
    assert server_clock["measured_at"] == clock.t.isoformat().replace("+00:00", "Z")

    clock.advance(10)
    client.values[LIVENESS_NODE] = clock.t + timedelta(milliseconds=20)  # back within tolerance
    await manager.check()
    server_clock = manager.status()["connections"]["WHK01"]["server_clock"]
    assert server_clock["samples"] == 2 and server_clock["within_tolerance"] is True
    assert server_clock["last_seconds"] == pytest.approx(0.02)
    assert manager.offsets.stats("WHK01")["server"].max_abs_seconds == 3.0


async def test_probe_without_a_clock_value_measures_nothing() -> None:
    registry = await registry_with_tags()
    manager, _clients = make([spec(liveness_interval_seconds=10)], registry, clock=Clock())
    await manager.start()
    await manager.check()
    assert manager.status()["connections"]["WHK01"]["server_clock"] is None
