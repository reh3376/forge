"""Tests for broker exchange definitions."""

import pytest

from forge.broker.exchanges import (
    FORGE_EXCHANGES,
    ExchangeSpec,
    ExchangeType,
    get_exchange,
)


class TestExchangeSpec:
    def test_defaults(self):
        spec = ExchangeSpec(name="test.exchange")
        assert spec.type == ExchangeType.FANOUT
        assert spec.durable is True

    def test_queue_name(self):
        spec = ExchangeSpec(name="forge.ingestion.raw")
        assert spec.queue_name == "forge.ingestion.raw.queue"

    def test_immutable(self):
        spec = ExchangeSpec(name="test")
        with pytest.raises(AttributeError):
            spec.name = "other"


class TestForgeExchanges:
    def test_all_exchanges_defined(self):
        expected_keys = [
            "ingestion.raw",
            "ingestion.contextual",
            "governance.events",
            "curation.products",
            "adapter.lifecycle",
        ]
        for key in expected_keys:
            assert key in FORGE_EXCHANGES, f"Missing exchange: {key}"

    def test_exchange_names_use_forge_prefix(self):
        for spec in FORGE_EXCHANGES.values():
            assert spec.name.startswith("forge."), f"{spec.name} missing forge. prefix"

    def test_all_exchanges_durable(self):
        for spec in FORGE_EXCHANGES.values():
            assert spec.durable, f"{spec.name} should be durable"

    def test_governance_uses_topic_exchange(self):
        spec = FORGE_EXCHANGES["governance.events"]
        assert spec.type == ExchangeType.TOPIC

    def test_ingestion_uses_fanout(self):
        spec = FORGE_EXCHANGES["ingestion.raw"]
        assert spec.type == ExchangeType.FANOUT

    def test_exchange_count(self):
        assert len(FORGE_EXCHANGES) == 5


class TestGetExchange:
    def test_existing_key(self):
        spec = get_exchange("ingestion.raw")
        assert spec is not None
        assert spec.name == "forge.ingestion.raw"

    def test_missing_key(self):
        assert get_exchange("nonexistent") is None
