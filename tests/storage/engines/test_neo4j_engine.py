"""Tests for Neo4j storage engine (using mock driver)."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.curation.lineage import LineageEntry, TransformationStep
from forge.storage.engines.neo4j_engine import Neo4jGraphWriter, Neo4jLineageWriter


@pytest.fixture
def mock_driver():
    """Create a mock Neo4j async driver."""
    driver = MagicMock()
    session = AsyncMock()
    driver.session.return_value.__aenter__ = AsyncMock(return_value=session)
    driver.session.return_value.__aexit__ = AsyncMock(return_value=False)
    return driver, session


@pytest.fixture
def sample_record() -> ContextualRecord:
    return ContextualRecord(
        record_id=uuid4(),
        source=RecordSource(
            adapter_id="opcua-generic",
            system="ignition-prod",
            tag_path="Area1/Fermenter3/Temperature",
        ),
        timestamp=RecordTimestamp(
            source_time=datetime(2026, 4, 12, 14, 30, 0, tzinfo=UTC),
        ),
        value=RecordValue(
            raw=78.4,
            engineering_units="°F",
            quality=QualityCode.GOOD,
            data_type="float64",
        ),
        context=RecordContext(
            equipment_id="FERM-003",
            area="Area1",
            site="Plant1",
            batch_id="B2026-0412-003",
        ),
        lineage=RecordLineage(
            schema_ref="forge://schemas/opcua-generic/v1",
            adapter_id="opcua-generic",
            adapter_version="0.1.0",
        ),
    )


@pytest.fixture
def sample_lineage() -> LineageEntry:
    return LineageEntry(
        lineage_id="lin-001",
        source_record_ids=["src-1", "src-2"],
        output_record_id="out-1",
        product_id="dp-test-001",
        adapter_ids=["whk-wms"],
        steps=[
            TransformationStep(
                step_name="normalize",
                component="NormalizationStep",
            ),
        ],
    )


class TestNeo4jGraphWriter:
    """Tests for Neo4jGraphWriter."""

    def test_driver_ok_with_driver(self, mock_driver):
        driver, _ = mock_driver
        writer = Neo4jGraphWriter(driver)
        assert writer._driver_ok()

    def test_driver_ok_without_driver(self):
        writer = Neo4jGraphWriter(None)
        assert not writer._driver_ok()

    @pytest.mark.asyncio
    async def test_write_record_no_driver_returns_false(self, sample_record):
        writer = Neo4jGraphWriter(None)
        result = await writer.write_record(sample_record)
        assert result is False

    @pytest.mark.asyncio
    async def test_write_record_success(self, mock_driver, sample_record):
        driver, session = mock_driver
        session.execute_write.return_value = None
        writer = Neo4jGraphWriter(driver)
        result = await writer.write_record(sample_record)
        assert result is True
        session.execute_write.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_record_handles_error(self, mock_driver, sample_record):
        driver, session = mock_driver
        session.execute_write.side_effect = Exception("Neo4j unavailable")
        writer = Neo4jGraphWriter(driver)
        result = await writer.write_record(sample_record)
        assert result is False

    @pytest.mark.asyncio
    async def test_write_batch_no_driver(self, sample_record):
        writer = Neo4jGraphWriter(None)
        result = await writer.write_batch([sample_record])
        assert result == 0

    @pytest.mark.asyncio
    async def test_write_batch_success(self, mock_driver, sample_record):
        driver, session = mock_driver
        session.execute_write.return_value = None
        writer = Neo4jGraphWriter(driver)
        result = await writer.write_batch([sample_record, sample_record])
        assert result == 2

    @pytest.mark.asyncio
    async def test_query_equipment_topology_no_driver(self):
        writer = Neo4jGraphWriter(None)
        result = await writer.query_equipment_topology("FERM-003")
        assert result == []

    @pytest.mark.asyncio
    async def test_query_equipment_topology_success(self, mock_driver):
        driver, session = mock_driver
        mock_result = AsyncMock()
        mock_result.__aiter__ = AsyncMock(
            return_value=iter([{"e": "node1", "rels": [], "neighbors": []}]),
        )
        session.run.return_value = mock_result
        writer = Neo4jGraphWriter(driver)
        await writer.query_equipment_topology("FERM-003")
        session.run.assert_called_once()

    @pytest.mark.asyncio
    async def test_merge_record_tx_creates_all_nodes(self, sample_record):
        """Verify the transaction function calls MERGE for record, adapter, equipment, batch."""
        tx = AsyncMock()
        await Neo4jGraphWriter._merge_record_tx(tx, sample_record)
        # 4 calls: Record, Adapter+rel, Equipment+rel, Batch+rel
        assert tx.run.call_count == 4
        calls = [str(c) for c in tx.run.call_args_list]
        assert any("MERGE (r:Record" in c for c in calls)
        assert any("MERGE (a:Adapter" in c for c in calls)
        assert any("MERGE (e:Equipment" in c for c in calls)
        assert any("MERGE (b:Batch" in c for c in calls)

    @pytest.mark.asyncio
    async def test_merge_record_tx_no_equipment(self):
        """When no equipment_id, should skip Equipment MERGE."""
        record = ContextualRecord(
            record_id=uuid4(),
            source=RecordSource(
                adapter_id="test",
                system="test-sys",
            ),
            timestamp=RecordTimestamp(
                source_time=datetime(2026, 1, 1, tzinfo=UTC),
            ),
            value=RecordValue(raw="test"),
            context=RecordContext(),  # no equipment
            lineage=RecordLineage(
                schema_ref="test",
                adapter_id="test",
                adapter_version="0.1.0",
            ),
        )
        tx = AsyncMock()
        await Neo4jGraphWriter._merge_record_tx(tx, record)
        # 2 calls: Record + Adapter (no Equipment, no Batch)
        assert tx.run.call_count == 2


class TestNeo4jLineageWriter:
    """Tests for Neo4jLineageWriter."""

    def test_driver_ok(self, mock_driver):
        driver, _ = mock_driver
        writer = Neo4jLineageWriter(driver)
        assert writer._driver_ok()

    def test_driver_ok_none(self):
        writer = Neo4jLineageWriter(None)
        assert not writer._driver_ok()

    @pytest.mark.asyncio
    async def test_write_lineage_no_driver(self, sample_lineage):
        writer = Neo4jLineageWriter(None)
        result = await writer.write_lineage(sample_lineage)
        assert result is False

    @pytest.mark.asyncio
    async def test_write_lineage_success(self, mock_driver, sample_lineage):
        driver, session = mock_driver
        session.execute_write.return_value = None
        writer = Neo4jLineageWriter(driver)
        result = await writer.write_lineage(sample_lineage)
        assert result is True
        session.execute_write.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_lineage_handles_error(self, mock_driver, sample_lineage):
        driver, session = mock_driver
        session.execute_write.side_effect = Exception("driver error")
        writer = Neo4jLineageWriter(driver)
        result = await writer.write_lineage(sample_lineage)
        assert result is False

    @pytest.mark.asyncio
    async def test_write_batch_success(self, mock_driver, sample_lineage):
        driver, session = mock_driver
        session.execute_write.return_value = None
        writer = Neo4jLineageWriter(driver)
        result = await writer.write_batch([sample_lineage, sample_lineage])
        assert result == 2

    @pytest.mark.asyncio
    async def test_merge_lineage_tx_creates_graph(self, sample_lineage):
        """Verify lineage TX creates output node, product link, and source links."""
        tx = AsyncMock()
        await Neo4jLineageWriter._merge_lineage_tx(tx, sample_lineage)
        # CuratedOutput, DataProduct link, 2 source links
        assert tx.run.call_count == 4
        calls = [str(c) for c in tx.run.call_args_list]
        assert any("MERGE (o:CuratedOutput" in c for c in calls)
        assert any("MERGE (p:DataProduct" in c for c in calls)
        assert any("MERGE (s:SourceRecord" in c for c in calls)
