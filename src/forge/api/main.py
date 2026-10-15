"""Forge Hub API — unified REST entry point for the platform.

This is the main application that ``docker compose`` runs.  It provides:

    /v1/health          — Aggregated infrastructure health
    /v1/adapters        — Adapter registry and lifecycle (durable, FB-060)
    /v1/ingest/log      — Ingest log (one row per batch, forge_core.records_log)
    /v1/records         — Record ingestion (REST passthrough)
    /v1/adapters/{id}/write — Hub → spoke write-back (FB-054)
    /v1/adapters/{id}/backfill, /subscriptions — pull from the spoke (FB-061)
    /v1/writes          — Write-back targets and counters
    /api/v1/ot/...      — OT module control + i3X browse (FORGE_OT_CONTROL_CONFIG, FB-065)
    /curation/...       — Curation sub-app (products, lineage, quality)

The gRPC server for spoke communication runs on a separate port
(default 50051) but is started/stopped by the same lifecycle.
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime  # noqa: TC003 — pydantic field type
from functools import partial
from typing import Any

from fastapi import FastAPI, HTTPException, Query
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
from forge.api.registry import AdapterRegistry
from forge.core.models.adapter import (
    AdapterManifest,  # noqa: TC001 — FastAPI resolves these at runtime
)
from forge.ingest import IngestPipeline, build_pipeline_from_storage
from forge.storage.adapter_registry import AdapterRegistryStore  # noqa: TC001
from forge.storage.config import StorageConfig
from forge.storage.factory import StorageFactory  # noqa: TC001
from forge.transport.spoke_callback import WriteDispatcher, WriteDispatchError
from forge.transport.spoke_pull import SubscriptionManager, backfill_into_pipeline

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


class BackfillRequestModel(BaseModel):
    """Replay a time range from a spoke into the ingest pipeline (FB-061)."""

    start_time: datetime
    end_time: datetime
    tags: list[str] = Field(default_factory=list)
    max_records: int = Field(default=0, ge=0)
    batch_size: int = Field(default=100, ge=1, le=10_000)


class SubscribeRequestModel(BaseModel):
    """Open a spoke subscription that streams into the ingest pipeline (FB-061)."""

    tags: list[str] = Field(default_factory=list)


# HTTP status per WriteDispatchError code.
_WRITE_HTTP_STATUS = {
    "unknown_adapter": 404,
    "no_callback": 409,
    "not_writable": 403,
    "transport": 502,
}


# Backwards-compatible name for the registry (now durable, FB-060).
_AdapterRegistry = AdapterRegistry


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------


def create_app(
    storage_config: StorageConfig | None = None,
    storage_factory: StorageFactory | None = None,
    ingest_pipeline: IngestPipeline | None = None,
    write_dispatcher: WriteDispatcher | None = None,
    adapter_registry_store: AdapterRegistryStore | None = None,
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
        adapter_registry_store: Where registrations, heartbeats and the
            ingest log are persisted (FB-060). Defaults to the storage
            factory's PostgreSQL store, or in-memory without one.
    """
    config = storage_config or StorageConfig.from_env()
    store = adapter_registry_store
    if store is None and storage_factory is not None:
        store = storage_factory.adapter_registry_store()
    registry = AdapterRegistry(store=store)
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
    # Spoke subscriptions streaming into the pipeline (FB-061).
    subscriptions = SubscriptionManager(
        dispatcher, pipeline, manifest_for=registry.get_manifest, on_batch=registry.log_batch
    )

    # OT module hosted in-process (FB-065) when a control config is named.
    ot_host = None
    ot_config_path = os.getenv("FORGE_OT_CONTROL_CONFIG", "").strip()
    if ot_config_path:
        from forge.modules.ot.host import OTModuleHost

        ot_host = OTModuleHost(
            config_path=ot_config_path,
            tags_dir=os.getenv("FORGE_OT_TAGS_DIR", "").strip() or None,
            write_dispatcher=dispatcher,
            record_sink=pipeline,
        )
        registry.register(ot_host.adapter.manifest)

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

        # Durable registry (FB-060): restore spokes seen before, persist what
        # was registered while building the app (hosted OT module).
        restored = await registry.load()
        await registry.flush()
        logger.info(
            "Adapter registry: %d restored, store=%s", restored, registry.describe()["store"]
        )

        # Start gRPC server for spoke communication
        grpc_enabled = os.getenv("FORGE_GRPC_ENABLED", "true").lower() == "true"
        if grpc_enabled:
            try:
                from forge.transport.grpc_server import GrpcServer
                from forge.transport.hub_ingest import HubIngestServicer

                servicer = HubIngestServicer(
                    pipeline,
                    on_registered=registry.registered,
                    on_health=registry.health_reported,
                    write_dispatcher=dispatcher,
                    ingest_log=registry.log_batch,
                )
                runtime["servicer"] = servicer
                grpc_server = GrpcServer(servicer, port=grpc_port)
                actual_port = await grpc_server.start()
                logger.info("gRPC server started on port %d", actual_port)
            except Exception:
                logger.exception("Failed to start gRPC server — spoke transport disabled")
                grpc_server = None

        if ot_host is not None:
            await ot_host.start()
            logger.info("OT module hosted in-process (config %s)", ot_host.config_path)

        logger.info("Forge Hub API ready (REST port %s, gRPC port %s)",
                     os.getenv("FORGE_API_PORT", "8000"), grpc_port)

        yield

        # Shutdown
        if ot_host is not None:
            await ot_host.stop()
        if grpc_server is not None:
            servicer = runtime.get("servicer")
            if servicer is not None:
                flushed = await servicer.flush_all()
                logger.info("Flushed %d buffered records before shutdown", flushed)
            await grpc_server.stop()
            logger.info("gRPC server stopped")
        await subscriptions.close()
        await dispatcher.close()
        await registry.flush()

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
    app.state.subscriptions = subscriptions
    app.state.ot_module = None
    if ot_host is not None:
        ot_host.mount(app)

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
        """Register a new adapter (persisted, FB-060)."""
        await registry.registered(manifest)
        logger.info("Adapter registered: %s", manifest.adapter_id)
        return {"status": "registered", "adapter_id": manifest.adapter_id}

    @app.get("/v1/adapters/{adapter_id}/health")
    async def adapter_health(adapter_id: str) -> dict[str, Any]:
        """Get health status of a specific adapter."""
        health = registry.get_health(adapter_id)
        if health is None:
            raise HTTPException(404, f"Adapter '{adapter_id}' not found")
        return health.model_dump(mode="json")

    @app.get("/v1/adapters/{adapter_id}/ingest-log")
    async def adapter_ingest_log(
        adapter_id: str, limit: int = Query(default=100, ge=1, le=1000)
    ) -> list[dict[str, Any]]:
        """Batches ingested from one adapter, newest first (``forge_core.records_log``)."""
        if registry.get_manifest(adapter_id) is None:
            raise HTTPException(404, f"Adapter '{adapter_id}' not found")
        return await registry.ingest_log(adapter_id, limit=limit)

    @app.get("/v1/ingest/log")
    async def ingest_log(
        adapter_id: str | None = None, limit: int = Query(default=100, ge=1, le=1000)
    ) -> list[dict[str, Any]]:
        """The ingest log across adapters, newest first."""
        return await registry.ingest_log(adapter_id, limit=limit)

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
        if outcome.received or parse_errors:
            await registry.log_batch(request.adapter_id, "rest", outcome)
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
    # Pull RPCs on the spoke: backfill + subscriptions (FB-061)
    # ------------------------------------------------------------------

    @app.post("/v1/adapters/{adapter_id}/backfill")
    async def backfill_adapter(adapter_id: str, request: BackfillRequestModel) -> dict[str, Any]:
        """Replay ``[start_time, end_time]`` from the spoke into the pipeline.

        Each batch is ingested like a pushed one and logged under session
        ``backfill``. Returns the totals; records already ingested stay
        ingested when the stream fails part-way.
        """
        manifest = registry.get_manifest(adapter_id)
        if manifest is None:
            raise HTTPException(404, f"Adapter '{adapter_id}' not registered")
        if request.end_time < request.start_time:
            raise HTTPException(422, "end_time must not be before start_time")
        try:
            outcome = await backfill_into_pipeline(
                dispatcher,
                pipeline,
                adapter_id=adapter_id,
                start=request.start_time,
                end=request.end_time,
                tags=request.tags,
                max_records=request.max_records,
                manifest=manifest,
                batch_size=request.batch_size,
                on_batch=registry.log_batch,
            )
        except WriteDispatchError as exc:
            raise HTTPException(_WRITE_HTTP_STATUS.get(exc.code, 500), exc.message) from exc
        return outcome.to_dict()

    @app.post("/v1/adapters/{adapter_id}/subscriptions")
    async def open_subscription(
        adapter_id: str, request: SubscribeRequestModel
    ) -> dict[str, Any]:
        """Subscribe to the spoke's record stream; records flow into the pipeline."""
        if registry.get_manifest(adapter_id) is None:
            raise HTTPException(404, f"Adapter '{adapter_id}' not registered")
        try:
            handle = await subscriptions.start(adapter_id, request.tags)
        except WriteDispatchError as exc:
            raise HTTPException(_WRITE_HTTP_STATUS.get(exc.code, 500), exc.message) from exc
        return handle.to_dict()

    @app.get("/v1/adapters/{adapter_id}/subscriptions")
    async def list_subscriptions(adapter_id: str) -> list[dict[str, Any]]:
        return [h.to_dict() for h in subscriptions.list(adapter_id)]

    @app.delete("/v1/adapters/{adapter_id}/subscriptions/{subscription_id}")
    async def close_subscription(adapter_id: str, subscription_id: str) -> dict[str, Any]:
        """Unsubscribe at the spoke and stop ingesting; flushes what is buffered."""
        try:
            handle = await subscriptions.stop(adapter_id, subscription_id)
        except KeyError as exc:
            raise HTTPException(404, str(exc.args[0] if exc.args else exc)) from None
        return handle.to_dict()

    @app.get("/v1/subscriptions")
    async def all_subscriptions() -> dict[str, Any]:
        return subscriptions.snapshot()

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
            "adapter_registry": registry.describe(),
            "ot_module": ot_host.status() if ot_host is not None else None,
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
