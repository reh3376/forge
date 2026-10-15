"""Hub adapter registry: in-memory cache with write-through persistence (FB-060).

The REST and gRPC paths keep calling the synchronous cache API
(``register``, ``update_health``, ``list_all``, ``get_manifest``); the
durable variants (``registered``, ``health_reported``, ``log_batch``) also
write through to an :class:`~forge.storage.adapter_registry.AdapterRegistryStore`.
``load`` fills the cache from the store at start-up, so a hub restart
remembers every spoke that ever registered, with its last known state.

Heartbeats arrive every few seconds per spoke; they update the cache at
once but reach the store only when the state changed or
``health_persist_interval`` elapsed, so a busy site does not turn its
registry table into a write-heavy metrics table.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel

from forge.core.models.adapter import AdapterHealth, AdapterManifest, AdapterState
from forge.storage.adapter_registry import (
    AdapterRow,
    IngestBatchRow,
    InMemoryAdapterRegistryStore,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from forge.ingest.pipeline import IngestOutcome
    from forge.storage.adapter_registry import AdapterRegistryStore

logger = logging.getLogger(__name__)


class AdapterListItem(BaseModel):
    adapter_id: str
    name: str
    state: str
    records_collected: int = 0


class AdapterRegistry:
    """Cache + store for the hub's view of its spokes."""

    def __init__(
        self,
        store: AdapterRegistryStore | None = None,
        *,
        health_persist_interval: float = 30.0,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._store: AdapterRegistryStore = (
            store if store is not None else InMemoryAdapterRegistryStore()
        )
        self._interval = health_persist_interval
        self._now = now or (lambda: datetime.now(UTC))
        self._adapters: dict[str, AdapterManifest] = {}
        self._health: dict[str, AdapterHealth] = {}
        self._state: dict[str, AdapterState] = {}
        self._registered_at: dict[str, datetime] = {}
        self._dirty: set[str] = set()
        self._last_persisted: dict[str, tuple[datetime, str]] = {}
        self.loaded = 0
        self.persisted = 0
        self.persist_failures = 0
        self.batches_logged = 0

    # -- cache API (synchronous, unchanged contract) ---------------------------

    def register(self, manifest: AdapterManifest) -> None:
        self._adapters[manifest.adapter_id] = manifest
        self._state[manifest.adapter_id] = AdapterState.REGISTERED
        self._health[manifest.adapter_id] = AdapterHealth(
            adapter_id=manifest.adapter_id,
            state=AdapterState.REGISTERED,
        )
        self._registered_at.setdefault(manifest.adapter_id, self._now())
        self._dirty.add(manifest.adapter_id)

    def list_all(self) -> list[AdapterListItem]:
        items = []
        for aid, manifest in self._adapters.items():
            health = self._health.get(aid)
            items.append(
                AdapterListItem(
                    adapter_id=aid,
                    name=manifest.name,
                    state=self._state.get(aid, AdapterState.REGISTERED).value,
                    records_collected=health.records_collected if health else 0,
                )
            )
        return items

    def get_health(self, adapter_id: str) -> AdapterHealth | None:
        return self._health.get(adapter_id)

    def update_health(self, adapter_id: str, health: AdapterHealth) -> None:
        self._health[adapter_id] = health
        self._state[adapter_id] = health.state
        self._dirty.add(adapter_id)

    def get_manifest(self, adapter_id: str) -> AdapterManifest | None:
        return self._adapters.get(adapter_id)

    @property
    def store(self) -> AdapterRegistryStore:
        return self._store

    # -- durable API --------------------------------------------------------------

    async def registered(self, manifest: AdapterManifest) -> None:
        """Register and persist at once (Register RPC, REST register)."""
        self.register(manifest)
        await self._persist(manifest.adapter_id)

    async def health_reported(self, adapter_id: str, health: AdapterHealth) -> None:
        """Heartbeat: cache now, persist on state change or every interval."""
        self.update_health(adapter_id, health)
        if adapter_id not in self._adapters:
            return
        last = self._last_persisted.get(adapter_id)
        due = (
            last is None
            or last[1] != health.state.value
            or (self._now() - last[0]).total_seconds() >= self._interval
        )
        if due:
            await self._persist(adapter_id)

    async def log_batch(self, adapter_id: str, session_id: str, outcome: IngestOutcome) -> None:
        """One ``records_log`` row per ingested batch."""
        batch = IngestBatchRow(
            adapter_id=adapter_id,
            session_id=session_id,
            batch_size=outcome.received,
            accepted=outcome.accepted,
            rejected=outcome.rejected,
            persisted=outcome.persisted,
            failed=outcome.failed,
            errors=list(outcome.errors)[:20],
            ingested_at=self._now(),
        )
        try:
            await self._store.log_batch(batch)
            self.batches_logged += 1
        except Exception:
            self.persist_failures += 1
            logger.exception("Could not log ingest batch for %s", adapter_id)

    async def ingest_log(self, adapter_id: str | None = None, *, limit: int = 100) -> list[dict]:
        rows = await self._store.list_batches(adapter_id, limit=limit)
        return [row.to_dict() for row in rows]

    async def load(self) -> int:
        """Fill the cache from the store; cached entries win over stored ones."""
        try:
            rows = await self._store.list_adapters()
        except Exception:
            self.persist_failures += 1
            logger.exception("Could not load the adapter registry")
            return 0
        loaded = 0
        for row in rows:
            if row.adapter_id in self._adapters:
                continue
            try:
                manifest = AdapterManifest.model_validate(row.manifest)
            except Exception:
                logger.warning("Stored manifest for %s is not loadable; skipped", row.adapter_id)
                continue
            self._adapters[row.adapter_id] = manifest
            try:
                state = AdapterState(row.state)
            except ValueError:
                state = AdapterState.REGISTERED
            self._state[row.adapter_id] = state
            health = None
            if row.health:
                try:
                    health = AdapterHealth.model_validate(row.health)
                except Exception:
                    health = None
            self._health[row.adapter_id] = health or AdapterHealth(
                adapter_id=row.adapter_id, state=state
            )
            self._registered_at[row.adapter_id] = row.registered_at
            self._last_persisted[row.adapter_id] = (
                row.last_health_at or row.registered_at,
                state.value,
            )
            loaded += 1
        self.loaded = loaded
        if loaded:
            logger.info("Adapter registry: %d adapter(s) restored from the store", loaded)
        return loaded

    async def flush(self) -> int:
        """Persist everything registered or updated since the last persist."""
        count = 0
        for adapter_id in sorted(self._dirty):
            await self._persist(adapter_id)
            count += 1
        return count

    async def _persist(self, adapter_id: str) -> None:
        manifest = self._adapters.get(adapter_id)
        if manifest is None:
            self._dirty.discard(adapter_id)
            return
        health = self._health.get(adapter_id)
        state = self._state.get(adapter_id, AdapterState.REGISTERED)
        row = AdapterRow(
            adapter_id=adapter_id,
            name=manifest.name,
            version=manifest.version,
            type=manifest.type,
            tier=manifest.tier.value if hasattr(manifest.tier, "value") else str(manifest.tier),
            protocol=manifest.protocol,
            state=state.value,
            manifest=manifest.model_dump(mode="json"),
            health=health.model_dump(mode="json") if health is not None else None,
            registered_at=self._registered_at.get(adapter_id, self._now()),
            last_health_at=health.last_check if health is not None else None,
        )
        try:
            await self._store.save_adapter(row)
        except Exception:
            self.persist_failures += 1
            logger.exception("Could not persist adapter %s", adapter_id)
            return
        self.persisted += 1
        self._dirty.discard(adapter_id)
        self._last_persisted[adapter_id] = (self._now(), state.value)

    def describe(self) -> dict[str, Any]:
        return {
            "store": type(self._store).__name__,
            "adapters": len(self._adapters),
            "restored": self.loaded,
            "persisted": self.persisted,
            "persist_failures": self.persist_failures,
            "batches_logged": self.batches_logged,
            "pending": len(self._dirty),
        }
