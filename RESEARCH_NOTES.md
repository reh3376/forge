# Forge Platform — Research Notes

**Date:** 2026-04-05
**Purpose:** Preserve research findings for context recovery

---

## MDEMG Patterns to Adapt

### 1. UxTS Governance Framework → FxTS
- **4-layer pattern:** JSON Schema → Declarative Specs → Python Runner → CI Gate
- **14 frameworks** in MDEMG covering APIs, parsers, benchmarks, security, auth, observability, emergence, comprehension, training data
- **Key principles:** Declarative over imperative, schema-first, parity mandatory (every schema field enforced or fail-fast detected), shared runner infrastructure, canonical report format
- **CI gating strategy:** Hard-fail for contracts (merge-blocking), soft-fail for quality (CI report only)
- **Hash integrity:** SHA256 verification on spec and fixture files
- **Runner commands:** validate, validate-all, add-hashes, verify-hashes
- **Anti-pattern learned:** The "0/0 problem" — specs with zero assertions must FAIL, not pass

### 2. Plugin System → Adapter Framework
- **gRPC sidecar pattern:** Each adapter is a separate binary communicating via Unix domain socket
- **Manifest-driven:** manifest.json defines capabilities, health check interval, module type
- **Module types:** INGESTION, REASONING, APE, CRUD → adapt to: INGESTION, TRANSFORMATION, SERVING, MONITORING
- **Lifecycle:** Starting → Ready → Unhealthy → Crashed → Stopped, auto-restart with exponential backoff
- **Confidence-based selection:** MatchIngestionModule(sourceURI, contentType) returns best adapter
- **Event dispatcher:** Routes events to subscribed modules

### 3. Dynamic Pipeline Registry → Data Pipeline Registry
- **Self-registering steps:** Each step implements NodeCreator interface (Name, Phase, Required, Run)
- **Phase ordering:** Steps auto-sorted by Phase() value
- **Split execution:** Pre-processing phases, then clustering/transformation, then post-processing
- **Adding new steps:** Create step file, implement interface, register — no other files modified
- **Phase convention:** 10=core (required), 20=enrichment (optional), 25=dynamic, 30=post-processing

### 4. Retrieval Pipeline → Query/Serving Pipeline
- **6-stage architecture:** Recall → Filter/Expand → Activate → Score → Reason → Re-rank
- **Pluggable providers:** ReasoningProvider, IntentTranslator, QueryClassifier — all interfaces
- **Circuit breaker:** Fault tolerance on all external calls
- **Caching:** LRU + TTL at query level and embedding level
- **Graceful degradation:** Every optional stage fails open

### 5. Docker Compose → Service Composition
- **5 services:** Main app + Neo4j + TimescaleDB + Neural sidecar + Grafana
- **Dynamic port allocation:** `init` command scans for free ports, generates .env
- **Health checks:** Every service has a health endpoint, dependencies use service_healthy condition
- **Multi-instance:** COMPOSE_PROJECT_NAME provides isolation
- **Volume strategy:** Named volumes for persistent data, bind mounts for config

---

## BBD Papers — Key Arguments to Operationalize

### From Part 1 (Information Architecture)
1. Base rate neglect → System must preserve and surface base rates alongside alerts
2. Simpson's Paradox → System must support normalization and segmentation before comparison
3. Spurious correlation → System must link multi-departmental context to identify hidden variables
4. Amdahl's Law → Local optimization is bounded; foundation-wide improvement required
5. Hidden costs → Fragmented data costs ~$2M/yr in a typical manufacturing enterprise

### From Part 2 (Human Judgment)
1. Confirmation bias → Workflows must require disconfirming evidence before action hardens
2. Framing effects → System must surface multiple departmental views of the same data
3. Hidden assumptions → Decision workflows must force assumptions into the open
4. Confidence ≠ evidence → System must distinguish confidence from evidence in all displays
5. Premature consensus → Structured challenge must be procedural, not optional
6. 13-point minimum decision frame → Operationalize as a decision support workflow

### From WHK Digital Strategy
1. 9 non-negotiable principles (decision quality first, data ownership, integration first, build→compose→buy, edge-driven/hub-governed, context before conclusion, human judgment, security by design, continuous improvement)
2. Target architecture: converged IT/OT, pub/sub, DataHub, REST+GraphQL+gRPC, SSO/RBAC/ABAC, OpenTelemetry
3. Decision-quality requirements: context preservation, traceability, normalization, assumption visibility, evidence of effectiveness, structured review
4. Minimum technical requirements for any new system
5. Decision guardrails for procurement/pilots

---

## Technology Decisions

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Core services | Python 3.12+ | User preference for backend, UV/Ruff ecosystem |
| User-facing modules | TS/JS (NestJS + NextJS) | Polished UI/UX for general users, SSR, React ecosystem |
| API framework (core) | FastAPI | Async, OpenAPI native, Pydantic validation |
| API framework (BFF) | NestJS | TypeScript, decorator-driven, GraphQL support, modular |
| Frontend framework | NextJS | React SSR, App Router, polished UI/UX |
| CLI | Typer | Modern, type-hint driven, Click-compatible |
| Message broker | Kafka | Industry standard for manufacturing, high throughput, exactly-once |
| Time-series DB | TimescaleDB | Proven in MDEMG, PostgreSQL compatible, compression |
| Relational DB | PostgreSQL | Universal, mature, JSONB support |
| Graph DB | Neo4j | Proven in MDEMG, Cypher query language, vector indexes |
| Object store | MinIO | S3-compatible, self-hosted, no vendor lock-in |
| Cache | Redis | Standard, pub/sub capability, Lua scripting |
| Observability | OpenTelemetry + Grafana | Vendor-neutral, comprehensive, proven |
| Container | Docker Compose (dev) / K8s (prod) | Standard deployment patterns |
| Package management | UV | User preference, fast, PEP 723 |
| Linting | Ruff | User preference, fast, comprehensive |
| Governance specs | JSON | Consistent with UxTS pattern, tooling ecosystem |

---

*These notes support context recovery. Read PLAN.md first for the execution roadmap.*
