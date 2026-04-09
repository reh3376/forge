"""Ignition Bridge Adapter — read-only adapter for migration validation.

This adapter polls Ignition's REST API for tag values and converts them
to ContextualRecords with ``source.system="ignition-bridge"``.  It does
NOT implement WritableAdapter — all writes must flow through the OT
Module's 4-layer safety interlock chain.

The adapter is temporary: it is activated during Phase 5 (parallel
operation validation) and removed in Phase 7.3 (Ignition decommission).

Architecture:
    IgnitionBridgeAdapter
        ├── IgnitionRestClient  (HTTP transport to Ignition)
        ├── TagMapper           (Ignition ↔ Forge path translation)
        └── EnrichmentPipeline  (context resolution, shared with OT Module)
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

from forge.adapters.base.interface import AdapterBase, DiscoveryProvider
from forge.core.models.adapter import (
    AdapterCapabilities,
    AdapterHealth,
    AdapterManifest,
    AdapterState,
    AdapterTier,
    DataContract,
)
from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode as CoreQualityCode,
    RecordContext,
    RecordLineage,
    RecordSource,
    RecordTimestamp,
    RecordValue,
)
from forge.modules.ot.bridge.client import IgnitionRestClient
from forge.modules.ot.bridge.models import (
    BridgeConfig,
    BridgeHealth,
    BridgeState,
    IgnitionQuality,
    IgnitionTagResponse,
    IgnitionTagValue,
)
from forge.modules.ot.bridge.tag_mapper import TagMapper
from forge.modules.ot.context.resolvers import EnrichmentContext, EnrichmentPipeline

logger = logging.getLogger(__name__)

# Schema ref for bridge-sourced records (distinct from OT Module direct)
_BRIDGE_SCHEMA_REF = "forge://schemas/ot-module/v0.3.0/bridge"
_BRIDGE_ADAPTER_ID = "ignition-bridge"
_BRIDGE_ADAPTER_VERSION = "0.1.0"


class IgnitionBridgeAdapter(AdapterBase, DiscoveryProvider):
    """Read-only adapter that polls Ignition REST API for tag values.

    This adapter:
      - Is read-only (no WritableAdapter mixin)
      - Emits ContextualRecords with source.system="ignition-bridge"
      - Tracks health independently from the OT Module
      - Provides discovery via Ignition tag browse

    Usage::

        adapter = IgnitionBridgeAdapter(config, client, mapper)
        await adapter.configure({})
        await adapter.start()
        async for record in adapter.collect():
            print(record)
        await adapter.stop()
    """

    manifest = AdapterManifest(
        adapter_id=_BRIDGE_ADAPTER_ID,
        name="Ignition Bridge Adapter",
        version=_BRIDGE_ADAPTER_VERSION,
        type="BRIDGE",
        protocol="http-rest",
        tier=AdapterTier.OT,
        capabilities=AdapterCapabilities(
            read=True,
            write=False,     # Read-only — writes go through OT Module
            subscribe=False, # Poll-based, not subscription
            backfill=False,  # History stays in Ignition/Canary
            discover=True,
        ),
        data_contract=DataContract(
            schema_ref=_BRIDGE_SCHEMA_REF,
            output_format="contextual_record",
            context_fields=["area", "equipment_id", "operating_mode"],
        ),
        health_check_interval_ms=5000,
    )

    def __init__(
        self,
        config: BridgeConfig,
        client: IgnitionRestClient,
        mapper: TagMapper,
        enrichment: EnrichmentPipeline | None = None,
    ) -> None:
        super().__init__()
        self._config = config
        self._client = client
        self._mapper = mapper
        self._enrichment = enrichment or EnrichmentPipeline()
        self._bridge_health = BridgeHealth()
        self._started_at: datetime | None = None

        # Tags to poll (populated during start/discover)
        self._active_tags: list[str] = []  # Ignition paths

        # Latency tracking (rolling window of last 100 polls)
        self._latencies: list[float] = []
        self._max_latency_window = 100

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def configure(self, params: dict[str, Any]) -> None:
        """Accept hub parameters (currently none bridge-specific)."""
        self._state = AdapterState.CONNECTING
        self._bridge_health.state = BridgeState.CONNECTING

    async def start(self) -> None:
        """Connect to Ignition and discover tags."""
        connected = await self._client.connect()
        if not connected:
            self._state = AdapterState.DEGRADED
            self._bridge_health.state = BridgeState.FAILED
            logger.error("Failed to connect to Ignition gateway")
            return

        # Auto-discover tags if enabled
        if self._config.auto_discover:
            await self._discover_tags()

        # Fetch gateway info
        status = await self._client.get_status()
        self._bridge_health.ignition_version = status.get("version", "")
        self._bridge_health.gateway_name = status.get("gatewayName", "")

        self._state = AdapterState.HEALTHY
        self._bridge_health.state = BridgeState.HEALTHY
        self._started_at = datetime.now(timezone.utc)
        logger.info(
            "Bridge adapter started — %d tags mapped from Ignition",
            len(self._active_tags),
        )

    async def stop(self) -> None:
        """Disconnect from Ignition."""
        await self._client.disconnect()
        self._state = AdapterState.STOPPED
        self._bridge_health.state = BridgeState.STOPPED
        logger.info("Bridge adapter stopped")

    async def health(self) -> AdapterHealth:
        """Return combined adapter + bridge health."""
        uptime = 0.0
        if self._started_at:
            uptime = (datetime.now(timezone.utc) - self._started_at).total_seconds()

        return AdapterHealth(
            adapter_id=self.manifest.adapter_id,
            state=self._state,
            last_check=datetime.now(timezone.utc),
            last_healthy=self._started_at if self._state == AdapterState.HEALTHY else None,
            records_collected=self._records_collected,
            records_failed=self._records_failed,
            uptime_seconds=uptime,
        )

    # ------------------------------------------------------------------
    # Core read: collect()
    # ------------------------------------------------------------------

    async def collect(self) -> AsyncIterator[ContextualRecord]:
        """Poll Ignition for all active tags and yield ContextualRecords.

        Each call performs a full read of all mapped tags, converts them
        to ContextualRecords with source.system="ignition-bridge", and
        tracks health metrics.
        """
        if not self._active_tags:
            return

        response = await self._client.read_tags(self._active_tags)

        # Track latency
        self._latencies.append(response.latency_ms)
        if len(self._latencies) > self._max_latency_window:
            self._latencies = self._latencies[-self._max_latency_window:]

        # Update health
        self._bridge_health.total_polls += 1
        self._bridge_health.last_poll_time = datetime.now(timezone.utc)
        self._bridge_health.tags_polled = len(response.values)
        self._bridge_health.tags_good = response.good_count
        self._bridge_health.tags_bad = response.bad_count
        self._bridge_health.avg_latency_ms = (
            sum(self._latencies) / len(self._latencies) if self._latencies else 0.0
        )

        if response.values:
            self._bridge_health.last_success_time = datetime.now(timezone.utc)
            self._bridge_health.consecutive_failures = 0
            self._bridge_health.state = BridgeState.HEALTHY
        else:
            self._bridge_health.consecutive_failures += 1
            self._bridge_health.total_errors += 1
            if self._bridge_health.consecutive_failures >= self._config.max_consecutive_failures:
                self._bridge_health.state = BridgeState.DEGRADED
                self._state = AdapterState.DEGRADED

        # Convert to ContextualRecords
        for tag_value in response.values:
            try:
                record = self._build_record(tag_value)
                if record is not None:
                    self._records_collected += 1
                    yield record
            except Exception:
                self._records_failed += 1
                logger.debug(
                    "Failed to build bridge record for %s", tag_value.path,
                    exc_info=True,
                )

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------

    async def discover(self) -> list[dict[str, Any]]:
        """Enumerate all tags discoverable via Ignition browse.

        Returns tag metadata in the same format as OTModuleAdapter.discover().
        """
        browse_results = await self._client.browse(
            f"[{self._config.tag_provider}]",
            recursive=True,
        )

        discovered: list[dict[str, Any]] = []
        for node in browse_results:
            ign_path = node.get("path", "")
            mapping = self._mapper.map(ign_path)
            if mapping:
                discovered.append({
                    "tag_path": mapping.forge_path,
                    "data_type": node.get("data_type", "Unknown"),
                    "description": "",
                    "engineering_units": "",
                    "tag_type": "standard",  # All Ignition tags are treated as standard
                    "source": "ignition-bridge",
                    "ignition_path": ign_path,
                })

        return discovered

    # ------------------------------------------------------------------
    # Bridge-specific API
    # ------------------------------------------------------------------

    @property
    def bridge_health(self) -> BridgeHealth:
        """Access the bridge-specific health model."""
        return self._bridge_health

    @property
    def active_tag_count(self) -> int:
        """Number of tags actively being polled."""
        return len(self._active_tags)

    def add_tags(self, ignition_paths: list[str]) -> int:
        """Add Ignition tag paths to the active polling list.

        Only tags that pass the mapper's include/exclude filters are added.
        Returns the number of tags actually added.
        """
        added = 0
        for path in ignition_paths:
            mapping = self._mapper.map(path)
            if mapping and path not in self._active_tags:
                self._active_tags.append(path)
                added += 1
        return added

    def remove_tags(self, ignition_paths: list[str]) -> int:
        """Remove Ignition tag paths from the active polling list."""
        removed = 0
        for path in ignition_paths:
            if path in self._active_tags:
                self._active_tags.remove(path)
                removed += 1
        return removed

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _discover_tags(self) -> None:
        """Populate active tags from Ignition browse."""
        discovered = await self.discover()
        for tag in discovered:
            ign_path = tag.get("ignition_path", "")
            if ign_path and ign_path not in self._active_tags:
                self._active_tags.append(ign_path)

        logger.info("Auto-discovered %d tags from Ignition", len(self._active_tags))

    def _build_record(self, tag_value: IgnitionTagValue) -> ContextualRecord | None:
        """Convert an IgnitionTagValue to a ContextualRecord.

        Returns None if the tag path can't be mapped to a Forge path.
        """
        mapping = self._mapper.map(tag_value.path)
        if mapping is None:
            return None

        forge_path = mapping.forge_path
        now = datetime.now(tz=timezone.utc)

        # Map Ignition quality to core quality
        core_quality = _map_ignition_quality(tag_value.quality)

        # Resolve enrichment context
        enrichment = self._enrichment.enrich(forge_path)

        # Build record sections
        source = RecordSource(
            adapter_id=_BRIDGE_ADAPTER_ID,
            system="ignition-bridge",
            tag_path=forge_path,
            connection_id=mapping.connection_name,
        )

        timestamp = RecordTimestamp(
            source_time=tag_value.timestamp,
            server_time=tag_value.timestamp,
            ingestion_time=now,
        )

        value = RecordValue(
            raw=tag_value.value,
            engineering_units=None,
            quality=core_quality,
            data_type=tag_value.data_type,
        )

        context = RecordContext(
            equipment_id=enrichment.equipment_id,
            area=enrichment.area,
            site=enrichment.site,
            batch_id=enrichment.batch_id,
            lot_id=enrichment.lot_id,
            recipe_id=enrichment.recipe_id,
            operating_mode=enrichment.operating_mode,
            shift=enrichment.shift,
            operator_id=enrichment.operator_id,
            extra={
                **enrichment.extra,
                "bridge_source": "ignition",
                "ignition_path": tag_value.path,
            },
        )

        lineage = RecordLineage(
            schema_ref=_BRIDGE_SCHEMA_REF,
            adapter_id=_BRIDGE_ADAPTER_ID,
            adapter_version=_BRIDGE_ADAPTER_VERSION,
            transformation_chain=["ignition_rest_poll", "tag_mapper", "context_enrichment"],
        )

        return ContextualRecord(
            source=source,
            timestamp=timestamp,
            value=value,
            context=context,
            lineage=lineage,
        )


# ---------------------------------------------------------------------------
# Quality mapping
# ---------------------------------------------------------------------------


def _map_ignition_quality(quality: IgnitionQuality) -> CoreQualityCode:
    """Map Ignition quality codes to Forge core QualityCode.

    Ignition has many subtypes; Forge uses a 4-value model.
    """
    if quality == IgnitionQuality.GOOD:
        return CoreQualityCode.GOOD
    if quality == IgnitionQuality.UNCERTAIN:
        return CoreQualityCode.UNCERTAIN
    # All BAD variants → BAD
    return CoreQualityCode.BAD
