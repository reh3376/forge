"""Typed configuration for the WHK WMS adapter.

Connection parameters are declared in the FACTS spec and validated
by the hub before being passed to configure(). This module provides
a Pydantic model for type-safe access.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class WhkWmsConfig(BaseModel):
    """Connection parameters for the WHK WMS adapter.

    Maps directly to the 9 connection_params in whk-wms.facts.json.
    Required params have no default; optional params have sensible defaults.
    """

    # Required
    graphql_url: str = Field(
        ...,
        description="WMS GraphQL endpoint (e.g. http://localhost:3000/graphql).",
    )
    rabbitmq_url: str = Field(
        ...,
        description="AMQP connection URL (e.g. amqp://guest:guest@localhost:5672).",
    )
    azure_tenant_id: str = Field(
        ...,
        description="Azure Entra ID tenant for authentication.",
    )
    azure_client_id: str = Field(
        ...,
        description="Azure app registration client ID.",
    )
    azure_client_secret: str = Field(
        ...,
        description="Azure client secret (service-to-service auth).",
    )

    # Optional
    api_key: str | None = Field(
        default=None,
        description="API key for inventory upload endpoints.",
    )
    rabbitmq_vhost: str = Field(
        default="/",
        description="RabbitMQ virtual host.",
    )
    graphql_timeout_ms: int = Field(
        default=10_000,
        ge=1_000,
        le=60_000,
        description="GraphQL request timeout in milliseconds.",
    )
    redis_url: str | None = Field(
        default=None,
        description="Optional Redis URL for cache coordination.",
    )

    model_config = ConfigDict(frozen=True)
