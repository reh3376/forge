"""Storage configuration for all Forge database engines."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class PostgresConfig:
    """PostgreSQL connection configuration."""

    host: str = "localhost"
    port: int = 5432
    database: str = "forge"
    user: str = "forge"
    password: str = "changeme"
    min_pool_size: int = 5
    max_pool_size: int = 20

    @property
    def dsn(self) -> str:
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"

    @property
    def async_dsn(self) -> str:
        return f"postgresql+asyncpg://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"


@dataclass(frozen=True)
class TimescaleConfig:
    """TimescaleDB connection configuration."""

    host: str = "localhost"
    port: int = 5433
    database: str = "forge_ts"
    user: str = "forge"
    password: str = "changeme"
    min_pool_size: int = 2
    max_pool_size: int = 10

    @property
    def dsn(self) -> str:
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"


@dataclass(frozen=True)
class Neo4jConfig:
    """Neo4j connection configuration."""

    uri: str = "bolt://localhost:7687"
    user: str = "neo4j"
    password: str = "changeme"
    max_connection_pool_size: int = 50


@dataclass(frozen=True)
class RedisConfig:
    """Redis connection configuration."""

    url: str = "redis://localhost:6379/0"
    max_connections: int = 20


@dataclass(frozen=True)
class MinioConfig:
    """MinIO (S3-compatible) object storage configuration."""

    endpoint: str = "localhost:9000"
    access_key: str = "forge"
    secret_key: str = "changeme"
    secure: bool = False
    default_bucket: str = "forge-archive"


@dataclass(frozen=True)
class KafkaConfig:
    """Kafka streaming configuration."""

    bootstrap_servers: str = "localhost:9092"
    group_id: str = "forge-storage"
    auto_offset_reset: str = "earliest"


@dataclass(frozen=True)
class StorageConfig:
    """Unified storage configuration for all Forge engines.

    Reads from environment variables with FORGE_ prefix, falling back
    to sensible development defaults.
    """

    postgres: PostgresConfig = field(default_factory=PostgresConfig)
    timescale: TimescaleConfig = field(default_factory=TimescaleConfig)
    neo4j: Neo4jConfig = field(default_factory=Neo4jConfig)
    redis: RedisConfig = field(default_factory=RedisConfig)
    minio: MinioConfig = field(default_factory=MinioConfig)
    kafka: KafkaConfig = field(default_factory=KafkaConfig)

    @classmethod
    def from_env(cls) -> StorageConfig:
        """Build StorageConfig from environment variables."""
        return cls(
            postgres=PostgresConfig(
                host=os.getenv("POSTGRES_HOST", "localhost"),
                port=int(os.getenv("POSTGRES_PORT", "5432")),
                database=os.getenv("POSTGRES_DB", "forge"),
                user=os.getenv("POSTGRES_USER", "forge"),
                password=os.getenv("POSTGRES_PASSWORD", "changeme"),
            ),
            timescale=TimescaleConfig(
                host=os.getenv("TIMESCALE_HOST", "localhost"),
                port=int(os.getenv("TIMESCALE_PORT", "5433")),
                database=os.getenv("TIMESCALE_DB", "forge_ts"),
                user=os.getenv("TIMESCALE_USER", "forge"),
                password=os.getenv("TIMESCALE_PASSWORD", "changeme"),
            ),
            neo4j=Neo4jConfig(
                uri=os.getenv("NEO4J_URI", "bolt://localhost:7687"),
                user=os.getenv("NEO4J_USER", "neo4j"),
                password=os.getenv("NEO4J_PASSWORD", "changeme"),
            ),
            redis=RedisConfig(
                url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            ),
            minio=MinioConfig(
                endpoint=os.getenv("MINIO_ENDPOINT", "localhost:9000"),
                access_key=os.getenv("MINIO_ACCESS_KEY", "forge"),
                secret_key=os.getenv("MINIO_SECRET_KEY", "changeme"),
            ),
            kafka=KafkaConfig(
                bootstrap_servers=os.getenv(
                    "KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"
                ),
            ),
        )
