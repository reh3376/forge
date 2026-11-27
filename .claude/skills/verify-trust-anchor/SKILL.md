---
name: verify-trust-anchor
description: "Check a change to which trust anchor counts and to the stages (D-23 laws 3 and 4 as far as step 1a holds them: only the pinned genesis counts, nothing without a pin; no release accepts a test anchor; a chain never changes stage; every key an anchor names is an admitted key in its one encoding and is named once; Python and Go give one answer on an anchor) against every case in its bound. Use when a change touches forge-core/src/python/forge_core/trust/anchor.py (accept, pin_of, Anchor and its validator, anchor_problems), keys.py (CURVES, der_of, public_key_der, certificate_key_der), stages.py (Stage, RELEASE, release_refusal, chain_refusal), the Go twin's anchor.go (check) and keys.go, tests/trust_anchors.py, or the anchor's form; or for 'which anchor counts', 'can a test anchor reach production', 'is this key a key', 'verify the anchor'."
---

# Verify the trust anchor and its stages

## The promise and the harm

**Promise (D-23 laws 3 and 4, as amended 2026-11-25 for step 1a):** an anchor counts if and only if it is the pinned genesis, matched by the hash of its canonical JSON; with no pin nothing counts (an anchor is never trusted on first use, D-21 SF-21); every other version, however well formed, is refused by name. A build that is a release refuses an anchor staged `test`, and a chain never changes stage, so a production hub never accepts a development or test anchor. An anchor that contradicts itself (a production anchor with a test attestation root, a threshold above its keys, one key in both roles, a key twice) cannot be built. It holds one or two freshness keys, never one block twice however its lines are broken, and a production anchor holds two, one per device, so forge-core can fail over (D-21 §14 FR-2 as amended by D-24 Q-7; FB-311); the Go twin refuses the same documents.

**Every key an anchor names is a key, and is named once (FB-317).** The certificate roots' keys, the hub intermediates', the distribution key and the freshness keys are each an ECDSA key on secp256r1 or secp384r1 in its one encoding: one PEM block with its label, base64 in its one spelling, and the SubjectPublicKeyInfo a device exports. No two places hold one key. **Python and Go give one answer on an anchor:** both suites read `testdata/anchors.json` and must give each case's declared answer, and a refusal by the key rules names the place and says the same words in both.

**Harm if it breaks:** a hub trusts an anchor it was never given, so whoever wrote that anchor issues the certificates the hub believes; or a test anchor, whose attestation root lets software keys pass, reaches a production deployment; or an anchor is signed at genesis holding something that is no key, or one device's key standing for two certificate roots, for two hubs' intermediates, or for a freshness key and anything else, and nobody learns until a later step uses it; or a hub builds an anchor its modules refuse.

**Not yet held, and reported as not run, never as passing:** a later anchor version counting on the authorities' threshold (from step 1b, with D-20's FIDO core); signed releases of the allow-lists (D-21 step 5); the release half of law 4 on a real build, since nothing marks a build as a release until D-21 step 5 (`stages.RELEASE` is `None` in the tree, and `test_no_build_in_the_tree_is_a_release_yet` says so; the rule itself is proved here); that a key the anchor names is held by a device (its attestation, step 1b); and that the authorities' FIDO credentials are keys, since they are held to a shape until D-20's FIDO core reads them (step 1b, FB-293).

## Does your change touch it

| File | What the check covers in it |
|---|---|
| `forge-core/src/python/forge_core/trust/anchor.py` | `accept` (the causes `unpinned`, `not-pinned`, `malformed`, `test-anchor-on-release`), `pin_of`, the `Anchor` model's validator, `anchor_problems` |
| `forge-core/src/python/forge_core/trust/stages.py` | `Stage`, `RELEASE`, `release_refusal`, `chain_refusal` |
| `forge-core/src/python/forge_core/trust/keys.py` | `CURVES`, `der_of`, `public_key_der`, `certificate_key_der`: what an admitted key is and its one encoding |
| `forge-core/src/go/trust/anchor.go` | `Anchor.check`: the freshness keys' rules, the same as the Python model's (the rest of the twin is `verify-trust-certificates`') |
| `forge-core/src/go/trust/keys.go` | `derOf`, `publicKeyDER`, `certificateKeyDER`, `keysOnce`: the same rules and the same words |
| `tests/trust_anchors.py` | the cases and their declared answers, apart from the code under test; it writes `testdata/anchors.json` |

**Sync commit:** `5fe4ed98` (2026-11-27, FB-317, PR 201). See what changed since:

```bash
git log --oneline <sync>..HEAD -- forge-core/src/python/forge_core/trust/anchor.py forge-core/src/python/forge_core/trust/keys.py forge-core/src/python/forge_core/trust/stages.py forge-core/src/go/trust/anchor.go forge-core/src/go/trust/keys.go tests/trust_anchors.py
```

## Run it

```bash
uv run pytest forge-core/tests/trust/test_anchor_law.py forge-core/tests/trust/test_anchor_keys_law.py -q
cd forge-core/src/go && go test ./trust/ -count=1 -run 'TestAnchors|TestAnchorFreshnessKeys|TestDecodingIsStrict'
```

Under a second each. The expected result at the sync commit is `342 passed` and `ok` (`TestAnchors` runs 247 cases; `-v` lists them).

After a change to the cases, the world or the rules, write the file both suites read and run both again. It borrows certificates from the other two files by name, so it is written last:

```bash
uv run python -m tests.trust_world && uv run python -m tests.trust_edges && uv run python -m tests.trust_anchors
```

## What it does, and why a pass is a proof here

- **Every document against every pin and both kinds of build:** the genesis, six documents that differ from it in one field each, the same content with its keys reordered, and one with an unknown field, against the genesis's pin, another pin and no pin, as a release and not: 54 cases. The oracle is written in the test: it counts exactly when the pin matches the canonical hash and the build may hold the anchor's stage.
- **Every stage against both kinds of build**, and **every pair of stages** for a chain.
- The four ways an anchor contradicts itself are refused at construction.
- **The freshness keys, in Python and in Go on the same documents:** none, three, one in production, one block twice (as written, broken at another width, without its last line break), a block that is not PEM and a key outside a list are refused; one key under `development` or `test`, two in production, and a rewrapped key beside another key are accepted. A document in the earlier form, with one `freshness_key`, is refused for the field it has and the field it lacks.
- **Every spelling of a key in every key field** (31 spellings in the distribution key and each freshness key): what a device exports on each curve and the same key in other lines are built; another curve or kind of key (P-521, secp256k1, brainpool, Ed25519, Ed448, X25519, RSA), another encoding of the same point (compressed, hybrid, the curve written out in full), a point off the curve, loose base64, another label, and things that are no key are refused.
- **Every kind of certificate in both certificate fields** (16 kinds as a certificate root and as a hub intermediate).
- **Every pair of places a key can be named** (the two certificate roots, two hub intermediates, the distribution key and the two freshness keys: 21 pairs), each given one key, with one key in other lines, one root under two ids and one intermediate listed twice. An anchor with a key in every place, each its own, is built, for two hubs and for one hub with two intermediates; so is an intermediate renewed on its key.
- **Every certificate of the edges and the vectors as the hub intermediate** (85): the certificates on which the two languages' parsers disagree (a key identifier marked critical, a name one cannot read) are built by both, because reading an anchor reads a certificate's structure and its key and no more; the profile's check refuses them.
- A key generated on a device (SoftHSM) and exported is admitted, on each curve (`test_ids_and_device.py`).
- The answers are declared in `tests/trust_anchors.py`, and a test holds the committed file to them.

**Bounds:** one world (staged `test`); the pin is SHA-256 over sha256-c14n-v1, the hash every governed spec uses. The two languages are held to one answer on the 247 cases; for a key field the rule itself gives one answer on any input (each reads the key, writes it again and requires the same bytes), but a certificate malformed in its structure in a way no case holds is not compared (FB-319).

## Reading a failure

A failing case names the document, the pin and whether the build is a release. An anchor accepted without the genesis's pin is the worst fault this check knows: find what stopped comparing the hash. A refusal with an unexpected cause means the order in `accept` changed. A case of `anchors.json` that fails in one language only is a disagreement between the two verifiers; the worst is one building what the other refuses, so a hub and its modules would not agree on their anchor. Find which rule read the input differently. Never edit the file by hand, and never change a declared answer to match the code.

Seen failing on purpose (2026-11-25): with the pin comparison removed, 32 cases failed; with `release_refusal` always allowing, 3 failed. And on 2026-11-26, each in Python and in Go with the same count: production no longer needing two keys, 1; keys compared as spelled, 2; no comparison of the two keys, 3; any number of keys, 2. For the keys (2026-11-26, FB-317; Python, then Go): a key not held to its one encoding, 9 and 0; any curve admitted, 13 and 5; the label not checked, 16 and 16; base64 in any spelling, 5 and 5; a key named twice allowed, 31 and 31; a certificate's key taken however it is carried, 2 and 0; Go reading a listed certificate with `x509.ParseCertificate`, 3 in Go. Where Go shows 0 or fewer, its parser already refuses those inputs, so the comparison there guards what a later Go release might start to accept.

## When the code changes on purpose

When step 1b counts later versions on the authorities' threshold, this check grows the D-20 rule (exactly one more than an accepted version, signed by the owner's root key and a threshold of the previous version's other root keys, counted by distinct key material, the same stage throughout), and the "not yet held" paragraph above shrinks. Update the table and move the sync commit. Adding a key type is a new form of the anchor (`forge-anchor/2`), since an older verifier must refuse what it cannot read: add the curve to `keys.CURVES` and to `profileCurves`, its spellings to `tests/trust_anchors.py`, write the file again, and move the sync commit only when both suites agree.
