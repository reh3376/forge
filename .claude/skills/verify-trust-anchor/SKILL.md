---
name: verify-trust-anchor
description: "Check a change to which trust anchor counts and to the stages (D-23 laws 3 and 4 as far as step 1a holds them: only the pinned genesis counts, nothing without a pin; no release accepts a test anchor; a chain never changes stage) against every case in its bound. Use when a change touches forge-core/src/python/forge_core/trust/anchor.py (accept, pin_of, Anchor and its validator, anchor_problems), stages.py (Stage, RELEASE, release_refusal, chain_refusal), or the anchor's form; or for 'which anchor counts', 'can a test anchor reach production', 'verify the anchor'."
---

# Verify the trust anchor and its stages

## The promise and the harm

**Promise (D-23 laws 3 and 4, as amended 2026-11-25 for step 1a):** an anchor counts if and only if it is the pinned genesis, matched by the hash of its canonical JSON; with no pin nothing counts (an anchor is never trusted on first use, D-21 SF-21); every other version, however well formed, is refused by name. A build that is a release refuses an anchor staged `test`, and a chain never changes stage, so a production hub never accepts a development or test anchor. An anchor that contradicts itself (a production anchor with a test attestation root, a threshold above its keys, one key in both roles, a key twice) cannot be built.

**Harm if it breaks:** a hub trusts an anchor it was never given, so whoever wrote that anchor issues the certificates the hub believes; or a test anchor, whose attestation root lets software keys pass, reaches a production deployment.

**Not yet held, and reported as not run, never as passing:** a later anchor version counting on the authorities' threshold (from step 1b, with D-20's FIDO core); signed releases of the allow-lists (D-21 step 5); and the release half of law 4 on a real build, since nothing marks a build as a release until D-21 step 5 (`stages.RELEASE` is `None` in the tree, and `test_no_build_in_the_tree_is_a_release_yet` says so). The rule itself is proved here.

## Does your change touch it

| File | What the check covers in it |
|---|---|
| `forge-core/src/python/forge_core/trust/anchor.py` | `accept` (the causes `unpinned`, `not-pinned`, `malformed`, `test-anchor-on-release`), `pin_of`, the `Anchor` model's validator, `anchor_problems` |
| `forge-core/src/python/forge_core/trust/stages.py` | `Stage`, `RELEASE`, `release_refusal`, `chain_refusal` |

**Sync commit:** `62735cc6` (2026-11-25, FB-293 step 1a, PR 192). See what changed since:

```bash
git log --oneline <sync>..HEAD -- forge-core/src/python/forge_core/trust/anchor.py forge-core/src/python/forge_core/trust/stages.py
```

## Run it

```bash
uv run pytest forge-core/tests/trust/test_anchor_law.py -q
```

Under a second. The expected result at the sync commit is `76 passed`.

## What it does, and why a pass is a proof here

- **Every document against every pin and both kinds of build:** the genesis, six documents that differ from it in one field each, the same content with its keys reordered, and one with an unknown field, against the genesis's pin, another pin and no pin, as a release and not: 54 cases. The oracle is written in the test: it counts exactly when the pin matches the canonical hash and the build may hold the anchor's stage.
- **Every stage against both kinds of build**, and **every pair of stages** for a chain.
- The four ways an anchor contradicts itself are refused at construction.

**Bounds:** one world (staged `test`); the pin is SHA-256 over sha256-c14n-v1, the hash every governed spec uses.

## Reading a failure

A failing case names the document, the pin and whether the build is a release. An anchor accepted without the genesis's pin is the worst fault this check knows: find what stopped comparing the hash. A refusal with an unexpected cause means the order in `accept` changed.

Seen failing on purpose (2026-11-25): with the pin comparison removed, 32 cases failed; with `release_refusal` always allowing, 3 failed.

## When the code changes on purpose

When step 1b counts later versions on the authorities' threshold, this check grows the D-20 rule (exactly one more than an accepted version, signed by the owner's root key and a threshold of the previous version's other root keys, counted by distinct key material, the same stage throughout), and the "not yet held" paragraph above shrinks. Update the table and move the sync commit.
