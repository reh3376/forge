"""SparkplugB encoding — BIRTH/DATA/DEATH message encoding.

Encodes OT Module tag data into Sparkplug B format for consumers
that expect the Sparkplug B specification (like NextTrend's
SparkplugB connector).

Design decisions:
    D1: We implement a *simplified* SparkplugB encoding that produces
        the correct topic namespace and payload structure without
        requiring the official sparkplug_b protobuf library.
        Full protobuf encoding can be added later.
    D2: Topic namespace follows SparkplugB spec:
        ``spBv1.0/{group_id}/{message_type}/{edge_node_id}/{device_id}``
    D3: Payloads are JSON (not protobuf) for initial implementation.
        This is accepted by many SparkplugB consumers in "JSON mode".
    D4: BIRTH messages include full metric definitions (name, datatype,
        alias).  DATA messages include only changed metrics.
    D5: DEATH messages are published as the MQTT will message for the
        edge node, ensuring proper state cleanup on ungraceful disconnect.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import IntEnum
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# SparkplugB data types (subset matching Ignition's mapping)
# ---------------------------------------------------------------------------


class SparkplugDataType(IntEnum):
    """SparkplugB metric data types."""

    UNKNOWN = 0
    INT8 = 1
    INT16 = 2
    INT32 = 3
    INT64 = 4
    UINT8 = 5
    UINT16 = 6
    UINT32 = 7
    UINT64 = 8
    FLOAT = 9
    DOUBLE = 10
    BOOLEAN = 11
    STRING = 12
    DATETIME = 13
    TEXT = 14
    BYTES = 17


# ---------------------------------------------------------------------------
# SparkplugB message types
# ---------------------------------------------------------------------------


class SparkplugMessageType(str):
    NBIRTH = "NBIRTH"   # Node birth (edge node online)
    NDEATH = "NDEATH"   # Node death (edge node offline)
    DBIRTH = "DBIRTH"   # Device birth (device online)
    DDEATH = "DDEATH"   # Device death (device offline)
    NDATA = "NDATA"     # Node data (metrics from edge node)
    DDATA = "DDATA"     # Device data (metrics from device)
    NCMD = "NCMD"       # Node command (to edge node)
    DCMD = "DCMD"       # Device command (to device)


# ---------------------------------------------------------------------------
# Metric
# ---------------------------------------------------------------------------


@dataclass
class SparkplugMetric:
    """A single SparkplugB metric."""

    name: str
    alias: int = 0
    datatype: SparkplugDataType = SparkplugDataType.DOUBLE
    value: Any = None
    timestamp: int = 0  # milliseconds since epoch
    is_historical: bool = False
    is_transient: bool = False

    def to_dict(self) -> dict[str, Any]:
        """Serialize metric to JSON-compatible dict."""
        d: dict[str, Any] = {
            "name": self.name,
            "alias": self.alias,
            "datatype": int(self.datatype),
            "value": self.value,
            "timestamp": self.timestamp,
        }
        if self.is_historical:
            d["is_historical"] = True
        if self.is_transient:
            d["is_transient"] = True
        return d


# ---------------------------------------------------------------------------
# SparkplugB payload builder
# ---------------------------------------------------------------------------


@dataclass
class SparkplugPayload:
    """A SparkplugB payload containing metrics."""

    timestamp: int = 0  # milliseconds since epoch
    seq: int = 0        # sequence number (0-255, wraps)
    metrics: list[SparkplugMetric] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "timestamp": self.timestamp,
            "seq": self.seq,
            "metrics": [m.to_dict() for m in self.metrics],
        }


# ---------------------------------------------------------------------------
# SparkplugB encoder
# ---------------------------------------------------------------------------


class SparkplugEncoder:
    """Encodes OT Module data into SparkplugB topic/payload pairs.

    Usage::

        encoder = SparkplugEncoder(group_id="WHK", edge_node_id="OT-Module-01")

        # Birth message (on connect)
        topic, payload = encoder.build_node_birth(metrics=[...])

        # Data message (on tag change)
        topic, payload = encoder.build_device_data("Distillery01", metrics=[...])

        # Death will (set as MQTT will)
        topic, payload = encoder.build_node_death()
    """

    def __init__(
        self,
        group_id: str = "WHK",
        edge_node_id: str = "ForgeOT",
    ) -> None:
        self._group_id = group_id
        self._edge_node_id = edge_node_id
        self._seq = 0
        self._alias_map: dict[str, int] = {}
        self._next_alias = 1

    @property
    def group_id(self) -> str:
        return self._group_id

    @property
    def edge_node_id(self) -> str:
        return self._edge_node_id

    def _next_seq(self) -> int:
        """Get next sequence number (wraps at 256)."""
        seq = self._seq
        self._seq = (self._seq + 1) % 256
        return seq

    def _get_alias(self, metric_name: str) -> int:
        """Get or assign an alias for a metric name."""
        if metric_name not in self._alias_map:
            self._alias_map[metric_name] = self._next_alias
            self._next_alias += 1
        return self._alias_map[metric_name]

    def _topic(self, msg_type: str, device_id: str = "") -> str:
        """Build SparkplugB topic."""
        base = f"spBv1.0/{self._group_id}/{msg_type}/{self._edge_node_id}"
        if device_id:
            base += f"/{device_id}"
        return base

    def _now_ms(self) -> int:
        """Current time in milliseconds since epoch."""
        return int(time.time() * 1000)

    # ------------------------------------------------------------------
    # Node messages
    # ------------------------------------------------------------------

    def build_node_birth(
        self,
        metrics: list[SparkplugMetric] | None = None,
    ) -> tuple[str, dict]:
        """Build NBIRTH message (edge node comes online)."""
        self._seq = 0  # Reset sequence on birth

        birth_metrics = metrics or []
        # Assign aliases
        for m in birth_metrics:
            m.alias = self._get_alias(m.name)
            if not m.timestamp:
                m.timestamp = self._now_ms()

        payload = SparkplugPayload(
            timestamp=self._now_ms(),
            seq=self._next_seq(),
            metrics=birth_metrics,
        )
        return self._topic(SparkplugMessageType.NBIRTH), payload.to_dict()

    def build_node_death(self) -> tuple[str, dict]:
        """Build NDEATH message (set as MQTT will).

        The payload contains only a bdSeq metric for correlation.
        """
        payload = SparkplugPayload(
            timestamp=self._now_ms(),
            seq=0,
            metrics=[
                SparkplugMetric(
                    name="bdSeq",
                    datatype=SparkplugDataType.INT64,
                    value=0,
                    timestamp=self._now_ms(),
                ),
            ],
        )
        return self._topic(SparkplugMessageType.NDEATH), payload.to_dict()

    # ------------------------------------------------------------------
    # Device messages
    # ------------------------------------------------------------------

    def build_device_birth(
        self,
        device_id: str,
        metrics: list[SparkplugMetric] | None = None,
    ) -> tuple[str, dict]:
        """Build DBIRTH message (device comes online)."""
        birth_metrics = metrics or []
        for m in birth_metrics:
            m.alias = self._get_alias(f"{device_id}/{m.name}")
            if not m.timestamp:
                m.timestamp = self._now_ms()

        payload = SparkplugPayload(
            timestamp=self._now_ms(),
            seq=self._next_seq(),
            metrics=birth_metrics,
        )
        return self._topic(SparkplugMessageType.DBIRTH, device_id), payload.to_dict()

    def build_device_data(
        self,
        device_id: str,
        metrics: list[SparkplugMetric] | None = None,
    ) -> tuple[str, dict]:
        """Build DDATA message (device metrics update)."""
        data_metrics = metrics or []
        for m in data_metrics:
            m.alias = self._get_alias(f"{device_id}/{m.name}")
            if not m.timestamp:
                m.timestamp = self._now_ms()

        payload = SparkplugPayload(
            timestamp=self._now_ms(),
            seq=self._next_seq(),
            metrics=data_metrics,
        )
        return self._topic(SparkplugMessageType.DDATA, device_id), payload.to_dict()

    def build_device_death(self, device_id: str) -> tuple[str, dict]:
        """Build DDEATH message (device goes offline)."""
        payload = SparkplugPayload(
            timestamp=self._now_ms(),
            seq=self._next_seq(),
            metrics=[],
        )
        return self._topic(SparkplugMessageType.DDEATH, device_id), payload.to_dict()


# ---------------------------------------------------------------------------
# Data type inference
# ---------------------------------------------------------------------------


def infer_sparkplug_type(value: Any) -> SparkplugDataType:
    """Infer SparkplugB data type from a Python value."""
    if isinstance(value, bool):
        return SparkplugDataType.BOOLEAN
    if isinstance(value, int):
        if -128 <= value <= 127:
            return SparkplugDataType.INT8
        if -32768 <= value <= 32767:
            return SparkplugDataType.INT16
        if -2147483648 <= value <= 2147483647:
            return SparkplugDataType.INT32
        return SparkplugDataType.INT64
    if isinstance(value, float):
        return SparkplugDataType.DOUBLE
    if isinstance(value, str):
        return SparkplugDataType.STRING
    if isinstance(value, bytes):
        return SparkplugDataType.BYTES
    if isinstance(value, datetime):
        return SparkplugDataType.DATETIME
    return SparkplugDataType.UNKNOWN
