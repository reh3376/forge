"""Broker-specific configuration.

Re-exports RabbitMQConfig from storage config for convenience and adds
broker-level helper to build a config from environment.
"""

from __future__ import annotations

from forge.storage.config import RabbitMQConfig, StorageConfig


def broker_config_from_env() -> RabbitMQConfig:
    """Build RabbitMQ broker config from environment variables."""
    return StorageConfig.from_env().rabbitmq


__all__ = ["RabbitMQConfig", "broker_config_from_env"]
