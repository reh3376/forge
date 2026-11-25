"""Development, test and production: data on one framework, never a mode (D-21 SF-2).

A deployment's anchor carries its stage. Development differs from production only in what
the anchor holds; ``test`` is production's rules plus a test attestation root, so CI can
issue on SoftHSM, and every hub release refuses it (SF-2 as amended 2026-11-25, D-23 Q-2).

Law 4 (D-23 §7): no hub release accepts a test anchor, and no production hub a development
anchor. The rule for releases is here and proved; nothing marks a build as a release until
D-21 step 5 (signed releases), so :data:`RELEASE` is ``None`` in the tree and that half of
the law is reported as not run until then (D-23 §7, amended 2026-11-25).
"""

from __future__ import annotations

from enum import StrEnum


class Stage(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


#: The identity of the release this build is, written by the release process (D-21 step 5).
#: ``None`` in the source tree: no build is a release yet.
RELEASE: str | None = None


def release_refusal(stage: Stage, *, release: bool) -> str | None:
    """Why a build refuses an anchor of this stage, or ``None`` when it does not."""
    if release and stage is Stage.TEST:
        return "a test anchor is refused by every hub release (D-21 SF-2)"
    return None


def chain_refusal(pinned: Stage, presented: Stage) -> str | None:
    """Why an anchor of one stage cannot follow a chain of another, or ``None``.

    A chain keeps its genesis's stage: a development chain is never rotated into production,
    and a production hub refuses a development or test anchor (D-20 SG-3).
    """
    if presented is not pinned:
        return f"a {presented} anchor cannot follow a chain staged {pinned}"
    return None
