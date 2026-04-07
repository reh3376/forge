# Forge Module Builder SDK

**Version:** 0.1.0
**Location:** `src/forge/sdk/module_builder/`
**CLI Entry:** `forge module init|list|validate`

---

## What This Document Covers

This guide explains everything you need to build a new Forge adapter module, from first principles through production deployment. It assumes no prior knowledge of the Forge codebase.

**Read time:** ~20 minutes
**Skill level:** Intermediate Python developer who has never touched Forge before

---

## Table of Contents

1. [What Is a Forge Adapter Module?](#1-what-is-a-forge-adapter-module)
2. [The 6-File Pattern](#2-the-6-file-pattern)
3. [Quick Start (CLI)](#3-quick-start-cli)
4. [Quick Start (Programmatic)](#4-quick-start-programmatic)
5. [Understanding the Manifest](#5-understanding-the-manifest)
6. [Configuration Model (config.py)](#6-configuration-model-configpy)
7. [Adapter Class (adapter.py)](#7-adapter-class-adapterpy)
8. [Context Mapper (context.py)](#8-context-mapper-contextpy)
9. [Record Builder (record_builder.py)](#9-record-builder-record_builderpy)
10. [FACTS Governance Spec](#10-facts-governance-spec)
11. [Testing Your Module](#11-testing-your-module)
12. [CLI Reference](#12-cli-reference)
13. [API Reference](#13-api-reference)
14. [Common Patterns](#14-common-patterns)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. What Is a Forge Adapter Module?

Forge is a manufacturing decision infrastructure platform. It collects data from many source systems (WMS, MES, SCADA, ERP, CMMS, etc.) and transforms that data into **ContextualRecords** — data with operational context attached.

An **adapter module** is the bridge between one source system and Forge. It:

- **Declares** what it can do (capabilities) and how to connect (connection params)
- **Collects** raw data from the source system
- **Maps** raw data into Forge's universal `RecordContext` format
- **Assembles** complete `ContextualRecord` objects for the governance pipeline
- **Conforms** to a FACTS governance spec that defines its behavior contract

Every adapter follows the exact same structure. The Module Builder SDK generates all the boilerplate (60-70% of the code), so you only write the domain-specific parts.

### Data Flow

```
Source System (WMS, SCADA, ERP, etc.)
    │
    ▼
adapter.py  →  collect()  →  raw dicts
    │
    ▼
context.py  →  build_record_context()  →  RecordContext
    │
    ▼
record_builder.py  →  build_contextual_record()  →  ContextualRecord
    │
    ▼
Forge Governance Pipeline (FACTS validation → storage → curation)
```

### Key Concepts

| Concept | What It Is |
|---------|-----------|
| **ContextualRecord** | Forge's universal data unit. A value with its operational context, timestamps, source, and lineage attached. This is what makes Forge different from a raw data pipeline. |
| **RecordContext** | Operational metadata: equipment_id, batch_id, lot_id, shift, operator_id, etc. Travels with every record so downstream consumers can correctly interpret the value. |
| **AdapterManifest** | JSON declaration of identity, capabilities, connection params, and data contract. Drives code generation and hub registration. |
| **FACTS Spec** | Governance contract. Defines lifecycle state transitions, required context mappings, enrichment rules, and integrity hash. |
| **ISA-95 Tier** | Classification of where the source system sits in the manufacturing hierarchy: OT (shopfloor), MES_MOM (execution), ERP_BUSINESS (enterprise), HISTORIAN (time-series), DOCUMENT (docs/QMS). |
| **Capability** | What the adapter can do: read (required), write, subscribe, backfill, discover. Each adds an interface the adapter must implement. |

---

## 2. The 6-File Pattern

Every Forge adapter module has exactly this structure:

```
src/forge/adapters/my_adapter/
├── __init__.py          # Module init — exports the adapter class
├── manifest.json        # Identity, capabilities, connection params
├── adapter.py           # AdapterBase subclass with lifecycle + collect()
├── config.py            # Pydantic model for connection parameters
├── context.py           # Raw events → RecordContext mapper
└── record_builder.py    # (Raw event + RecordContext) → ContextualRecord
```

**Plus optionally:**

```
tests/adapters/test_my_adapter.py     # pytest scaffold
specs/my-adapter.facts.json           # FACTS governance spec
```

**What each file does:**

| File | Boilerplate % | What You Customize |
|------|:---:|---|
| `manifest.json` | 0% | You define everything — this is your adapter's identity card |
| `config.py` | 95% | Add field validators, cross-field validation if needed |
| `adapter.py` | 70% | Implement `collect()` with your source-specific data fetching |
| `context.py` | 50% | Add enrichment rules (shift derivation, field normalization) |
| `record_builder.py` | 80% | Customize quality assessment and tag path derivation |
| `__init__.py` | 100% | Nothing — fully generated |

---

## 3. Quick Start (CLI)

The fastest way to create a new module:

```bash
# Scaffold a basic REST adapter
forge module init acme-erp \
    --name "ACME ERP Adapter" \
    --protocol rest \
    --tier ERP_BUSINESS \
    -c read -c backfill -c discover \
    -p "api_url:REST API base URL:required" \
    -p "api_key:API authentication key:required" \
    -p "timeout_ms:Request timeout:optional:5000" \
    -f equipment_id -f batch_id -f lot_id \
    --auth api_key
```

This generates 9 files:

```
src/forge/adapters/acme_erp/
├── __init__.py
├── manifest.json
├── adapter.py
├── config.py
├── context.py
└── record_builder.py

tests/adapters/
├── conftest.py
└── test_acme_erp.py

src/forge/governance/facts/specs/
└── acme-erp.facts.json
```

**After scaffolding, you need to:**

1. Edit `adapter.py` — implement `collect()` to fetch data from your source
2. Edit `context.py` — add any domain-specific enrichment rules
3. Review `acme-erp.facts.json` — complete the governance spec
4. Run tests: `pytest tests/adapters/test_acme_erp.py -v`

---

## 4. Quick Start (Programmatic)

If you prefer Python over CLI flags:

```python
from forge.sdk.module_builder import ManifestBuilder, ModuleScaffolder

# Step 1: Build the manifest
manifest = (
    ManifestBuilder("acme-erp")
    .name("ACME ERP Adapter")
    .version("0.1.0")
    .protocol("rest")
    .tier("ERP_BUSINESS")
    .capability("read", True)
    .capability("backfill", True)
    .capability("discover", True)
    .connection_param("api_url", required=True, description="REST API base URL")
    .connection_param("api_key", required=True, secret=True, description="API key")
    .connection_param("timeout_ms", required=False, default="5000", description="Timeout")
    .context_field("equipment_id")
    .context_field("batch_id")
    .context_field("lot_id")
    .auth_method("api_key")
    .metadata("spoke", "acme-erp")
    .build()
)

# Step 2: Generate the module
scaffolder = ModuleScaffolder(manifest)
result = scaffolder.generate(
    "./src/forge/adapters/acme_erp/",
    include_tests=True,
    include_facts=True,
)

print(f"Created {len(result.files_created)} files")
print(f"Adapter class: {result.adapter_class}")
```

---

## 5. Understanding the Manifest

The manifest (`manifest.json`) is the adapter's identity card. Everything else is derived from it.

### Structure

```json
{
  "adapter_id": "acme-erp",
  "name": "ACME ERP Adapter",
  "version": "0.1.0",
  "type": "INGESTION",
  "protocol": "rest",
  "tier": "ERP_BUSINESS",
  "capabilities": {
    "read": true,
    "write": false,
    "subscribe": false,
    "backfill": true,
    "discover": true
  },
  "data_contract": {
    "schema_ref": "forge://schemas/acme-erp/v0.1.0",
    "output_format": "contextual_record",
    "context_fields": ["equipment_id", "batch_id", "lot_id"]
  },
  "health_check_interval_ms": 30000,
  "connection_params": [
    {"name": "api_url", "description": "REST API base URL", "required": true, "secret": false},
    {"name": "api_key", "description": "API key", "required": true, "secret": true},
    {"name": "timeout_ms", "description": "Timeout", "required": false, "secret": false, "default": "5000"}
  ],
  "auth_methods": ["api_key"],
  "metadata": {
    "spoke": "acme-erp"
  }
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `adapter_id` | string | Unique identifier. Convention: `<org>-<system>` (e.g. `whk-wms`, `acme-erp`). Used in file paths, FACTS specs, and hub registration. |
| `name` | string | Human-readable name displayed in dashboards. |
| `version` | string | Semantic version. Bumping this creates a new schema_ref. |
| `type` | string | Always `"INGESTION"` for data collection adapters. |
| `protocol` | string | Communication protocol(s). Compound protocols use `+` separator: `"graphql+amqp"`, `"grpc"`, `"rest"`, `"opcua"`, `"mqtt"`. |
| `tier` | string | ISA-95 tier: `OT`, `MES_MOM`, `ERP_BUSINESS`, `HISTORIAN`, `DOCUMENT`. Determines governance strictness. |
| `capabilities` | object | What the adapter can do. `read` is always required. Each enabled capability adds an abstract interface the adapter must implement. |
| `data_contract.context_fields` | array | Context fields the adapter promises to populate. Used by `validate_record()` to check conformance. |
| `connection_params` | array | Parameters needed to connect to the source system. Each becomes a field in `config.py`. Secret params are decrypted by the hub before passing to `configure()`. |
| `auth_methods` | array | How the adapter authenticates: `"none"`, `"api_key"`, `"bearer_token"`, `"azure_entra_id"`, `"certificate"`, `"username_password"`. |

### Capabilities and What They Require

| Capability | Interface | Methods You Must Implement |
|-----------|-----------|---------------------------|
| `read` (required) | `AdapterBase` | `configure()`, `start()`, `stop()`, `health()`, `collect()` |
| `subscribe` | `SubscriptionProvider` | `subscribe(tags, callback) → str`, `unsubscribe(sub_id)` |
| `write` | `WritableAdapter` | `write(tag_path, value, confirm=True) → bool` |
| `backfill` | `BackfillProvider` | `backfill(tags, start, end) → AsyncIterator`, `get_earliest_timestamp(tag) → datetime` |
| `discover` | `DiscoveryProvider` | `discover() → list[dict]` |

---

## 6. Configuration Model (config.py)

The generated `config.py` is a Pydantic `BaseModel` that maps 1:1 to the manifest's `connection_params`. It provides type safety and validation for connection parameters.

### Generated Example

```python
from pydantic import BaseModel, ConfigDict, Field

class AcmeErpConfig(BaseModel):
    """Connection parameters for the ACME ERP Adapter."""

    # Required
    api_url: str = Field(
        ...,
        description="REST API base URL",
    )
    api_key: str = Field(
        ...,
        description="API key",
    )

    # Optional
    timeout_ms: int = Field(
        default=5000,
        description="Timeout",
        ge=1_000,
        le=60_000,
    )

    model_config = ConfigDict(frozen=True)
```

### What You Might Customize

- Add `@field_validator` decorators for URL format validation
- Add cross-field validation with `@model_validator`
- Add custom `model_post_init` for computed fields

### Type Inference Rules

The generator infers Python types from parameter names:

| Name Contains | Inferred Type |
|--------------|---------------|
| `port`, `timeout`, `interval`, `ms`, `retries` | `int` |
| `use_tls`, `enabled`, `verify` | `bool` |
| (optional, no default) | `str \| None` |
| (everything else) | `str` |

---

## 7. Adapter Class (adapter.py)

The adapter class is where your domain-specific logic lives. The generated scaffold provides the full lifecycle boilerplate; you implement `collect()`.

### Generated Structure

```python
class AcmeErpAdapter(
    AdapterBase,
    BackfillProvider,     # Only if capability enabled
    DiscoveryProvider,    # Only if capability enabled
):
    manifest: AdapterManifest = _load_manifest()

    async def configure(self, params: dict) -> None:
        """Validate connection params → AcmeErpConfig."""
        self._config = AcmeErpConfig(**params)

    async def start(self) -> None:
        """Connect to the source system."""
        # TODO: Your connection logic here

    async def stop(self) -> None:
        """Disconnect gracefully."""
        # TODO: Your cleanup logic here

    async def health(self) -> AdapterHealth:
        """Report current health status."""
        # Already implemented — returns state + counters

    async def collect(self):
        """Yield ContextualRecords from the source."""
        # TODO: This is where you fetch + transform data
        for raw_event in self._pending_records:
            context = build_record_context(raw_event)
            record = build_contextual_record(
                raw_event=raw_event,
                context=context,
                adapter_id=self.adapter_id,
                adapter_version=self.manifest.version,
            )
            yield record
```

### The `collect()` Method — The Core of Your Adapter

This is the **only method most adapters need to customize**. Three common patterns:

**Pattern A: REST/GraphQL Polling**
```python
async def collect(self):
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{self._config.api_url}/events")
        for raw_event in resp.json()["data"]:
            context = build_record_context(raw_event)
            record = build_contextual_record(
                raw_event=raw_event,
                context=context,
                adapter_id=self.adapter_id,
                adapter_version=self.manifest.version,
            )
            yield record
```

**Pattern B: Message Queue Subscription**
```python
async def collect(self):
    async for message in self._rabbitmq_consumer:
        raw_event = json.loads(message.body)
        context = build_record_context(raw_event)
        record = build_contextual_record(...)
        yield record
        await message.ack()
```

**Pattern C: gRPC Stream**
```python
async def collect(self):
    async for response in self._grpc_stub.StreamEvents(request):
        raw_event = MessageToDict(response)
        context = build_record_context(raw_event)
        record = build_contextual_record(...)
        yield record
```

### Lifecycle State Machine

Every adapter follows this state machine:

```
REGISTERED → CONNECTING → HEALTHY ⟷ DEGRADED → FAILED → CONNECTING
                                                           ↓
                           STOPPED ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

| State | Meaning |
|-------|---------|
| `REGISTERED` | Manifest loaded, `configure()` called |
| `CONNECTING` | `start()` called, establishing connections |
| `HEALTHY` | Source system reachable, collecting data |
| `DEGRADED` | Partial connectivity (e.g. GraphQL up, RabbitMQ down) |
| `FAILED` | Cannot reach source system |
| `STOPPED` | `stop()` called, graceful shutdown complete |

### Testing with inject_records()

Every generated adapter includes `inject_records()` for testing without a live source system:

```python
adapter = AcmeErpAdapter()
await adapter.configure({"api_url": "http://test", "api_key": "test"})
await adapter.start()
adapter.inject_records([
    {"id": "EVT-001", "equipment_id": "EQ-100", "timestamp": "2026-01-01T00:00:00Z"},
    {"id": "EVT-002", "equipment_id": "EQ-200", "timestamp": "2026-01-01T01:00:00Z"},
])
records = [r async for r in adapter.collect()]
assert len(records) == 2
```

---

## 8. Context Mapper (context.py)

The context mapper transforms raw source data into Forge's `RecordContext`. This is where you define **what each field means** in Forge terms.

### Generated Structure

```python
def build_record_context(raw_event: dict) -> RecordContext:
    # Direct field extraction with camelCase fallback
    equipment_id = raw_event.get("equipment_id") or raw_event.get("equipmentId")
    batch_id = raw_event.get("batch_id") or raw_event.get("batchId")
    lot_id = raw_event.get("lot_id") or raw_event.get("lotId")

    extra = {}
    # ... additional FACTS-specific fields

    return RecordContext(
        equipment_id=equipment_id,
        batch_id=batch_id,
        lot_id=lot_id,
        extra=extra,
    )
```

### RecordContext Fields

| Field | Type | Description |
|-------|------|-------------|
| `equipment_id` | `str \| None` | Equipment/asset identifier |
| `area` | `str \| None` | Physical area/zone |
| `site` | `str \| None` | Plant/facility |
| `batch_id` | `str \| None` | Batch identifier |
| `lot_id` | `str \| None` | Lot/material lot ID |
| `recipe_id` | `str \| None` | Recipe/formula ID |
| `operating_mode` | `str \| None` | Operating mode (PRODUCTION, CIP, IDLE, etc.) |
| `shift` | `str \| None` | Shift identifier |
| `operator_id` | `str \| None` | Operator/user ID |
| `extra` | `dict` | Any additional context fields specific to your adapter |

### Enrichment Rules

Enrichment rules derive context that isn't directly in the raw data. Common examples from existing adapters:

**Shift derivation from timestamp:**
```python
from zoneinfo import ZoneInfo

_PLANT_TZ = ZoneInfo("America/Kentucky/Louisville")

def derive_shift(event_time: datetime) -> str:
    local = event_time.astimezone(_PLANT_TZ)
    return "day" if 6 <= local.hour < 18 else "night"
```

**Location composition from topology fields:**
```python
def compose_location(raw: dict) -> str | None:
    warehouse = raw.get("warehouse")
    if not warehouse:
        return None
    parts = [str(warehouse)]
    if building := raw.get("building"):
        parts.append(str(building))
    return "-".join(parts)
```

**Event type normalization:**
```python
_EVENT_MAP = {
    "barrel_moved": "barrel.location_update",
    "barrel_filled": "barrel.fill",
}

def normalize_event_type(raw: dict) -> str:
    raw_type = raw.get("event_type", "unknown")
    return _EVENT_MAP.get(raw_type, f"custom.{raw_type}")
```

---

## 9. Record Builder (record_builder.py)

The record builder assembles the final `ContextualRecord` from the raw event and its context. Most of this is boilerplate — you might customize quality assessment and tag path derivation.

### ContextualRecord Structure

```python
ContextualRecord(
    record_id=UUID,             # Auto-generated
    source=RecordSource(
        adapter_id="acme-erp",
        system="acme-erp",
        tag_path="acme_erp.rest.order",   # Derived from raw data
    ),
    timestamp=RecordTimestamp(
        source_time=...,        # When the event happened
        server_time=...,        # When the source server processed it
        ingestion_time=...,     # When Forge received it (auto-set to now)
    ),
    value=RecordValue(
        raw=raw_event,          # Original raw dict preserved
        data_type="object",
        quality=QualityCode.GOOD,
    ),
    context=RecordContext(...),  # From context.py
    lineage=RecordLineage(
        schema_ref="forge://schemas/acme-erp/v0.1.0",
        adapter_id="acme-erp",
        adapter_version="0.1.0",
    ),
)
```

### Quality Assessment

The generated quality assessment checks for basic data presence:

| Condition | Quality Code |
|-----------|-------------|
| Has error flag | `BAD` |
| Has ID + timestamp | `GOOD` |
| Has ID or timestamp | `UNCERTAIN` |
| Neither | `NOT_AVAILABLE` |

Customize `_assess_quality()` for domain-specific quality signals.

### Tag Path Derivation

Tag paths identify where data came from in the source system. The default pattern is `{snake_name}.{source_type}.{entity_type}`. Override `_derive_tag_path()` for more specific paths.

---

## 10. FACTS Governance Spec

Every adapter needs a FACTS spec — a JSON document that defines its governance contract. The SDK generates a scaffold; you complete it.

### What to Complete

The generated spec has `TODO` markers for:

1. **Enrichment rules** — What context is derived vs. directly mapped
2. **Validation rules** — Any domain-specific validation beyond the defaults
3. **Integrity hash** — Computed after the spec is finalized (use `forge governance validate-spec`)

### Integrity Hash

Once your spec is finalized, compute and set the integrity hash:

```python
from forge.governance.shared.runner import compute_spec_hash
import json

with open("src/forge/governance/facts/specs/acme-erp.facts.json") as f:
    spec = json.load(f)

hash_value = compute_spec_hash(spec)
spec["integrity"]["spec_hash"] = hash_value
spec["integrity"]["hash_state"] = "pending_review"

with open("src/forge/governance/facts/specs/acme-erp.facts.json", "w") as f:
    json.dump(spec, f, indent=2)
```

**Important:** The `compute_spec_hash()` function excludes the entire `integrity` block from the hash computation, avoiding circular dependencies.

---

## 11. Testing Your Module

### Generated Test Structure

The SDK generates a pytest scaffold with test classes for every interface:

| Test Class | What It Tests |
|-----------|--------------|
| `TestManifest` | Manifest loads, adapter_id correct, capabilities match |
| `TestConfig` | Config validates with test values, frozen immutability |
| `TestLifecycle` | configure → start → health → stop state transitions |
| `TestCollection` | Empty collect, injected records, counter updates |
| `TestContextBuilder` | Minimal context, field extraction |
| `TestRecordBuilder` | Full record assembly, source/lineage correctness |

### Running Tests

```bash
# Run your adapter's tests
pytest tests/adapters/test_acme_erp.py -v

# Run all adapter tests
pytest tests/adapters/ -v

# Run the full Forge test suite (includes SDK tests)
pytest -v
```

### Writing Additional Tests

Add domain-specific tests for your `collect()` implementation:

```python
class TestAcmeErpCollectLive:
    """Tests that require a mock or real source system."""

    @pytest.mark.asyncio
    async def test_collect_from_api(self, httpx_mock):
        httpx_mock.add_response(json={"data": [
            {"id": "1", "equipment_id": "EQ-1", "timestamp": "2026-01-01T00:00:00Z"},
        ]})
        adapter = AcmeErpAdapter()
        await adapter.configure({"api_url": "http://test", "api_key": "k"})
        await adapter.start()
        records = [r async for r in adapter.collect()]
        assert len(records) == 1
        assert records[0].context.equipment_id == "EQ-1"
```

---

## 12. CLI Reference

### `forge module init <adapter-id>`

Scaffold a new adapter module.

| Flag | Short | Required | Description |
|------|-------|----------|-------------|
| `--name` | | No | Human-readable name (default: derived from ID) |
| `--protocol` | | No | Protocol: rest, graphql, grpc, opcua, mqtt, or compound (default: rest) |
| `--tier` | | No | ISA-95 tier: OT, MES_MOM, ERP_BUSINESS, HISTORIAN, DOCUMENT (default: MES_MOM) |
| `--capability` | `-c` | No | Enable a capability. Repeatable. (read always enabled) |
| `--param` | `-p` | No | Connection param: `name:description:required\|optional[:default]`. Repeatable. |
| `--context-field` | `-f` | No | Context field name. Repeatable. |
| `--auth` | | No | Auth method. Repeatable. |
| `--output` | `-o` | No | Parent directory for module (default: src/forge/adapters) |
| `--no-tests` | | No | Skip test generation |
| `--no-facts` | | No | Skip FACTS spec generation |
| `--overwrite` | | No | Overwrite existing files |

### `forge module list`

List all adapter modules by scanning for `manifest.json` files.

| Flag | Required | Description |
|------|----------|-------------|
| `--dir` | No | Adapters directory (default: src/forge/adapters) |

### `forge module validate <module-dir>`

Validate module structure and manifest.

**Checks performed:**
- All 6 required files exist and are non-empty
- `manifest.json` is valid JSON with required fields
- `read` capability is enabled
- Tier is valid
- Data contract has schema_ref and context_fields
- FACTS spec exists (warning if missing)

---

## 13. API Reference

### ManifestBuilder

```python
class ManifestBuilder:
    def __init__(self, adapter_id: str) -> None: ...
    def name(self, name: str) -> ManifestBuilder: ...
    def version(self, version: str) -> ManifestBuilder: ...
    def type(self, adapter_type: str) -> ManifestBuilder: ...
    def protocol(self, protocol: str) -> ManifestBuilder: ...
    def tier(self, tier: str) -> ManifestBuilder: ...
    def capability(self, name: str, enabled: bool = True) -> ManifestBuilder: ...
    def schema_ref(self, ref: str) -> ManifestBuilder: ...
    def context_field(self, field_name: str) -> ManifestBuilder: ...
    def health_check_interval(self, ms: int) -> ManifestBuilder: ...
    def connection_param(self, name: str, *, description: str = "",
                         required: bool = True, secret: bool = False,
                         default: str | None = None) -> ManifestBuilder: ...
    def auth_method(self, method: str) -> ManifestBuilder: ...
    def metadata(self, key: str, value: Any) -> ManifestBuilder: ...
    def build(self) -> dict[str, Any]: ...
    def build_json(self, indent: int = 2) -> str: ...
    def write(self, path: Path) -> Path: ...
```

### ModuleScaffolder

```python
class ModuleScaffolder:
    def __init__(self, manifest: dict[str, Any]) -> None: ...

    @property
    def adapter_id(self) -> str: ...

    @property
    def adapter_class_name(self) -> str: ...

    def generate(self, target_dir: str | Path, *,
                 include_tests: bool = True,
                 include_facts: bool = True,
                 overwrite: bool = False) -> ScaffoldResult: ...
```

### ScaffoldResult

```python
@dataclass
class ScaffoldResult:
    adapter_id: str           # e.g. "acme-erp"
    adapter_class: str        # e.g. "AcmeErpAdapter"
    module_dir: Path          # Where the module was created
    files_created: list[Path] # All files that were written
    test_file: Path | None    # Path to test scaffold
    facts_file: Path | None   # Path to FACTS spec
```

### Code Generators (Low-Level)

If you need fine-grained control, use generators directly:

```python
from forge.sdk.module_builder.generators import (
    generate_config,         # manifest → config.py source
    generate_adapter,        # manifest → adapter.py source
    generate_context,        # manifest → context.py source
    generate_record_builder, # manifest → record_builder.py source
    generate_init,           # manifest → __init__.py source
    generate_facts_spec,     # manifest → FACTS JSON string
    generate_tests,          # manifest → test file source
)
```

---

## 14. Common Patterns

### Pattern: GraphQL + RabbitMQ Adapter (like WHK-WMS)

```bash
forge module init my-app \
    --protocol "graphql+amqp" \
    --tier MES_MOM \
    -c read -c subscribe -c backfill -c discover \
    -p "graphql_url:GraphQL endpoint:required" \
    -p "rabbitmq_url:AMQP connection URL:required" \
    -p "azure_tenant_id:Azure tenant:required" \
    -p "azure_client_id:Azure app ID:required" \
    -p "azure_client_secret:Azure secret:required" \
    -f equipment_id -f batch_id -f lot_id -f shift \
    --auth azure_entra_id
```

### Pattern: gRPC Adapter (like BOSC-IMS)

```bash
forge module init my-grpc \
    --protocol grpc \
    --tier MES_MOM \
    -c read -c subscribe -c discover \
    -p "grpc_host:gRPC server host:required" \
    -p "grpc_port:gRPC server port:required" \
    -p "use_tls:Enable TLS:optional:false" \
    -f equipment_id -f area -f operating_mode
```

### Pattern: OPC-UA Adapter (for SCADA/PLC)

```bash
forge module init my-plc \
    --protocol opcua \
    --tier OT \
    -c read -c subscribe -c discover \
    -p "endpoint_url:OPC-UA server URL:required" \
    -p "security_policy:Security policy:optional:Basic256Sha256" \
    -p "certificate_path:Client cert:optional" \
    -f equipment_id -f area -f site -f operating_mode \
    --auth certificate
```

### Pattern: Adding Entity Mappers

For adapters that transform source entities into Forge domain models, create a `mappers/` directory:

```
my_adapter/
├── ... (6 core files)
└── mappers/
    ├── __init__.py
    ├── production_order.py
    ├── batch.py
    └── equipment.py
```

Each mapper follows the pattern:

```python
# mappers/production_order.py
_SOURCE_SYSTEM = "my-app"

def map_production_order(raw: dict) -> ProductionOrder | None:
    order_id = raw.get("id") or raw.get("orderId")
    if not order_id:
        return None
    return ProductionOrder(
        source_system=_SOURCE_SYSTEM,
        source_id=str(order_id),
        status=_STATUS_MAP.get(raw.get("status"), OrderStatus.UNKNOWN),
        # ... map remaining fields
    )
```

---

## 15. Troubleshooting

### "No module named 'forge'" when running tests

Ensure the `src/` directory is on PYTHONPATH. The generated `conftest.py` handles this automatically, but if you're running tests from an unusual directory:

```bash
PYTHONPATH=src pytest tests/adapters/ -v
```

### "AdapterState.UNKNOWN doesn't exist"

Use `AdapterState.REGISTERED` as the fallback. The valid states are: `REGISTERED`, `CONNECTING`, `HEALTHY`, `DEGRADED`, `FAILED`, `STOPPED`.

### Generated code references wrong import path

The generators assume adapters live at `forge.adapters.<snake_name>`. If your project uses a different package structure, use the low-level generators and customize the import paths.

### FACTS integrity hash is invalid after editing spec

The hash must be recomputed after any change to the spec content (excluding the `integrity` block). See [Section 10](#10-facts-governance-spec) for the procedure.

### "Adapter not configured — call configure() first"

The lifecycle is strict: `configure()` → `start()` → `collect()`. You cannot call `start()` without `configure()`, and `collect()` returns nothing useful before `start()`.

---

## File Map

```
src/forge/sdk/
├── __init__.py
└── module_builder/
    ├── __init__.py              # Public API (ManifestBuilder, ModuleScaffolder)
    ├── manifest_builder.py      # Fluent builder for manifest.json
    ├── generators.py            # Code generators (config, adapter, context, etc.)
    ├── scaffolder.py            # Orchestrator that writes all files
    └── cli.py                   # Typer CLI commands (forge module init/list/validate)

tests/sdk/
├── conftest.py
├── test_manifest_builder.py     # 28 tests
├── test_generators.py           # 38 tests
└── test_scaffolder.py           # 17 tests
```

Total SDK test coverage: **83 tests**, all passing.
