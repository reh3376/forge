"""Typed configuration for the WHK CMMS adapter.

Connection parameters are declared in the FACTS spec and validated
by the hub before being passed to configure(). This module provides
a Pydantic model for type-safe access.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class WhkCmmsConfig(BaseModel):
    """Connection parameters for the WHK CMMS adapter.

    Maps directly to the connection_params in whk-cmms.facts.json.
    Required params have no default; optional params have sensible defaults.

    CMMS is a hybrid GraphQL + RabbitMQ source:
    - GraphQL (primary): Poll CMMS for work orders, assets, maintenance requests
    - REST (secondary): Access items, kits, vendors, locations via REST API
    - RabbitMQ (tertiary): Subscribe to shared master data (item, vendor) flowing from ERPI
    """

    # Required
    cmms_graphql_url: str = Field(
        ...,
        description="CMMS GraphQL endpoint (e.g. http://localhost:3000/graphql).",
    )
    cmms_rest_url: str = Field(
        ...,
        description="CMMS REST API base URL (e.g. http://localhost:3000/api).",
    )

    # Optional
    rabbitmq_url: str | None = Field(
        default=None,
        description="RabbitMQ AMQP URL for subscription to ERPI master data topics (item, vendor).",
    )
    jwt_token: str | None = Field(
        default=None,
        description="JWT bearer token for authenticated GraphQL/REST requests.",
    )
    rabbitmq_consumer_group: str = Field(
        default="forge-cmms",
        description="Consumer group for RabbitMQ queue naming. Must be unique to Forge.",
    )
    rabbitmq_vhost: str = Field(
        default="/",
        description="RabbitMQ virtual host.",
    )
    poll_interval_seconds: int = Field(
        default=60,
        description="GraphQL polling interval for work orders, assets, maintenance requests.",
        ge=10,  # at least 10 seconds
        le=3600,  # at most 1 hour
    )

    model_config = ConfigDict(frozen=True)
