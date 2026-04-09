"""NMS REST endpoint and WebSocket definitions.

All 13 REST endpoints + 1 WebSocket subscription as documented in the
NMS API reference. REST endpoints follow the /api/v1/* path pattern.

The adapter polls all REST endpoints and subscribes to the events/stream
WebSocket for real-time trap and alert events.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NmsRestEndpoint:
    """An NMS REST endpoint available for polling."""

    entity_name: str
    path: str  # e.g., /api/v1/devices
    method: str  # GET, POST, etc.
    is_paginated: bool
    forge_entity_type: str  # ManufacturingUnit, OperationalEvent, etc.
    collection_mode: str  # "poll" or "subscribe"
    description: str

    @property
    def full_path(self) -> str:
        """Return full path (without base URL)."""
        return self.path


@dataclass(frozen=True)
class NmsWebSocketEndpoint:
    """An NMS WebSocket subscription endpoint."""

    entity_name: str
    path: str  # e.g., /api/v1/events/stream
    forge_entity_type: str
    description: str


# ── 13 REST Endpoints (Polling) ────────────────────────────────

NMS_REST_ENDPOINTS: list[NmsRestEndpoint] = [
    # Device inventory
    NmsRestEndpoint(
        entity_name="Device",
        path="/api/v1/devices",
        method="GET",
        is_paginated=True,
        forge_entity_type="ManufacturingUnit",
        collection_mode="poll",
        description="List discovered network devices (717+)",
    ),
    NmsRestEndpoint(
        entity_name="DeviceDetail",
        path="/api/v1/devices/{id}",
        method="GET",
        is_paginated=False,
        forge_entity_type="ManufacturingUnit",
        collection_mode="poll",
        description="Get detailed device info by ID",
    ),
    NmsRestEndpoint(
        entity_name="DeviceStats",
        path="/api/v1/devices/stats/summary",
        method="GET",
        is_paginated=False,
        forge_entity_type="OperationalEvent",
        collection_mode="poll",
        description="Device statistics summary",
    ),
    # Topology
    NmsRestEndpoint(
        entity_name="Interface",
        path="/api/v1/interfaces/{device_id}",
        method="GET",
        is_paginated=False,
        forge_entity_type="ManufacturingUnit",
        collection_mode="poll",
        description="List interfaces for a device",
    ),
    NmsRestEndpoint(
        entity_name="Link",
        path="/api/v1/lldp/links",
        method="GET",
        is_paginated=True,
        forge_entity_type="OperationalEvent",
        collection_mode="poll",
        description="Physical links from LLDP discovery",
    ),
    NmsRestEndpoint(
        entity_name="Topology",
        path="/api/v1/topology/graph",
        method="GET",
        is_paginated=False,
        forge_entity_type="OperationalEvent",
        collection_mode="poll",
        description="Subnet-based topology graph",
    ),
    # SNMP events
    NmsRestEndpoint(
        entity_name="Trap",
        path="/api/v1/snmp/traps",
        method="GET",
        is_paginated=True,
        forge_entity_type="OperationalEvent",
        collection_mode="poll",
        description="SNMP trap events (also via WebSocket)",
    ),
    NmsRestEndpoint(
        entity_name="Alert",
        path="/api/v1/alerts/rules",
        method="GET",
        is_paginated=True,
        forge_entity_type="OperationalEvent",
        collection_mode="poll",
        description="Infrastructure alert rules and events",
    ),
    # Security
    NmsRestEndpoint(
        entity_name="SecurityEvent",
        path="/api/v1/security/events",
        method="GET",
        is_paginated=True,
        forge_entity_type="OperationalEvent",
        collection_mode="poll",
        description="FortiAnalyzer security events",
    ),
    # SPOF detection
    NmsRestEndpoint(
        entity_name="SpofActive",
        path="/api/v1/spof/active",
        method="GET",
        is_paginated=False,
        forge_entity_type="OperationalEvent",
        collection_mode="poll",
        description="Active single points of failure",
    ),
    NmsRestEndpoint(
        entity_name="SpofSummary",
        path="/api/v1/spof/summary",
        method="GET",
        is_paginated=False,
        forge_entity_type="OperationalEvent",
        collection_mode="poll",
        description="SPOF summary statistics",
    ),
    # Baseline anomalies
    NmsRestEndpoint(
        entity_name="BaselineDevice",
        path="/api/v1/baseline/devices",
        method="GET",
        is_paginated=True,
        forge_entity_type="OperationalEvent",
        collection_mode="poll",
        description="Devices with baseline anomalies (suspicious/blocked)",
    ),
    # SNMP configuration
    NmsRestEndpoint(
        entity_name="SnmpConfig",
        path="/api/v1/snmp/config/{device_id}",
        method="GET",
        is_paginated=False,
        forge_entity_type="OperationalEvent",
        collection_mode="poll",
        description="SNMP configuration for a device",
    ),
]

# ── 1 WebSocket Endpoint (Subscription) ────────────────────────

NMS_WEBSOCKET_ENDPOINTS: list[NmsWebSocketEndpoint] = [
    NmsWebSocketEndpoint(
        entity_name="EventStream",
        path="/api/v1/events/stream",
        forge_entity_type="OperationalEvent",
        description="Real-time trap events, poll results, and alerts",
    ),
]

# ── Lookup Helpers ────────────────────────────────────────────

_ENDPOINT_BY_NAME: dict[str, NmsRestEndpoint] = {
    e.entity_name: e for e in NMS_REST_ENDPOINTS
}


def rest_endpoint_for_name(entity_name: str) -> NmsRestEndpoint | None:
    """Look up an NmsRestEndpoint by its entity name."""
    return _ENDPOINT_BY_NAME.get(entity_name)
