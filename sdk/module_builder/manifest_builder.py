"""Fluent builder for AdapterManifest — the starting point for every module.

The ManifestBuilder produces a complete manifest.json that drives all
downstream code generation. Connection params declared here become
config.py fields; capabilities determine which mixins the adapter
class inherits; context_fields seed the context.py field extraction.

Example::

    manifest = (
        ManifestBuilder("whk-plc")
        .name("WHK PLC Adapter")
        .version("0.1.0")
        .protocol("opcua")
        .tier("OT")
        .capability("read", True)
        .capability("subscribe", True)
        .connection_param("endpoint_url", required=True, description="OPC-UA server")
        .connection_param("security_policy", required=False, default="Basic256Sha256")
        .context_field("equipment_id")
        .context_field("area")
        .auth_method("certificate")
        .metadata("spoke", "whk-plc")
        .build()
    )
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


# Valid tiers and capability names from the proven adapter pattern
_VALID_TIERS = {"OT", "MES_MOM", "ERP_BUSINESS", "HISTORIAN", "DOCUMENT"}
_VALID_CAPABILITIES = {"read", "write", "subscribe", "backfill", "discover"}


class ManifestBuilder:
    """Fluent builder for adapter manifest.json content.

    Every setter returns ``self`` for method chaining.
    ``build()`` returns the manifest as a dict (serializable to JSON).
    """

    def __init__(self, adapter_id: str) -> None:
        if not adapter_id or not adapter_id.replace("-", "").replace("_", "").isalnum():
            msg = (
                f"Invalid adapter_id '{adapter_id}': must be alphanumeric "
                "with optional hyphens/underscores."
            )
            raise ValueError(msg)

        self._adapter_id = adapter_id
        self._name: str = f"{adapter_id} adapter"
        self._version: str = "0.1.0"
        self._type: str = "INGESTION"
        self._protocol: str = "rest"
        self._tier: str = "MES_MOM"
        self._capabilities: dict[str, bool] = {
            "read": True,
            "write": False,
            "subscribe": False,
            "backfill": False,
            "discover": False,
        }
        self._schema_ref: str = f"forge://schemas/{adapter_id}/v0.1.0"
        self._output_format: str = "contextual_record"
        self._context_fields: list[str] = []
        self._health_check_interval_ms: int = 30_000
        self._connection_params: list[dict[str, Any]] = []
        self._auth_methods: list[str] = ["none"]
        self._metadata: dict[str, Any] = {}

    # ── Identity ──────────────────────────────────────────────

    def name(self, name: str) -> ManifestBuilder:
        """Set the human-readable adapter name."""
        self._name = name
        return self

    def version(self, version: str) -> ManifestBuilder:
        """Set the adapter version (semver)."""
        self._version = version
        self._schema_ref = f"forge://schemas/{self._adapter_id}/v{version}"
        return self

    def type(self, adapter_type: str) -> ManifestBuilder:
        """Set the adapter type (default: INGESTION)."""
        self._type = adapter_type
        return self

    def protocol(self, protocol: str) -> ManifestBuilder:
        """Set the communication protocol (e.g. 'graphql+amqp', 'grpc', 'opcua')."""
        self._protocol = protocol
        return self

    def tier(self, tier: str) -> ManifestBuilder:
        """Set the ISA-95 tier.

        Valid tiers: OT, MES_MOM, ERP_BUSINESS, HISTORIAN, DOCUMENT.
        """
        if tier not in _VALID_TIERS:
            msg = f"Invalid tier '{tier}'. Must be one of {_VALID_TIERS}"
            raise ValueError(msg)
        self._tier = tier
        return self

    # ── Capabilities ──────────────────────────────────────────

    def capability(self, name: str, enabled: bool = True) -> ManifestBuilder:
        """Enable or disable a capability."""
        if name not in _VALID_CAPABILITIES:
            msg = f"Invalid capability '{name}'. Must be one of {_VALID_CAPABILITIES}"
            raise ValueError(msg)
        self._capabilities[name] = enabled
        return self

    # ── Data contract ─────────────────────────────────────────

    def schema_ref(self, ref: str) -> ManifestBuilder:
        """Override the schema reference."""
        self._schema_ref = ref
        return self

    def context_field(self, field_name: str) -> ManifestBuilder:
        """Add a context field to the data contract."""
        if field_name not in self._context_fields:
            self._context_fields.append(field_name)
        return self

    def health_check_interval(self, ms: int) -> ManifestBuilder:
        """Set the health check interval in milliseconds."""
        self._health_check_interval_ms = ms
        return self

    # ── Connection params ─────────────────────────────────────

    def connection_param(
        self,
        name: str,
        *,
        description: str = "",
        required: bool = True,
        secret: bool = False,
        default: str | None = None,
    ) -> ManifestBuilder:
        """Add a connection parameter.

        These drive the generated config.py Pydantic model.
        """
        param: dict[str, Any] = {
            "name": name,
            "description": description,
            "required": required,
            "secret": secret,
        }
        if default is not None:
            param["default"] = default
        self._connection_params.append(param)
        return self

    # ── Auth and metadata ─────────────────────────────────────

    def auth_method(self, method: str) -> ManifestBuilder:
        """Add an authentication method."""
        if "none" in self._auth_methods:
            self._auth_methods.remove("none")
        if method not in self._auth_methods:
            self._auth_methods.append(method)
        return self

    def metadata(self, key: str, value: Any) -> ManifestBuilder:
        """Add a metadata key-value pair."""
        self._metadata[key] = value
        return self

    # ── Build ─────────────────────────────────────────────────

    def build(self) -> dict[str, Any]:
        """Build and return the manifest as a dict.

        Raises ValueError if the manifest is incomplete or invalid.
        """
        if not self._capabilities.get("read"):
            msg = "At least 'read' capability must be enabled."
            raise ValueError(msg)

        # Ensure default context fields if none provided
        if not self._context_fields:
            self._context_fields = ["equipment_id", "event_type"]

        return {
            "adapter_id": self._adapter_id,
            "name": self._name,
            "version": self._version,
            "type": self._type,
            "protocol": self._protocol,
            "tier": self._tier,
            "capabilities": dict(self._capabilities),
            "data_contract": {
                "schema_ref": self._schema_ref,
                "output_format": self._output_format,
                "context_fields": list(self._context_fields),
            },
            "health_check_interval_ms": self._health_check_interval_ms,
            "connection_params": list(self._connection_params),
            "auth_methods": list(self._auth_methods),
            "metadata": dict(self._metadata),
        }

    def build_json(self, indent: int = 2) -> str:
        """Build the manifest and return as formatted JSON string."""
        return json.dumps(self.build(), indent=indent)

    def write(self, path: Path) -> Path:
        """Build the manifest and write to a file.

        Returns the path written to.
        """
        path = Path(path)
        path.write_text(self.build_json() + "\n")
        return path
