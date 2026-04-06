"""Typed configuration for the BOSC IMS adapter.

Connection parameters are declared in the FACTS spec and validated
by the hub before being passed to configure(). This module provides
a Pydantic model for type-safe access.

Unlike the WMS/MES adapters that use GraphQL+RabbitMQ, BOSC IMS
communicates via native gRPC — the connection params reflect this.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class BoscImsConfig(BaseModel):
    """Connection parameters for the BOSC IMS adapter.

    Maps directly to the 9 connection_params in the manifest.
    The Go gRPC core runs on port 50050 by default.
    """

    # ── Required: gRPC endpoint ──────────────────────────────────
    grpc_host: str = Field(
        default="localhost",
        description="BOSC IMS gRPC server host.",
    )
    grpc_port: int = Field(
        default=50050,
        ge=1,
        le=65535,
        description="BOSC IMS gRPC server port.",
    )
    spoke_id: str = Field(
        default="bosc_ims_primary",
        description="Spoke identity for Forge metadata headers.",
    )

    # ── Optional: TLS / mTLS ─────────────────────────────────────
    use_tls: bool = Field(
        default=False,
        description="Enable TLS for gRPC connection.",
    )
    tls_ca_cert: str | None = Field(
        default=None,
        description="Path to CA certificate for TLS verification.",
    )
    tls_client_cert: str | None = Field(
        default=None,
        description="Path to client certificate for mTLS.",
    )
    tls_client_key: str | None = Field(
        default=None,
        description="Path to client private key for mTLS.",
    )

    # ── Optional: Timeouts ───────────────────────────────────────
    connect_timeout_ms: int = Field(
        default=5_000,
        ge=1_000,
        le=30_000,
        description="gRPC connection timeout in milliseconds.",
    )
    request_timeout_ms: int = Field(
        default=10_000,
        ge=1_000,
        le=60_000,
        description="Per-RPC request timeout in milliseconds.",
    )

    model_config = ConfigDict(frozen=True)

    @property
    def target(self) -> str:
        """Return the gRPC target string (host:port)."""
        return f"{self.grpc_host}:{self.grpc_port}"

    @property
    def connect_timeout_seconds(self) -> float:
        """Return connect timeout in seconds for grpc.aio."""
        return self.connect_timeout_ms / 1000.0

    @property
    def request_timeout_seconds(self) -> float:
        """Return request timeout in seconds for grpc.aio."""
        return self.request_timeout_ms / 1000.0
