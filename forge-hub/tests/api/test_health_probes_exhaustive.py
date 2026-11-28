"""The hub's health probes on every sequence in a bound (FB-326).

Two promises of ``HealthOrchestrator`` are laws:

- a component never has more than one probe in flight, however many health calls arrive and
  whenever they arrive, leave, or their probes end;
- every health call is answered by the check's limit, which runs from the start of the probe
  it waits on, and never with an answer that came before the call.

This is not a model of the orchestrator. It drives the real ``HealthOrchestrator`` on an
event loop whose clock moves only when the test moves it, with two stand-in components whose
probes end when the test says so: ``db`` is an async check, as the Postgres, TimescaleDB,
Neo4j, Redis and RabbitMQ checks are, and ``store`` is a blocking probe, as Kafka's and the
object store's are. After every step it compares what the orchestrator did with ``Promise``,
a statement of the promise that shares no code with it.

Every sequence of ``DEPTH`` steps is run: 2,385 at the default depth of 5, in about a second.
For a change to the orchestrator itself, the deeper run (64,035 sequences, half a minute)::

    export FORGE_HEALTH_PROBES_DEPTH=7
    uv run pytest forge-hub/tests/api/test_health_probes_exhaustive.py -q

The threads themselves, with the real S3 client, are ``test_health_probe_threads.py``.
"""

from __future__ import annotations

import asyncio
import copy
import os
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import pytest

from forge_hub.api import health
from forge_hub.api.health import ComponentHealth, ComponentStatus, HealthOrchestrator

if TYPE_CHECKING:
    from collections.abc import Iterator

LIMIT = health._CHECK_TIMEOUT
DEPTH = int(os.environ.get("FORGE_HEALTH_PROBES_DEPTH", "5"))
#: Health calls in one sequence. Three is enough for one to leave while two others wait.
MAX_CALLS = 3
COMPONENTS = ("db", "store")
#: The steps. Time moves by 1 s (inside the limit) or by 3 s (to the limit, to the second).
STEPS = ("call", "leave", "+1", "+3", "db ok", "db fails", "store ok", "store fails")
#: Where the stepped clock starts. Any value: every time in a sequence is this plus whole seconds.
START = 1000.0
#: How many sequences there are at each depth, so an enumeration that shrinks is noticed.
SEQUENCES = {3: 80, 4: 444, 5: 2385, 6: 12539, 7: 64035}


# -- the promise, stated without the orchestrator's code ---------------------


@dataclass
class ExpectedCall:
    arrived: float
    #: for each component, when the probe this call waits on started
    probe: dict[str, float] = field(default_factory=dict)
    #: for each component, what the call reports; ``None`` while it is still waiting
    report: dict[str, str | None] = field(default_factory=dict)
    left: bool = False

    @property
    def answered(self) -> bool:
        return all(self.report[component] is not None for component in COMPONENTS)


class Promise:
    """What the orchestrator promises.

    A component has one probe in flight or none. A call waits on the probe in flight, or
    starts one when there is none. It reports what that probe ends with, if it ends before
    the limit counted from the probe's start, and unreachable at the limit. An async probe
    is cancelled at its limit, so its place is free; a blocking probe keeps its place until
    it ends, and a call that finds it past its limit is told so at once. A caller that
    leaves changes nothing for anybody else.
    """

    def __init__(self) -> None:
        self.in_flight: dict[str, float | None] = dict.fromkeys(COMPONENTS)
        self.starts: dict[str, list[float]] = {component: [] for component in COMPONENTS}
        self.calls: list[ExpectedCall] = []

    def can(self, step: str) -> bool:
        if step == "call":
            return len(self.calls) < MAX_CALLS
        if step == "leave":
            return any(not call.left and not call.answered for call in self.calls)
        if step in ("+1", "+3"):
            return True
        return self.in_flight[step.split()[0]] is not None

    def apply(self, step: str, now: float) -> float:
        """Take one step at time ``now``; the time after it."""
        if step == "call":
            call = ExpectedCall(arrived=now)
            for component in COMPONENTS:
                if self.in_flight[component] is None:
                    self.in_flight[component] = now
                    self.starts[component].append(now)
                started = self.in_flight[component]
                assert started is not None
                call.probe[component] = started
                call.report[component] = "unreachable" if now >= started + LIMIT else None
            self.calls.append(call)
        elif step == "leave":
            next(call for call in self.calls if not call.left and not call.answered).left = True
        elif step in ("+1", "+3"):
            now += float(step)
            for component in COMPONENTS:
                started = self.in_flight[component]
                if started is not None and now >= started + LIMIT:
                    self._tell(component, started, "unreachable")
                    if component == "db":
                        self.in_flight["db"] = None
        else:
            component, how = step.split()
            started = self.in_flight[component]
            assert started is not None
            self._tell(component, started, "ok" if how == "ok" else "unreachable")
            self.in_flight[component] = None
        return now

    def _tell(self, component: str, started: float, report: str) -> None:
        for call in self.calls:
            if call.probe[component] == started and call.report[component] is None:
                call.report[component] = report


# -- the real orchestrator, on a clock the test moves ------------------------


class SteppedLoop(asyncio.SelectorEventLoop):
    """An event loop whose clock moves only when the test moves it."""

    def __init__(self) -> None:
        super().__init__()
        self.now = START

    def time(self) -> float:
        return self.now


def settle(loop: SteppedLoop) -> None:
    """Run everything that is ready and every timer that is due, until nothing moves."""
    for _ in range(200):
        loop.call_soon(loop.stop)
        loop.run_forever()
        due = bool(loop._scheduled) and loop._scheduled[0].when() <= loop.now
        if not loop._ready and not due:
            return
    raise AssertionError("the event loop did not come to rest")


@dataclass
class ProbeRun:
    """One probe the orchestrator started, as the stand-in component saw it."""

    component: str
    started: float
    #: what ends it: the future a ``db`` check awaits, or the callback of a ``store`` probe
    finish: Any
    ended: float | None = None
    how: str | None = None


class World:
    def __init__(self, orchestrator: type[HealthOrchestrator] = HealthOrchestrator) -> None:
        self.loop = SteppedLoop()
        self.runs: dict[str, list[ProbeRun]] = {component: [] for component in COMPONENTS}
        self.calls: list[asyncio.Task[Any]] = []
        self.left: set[int] = set()
        self.orchestrator = orchestrator(start_blocking=self._start_store)
        self.orchestrator.register("db", self._db)
        # never called: _start_store stands in for the thread that would run it
        self.orchestrator.register_blocking("store", dict)

    async def _db(self) -> ComponentHealth:
        run = ProbeRun("db", self.loop.now, finish=self.loop.create_future())
        self.runs["db"].append(run)
        try:
            return await run.finish
        except asyncio.CancelledError:
            if run.ended is None:
                run.ended, run.how = self.loop.now, "cancelled"
            raise

    def _start_store(self, name: str, probe: Any, ended: Any) -> None:
        self.runs["store"].append(ProbeRun("store", self.loop.now, finish=ended))

    def out(self, component: str) -> list[ProbeRun]:
        return [run for run in self.runs[component] if run.ended is None]

    def step(self, step: str) -> None:
        if step == "call":
            self.calls.append(self.loop.create_task(self.orchestrator.check_all()))
        elif step == "leave":
            for index, task in enumerate(self.calls):
                if index not in self.left and not task.done():
                    self.left.add(index)
                    task.cancel()
                    break
        elif step in ("+1", "+3"):
            self.loop.now += float(step)
        else:
            component, how = step.split()
            for run in self.out(component)[:1]:
                run.ended, run.how = self.loop.now, how
                if component == "store":
                    run.finish({"answered": True} if how == "ok" else OSError("refused"))
                elif how == "ok":
                    run.finish.set_result(ComponentHealth(name="db", status=ComponentStatus.OK))
                else:
                    run.finish.set_exception(OSError("refused"))
        settle(self.loop)

    def close(self) -> None:
        for task in asyncio.all_tasks(self.loop):
            task.cancel()
        settle(self.loop)
        self.loop.close()


def difference(world: World, promise: Promise) -> str | None:
    """``None`` when the orchestrator did what it promises; otherwise what differs."""
    for component in COMPONENTS:
        started = [run.started for run in world.runs[component]]
        if started != promise.starts[component]:
            return f"{component} probes started at {started}; promised {promise.starts[component]}"
        out = len(world.out(component))
        if out > 1:
            return f"{out} {component} probes in flight at once"
        promised = int(promise.in_flight[component] is not None)
        if out != promised:
            return f"{out} {component} probe(s) in flight; promised {promised}"
    for index, (expected, task) in enumerate(zip(promise.calls, world.calls, strict=True)):
        if expected.left:
            continue
        if task.done() and (task.cancelled() or task.exception() is not None):
            return f"call {index} ended without an answer; promised {expected.report}"
        if task.done() != expected.answered:
            got = "answered" if task.done() else "still waiting"
            return f"call {index} is {got}; promised {expected.report}"
        if task.done():
            reported = {c: task.result().components[c]["status"] for c in COMPONENTS}
            if reported != expected.report:
                return f"call {index} reported {reported}; promised {expected.report}"
    return None


def sequences(depth: int) -> Iterator[tuple[str, ...]]:
    """Every sequence of ``depth`` steps in which each step can happen when it is reached."""

    def extend(prefix: tuple[str, ...], promise: Promise, now: float) -> Iterator[tuple[str, ...]]:
        if len(prefix) == depth:
            yield prefix
            return
        for step in STEPS:
            if promise.can(step):
                after = copy.deepcopy(promise)
                yield from extend((*prefix, step), after, after.apply(step, now))

    yield from extend((), Promise(), START)


def broken(
    sequence: tuple[str, ...], orchestrator: type[HealthOrchestrator] = HealthOrchestrator
) -> str | None:
    """Run one sequence on the orchestrator; ``None``, or where it stopped keeping the promise."""
    world, promise = World(orchestrator), Promise()
    try:
        for index, step in enumerate(sequence):
            promise.apply(step, world.loop.now)
            world.step(step)
            found = difference(world, promise)
            if found is not None:
                return f"after [{', '.join(sequence[: index + 1])}]: {found}"
        return None
    finally:
        world.close()


def test_every_sequence_keeps_the_promise() -> None:
    explored = 0
    for sequence in sequences(DEPTH):
        found = broken(sequence)
        assert found is None, found
        explored += 1
    assert explored == SEQUENCES.get(DEPTH, explored), (
        f"{explored} sequences at depth {DEPTH}; {SEQUENCES[DEPTH]} were expected"
    )


# -- able to fail: orchestrators that break the promise, each in one way ------


class EveryCallStartsItsOwnProbe(HealthOrchestrator):
    def _probe_for(self, loop: Any, name: str, fn: Any, blocking: bool) -> Any:
        self._in_flight.pop(name, None)
        return super()._probe_for(loop, name, fn, blocking)


class ALeavingCallerEndsTheProbe(HealthOrchestrator):
    async def _answer_within(self, loop: Any, name: str, probe: Any) -> ComponentHealth:
        remaining = probe.started + LIMIT - loop.time()
        if remaining <= 0:
            return self._not_returned(loop, name, probe, found_late=True)
        try:
            return await asyncio.wait_for(probe.answer, timeout=remaining)  # not shielded
        except TimeoutError:
            return self._not_returned(loop, name, probe, found_late=False)


class ThePlaceIsFreedAtTheLimit(HealthOrchestrator):
    def _not_returned(self, loop: Any, name: str, probe: Any, *, found_late: bool) -> Any:
        self._in_flight.pop(name, None)
        return super()._not_returned(loop, name, probe, found_late=found_late)


class TheLastOkIsRemembered(HealthOrchestrator):
    def _end(self, name: str, probe: Any, outcome: Any) -> None:
        super()._end(name, probe, outcome)
        if not probe.answer.cancelled() and probe.answer.result().status == ComponentStatus.OK:
            self.__dict__.setdefault("last_ok", {})[name] = probe.answer.result()

    def _not_returned(self, loop: Any, name: str, probe: Any, *, found_late: bool) -> Any:
        remembered = self.__dict__.get("last_ok", {}).get(name)
        return remembered or super()._not_returned(loop, name, probe, found_late=found_late)


class ALateCallWaitsAgain(HealthOrchestrator):
    async def _answer_within(self, loop: Any, name: str, probe: Any) -> ComponentHealth:
        try:
            # the limit counted from this call, not from the start of the probe
            return await asyncio.wait_for(asyncio.shield(probe.answer), timeout=LIMIT)
        except TimeoutError:
            return self._not_returned(loop, name, probe, found_late=False)


BROKEN = (
    EveryCallStartsItsOwnProbe,
    ALeavingCallerEndsTheProbe,
    ThePlaceIsFreedAtTheLimit,
    TheLastOkIsRemembered,
    ALateCallWaitsAgain,
)


@pytest.mark.parametrize("orchestrator", BROKEN, ids=lambda cls: cls.__name__)
def test_an_orchestrator_that_breaks_the_promise_is_caught(
    orchestrator: type[HealthOrchestrator],
) -> None:
    """A check that has never been seen to fail proves nothing: each broken orchestrator must
    give a counterexample within the same bound."""
    found = next((f for s in sequences(DEPTH) if (f := broken(s, orchestrator)) is not None), None)
    assert found is not None, f"{orchestrator.__name__} kept the promise on every sequence"
