"""D-23 laws 3 and 4 as far as step 1a holds them, checked over every case in the bound.

Law 3 (the anchor part, from step 1a): an anchor counts if and only if it is the pinned
genesis; no pin means nothing counts (never trusted on first use); every other version,
however well formed, is refused by name until step 1b counts versions on the authorities'
threshold. Law 4: no hub release accepts a test anchor, and a chain never changes stage.
The release half is proved on the rule here; no build is a release until D-21 step 5
(``stages.RELEASE`` is ``None`` in the tree), and the verify skill says so.
"""

from __future__ import annotations

import copy
import itertools

import pytest
from tests.trust_world import world

from forge_core.trust import stages
from forge_core.trust.anchor import Anchor, AnchorRefusedError, accept, anchor_problems, pin_of
from forge_core.trust.stages import Stage, chain_refusal, release_refusal

W = world()


def _variants() -> dict[str, dict]:
    """The genesis, and documents that differ from it in one way each."""
    genesis = W.anchor
    variants = {"genesis": genesis}
    for field, value in (
        ("version", 2),
        ("stage", "development"),
        ("deployment", "plant-z"),
        ("root_threshold", 1),
        ("release_keys", []),
        ("hub_intermediates", []),
    ):
        changed = copy.deepcopy(genesis)
        changed[field] = value
        variants[f"{field} changed"] = changed
    reordered = dict(reversed(list(genesis.items())))
    variants["same content, keys reordered"] = reordered
    malformed = copy.deepcopy(genesis)
    malformed["extra"] = True
    variants["an unknown field"] = malformed
    return variants


VARIANTS = _variants()
GENESIS_PIN = pin_of(W.anchor)


@pytest.mark.parametrize(
    ("name", "pin", "release"),
    list(itertools.product(VARIANTS, (GENESIS_PIN, "0" * 64, None), (False, True))),
)
def test_an_anchor_counts_only_as_the_pinned_genesis(
    name: str, pin: str | None, release: bool
) -> None:
    document = VARIANTS[name]
    same_content = pin_of(document) == GENESIS_PIN
    counts = pin == GENESIS_PIN and same_content and not release  # the world is staged test
    try:
        anchor = accept(document, pin=pin, release=release)
    except AnchorRefusedError as refused:
        assert not counts, (name, pin, release, refused)
        if pin is None:
            assert refused.cause == "unpinned"
        elif not (pin == GENESIS_PIN and same_content):
            assert refused.cause == "not-pinned"
        else:
            assert refused.cause == "test-anchor-on-release"
        return
    assert counts, (name, pin, release)
    assert anchor.deployment == W.anchor["deployment"]


def test_the_genesis_is_whole() -> None:
    assert anchor_problems(Anchor.model_validate(W.anchor), W.profile) == []


@pytest.mark.parametrize(("stage", "release"), list(itertools.product(Stage, (False, True))))
def test_no_release_accepts_a_test_anchor(stage: Stage, release: bool) -> None:
    refused = release_refusal(stage, release=release) is not None
    assert refused == (release and stage is Stage.TEST)


@pytest.mark.parametrize(("pinned", "presented"), list(itertools.product(Stage, Stage)))
def test_a_chain_never_changes_stage(pinned: Stage, presented: Stage) -> None:
    assert (chain_refusal(pinned, presented) is None) == (pinned is presented)


def test_no_build_in_the_tree_is_a_release_yet() -> None:
    """The release half of law 4 waits for D-21 step 5; this says so until then."""
    assert stages.RELEASE is None


@pytest.mark.parametrize(
    ("change", "says"),
    [
        ({"stage": "production"}, "test attestation root"),
        ({"root_threshold": 4}, "threshold"),
        ({"release_keys": [W.anchor["root_keys"][0]]}, "both a root key and a release key"),
        ({"root_keys": [W.anchor["root_keys"][0], W.anchor["root_keys"][0]]}, "listed twice"),
    ],
    ids=[
        "production with a test root",
        "threshold above the keys",
        "a key in both roles",
        "a key twice",
    ],
)
def test_an_anchor_that_contradicts_itself_cannot_be_built(change: dict, says: str) -> None:
    with pytest.raises(ValueError, match=says):
        Anchor.model_validate({**W.anchor, **change})


KEYS = W.anchor["freshness_keys"]


def rewrapped(pem: str, width: int = 32) -> str:
    """The same block with its content broken at another width."""
    head, *body, foot = pem.strip("\n").split("\n")
    content = "".join(body)
    lines = [content[i : i + width] for i in range(0, len(content), width)]
    return "\n".join([head, *lines, foot]) + "\n"


@pytest.mark.parametrize(
    ("change", "says"),
    [
        (
            {"stage": "production", "test_attestation_roots": [], "freshness_keys": KEYS[:1]},
            "two freshness keys",
        ),
        ({"freshness_keys": [KEYS[0], KEYS[0]]}, "listed twice"),
        ({"freshness_keys": [KEYS[0], rewrapped(KEYS[0])]}, "listed twice"),
        ({"freshness_keys": [KEYS[0], KEYS[0].rstrip("\n")]}, "listed twice"),
        ({"freshness_keys": [*KEYS, KEYS[0]]}, "at most 2"),
        ({"freshness_keys": []}, "at least 1"),
        ({"freshness_keys": [KEYS[0], "x"]}, "should match pattern"),
        ({"freshness_keys": KEYS[0]}, "valid tuple"),
    ],
    ids=[
        "production with one",
        "the same key twice",
        "the same key broken at another width",
        "the same key without its last line break",
        "three keys",
        "none",
        "a key that is not PEM",
        "one key outside a list",
    ],
)
def test_the_freshness_keys_are_one_or_two_devices_and_two_in_production(
    change: dict, says: str
) -> None:
    """D-21 §14 FR-2 as amended by D-24 Q-7 (FB-311): two freshness keys, each on its own
    device, either counting, so forge-core can fail over."""
    with pytest.raises(ValueError, match=says):
        Anchor.model_validate({**W.anchor, **change})


@pytest.mark.parametrize("stage", ["development", "test"])
def test_one_machine_may_hold_one_freshness_key_outside_production(stage: str) -> None:
    anchor = Anchor.model_validate({**W.anchor, "stage": stage, "freshness_keys": KEYS[:1]})
    assert len(anchor.freshness_keys) == 1


def test_an_anchor_in_the_form_with_one_freshness_key_is_refused_by_name() -> None:
    """The form changed before any anchor existed (D-24 Q-7): a document that still says
    ``freshness_key`` is refused for the field it has and the field it lacks, never read."""
    document = {k: v for k, v in W.anchor.items() if k != "freshness_keys"}
    document["freshness_key"] = KEYS[0]
    with pytest.raises(ValueError) as refused:
        Anchor.model_validate(document)
    fields = {error["loc"][0]: error["type"] for error in refused.value.errors()}
    assert fields == {"freshness_keys": "missing", "freshness_key": "extra_forbidden"}


def test_the_rewrapped_key_is_the_same_block_in_other_lines() -> None:
    assert rewrapped(KEYS[0]) != KEYS[0]
    assert rewrapped(KEYS[0]).replace("\n", "") == KEYS[0].replace("\n", "")
    Anchor.model_validate({**W.anchor, "freshness_keys": [rewrapped(KEYS[0]), KEYS[1]]})


def test_a_production_anchor_with_two_freshness_keys_is_whole() -> None:
    document = {**W.anchor, "stage": "production", "test_attestation_roots": []}
    assert len(Anchor.model_validate(document).freshness_keys) == 2


def test_the_anchor_pins_the_profile_and_caps_every_role() -> None:
    wrong = copy.deepcopy(W.anchor)
    wrong["policy"]["profile"] = "f" * 64
    del wrong["policy"]["lifetimes"]["module-leaf"]
    problems = anchor_problems(Anchor.model_validate(wrong), W.profile)
    assert any("another profile" in p for p in problems)
    assert any("missing ['module-leaf']" in p for p in problems)
