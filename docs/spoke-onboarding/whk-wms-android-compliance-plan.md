# Forge Spoke Compliance Plan: WHK-WMS Android (Scanner Edge Device)

**Spoke ID:** `whk_scanner`
**Status:** Production — changes require careful planning
**Date:** 2026-04-06
**Requires Approval:** YES — no implementation work begins without explicit sign-off

---

## 1. Spoke Summary

WHK-WMS Android is a production Kotlin Android application deployed on Keyence handheld scanners that captures barrel QR code scans (entry, dump, withdrawal, relocation, inspection, inventory, label verification) and syncs them to the WMS backend. It serves as the physical-world data ingestion edge for the warehouse.

**Tech Stack:** Kotlin, Android SDK 34, Retrofit 2.9.0 + Moshi (REST/JSON), Room/SQLite (local), WorkManager (background sync), Azure OAuth2
**Current Transport:** REST/JSON over HTTPS → `POST /api/android-sync` (batch upload of `BarrelEvent` objects)
**Database:** SQLite schema v51 with 27 repository classes, outbox pattern with CUID IDs

### Why This Spoke Matters Beyond WMS

This scanner infrastructure is a **shared edge input mechanism** that will serve multiple Forge spokes:

- **WMS** (current) — barrel tracking, warehouse jobs
- **IMS** (planned) — inventory asset tracking via QR/barcode scans
- **QMS** (future) — sample QR codes tied to batch IDs, timestamps, physical plant assets

The compliance plan must account for this multi-spoke future by designing the scanner as a **Forge edge device** rather than a WMS-only peripheral.

---

## 2. Current Communication Architecture

### Data Flow
```
QR Scan → BarrelEvent (SQLite) → Outbox trigger → PendingBarrelEventUploadWorker
    → Batch POST /api/android-sync (200 events/chunk) → WMS Backend (NestJS)
    → WMS processes via androidSyncInbox module
```

### Upload Protocol
- **Method:** REST POST with JSON body (Retrofit + Moshi)
- **Auth:** Azure OAuth2 device token (5-minute buffer refresh)
- **Batch size:** 200 events per chunk
- **Retry:** WorkManager automatic retry with backoff
- **Failure handling:** SyncHistory table, email notification via SMTP on persistent failures

### Inbound Sync (WMS → Android)
- **DeltaPullWorker:** Periodic REST GET for updated barrel data, storage locations, warehouse jobs
- **StorageLocationSyncWorker:** Location hierarchy sync
- **HeartbeatWorker:** Device health ping

### Current Gaps vs. FTTS

| Requirement | Current State | Gap |
|---|---|---|
| gRPC transport | REST/JSON via Retrofit | **MAJOR** — entire transport layer must change |
| Binary protobuf on wire | JSON (Moshi serialization) | **MAJOR** — JSON forbidden by FTTS |
| Compiled proto stubs | None | **MAJOR** — need protobuf-java + grpc-kotlin codegen |
| Forge AdapterService contract | Direct REST to WMS | **MAJOR** — no adapter layer |
| FTTS governance spec | None | **MAJOR** — no spec instance |
| Metadata headers | Custom headers only | **MODERATE** — add Forge metadata |
| Device identity (PKI) | Azure OAuth2 token only | **MODERATE** — need Forge-issued device cert |
| Append-only event log | SQLite outbox (has DELETE) | **MODERATE** — need immutability constraint |
| Error protocol | HTTP status codes | **MODERATE** — map to gRPC status codes |

---

## 3. Compliance Strategy

### 3.1 Edge Device Adapter Pattern

The Android scanner is a **constrained edge device** — it cannot run a full Forge adapter internally. The strategy uses a **two-tier architecture**:

```
┌──────────────┐    gRPC (forge.v1)    ┌────────────────────┐    gRPC (forge.v1)    ┌─────────────┐
│  Android App  │ ◄───────────────────► │  Scanner Gateway    │ ◄───────────────────► │  Forge Hub   │
│  (Kotlin)     │   ScannerService      │  Adapter (Python)   │   AdapterService      │  (Python)    │
└──────────────┘                       └────────────────────┘                       └─────────────┘
                                              │
                                              ▼ routes scan events to
                                       ┌─────────────┐
                                       │  WMS / IMS / │
                                       │  QMS spokes  │
                                       └─────────────┘
```

**Why a gateway adapter:**
- Android devices are constrained — running a full Forge adapter on-device is impractical
- The gateway adapter handles spoke routing: scan events get dispatched to the correct spoke (WMS for barrels, IMS for inventory assets, QMS for samples) based on scan context
- Centralizes FTTS governance enforcement — edge devices don't need to understand the full spec
- The Android app speaks a lightweight `ScannerService` gRPC contract; the gateway translates to `AdapterService`

### 3.2 Scanner Proto Contract (New)

A new proto package (`scanner.v1`) defines the lightweight edge device contract:

```protobuf
// scanner/v1/scanner_service.proto
service ScannerService {
  rpc SubmitScanBatch(SubmitScanBatchRequest) returns (SubmitScanBatchResponse);
  rpc PullDelta(PullDeltaRequest) returns (PullDeltaResponse);
  rpc Heartbeat(HeartbeatRequest) returns (HeartbeatResponse);
  rpc RegisterDevice(RegisterDeviceRequest) returns (RegisterDeviceResponse);
}
```

This is intentionally minimal — edge devices speak a simple contract, and the gateway adapter handles the Forge complexity.

### 3.3 What Changes in the Android Codebase

| Change | Scope | Risk |
|---|---|---|
| Replace Retrofit REST client with gRPC-Kotlin stubs | ~500 LOC rewrite of API layer | **High** — core transport change |
| Replace Moshi JSON serialization with protobuf | ~200 LOC in model/DTO layer | Medium |
| Add protobuf-java + grpc-kotlin dependencies | `build.gradle.kts` changes | Low |
| Replace `PendingBarrelEventUploadWorker` with gRPC batch submit | ~150 LOC worker rewrite | Medium |
| Replace `DeltaPullWorker` with gRPC delta pull | ~100 LOC worker rewrite | Medium |
| Replace `HeartbeatWorker` with gRPC heartbeat | ~50 LOC rewrite | Low |
| Add device registration flow (PKI cert exchange) | ~200 LOC new code | Medium |
| Add Forge metadata to gRPC context | ~30 LOC interceptor | Low |
| SQLite outbox: add immutability constraint | ~20 LOC migration | Low |

**What does NOT change:**
- QR scanning logic (Keyence SDK integration)
- UI fragments and ViewModels (presentation layer)
- SQLite local storage schema (except immutability constraint)
- WorkManager job scheduling (workers change internally, scheduling stays)
- Azure OAuth2 auth (retained alongside Forge device identity)
- Offline-first architecture (local SQLite → sync when connected)

---

## 4. Forge Adapter Design (Scanner Gateway)

### 4.1 Adapter Location
```
forge-platform/src/forge/adapters/scanner_gateway/
├── __init__.py
├── adapter.py             # ForgeAdapter subclass
├── scanner_grpc_server.py # ScannerService gRPC server (Android-facing)
├── spoke_router.py        # Routes scans to WMS/IMS/QMS adapters
├── proto_mappings.py      # ScanEvent ↔ ContextualRecord translation
├── device_registry.py     # Device identity management
└── config.py              # Connection config, spoke routing rules
```

### 4.2 Message Translation Matrix

| Direction | Source | Target | Complexity |
|---|---|---|---|
| Android → Gateway | `SubmitScanBatchRequest` (scanner.v1) | Route to WMS/IMS/QMS adapter | Medium — needs scan type classification |
| Gateway → Hub | `ContextualRecord` | From translated scan events | Low — standard ContextualRecord wrapping |
| Hub → Gateway → Android | `PullDeltaResponse` | Barrel/asset reference data | Medium — aggregate from multiple spokes |
| Device registration | `RegisterDeviceRequest` | Forge device identity record | Low — one-time flow |

### 4.3 Spoke Routing Logic

The gateway adapter inspects scan context to route events:

| Scan Type | Current Target | Future Target(s) |
|---|---|---|
| `ENTRY`, `DUMP`, `WITHDRAWAL`, `RELOCATION` | WMS | WMS |
| `INSPECTION`, `INVENTORY` | WMS | WMS + IMS |
| `LABEL_VERIFICATION` | WMS | WMS |
| `SAMPLE_SCAN` (new) | — | QMS |
| `ASSET_SCAN` (new) | — | IMS |

New scan types will be added as IMS and QMS come online — the gateway's routing table is configuration-driven, not hardcoded.

### 4.4 FACTS Spec

A new FACTS spec (`specs/scanner-gateway-adapter.facts.json`) will declare the gateway adapter's identity, capabilities, routing rules, and supported scan types.

### 4.5 FTTS Compliance

- The gateway adapter ↔ Forge Hub link is fully FTTS-governed (compiled protobuf, AdapterService contract)
- The Android ↔ gateway link uses a lighter `ScannerService` contract (still compiled protobuf, still gRPC, but not the full AdapterService — edge devices get a simpler interface)
- A separate FTTS-lite spec (`specs/scanner-edge-transport.ftts.json`) may govern the edge link, or the edge link can be declared as a sub-transport within the gateway's FACTS spec

---

## 5. Implementation Phases

### Phase 1: Proto Contract & Gateway Scaffold (Forge Platform Side Only)
**Effort:** 2-3 days | **Risk:** Low | **Requires Android changes:** No

- Define `scanner.v1` proto package (ScannerService, ScanEvent, DeviceIdentity messages)
- Generate Python stubs (gateway side) and Kotlin stubs (Android side — build but don't integrate yet)
- Create gateway adapter scaffold under `forge-platform/src/forge/adapters/scanner_gateway/`
- Write FACTS spec for the gateway adapter
- Unit tests for routing logic and proto mapping

### Phase 2: Gateway ↔ Hub Integration
**Effort:** 2-3 days | **Risk:** Low | **Requires Android changes:** No

- Implement `AdapterService` RPCs in gateway (Collect, Subscribe, Discover)
- Implement spoke routing table (WMS-only initially)
- Translate `ContextualRecord` ↔ `ScanEvent` ↔ WMS barrel event
- Integration tests against Forge Hub
- FTTS runner validation

### Phase 3: Android gRPC Migration
**Effort:** 5-7 days | **Risk:** High | **Requires Android changes:** YES — core transport rewrite

- Add `protobuf-java`, `grpc-kotlin`, `grpc-okhttp` dependencies to `build.gradle.kts`
- Generate Kotlin gRPC stubs from `scanner.v1` protos
- Create `ScannerGrpcClient` replacing Retrofit-based `BarrelEventsPushApi`
- Rewrite `PendingBarrelEventUploadWorker` to use gRPC batch submit
- Rewrite `DeltaPullWorker` to use gRPC delta pull
- Rewrite `HeartbeatWorker` to use gRPC heartbeat
- Add gRPC interceptor for Forge metadata headers
- **Parallel REST/gRPC operation** during migration (feature flag to switch transport)
- Comprehensive testing on Keyence hardware

### Phase 4: Device Identity & Immutability
**Effort:** 2-3 days | **Risk:** Medium | **Requires Android changes:** YES

- Implement device registration flow (Android → Gateway → Forge identity)
- Add device certificate storage (Android Keystore)
- SQLite migration: add immutability constraint on outbox table
- Add append-only enforcement (trigger-based DELETE prevention)

### Phase 5: REST Retirement & Governance Gate
**Effort:** 1-2 days | **Risk:** Low | **Requires Android changes:** YES — remove REST code

- Remove Retrofit REST client, Moshi JSON serialization
- Remove REST-specific workers
- Run FTTS runner, FACTS runner
- Add to CI pipeline
- Update WMS backend to deprecate `/api/android-sync` endpoint (coordinated change)

**Total estimated effort:** 12-18 days
**Android codebase changes:** ~1,250 LOC rewritten, ~800 LOC removed, ~400 LOC new

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| gRPC on constrained Android hardware (Keyence) | Medium | High | Use `grpc-okhttp` transport (lighter than Netty); benchmark on target hardware in Phase 3 |
| Offline-first breaks with gRPC | Low | High | Local SQLite outbox stays; gRPC is the sync transport, not the storage layer |
| REST → gRPC migration causes production scan loss | Medium | Critical | Feature flag for parallel REST/gRPC; phased rollout with fallback |
| Multi-spoke routing complexity | Low | Medium | Start with WMS-only routing; add IMS/QMS routes incrementally |
| Proto schema versioning across Android app updates | Medium | Medium | Protobuf backward compatibility rules; gateway handles schema negotiation |

---

## 7. Decision Points Requiring Approval

1. **Edge device adapter (gateway) vs. full adapter on Android** — Recommendation: Gateway pattern (Android is constrained)
2. **Separate `scanner.v1` proto package vs. reuse `forge.v1`** — Recommendation: Separate lightweight package
3. **Phase 3 Android codebase transport rewrite** — Requires explicit approval (production app)
4. **Parallel REST/gRPC operation period** — Recommendation: 2-4 weeks of parallel running before REST retirement
5. **Multi-spoke routing design** — Recommendation: Configuration-driven routing table in gateway adapter
6. **WMS `/api/android-sync` deprecation timeline** — Coordinated with WMS team

---

## 8. Success Criteria

- [ ] Scanner gateway adapter passes FTTS runner with zero violations
- [ ] Scanner gateway adapter passes FACTS runner with zero violations
- [ ] Android app communicates with gateway via gRPC (not REST)
- [ ] Binary protobuf on the wire (no JSON)
- [ ] Scan events successfully routed through gateway → Forge Hub → WMS spoke
- [ ] All existing scan types (7) work identically through new transport
- [ ] Offline-first behavior preserved (local SQLite → sync when connected)
- [ ] Device identity registered with Forge
- [ ] No scan data loss during REST → gRPC migration
- [ ] Keyence hardware performance acceptable (scan-to-sync latency ≤ current REST baseline)
