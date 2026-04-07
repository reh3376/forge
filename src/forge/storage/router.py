"""Data Router — routes ContextualRecords to the appropriate storage engine.

The router examines each record's entity type and context to determine
which storage engine should receive it. Routing rules are driven by the
Schema Registry — if an entity is registered with a target engine, the
router sends it there. Unregistered entities default to PostgreSQL.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from forge.core.models.contextual_record import ContextualRecord
from forge.storage.registry import SchemaRegistry, StorageEngine

logger = logging.getLogger(__name__)


@dataclass
class RoutingDecision:
    """A routing decision for a single ContextualRecord."""

    record_id: str
    target_engine: StorageEngine
    target_namespace: str
    entity_name: str
    decided_at: datetime = field(
        default_factory=lambda: datetime.now(tz=timezone.utc)
    )
    reason: str = ""


# Default routing rules when no schema entry exists
_DEFAULT_ROUTES: dict[str, StorageEngine] = {
    # Time-series data types → TimescaleDB
    "snmp_metric": StorageEngine.TIMESCALEDB,
    "opc_ua_tag": StorageEngine.TIMESCALEDB,
    "historian_point": StorageEngine.TIMESCALEDB,
    "sensor_reading": StorageEngine.TIMESCALEDB,
    # Graph data types → Neo4j
    "device_topology": StorageEngine.NEO4J,
    "equipment_hierarchy": StorageEngine.NEO4J,
    "material_genealogy": StorageEngine.NEO4J,
    # Event streams → Kafka
    "cdc_event": StorageEngine.KAFKA,
    "adapter_event": StorageEngine.KAFKA,
    # Everything else → PostgreSQL
}


@dataclass
class DataRouter:
    """Routes ContextualRecords to storage engines based on registry rules.

    Usage::

        router = DataRouter(registry=schema_registry)
        decision = router.route(record)
        # decision.target_engine tells you where to write
    """

    registry: SchemaRegistry

    def route(self, record: ContextualRecord) -> RoutingDecision:
        """Determine the target storage engine for a ContextualRecord.

        Resolution order:
        1. Schema Registry lookup (entity_name + spoke_id)
        2. Data type default routes (time-series, graph, etc.)
        3. Fall back to PostgreSQL
        """
        entity_name = self._extract_entity_name(record)
        spoke_id = record.source.system if record.source else "unknown"

        record_id_str = str(record.record_id)

        # 1. Check Schema Registry
        entries = self.registry.list_by_spoke(spoke_id)
        for entry in entries:
            if entry.entity_name == entity_name:
                return RoutingDecision(
                    record_id=record_id_str,
                    target_engine=entry.storage_engine,
                    target_namespace=entry.storage_namespace,
                    entity_name=entity_name,
                    reason=f"registry:{entry.schema_id}",
                )

        # 2. Check data type defaults
        data_type = record.value.data_type if record.value else "unknown"
        if data_type in _DEFAULT_ROUTES:
            return RoutingDecision(
                record_id=record_id_str,
                target_engine=_DEFAULT_ROUTES[data_type],
                target_namespace=f"spoke_{spoke_id}",
                entity_name=entity_name,
                reason=f"default_route:{data_type}",
            )

        # 3. Fallback to PostgreSQL
        return RoutingDecision(
            record_id=record_id_str,
            target_engine=StorageEngine.POSTGRESQL,
            target_namespace=f"spoke_{spoke_id}",
            entity_name=entity_name,
            reason="fallback:postgresql",
        )

    def _extract_entity_name(self, record: ContextualRecord) -> str:
        """Extract entity name from a ContextualRecord's context or tag path."""
        # Try context.extra first
        if record.context and record.context.extra:
            entity = record.context.extra.get("entity_type")
            if entity:
                return str(entity)

        # Fall back to tag_path parsing (e.g., "wms.barrel.create.cuid123")
        if record.source and record.source.tag_path:
            parts = record.source.tag_path.split(".")
            if len(parts) >= 2:
                return parts[1]

        return "unknown"

    def route_batch(
        self, records: list[ContextualRecord]
    ) -> dict[StorageEngine, list[tuple[ContextualRecord, RoutingDecision]]]:
        """Route a batch of records, grouping by target engine.

        Returns a dict keyed by StorageEngine, with values being lists
        of (record, decision) tuples. Callers use this to batch writes
        per engine for efficiency.
        """
        grouped: dict[StorageEngine, list[tuple[ContextualRecord, RoutingDecision]]] = {}
        for record in records:
            decision = self.route(record)
            grouped.setdefault(decision.target_engine, []).append(
                (record, decision)
            )
        return grouped
