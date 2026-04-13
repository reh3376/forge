"""Neo4j storage engine — graph writer for topology and lineage.

Provides:
    - Neo4jGraphWriter: MERGE nodes and relationships for equipment
      topology, device hierarchies, and material genealogy.
    - Neo4jLineageWriter: Write lineage graphs linking source records
      to curated outputs via transformation chains.

Both classes use the neo4j async driver from PoolManager.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from forge.core.models.contextual_record import ContextualRecord  # noqa: TC001
from forge.curation.lineage import LineageEntry  # noqa: TC001

logger = logging.getLogger(__name__)


class Neo4jGraphWriter:
    """Writes equipment topology and record relationships to Neo4j.

    Uses MERGE for idempotent writes — running the same record twice
    produces the same graph, not duplicate nodes.
    """

    def __init__(self, driver: Any) -> None:
        self._driver = driver

    def _driver_ok(self) -> bool:
        return self._driver is not None

    async def write_record(self, record: ContextualRecord) -> bool:
        """Write a ContextualRecord as graph nodes + relationships.

        Creates:
            (:Record {record_id, adapter_id, system, data_type, quality})
            (:Equipment {equipment_id, area, site})
            (:Adapter {adapter_id, system})
            (Record)-[:OBSERVED_AT]->(Equipment)
            (Adapter)-[:PRODUCED]->(Record)
        """
        if not self._driver_ok():
            return False

        try:
            async with self._driver.session() as session:
                await session.execute_write(
                    self._merge_record_tx, record,
                )
            return True
        except Exception:
            logger.exception("Failed to write record %s to Neo4j", record.record_id)
            return False

    @staticmethod
    async def _merge_record_tx(tx: Any, record: ContextualRecord) -> None:
        """Transaction function for merging a record into the graph."""
        record_id = str(record.record_id)
        adapter_id = record.source.adapter_id
        system = record.source.system
        equipment_id = record.context.equipment_id if record.context else None
        area = record.context.area if record.context else None
        site = record.context.site if record.context else None
        batch_id = record.context.batch_id if record.context else None

        # Merge Record node
        await tx.run(
            """
            MERGE (r:Record {record_id: $record_id})
            SET r.adapter_id = $adapter_id,
                r.system = $system,
                r.data_type = $data_type,
                r.quality = $quality,
                r.tag_path = $tag_path,
                r.timestamp = $timestamp
            """,
            record_id=record_id,
            adapter_id=adapter_id,
            system=system,
            data_type=record.value.data_type if record.value else "unknown",
            quality=record.value.quality.value if record.value else "UNKNOWN",
            tag_path=record.source.tag_path,
            timestamp=record.timestamp.source_time.isoformat(),
        )

        # Merge Adapter node and relationship
        await tx.run(
            """
            MERGE (a:Adapter {adapter_id: $adapter_id})
            SET a.system = $system
            WITH a
            MATCH (r:Record {record_id: $record_id})
            MERGE (a)-[:PRODUCED]->(r)
            """,
            adapter_id=adapter_id,
            system=system,
            record_id=record_id,
        )

        # Merge Equipment node and relationship (if equipment context exists)
        if equipment_id:
            await tx.run(
                """
                MERGE (e:Equipment {equipment_id: $equipment_id})
                SET e.area = $area, e.site = $site
                WITH e
                MATCH (r:Record {record_id: $record_id})
                MERGE (r)-[:OBSERVED_AT]->(e)
                """,
                equipment_id=equipment_id,
                area=area,
                site=site,
                record_id=record_id,
            )

        # Link to Batch if present
        if batch_id:
            await tx.run(
                """
                MERGE (b:Batch {batch_id: $batch_id})
                WITH b
                MATCH (r:Record {record_id: $record_id})
                MERGE (r)-[:BELONGS_TO]->(b)
                """,
                batch_id=batch_id,
                record_id=record_id,
            )

    async def write_batch(self, records: list[ContextualRecord]) -> int:
        """Write a batch of records. Returns count of successful writes."""
        if not self._driver_ok():
            return 0

        written = 0
        for record in records:
            if await self.write_record(record):
                written += 1
        return written

    async def query_equipment_topology(
        self, equipment_id: str, *, depth: int = 2,
    ) -> list[dict[str, Any]]:
        """Query the neighborhood of an equipment node."""
        if not self._driver_ok():
            return []

        try:
            async with self._driver.session() as session:
                result = await session.run(
                    """
                    MATCH path = (e:Equipment {equipment_id: $equipment_id})-[*1..$depth]-(n)
                    RETURN e, relationships(path) AS rels, collect(n) AS neighbors
                    LIMIT 100
                    """,
                    equipment_id=equipment_id,
                    depth=depth,
                )
                records = [dict(r) async for r in result]
                return records
        except Exception:
            logger.exception("Neo4j topology query failed for %s", equipment_id)
            return []


class Neo4jLineageWriter:
    """Writes lineage entries as graph relationships in Neo4j.

    Creates:
        (:SourceRecord)-[:TRANSFORMED_BY {step_name, component}]->(:CuratedOutput)
        (:CuratedOutput)-[:PART_OF]->(:DataProduct)
    """

    def __init__(self, driver: Any) -> None:
        self._driver = driver

    def _driver_ok(self) -> bool:
        return self._driver is not None

    async def write_lineage(self, entry: LineageEntry) -> bool:
        """Write a lineage entry as a subgraph."""
        if not self._driver_ok():
            return False

        try:
            async with self._driver.session() as session:
                await session.execute_write(self._merge_lineage_tx, entry)
            return True
        except Exception:
            logger.exception("Failed to write lineage %s to Neo4j", entry.lineage_id)
            return False

    @staticmethod
    async def _merge_lineage_tx(tx: Any, entry: LineageEntry) -> None:
        """Transaction function for merging lineage into the graph."""
        # Create curated output node
        await tx.run(
            """
            MERGE (o:CuratedOutput {record_id: $output_id})
            SET o.lineage_id = $lineage_id,
                o.product_id = $product_id,
                o.created_at = $created_at
            """,
            output_id=entry.output_record_id,
            lineage_id=entry.lineage_id,
            product_id=entry.product_id,
            created_at=entry.created_at.isoformat(),
        )

        # Link to DataProduct
        if entry.product_id:
            await tx.run(
                """
                MERGE (p:DataProduct {product_id: $product_id})
                WITH p
                MATCH (o:CuratedOutput {record_id: $output_id})
                MERGE (o)-[:PART_OF]->(p)
                """,
                product_id=entry.product_id,
                output_id=entry.output_record_id,
            )

        # Link source records
        for src_id in entry.source_record_ids:
            steps_json = json.dumps([
                {"step_name": s.step_name, "component": s.component}
                for s in entry.steps
            ])
            await tx.run(
                """
                MERGE (s:SourceRecord {record_id: $source_id})
                WITH s
                MATCH (o:CuratedOutput {record_id: $output_id})
                MERGE (s)-[:TRANSFORMED_INTO {
                    lineage_id: $lineage_id,
                    steps: $steps
                }]->(o)
                """,
                source_id=src_id,
                output_id=entry.output_record_id,
                lineage_id=entry.lineage_id,
                steps=steps_json,
            )

    async def write_batch(self, entries: list[LineageEntry]) -> int:
        """Write a batch of lineage entries. Returns successful count."""
        if not self._driver_ok():
            return 0

        written = 0
        for entry in entries:
            if await self.write_lineage(entry):
                written += 1
        return written
