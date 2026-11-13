"""Typed configuration for the WHK NMS adapter.

Connection parameters are declared in the FACTS spec and validated
by the hub before being passed to configure(). This module provides
a Pydantic model for type-safe access.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WhkNmsConfig(BaseModel):
    """Connection parameters for the WHK NMS adapter.

    Maps directly to the connection_params in whk-nms.facts.json.
    Required params have no default; optional params have sensible defaults.
    """

    # Required
    nms_api_url: str = Field(
        ...,
        description="NMS REST API base URL (e.g. http://localhost:8000/api/v1).",
    )

    # Optional
    nms_ws_url: str | None = Field(
        default=None,
        description="NMS WebSocket URL for event streaming (e.g. ws://localhost:8000/api/v1/events/stream).",
    )
    jwt_token: str | None = Field(
        default=None,
        description="JWT bearer token for authenticated API requests.",
    )
    poll_interval_seconds: int = Field(
        default=60,
        description="Polling interval for REST endpoints in seconds.",
    )
    verify_ssl: bool = Field(
        default=True,
        description="Verify SSL certificates for HTTPS connections.",
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
