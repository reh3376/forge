"""Typed configuration for the WHK MES adapter.

Connection parameters are declared in the FACTS spec and validated
by the hub before being passed to configure(). This module provides
a Pydantic model for type-safe access.

The MES adapter has 18 connection params (vs. WMS's 9) because it
adds MQTT broker connectivity (host, port, credentials, TLS certs,
message buffer) on top of the GraphQL + AMQP + Azure stack.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class WhkMesConfig(BaseModel):
    """Connection parameters for the WHK MES adapter.

    Maps directly to the 18 connection_params in whk-mes.facts.json.
    Required params have no default; optional params have sensible defaults.
    """

    # ── Required: GraphQL + AMQP + Azure ──────────────────────────
    graphql_url: str = Field(
        ...,
        description="MES GraphQL endpoint (e.g. http://localhost:3000/graphql).",
    )
    rabbitmq_url: str = Field(
        ...,
        description="AMQP connection URL (e.g. amqp://guest:guest@localhost:5672).",
    )
    azure_tenant_id: str = Field(
        ...,
        description="Azure Entra ID tenant for JWT authentication.",
    )
    azure_client_id: str = Field(
        ...,
        description="Azure app registration client ID.",
    )
    azure_client_secret: str = Field(
        ...,
        description="Azure client secret (service-to-service auth).",
    )

    # ── Optional: RabbitMQ tuning ─────────────────────────────────
    rabbitmq_vhost: str = Field(
        default="/",
        description="RabbitMQ virtual host.",
    )
    rabbitmq_consumer_group: str = Field(
        default="forge-mes-adapter",
        description="RabbitMQ consumer group ID for subscription queues.",
    )

    # ── Optional: MQTT broker connectivity ────────────────────────
    mqtt_host: str | None = Field(
        default=None,
        description="Primary MQTT broker host (bootstrap broker for UNS).",
    )
    mqtt_port: int = Field(
        default=1883,
        ge=1,
        le=65535,
        description="MQTT broker port. 1883=plain, 8883=TLS.",
    )
    mqtt_username: str | None = Field(
        default=None,
        description="MQTT broker username.",
    )
    mqtt_password: str | None = Field(
        default=None,
        description="MQTT broker password.",
    )
    mqtt_ca_cert: str | None = Field(
        default=None,
        description="CA certificate (PEM) for verifying MQTT broker identity.",
    )
    mqtt_client_cert: str | None = Field(
        default=None,
        description="Client certificate (PEM) for mutual TLS with MQTT broker.",
    )
    mqtt_client_key: str | None = Field(
        default=None,
        description="Client private key (PEM) for mTLS. Paired with mqtt_client_cert.",
    )

    # ── Optional: Azure Key Vault + Redis ─────────────────────────
    azure_vault_name: str | None = Field(
        default=None,
        description="Azure Key Vault name for secrets management.",
    )
    redis_url: str | None = Field(
        default=None,
        description="Optional Redis URL for cache coordination.",
    )

    # ── Optional: Tuning ──────────────────────────────────────────
    graphql_timeout_ms: int = Field(
        default=10_000,
        ge=1_000,
        le=60_000,
        description="GraphQL request timeout in milliseconds.",
    )
    mqtt_buffer_max_seconds: int = Field(
        default=60,
        ge=10,
        le=300,
        description="Max seconds to buffer MQTT messages during broker reconnection.",
    )

    model_config = ConfigDict(frozen=True)
