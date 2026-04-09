"""Bridge adapter data models — configuration, responses, and health.

These models define the contract between the bridge adapter and the
Ignition REST API.  The IgnitionTagValue is the raw response shape;
the adapter converts it to ContextualRecords via the record builder.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Ignition REST API response models
# ---------------------------------------------------------------------------


class IgnitionQuality(str, enum.Enum):
    """Ignition quality codes returned by the REST API.

    Ignition uses a quality hierarchy: Good/Uncertain/Bad with subtypes.
    We map these to the 4-value Forge QualityCode in the adapter.
    """

    GOOD = "Good"
    UNCERTAIN = "Uncertain"
    BAD = "Bad"
    BAD_STALE = "Bad_Stale"
    BAD_DISABLED = "Bad_Disabled"
    BAD_NOT_FOUND = "Bad_NotFound"
    BAD_REFERENCE_NOT_FOUND = "Bad_ReferenceNotFound"
    BAD_ACCESS_DENIED = "Bad_AccessDenied"
    ERROR = "Error"

    @property
    def is_good(self) -> bool:
        return self == IgnitionQuality.GOOD

    @property
    def is_bad(self) -> bool:
        return self.value.startswith("Bad") or self == IgnitionQuality.ERROR


@dataclass(frozen=True)
class IgnitionTagValue:
    """A single tag value as returned by Ignition's REST API.

    The Ignition system/tag/read endpoint returns JSON with this shape
    per tag path requested.
    """

    path: str                               # Ignition bracket-notation path
    value: Any = None                       # Raw value from Ignition
    quality: IgnitionQuality = IgnitionQuality.GOOD
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    data_type: str = "Unknown"              # Ignition data type string

    @staticmethod
    def from_api_response(path: str, data: dict[str, Any]) -> IgnitionTagValue:
        """Parse a single tag entry from the Ignition REST API response.

        Args:
            path: The requested tag path (Ignition bracket notation).
            data: The JSON dict for this tag from the API response.

        Returns:
            Parsed IgnitionTagValue with normalized quality.
        """
        quality_str = data.get("quality", "Good")
        try:
            quality = IgnitionQuality(quality_str)
        except ValueError:
            # Unknown quality code — map to BAD
            quality = IgnitionQuality.BAD

        ts = data.get("timestamp")
        if isinstance(ts, (int, float)):
            # Ignition returns epoch milliseconds
            timestamp = datetime.fromtimestamp(ts / 1000.0, tz=timezone.utc)
        elif isinstance(ts, str):
            timestamp = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        else:
            timestamp = datetime.now(timezone.utc)

        return IgnitionTagValue(
            path=path,
            value=data.get("value"),
            quality=quality,
            timestamp=timestamp,
            data_type=data.get("dataType", "Unknown"),
        )


@dataclass(frozen=True)
class IgnitionTagResponse:
    """Complete response from an Ignition tag read batch."""

    values: tuple[IgnitionTagValue, ...]
    request_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    response_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def latency_ms(self) -> float:
        """Round-trip latency in milliseconds."""
        delta = self.response_time - self.request_time
        return delta.total_seconds() * 1000.0

    @property
    def good_count(self) -> int:
        return sum(1 for v in self.values if v.quality.is_good)

    @property
    def bad_count(self) -> int:
        return sum(1 for v in self.values if v.quality.is_bad)


# ---------------------------------------------------------------------------
# Tag mapping configuration
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TagMappingRule:
    """A rule that maps Ignition tag paths to Forge-normalized paths.

    Rules use fnmatch-style patterns on the Ignition path to select which
    tags are included in the bridge.  The ``strip_prefix`` allows removing
    redundant Ignition hierarchy segments.

    Example:
        TagMappingRule(
            ignition_pattern="[WHK01]WH/WHK01/Distillery01/*",
            strip_prefix="WH/WHK01/",
            forge_prefix="WH/WHK01/",
        )
    """

    ignition_pattern: str       # fnmatch pattern on Ignition path (after bracket)
    strip_prefix: str = ""      # Prefix to remove from Ignition path before normalization
    forge_prefix: str = ""      # Explicit Forge prefix (overrides PathNormalizer if set)
    enabled: bool = True


@dataclass(frozen=True)
class TagMapping:
    """Complete mapping between an Ignition path and a Forge-normalized path.

    Produced by TagMapper.map() — carries both paths plus the rule that
    matched, enabling audit and debugging of path translation.
    """

    ignition_path: str          # Original Ignition bracket path
    forge_path: str             # Forge-normalized slash path
    connection_name: str        # Extracted from Ignition brackets (e.g., "WHK01")
    rule: TagMappingRule | None = None  # The rule that produced this mapping


# ---------------------------------------------------------------------------
# Bridge configuration
# ---------------------------------------------------------------------------


@dataclass
class BridgeConfig:
    """Configuration for the Ignition bridge adapter.

    Loaded from bridge-config.json or environment variables.
    All timeouts in milliseconds.
    """

    # Ignition REST API connection
    gateway_url: str = "http://localhost:8088"
    username: str = ""
    password: str = ""
    verify_ssl: bool = False

    # Polling behavior
    poll_interval_ms: int = 1000        # How often to poll Ignition (default 1s)
    batch_size: int = 100               # Tags per REST API call
    request_timeout_ms: int = 5000      # HTTP request timeout
    max_concurrent_requests: int = 4    # Parallel batch requests

    # Tag selection
    tag_provider: str = "WHK01"         # Ignition tag provider to bridge
    include_patterns: list[str] = field(default_factory=list)   # fnmatch include
    exclude_patterns: list[str] = field(default_factory=list)   # fnmatch exclude
    mapping_rules: list[TagMappingRule] = field(default_factory=list)

    # Health
    health_check_interval_ms: int = 5000
    max_consecutive_failures: int = 5   # Failures before DEGRADED state

    # Feature flags
    dual_write_enabled: bool = True     # Enable dual-write validation
    auto_discover: bool = True          # Auto-discover tags from Ignition browse


# ---------------------------------------------------------------------------
# Bridge health model
# ---------------------------------------------------------------------------


class BridgeState(str, enum.Enum):
    """Bridge adapter operational states."""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    HEALTHY = "healthy"
    DEGRADED = "degraded"          # Ignition reachable but errors > threshold
    FAILED = "failed"              # Ignition unreachable
    STOPPED = "stopped"


@dataclass
class BridgeHealth:
    """Health status of the Ignition bridge adapter."""

    state: BridgeState = BridgeState.DISCONNECTED
    last_poll_time: datetime | None = None
    last_success_time: datetime | None = None
    tags_polled: int = 0
    tags_good: int = 0
    tags_bad: int = 0
    consecutive_failures: int = 0
    total_polls: int = 0
    total_errors: int = 0
    avg_latency_ms: float = 0.0

    # Ignition gateway info (populated on first successful poll)
    ignition_version: str = ""
    gateway_name: str = ""

    @property
    def error_rate(self) -> float:
        """Fraction of polls that have failed."""
        if self.total_polls == 0:
            return 0.0
        return self.total_errors / self.total_polls

    @property
    def tag_quality_rate(self) -> float:
        """Fraction of tags with good quality."""
        if self.tags_polled == 0:
            return 0.0
        return self.tags_good / self.tags_polled
