# WHK NMS (Network Topology Suite) — Forge Spoke Discovery

## System Identity

| Field | Value |
|-------|-------|
| **Repo** | `WhiskeyHouse/net-topology` |
| **Type** | Enterprise Network Management System (NMS) |
| **Stack** | Python 3.12+, FastAPI, PostgreSQL 16, Neo4j 5, Redis |
| **APIs** | REST (`/api/v1/*`) — 75+ endpoints |
| **Auth** | JWT (session-based, `/api/auth/*`) |
| **Real-time** | WebSocket (`/api/v1/events/stream`), SNMP trap receiver (UDP 162) |
| **Task Scheduler** | Celery + Redis (tier-based SNMP polling) |
| **Devices** | 717 discovered, 138 LLDP-mapped, 411 physical links |

## Architecture: Python-Native REST API

NMS is the **first Python-native spoke** in the Forge ecosystem. Unlike the NestJS-based WMS/MES/ERPI/CMMS systems, NMS uses FastAPI + asyncio with a repository pattern over PostgreSQL. There is no RabbitMQ integration — all data is accessed via REST API and direct database queries.

### Data Source Strategy for Forge

| Source | Priority | Mode | What It Provides |
|--------|----------|------|------------------|
| **REST API** | Primary | Poll | Device inventory, interfaces, links, topology, alerts, SPOF analysis |
| **WebSocket** | Secondary | Subscribe | Real-time SNMP trap events, poll results, alert notifications |
| **Neo4j Graph** | Tertiary | Query | Topology relationships, blast radius analysis, device categories |
| **SNMP Metrics** | Quaternary | Poll | TimescaleDB time-series data (device health, interface utilization) |

## Core Domain Model (30+ PostgreSQL tables)

### Network Devices & Inventory

| Entity | Key Fields | Forge Relevance |
|--------|-----------|-----------------|
| **discovered_hosts** | ip (unique), mac, hostname, vendor, status, device_name, canonical_uri, device_type_code | **HIGH** — Every managed network device. OT devices directly impact production. |
| **device_metadata** | device_type_id, device_role_id, location, building, floor, rack, vendor, model, serial_number, os_name, is_managed, is_critical, tags[] | **HIGH** — Classification and criticality for risk assessment. |
| **device_baseline** | mac (unique), status (approved/suspicious/blocked), device_type, vendor | **HIGH** — Unauthorized device detection on OT networks. |
| **interfaces** | device_id, canonical_interface_uri, interface_type (phy/lag/svi/...), speed, admin_state, oper_state, vlan_tag | **MEDIUM** — Interface health affects connectivity. |
| **links** | endpoint_a, endpoint_b, media, discovered_via (LLDP/ARP/MAC/manual) | **MEDIUM** — Physical topology for blast radius calculation. |

### Monitoring & Events

| Entity | Key Fields | Forge Relevance |
|--------|-----------|-----------------|
| **snmp_device_config** | device_id, version, poll_tier (critical/high/standard/low), health_status, consecutive_failures, last_poll_at | **HIGH** — Device health directly correlates with production risk. |
| **trap_events** | device_id, source_ip, trap_oid, trap_name, severity, category, var_binds (JSONB), acknowledged | **HIGH** — Real-time fault notifications from OT/IT infrastructure. |
| **alerts** | rule_id, device_id, alert_severity, message, is_resolved, fingerprint | **HIGH** — Aggregated alert state for risk dashboards. |
| **security_events** | source_ip, dst_ip, event_type, severity, action, device_name | **HIGH** — FortiAnalyzer threat intelligence for compliance. |

### Topology & Infrastructure

| Entity | Key Fields | Forge Relevance |
|--------|-----------|-----------------|
| **networks** | cidr, name, vlan_id, site_id, network_role | **MEDIUM** — Network segmentation (IT vs OT) is compliance-relevant. |
| **sites** | name, location | **LOW** — Static reference data. |
| **lldp_neighbors** | local_device_ip, remote_system_name, remote_ip | **MEDIUM** — Physical adjacency for impact analysis. |
| **cables** | endpoint_a, endpoint_b, media, cable_type, length | **LOW** — Physical infrastructure documentation. |

### SPOF & Risk Analysis

| Entity | Key Fields | Forge Relevance |
|--------|-----------|-----------------|
| **SPOF analysis** (computed, not stored) | device_id, blast_radius, risk_level | **CRITICAL** — Single points of failure in OT network directly threaten production continuity. |

### Neo4j Graph Schema

| Node Label | Properties | Relationships |
|-----------|-----------|---------------|
| **Device** | ip (unique), hostname, device_type, device_name | CONNECTS_TO (bidirectional), IN_SUBNET, BELONGS_TO_CATEGORY |
| **Subnet** | cidr, name | — |
| **DeviceCategory** | name (6-tier: net_core, net_edge, ot_control, it_core, storage, it_edge) | — |

## API Endpoint Groups (75+ total)

### Device Management (primary data source)
- `GET /api/v1/devices` — Paginated device list with metadata
- `GET /api/v1/devices/{id}` — Device detail with full metadata
- `GET /api/v1/devices/stats/summary` — Device statistics
- `POST /api/v1/devices/reachability/check` — Reachability test

### Topology & Discovery
- `GET /api/v1/topology/graph` — Subnet-based topology graph
- `GET /api/v1/lldp/topology` — LLDP physical topology
- `GET /api/v1/lldp/links` — All physical links
- `GET /api/v1/interfaces/{device_id}` — Device interfaces

### SNMP Monitoring
- `GET /api/v1/snmp/config/{device_id}` — SNMP configuration
- `GET /api/v1/snmp/traps` — Trap events (filterable)
- `GET /api/v1/snmp/traps/{id}` — Trap detail

### Alerts & Security
- `GET /api/v1/alerts/rules` — Alert rule definitions
- `GET /api/v1/security/events` — FortiAnalyzer security events
- `GET /api/v1/security/threats/top` — Top threat indicators

### SPOF Analysis
- `GET /api/v1/spof/active` — Active single points of failure
- `GET /api/v1/spof/summary` — SPOF summary statistics
- `GET /api/v1/spof/blast-radius/{device_id}` — Impact radius for a device

### Device Baseline
- `GET /api/v1/baseline/devices` — Baseline inventory (approved/suspicious/blocked)
- `GET /api/v1/baseline/by-device/{id}` — Baseline status for a device

### Real-Time
- `WebSocket /api/v1/events/stream` — SNMP traps, poll results, alerts in real-time

## Cross-Module Data Flows

### NMS → Other Modules

| Target | Data | Value |
|--------|------|-------|
| **OT Module** (future) | OT device health, interface status, SNMP traps from PLCs/HMIs | PLC/HMI connectivity directly affects production capability |
| **MES** | Network health affecting production systems | Production scheduling should account for infrastructure maintenance windows |
| **CMMS** | OT switch/PLC fault events → work order triggers | SNMP traps from OT devices can trigger preventive maintenance |
| **IMS/QMS** | Security events, unauthorized device detection | ISO 27001 compliance evidence, risk register data |

### Other Modules → NMS

| Source | Data | Value |
|--------|------|-------|
| **CMMS** | Planned maintenance windows for network equipment | Suppress false alerts during maintenance |
| **OT Module** | Equipment registry for ISA-95 hierarchy mapping | Correlate network devices to production equipment |

## Forge Domain Mapping

`★ Insight ─────────────────────────────────────`
NMS entities don't map cleanly to ISA-95 manufacturing models. A network switch is not a "manufacturing unit" in the traditional sense. However, OT network devices (PLCs, HMIs, OT switches) ARE part of the ISA-95 equipment hierarchy — they're the communication infrastructure that connects production equipment. The Forge adapter should model NMS devices as **infrastructure assets** that support manufacturing units, not as manufacturing units themselves.
`─────────────────────────────────────────────────`

| NMS Entity | Forge Canonical Model | Mapping Notes |
|-----------|----------------------|---------------|
| discovered_hosts + device_metadata | **ManufacturingUnit** | unit_type="network_device", subtype from device_type_code. OT devices get ot_control category. is_critical flag maps to criticality. |
| interfaces | (embedded in ManufacturingUnit metadata) | Interface health is a property of the device, not a separate manufacturing entity. |
| trap_events | **OperationalEvent** | event_type="snmp_trap", severity from trap severity, entity_type="network_device" |
| alerts | **OperationalEvent** | event_type="infrastructure_alert", severity mapped, fingerprint for dedup |
| security_events | **OperationalEvent** | event_type="security_event", source from FortiAnalyzer |
| SPOF analysis | **OperationalEvent** | event_type="spof_detection", blast_radius in metadata |
| device_baseline (suspicious/blocked) | **OperationalEvent** | event_type="baseline_anomaly", unauthorized device detection |
| networks | (context field) | network_role, vlan_id, site as context on device records |
| links | (context field) | Topology context: connected_devices, link_media |
| snmp_device_config | (embedded in ManufacturingUnit metadata) | poll_tier, health_status, consecutive_failures as device health context |

## Context Fields

### Required
- `cross_system_id` — Device IP or UUID
- `source_system` — "whk-nms"
- `entity_type` — "Device", "TrapEvent", "Alert", "SecurityEvent", "BaselineAnomaly"
- `event_type` — "device_status", "snmp_trap", "infrastructure_alert", "security_event", "baseline_anomaly", "spof_detection"
- `operation_context` — "network_monitoring"

### NMS-Specific Optional
- `device_ip` — IPv4/IPv6 address
- `device_type` — Core switch, PLC, HMI, etc.
- `device_role` — CORE, DIST, ACCESS, OT-SW, etc.
- `device_category` — net_core, net_edge, ot_control, it_core, storage, it_edge
- `is_critical` — Boolean criticality flag
- `is_ot_device` — Whether device is on OT network
- `location` — Building/floor/rack
- `severity` — Trap/alert severity (info/warning/error/critical)
- `health_status` — SNMP health (healthy/degraded/unhealthy/disabled)
- `poll_tier` — critical/high/standard/low
- `network_role` — Network segment role
- `blast_radius` — SPOF impact count
- `baseline_status` — approved/suspicious/blocked

## Key Observations

1. **No RabbitMQ**: Unlike all other WHK spokes, NMS has no message broker. Data flows through REST API and WebSocket only.
2. **Python-native**: First spoke sharing Forge's own language. Potential for tighter integration (shared models, direct imports) in later phases.
3. **Three-database architecture**: PostgreSQL (primary), Neo4j (graph topology), Redis (cache + Celery broker). The adapter should primarily poll PostgreSQL via REST API.
4. **OT/IT convergence**: The 6-tier device category system (net_core, net_edge, ot_control, it_core, storage, it_edge) maps directly to ISA-95 zones. OT devices are the highest-value data for Forge.
5. **Real-time events**: SNMP traps arrive asynchronously via UDP. The WebSocket endpoint aggregates traps, poll results, and alerts into a single event stream — ideal for Forge subscription.
6. **SPOF analysis is computed, not stored**: The adapter should call the SPOF API endpoint and treat results as point-in-time OperationalEvents.
7. **717 devices, 411 links**: This is production data, not test data. The adapter must handle pagination efficiently.
