"""Typed configuration for the WHK ERPI adapter.

Connection parameters are declared in the FACTS spec and validated
by the hub before being passed to configure(). This module provides
a Pydantic model for type-safe access.
"""

from __future__ import annotations

from typing import Literal

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

    source_timestamp_origin: Literal["device", "server", "edge", "forge"] | None = Field(
        default=None,
        description=(
            "Which clock stamps this connection's values (one-clock record P-4). Only "
            "'forge' lets Forge's own read time stand in for an event that carries no "
            "timestamp; otherwise such an event is refused (FB-088). FB-090 moves the "
            "declaration into the FACTS time_governance section."
        ),
    )

    model_config = ConfigDict(frozen=True)
