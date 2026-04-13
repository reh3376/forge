"""Tests for Forge Storage configuration."""

import pytest

from forge.storage.config import (
    KafkaConfig,
    MinioConfig,
    Neo4jConfig,
    PostgresConfig,
    RabbitMQConfig,
    RedisConfig,
    StorageConfig,
    TimescaleConfig,
)


class TestPostgresConfig:
    def test_defaults(self):
        cfg = PostgresConfig()
        assert cfg.host == "localhost"
        assert cfg.port == 5432
        assert cfg.database == "forge"

    def test_dsn_format(self):
        cfg = PostgresConfig(host="db.local", port=5432, database="mydb", user="u", password="p")
        assert cfg.dsn == "postgresql://u:p@db.local:5432/mydb"

    def test_async_dsn_format(self):
        cfg = PostgresConfig()
        assert cfg.async_dsn.startswith("postgresql+asyncpg://")

    def test_immutable(self):
        cfg = PostgresConfig()
        with pytest.raises(AttributeError):
            cfg.host = "other"


class TestTimescaleConfig:
    def test_defaults(self):
        cfg = TimescaleConfig()
        assert cfg.port == 5433
        assert cfg.database == "forge_ts"

    def test_dsn(self):
        cfg = TimescaleConfig()
        assert "forge_ts" in cfg.dsn


class TestNeo4jConfig:
    def test_defaults(self):
        cfg = Neo4jConfig()
        assert cfg.uri == "bolt://localhost:7687"
        assert cfg.max_connection_pool_size == 50


class TestRedisConfig:
    def test_defaults(self):
        cfg = RedisConfig()
        assert cfg.url == "redis://localhost:6379/0"


class TestMinioConfig:
    def test_defaults(self):
        cfg = MinioConfig()
        assert cfg.default_bucket == "forge-archive"
        assert cfg.secure is False


class TestKafkaConfig:
    def test_defaults(self):
        cfg = KafkaConfig()
        assert cfg.bootstrap_servers == "localhost:9092"


class TestRabbitMQConfig:
    def test_defaults(self):
        cfg = RabbitMQConfig()
        assert cfg.url == "amqp://forge:changeme@localhost:5672/"
        assert cfg.vhost == "/"
        assert cfg.consumer_group == "forge-hub"
        assert cfg.prefetch_count == 100
        assert cfg.connection_timeout == 10.0

    def test_immutable(self):
        cfg = RabbitMQConfig()
        with pytest.raises(AttributeError):
            cfg.url = "other"


class TestStorageConfig:
    def test_default_construction(self):
        cfg = StorageConfig()
        assert cfg.postgres.host == "localhost"
        assert cfg.timescale.port == 5433
        assert cfg.neo4j.uri == "bolt://localhost:7687"
        assert cfg.rabbitmq.vhost == "/"

    def test_from_env(self, monkeypatch):
        monkeypatch.setenv("POSTGRES_HOST", "pg.production.local")
        monkeypatch.setenv("POSTGRES_PORT", "5555")
        monkeypatch.setenv("NEO4J_URI", "bolt://neo4j.prod:7687")
        monkeypatch.setenv("REDIS_URL", "redis://redis.prod:6380/1")
        monkeypatch.setenv("RABBITMQ_URL", "amqp://prod:secret@rmq.prod:5672/forge")

        cfg = StorageConfig.from_env()
        assert cfg.postgres.host == "pg.production.local"
        assert cfg.postgres.port == 5555
        assert cfg.neo4j.uri == "bolt://neo4j.prod:7687"
        assert cfg.redis.url == "redis://redis.prod:6380/1"
        assert cfg.rabbitmq.url == "amqp://prod:secret@rmq.prod:5672/forge"

    def test_from_env_defaults(self):
        cfg = StorageConfig.from_env()
        assert cfg.postgres.host == "localhost"
        assert cfg.kafka.bootstrap_servers == "localhost:9092"
        assert "localhost" in cfg.rabbitmq.url
