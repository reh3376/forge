"""Typed configuration for the NextTrend Historian adapter.

The adapter connects to NextTrend's REST API for tag metadata,
history queries, and live SSE streaming. Auth is either API key
(preferred for machine-to-machine) or JWT (username/password).
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NextTrendConfig(BaseModel):
    """Connection parameters for the NextTrend adapter.

    Maps directly to the connection_params in manifest.json.
    """

    # ── API endpoint ─────────────────────────────────────────────
    api_base_url: str = Field(
        default="http://localhost:3011/api/v1",
        description="NextTrend REST API base URL.",
    )

    # ── Authentication (API key preferred, JWT fallback) ─────────
    api_key: str | None = Field(
        default=None,
        description="NextTrend API key (ntv1_ prefix).",
    )
    username: str | None = Field(
        default=None,
        description="NextTrend username for JWT auth.",
    )
    password: str | None = Field(
        default=None,
        description="NextTrend password for JWT auth.",
    )

    # ── Collection tuning ────────────────────────────────────────
    poll_interval_ms: int = Field(
        default=5000,
        ge=500,
        le=300_000,
        description="Interval between collection polls.",
    )
    history_query_limit: int = Field(
        default=10_000,
        ge=100,
        le=100_000,
        description="Maximum data points per history query.",
    )
    tag_prefix_filter: str = Field(
        default="",
        description="Only collect tags matching this path prefix.",
    )

    # ── HTTP tuning ──────────────────────────────────────────────
    connect_timeout_ms: int = Field(
        default=5000,
        ge=500,
        le=30_000,
        description="HTTP connection timeout.",
    )
    request_timeout_ms: int = Field(
        default=30_000,
        ge=1000,
        le=120_000,
        description="HTTP request timeout.",
    )

    model_config = ConfigDict(frozen=True)

    @model_validator(mode="after")
    def _check_auth(self) -> "NextTrendConfig":
        """Ensure at least one authentication method is provided."""
        has_api_key = bool(self.api_key)
        has_jwt = bool(self.username and self.password)
        if not has_api_key and not has_jwt:
            msg = (
                "NextTrend adapter requires either api_key or "
                "username+password for authentication."
            )
            raise ValueError(msg)
        return self

    @property
    def auth_header(self) -> dict[str, str]:
        """Return the appropriate auth header for API requests.

        Prefers API key over JWT credentials. JWT token acquisition
        is handled by the adapter at runtime.
        """
        if self.api_key:
            return {"X-Api-Key": self.api_key}
        return {}

    @property
    def uses_jwt(self) -> bool:
        """True if JWT auth is configured (no API key)."""
        return not self.api_key and bool(self.username)
