"""PlcConnectionManager: one supervised OPC-UA provider per configured PLC (FB-069)."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from forge.core.clock import ClockRefusedError, ClockSample
from forge.core.models.adapter import ConnectionTimeGovernance, TimeGovernance
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
        self.clock_sink = None
        #: The server's clock: ``CurrentTime`` answers with it unless a test sets the node.
        self.server_now = None
        self._next = 1

    def set_clock_sink(self, sink) -> None:
        """The manager routes the client's clock samples into its series (FB-094 step 2)."""
        self.clock_sink = sink

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
            if LIVENESS_NODE not in self.values and self.server_now is not None:
                return [DataValue(value=self.server_now(), quality=QualityCode.GOOD)]
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
    if "clock_probe_interval_seconds" not in kw and "liveness_interval_seconds" not in kw:
        kw["clock_probe_interval_seconds"] = 30  # the probe cannot be switched off (FB-093)
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
    time_governance: TimeGovernance | None = None,
) -> tuple[PlcConnectionManager, dict[str, FakeUaClient]]:
    clients: dict[str, FakeUaClient] = {}

    def factory(s: PlcConnectionSpec) -> FakeUaClient:
        clients[s.name] = FakeUaClient(s)
        # a server in step with Forge's clock, so its probe is good unless a test says otherwise
        clients[s.name].server_now = clock.now if clock else (lambda: datetime.now(UTC))
        return clients[s.name]

    manager = PlcConnectionManager(
        specs,
        registry,
        engine=engine,
        client_factory=factory,
        poll_interval=poll,
        retry_max=8.0,
        now=clock.now if clock else None,
        time_governance=time_governance,
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

    # the probe cannot be switched off (FB-093): a clock that is not read cannot be trusted
    with pytest.raises(ValueError, match="greater than or equal to 1"):
        spec(liveness_interval_seconds=0)
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
    client.values[LIVENESS_NODE] = clock.t + timedelta(milliseconds=5)  # back within tolerance
    await manager.check()
    server_clock = manager.status()["connections"]["WHK01"]["server_clock"]
    assert server_clock["samples"] == 2 and server_clock["within_tolerance"] is True
    assert server_clock["last_seconds"] == pytest.approx(0.005)
    # the tolerance is the one of the link's class (T0, one-clock record P-8), not 1 s
    assert server_clock["tolerance_seconds"] == 0.010
    # the series is the one of the clock the probe read, named (FB-094 step 2)
    assert server_clock["clock_id"] == "server:WHK01"
    assert manager.offsets.clocks("WHK01")["server:WHK01"].max_abs_seconds == 3.0
    assert manager.offsets.stats("WHK01") == {}
    conn = manager.status()["connections"]["WHK01"]
    assert conn["clock_id"] == "server:WHK01" and conn["clock_samples"] == 2


async def test_probe_without_a_clock_value_is_counted_and_visible() -> None:
    """The session lives but the clock is unreadable: counted; the third in a row refuses."""
    registry = await registry_with_tags()
    manager, clients = make([spec(liveness_interval_seconds=10)], registry, clock=Clock())
    clients["WHK01"].values[LIVENESS_NODE] = None  # the server answers without a clock value
    await manager.start()
    await manager.check()
    conn = manager.status()["connections"]["WHK01"]
    assert conn["server_clock"] is None and conn["clock_samples"] == 0
    assert conn["clock_unreadable"] == 1
    assert conn["last_error"] == "clock probe: the server answered without a clock value"
    assert conn["clock_state"] == "OK" and conn["connected"]  # one probe is not three


async def test_the_manager_hands_the_builder_the_clock_estimate() -> None:
    """The estimate the correction on entry uses comes from the probe's series (FB-094 step 3)."""
    registry = await registry_with_tags()
    clock = Clock()
    manager, clients = make([spec(liveness_interval_seconds=10)], registry, clock=clock)
    await manager.start()
    assert manager.clock_estimate("WHK01") is None  # not read yet
    assert manager.clock_estimate("nope") is None
    clients["WHK01"].values[LIVENESS_NODE] = clock.t + timedelta(seconds=2)
    await manager.check()
    estimate = manager.clock_estimate("WHK01")
    assert estimate is not None and estimate.clock_id == "server:WHK01"
    assert estimate.offset_seconds == 2.0 and estimate.uncertainty_seconds == 0.0
    assert estimate.within_tolerance is False  # 2 s against T0's 10 ms
    await manager.stop()


async def test_a_declared_device_origin_names_the_clock_the_probe_reads() -> None:
    registry = await registry_with_tags()
    clock = Clock()
    manager, clients = make(
        [spec(liveness_interval_seconds=10, source_timestamp_origin="device")],
        registry,
        clock=clock,
    )
    await manager.start()
    clients["WHK01"].values[LIVENESS_NODE] = clock.t
    await manager.check()
    conn = manager.status()["connections"]["WHK01"]
    assert conn["clock_id"] == "device:WHK01"
    assert conn["server_clock"]["clock_id"] == "device:WHK01"
    assert set(manager.offsets.clocks("WHK01")) == {"device:WHK01"}


async def test_the_client_s_own_clock_samples_feed_the_connection_series() -> None:
    """The response-header tap's samples land in the same series as the probe's."""
    registry = await registry_with_tags()
    clock = Clock()
    manager, clients = make([spec()], registry, clock=clock)
    client = clients["WHK01"]
    assert client.clock_sink is not None  # wired at construction
    client.clock_sink(
        ClockSample(
            clock.t,
            clock.t + timedelta(seconds=1, milliseconds=2),
            clock.t + timedelta(milliseconds=4),
        )
    )
    conn = manager.status()["connections"]["WHK01"]
    assert conn["clock_samples"] == 1
    assert conn["server_clock"]["last_seconds"] == pytest.approx(1.0)
    assert conn["server_clock"]["round_trip_seconds"] == pytest.approx(0.004)


async def test_clock_probe_interval_is_a_runtime_setting_per_connection() -> None:
    """The owner's condition (2026-11-03): the cadence is adjusted at runtime, no restart."""
    registry = await registry_with_tags()
    clock = Clock()
    manager, clients = make(
        [spec(clock_probe_interval_seconds=30), spec("WHK02", liveness_interval_seconds=10)],
        registry,
        clock=clock,
    )
    await manager.start()
    status = manager.status()["connections"]
    assert status["WHK01"]["clock_probe_interval_seconds"] == 30.0  # the one-clock name
    assert status["WHK02"]["clock_probe_interval_seconds"] == 10.0  # the older name, still read
    assert status["WHK01"]["clock_probe_interval_source"] == "config"
    client = clients["WHK01"]
    await manager.check()
    assert client.probed == 1
    clock.advance(5)
    await manager.check()
    assert client.probed == 1  # 30 s cadence: not due

    changed = manager.set_clock_probe_interval("WHK01", 5, requested_by="reh3376")
    assert changed["clock_probe_interval_seconds"] == 5.0
    assert changed["clock_probe_interval_source"] == f"set by reh3376 at {clock.t.isoformat()}"
    await manager.check()
    assert client.probed == 2  # due under the new cadence, no restart happened
    assert client.connects == 1
    assert manager.status()["connections"]["WHK02"]["clock_probe_interval_seconds"] == 10.0

    with pytest.raises(ValueError, match="at least 1 s"):
        manager.set_clock_probe_interval("WHK01", 0.5)
    with pytest.raises(KeyError):
        manager.set_clock_probe_interval("nope", 5)
    await manager.stop()


# ---------------------------------------------------------------------------
# Fail closed on the connection's clock (FB-093, one-clock record P-5)
# ---------------------------------------------------------------------------


async def test_three_unreadable_probes_refuse_the_connection_and_three_good_ones_resume() -> None:
    """CLOCK_UNREADABLE stops delivery, visibly, with no restart loop; three good probes resume."""
    registry = await registry_with_tags()
    clock = Clock()
    manager, clients = make([spec(liveness_interval_seconds=10)], registry, clock=clock)
    seen: list[tuple[str, str, str]] = []
    manager.add_clock_listener(lambda name, t: seen.append((name, t.previous, t.state)))
    await manager.start()
    client = clients["WHK01"]
    client.values[LIVENESS_NODE] = None  # the server answers without a clock value

    assert await manager.check() == []
    clock.advance(10)
    assert await manager.check() == []
    assert manager.status()["connections"]["WHK01"]["clock_state"] == "OK"  # two are not three
    clock.advance(10)
    actions = await manager.check()
    assert len(actions) == 1
    assert actions[0].startswith("WHK01: CLOCK_UNREADABLE: clock server:WHK01 could not be read")

    conn = manager.status()["connections"]["WHK01"]
    assert conn["clock_state"] == "CLOCK_UNREADABLE" and conn["connected"] is False
    assert conn["provider_state"] == "stopped" and conn["clock_refusals"] == 1
    assert "could not be read for 3 consecutive probes" in conn["last_error"]
    assert conn["clock_gate"]["since"] == clock.t.isoformat()
    assert conn["clock_gate"]["tolerance_class"] == "T0"
    status = manager.status()
    assert status["clock_refused"] == ["WHK01"] and status["connected"] == 0
    assert seen == [("WHK01", "OK", "CLOCK_UNREADABLE")]  # raised at entry, once
    assert manager.clock_refusal_cause("WHK01") == conn["last_error"]
    assert set(manager.clock_refusals()) == {"WHK01"}
    # the provider is stopped: nothing is subscribed, nothing is pulled
    assert client.state is ConnectionState.DISCONNECTED and client.callbacks == {}

    # nothing is read or written through a refused connection, and the refusal says why
    io = RegistryTagIO(
        registry, acquisition=manager.engine, refusal_for=manager.clock_refusal_cause
    )
    with pytest.raises(ClockRefusedError, match=r"write of .* refused: connection 'WHK01'"):
        await io.write_tag(SP, 150.0)
    with pytest.raises(ClockRefusedError, match=r"read of .* refused"):
        await io.read_tag(PV)

    # a refusal, not a recovery: the supervisor does not restart it, and an operator cannot
    connects = client.connects
    clock.advance(5)
    assert await manager.check() == [] and client.connects == connects
    with pytest.raises(ClockRefusedError, match="is not restarted") as refused:
        await manager.restart("WHK01", requested_by="alice")
    assert refused.value.cause == "clock_unreadable"
    assert manager.status()["connections"]["WHK01"]["restarts"] == 0

    # the probe keeps running on a session of its own; three good probes in a row resume
    del client.values[LIVENESS_NODE]  # the server's clock is readable again, in step
    clock.advance(5)
    assert await manager.check() == []  # good, 1 of 3
    assert client.state is ConnectionState.DISCONNECTED  # the probe's session is closed again
    clock.advance(10)
    client.values[LIVENESS_NODE] = None
    assert await manager.check() == []  # a bad probe: the count out starts over
    del client.values[LIVENESS_NODE]
    for _ in range(2):
        clock.advance(10)
        assert await manager.check() == []
    assert manager.status()["connections"]["WHK01"]["clock_state"] == "CLOCK_UNREADABLE"
    clock.advance(10)
    actions = await manager.check()
    assert len(actions) == 1 and "back inside tolerance class T0" in actions[0]
    assert actions[0].endswith("WHK01: reconnected (clock back inside tolerance)")

    conn = manager.status()["connections"]["WHK01"]
    assert conn["clock_state"] == "OK" and conn["connected"] is True
    assert conn["provider_state"] == "running" and conn["last_error"] is None
    assert conn["clock_refusals"] == 1 and manager.status()["clock_refused"] == []
    assert seen[-1] == ("WHK01", "CLOCK_UNREADABLE", "OK") and len(seen) == 2
    assert client.callbacks  # subscribed again: delivery resumed
    await io.write_tag(SP, 151.0)
    assert client.values[SP_NODE] == 151.0
    await manager.stop()


async def test_three_probes_out_of_tolerance_refuse_with_the_offset_and_the_class() -> None:
    """CLOCK_OUT_OF_TOLERANCE is judged against the class each link declares (P-8)."""
    registry = await registry_with_tags()
    clock = Clock()
    governance = TimeGovernance(
        time_source="hub-ntp",
        sync_protocol="ntp",
        source_timestamp_origin="server",
        tolerance_class="T0",
        connections=[ConnectionTimeGovernance(name="WHK02", tolerance_class="it-wan")],
    )
    manager, clients = make(
        [
            spec(liveness_interval_seconds=10),  # the FACTS default: T0, 10 ms
            spec("WHK02", liveness_interval_seconds=10),  # its FACTS entry: it-wan, 100 ms
            spec("WHK03", liveness_interval_seconds=10, tolerance_class="edge-mqtt"),  # its spec
        ],
        registry,
        clock=clock,
        time_governance=governance,
    )
    seen: list[tuple[str, str, str]] = []
    manager.add_clock_listener(lambda name, t: seen.append((name, t.previous, t.state)))
    await manager.start()
    for client in clients.values():  # every server is 50 ms ahead of Forge
        client.server_now = lambda: clock.t + timedelta(milliseconds=50)

    assert await manager.check() == []
    clock.advance(10)
    assert await manager.check() == []
    clock.advance(10)
    actions = await manager.check()
    assert len(actions) == 1 and actions[0].startswith("WHK01: CLOCK_OUT_OF_TOLERANCE: ")
    assert "server:WHK01 is +0.050000 s from Forge's clock after 3 consecutive probes" in actions[0]
    assert "tolerance class T0 allows 0.01 s" in actions[0]

    status = manager.status()
    assert status["clock_refused"] == ["WHK01"] and status["connected"] == 2
    connections = status["connections"]
    assert connections["WHK01"]["clock_state"] == "CLOCK_OUT_OF_TOLERANCE"
    assert connections["WHK01"]["server_clock"]["tolerance_seconds"] == 0.010
    # the same 50 ms is inside the classes the other two links declare
    assert connections["WHK02"]["clock_state"] == "OK" and connections["WHK02"]["connected"]
    assert connections["WHK02"]["clock_gate"]["tolerance_class"] == "it-wan"
    assert connections["WHK03"]["clock_state"] == "OK"
    assert connections["WHK03"]["clock_gate"]["tolerance_seconds"] == 0.500
    assert seen == [("WHK01", "OK", "CLOCK_OUT_OF_TOLERANCE")]

    # while refused, a probe that fails counts as unreadable; three of them change the cause
    clients["WHK01"].down = True
    for _ in range(2):
        clock.advance(10)
        assert await manager.check() == []
    assert manager.status()["connections"]["WHK01"]["probe_failures"] == 2
    clock.advance(10)
    actions = await manager.check()
    assert len(actions) == 1 and actions[0].startswith("WHK01: CLOCK_UNREADABLE: ")
    assert "the probe failed: ConnectionError" in actions[0]
    conn = manager.status()["connections"]["WHK01"]
    assert conn["clock_state"] == "CLOCK_UNREADABLE" and conn["clock_refusals"] == 1
    assert conn["restarts"] == 0 and conn["next_retry_at"] is None  # no restart loop
    assert seen[-1] == ("WHK01", "CLOCK_OUT_OF_TOLERANCE", "CLOCK_UNREADABLE")
    await manager.stop()


async def test_a_listener_that_fails_does_not_hide_the_refusal(
    caplog: pytest.LogCaptureFixture,
) -> None:
    registry = await registry_with_tags()
    clock = Clock()
    manager, clients = make([spec(liveness_interval_seconds=10)], registry, clock=clock)
    told: list[str] = []

    def broken(name: str, transition: Any) -> None:
        msg = "listener down"
        raise RuntimeError(msg)

    async def awaited(name: str, transition: Any) -> None:
        told.append(transition.state)

    manager.add_clock_listener(broken)
    manager.add_clock_listener(awaited)  # a coroutine listener is awaited
    await manager.start()
    clients["WHK01"].values[LIVENESS_NODE] = None
    with caplog.at_level(logging.ERROR, logger="forge.modules.ot.control.connections"):
        for _ in range(3):
            await manager.check()
            clock.advance(10)
    assert told == ["CLOCK_UNREADABLE"]
    assert manager.status()["connections"]["WHK01"]["clock_state"] == "CLOCK_UNREADABLE"
    # never silent: the refusal is an error line of its own, with the cause
    assert (
        "PLC WHK01 refused, CLOCK_UNREADABLE: clock server:WHK01 could not be read" in caplog.text
    )
    assert "clock state listener failed for WHK01" in caplog.text
    await manager.stop()
