"""REST surface of the OT control runtime (FB-065).

Mounted next to the i3X browse API under ``/api/v1/ot``:

    GET  /control/status                      runtime, ingress, engine, CIP and area state
    GET  /control/tags                        writable tags (validator config, review policy)
    GET  /control/writes                      write journal (audit query filters)
    POST /control/writes/stage                step one of a two-step write: review ticket (FB-074)
    POST /control/writes                      commit a write (with its review token when required)
    GET  /control/writes/pending              staged writes awaiting commit (no tokens)
    DELETE /control/writes/stage/{token}      abandon a staged write
    GET  /changeover                          orchestrator snapshot
    GET  /changeover/{area}                   one area's runtime state
    GET  /changeover/{area}/events            orchestration events (newest last)
    POST /changeover/{area}/confirm-start     operator go-ahead (READY_TO_START → PRODUCTION)
    POST /changeover/{area}/retry-recipe      re-run a partial recipe download
    POST /changeover/{area}/resume            act on the current (retained) MES state

The router takes the runtime, or a callable returning it, so it can be
mounted before the adapter has been configured.

Every POST (the writes, the three changeover actions and the connection
restart) requires the hub's ``adapters:write`` scope (the scope that
drives a spoke, FB-063; FB-075 narrows it to ``ot:tag:write``); the GETs
stay open like the rest of the control API (FB-007).  The subject recorded
on a write or a confirm-start is the authenticated hub user; only when the
auth kill-switch is off (``FORGE_AUTH_ENABLED=false``) is the body's
``requestor`` / ``operator_id`` used, and then it is required.  A
non-admin hub user writes as ``OPERATOR``; naming ``ENGINEER`` or
``ADMIN`` needs a hub admin until scoped roles land (D-1, FB-075).
retry-recipe, resume and a connection restart record the hub user as the
actor (``anonymous`` while the kill-switch is off).
"""

from __future__ import annotations

import dataclasses
from collections.abc import Callable
from datetime import datetime  # noqa: TC003 — FastAPI resolves the query type at runtime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from forge.gateway.models import ForgeUser, Role
from forge.gateway.rbac import require_scope
from forge.modules.ot.control.changeover_orchestrator import ChangeoverSequenceError
from forge.modules.ot.control.models import DataType, WriteRequest, WriteRole
from forge.modules.ot.control.runtime import ControlRuntime

RuntimeSource = ControlRuntime | Callable[[], ControlRuntime | None]

#: Hub scope the write endpoints require (FB-063's write scope; FB-075 narrows it).
WRITE_SCOPE = "adapters:write"


class ConfirmStartBody(BaseModel):
    operator_id: str = Field(
        default="",
        description=(
            "Who confirmed the start (sent to the MES as startedBy). Used only when hub "
            "authentication is disabled; otherwise the hub user."
        ),
    )


class WriteBody(BaseModel):
    """An operator write: staged (``/writes/stage``) or committed (``/writes``)."""

    tag_path: str = Field(min_length=1)
    value: Any
    data_type: DataType | None = Field(
        default=None, description="Defaults to the tag's configured write type."
    )
    requestor: str = Field(
        default="",
        description="Used only when hub authentication is disabled; otherwise the hub user.",
    )
    role: WriteRole = WriteRole.OPERATOR
    reason: str = ""
    reason_code: str = Field(default="", description="Required when the tag says so.")
    review_token: str = Field(
        default="", description="From a prior stage; required for two_step_with_review tags."
    )
    area: str = ""
    equipment_id: str = ""


def _actor(user: ForgeUser, supplied: str, field: str) -> str:
    """The acting subject: the hub user, or the body's ``field`` under the kill-switch."""
    if user.source != "bypass":
        return user.user_id
    actor = supplied.strip()
    if not actor:
        raise HTTPException(422, f"{field} is required while hub authentication is disabled")
    return actor


def _subject(user: ForgeUser, body: WriteBody) -> tuple[str, WriteRole]:
    """Who the write is recorded against, and the role it may claim."""
    requestor = _actor(user, body.requestor, "requestor")
    if body.role is not WriteRole.OPERATOR and user.role is not Role.ADMIN:
        raise HTTPException(
            403,
            f"role {body.role.value} needs a hub admin; hub role '{user.role.value}' "
            "writes as OPERATOR (scoped roles: FB-075)",
        )
    return requestor, body.role


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
            {
                **dataclasses.asdict(c),
                "data_type": c.data_type.value,
                "confirmation": c.confirmation.value,
            }
            for c in sorted(configs, key=lambda c: c.tag_path)
        ]

    # -- operator writes (FB-074) ---------------------------------------------

    def _write_request(current: ControlRuntime, body: WriteBody, user: ForgeUser) -> WriteRequest:
        requestor, role = _subject(user, body)
        config = current.validator.get_config(body.tag_path)
        data_type = body.data_type or (config.data_type if config is not None else DataType.FLOAT)
        return WriteRequest(
            tag_path=body.tag_path,
            value=body.value,
            data_type=data_type,
            requestor=requestor,
            role=role,
            reason=body.reason,
            reason_code=body.reason_code,
            review_token=body.review_token,
            area=body.area,
            equipment_id=body.equipment_id,
        )

    @router.post("/control/writes/stage")
    async def stage_write(
        body: WriteBody,
        user: ForgeUser = Depends(require_scope(WRITE_SCOPE)),  # noqa: B008
    ) -> dict[str, Any]:
        """Step one: run the chain, read the current value, issue a review token.

        Returns ``status: STAGED`` with the ticket, or the rejected write
        result (``status: REJECTED_*``) when the chain refused it.
        """
        current = _runtime()
        outcome = await current.engine.stage(_write_request(current, body, user))
        return outcome.to_dict()

    @router.post("/control/writes")
    async def commit_write(
        body: WriteBody,
        user: ForgeUser = Depends(require_scope(WRITE_SCOPE)),  # noqa: B008
    ) -> dict[str, Any]:
        """Execute a write; the result carries every outcome as ``status``."""
        current = _runtime()
        result = await current.engine.execute(_write_request(current, body, user))
        return result.to_dict()

    @router.get("/control/writes/pending")
    async def pending_writes() -> list[dict[str, Any]]:
        return _runtime().engine.reviewer.pending()

    @router.delete("/control/writes/stage/{review_token}")
    async def cancel_staged_write(
        review_token: str,
        _user: ForgeUser = Depends(require_scope(WRITE_SCOPE)),  # noqa: B008
    ) -> dict[str, Any]:
        if not _runtime().engine.reviewer.cancel(review_token):
            raise HTTPException(404, "no staged write with that review token")
        return {"cancelled": True}

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
    async def restart_connection(
        name: str,
        user: ForgeUser = Depends(require_scope(WRITE_SCOPE)),  # noqa: B008
    ) -> dict[str, Any]:
        current = _runtime()
        if current.connections is None:
            raise HTTPException(404, "no PLC connections are configured")
        try:
            return await current.connections.restart(name, requested_by=user.user_id)
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
    async def confirm_start(
        area: str,
        body: ConfirmStartBody,
        user: ForgeUser = Depends(require_scope(WRITE_SCOPE)),  # noqa: B008
    ) -> dict[str, Any]:
        current = _runtime()
        _area(current, area)
        operator_id = _actor(user, body.operator_id, "operator_id")
        try:
            outcome = await _orchestrator(current).confirm_start(area, operator_id)
        except ChangeoverSequenceError as exc:
            raise HTTPException(409, str(exc)) from None
        return outcome.to_dict()

    @router.post("/changeover/{area}/retry-recipe")
    async def retry_recipe(
        area: str,
        user: ForgeUser = Depends(require_scope(WRITE_SCOPE)),  # noqa: B008
    ) -> dict[str, Any]:
        current = _runtime()
        rt = _area(current, area)
        try:
            loaded = await _orchestrator(current).retry_recipe(area, actor=user.user_id)
        except ChangeoverSequenceError as exc:
            raise HTTPException(409, str(exc)) from None
        return {"area": area, "loaded": loaded, "mes_state": rt.mes_state}

    @router.post("/changeover/{area}/resume")
    async def resume(
        area: str,
        user: ForgeUser = Depends(require_scope(WRITE_SCOPE)),  # noqa: B008
    ) -> dict[str, Any]:
        current = _runtime()
        rt = _area(current, area)
        try:
            await _orchestrator(current).resume(area, actor=user.user_id)
        except ChangeoverSequenceError as exc:
            raise HTTPException(409, str(exc)) from None
        return {"area": area, "mes_state": rt.mes_state}

    return router
