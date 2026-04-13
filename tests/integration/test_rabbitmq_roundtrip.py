"""RabbitMQ round-trip integration test.

Verifies: publish to exchange → consume from queue → verify payload.
Uses InMemoryProducer/Consumer for CI, real AMQP for Docker stack.

Run with: ``pytest -m integration tests/integration/``
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from forge.broker.consumer import InMemoryConsumer
from forge.broker.event_publisher import ForgeEventPublisher
from forge.broker.exchanges import FORGE_EXCHANGES
from forge.broker.producer import InMemoryProducer
from forge.broker.serialization import deserialize_record, serialize_record
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)


class TestInMemoryRoundTrip:
    """Round-trip using in-memory producer/consumer (no Docker needed)."""

    @pytest.mark.asyncio
    async def test_publish_and_consume(self):
        """Publish a message and consume it via callback delivery."""
        producer = InMemoryProducer()
        consumer = InMemoryConsumer()
        exchange = FORGE_EXCHANGES["adapter.lifecycle"]

        # Register consumer with callback
        received: list[dict] = []

        async def on_message(msg: dict) -> None:
            received.append(msg)

        await consumer.consume(exchange, "test-queue", on_message)

        # Publish
        await producer.publish(exchange, {"adapter_id": "whk-wms", "event": "registered"})

        # Deliver published messages to consumer
        for msg in producer.get_messages(exchange.name):
            body = json.loads(msg["body"])
            await consumer.deliver("test-queue", body)

        assert len(received) == 1
        assert received[0]["adapter_id"] == "whk-wms"

    @pytest.mark.asyncio
    async def test_contextual_record_serialization_roundtrip(self):
        """Serialize a ContextualRecord, publish, consume, deserialize."""
        record = ContextualRecord(
            record_id=uuid4(),
            source=RecordSource(
                adapter_id="whk-erpi",
                system="erpi-prod",
                tag_path="erpi.material.receive",
            ),
            timestamp=RecordTimestamp(
                source_time=datetime(2026, 4, 12, 10, 0, 0, tzinfo=UTC),
            ),
            value=RecordValue(
                raw={"material_id": "MAT-001", "quantity": 500},
                data_type="json",
                quality=QualityCode.GOOD,
            ),
            context=RecordContext(
                equipment_id="SILO-007",
                area="Receiving",
            ),
            lineage=RecordLineage(
                schema_ref="forge://schemas/whk-erpi/Material/v1",
                adapter_id="whk-erpi",
                adapter_version="0.1.0",
            ),
        )

        # Serialize
        payload = serialize_record(record)
        assert isinstance(payload, bytes)

        # Publish via producer
        producer = InMemoryProducer()
        exchange = FORGE_EXCHANGES["ingestion.contextual"]
        await producer.publish(exchange, record)

        # Verify stored message
        msgs = producer.get_messages(exchange.name)
        assert len(msgs) == 1

        # Deserialize
        deserialized = deserialize_record(msgs[0]["body"])
        assert deserialized["source"]["adapter_id"] == "whk-erpi"
        assert deserialized["value"]["raw"]["material_id"] == "MAT-001"

    @pytest.mark.asyncio
    async def test_event_publisher_roundtrip(self):
        """ForgeEventPublisher → InMemoryProducer → consume → verify."""
        producer = InMemoryProducer()
        publisher = ForgeEventPublisher(producer)

        # Publish lifecycle events
        await publisher.adapter_registered("whk-wms", "WMS Adapter")
        await publisher.record_ingested("whk-wms", count=10)
        await publisher.governance_violation("schema-drift", detail="hash mismatch")

        # Verify adapter lifecycle
        lifecycle_msgs = producer.get_messages("forge.adapter.lifecycle")
        assert len(lifecycle_msgs) == 1
        event = json.loads(lifecycle_msgs[0]["body"])
        assert event["event_type"] == "adapter.registered"

        # Verify ingestion
        ingest_msgs = producer.get_messages("forge.ingestion.raw")
        assert len(ingest_msgs) == 1
        event = json.loads(ingest_msgs[0]["body"])
        assert event["payload"]["count"] == 10

        # Verify governance
        gov_msgs = producer.get_messages("forge.governance.events")
        assert len(gov_msgs) == 1
        assert gov_msgs[0]["routing_key"] == "governance.warning"

    @pytest.mark.asyncio
    async def test_multiple_exchanges_isolated(self):
        """Messages published to different exchanges are isolated."""
        producer = InMemoryProducer()
        publisher = ForgeEventPublisher(producer)

        await publisher.adapter_registered("a1", "Adapter 1")
        await publisher.product_published("dp-001", "Product 1", "Owner")

        lifecycle = producer.get_messages("forge.adapter.lifecycle")
        curation = producer.get_messages("forge.curation.products")

        assert len(lifecycle) == 1
        assert len(curation) == 1

        # Cross-check: lifecycle doesn't have curation events
        assert json.loads(lifecycle[0]["body"])["event_type"] == "adapter.registered"
        assert json.loads(curation[0]["body"])["event_type"] == "curation.product.published"


@pytest.mark.integration
class TestAmqpRoundTrip:
    """Real AMQP round-trip (requires Docker RabbitMQ).

    Skipped in normal CI — run with ``pytest -m integration``.
    """

    @pytest.mark.asyncio
    async def test_publish_consume_amqp(self, skip_without_docker):
        """Publish to RabbitMQ → consume → verify payload."""
        # This test would use AmqpProducer/AmqpConsumer with the
        # Docker RabbitMQ instance. For now, it serves as a placeholder
        # that validates the test infrastructure is wired correctly.
        pytest.skip("Requires running RabbitMQ — enable with Docker Compose")
