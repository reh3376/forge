# Sprint Plan — Path 5: Adapter Transport Layer (gRPC + Protobuf)

**Version:** 1.0
**Created:** 2026-04-06
**Owner:** reh3376
**Phase Alignment:** F34 (Adapter Transport Layer)
**Dependencies:** Path 2 (Core Models), Path 3 (WMS Adapter), Path 4 (MES Adapter)
**Status:** Complete

---

## 1. Problem Statement

Forge's adapter ↔ hub data flow is currently in-process: `collect()` yields `ContextualRecord` Python objects directly. This works for testing but not for production, where adapters run as spoke sidecars alongside source systems (WMS, MES) on different machines from the hub. F34 adds gRPC + Protobuf as the canonical wire protocol between hub and spokes.

The key constraint: the existing adapter interface (`configure`, `start`, `collect`, `subscribe`, `write`, `backfill`, `discover`) must remain unchanged on the Python side. gRPC replaces the **transport pipe**, not the **adapter API**. Mapper functions (`map_batch(dict) → ManufacturingUnit`) remain transport-agnostic.

---

## 2. Scope & Constraints

**In scope:**
- Protobuf `.proto` definitions for all core message types (ContextualRecord, RecordContext, RecordValue, RecordTimestamp, RecordLineage, RecordSource, AdapterManifest, AdapterHealth)
- Protobuf enum definitions for all domain enums (12+ enums)
- `AdapterService` gRPC service definition with all RPC methods
- Python gRPC hub-side server (receives ContextualRecord streams from spoke sidecars)
- Python gRPC spoke-side client template (adapter classes use this to push records)
- Pydantic ↔ Protobuf serialization utilities (model_dump → proto, proto → model_validate)
- TypeScript gRPC sidecar skeleton (thin NestJS-to-Protobuf translation layer)
- FACTS spec for the gRPC transport itself (`adapter-transport.facts.json`)
- Performance benchmark: JSON/REST vs Protobuf/gRPC for ContextualRecord throughput
- Unit tests for proto ↔ Pydantic round-trip, gRPC lifecycle, streaming
- `unmap_*` function signature scaffolding in WMS+MES mapper modules (reverse mapper stubs for writeback)

**Out of scope (deferred):**
- Live connections to WMS/MES Docker stacks via gRPC
- Full `unmap_*` implementations (requires live system access for field mapping verification)
- Bidirectional streaming for subscribe (uni-directional Collect stream first)
- Production TLS certificate management
- Kubernetes deployment manifests
- Manufacturing domain model Protobuf definitions (entity-level protos deferred — only ContextualRecord + control plane needed now)

---

## 3. Architecture

```
┌──────────────────────────────┐       gRPC        ┌──────────────────────────────┐
│         SPOKE SIDECAR         │  ◄────────────►  │          HUB SERVER           │
│  (per source system)          │   Protobuf        │  (forge-hub)                  │
│                               │   stream          │                               │
│  ┌─────────────────────────┐  │                   │  ┌─────────────────────────┐  │
│  │ Native API Client       │  │   Configure()     │  │ AdapterServicer         │  │
│  │ (GraphQL/MQTT/REST)     │  │   Start()         │  │ (Python gRPC server)    │  │
│  ├─────────────────────────┤  │   Stop()          │  ├─────────────────────────┤  │
│  │ Adapter Class           │  │   Health()        │  │ Pydantic ↔ Proto        │  │
│  │ (WhkWmsAdapter etc.)    │  │   Collect() →     │  │ Deserializer            │  │
│  ├─────────────────────────┤  │   Subscribe() ↔   │  ├─────────────────────────┤  │
│  │ Pydantic → Proto        │  │   Write()         │  │ Governance Pipeline     │  │
│  │ Serializer              │  │   Backfill() →    │  │ (FACTS/FQTS/FSTS)       │  │
│  └─────────────────────────┘  │   Discover()      │  └─────────────────────────┘  │
└──────────────────────────────┘                   └──────────────────────────────┘
```

### Key Design Decisions

1. **Protobuf as governance artifact:** `.proto` files are checked into the repo alongside FACTS specs. Changes require the same review process.
2. **Bidirectional but asymmetric:** Ingestion (`map_*`) coalesces spoke fields. Writeback (`unmap_*`) uses `source_id` + change delta, not full replacement.
3. **`oneof` for RecordValue.raw:** Protobuf can't express Python `Any`. Solution: `oneof typed_value { double number_value; string string_value; bool bool_value; bytes bytes_value; string json_value; }` — JSON fallback for complex dicts.
4. **Server streaming for Collect:** Hub opens Collect() stream, sidecar pushes ContextualRecord messages. Backpressure via gRPC flow control.
5. **Backward compatible:** Existing adapter classes keep their Python interface. A `GrpcTransportAdapter` wraps any `AdapterBase` subclass and handles serialization.

---

## 4. Proto Message Plan

### Core Messages (forge/proto/contextual_record.proto)

| Proto Message | Pydantic Source | Fields | Notes |
|---------------|----------------|--------|-------|
| `ContextualRecordPb` | ContextualRecord | 6 | Primary streaming unit |
| `RecordSourcePb` | RecordSource | 4 | Adapter + system identity |
| `RecordTimestampPb` | RecordTimestamp | 3 | Uses google.protobuf.Timestamp |
| `RecordValuePb` | RecordValue | 4 | `oneof` for raw value |
| `RecordContextPb` | RecordContext | 10 | map<string,string> for extra |
| `RecordLineagePb` | RecordLineage | 4 | repeated string for chain |
| `QualityCodePb` | QualityCode | 4 values | Enum |

### Control Plane Messages (forge/proto/adapter.proto)

| Proto Message | Pydantic Source | Notes |
|---------------|----------------|-------|
| `AdapterManifestPb` | AdapterManifest | Registration/discovery |
| `AdapterHealthPb` | AdapterHealth | Health polling |
| `AdapterCapabilitiesPb` | AdapterCapabilities | 5 bool flags |
| `ConnectionParamPb` | ConnectionParam | Config schema |
| `DataContractPb` | DataContract | Schema ref + fields |
| `AdapterStatePb` | AdapterState | 6-value enum |
| `AdapterTierPb` | AdapterTier | 5-value enum |

### Domain Enums (forge/proto/enums.proto)

All 12 manufacturing domain enums: UnitStatus, LifecycleState, AssetType, AssetOperationalState, EventSeverity, EventCategory, EntityType, WorkOrderStatus, WorkOrderPriority, OrderStatus, SampleOutcome, plus QualityCode.

---

## 5. gRPC Service Definition

```protobuf
service AdapterService {
  // Control plane
  rpc Register(AdapterManifestPb) returns (RegisterResponse);
  rpc Configure(ConfigureRequest) returns (ConfigureResponse);
  rpc Start(StartRequest) returns (StartResponse);
  rpc Stop(StopRequest) returns (StopResponse);
  rpc Health(HealthRequest) returns (AdapterHealthPb);

  // Data plane — primary ingestion
  rpc Collect(CollectRequest) returns (stream ContextualRecordPb);

  // Capabilities — conditional on manifest
  rpc Subscribe(SubscribeRequest) returns (stream ContextualRecordPb);
  rpc Unsubscribe(UnsubscribeRequest) returns (UnsubscribeResponse);
  rpc Write(WriteRequest) returns (WriteResponse);
  rpc Backfill(BackfillRequest) returns (stream ContextualRecordPb);
  rpc Discover(DiscoverRequest) returns (DiscoverResponse);
}
```

---

## 6. Implementation Plan

### Sprint P5.1: Protobuf Definitions
- Create `src/forge/proto/` directory
- `contextual_record.proto` — 7 messages + QualityCode enum
- `adapter.proto` — 7 messages + 2 enums + request/response wrappers
- `enums.proto` — 12 domain enums
- `adapter_service.proto` — service definition with 11 RPCs
- `buf.yaml` / proto compilation config
- Generate Python stubs (`*_pb2.py`, `*_pb2_grpc.py`)

### Sprint P5.2: Python gRPC Server + Client + Serialization
- `src/forge/transport/` package
- `serialization.py` — `pydantic_to_proto()` and `proto_to_pydantic()` for all message types
- `hub_server.py` — `AdapterServiceServicer` (gRPC server implementation, hub-side)
- `spoke_client.py` — `SpokeClient` class (gRPC client template, spoke-side)
- `transport_adapter.py` — `GrpcTransportAdapter` wrapper that takes any AdapterBase and streams via gRPC
- Add `grpcio>=1.60.0`, `protobuf>=5.27.0`, `grpcio-tools>=1.60.0` to pyproject.toml

### Sprint P5.3: TypeScript Sidecar Skeleton
- Create `sidecars/` top-level directory
- `sidecars/whk-sidecar/` — shared NestJS gRPC sidecar template
- `package.json` with `@grpc/grpc-js`, `@grpc/proto-loader`, `google-protobuf`
- `src/grpc-client.ts` — connects to Forge hub, implements AdapterService client
- `src/adapter-bridge.ts` — bridges NestJS GraphQL/REST to Protobuf stream
- `proto/` — symlink or copy of Python .proto files (single source of truth)
- `tsconfig.json`, basic build config

### Sprint P5.4: Tests, Benchmarks, FACTS Spec + Verification
- `tests/transport/test_serialization.py` — round-trip tests for all message types
- `tests/transport/test_hub_server.py` — gRPC server lifecycle, stream delivery
- `tests/transport/test_spoke_client.py` — client connection, stream consumption
- `tests/transport/test_transport_adapter.py` — GrpcTransportAdapter wrapping WMS/MES adapters
- `benchmarks/bench_transport.py` — JSON vs Protobuf serialization throughput
- `specs/adapter-transport.facts.json` — FACTS spec for transport conformance
- `unmap_*` stub signatures in WMS + MES mapper modules
- ruff check clean
- Full test suite verification

---

## 7. Verification Checklist

- [x] `.proto` files compile cleanly with protoc / buf (4 files: enums, contextual_record, adapter, adapter_service)
- [x] All Pydantic ↔ Proto round-trips are lossless (ContextualRecord, Manifest, Health)
- [x] RecordValue.raw `oneof` handles: float, string, bool, bytes, dict (JSON), list (JSON), None, int, NaN, Inf
- [x] gRPC Collect() server-streams ContextualRecords from spoke → hub (via InMemoryChannel)
- [x] GrpcTransportAdapter wraps WhkWmsAdapter and WhkMesAdapter without adapter code changes
- [x] TypeScript sidecar skeleton created (types, gRPC client, adapter bridge, entry point)
- [x] Performance benchmark: proto dict serialize 1.10x faster than JSON serialize
- [x] `adapter-transport.facts.json` spec written (50 conformance tests declared)
- [ ] `unmap_*` stubs present in WMS + MES mapper modules (deferred — requires live field verification)
- [x] Unit tests for all serialization paths (18 typed_value + 7 record + 7 manifest + 4 health + 3 timestamp + 3 context + 2 error = 44 serialization tests)
- [x] gRPC server lifecycle tests (10 hub server + 13 spoke client = 23 lifecycle tests)
- [x] `ruff check` clean
- [x] PHASES.md F34 updated
- [x] Sprint retrospective

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `RecordValue.raw = Any` doesn't round-trip cleanly | High | `oneof` with JSON fallback for complex types; explicit round-trip tests for every variant |
| Proto compilation adds build complexity | Medium | Use `buf` for linting + generation; add `make proto` target |
| TypeScript sidecar scope creep | Medium | Skeleton only — no live NestJS integration in this sprint |
| gRPC streaming backpressure | Low | gRPC has built-in flow control; test with high-volume synthetic data |
| Protobuf schema evolution | Medium | Follow proto3 field numbering rules; never reuse field numbers |

---

## 9. Retrospective

### Results

| Metric | Target | Actual |
|--------|--------|--------|
| Transport tests | ~50 | **73** |
| Total project tests | ~700 | **723** |
| Proto files | 4 | **4** (enums, contextual_record, adapter, adapter_service) |
| gRPC RPCs | 11 | **11** (5 control, 3 data, 3 capability) |
| Proto enums | 12 | **14** (added AdapterState, AdapterTier) |
| Ruff violations | 0 | **0** (48 found and fixed during development) |
| Serialize speedup | >1x | **1.10x** (proto dict vs JSON, serialize direction) |

### What Went Well

1. **InMemoryChannel pattern proved its value.** By abstracting the transport as a `TransportChannel` interface, the entire spoke-client ↔ hub-server pipeline is testable without real gRPC. 73 tests run in 0.09s with full end-to-end streaming verification. When we wire in real gRPC, only the channel implementation changes.

2. **GrpcTransportAdapter is a clean zero-change wrapper.** Both WhkWmsAdapter and WhkMesAdapter were wrapped and tested without touching a single line of adapter code. This validates the design principle that mappers are transport-agnostic.

3. **`oneof typed_value` solved the `Any` problem.** Six explicit variants (double, int64, string, bool, bytes, json) handle every raw value type the adapters produce. The JSON fallback for dicts/lists is clean and explicit. NaN/Inf edge cases are handled by falling through to string representation.

4. **Proto file design followed governance principles.** Field numbering with reserved gaps, UNSPECIFIED=0 convention, prefixed enum values to avoid namespace collisions — all proto3 best practices that will prevent breaking changes as the schema evolves.

### Lessons Learned

1. **TC001/TC003 ruff rules vs runtime imports.** Ruff wants to move application imports into `TYPE_CHECKING` blocks, but our transport modules use those types at runtime (for isinstance checks, constructors, etc.). Solution: file-level `# ruff: noqa: TC001, TC003` with a comment explaining why. This is a known tension in Python typing.

2. **WMS/MES configs have required fields.** The transport adapter tests initially passed empty dicts to `configure()`, but the real adapters validate connection params. Tests need realistic dummy configs even when not connecting to live systems.

3. **Benchmark shows dict-based serialization is close to parity with Pydantic JSON.** The 1.10x serialize speedup is modest because we're still operating on dicts, not binary protobuf. The real performance gain comes when compiled stubs enable binary serialization — estimated 50-70% wire size reduction and 2-5x throughput improvement.

### Deferred Items

- `unmap_*` reverse mapper stubs (requires live system field mapping verification)
- Real gRPC server/client wiring (replaces InMemoryChannel with `grpc.aio`)
- TLS certificate management for production gRPC connections
- Kubernetes deployment manifests for sidecar containers
- Bidirectional streaming for Subscribe (current: server-streaming only)
- Manufacturing domain model Protobuf definitions (entity-level protos — only ContextualRecord + control plane defined so far)
