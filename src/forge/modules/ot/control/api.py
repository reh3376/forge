"""REST surface of the OT control runtime (FB-065).

Mounted next to the i3X browse API under ``/api/v1/ot``:

    GET  /control/status                      runtime, ingress, engine, CIP and area state
    GET  /control/tags                        writable tags (validator config)
    GET  /control/writes                      write journal (audit query filters)
    GET  /changeover                          orchestrator snapshot
    GET  /changeover/{area}                   one area's runtime state
    GET  /changeover/{area}/events            orchestration events (newest last)
    POST /changeover/{area}/confirm-start     operator go-ahead (READY_TO_START → PRODUCTION)
    POST /changeover/{area}/retry-recipe      re-run a partial recipe download
    POST /changeover/{area}/resume            act on the current (retained) MES state

The router takes the runtime, or a callable returning it, so it can be
mounted before the adapter has been configured.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Callable
from datetime import datetime  # noqa: TC003 — FastAPI resolves the query type at runtime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from forge.modules.ot.control.changeover_orchestrator import ChangeoverSequenceError
from forge.modules.ot.control.runtime import ControlRuntime

RuntimeSource = ControlRuntime | Callable[[], ControlRuntime | None]


class ConfirmStartBody(BaseModel):
    operator_id: str = Field(
        min_length=1, description="Who confirmed the start (recorded on the MES)."
    )


def create_control_router(runtime: RuntimeSource, *, prefix: str = "/api/v1/ot") -> APIRouter:
    router = APIRouter(prefix=prefix, tags=["OT Control"])

    def _runtime() -> ControlRuntime:
        current = runtime() if callable(runtime) else runtime
        if current is None:
            raise HTTPException(503, "OT control runtime is not configured")
        return current

    def _orchestrator(current: ControlRuntime) -> Any:
        if current.orchestrator is None:
            raise HTTPException(
                503, "changeover orchestration is not configured (no changeover_areas)"
            )
        return current.orchestrator

    def _area(current: ControlRuntime, area: str) -> Any:
        try:
            return _orchestrator(current).area(area)
        except KeyError as exc:
            raise HTTPException(404, str(exc.args[0] if exc.args else exc)) from None

    # -- control --------------------------------------------------------------

    @router.get("/control/status")
    async def control_status() -> dict[str, Any]:
        return _runtime().status()

    @router.get("/control/tags")
    async def control_tags() -> list[dict[str, Any]]:
        configs = _runtime().validator.get_all_configs()
        return [
            {**dataclasses.asdict(c), "data_type": c.data_type.value}
            for c in sorted(configs, key=lambda c: c.tag_path)
        ]

    @router.get("/control/writes")
    async def control_writes(
        limit: int = Query(default=100, ge=1, le=1000),
        tag_path: str | None = None,
        requestor: str | None = None,
        status: str | None = None,
        area: str | None = None,
        since: datetime | None = None,
    ) -> list[dict[str, Any]]:
        return _runtime().audit_query.query(
            limit=limit,
            tag_path=tag_path,
            requestor=requestor,
            status=status,
            area=area,
            since=since,
        )

    # -- PLC connections (FB-069) ---------------------------------------------

    @router.get("/control/connections")
    async def control_connections() -> dict[str, Any]:
        current = _runtime()
        if current.connections is None:
            return {
                "started": False,
                "supervisor": None,
                "total": 0,
                "connected": 0,
                "connections": {},
            }
        return current.connections.status()

    @router.post("/control/connections/{name}/restart")
    async def restart_connection(name: str) -> dict[str, Any]:
        current = _runtime()
        if current.connections is None:
            raise HTTPException(404, "no PLC connections are configured")
        try:
            return await current.connections.restart(name)
        except KeyError as exc:
            raise HTTPException(404, str(exc.args[0] if exc.args else exc)) from None

    # -- changeover -----------------------------------------------------------

    @router.get("/changeover")
    async def changeover_snapshot() -> dict[str, Any]:
        return _orchestrator(_runtime()).snapshot()

    @router.get("/changeover/{area}")
    async def changeover_area(area: str) -> dict[str, Any]:
        return _area(_runtime(), area).to_dict()

    @router.get("/changeover/{area}/events")
    async def changeover_events(area: str) -> list[dict[str, Any]]:
        current = _runtime()
        _area(current, area)
        return [event.to_dict() for event in _orchestrator(current).events(area)]

    @router.post("/changeover/{area}/confirm-start")
    async def confirm_start(area: str, body: ConfirmStartBody) -> dict[str, Any]:
        current = _runtime()
        _area(current, area)
        try:
            outcome = await _orchestrator(current).confirm_start(area, body.operator_id)
        except ChangeoverSequenceError as exc:
            raise HTTPException(409, str(exc)) from None
        return outcome.to_dict()

    @router.post("/changeover/{area}/retry-recipe")
    async def retry_recipe(area: str) -> dict[str, Any]:
        current = _runtime()
        rt = _area(current, area)
        try:
            loaded = await _orchestrator(current).retry_recipe(area)
        except ChangeoverSequenceError as exc:
            raise HTTPException(409, str(exc)) from None
        return {"area": area, "loaded": loaded, "mes_state": rt.mes_state}

    @router.post("/changeover/{area}/resume")
    async def resume(area: str) -> dict[str, Any]:
        current = _runtime()
        rt = _area(current, area)
        try:
            await _orchestrator(current).resume(area)
        except ChangeoverSequenceError as exc:
            raise HTTPException(409, str(exc)) from None
        return {"area": area, "mes_state": rt.mes_state}

    return router
