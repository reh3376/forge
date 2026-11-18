"""The FMTS conformance kit: a reference hub and the checks a module runs against it.

Four of the eleven module requirements can only be checked on a running module
(``docs/decisions/forge-module-requirements.md``, D-12; BACKLOG FB-137):

    M-4  implements the time exchange and reports its measurement
    M-5  fails closed on a bad clock or a hub refusal, with the cause on its health
    M-6  stamps UTC and never invents a source time
    M-7  reports health with refusals by cause

The kit runs the real hub servicer (:class:`~forge.transport.hub_ingest.HubIngestServicer`)
on clocks it controls, so a refusal that takes three probes a second apart on a plant
network takes no time here. The module is reached through a :class:`ModuleDriver`,
which is the only part written per kind of module. :class:`PythonAdapterDriver` drives
any ``AdapterBase`` through the transport it ships with (``GrpcTransportAdapter`` over a
``SpokeClient``). A driver for a module in another process or language needs the
reference hub served on a socket and real time between probes; neither exists yet
(FB-150), so those modules are still reported as not checked.

    verdicts = await run_conformance(
        lambda hub: PythonAdapterDriver(hub, WhkWmsAdapter, params=..., events=...)
    )
"""

from __future__ import annotations

import importlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, Protocol

from forge.core.clock import ClockRefusedError
from forge.governance.shared.runner import FxTSVerdict, SpecViolation, VerdictStatus
from forge.ingest.pipeline import IngestPipeline, InMemoryRecordSink
from forge.transport.hub_ingest import HubIngestServicer
from forge.transport.spoke_client import InMemoryChannel
from forge.transport.transport_adapter import GrpcTransportAdapter

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable
    from pathlib import Path

    from forge.adapters.base.interface import AdapterBase
    from forge.core.clock import SpokeTime

#: The skew the kit gives a module's clock to have the hub refuse it. Every tolerance
#: class is tighter than this (the widest, ``it-wan``, allows 100 ms; one-way 500 ms).
BAD_CLOCK_SECONDS = 5.0
#: Probes a second apart: the hub counts at most one probe a second for a spoke.
PROBE_SPACING_SECONDS = 1.5
#: The hub refuses after three probes outside the class and readmits after three inside.
PROBES_TO_CHANGE_STATE = 3
OUT_OF_TOLERANCE = "clock_out_of_tolerance"

CHECKS: dict[str, str] = {
    "M-4": "implements the time exchange and reports its measurement",
    "M-5": "fails closed on a bad clock or a hub refusal, with the cause on its health",
    "M-6": "stamps UTC and never invents a source time",
    "M-7": "reports health with refusals by cause",
}


class KitClocks:
    """One true time the kit moves; the module's clock is offset from it by ``skew``."""

    def __init__(self, skew_seconds: float = 0.0) -> None:
        self.t = datetime(2026, 6, 1, 12, tzinfo=UTC)
        self.skew = timedelta(seconds=skew_seconds)

    def _tick(self) -> datetime:
        # each reading moves time 1 ms, so an exchange has a round trip to measure
        self.t += timedelta(milliseconds=1)
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += timedelta(seconds=seconds)

    def hub(self) -> datetime:
        return self._tick()

    def module(self) -> datetime:
        return self._tick() + self.skew


@dataclass
class WireRequest:
    """What one request from the module carried, as the hub received it."""

    rpc: str
    transmit_time: datetime | None
    offset_seconds: float | None
    round_trip_seconds: float | None
    measured_at: datetime | None

    @property
    def reports_measurement(self) -> bool:
        return (
            self.offset_seconds is not None
            and self.round_trip_seconds is not None
            and self.measured_at is not None
        )


class ReferenceHub:
    """The real hub servicer on the kit's clocks, with a record of what reached it."""

    def __init__(self, clocks: KitClocks | None = None) -> None:
        self.clocks = clocks or KitClocks()
        self.sink = InMemoryRecordSink()
        self.servicer = HubIngestServicer(
            IngestPipeline(fallback_sink=self.sink, clock=self.clocks.hub),
            batch_size=1,  # the in-memory channel has no end-of-stream flush
        )
        self.wire: list[WireRequest] = []
        self._record("Register", self.servicer.register)
        self._record("Health", self.servicer.health)
        self._record("Ingest", self.servicer.begin_ingest)

    def _record(self, rpc: str, method: Callable[..., Awaitable[Any]]) -> None:
        async def recorded(*args: Any, spoke_time: SpokeTime | None = None, **kwargs: Any) -> Any:
            self.wire.append(
                WireRequest(
                    rpc=rpc,
                    transmit_time=getattr(spoke_time, "transmit_time", None),
                    offset_seconds=getattr(spoke_time, "offset_seconds", None),
                    round_trip_seconds=getattr(spoke_time, "round_trip_seconds", None),
                    measured_at=getattr(spoke_time, "measured_at", None),
                )
            )
            if spoke_time is None:
                return await method(*args, **kwargs)
            return await method(*args, spoke_time=spoke_time, **kwargs)

        setattr(self.servicer, method.__name__, recorded)

    def channel(self) -> InMemoryChannel:
        return InMemoryChannel(self.servicer)

    def clock_state(self, adapter_id: str) -> str:
        return self.servicer.gates.state(adapter_id)

    def two_way(self, adapter_id: str) -> bool:
        return self.servicer.pipeline.offsets.measured_two_way(adapter_id)


class ModuleDriver(Protocol):
    """How the kit reaches one module. The only part written per kind of module."""

    adapter_id: str

    async def connect(self) -> None:
        """Register, Configure and Start. Raises ``ClockRefusedError`` when refused."""

    async def probe(self) -> None:
        """Send one Health to the hub."""

    async def send(self) -> int:
        """Send what the module has to send; the count. Raises when the hub refuses."""

    async def own_health(self) -> dict[str, Any]:
        """The module's own health report: ``state``, ``refusals``, ``last_refusal``."""

    async def close(self) -> None:
        """Release the module."""


@dataclass
class PythonAdapterDriver:
    """Drives an ``AdapterBase`` through the transport Python modules ship with."""

    hub: ReferenceHub
    factory: Callable[[], AdapterBase]
    params: dict[str, Any] = field(default_factory=dict)
    #: Raw source events for ``inject_records``; without them the module sends nothing
    #: and M-6 has no record to look at.
    events: list[dict[str, Any]] = field(default_factory=list)
    adapter: AdapterBase = field(init=False)
    transport: GrpcTransportAdapter = field(init=False)

    def __post_init__(self) -> None:
        self.adapter = self.factory()
        self.transport = GrpcTransportAdapter(
            adapter=self.adapter, channel=self.hub.channel(), now=self.hub.clocks.module
        )

    @property
    def adapter_id(self) -> str:
        return self.adapter.adapter_id

    async def connect(self) -> None:
        await self.transport.register()
        await self.transport.configure(dict(self.params))
        await self.transport.start()

    async def probe(self) -> None:
        await self.transport.health()

    async def send(self) -> int:
        inject = getattr(self.adapter, "inject_records", None)
        if callable(inject):
            inject([dict(event) for event in self.events])
        return await self.transport.collect_and_stream()

    async def own_health(self) -> dict[str, Any]:
        return (await self.adapter.health()).model_dump(mode="json")

    async def close(self) -> None:
        await self.transport.close()


#: Where a module's kit fixture lives, relative to the repository root: optional
#: connection parameters (``params``) and raw source events (``events``).
FIXTURES_DIR = "tests/governance/fmts/conformance"


def adapter_module_name(source_path: str) -> str | None:
    """The importable module of a Python adapter's ``adapter.py``, from its source path.

    ``src/forge/adapters/forge_wms`` gives ``forge.adapters.forge_wms.adapter``. Only
    Forge's own package is imported; any other path gives None.
    """
    parts = [part for part in source_path.strip("/").split("/") if part]
    if len(parts) < 3 or parts[0] != "src" or parts[1] != "forge":
        return None
    if not all(part.isidentifier() for part in parts[1:]):
        return None
    return ".".join([*parts[1:], "adapter"])


def find_adapter_class(module_name: str) -> Callable[[], AdapterBase]:
    """The one ``AdapterBase`` subclass a Python adapter's ``adapter.py`` defines."""
    from forge.adapters.base.interface import AdapterBase

    module = importlib.import_module(module_name)
    found = [
        value
        for value in vars(module).values()
        if isinstance(value, type)
        and issubclass(value, AdapterBase)
        and value is not AdapterBase
        and value.__module__ == module.__name__
    ]
    if len(found) != 1:
        msg = f"{module_name} defines {len(found)} adapter classes; the template has exactly one"
        raise ValueError(msg)
    return found[0]


def load_fixture(repo_root: Path, module_id: str) -> dict[str, Any]:
    """The module's kit fixture, or an empty one when it has none."""
    path = repo_root / FIXTURES_DIR / f"{module_id}.json"
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def placeholder_params(manifest: dict[str, Any]) -> dict[str, str]:
    """A value for every required connection parameter, so the module can be configured.

    The kit never connects the module to its source, so the values only have to be
    well-formed. Hosts are under ``.invalid`` (RFC 2606), which resolves nowhere.
    """
    params: dict[str, str] = {}
    for param in manifest.get("connection_params", []):
        if not param.get("required") or param.get("default") is not None:
            continue
        name = str(param.get("name", ""))
        if "url" in name:
            scheme = "amqp" if "rabbit" in name or "amqp" in name else "http"
            if "ws" in name.split("_"):
                scheme = "ws"
            params[name] = f"{scheme}://conformance.invalid"
        elif "host" in name:
            params[name] = "conformance.invalid"
        elif "port" in name:
            params[name] = "1"
        else:
            params[name] = "conformance"
    return params


# ---------------------------------------------------------------------------
# The checks
# ---------------------------------------------------------------------------

DriverFactory = "Callable[[ReferenceHub], ModuleDriver]"


def _verdict(
    requirement: str,
    violations: list[SpecViolation],
    ok: str,
    *,
    evidence: dict[str, Any] | None = None,
) -> FxTSVerdict:
    check = f"fmts:{requirement.lower().replace('-', '')}"
    ref = f"FMTS/baseline/{requirement}"
    if violations:
        head = "; ".join(v.message for v in violations[:3])
        more = f" (+{len(violations) - 3} more)" if len(violations) > 3 else ""
        return FxTSVerdict(
            check_id=check,
            spec_ref=ref,
            status=VerdictStatus.FAIL,
            message=f"{len(violations)} violation(s): {head}{more}",
            violations=violations,
            evidence=evidence or {},
        )
    return FxTSVerdict(
        check_id=check, spec_ref=ref, status=VerdictStatus.PASS, message=ok, evidence=evidence or {}
    )


def _violation(field_name: str, message: str) -> SpecViolation:
    return SpecViolation(field=field_name, message=message)


async def _probes(hub: ReferenceHub, driver: ModuleDriver, count: int) -> None:
    for _ in range(count):
        hub.clocks.advance(PROBE_SPACING_SECONDS)
        await driver.probe()


async def _refused(send: Callable[[], Awaitable[Any]]) -> str | None:
    """The cause when the hub refuses the call, None when the call went through."""
    try:
        await send()
    except ClockRefusedError as exc:
        return exc.cause
    return None


async def check_m4(make: Callable[[ReferenceHub], ModuleDriver]) -> FxTSVerdict:
    """Every Register, Health and Ingest carries T1, and the last measurement once there is one."""
    hub = ReferenceHub()
    driver = make(hub)
    violations: list[SpecViolation] = []
    try:
        await driver.connect()
        await _probes(hub, driver, 2)
        await driver.send()
    finally:
        await driver.close()
    seen = {request.rpc for request in hub.wire}
    violations.extend(
        _violation(rpc, f"the module sent no {rpc} to the hub")
        for rpc in ("Register", "Health", "Ingest")
        if rpc not in seen
    )
    violations.extend(
        _violation(
            f"{request.rpc}[{index}]",
            f"{request.rpc} carried no transmit time (T1 of the exchange)",
        )
        for index, request in enumerate(hub.wire)
        if request.transmit_time is None
    )
    # the first request has nothing to report; every later one reports the exchange before it
    violations.extend(
        _violation(
            f"{request.rpc}[{index}]",
            f"{request.rpc} did not report the measurement of the exchange before it "
            "(offset, round trip, measured at)",
        )
        for index, request in enumerate(hub.wire)
        if index > 0 and not request.reports_measurement
    )
    if not hub.two_way(driver.adapter_id):
        violations.append(
            _violation("hub", "the hub holds no two-way measurement of the module's clock")
        )
    return _verdict(
        "M-4",
        violations,
        f"{len(hub.wire)} request(s) carried the exchange; the hub measures the module's "
        "clock two-way.",
        evidence={"requests": [request.rpc for request in hub.wire]},
    )


async def check_m5_and_m7(
    make: Callable[[ReferenceHub], ModuleDriver],
) -> tuple[FxTSVerdict, FxTSVerdict]:
    """A module with a bad clock is refused, sends nothing, says why, and comes back."""
    hub = ReferenceHub()
    driver = make(hub)
    closed: list[SpecViolation] = []
    health: list[SpecViolation] = []
    evidence: dict[str, Any] = {}
    try:
        await driver.connect()
        before = await driver.own_health()
        for key in ("state", "refusals", "last_refusal"):
            if key not in before:
                health.append(_violation(key, f"the module's health has no '{key}'"))
        if before.get("refusals"):
            health.append(
                _violation("refusals", f"refusals before any refusal: {before.get('refusals')}")
            )
        delivered_before = len(hub.sink)

        hub.clocks.skew = timedelta(seconds=BAD_CLOCK_SECONDS)  # the module's clock goes bad
        await _probes(hub, driver, PROBES_TO_CHANGE_STATE + 1)
        evidence["hub_clock_state"] = hub.clock_state(driver.adapter_id)
        if evidence["hub_clock_state"] != "CLOCK_OUT_OF_TOLERANCE":
            closed.append(
                _violation(
                    "hub",
                    f"the hub did not refuse a clock {BAD_CLOCK_SECONDS} s out: its state is "
                    f"{evidence['hub_clock_state']}; the module is not reporting its "
                    "measurement",
                )
            )
        cause = await _refused(driver.send)
        evidence["refused_cause"] = cause
        if cause != OUT_OF_TOLERANCE:
            closed.append(
                _violation(
                    "Ingest",
                    f"a send on a refused clock was not refused for {OUT_OF_TOLERANCE} "
                    f"(got {cause!r})",
                )
            )
        if len(hub.sink) != delivered_before:
            closed.append(
                _violation("Ingest", "records reached the hub while the module was refused")
            )
        after = await driver.own_health()
        evidence["own_health"] = {k: after.get(k) for k in ("state", "refusals", "last_refusal")}
        refusals = after.get("refusals") or {}
        if not refusals.get(OUT_OF_TOLERANCE):
            message = (
                f"after the hub refused it, the module's health counts no refusal under "
                f"'{OUT_OF_TOLERANCE}' (refusals: {refusals}); a refusal is never silent"
            )
            closed.append(_violation("refusals", message))
            health.append(_violation("refusals", message))
        if not after.get("last_refusal"):
            health.append(_violation("last_refusal", "the module's health names no last refusal"))
        if str(after.get("state", "")).upper() == "HEALTHY":
            health.append(
                _violation("state", "the module still reports HEALTHY while the hub refuses it")
            )

        hub.clocks.skew = timedelta(0)  # the clock is put right
        # the first probe reports the exchange taken before the fix, then three good ones
        await _probes(hub, driver, PROBES_TO_CHANGE_STATE + 1)
        if hub.clock_state(driver.adapter_id) != "OK":
            closed.append(
                _violation(
                    "hub",
                    "the module was not readmitted after its clock was put right: it must "
                    "go on exchanging time while refused",
                )
            )
        elif await _refused(driver.send) is not None:
            closed.append(_violation("Ingest", "a send after readmission was still refused"))
    finally:
        await driver.close()
    return (
        _verdict(
            "M-5",
            closed,
            "Refused on a bad clock: nothing was delivered, the cause is on the module's "
            "health, and it was readmitted when the clock was put right.",
            evidence=evidence,
        ),
        _verdict(
            "M-7",
            health,
            "The module's health reports its state and its refusals by cause.",
            evidence=evidence,
        ),
    )


async def check_m6(make: Callable[[ReferenceHub], ModuleDriver]) -> FxTSVerdict:
    """Every record the module sends is stamped in UTC, by the module's clock as well."""
    hub = ReferenceHub()
    driver = make(hub)
    try:
        await driver.connect()
        sent = await driver.send()
    finally:
        await driver.close()
    if sent == 0 or len(hub.sink) == 0:
        return FxTSVerdict(
            check_id="fmts:m6",
            spec_ref="FMTS/baseline/M-6",
            status=VerdictStatus.SKIP,
            message=(
                "NOT CHECKED: M-6 (stamps UTC and never invents a source time): the module "
                "sent no record. Its spec names no sample events for the conformance kit."
            ),
            evidence={"waived": False, "unverified": True, "blocked_on": "sample events"},
        )
    violations: list[SpecViolation] = []
    for index, record in enumerate(hub.sink.records):
        stamps = record.timestamp
        for name in ("source_time", "server_time", "spoke_time"):
            value = getattr(stamps, name)
            if value is None:
                if name == "spoke_time":
                    violations.append(
                        _violation(
                            f"records[{index}].spoke_time",
                            "the record does not carry the module's own send time",
                        )
                    )
                continue
            if value.utcoffset() != timedelta(0):
                violations.append(
                    _violation(
                        f"records[{index}].{name}",
                        f"{name} is not UTC and timezone-aware: {value.isoformat()}",
                    )
                )
    return _verdict(
        "M-6",
        violations,
        f"{len(hub.sink)} record(s): every stamp is UTC and each carries the module's send "
        "time. Not covered: a source event without a stamp.",
        evidence={"records": len(hub.sink)},
    )


async def run_conformance(
    make: Callable[[ReferenceHub], ModuleDriver],
) -> dict[str, FxTSVerdict]:
    """Run M-4 to M-7 on one module; a fresh hub and a fresh module per check."""
    results: dict[str, FxTSVerdict] = {}

    async def guarded(requirement: str, check: Callable[[], Awaitable[Any]]) -> Any:
        try:
            return await check()
        except Exception as exc:  # a module that breaks under the kit fails the check
            return _verdict(
                requirement,
                [_violation("kit", f"{type(exc).__name__}: {exc}")],
                "",
            )

    results["M-4"] = await guarded("M-4", lambda: check_m4(make))
    both = await guarded("M-5", lambda: check_m5_and_m7(make))
    if isinstance(both, tuple):
        results["M-5"], results["M-7"] = both
    else:
        results["M-5"] = both
        results["M-7"] = both.model_copy(
            update={"check_id": "fmts:m7", "spec_ref": "FMTS/baseline/M-7"}
        )
    results["M-6"] = await guarded("M-6", lambda: check_m6(make))
    return results
