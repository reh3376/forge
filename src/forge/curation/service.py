"""forge-curation FastAPI service — HTTP endpoints for the curation layer.

Provides REST API for:
- Submitting ContextualRecords for curation
- Managing data product definitions
- Querying lineage
- Retrieving quality reports
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from forge.core.models.contextual_record import ContextualRecord
from forge.core.models.data_product import CurationSpec, DataProduct, DataProductStatus
from forge.curation.engine import CurationEngine, validate_spec

if TYPE_CHECKING:
    from forge.curation.lineage import LineageTracker
    from forge.curation.normalization import UnitRegistry
    from forge.curation.quality import QualityMonitor, QualityReport
    from forge.curation.registry import DataProductRegistry

# ---------------------------------------------------------------------------
# Request/Response schemas
# ---------------------------------------------------------------------------


class CurateRequest(BaseModel):
    """Request to curate a batch of ContextualRecords."""

    product_id: str
    records: list[ContextualRecord]


class CurateResponse(BaseModel):
    """Response from a curation run."""

    input_count: int
    output_count: int
    steps_applied: list[str]
    quality_passed: bool | None = None
    quality_score: float | None = None


class CreateProductRequest(BaseModel):
    """Request to register a new data product."""

    name: str
    description: str
    owner: str
    schema_ref: str
    schema_version: str = "0.1.0"
    source_adapters: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    curation: CurationSpec | None = Field(
        default=None,
        description="How the engine curates this product (FB-009); the default spec when omitted.",
    )


class ProductResponse(BaseModel):
    """Response containing data product info."""

    product_id: str
    name: str
    description: str
    owner: str
    status: str
    schema_ref: str
    schema_version: str
    source_adapters: list[str]
    tags: list[str]
    curation: CurationSpec


def _product_response(product: DataProduct) -> ProductResponse:
    return ProductResponse(
        product_id=product.product_id,
        name=product.name,
        description=product.description,
        owner=product.owner,
        status=product.status.value,
        schema_ref=product.product_schema.schema_ref,
        schema_version=product.product_schema.version,
        source_adapters=product.source_adapters,
        tags=product.tags,
        curation=product.curation,
    )


def _report_response(product_id: str, report: QualityReport) -> QualityReportResponse:
    return QualityReportResponse(
        product_id=product_id,
        record_count=report.record_count,
        passed=report.passed,
        score=report.score,
        results=[
            {
                "rule_name": r.rule_name,
                "dimension": r.dimension.value,
                "passed": r.passed,
                "score": r.score,
                "measurement": r.measurement,
            }
            for r in report.results
        ],
    )


class LineageResponse(BaseModel):
    """Response containing lineage information."""

    lineage_id: str
    source_record_ids: list[str]
    output_record_id: str
    product_id: str
    adapter_ids: list[str]
    steps: list[dict[str, Any]]


class QualityReportResponse(BaseModel):
    """Response containing quality report."""

    product_id: str
    record_count: int
    passed: bool
    score: float
    results: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------


def create_curation_app(
    unit_registry: UnitRegistry | None = None,
    registry: DataProductRegistry | None = None,
    lineage_tracker: LineageTracker | None = None,
    quality_monitor: QualityMonitor | None = None,
    engine: CurationEngine | None = None,
) -> FastAPI:
    """Create the forge-curation FastAPI application.

    All dependencies are injectable for testing. ``engine`` is the curation
    engine (FB-009); when given, its registry, lineage tracker, quality
    monitor and unit registry are the app's, so the hub's ingest trigger and
    the REST surface share one state. Otherwise one is built from the other
    arguments.
    """
    app = FastAPI(
        title="Forge Curation Service",
        description="Transforms raw ContextualRecords into decision-ready data products",
        version="0.1.0",
    )

    # Shared state lives in the engine (FB-009).
    curation = engine or CurationEngine(
        registry,
        lineage_tracker=lineage_tracker,
        quality_monitor=quality_monitor,
        unit_registry=unit_registry,
    )
    prod_registry = curation.registry
    lineage = curation.lineage
    app.state.curation_engine = curation

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "healthy", "service": "forge-curation"}

    # ------------------------------------------------------------------
    # Curation
    # ------------------------------------------------------------------

    @app.post("/curate", response_model=CurateResponse)
    async def curate_records(request: CurateRequest) -> CurateResponse:
        """Run the product's own pipeline (its ``curation`` spec) over the records."""
        try:
            result = await curation.curate(request.product_id, request.records)
        except KeyError:
            raise HTTPException(404, f"Data product not found: {request.product_id}") from None
        except ValueError as exc:
            raise HTTPException(400, f"Curation spec of {request.product_id}: {exc}") from None

        return CurateResponse(
            input_count=result.input_count,
            output_count=result.output_count,
            steps_applied=result.steps_applied,
            quality_passed=(result.quality_report.passed if result.quality_report else None),
            quality_score=(result.quality_report.score if result.quality_report else None),
        )

    # ------------------------------------------------------------------
    # Data Products
    # ------------------------------------------------------------------

    @app.get("/products", response_model=list[ProductResponse])
    async def list_products(
        status: str | None = None,
    ) -> list[ProductResponse]:
        filter_status = None
        if status:
            try:
                filter_status = DataProductStatus(status)
            except ValueError:
                raise HTTPException(400, f"Invalid status: {status}")  # noqa: B904

        products = prod_registry.list_products(filter_status)
        return [_product_response(p) for p in products]

    @app.get("/products/{product_id}", response_model=ProductResponse)
    async def get_product(product_id: str) -> ProductResponse:
        product = prod_registry.get(product_id)
        if product is None:
            raise HTTPException(404, f"Data product not found: {product_id}")
        return _product_response(product)

    @app.post("/products", response_model=ProductResponse, status_code=201)
    async def create_product(request: CreateProductRequest) -> ProductResponse:
        spec = request.curation or CurationSpec()
        try:
            validate_spec(spec)
        except ValueError as exc:
            raise HTTPException(400, f"curation: {exc}") from None
        product = prod_registry.create(
            name=request.name,
            description=request.description,
            owner=request.owner,
            schema_ref=request.schema_ref,
            schema_version=request.schema_version,
            source_adapters=request.source_adapters,
            tags=request.tags,
            curation=spec,
        )
        return _product_response(product)

    @app.put("/products/{product_id}/publish", response_model=ProductResponse)
    async def publish_product(product_id: str) -> ProductResponse:
        try:
            product = prod_registry.publish(product_id)
        except KeyError:
            raise HTTPException(404, f"Data product not found: {product_id}")  # noqa: B904
        except ValueError as e:
            raise HTTPException(400, str(e))  # noqa: B904
        return _product_response(product)

    @app.get("/products/{product_id}/curated")
    async def get_curated_records(
        product_id: str, limit: int = Query(100, ge=1, le=10_000)
    ) -> dict[str, Any]:
        """The product's most recent curated records (bounded window, newest last)."""
        if prod_registry.get(product_id) is None:
            raise HTTPException(404, f"Data product not found: {product_id}")
        records = curation.curated(product_id, limit=limit)
        return {
            "product_id": product_id,
            "count": len(records),
            "records": [r.model_dump(mode="json") for r in records],
        }

    # ------------------------------------------------------------------
    # Lineage
    # ------------------------------------------------------------------

    @app.get("/products/{product_id}/lineage", response_model=list[LineageResponse])
    async def get_product_lineage(product_id: str) -> list[LineageResponse]:
        entries = lineage.get_product_lineage(product_id)
        return [
            LineageResponse(
                lineage_id=e.lineage_id,
                source_record_ids=e.source_record_ids,
                output_record_id=e.output_record_id,
                product_id=e.product_id,
                adapter_ids=e.adapter_ids,
                steps=[
                    {
                        "step_name": s.step_name,
                        "component": s.component,
                        "description": s.description,
                    }
                    for s in e.steps
                ],
            )
            for e in entries
        ]

    # ------------------------------------------------------------------
    # Quality
    # ------------------------------------------------------------------

    @app.get("/products/{product_id}/quality", response_model=QualityReportResponse)
    async def get_quality_report(product_id: str) -> QualityReportResponse:
        report = curation.latest_report(product_id)
        if report is None:
            raise HTTPException(404, f"No quality report for product: {product_id}")
        return _report_response(product_id, report)

    return app


# Default app instance
app = create_curation_app()
