---
name: verify-trust-certificates
description: "Check a change to the trust root's certificates (D-23 law 1: no certificate counts unless its issuer's key is in the anchor, its subject sits under its issuer's identity and it fits the profile; the issuer signs nothing outside the profile) against every case in its bound, in Python and in Go. Use when a change touches forge-core/src/python/forge_core/trust/verify.py (verify, check_certificate, Cause, Field, spiffe_id, subject_for), issuer.py (issue, Request), profile.py (Role, Profile, role_problems), ids.py (SpiffeId), anchor.py (root_certificates, intermediate_keys), the Go twin in forge-core/src/go/trust/, the governed list forge-core/contract/lists/certificate-roles.list.json, or tests/trust_world.py; or for 'is this certificate real', 'can the issuer sign that', 'do the two verifiers agree', 'verify the certificates'."
---

# Verify the trust root's certificates

## The promise and the harm

**Promise (D-23 law 1):** a certificate counts only when a certificate root of the deployment's anchor issued its chain, every hub intermediate in it is one the anchor lists, each certificate's id sits under its issuer's, every certificate fits its role in the profile exactly, and it is within its validity, its issuer's validity and its role's lifetime cap at the hub's time. The issuer signs exactly the requests that fit and nothing else. The Python verifier (the hub's) and the Go verifier (the modules') give the same answer, cause and position for every chain both libraries can parse; a certificate that only one can parse is refused by both (Go's parser refuses it before its verifier runs).

**Harm if it breaks:** a module or a person presents a certificate the deployment never meant to trust and is taken for a hub or another module on the link; or the hub and a module disagree about the same certificate, so one side admits what the other refuses. Every later step of the security framework (mutual TLS, distribution, approvals) rests on this answer (D-21 §11 step 1a, FB-293).

## Does your change touch it

| File | What the check covers in it |
|---|---|
| `forge-core/src/python/forge_core/trust/verify.py` | the eight steps of `verify` in their order, every field of `check_certificate` in `Field` order, the closed `Cause` set and `CertificateRefusedError.code` |
| `forge-core/src/python/forge_core/trust/issuer.py` | `issue`: which requests it signs; it runs `check_certificate` on what it made |
| `forge-core/src/python/forge_core/trust/profile.py`, `ids.py` | the roles and their graph (`role_problems`), `issued_by`; the id grammar and `is_under` |
| `forge-core/src/go/trust/` | the Go verifier, held to the same cases through `testdata/vectors.json` |
| `forge-core/contract/lists/certificate-roles.list.json` | the profile itself (a change is a new anchor version: the anchor pins its hash) |
| `tests/trust_world.py` | the oracle: the catalog of faults (`MUTATIONS`, `LEAF_FAULTS`) and the crafter that makes them, apart from the issuer |
| `tests/trust_edges.py` | the edges: malformed DER, odd encodings and other hashes, each with its declared answer (`ANSWERS`) and whether Go's parser reads it |

**Sync commit:** `5fe4ed98` (2026-11-27, FB-317, PR 201: the curves moved to `keys.py`, an anchor's keys are read when it is decoded, and `IntermediateKeys` no longer meets a key twice; no certificate rule, vector or edge changed). See what changed since:

```bash
git log --oneline <sync>..HEAD -- forge-core/src/python/forge_core/trust forge-core/src/go/trust forge-core/contract/lists/certificate-roles.list.json tests/trust_world.py tests/trust_edges.py
```

If that prints commits you did not check, look before you trust a pass. Move the sync commit forward only after you have confirmed the check still describes the code.

## Run it

```bash
uv run pytest forge-core/tests/trust/test_certificates_law.py forge-core/tests/trust/test_verifier_edges.py -q
cd forge-core/src/go && go test ./trust/ -count=1
```

Under a second each. The expected result at the sync commit is `63 passed` and `ok` (41 vectors, 31 edges, the id table, the strict decoding test, and the anchor's keys and freshness keys, which `verify-trust-anchor` covers).

After a change to the catalog, the edges or the profile, regenerate both files and run both again:

```bash
uv run python -m tests.trust_world && uv run python -m tests.trust_edges
```

## What it does, and why a pass is a proof here

- **Every single fault** in `MUTATIONS` (41 cases: 4 accepted chains, 25 faults of the leaf, 9 of the intermediate or its root, 3 of the chain's shape) is refused with the code and at the position the catalog declares. The declaration is written apart from the verifier, so the verifier is never checked against itself.
- **Every pair** of leaf faults that touch different fields (over 200) is refused at the leaf with one of the two codes: no fault hides another.
- **The issuer over its whole request space**: every role and one that does not exist, four kinds of issuer, six forms of id, both curves, four lifetimes, the right or a wrong signing key: 1,920 requests. It signs exactly the ten that fit, and each certificate it signs is accepted by `verify` (or, for a CA role, by `check_certificate`).
- **The Go verifier** reads the same 41 cases from `forge-core/src/go/trust/testdata/vectors.json`; the Python test proves the file holds the catalog's names and expectations and that the Python verifier answers them on those very bytes.
- **The edges** (31 chains in `testdata/edges.json`): malformed basic constraints, key usage and key identifiers, a name the parser cannot read, an x400 address, an id with a trailing newline, critical key identifiers, duplicated or extra extended key usages, an extension the profile has no place for, every other ECDSA hash, odd string types, a chain of one. Both verifiers give each its declared answer; for the three certificates Go's parser refuses, the Go test asserts that refusal. These were found by a differential probe on 2026-11-25, which also found four faults in the Python side (an id with a trailing newline accepted; critical key identifiers accepted; a raw `UnsupportedGeneralNameType` escaping; the anchor reading `"86400"` and `"yes"` loosely), now held closed by `test_verifier_edges.py`.
- **Leniencies both share, kept visible:** a key-usage bit beyond the nine RFC 5280 defines is ignored; a name attribute's string type is not compared, only its value; a hub intermediate presented alone is accepted as itself (role `hub-intermediate`), so every caller requires the role it expects.

**Bounds and what is left out:** one deployment, one hub intermediate (plus one from the second root), chains of at most three certificates presented. A version-1 certificate and a serial of zero, negative or over 20 bytes cannot be made with `cryptography` (its builder refuses them), so the `version` and `serial` fields are checked by code that no case exercises. Signatures are ECDSA from software keys here; signing on a device is covered by `forge-core/tests/trust/test_ids_and_device.py` on SoftHSM. Device attestation of the roots (D-23 T-3) is step 1b's.

## Reading a failure

- `test_every_single_fault_is_refused_where_the_catalog_says[<name>]` with `assert ('<code>', n) == ('<expected>', m)`: the verifier now refuses that chain for another reason or at another position, or accepts it (`(None, None)`). If the order of the checks changed on purpose, change the Go verifier's order with it and the catalog's expectation; if not, the change broke the order or a check.
- `test_every_pair...` names the two faults and the code given: a code from neither means one fault masked the other's check.
- `test_the_issuer_signs_exactly...` prints `(role, issuer, id, curve, lifetime, signer_ok)`: the issuer signed a request that does not fit (a hole in `issue`) or refused one that does. On 2026-11-25 this check found that a root could cross-sign a second root; `issue` now refuses it.
- `go test` failing on a vector while Python passes: the two verifiers disagree. Fix the one that departs from the steps in `verify.py`'s docstring; never weaken either to agree.

Seen failing on purpose (2026-11-25): in Go, with the key-usage check switched off, exactly the three key-usage vectors failed; in Python, with the key-usage check removed from `check_certificate`, 4 cases failed (`leaf may encipher keys`, `leaf key usage not critical`, `intermediate cannot sign revocations`, a pair); with the issuer's guard against a second root removed, the issuer check failed.

## When the code changes on purpose

1. Change the Python verifier and the Go verifier together, in the same step order.
2. Add the fault to `MUTATIONS` (or `LEAF_FAULTS`), or the edge to `tests/trust_edges.py`, with the code and position it must give.
3. Regenerate both files and run both commands above.
4. A change to `certificate-roles` is a governed change: stamp it, and the owner approves its hash; the anchor's policy pins it.
5. Update the table above and move the sync commit.
