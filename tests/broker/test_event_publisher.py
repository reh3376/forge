"""Tests for ForgeEventPublisher."""

from __future__ import annotations

import pytest

from forge.broker.event_publisher import ForgeEventPublisher
from forge.broker.producer import InMemoryProducer


@pytest.fixture
def producer() -> InMemoryProducer:
    return InMemoryProducer()


@pytest.fixture
def publisher(producer: InMemoryProducer) -> ForgeEventPublisher:
    return ForgeEventPublisher(producer)


class TestAdapterLifecycle:
    """Adapter lifecycle event publishing."""

    @pytest.mark.asyncio
    async def test_adapter_registered(self, publisher, producer):
        await publisher.adapter_registered("whk-wms", "WMS Adapter", version="1.0")
        msgs = producer.get_messages("forge.adapter.lifecycle")
        assert len(msgs) == 1
        body = msgs[0]["body"]
        assert isinstance(body, bytes)
        import json

        event = json.loads(body)
        assert event["event_type"] == "adapter.registered"
        assert event["payload"]["adapter_id"] == "whk-wms"
        assert event["payload"]["name"] == "WMS Adapter"
        assert event["payload"]["version"] == "1.0"
        assert "timestamp" in event

    @pytest.mark.asyncio
    async def test_adapter_started(self, publisher, producer):
        await publisher.adapter_started("whk-erpi")
        msgs = producer.get_messages("forge.adapter.lifecycle")
        assert len(msgs) == 1
        import json

        event = json.loads(msgs[0]["body"])
        assert event["event_type"] == "adapter.started"
        assert event["payload"]["adapter_id"] == "whk-erpi"

    @pytest.mark.asyncio
    async def test_adapter_stopped(self, publisher, producer):
        await publisher.adapter_stopped("whk-cmms", reason="maintenance")
        msgs = producer.get_messages("forge.adapter.lifecycle")
        assert len(msgs) == 1
        import json

        event = json.loads(msgs[0]["body"])
        assert event["event_type"] == "adapter.stopped"
        assert event["payload"]["reason"] == "maintenance"

    @pytest.mark.asyncio
    async def test_adapter_errored(self, publisher, producer):
        await publisher.adapter_errored("whk-nms", error="connection timeout")
        msgs = producer.get_messages("forge.adapter.lifecycle")
        import json

        event = json.loads(msgs[0]["body"])
        assert event["event_type"] == "adapter.errored"
        assert event["payload"]["error"] == "connection timeout"


class TestIngestion:
    """Ingestion event publishing."""

    @pytest.mark.asyncio
    async def test_record_ingested(self, publisher, producer):
        await publisher.record_ingested("whk-erpi", count=42, batch_id="batch-001")
        msgs = producer.get_messages("forge.ingestion.raw")
        assert len(msgs) == 1
        import json

        event = json.loads(msgs[0]["body"])
        assert event["event_type"] == "ingestion.batch"
        assert event["payload"]["count"] == 42
        assert event["payload"]["batch_id"] == "batch-001"


class TestGovernance:
    """Governance event publishing."""

    @pytest.mark.asyncio
    async def test_governance_violation(self, publisher, producer):
        await publisher.governance_violation(
            "schema-drift",
            severity="error",
            detail="Hash mismatch on barrel schema",
            entity_id="forge://schemas/whk-wms/Barrel/v1",
        )
        msgs = producer.get_messages("forge.governance.events")
        assert len(msgs) == 1
        assert msgs[0]["routing_key"] == "governance.error"
        import json

        event = json.loads(msgs[0]["body"])
        assert event["event_type"] == "governance.violation"
        assert event["payload"]["rule_name"] == "schema-drift"
        assert event["payload"]["severity"] == "error"


class TestCuration:
    """Curation event publishing."""

    @pytest.mark.asyncio
    async def test_product_published(self, publisher, producer):
        await publisher.product_published("dp-001", "Fermentation Context", "Jane Doe")
        msgs = producer.get_messages("forge.curation.products")
        assert len(msgs) == 1
        import json

        event = json.loads(msgs[0]["body"])
        assert event["event_type"] == "curation.product.published"
        assert event["payload"]["product_id"] == "dp-001"
        assert event["payload"]["name"] == "Fermentation Context"
        assert event["payload"]["owner"] == "Jane Doe"

    @pytest.mark.asyncio
    async def test_product_deprecated(self, publisher, producer):
        await publisher.product_deprecated("dp-001", reason="replaced by dp-002")
        msgs = producer.get_messages("forge.curation.products")
        import json

        event = json.loads(msgs[0]["body"])
        assert event["event_type"] == "curation.product.deprecated"
        assert event["payload"]["reason"] == "replaced by dp-002"


class TestEnvelope:
    """Event envelope structure."""

    @pytest.mark.asyncio
    async def test_envelope_has_required_fields(self, publisher, producer):
        await publisher.adapter_registered("test", "Test")
        msgs = producer.get_messages("forge.adapter.lifecycle")
        import json

        event = json.loads(msgs[0]["body"])
        assert "event_type" in event
        assert "timestamp" in event
        assert "payload" in event
        assert isinstance(event["payload"], dict)

    @pytest.mark.asyncio
    async def test_multiple_events_accumulate(self, publisher, producer):
        await publisher.adapter_registered("a1", "Adapter 1")
        await publisher.adapter_started("a1")
        await publisher.adapter_stopped("a1")
        msgs = producer.get_messages("forge.adapter.lifecycle")
        assert len(msgs) == 3


class TestClose:
    """Publisher close delegates to producer."""

    @pytest.mark.asyncio
    async def test_close(self, publisher, producer):
        await publisher.close()
        # InMemoryProducer.close() is a no-op, just verifying no error
