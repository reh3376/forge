"""forge-registry FastAPI service — Schema Registry REST API.

``build_registry_router`` builds the routes once; the hub app includes them
(FB-001) and ``create_registry_app`` wraps the same router as a standalone
service.  Routes that change state (register, add version, delete) take the
``write_dependencies`` the caller passes — the hub passes its
``schemas:write`` scope check, the standalone app passes none.

Endpoints:
    POST   /v1/schemas                       — Register a new schema
    GET    /v1/schemas                       — List schemas (with filters)
    GET    /v1/schemas/{schema_id}           — Get schema by ID
    DELETE /v1/schemas/{schema_id}           — Delete a schema
    POST   /v1/schemas/{schema_id}/versions  — Add a new version
    GET    /v1/schemas/{schema_id}/versions  — List all versions
    GET    /v1/schemas/{schema_id}/versions/{version} — Get specific version
    POST   /v1/schemas/{schema_id}/compatibility — Check compatibility
    GET    /v1/schemas/{schema_id}/diff/{from}/{to} — Diff two versions

The JSON Schema document travels as ``schema_json`` on the wire (requests and
responses); the attribute on the request/response models is
``schema_document``, because ``schema_json`` is a (deprecated) method of
``pydantic.BaseModel`` and a field of that name shadows it (FB-095, as FB-086
did for ``DataProduct.schema``).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator

from forge.core.schema_ref import require_schema_id
from forge.registry.compatibility import (
    CompatibilityResult,
    check_compatibility,
    compute_diff,
)
from forge.registry.models import CompatibilityMode, SchemaMetadata, SchemaType
from forge.registry.store import InMemorySchemaStore, SchemaStore

if TYPE_CHECKING:
    from collections.abc import Sequence

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

#: ``schema_document`` is read and written as ``schema_json`` (FB-095).
_WIRE_NAMES = ConfigDict(validate_by_name=True, validate_by_alias=True, serialize_by_alias=True)
_SCHEMA_DOCUMENT = "The JSON Schema document (``schema_json`` on the wire)."


class RegisterSchemaRequest(BaseModel):
    """Request to register a new schema."""

    model_config = _WIRE_NAMES

    schema_id: str = Field(description="forge://schemas/<spoke>/<Entity> (FB-008).")
    name: str
    schema_type: SchemaType
    schema_document: dict[str, Any] = Field(alias="schema_json", description=_SCHEMA_DOCUMENT)
    compatibility: CompatibilityMode = CompatibilityMode.BACKWARD
    owner: str = ""
    description: str = ""
    tags: list[str] = Field(default_factory=list)

    @field_validator("schema_id")
    @classmethod
    def _schema_id_is_a_schema_id(cls, value: str) -> str:
        return require_schema_id(value)


class SchemaVersionResponse(BaseModel):
    """Response for a single schema version."""

    model_config = _WIRE_NAMES

    version: int
    integrity_hash: str
    description: str = ""
    previous_version: int | None = None
    created_at: datetime
    schema_document: dict[str, Any] = Field(
        default_factory=dict, alias="schema_json", description=_SCHEMA_DOCUMENT
    )


class SchemaResponse(BaseModel):
    """Response for a schema with all its versions."""

    schema_id: str
    name: str
    schema_type: str
    compatibility: str
    latest_version: int
    owner: str
    description: str
    tags: list[str]
    status: str
    versions: list[SchemaVersionResponse]
    created_at: datetime
    updated_at: datetime


class SchemaListResponse(BaseModel):
    """Paginated list of schemas."""

    schemas: list[SchemaResponse]
    total: int


class AddVersionRequest(BaseModel):
    """Request to add a new version to an existing schema."""

    model_config = _WIRE_NAMES

    schema_document: dict[str, Any] = Field(alias="schema_json", description=_SCHEMA_DOCUMENT)
    description: str = ""
    check_compatibility: bool = True


class CompatibilityCheckRequest(BaseModel):
    """Request to check compatibility of a proposed schema."""

    model_config = _WIRE_NAMES

    schema_document: dict[str, Any] = Field(alias="schema_json", description=_SCHEMA_DOCUMENT)
    mode: CompatibilityMode | None = None  # defaults to schema's configured mode


class CompatibilityCheckResponse(BaseModel):
    """Response from a compatibility check."""

    compatible: bool
    mode: str
    diffs: list[dict[str, Any]] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class DiffResponse(BaseModel):
    """Response for a version diff."""

    from_version: int
    to_version: int
    diffs: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _metadata_to_response(m: SchemaMetadata) -> SchemaResponse:
    return SchemaResponse(
        schema_id=m.schema_id,
        name=m.name,
        schema_type=m.schema_type.value,
        compatibility=m.compatibility.value,
        latest_version=m.latest_version,
        owner=m.owner,
        description=m.description,
        tags=m.tags,
        status=m.status,
        versions=[
            SchemaVersionResponse(
                version=v.version,
                integrity_hash=v.integrity_hash,
                description=v.description,
                previous_version=v.previous_version,
                created_at=v.created_at,
                schema_document=v.schema_json,
            )
            for v in m.versions
        ],
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _compat_to_response(r: CompatibilityResult) -> CompatibilityCheckResponse:
    return CompatibilityCheckResponse(
        compatible=r.compatible,
        mode=r.mode.value,
        diffs=[
            {
                "field_path": d.field_path,
                "change_type": d.change_type,
                "old_value": d.old_value,
                "new_value": d.new_value,
                "description": d.description,
            }
            for d in r.diffs
        ],
        errors=r.errors,
    )


# ---------------------------------------------------------------------------
# Router and app factories
# ---------------------------------------------------------------------------


def build_registry_router(
    store: SchemaStore | None = None,
    *,
    write_dependencies: Sequence[Any] | None = None,
) -> APIRouter:
    """Build the Schema Registry routes over ``store``.

    ``store`` falls back to ``InMemorySchemaStore``.  ``write_dependencies``
    (FastAPI ``Depends(...)`` objects) guard register, add-version and
    delete; reads, compatibility checks and diffs stay open to any
    authenticated caller.
    """
    _store: SchemaStore = store or InMemorySchemaStore()
    write = list(write_dependencies or ())

    router = APIRouter(tags=["schemas"])

    # -- Register a new schema -----------------------------------------------

    @router.post("/v1/schemas", response_model=SchemaResponse, status_code=201, dependencies=write)
    async def register_schema(req: RegisterSchemaRequest) -> SchemaResponse:
        existing = await _store.get(req.schema_id)
        if existing is not None:
            raise HTTPException(409, f"Schema '{req.schema_id}' already exists")

        metadata = SchemaMetadata(
            schema_id=req.schema_id,
            name=req.name,
            schema_type=req.schema_type,
            compatibility=req.compatibility,
            owner=req.owner,
            description=req.description,
            tags=req.tags,
        )
        metadata.add_version(req.schema_document, description="Initial version")
        await _store.save(metadata)
        return _metadata_to_response(metadata)

    # -- List schemas --------------------------------------------------------

    @router.get("/v1/schemas", response_model=SchemaListResponse)
    async def list_schemas(
        schema_type: str | None = Query(None),
        status: str | None = Query(None),
        owner: str | None = Query(None),
        limit: int = Query(100, ge=1, le=1000),
        offset: int = Query(0, ge=0),
    ) -> SchemaListResponse:
        schemas = await _store.list_all(
            schema_type=schema_type,
            status=status,
            owner=owner,
            limit=limit,
            offset=offset,
        )
        total = await _store.count()
        return SchemaListResponse(
            schemas=[_metadata_to_response(s) for s in schemas],
            total=total,
        )

    # NOTE: Sub-path routes (versions, compatibility, diff) MUST be
    # registered before the greedy {schema_id:path} GET/DELETE routes,
    # otherwise the :path converter will consume the trailing segments.

    # -- Add a new version ---------------------------------------------------

    @router.post(
        "/v1/schemas/{schema_id:path}/versions",
        response_model=SchemaVersionResponse,
        status_code=201,
        dependencies=write,
    )
    async def add_version(schema_id: str, req: AddVersionRequest) -> SchemaVersionResponse:
        metadata = await _store.get(schema_id)
        if metadata is None:
            raise HTTPException(404, f"Schema '{schema_id}' not found")

        # Compatibility check against latest version
        if req.check_compatibility and metadata.latest_version > 0:
            latest = metadata.get_latest()
            if latest is not None:
                result = check_compatibility(
                    latest.schema_json, req.schema_document, metadata.compatibility
                )
                if not result.compatible:
                    raise HTTPException(
                        409,
                        {
                            "message": "Schema is not compatible",
                            "mode": metadata.compatibility.value,
                            "errors": result.errors,
                        },
                    )

        version = metadata.add_version(req.schema_document, description=req.description)
        await _store.save(metadata)
        return SchemaVersionResponse(
            version=version.version,
            integrity_hash=version.integrity_hash,
            description=version.description,
            previous_version=version.previous_version,
            created_at=version.created_at,
            schema_document=version.schema_json,
        )

    # -- List versions -------------------------------------------------------

    @router.get(
        "/v1/schemas/{schema_id:path}/versions",
        response_model=list[SchemaVersionResponse],
    )
    async def list_versions(schema_id: str) -> list[SchemaVersionResponse]:
        metadata = await _store.get(schema_id)
        if metadata is None:
            raise HTTPException(404, f"Schema '{schema_id}' not found")
        return [
            SchemaVersionResponse(
                version=v.version,
                integrity_hash=v.integrity_hash,
                description=v.description,
                previous_version=v.previous_version,
                created_at=v.created_at,
                schema_document=v.schema_json,
            )
            for v in metadata.versions
        ]

    # -- Get specific version ------------------------------------------------

    @router.get(
        "/v1/schemas/{schema_id:path}/versions/{version}",
        response_model=SchemaVersionResponse,
    )
    async def get_version(schema_id: str, version: int) -> SchemaVersionResponse:
        metadata = await _store.get(schema_id)
        if metadata is None:
            raise HTTPException(404, f"Schema '{schema_id}' not found")
        v = metadata.get_version(version)
        if v is None:
            raise HTTPException(404, f"Version {version} not found")
        return SchemaVersionResponse(
            version=v.version,
            integrity_hash=v.integrity_hash,
            description=v.description,
            previous_version=v.previous_version,
            created_at=v.created_at,
            schema_document=v.schema_json,
        )

    # -- Compatibility check -------------------------------------------------

    @router.post(
        "/v1/schemas/{schema_id:path}/compatibility",
        response_model=CompatibilityCheckResponse,
    )
    async def check_schema_compatibility(
        schema_id: str,
        req: CompatibilityCheckRequest,
    ) -> CompatibilityCheckResponse:
        metadata = await _store.get(schema_id)
        if metadata is None:
            raise HTTPException(404, f"Schema '{schema_id}' not found")
        latest = metadata.get_latest()
        if latest is None:
            raise HTTPException(400, "No versions to check against")
        mode = req.mode or metadata.compatibility
        result = check_compatibility(latest.schema_json, req.schema_document, mode)
        return _compat_to_response(result)

    # -- Version diff --------------------------------------------------------

    @router.get(
        "/v1/schemas/{schema_id:path}/diff/{from_version}/{to_version}",
        response_model=DiffResponse,
    )
    async def version_diff(schema_id: str, from_version: int, to_version: int) -> DiffResponse:
        metadata = await _store.get(schema_id)
        if metadata is None:
            raise HTTPException(404, f"Schema '{schema_id}' not found")
        v_from = metadata.get_version(from_version)
        v_to = metadata.get_version(to_version)
        if v_from is None:
            raise HTTPException(404, f"Version {from_version} not found")
        if v_to is None:
            raise HTTPException(404, f"Version {to_version} not found")
        diffs = compute_diff(v_from.schema_json, v_to.schema_json)
        return DiffResponse(
            from_version=from_version,
            to_version=to_version,
            diffs=[
                {
                    "field_path": d.field_path,
                    "change_type": d.change_type,
                    "old_value": d.old_value,
                    "new_value": d.new_value,
                    "description": d.description,
                }
                for d in diffs
            ],
        )

    # -- Get a single schema (greedy :path — must come AFTER sub-paths) ------

    @router.get("/v1/schemas/{schema_id:path}", response_model=SchemaResponse)
    async def get_schema(schema_id: str) -> SchemaResponse:
        metadata = await _store.get(schema_id)
        if metadata is None:
            raise HTTPException(404, f"Schema '{schema_id}' not found")
        return _metadata_to_response(metadata)

    # -- Delete a schema -----------------------------------------------------

    @router.delete("/v1/schemas/{schema_id:path}", status_code=204, dependencies=write)
    async def delete_schema(schema_id: str) -> None:
        deleted = await _store.delete(schema_id)
        if not deleted:
            raise HTTPException(404, f"Schema '{schema_id}' not found")

    return router


def create_registry_app(store: SchemaStore | None = None) -> FastAPI:
    """Create the Schema Registry as a standalone FastAPI application."""
    app = FastAPI(
        title="Forge Schema Registry",
        description="F20 — Schema Registry Service for Forge",
        version="0.1.0",
    )
    app.include_router(build_registry_router(store))
    return app
