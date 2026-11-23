"""The two-step review gate, checked over every sequence and every interleaving in a bound.

The promise (FB-074): on a tag whose confirmation is two-step, an operator's value reaches
the process controller only when that exact write was staged and is committed once, by the
same person, with the same value, before the review token expires. A break is an
unreviewed or repeated write to a PLC.

The ordinary tests in ``test_review.py`` check the cases someone thought of. This file
drives the real ``ControlWriteEngine`` and ``WriteReviewer`` (nothing is modelled by hand)
through:

- every sequence of stage, commit, cancel, clock and interlock steps up to ``DEPTH``
  (:func:`test_every_sequence_keeps_the_promise`), and
- every interleaving of commits and a cancel that run at the same time, stepping each
  coroutine by hand at each read or write of the controller
  (:func:`test_every_interleaving_keeps_the_promise`).

After every step the controller's write log is compared with an independent statement of
the promise (:class:`Promise`). Each property is also shown to fail on a broken variant of
the gate (``BROKEN``), because a check never seen failing proves nothing.

Bounds: two people, two values and three ways of spelling one of them, at most
``MAX_PENDING`` staged writes held, sequences of ``DEPTH`` steps (3 by default; set
``FORGE_REVIEW_GATE_DEPTH=4`` for the deeper run), and three coroutines at once. A pass
covers these bounds, not every size.

Run it: ``uv run pytest tests/modules/ot/control/test_review_gate_exhaustive.py -q``
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

import pytest

from forge.modules.ot.control import (
    ConfirmationMode,
    ControlWriteEngine,
    DataType,
    InterlockCondition,
    InterlockEngine,
    InterlockRule,
    TagWriteConfig,
    WriteAuthorizer,
    WritePermission,
    WriteRequest,
    WriteReviewer,
    WriteRole,
    WriteValidator,
)
from forge.modules.ot.control import review as review_module

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine, Iterator

SETPOINT = "Plant/Area1/Cooker01/TIT_2010/SP"  # two-step review
GUARD = "Plant/Area1/Cooker01/Pump01/Running"  # the interlock's check tag
TIMEOUT = 120.0
TICKS = (60.0, 120.0)  # half the timeout, and the timeout to the second (the boundary)
MAX_PENDING = 2
DEPTH = int(os.getenv("FORGE_REVIEW_GATE_DEPTH", "3"))
PEOPLE = ("op1", "op2")
STAGED_VALUES = (150.0, 160.0)
# How a commit may spell its value: the staged values, and other spellings that the gate's
# coercion treats as equal to 150.0.
COMMIT_VALUES = (150.0, 160.0, 150, "150.0")


# ---------------------------------------------------------------------------
# The world: the real engine, a controller that logs every write, a clock
# ---------------------------------------------------------------------------


class Pause:
    """One point where another coroutine may run."""

    def __await__(self) -> Iterator[None]:
        yield


class Controller:
    """A PLC stand-in that records each write and pauses at each read and write."""

    def __init__(self) -> None:
        self.values: dict[str, Any] = {SETPOINT: 100.0, GUARD: False}
        self.writes: list[tuple[str, Any]] = []

    async def read_tag(self, tag_path: str) -> Any:
        await Pause()
        return self.values.get(tag_path)

    async def write_tag(self, tag_path: str, value: Any) -> None:
        await Pause()
        self.values[tag_path] = value
        self.writes.append((tag_path, value))


class Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 11, 22, 12, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now


@dataclass
class World:
    engine: ControlWriteEngine
    controller: Controller
    clock: Clock
    tokens: list[str] = field(default_factory=list)  # every token issued, in order

    @property
    def reviewer(self) -> WriteReviewer:
        return self.engine.reviewer


def build() -> World:
    clock = Clock()
    controller = Controller()
    validator = WriteValidator()
    validator.register_tag(
        TagWriteConfig(
            tag_path=SETPOINT,
            data_type=DataType.FLOAT,
            min_value=0.0,
            max_value=212.0,
            confirmation=ConfirmationMode.TWO_STEP_WITH_REVIEW,
        )
    )
    interlocks = InterlockEngine(tag_reader=controller)
    interlocks.add_rule(
        InterlockRule(
            rule_id="IL-GUARD",
            name="No setpoint change while the pump runs",
            target_tag_pattern="Plant/Area1/Cooker01/TIT_2010/*",
            check_tag=GUARD,
            condition=InterlockCondition.IS_TRUE,
        )
    )
    authorizer = WriteAuthorizer()
    authorizer.add_permission(
        WritePermission(permission_id="ops", area_pattern="*", tag_pattern="**")
    )
    reviewer = WriteReviewer(validator, timeout_seconds=TIMEOUT, max_pending=MAX_PENDING, now=clock)
    engine = ControlWriteEngine(
        validator=validator,
        interlock_engine=interlocks,
        authorizer=authorizer,
        tag_writer=controller,
        reviewer=reviewer,
    )
    return World(engine, controller, clock)


def request(person: str, value: Any, token: str = "") -> WriteRequest:
    return WriteRequest(
        tag_path=SETPOINT,
        value=value,
        requestor=person,
        role=WriteRole.OPERATOR,
        area="cooker",
        review_token=token,
    )


def run(coroutine: Coroutine[Any, Any, Any]) -> Any:
    """Run one coroutine to its end with nothing else running."""
    try:
        while True:
            coroutine.send(None)
    except StopIteration as done:
        return done.value


# ---------------------------------------------------------------------------
# The promise, stated independently of the gate's code
# ---------------------------------------------------------------------------


@dataclass
class Staged:
    person: str
    value: float
    expires_at: datetime


@dataclass
class Promise:
    """What may reach the controller, kept from the steps alone.

    ``held`` is every staged write that may still be committed, oldest first.
    """

    held: dict[int, Staged] = field(default_factory=dict)
    guard_on: bool = False

    def stage(self, index: int, person: str, value: float, now: datetime) -> bool:
        """True when staging must issue a token (the interlock is clear)."""
        if self.guard_on:
            return False
        self.held = {i: s for i, s in self.held.items() if now < s.expires_at}
        while len(self.held) >= MAX_PENDING:
            del self.held[next(iter(self.held))]
        self.held[index] = Staged(person, value, now + timedelta(seconds=TIMEOUT))
        return True

    def commit(self, index: int | None, person: str, value: Any, now: datetime) -> float | None:
        """The value that must be written by this commit, or None when nothing may be."""
        if index is None:
            return None
        staged = self.held.pop(index, None)  # presenting a token uses it up, whatever follows
        if staged is None or now >= staged.expires_at:
            return None
        if staged.person != person or float(value) != staged.value:
            return None
        return None if self.guard_on else staged.value

    def cancel(self, index: int) -> bool:
        return self.held.pop(index, None) is not None


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Step:
    kind: str  # stage | commit | cancel | tick | guard
    person: str = ""
    value: Any = None
    token: int | str | None = None  # index of an issued token, "forged", or None

    def words(self) -> str:
        if self.kind == "stage":
            return f"{self.person} stages {self.value!r}"
        if self.kind == "commit":
            if self.token is None:
                held = "no token"
            elif self.token == "forged":
                held = "a made-up token"
            else:
                held = f"the token of staged write #{self.token}"
            return f"{self.person} commits {self.value!r} with {held}"
        if self.kind == "cancel":
            return f"staged write #{self.token} is cancelled"
        if self.kind == "tick":
            return f"{self.value:.0f} seconds pass"
        return "the interlock's pump changes state"


def steps_from(issued: int) -> list[Step]:
    """Every step that can be taken once ``issued`` tokens exist."""
    options = [Step("stage", p, v) for p in PEOPLE for v in STAGED_VALUES]
    presented: list[int | str | None] = [None, "forged", *range(issued)]
    options += [Step("commit", p, v, t) for p in PEOPLE for v in COMMIT_VALUES for t in presented]
    options += [Step("cancel", token=t) for t in range(issued)]
    options += [Step("tick", value=seconds) for seconds in TICKS]
    options.append(Step("guard"))
    return options


def apply(world: World, promise: Promise, step: Step, *, exact: bool = False) -> str | None:
    """Take one step in the real code and in the promise; a sentence when they disagree.

    ``exact`` also requires the written value to be the reviewed value itself, a float,
    and not another spelling of the same number.
    """
    before = len(world.controller.writes)
    now = world.clock.now
    if step.kind == "stage":
        outcome = run(world.engine.stage(request(step.person, step.value)))
        expected = promise.stage(len(world.tokens), step.person, step.value, now)
        if outcome.accepted:
            world.tokens.append(outcome.ticket.review_token)
        if outcome.accepted != expected:
            return f"staging {'issued' if outcome.accepted else 'refused'} a token"
        allowed: float | None = None
    elif step.kind == "commit":
        index = step.token if isinstance(step.token, int) else None
        token = (
            world.tokens[index]
            if index is not None
            else ("not-a-real-token" if step.token == "forged" else "")
        )
        run(world.engine.execute(request(step.person, step.value, token)))
        allowed = promise.commit(index, step.person, step.value, now)
    elif step.kind == "cancel":
        assert isinstance(step.token, int)
        was_pending = world.reviewer.cancel(world.tokens[step.token])
        if was_pending != promise.cancel(step.token):
            return f"cancel reported {was_pending}"
        allowed = None
    elif step.kind == "tick":
        world.clock.now += timedelta(seconds=step.value)
        allowed = None
    else:
        promise.guard_on = not promise.guard_on
        world.controller.values[GUARD] = promise.guard_on
        allowed = None

    wrote = world.controller.writes[before:]
    if allowed is None:
        if wrote:
            return f"the controller was written {wrote[0][1]!r}, and nothing may be written here"
        return None
    if not wrote:
        return f"nothing was written, and the reviewed value {allowed!r} must be"
    if len(wrote) > 1:
        return f"the controller was written {len(wrote)} times by one commit"
    value = wrote[0][1]
    try:
        same_number = float(value) == allowed
    except (TypeError, ValueError):
        same_number = False
    if not same_number:
        return f"the controller was written {value!r}; the reviewed value is {allowed!r}"
    if exact and type(value) is not float:
        return (
            f"the controller was written {value!r} ({type(value).__name__}); "
            f"the reviewed value is {allowed!r} (float)"
        )
    return None


def first_break(depth: int, *, exact: bool = False) -> tuple[list[Step], str] | None:
    """The shortest sequence of steps on which the code breaks the promise, if any."""
    for length in range(1, depth + 1):
        found = _search([], length, exact)
        if found is not None:
            return found
    return None


def _replay(prefix: list[Step], exact: bool = False) -> tuple[World, Promise, str | None]:
    world, promise = build(), Promise()
    for step in prefix:
        problem = apply(world, promise, step, exact=exact)
        if problem is not None:
            return world, promise, problem
    return world, promise, None


def _search(prefix: list[Step], length: int, exact: bool) -> tuple[list[Step], str] | None:
    world, _, problem = _replay(prefix, exact)
    if problem is not None:
        return prefix, problem
    if len(prefix) == length:
        return None
    for step in steps_from(len(world.tokens)):
        found = _search([*prefix, step], length, exact)
        if found is not None:
            return found
    return None


def count_sequences(depth: int) -> int:
    def walk(prefix: list[Step]) -> int:
        if len(prefix) == depth:
            return 1
        world, _, _ = _replay(prefix)
        return sum(walk([*prefix, step]) for step in steps_from(len(world.tokens)))

    return walk([])


def tell(steps: list[Step], problem: str) -> str:
    lines = [f"  {number}. {step.words()}" for number, step in enumerate(steps, 1)]
    return "the review gate broke its promise:\n" + "\n".join(lines) + f"\n  -> {problem}"


# ---------------------------------------------------------------------------
# Interleavings: several coroutines at once, stepped by hand
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Race:
    name: str
    actors: tuple[Step, ...]  # run at the same time against one staged write (#0)
    may_write: int  # the most writes the promise allows, in any order


RACES = (
    Race(
        "the same token committed twice at once",
        (Step("commit", "op1", 150.0, 0), Step("commit", "op1", 150.0, 0)),
        1,
    ),
    Race(
        "the same token committed three times at once",
        (
            Step("commit", "op1", 150.0, 0),
            Step("commit", "op1", 150.0, 0),
            Step("commit", "op1", 150.0, 0),
        ),
        1,
    ),
    Race(
        "a commit and a cancel of the same staged write at once",
        (Step("commit", "op1", 150.0, 0), Step("cancel", token=0)),
        1,
    ),
    Race(
        "the owner and another person commit the same token at once",
        (Step("commit", "op1", 150.0, 0), Step("commit", "op2", 150.0, 0)),
        1,
    ),
    Race(
        "a commit races a second staging by the same person",
        (Step("commit", "op1", 150.0, 0), Step("stage", "op1", 160.0)),
        1,
    ),
)


def schedules(race: Race) -> Iterator[tuple[tuple[int, ...], World, list[Any]]]:
    """Every order in which the race's coroutines can be stepped, each run on a new world.

    A schedule is the list of which actor moves next. It is grown one choice at a time and
    replayed from the start, so every interleaving at every pause is covered.
    """

    def start(world: World, step: Step) -> Coroutine[Any, Any, Any]:
        if step.kind == "commit":
            assert isinstance(step.token, int)
            return world.engine.execute(request(step.person, step.value, world.tokens[step.token]))
        if step.kind == "stage":
            return world.engine.stage(request(step.person, step.value))

        async def cancel() -> bool:
            assert isinstance(step.token, int)
            return world.reviewer.cancel(world.tokens[step.token])

        return cancel()

    def play(order: tuple[int, ...]) -> tuple[World, list[Any], set[int]]:
        world = build()
        staged = run(world.engine.stage(request("op1", 150.0)))
        world.tokens.append(staged.ticket.review_token)
        world.controller.writes.clear()
        running = {i: start(world, step) for i, step in enumerate(race.actors)}
        results: list[Any] = [None] * len(race.actors)
        for actor in order:
            try:
                running[actor].send(None)
            except StopIteration as done:
                results[actor] = done.value
                del running[actor]
        alive = set(running)
        for coroutine in running.values():
            coroutine.close()
        return world, results, alive

    def grow(order: tuple[int, ...]) -> Iterator[tuple[tuple[int, ...], World, list[Any]]]:
        world, results, alive = play(order)
        if not alive:
            yield order, world, results
            return
        for actor in sorted(alive):
            yield from grow((*order, actor))

    yield from grow(())


def first_bad_interleaving(race: Race) -> str | None:
    for order, world, results in schedules(race):
        writes = [value for tag, value in world.controller.writes if tag == SETPOINT]
        cancelled = any(
            result is True
            for step, result in zip(race.actors, results, strict=True)
            if step.kind == "cancel"
        )
        if len(writes) > race.may_write:
            return (
                f"{race.name}: with the coroutines stepped in the order {list(order)} the "
                f"controller was written {len(writes)} times ({writes}); the promise allows "
                f"{race.may_write}"
            )
        if cancelled and writes:
            return (
                f"{race.name}: in the order {list(order)} the cancel reported success and "
                f"the controller was still written {writes}"
            )
        if any(type(value) is not float for value in writes):
            return f"{race.name}: in the order {list(order)} a non-float was written: {writes}"
    return None


# ---------------------------------------------------------------------------
# The checks
# ---------------------------------------------------------------------------


def test_every_sequence_keeps_the_promise() -> None:
    found = first_break(DEPTH)
    assert found is None, tell(*found)


def test_the_value_written_is_the_value_reviewed() -> None:
    """The controller gets the reviewed float itself, not another spelling (FB-215)."""
    found = first_break(DEPTH, exact=True)
    assert found is None, tell(*found)


def test_every_interleaving_keeps_the_promise() -> None:
    for race in RACES:
        problem = first_bad_interleaving(race)
        assert problem is None, problem


def test_the_search_is_not_empty() -> None:
    """The bound is what the module's text says it is."""
    assert count_sequences(2) == sum(
        len(steps_from(1 if first.kind == "stage" else 0)) for first in steps_from(0)
    )
    assert len(steps_from(0)) == 23 and len(steps_from(2)) == 41
    assert sum(1 for _ in schedules(RACES[0])) >= 10
    assert sum(1 for _ in schedules(RACES[1])) > sum(1 for _ in schedules(RACES[0]))


# -- each property seen failing on a broken gate ------------------------------


class _KeepsTokens(dict):  # type: ignore[type-arg]
    """A pending set that hands a ticket out without removing it."""

    def pop(self, key: str, default: Any = None) -> Any:  # type: ignore[override]
        return self.get(key, default)


def _tokens_reusable(world: World, patch: pytest.MonkeyPatch) -> None:
    patch.setattr(world.reviewer, "_pending", _KeepsTokens())


def _never_expires(world: World, patch: pytest.MonkeyPatch) -> None:
    patch.setattr(review_module.ReviewTicket, "expired", lambda self, now: False)


def _any_write_matches(world: World, patch: pytest.MonkeyPatch) -> None:
    patch.setattr(world.reviewer, "_same_write", lambda ticket, request: True)


def _no_two_step(world: World, patch: pytest.MonkeyPatch) -> None:
    patch.setattr(world.reviewer, "requires_two_step", lambda tag_path: False)


BROKEN: dict[str, tuple[Callable[[World, pytest.MonkeyPatch], None], str]] = {
    "a token can be used twice": (_tokens_reusable, "nothing may be written here"),
    "a token never expires": (_never_expires, "nothing may be written here"),
    "a token is not bound to its write": (_any_write_matches, "nothing may be written here"),
    "two-step review is not required": (_no_two_step, "nothing may be written here"),
}


@pytest.mark.parametrize("name", sorted(BROKEN))
def test_a_broken_gate_is_caught(name: str, monkeypatch: pytest.MonkeyPatch) -> None:
    """Able to fail: each broken variant of the gate yields a counterexample."""
    breaker, expected = BROKEN[name]
    real_build = build

    def broken_build() -> World:
        world = real_build()
        breaker(world, monkeypatch)
        return world

    monkeypatch.setitem(globals(), "build", broken_build)
    found = first_break(max(DEPTH, 3))
    assert found is not None, f"the search did not notice that {name}"
    steps, problem = found
    assert expected in problem, tell(steps, problem)
    assert len(steps) <= 3


def test_a_gate_that_reuses_tokens_is_caught_in_a_race(monkeypatch: pytest.MonkeyPatch) -> None:
    real_build = build

    def broken_build() -> World:
        world = real_build()
        _tokens_reusable(world, monkeypatch)
        return world

    monkeypatch.setitem(globals(), "build", broken_build)
    problem = first_bad_interleaving(RACES[0])
    assert problem is not None and "written 2 times" in problem


class _WritesTheRequestsOwnValue(ControlWriteEngine):
    """The engine as it was before FB-215: the controller gets the value as spelled."""

    def _value_to_write(self, request: WriteRequest) -> Any:
        return request.value


def test_an_engine_that_writes_the_requests_own_value_is_caught(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(globals(), "ControlWriteEngine", _WritesTheRequestsOwnValue)
    found = first_break(DEPTH, exact=True)
    assert found is not None
    steps, problem = found
    assert "the reviewed value is 150.0 (float)" in problem, tell(steps, problem)
    assert len(steps) == 2


def test_a_counterexample_reads_in_plain_words() -> None:
    steps = [Step("stage", "op1", 150.0), Step("commit", "op1", 150.0, 0), Step("tick", value=60.0)]
    text = tell(steps, "the controller was written twice")
    assert "1. op1 stages 150.0" in text
    assert "2. op1 commits 150.0 with the token of staged write #0" in text
    assert "3. 60 seconds pass" in text
    assert replace(steps[1], token=None).words() == "op1 commits 150.0 with no token"
