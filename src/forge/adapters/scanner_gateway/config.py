"""Typed configuration for the Scanner Gateway adapter.

The gateway serves two roles:
  1. gRPC server (ScannerService) — accepts scans from Android devices
  2. Forge adapter — translates and routes scans to the hub
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ScannerGatewayConfig(BaseModel):
    """Connection parameters for the Scanner Gateway adapter.

    Maps directly to the 7 connection_params in the manifest.
    """

    # ── Gateway server (Android-facing) ──────────────────────────
    gateway_listen_host: str = Field(
        default="0.0.0.0",
        description="Host for the ScannerService gRPC server.",
    )
    gateway_listen_port: int = Field(
        default=50060,
        ge=1,
        le=65535,
        description="Port for the ScannerService gRPC server.",
    )

    # ── Spoke routing ────────────────────────────────────────────
    wms_adapter_id: str = Field(
        default="whk-wms",
        description="Adapter ID of the WMS spoke for barrel scan routing.",
    )
    ims_adapter_id: str | None = Field(
        default="bosc-ims",
        description="Adapter ID of the IMS spoke for asset scan routing.",
    )
    qms_adapter_id: str | None = Field(
        default=None,
        description="Adapter ID of the QMS spoke for sample scan routing.",
    )

    # ── Security ─────────────────────────────────────────────────
    device_token_secret: str = Field(
        ...,
        description="Secret key for signing device authentication tokens.",
    )

    # ── Tuning ───────────────────────────────────────────────────
    max_batch_size: int = Field(
        default=500,
        ge=1,
        le=5000,
        description="Maximum number of scan events per batch submission.",
    )

    model_config = ConfigDict(frozen=True)

    @property
    def listen_address(self) -> str:
        """Return the gateway gRPC listen address."""
        return f"{self.gateway_listen_host}:{self.gateway_listen_port}"
