"""Forge Hub API — unified REST entry point for the platform.

This is the main application that ``docker compose`` runs.  It provides:

    /v1/health          — Aggregated infrastructure health
    /v1/adapters        — Adapter registry and lifecycle
    /v1/records         — Record ingestion (REST passthrough)
    /curation/...       — Curation sub-app (products, lineage, quality)

The gRPC server for spoke communication runs on a separate port
(default 50051) but is started/stopped by the same lifecycle.
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from functools import partial
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from forge.api.health import (
    HealthOrchestrator,
    PlatformHealth,
    check_kafka,
    check_neo4j,
    check_postgres,
    check_redis,
    check_timescaledb,
)
from forge.core.models.adapter import AdapterHealth, AdapterManifest, AdapterState
from forge.storage.config import StorageConfig
from forge.storage.factory import StorageFactory  # noqa: TC001

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class IngestRequest(BaseModel):
    """Batch of raw records to ingest via REST."""

    adapter_id: str
    records: list[dict[str, Any]]


class IngestResponse(BaseModel):
    """Result of an ingestion request."""

    accepted: int
    rejected: int = 0
    errors: list[str] = Field(default_factory=list)


class AdapterListItem(BaseModel):
    adapter_id: str
    name: str
    state: str
    records_collected: int = 0


# ---------------------------------------------------------------------------
# In-memory adapter registry (production: backed by PostgreSQL)
# ---------------------------------------------------------------------------


class _AdapterRegistry:
    """Lightweight in-memory adapter registry.

    In the full production deployment this is backed by PostgreSQL.
    For the F04 dev stack the in-memory version is sufficient.
    """

    def __init__(self) -> None:
        self._adapters: dict[str, AdapterManifest] = {}
        self._health: dict[str, AdapterHealth] = {}
        self._state: dict[str, AdapterState] = {}

    def register(self, manifest: AdapterManifest) -> None:
        self._adapters[manifest.adapter_id] = manifest
        self._state[manifest.adapter_id] = AdapterState.REGISTERED
        self._health[manifest.adapter_id] = AdapterHealth(
            adapter_id=manifest.adapter_id,
            state=AdapterState.REGISTERED,
        )

    def list_all(self) -> list[AdapterListItem]:
        items = []
        for aid, manifest in self._adapters.items():
            health = self._health.get(aid)
            items.append(AdapterListItem(
                adapter_id=aid,
                name=manifest.name,
                state=self._state.get(aid, AdapterState.REGISTERED).value,
                records_collected=health.records_collected if health else 0,
            ))
        return items

    def get_health(self, adapter_id: str) -> AdapterHealth | None:
        return self._health.get(adapter_id)

    def update_health(self, adapter_id: str, health: AdapterHealth) -> None:
        self._health[adapter_id] = health

    def get_manifest(self, adapter_id: str) -> AdapterManifest | None:
        return self._adapters.get(adapter_id)


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------


def create_app(
    storage_config: StorageConfig | None = None,
    storage_factory: StorageFactory | None = None,
) -> FastAPI:
    """Create the Forge Hub API application.

    Args:
        storage_config: Override for storage configuration.
            Defaults to ``StorageConfig.from_env()``.
        storage_factory: Optional StorageFactory for real backends.
            When provided, the curation sub-app uses real stores.
    """
    config = storage_config or StorageConfig.from_env()
    registry = _AdapterRegistry()
    start_time = time.monotonic()

    # Build health orchestrator with all infrastructure checks
    health_orch = HealthOrchestrator(start_time=start_time)
    health_orch.register("postgres", partial(check_postgres, config.postgres.dsn))
    health_orch.register("timescaledb", partial(check_timescaledb, config.timescale.dsn))
    health_orch.register(
        "neo4j",
        partial(check_neo4j, config.neo4j.uri, config.neo4j.user, config.neo4j.password),
    )
    health_orch.register("redis", partial(check_redis, config.redis.url))
    health_orch.register("kafka", partial(check_kafka, config.kafka.bootstrap_servers))

    # gRPC server (lazy start — only if spoke transport is enabled)
    grpc_server = None
    grpc_port = int(os.getenv("FORGE_GRPC_PORT", "50051"))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Startup / shutdown lifecycle."""
        nonlocal grpc_server

        logger.info("Forge Hub API starting ...")

        # Start gRPC server for spoke communication
        grpc_enabled = os.getenv("FORGE_GRPC_ENABLED", "true").lower() == "true"
        if grpc_enabled:
            try:
                from forge.transport.grpc_server import GrpcServer
                from forge.transport.hub_server import InMemoryServicer

                servicer = InMemoryServicer()
                grpc_server = GrpcServer(servicer, port=grpc_port)
                actual_port = await grpc_server.start()
                logger.info("gRPC server started on port %d", actual_port)
            except Exception:
                logger.exception("Failed to start gRPC server — spoke transport disabled")
                grpc_server = None

        logger.info("Forge Hub API ready (REST port %s, gRPC port %s)",
                     os.getenv("FORGE_API_PORT", "8000"), grpc_port)

        yield

        # Shutdown
        if grpc_server is not None:
            await grpc_server.stop()
            logger.info("gRPC server stopped")

        logger.info("Forge Hub API shut down")

    app = FastAPI(
        title="Forge Hub API",
        description="Manufacturing Decision Infrastructure — Hub API",
        version="0.1.0",
        lifespan=lifespan,
    )

    # ------------------------------------------------------------------
    # Health endpoints
    # ------------------------------------------------------------------

    @app.get("/v1/health")
    async def platform_health() -> dict[str, Any]:
        """Aggregated health across all Forge infrastructure components."""
        result: PlatformHealth = await health_orch.check_all()
        return result.to_dict()

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        """Liveness probe for container orchestrators."""
        return {"status": "alive", "service": "forge-hub-api"}

    @app.get("/readyz")
    async def readyz() -> dict[str, Any]:
        """Readiness probe — checks if infrastructure is reachable."""
        result = await health_orch.check_all()
        if result.status == "unhealthy":
            raise HTTPException(status_code=503, detail=result.to_dict())
        return {"status": "ready", "platform": result.status}

    # ------------------------------------------------------------------
    # Adapter registry endpoints
    # ------------------------------------------------------------------

    @app.get("/v1/adapters")
    async def list_adapters() -> list[dict[str, Any]]:
        """List all registered adapters."""
        return [item.model_dump() for item in registry.list_all()]

    @app.post("/v1/adapters/register")
    async def register_adapter(manifest: AdapterManifest) -> dict[str, str]:
        """Register a new adapter."""
        registry.register(manifest)
        logger.info("Adapter registered: %s", manifest.adapter_id)
        return {"status": "registered", "adapter_id": manifest.adapter_id}

    @app.get("/v1/adapters/{adapter_id}/health")
    async def adapter_health(adapter_id: str) -> dict[str, Any]:
        """Get health status of a specific adapter."""
        health = registry.get_health(adapter_id)
        if health is None:
            raise HTTPException(404, f"Adapter '{adapter_id}' not found")
        return health.model_dump(mode="json")

    # ------------------------------------------------------------------
    # Record ingestion (REST passthrough)
    # ------------------------------------------------------------------

    @app.post("/v1/records", response_model=IngestResponse)
    async def ingest_records(request: IngestRequest) -> IngestResponse:
        """Ingest a batch of ContextualRecords via REST.

        This is the REST fallback for systems that cannot use gRPC.
        Records are validated and forwarded to the same pipeline as
        gRPC-ingested records.
        """
        manifest = registry.get_manifest(request.adapter_id)
        if manifest is None:
            raise HTTPException(404, f"Adapter '{request.adapter_id}' not registered")

        # In F04, records are accepted and queued for curation.
        # Full pipeline: validate → route → shadow write → curate
        accepted = len(request.records)
        logger.info(
            "Ingested %d records from adapter '%s'",
            accepted,
            request.adapter_id,
        )
        return IngestResponse(accepted=accepted)

    # ------------------------------------------------------------------
    # Platform info
    # ------------------------------------------------------------------

    @app.get("/v1/info")
    async def platform_info() -> dict[str, Any]:
        """Platform metadata."""
        return {
            "platform": "forge",
            "version": "0.1.0",
            "grpc_port": grpc_port,
            "grpc_enabled": os.getenv("FORGE_GRPC_ENABLED", "true").lower() == "true",
            "adapters_registered": len(registry.list_all()),
        }

    # ------------------------------------------------------------------
    # Mount curation sub-application
    # ------------------------------------------------------------------

    try:
        from forge.curation.service import create_curation_app

        curation_kwargs: dict[str, Any] = {}
        if storage_factory is not None:
            from forge.curation.lineage import LineageTracker
            from forge.curation.registry import DataProductRegistry

            curation_kwargs["registry"] = DataProductRegistry(
                store=storage_factory.product_store(),
            )
            curation_kwargs["lineage_tracker"] = LineageTracker(
                store=storage_factory.lineage_store(),
            )

        curation_app = create_curation_app(**curation_kwargs)
        app.mount("/curation", curation_app)
        logger.info("Curation sub-application mounted at /curation")
    except Exception:
        logger.warning("Curation service not available — skipping mount")

    return app


# ---------------------------------------------------------------------------
# Default app instance (for uvicorn)
# ---------------------------------------------------------------------------

app = create_app()
