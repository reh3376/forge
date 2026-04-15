"""forge-context FastAPI service — Context Engine REST API.

Endpoints:
    POST   /v1/context/enrich              — Enrich a record's context
    POST   /v1/context/equipment           — Register equipment
    GET    /v1/context/equipment           — List equipment by site
    GET    /v1/context/equipment/{id}      — Get equipment by ID
    DELETE /v1/context/equipment/{id}      — Delete equipment
    GET    /v1/context/equipment/{id}/children — Get child equipment
    POST   /v1/context/batches             — Register a batch
    GET    /v1/context/batches/active       — List active batches
    POST   /v1/context/batches/{id}/complete — Complete a batch
    POST   /v1/context/modes               — Set equipment mode
    GET    /v1/context/modes/{equipment_id} — Get equipment mode
    POST   /v1/context/shifts/resolve       — Resolve shift for timestamp
"""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 — Pydantic models need runtime access
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from forge.context.batch import BatchStore, InMemoryBatchStore
from forge.context.enrichment import ContextEnricher
from forge.context.equipment import EquipmentStore, InMemoryEquipmentStore
from forge.context.mode import InMemoryModeStore, ModeStore
from forge.context.models import (
    Batch,
    Equipment,
    EquipmentStatus,
    ModeState,
    OperatingMode,
    ShiftSchedule,
)
from forge.context.shift import build_louisville_schedule, resolve_shift
from forge.core.models.contextual_record import RecordContext

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class EnrichRequest(BaseModel):
    """Request to enrich a record's context."""

    equipment_id: str | None = None
    area: str | None = None
    site: str | None = None
    batch_id: str | None = None
    lot_id: str | None = None
    recipe_id: str | None = None
    operating_mode: str | None = None
    shift: str | None = None
    operator_id: str | None = None
    source_time: datetime | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class EnrichResponse(BaseModel):
    """Response from context enrichment."""

    equipment_id: str | None = None
    area: str | None = None
    site: str | None = None
    batch_id: str | None = None
    lot_id: str | None = None
    recipe_id: str | None = None
    operating_mode: str | None = None
    shift: str | None = None
    operator_id: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)
    fields_added: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class EquipmentRequest(BaseModel):
    """Request to register equipment."""

    equipment_id: str
    name: str
    site: str
    area: str = ""
    parent_id: str | None = None
    equipment_type: str = ""
    status: str = "active"
    attributes: dict[str, Any] = Field(default_factory=dict)


class EquipmentResponse(BaseModel):
    """Equipment response."""

    equipment_id: str
    name: str
    site: str
    area: str
    parent_id: str | None
    equipment_type: str
    status: str
    attributes: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class BatchRequest(BaseModel):
    """Request to register a batch."""

    batch_id: str
    equipment_id: str
    recipe_id: str = ""
    lot_id: str = ""
    material_ids: list[str] = Field(default_factory=list)
    attributes: dict[str, Any] = Field(default_factory=dict)


class BatchResponse(BaseModel):
    """Batch response."""

    batch_id: str
    equipment_id: str
    recipe_id: str
    lot_id: str
    status: str
    started_at: datetime
    ended_at: datetime | None
    material_ids: list[str]


class ModeRequest(BaseModel):
    """Request to set equipment operating mode."""

    equipment_id: str
    mode: str
    source: str = "manual"


class ModeResponse(BaseModel):
    """Operating mode response."""

    equipment_id: str
    mode: str
    since: datetime
    source: str


class ShiftResolveRequest(BaseModel):
    """Request to resolve shift for a timestamp."""

    timestamp: datetime
    site: str = "WHK-Main"


class ShiftResolveResponse(BaseModel):
    """Shift resolution response."""

    shift: str | None
    site: str
    timestamp: datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _equipment_to_response(e: Equipment) -> EquipmentResponse:
    return EquipmentResponse(
        equipment_id=e.equipment_id,
        name=e.name,
        site=e.site,
        area=e.area,
        parent_id=e.parent_id,
        equipment_type=e.equipment_type,
        status=e.status.value,
        attributes=e.attributes,
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


def _batch_to_response(b: Batch) -> BatchResponse:
    return BatchResponse(
        batch_id=b.batch_id,
        equipment_id=b.equipment_id,
        recipe_id=b.recipe_id,
        lot_id=b.lot_id,
        status=b.status.value,
        started_at=b.started_at,
        ended_at=b.ended_at,
        material_ids=b.material_ids,
    )


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def create_context_app(
    equipment_store: EquipmentStore | None = None,
    batch_store: BatchStore | None = None,
    mode_store: ModeStore | None = None,
    shift_schedule: ShiftSchedule | None = None,
) -> FastAPI:
    """Create the Context Engine FastAPI application."""
    _equipment: EquipmentStore = equipment_store or InMemoryEquipmentStore()
    _batches: BatchStore = batch_store or InMemoryBatchStore()
    _modes: ModeStore = mode_store or InMemoryModeStore()
    _schedule: ShiftSchedule = shift_schedule or build_louisville_schedule()

    _enricher = ContextEnricher(_equipment, _batches, _modes, _schedule)

    app = FastAPI(
        title="Forge Context Engine",
        description="F21 — Context Engine Service for Forge",
        version="0.1.0",
    )

    # -- Enrich --------------------------------------------------------------

    @app.post("/v1/context/enrich", response_model=EnrichResponse)
    async def enrich_context(req: EnrichRequest) -> EnrichResponse:
        context = RecordContext(
            equipment_id=req.equipment_id,
            area=req.area,
            site=req.site,
            batch_id=req.batch_id,
            lot_id=req.lot_id,
            recipe_id=req.recipe_id,
            operating_mode=req.operating_mode,
            shift=req.shift,
            operator_id=req.operator_id,
            extra=req.extra,
        )
        result = await _enricher.enrich(context, source_time=req.source_time)
        ctx = result.context
        return EnrichResponse(
            equipment_id=ctx.equipment_id,
            area=ctx.area,
            site=ctx.site,
            batch_id=ctx.batch_id,
            lot_id=ctx.lot_id,
            recipe_id=ctx.recipe_id,
            operating_mode=ctx.operating_mode,
            shift=ctx.shift,
            operator_id=ctx.operator_id,
            extra=ctx.extra,
            fields_added=result.fields_added,
            warnings=result.warnings,
        )

    # -- Equipment CRUD ------------------------------------------------------

    @app.post(
        "/v1/context/equipment",
        response_model=EquipmentResponse,
        status_code=201,
    )
    async def register_equipment(req: EquipmentRequest) -> EquipmentResponse:
        eq = Equipment(
            equipment_id=req.equipment_id,
            name=req.name,
            site=req.site,
            area=req.area,
            parent_id=req.parent_id,
            equipment_type=req.equipment_type,
            status=EquipmentStatus(req.status),
            attributes=req.attributes,
        )
        await _equipment.save(eq)
        return _equipment_to_response(eq)

    @app.get("/v1/context/equipment", response_model=list[EquipmentResponse])
    async def list_equipment(
        site: str = Query(...),
        area: str | None = Query(None),
    ) -> list[EquipmentResponse]:
        if area:
            results = await _equipment.list_by_area(site, area)
        else:
            results = await _equipment.list_by_site(site)
        return [_equipment_to_response(e) for e in results]

    @app.get(
        "/v1/context/equipment/{equipment_id}/children",
        response_model=list[EquipmentResponse],
    )
    async def get_equipment_children(
        equipment_id: str,
    ) -> list[EquipmentResponse]:
        children = await _equipment.get_children(equipment_id)
        return [_equipment_to_response(c) for c in children]

    @app.get(
        "/v1/context/equipment/{equipment_id}",
        response_model=EquipmentResponse,
    )
    async def get_equipment(equipment_id: str) -> EquipmentResponse:
        eq = await _equipment.get(equipment_id)
        if eq is None:
            raise HTTPException(404, f"Equipment '{equipment_id}' not found")
        return _equipment_to_response(eq)

    @app.delete("/v1/context/equipment/{equipment_id}", status_code=204)
    async def delete_equipment(equipment_id: str) -> None:
        deleted = await _equipment.delete(equipment_id)
        if not deleted:
            raise HTTPException(404, f"Equipment '{equipment_id}' not found")

    # -- Batch CRUD ----------------------------------------------------------

    @app.post(
        "/v1/context/batches",
        response_model=BatchResponse,
        status_code=201,
    )
    async def register_batch(req: BatchRequest) -> BatchResponse:
        batch = Batch(
            batch_id=req.batch_id,
            equipment_id=req.equipment_id,
            recipe_id=req.recipe_id,
            lot_id=req.lot_id,
            material_ids=req.material_ids,
            attributes=req.attributes,
        )
        await _batches.save(batch)
        return _batch_to_response(batch)

    @app.get("/v1/context/batches/active", response_model=list[BatchResponse])
    async def list_active_batches() -> list[BatchResponse]:
        batches = await _batches.list_active()
        return [_batch_to_response(b) for b in batches]

    @app.post("/v1/context/batches/{batch_id}/complete", status_code=200)
    async def complete_batch(batch_id: str) -> BatchResponse:
        success = await _batches.complete(batch_id)
        if not success:
            raise HTTPException(404, f"Batch '{batch_id}' not found")
        batch = await _batches.get(batch_id)
        if batch is None:
            raise HTTPException(404, f"Batch '{batch_id}' not found")
        return _batch_to_response(batch)

    # -- Mode ----------------------------------------------------------------

    @app.post(
        "/v1/context/modes",
        response_model=ModeResponse,
        status_code=201,
    )
    async def set_mode(req: ModeRequest) -> ModeResponse:
        state = ModeState(
            equipment_id=req.equipment_id,
            mode=OperatingMode(req.mode),
            source=req.source,
        )
        await _modes.set_mode(state)
        return ModeResponse(
            equipment_id=state.equipment_id,
            mode=state.mode.value,
            since=state.since,
            source=state.source,
        )

    @app.get(
        "/v1/context/modes/{equipment_id}",
        response_model=ModeResponse,
    )
    async def get_mode(equipment_id: str) -> ModeResponse:
        state = await _modes.get_mode(equipment_id)
        if state is None:
            raise HTTPException(
                404, f"No mode set for equipment '{equipment_id}'"
            )
        return ModeResponse(
            equipment_id=state.equipment_id,
            mode=state.mode.value,
            since=state.since,
            source=state.source,
        )

    # -- Shift ---------------------------------------------------------------

    @app.post(
        "/v1/context/shifts/resolve",
        response_model=ShiftResolveResponse,
    )
    async def resolve_shift_endpoint(
        req: ShiftResolveRequest,
    ) -> ShiftResolveResponse:
        shift_name = resolve_shift(_schedule, req.timestamp)
        return ShiftResolveResponse(
            shift=shift_name,
            site=req.site,
            timestamp=req.timestamp,
        )

    return app
