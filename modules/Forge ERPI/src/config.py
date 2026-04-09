"""Typed configuration for the WHK ERPI adapter.

Connection parameters are declared in the FACTS spec and validated
by the hub before being passed to configure(). This module provides
a Pydantic model for type-safe access.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class WhkErpiConfig(BaseModel):
    """Connection parameters for the WHK ERPI adapter.

    Maps directly to the connection_params in whk-erpi.facts.json.
    Required params have no default; optional params have sensible defaults.
    """

    # Required
    rabbitmq_url: str = Field(
        ...,
        description="AMQP connection URL (e.g. amqp://guest:guest@localhost:5672).",
    )
    erpi_rest_url: str = Field(
        ...,
        description="ERPI REST API base URL (e.g. http://localhost:3000/api).",
    )

    # Optional
    erpi_graphql_url: str | None = Field(
        default=None,
        description="ERPI GraphQL endpoint for enrichment queries.",
    )
    jwt_token: str | None = Field(
        default=None,
        description="JWT bearer token for authenticated API requests.",
    )
    rabbitmq_consumer_group: str = Field(
        default="forge-erpi",
        description="Consumer group for queue naming. Must be unique to Forge.",
    )
    rabbitmq_vhost: str = Field(
        default="/",
        description="RabbitMQ virtual host.",
    )

    model_config = ConfigDict(frozen=True)
