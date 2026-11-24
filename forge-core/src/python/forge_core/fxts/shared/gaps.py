"""Accepted gaps: what the gate lets through, as data that only the owner can grow.

The gate (``forge governance check``) runs every framework over every governed spec. A
check that fails or does not run is a *finding*. A finding stops the gate unless an
*accepted gap* covers it: an entry in ``forge-core/fxts/accepted-gaps.json`` that names
the framework, the spec, the check, whether it fails or did not run, an open backlog
item and the reason, and that the owner has approved (BACKLOG FB-266; the audit of
2026-11-23 found the allowances spread over hand-written tables in the tests).

The file can only shrink without the owner:

- an entry counts only while its approval covers its exact content, so adding an entry
  or changing one needs the owner (``forge governance gap-approve``);
- an entry that covers no finding stops the gate (the gap is closed: remove the entry),
  and so does an entry whose backlog item is closed or unknown;
- removing an entry needs nobody.

What can never be accepted: a check or a runner that broke (``ERROR``), a schema field
with no check (``NOT_IMPLEMENTED``), and a run with no verdict at all. A failure is
accepted for one named spec, never for "every spec".

``judge`` is the one place the rule is written. The approval is a name in a field, as
every spec's approval is today (FB-258, FB-267); it becomes a signed record with them.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from forge_core.fxts.shared.runner import sha256_hex_obj

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping
    from pathlib import Path

#: Every spec of the framework. Allowed only for a check that did not run.
EVERY_SPEC = "*"
#: The statuses a finding can have. Only the first two can be accepted.
NOT_RUN, FAIL = "NOT_RUN", "FAIL"
ACCEPTABLE_STATUSES = frozenset({NOT_RUN, FAIL})
NO_VERDICT = "NO_VERDICT"

FILE_NAME = "accepted-gaps.json"


@dataclass(frozen=True)
class Finding:
    """One check of one spec that did not pass: what the gate found."""

    framework: str
    spec: str  # the spec's file name
    check: str  # the check id, e.g. ``fats:live``
    status: str  # NOT_RUN, FAIL, ERROR, NOT_IMPLEMENTED or NO_VERDICT
    message: str = field(default="", compare=False)

    def __str__(self) -> str:
        return f"{self.framework} {self.spec} {self.check} [{self.status}]"


class Approval(BaseModel):
    """The owner's approval of one entry: the hash of what was approved, who and when."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    hash: str = ""
    by: str = ""
    at: str = ""


class AcceptedGap(BaseModel):
    """One gap the gate lets through until its backlog item is closed."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(pattern=r"^[a-z][a-z0-9-]*$")
    framework: str = Field(pattern=r"^[a-z]+$")
    spec: str = Field(min_length=1)
    check: str = Field(pattern=r"^[a-z]+:[a-z0-9-]+$")
    status: Literal["NOT_RUN", "FAIL"]
    backlog_item: str = Field(pattern=r"^FB-\d{3,}$")
    reason: str = Field(min_length=20)
    approval: Approval = Approval()

    @model_validator(mode="after")
    def _bounds(self) -> AcceptedGap:
        if self.check.split(":")[0] != self.framework:
            msg = f"the check {self.check!r} is not a check of the framework {self.framework!r}"
            raise ValueError(msg)
        if self.spec == EVERY_SPEC and self.status != NOT_RUN:
            msg = "a failure is accepted for one named spec, never for every spec"
            raise ValueError(msg)
        if self.spec != EVERY_SPEC and not self.spec.endswith(".json"):
            msg = f"spec is a spec's file name or {EVERY_SPEC!r}, not {self.spec!r}"
            raise ValueError(msg)
        return self

    @property
    def content_hash(self) -> str:
        """The hash of everything the owner approves: every field but the approval."""
        return sha256_hex_obj(self.model_dump(exclude={"approval"}))

    @property
    def approved(self) -> bool:
        """The owner approved this entry as it is now."""
        return bool(self.approval.by.strip()) and self.approval.hash == self.content_hash

    def covers(self, finding: Finding) -> bool:
        return (
            self.framework == finding.framework
            and self.check == finding.check
            and self.status == finding.status
            and self.spec in (EVERY_SPEC, finding.spec)
        )

    def approved_by(self, by: str, at: str) -> AcceptedGap:
        return self.model_copy(
            update={"approval": Approval(hash=self.content_hash, by=by.strip(), at=at)}
        )


class AcceptedGaps(BaseModel):
    """The whole file."""

    model_config = ConfigDict(extra="forbid")

    title: str
    description: str
    gaps: list[AcceptedGap]

    def to_text(self) -> str:
        return json.dumps(self.model_dump(), indent=2, ensure_ascii=False) + "\n"


def load(path: Path) -> tuple[list[AcceptedGap], list[str]]:
    """The entries of the file and everything wrong with the file itself.

    A file that cannot be read or does not have the shape accepts nothing: the entries
    come back empty and the problem is named, so the gate fails with the cause.
    """
    try:
        document = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_no_duplicates)
    except OSError as exc:
        return [], [f"{path.name}: not readable ({exc})"]
    except ValueError as exc:
        return [], [f"{path.name}: not readable as JSON ({exc})"]
    try:
        gaps = AcceptedGaps.model_validate(document).gaps
    except ValidationError as exc:
        return [], [
            f"{path.name}: {'/'.join(str(p) for p in error['loc']) or '$'}: {error['msg']}"
            for error in exc.errors()
        ]
    return gaps, [f"{path.name}: {problem}" for problem in overlaps(gaps)]


def overlaps(gaps: list[AcceptedGap]) -> list[str]:
    """Two entries that can cover the same finding. Either is then redundant, and removing
    one would change nothing the gate shows, so the file is refused until one goes."""
    problems = []
    ids = [gap.id for gap in gaps]
    problems += [
        f"two entries have the id {i!r}" for i in sorted({i for i in ids if ids.count(i) > 1})
    ]
    for index, gap in enumerate(gaps):
        for other in gaps[index + 1 :]:
            same = (gap.framework, gap.check, gap.status) == (
                other.framework,
                other.check,
                other.status,
            )
            if same and (gap.spec == other.spec or EVERY_SPEC in (gap.spec, other.spec)):
                problems.append(f"the entries {gap.id!r} and {other.id!r} cover the same findings")
    return problems


def accepted_checks(
    gaps: Iterable[AcceptedGap],
    backlog: Mapping[str, bool],
    *,
    framework: str,
    spec: str,
    status: str,
) -> set[str]:
    """The checks of one spec that an approved entry with an open item accepts with this
    status. What a framework's own test may let through; anything else fails it."""
    return {
        gap.check
        for gap in gaps
        if gap.framework == framework
        and gap.status == status
        and gap.spec in (EVERY_SPEC, spec)
        and gap.approved
        and backlog.get(gap.backlog_item) is True
    }


def _no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    keys = [key for key, _ in pairs]
    twice = sorted({key for key in keys if keys.count(key) > 1})
    if twice:
        msg = f"a key is written twice: {', '.join(twice)}"
        raise ValueError(msg)
    return dict(pairs)


@dataclass(frozen=True)
class Refusal:
    """A finding the gate does not let through, and why."""

    finding: Finding
    why: str


@dataclass(frozen=True)
class GateResult:
    """What the gate decided. ``ok`` only when every list here is empty."""

    refused: tuple[Refusal, ...] = ()
    unused: tuple[AcceptedGap, ...] = ()  # an entry that covers no finding: the gap is closed
    closed: tuple[tuple[AcceptedGap, str], ...] = ()  # an entry whose backlog item is not open
    problems: tuple[str, ...] = ()  # never acceptable: the file itself, registries, lists, indexes
    accepted: tuple[tuple[Finding, AcceptedGap], ...] = ()

    @property
    def ok(self) -> bool:
        return not (self.refused or self.unused or self.closed or self.problems)


def judge(
    findings: Iterable[Finding],
    gaps: Iterable[AcceptedGap],
    backlog: Mapping[str, bool],
    problems: Iterable[str] = (),
) -> GateResult:
    """Decide the gate. The one place the rule is written.

    A finding is let through only by an entry that covers it, that the owner approved as
    it is now, and whose backlog item is open. Every entry must cover a finding and name
    an open item, whether or not it is approved. A problem is never let through.
    """
    findings, gaps = list(findings), list(gaps)
    refused: list[Refusal] = []
    accepted: list[tuple[Finding, AcceptedGap]] = []
    for finding in findings:
        if finding.status not in ACCEPTABLE_STATUSES:
            refused.append(
                Refusal(finding, f"a check with the status {finding.status} is never accepted")
            )
            continue
        covering = [gap for gap in gaps if gap.covers(finding)]
        usable = [gap for gap in covering if gap.approved and backlog.get(gap.backlog_item) is True]
        if usable:
            accepted.append((finding, usable[0]))
        elif not covering:
            refused.append(Refusal(finding, "no accepted gap covers it"))
        elif not any(gap.approved for gap in covering):
            refused.append(
                Refusal(
                    finding,
                    f"the entry {covering[0].id!r} covers it and is not approved by the owner "
                    "as it is now",
                )
            )
        else:
            item = next(gap for gap in covering if gap.approved).backlog_item
            refused.append(Refusal(finding, f"the entry that covers it names {item}, not open"))
    unused = tuple(gap for gap in gaps if not any(gap.covers(f) for f in findings))
    closed = tuple(
        (gap, "closed" if gap.backlog_item in backlog else "not in the backlog")
        for gap in gaps
        if backlog.get(gap.backlog_item) is not True
    )
    return GateResult(
        refused=tuple(refused),
        unused=unused,
        closed=closed,
        problems=tuple(problems),
        accepted=tuple(accepted),
    )
