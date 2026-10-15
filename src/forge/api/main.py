"""Forge Hub API — unified REST entry point for the platform.

This is the main application that ``docker compose`` runs.  It provides:

    /v1/health          — Aggregated infrastructure health
    /v1/adapters        — Adapter registry and lifecycle
    /v1/records         — Record ingestion (REST passthrough)
    /v1/adapters/{id}/write — Hub → spoke write-back (FB-054)
    /v1/writes          — Write-back targets and counters
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
from forge.ingest import IngestPipeline, build_pipeline_from_storage
from forge.storage.config import StorageConfig
from forge.storage.factory import StorageFactory  # noqa: TC001
from forge.transport.spoke_callback import WriteDispatcher, WriteDispatchError

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
    persisted: int = 0
    errors: list[str] = Field(default_factory=list)


class AdapterListItem(BaseModel):
    adapter_id: str
    name: str
    state: str
    records_collected: int = 0


class WriteRequestModel(BaseModel):
    """One hub → spoke write: a tag path and the value to put there."""

    tag_path: str
    value: Any = None
    confirm: bool = False


class WriteResponseModel(BaseModel):
    adapter_id: str
    tag_path: str
    success: bool
    message: str = ""
    readback: dict[str, Any] | None = None


# HTTP status per WriteDispatchError code.
_WRITE_HTTP_STATUS = {
    "unknown_adapter": 404,
    "no_callback": 409,
    "not_writable": 403,
    "transport": 502,
}


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
    ingest_pipeline: IngestPipeline | None = None,
    write_dispatcher: WriteDispatcher | None = None,
) -> FastAPI:
    """Create the Forge Hub API application.

    Args:
        storage_config: Override for storage configuration.
            Defaults to ``StorageConfig.from_env()``.
        storage_factory: Optional StorageFactory for real backends.
            When provided, the curation sub-app uses real stores.
        ingest_pipeline: Override for the record ingest pipeline. Defaults to
            one built from ``storage_factory`` (or in-memory sinks).
        write_dispatcher: Override for the hub → spoke write dispatcher.
            Defaults to one that dials each spoke's ``grpc_callback_url``
            and consults the registry for ``capabilities.write``.
    """
    config = storage_config or StorageConfig.from_env()
    registry = _AdapterRegistry()
    # One ingest pipeline serves both transports (gRPC Ingest and REST /v1/records).
    if ingest_pipeline is not None:
        pipeline = ingest_pipeline
    elif storage_factory is not None:
        pipeline = build_pipeline_from_storage(storage_factory)
    else:
        pipeline = IngestPipeline()

    def _can_write(adapter_id: str) -> bool | None:
        manifest = registry.get_manifest(adapter_id)
        return None if manifest is None else bool(manifest.capabilities.write)

    dispatcher = (
        write_dispatcher
        if write_dispatcher is not None
        else WriteDispatcher(can_write=_can_write)
    )
    runtime: dict[str, Any] = {}
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
                from forge.transport.hub_ingest import HubIngestServicer

                servicer = HubIngestServicer(
                    pipeline,
                    on_registered=registry.register,
                    on_health=registry.update_health,
                    write_dispatcher=dispatcher,
                )
                runtime["servicer"] = servicer
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
            servicer = runtime.get("servicer")
            if servicer is not None:
                flushed = await servicer.flush_all()
                logger.info("Flushed %d buffered records before shutdown", flushed)
            await grpc_server.stop()
            logger.info("gRPC server stopped")
        await dispatcher.close()

        logger.info("Forge Hub API shut down")

    app = FastAPI(
        title="Forge Hub API",
        description="Manufacturing Decision Infrastructure — Hub API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.ingest_pipeline = pipeline
    app.state.adapter_registry = registry
    app.state.write_dispatcher = dispatcher

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

        records = []
        parse_errors: list[str] = []
        for index, raw in enumerate(request.records):
            try:
                records.append(
                    IngestPipeline.coerce(raw, adapter_id=request.adapter_id, manifest=manifest)
                )
            except Exception as exc:
                parse_errors.append(f"record {index}: {exc}")
        outcome = await pipeline.ingest(
            records, adapter_id=request.adapter_id, manifest=manifest
        )
        logger.info(
            "REST ingest from adapter '%s': %s", request.adapter_id, outcome.summary()
        )
        return IngestResponse(
            accepted=outcome.accepted,
            rejected=outcome.rejected + len(parse_errors),
            persisted=outcome.persisted,
            errors=parse_errors + outcome.errors,
        )

    @app.get("/v1/ingest/stats")
    async def ingest_stats() -> dict[str, Any]:
        """Pipeline counters plus, when the gRPC server runs, per-session state."""
        servicer = runtime.get("servicer")
        return {
            "pipeline": pipeline.describe(),
            "grpc": servicer.snapshot() if servicer is not None else None,
        }

    # ------------------------------------------------------------------
    # Write-back (hub → spoke, FB-054)
    # ------------------------------------------------------------------

    @app.post("/v1/adapters/{adapter_id}/write", response_model=WriteResponseModel)
    async def write_to_adapter(
        adapter_id: str, request: WriteRequestModel
    ) -> WriteResponseModel:
        """Push a value into a spoke's source system through its ``Write`` RPC.

        The spoke must have registered with ``capabilities.write`` and
        advertised ``grpc_callback_url`` on Configure. With ``confirm`` the
        spoke's read-back record is returned.
        """
        try:
            outcome = await dispatcher.write(
                adapter_id, request.tag_path, request.value, confirm=request.confirm
            )
        except WriteDispatchError as exc:
            raise HTTPException(_WRITE_HTTP_STATUS.get(exc.code, 500), exc.message) from exc
        return WriteResponseModel(
            adapter_id=adapter_id,
            tag_path=request.tag_path,
            success=outcome.success,
            message=outcome.message,
            readback=outcome.readback.model_dump(mode="json") if outcome.readback else None,
        )

    @app.get("/v1/adapters/{adapter_id}/tags")
    async def discover_adapter_tags(adapter_id: str) -> dict[str, Any]:
        """Tags the spoke exposes to the hub (its ``Discover`` RPC)."""
        try:
            tags = await dispatcher.discover(adapter_id)
        except WriteDispatchError as exc:
            raise HTTPException(_WRITE_HTTP_STATUS.get(exc.code, 500), exc.message) from exc
        return {"adapter_id": adapter_id, "tags": tags}

    @app.get("/v1/writes")
    async def write_stats() -> dict[str, Any]:
        """Write-back callbacks known to the hub, with per-adapter counters."""
        return dispatcher.snapshot()

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
