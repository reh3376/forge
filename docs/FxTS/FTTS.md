# FTTS — Forge Transport Test Specification

**Framework ID:** FTTS
**Full Name:** Forge Transport Test Specification
**CI Gate:** Hard-fail (merge-blocking): `tests/governance/ftts/` runs in the `hub-python` job
**Status:** v0.1.0. Schema, runner (`ftts_runner.py`) and one spec, `grpc-hardened-transport.ftts.json`, hashed and approved by the owner on 2026-11-18. The contract this framework is to govern is decided and signed, and not built: [`docs/decisions/transport-contract.md`](../decisions/transport-contract.md) (D-15, FB-164)
**MDEMG Analog:** None

---

## Purpose

FTTS standardizes the one transport between a hub and every module: `forge.v1.AdapterService` over gRPC (A-1). Every module, in every language, at every installation speaks it, so it is the hardest thing in the platform to change once modules exist outside this repository.

## What the spec governs today

| Section | Content |
|---|---|
| `transport_identity` | `grpc-hardened-transport`, protocol `grpc+protobuf`, proto package `forge.v1` |
| `proto_contract` | the proto files, with their message and enum counts |
| `wire_format` | binary protobuf from compiled stubs; JSON on the wire is forbidden |
| `serialization_bridge` | each core model maps to its proto type and back without loss |
| `server_requirements`, `client_requirements` | the compiled servicer and stub, graceful shutdown, the in-memory channel for tests |
| `rpc_contract` | the 12 RPCs, below |
| `error_protocol` | the status code for each failure, below |
| `conformance_tests` | the tests by category |
| `integrity` | the FHTS block |

### The RPCs

| RPC | Shape | Plane | Request | Response |
|---|---|---|---|---|
| `Register` | unary to unary | control | `RegisterRequest` | `RegisterResponse` |
| `Configure` | unary to unary | control | `ConfigureRequest` | `ConfigureResponse` |
| `Start` | unary to unary | control | `StartRequest` | `StartResponse` |
| `Stop` | unary to unary | control | `StopRequest` | `StopResponse` |
| `Health` | unary to unary | control | `HealthRequest` | `AdapterHealth` |
| `Collect` | unary to stream | data | `CollectRequest` | `ContextualRecord` |
| `Subscribe` | unary to stream | data | `SubscribeRequest` | `ContextualRecord` |
| `Unsubscribe` | unary to unary | data | `UnsubscribeRequest` | `UnsubscribeResponse` |
| `Write` | unary to unary | capability | `WriteRequest` | `WriteResponse` |
| `Backfill` | unary to stream | capability | `BackfillRequest` | `ContextualRecord` |
| `Discover` | unary to unary | capability | `DiscoverRequest` | `DiscoverResponse` |
| `Ingest` | stream to unary | data | `ContextualRecord` | `IngestResponse` |

### Errors

| Condition | gRPC status |
|---|---|
| Unhandled exception in RPC handler | `INTERNAL` |
| Configure or Start called before Register | `FAILED_PRECONDITION` |
| No active sessions for Ingest | `FAILED_PRECONDITION` |
| Unknown adapter_id in request | `NOT_FOUND` |
| Invalid request message fields | `INVALID_ARGUMENT` |

## What it does not govern yet

The approved spec describes one Python implementation (it names Python modules and classes) and is silent on how the contract changes, limits, time-outs, loss of the link, duplicates and late commands. The owner reviewed it on 2026-11-18, sixteen questions, and signed the result as D-15. In short, T-1 to T-16 of that record:

- one language-neutral **contract spec**, and an **implementation spec** per language or runtime;
- within `forge.v1` only additions; a breaking change is a new major served beside the old; a hub serves two majors;
- versions, optional features and limits agreed at Register; the session is the unit, one per module id;
- records go up at least once, the hub de-duplicates; store and forward is part of the contract;
- commands go down at most once, are never stored, and expire;
- the hub manages the connection: keepalive, a goodbye on shutdown, a last will on loss;
- the numbers follow the class of data carried, not the medium; the classes are a dynamic list of rules;
- mutual TLS in production; one catalogue of errors with the reaction required of a module.

Building it is FB-164. Until then the spec above stays approved as it is.

## Integrity

The spec carries a hash since 2026-11-18 and the owner approved it that day. Every run gives `ftts:hash-verified` and `ftts:hash-approved` from the shared runner (D-14, F-4); `ftts:integrity-state` checks that the recorded state is a valid one and `ftts:integrity-hash-format` the format of the hash.

## Running it

```bash
forge governance run ftts grpc-hardened-transport
forge governance run ftts grpc-hardened-transport --live    # against a running hub
```

## What is not built

| Gap | Backlog |
|---|---|
| The transport contract of D-15 | FB-164 |
| The schema cannot tell a contract spec from an implementation spec | FB-164, FB-151 |
| Schema versions and a hash for the schema | FB-151 |
