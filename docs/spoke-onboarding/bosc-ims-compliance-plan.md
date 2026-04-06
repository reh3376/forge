# Forge Spoke Compliance Plan: BOSC IMS

**Spoke ID:** `bosc_ims`
**Status:** Not in production — can be modified freely
**Date:** 2026-04-06
**Requires Approval:** YES — no implementation work begins without explicit sign-off

---

## 1. Spoke Summary

BOSC IMS is an aerospace supply-chain inventory management system built as a compliance-enforcing spoke in a Hub-and-Spoke manufacturing ecosystem. It tracks assets through three-dimensional state (disposition, system_state, asset_state) with an append-only event log, full compliance audit trails, and graph-based lineage queries.

**Tech Stack:** Go gRPC core + Python intelligence sidecar + Next.js operator UI
**Current Proto Package:** `bosc.v1` (16 proto files, 7 gRPC services, ~45 RPCs)
**Current Hub Transport:** Kafka/Redpanda (franz-go client) — NOT gRPC, NOT FTTS-governed

---

## 2. Current Communication Architecture

### Hub Ingress (Hub → BOSC IMS)
- **Protocol:** Kafka consumer on topic `bosc.hub.ingress.v1`
- **Format:** Binary protobuf (`HubIntelligenceEvent`) — good, already compiled proto
- **Consumer Group:** `bosc-ims-spoke`
- **Message types:** Predictive logistics, vendor alerts, global recalls
- **Client:** franz-go `kgo.Client` with manual commit, exponential backoff

### Hub Egress (BOSC IMS → Hub)
- **Protocol:** Redpanda producer via transactional outbox
- **Format:** Binary protobuf (`HubEgressEvent` wrapping `TransactionEvent`)
- **Pipeline:** Asset mutation → Outbox (same DB tx) → OutboxPublisher → Redpanda → Hub
- **Egress Filter:** `EgressPolicy` allows only 6 of 18 event types (RECEIVED, SHIPPED, DISPOSITION_CHANGED, DERIVED, INSTALLED, REMOVED)
- **Fallback:** `LocalEventBuffer` (in-memory ring) when Postgres is unreachable

### Internal gRPC (Go Core ↔ Python Sidecar)
- **Protocol:** gRPC with optional mTLS
- **Port:** 50051 (sidecar), 50050 (Go core)
- **Services:** ComplianceClient, IntelligenceClient

### Current Gaps vs. FTTS
| Requirement | Current State | Gap |
|---|---|---|
| gRPC transport to hub | Kafka pub/sub | **MAJOR** — transport mechanism is message queue, not RPC |
| Binary protobuf on wire | ✅ Already binary proto | None |
| Forge AdapterService contract | Own `bosc.v1` services | **MAJOR** — no Forge adapter layer |
| FTTS governance spec | None | **MAJOR** — no FTTS spec instance |
| Proto bridge (Pydantic↔Proto) | Not applicable (Go core) | N/A — Go uses proto natively |
| Metadata headers (`x-forge-adapter-id`, `x-forge-session-id`) | Not present | **MINOR** — add to gRPC metadata |
| Error protocol (gRPC status codes) | Standard gRPC errors | **MINOR** — map to FTTS error taxonomy |
| Device/spoke identity (PKI) | `DefaultTargetSpokeID = "bosc_ims_primary"` (string) | **MODERATE** — need Forge-issued identity |

---

## 3. Compliance Strategy

### 3.1 Adapter Pattern (Recommended)

Since BOSC IMS is a Go application with its own mature proto contract (`bosc.v1`), the integration follows the **Forge Adapter pattern**: a thin Python adapter service sits between the Forge Hub and the BOSC IMS gRPC core. This is consistent with the WMS and MES adapter vertical slices.

```
┌─────────────┐     gRPC (forge.v1)     ┌───────────────────┐     gRPC (bosc.v1)     ┌─────────────┐
│  Forge Hub   │ ◄──────────────────────► │  BOSC IMS Adapter  │ ◄──────────────────────► │  BOSC IMS    │
│  (Python)    │   AdapterService         │  (Python)          │   AssetService etc.     │  Go Core     │
└─────────────┘                          └───────────────────┘                          └─────────────┘
```

**Why an adapter instead of modifying the Go core:**
- BOSC IMS already has a well-designed proto contract — rewriting it to `forge.v1` would be wasteful
- The adapter handles translation between Forge's `ContextualRecord`-based model and BOSC's domain-specific messages
- Keeps the Go core's "single authority" principle intact
- Python adapter can leverage the existing `proto_bridge`, `grpc_channel`, and `grpc_server` infrastructure from Forge

### 3.2 Retire Kafka Hub Transport

The current Kafka-based hub integration (`hub/consumer.go`, `hub/egress.go`) must be replaced by the Forge adapter's gRPC channel. This is the most significant change.

**Current flow (retire):**
```
Hub → Redpanda topic → Consumer.Run() → handler → domain logic
Domain logic → outbox → OutboxPublisher → Redpanda → Hub
```

**Target flow:**
```
Hub → gRPC AdapterService.Collect() → Adapter → gRPC bosc.v1.AssetService → Go Core
Go Core → TransactionEvent → Adapter subscribes → gRPC AdapterService.Subscribe() → Hub
```

### 3.3 What Changes in the BOSC IMS Codebase

| Change | Scope | Risk |
|---|---|---|
| Remove `hub/consumer.go` Kafka consumer | Delete ~250 LOC | Low — replaced by adapter |
| Remove `hub/egress.go` Kafka egress | Modify egress to emit via adapter callback | Low |
| Add adapter gRPC client in Go core | New ~100 LOC client that adapter calls | Low |
| Expose event stream endpoint | New gRPC streaming RPC for adapter to subscribe | Medium |
| Add Forge metadata to gRPC context | ~20 LOC interceptor addition | Low |
| Docker compose: remove Redpanda dependency for hub comm | Config change only | Low — Redpanda may still be used for internal event log |

**What does NOT change:**
- All 7 existing gRPC services remain as-is
- All 16 proto files remain as-is (`bosc.v1` package)
- Go core ↔ Python sidecar communication unchanged
- Append-only event log pipeline unchanged (outbox still writes to Postgres)
- Three-dimensional state machine unchanged
- All compliance logic unchanged

---

## 4. Forge Adapter Design

### 4.1 Adapter Location
```
forge-platform/src/forge/adapters/bosc_ims/
├── __init__.py
├── adapter.py           # ForgeAdapter subclass
├── proto_mappings.py    # ContextualRecord ↔ bosc.v1 message translation
├── grpc_client.py       # bosc.v1 gRPC stub wrapper
└── config.py            # Connection config, spoke identity
```

### 4.2 Message Translation Matrix

| Forge Direction | Forge Message | BOSC IMS Message | Translation Complexity |
|---|---|---|---|
| Hub → Spoke (Collect) | `CollectRequest` → `ContextualRecord` | `ReceiveAssetRequest`, `TransitionStateRequest` | High — must decompose ContextualRecord fields into typed domain RPCs |
| Spoke → Hub (Subscribe) | `ContextualRecord` stream | `TransactionEvent` stream | Medium — wrap event fields into ContextualRecord |
| Hub → Spoke (Write) | `WriteRequest` | `ShipAssetRequest`, `MarkValidationCompleteRequest` | Medium — command mapping |
| Discovery | `DiscoverRequest` → `TagDescriptor[]` | Introspect bosc.v1 services | Low — static manifest |

### 4.3 FACTS Spec

A new FACTS spec file (`specs/bosc-ims-adapter.facts.json`) will declare the adapter's identity, capabilities, data contracts, and connection parameters — consistent with the WMS and MES adapter specs.

### 4.4 FTTS Compliance

The adapter inherits FTTS compliance from the Forge transport layer. The `grpc-hardened-transport.ftts.json` spec already governs the `AdapterService` contract. The BOSC IMS adapter will:
- Use compiled protobuf stubs (never JSON-over-gRPC)
- Implement all required `AdapterService` RPCs
- Include `x-forge-adapter-id` and `x-forge-session-id` metadata
- Map gRPC errors to the FTTS error protocol

---

## 5. Implementation Phases

### Phase 1: Adapter Scaffold (Forge Platform Side Only)
**Effort:** 1-2 days | **Risk:** Low | **Requires spoke changes:** No

- Create adapter directory under `forge-platform/src/forge/adapters/bosc_ims/`
- Generate Python gRPC stubs from `bosc.v1` protos (using `grpcio-tools`)
- Implement `DiscoverRequest` → static tag manifest from BOSC's proto contract
- Write FACTS spec (`bosc-ims-adapter.facts.json`)
- Unit tests for discovery and manifest

### Phase 2: Ingress Translation (Hub → BOSC IMS)
**Effort:** 2-3 days | **Risk:** Medium | **Requires spoke changes:** No (adapter calls existing BOSC RPCs)

- Implement `CollectRequest` handler that decomposes `ContextualRecord` into appropriate `bosc.v1` RPCs
- Map ContextualRecord fields to `ReceiveAssetRequest`, `TransitionStateRequest`, etc.
- Handle the three-dimensional state model in translation
- Integration tests against BOSC IMS gRPC server

### Phase 3: Egress Translation (BOSC IMS → Hub)
**Effort:** 2-3 days | **Risk:** Medium | **Requires spoke changes:** YES — add event stream RPC

- Add `StreamTransactionEvents` server-streaming RPC to BOSC IMS Go core (new proto + handler)
- Adapter subscribes to event stream, translates `TransactionEvent` → `ContextualRecord`
- Respect existing `EgressPolicy` filter (only 6 event types egress)
- Integration tests for bidirectional flow

### Phase 4: Kafka Retirement
**Effort:** 1 day | **Risk:** Low | **Requires spoke changes:** YES — remove Kafka hub consumer

- Remove `hub/consumer.go` and `hub/egress.go` Kafka-based hub transport
- Update `main.go` to remove hub consumer wiring
- Redpanda remains for internal event log (outbox → internal consumers) but no longer serves as hub transport
- Docker compose update (Redpanda stays but hub topic config removed)

### Phase 5: Governance Gate
**Effort:** 1 day | **Risk:** Low | **Requires spoke changes:** No

- Run FTTS runner against the adapter
- Run FACTS runner against the adapter spec
- Add to CI pipeline
- Documentation update

**Total estimated effort:** 7-10 days
**Spoke codebase changes:** ~350 LOC added (streaming RPC), ~250 LOC removed (Kafka hub transport)

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Event stream RPC adds latency vs Kafka | Medium | Low | Buffered streaming with backpressure; internal event log still uses outbox |
| Translation loss between ContextualRecord and domain types | Medium | High | Exhaustive mapping tests; round-trip validation |
| Redpanda still needed for internal events | Low | Low | Redpanda stays in docker-compose; only hub transport changes |
| Three-dimensional state doesn't map cleanly to ContextualRecord | Medium | Medium | Custom metadata fields in ContextualRecord; adapter carries state context |

---

## 7. Decision Points Requiring Approval

1. **Adapter pattern vs. direct Forge proto adoption** — Recommendation: Adapter (preserves existing Go contract)
2. **Event stream mechanism** — Recommendation: Server-streaming gRPC RPC on the Go core
3. **Redpanda retention** — Recommendation: Keep for internal event log, retire for hub transport only
4. **Phase 3 Go code changes** — Requires approval before modifying BOSC IMS codebase

---

## 8. Success Criteria

- [ ] BOSC IMS adapter passes FTTS runner with zero violations
- [ ] BOSC IMS adapter passes FACTS runner with zero violations
- [ ] Bidirectional Hub ↔ BOSC IMS communication works over gRPC (not Kafka)
- [ ] All existing BOSC IMS unit and integration tests still pass
- [ ] No changes to BOSC IMS internal domain logic
- [ ] EgressPolicy filter preserved in adapter translation layer
