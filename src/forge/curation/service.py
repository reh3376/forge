# ruff: noqa: TC001
"""forge-curation FastAPI service — HTTP endpoints for the curation layer.

Provides REST API for:
- Submitting ContextualRecords for curation
- Managing data product definitions
- Querying lineage
- Retrieving quality reports
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from forge.core.models.contextual_record import ContextualRecord
from forge.core.models.data_product import DataProductStatus
from forge.curation.aggregation import AggregationFunction, AggregationSpec
from forge.curation.lineage import LineageTracker
from forge.curation.normalization import UnitRegistry, build_whk_unit_registry
from forge.curation.pipeline import (
    AggregationStep,
    CurationPipeline,
    NormalizationStep,
    TimeBucketStep,
)
from forge.curation.quality import (
    QualityMonitor,
)
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
) -> FastAPI:
    """Create the forge-curation FastAPI application.

    All dependencies are injectable for testing.
    """
    app = FastAPI(
        title="Forge Curation Service",
        description="Transforms raw ContextualRecords into decision-ready data products",
        version="0.1.0",
    )

    # Shared state
    units = unit_registry or build_whk_unit_registry()
    prod_registry = registry or DataProductRegistry()
    lineage = lineage_tracker or LineageTracker()
    quality = quality_monitor or QualityMonitor()

    # Store latest quality reports and curated records
    _latest_reports: dict[str, QualityReportResponse] = {}
    _curated_records: dict[str, list[ContextualRecord]] = {}

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
        product = prod_registry.get(request.product_id)
        if product is None:
            raise HTTPException(404, f"Data product not found: {request.product_id}")

        # Build pipeline for this product
        pipeline = CurationPipeline(
            steps=[
                NormalizationStep(units),
                TimeBucketStep("5min"),
                AggregationStep(AggregationSpec(
                    group_by=["equipment_id"],
                    time_window="5min",
                    functions=[AggregationFunction.AVG],
                    product_id=request.product_id,
                )),
            ],
            lineage_tracker=lineage,
            quality_monitor=quality,
            product_id=request.product_id,
        )

        result = pipeline.execute(request.records, request.product_id)

        # Store curated records and quality report
        _curated_records.setdefault(request.product_id, []).extend(
            result.output_records,
        )
        if result.quality_report:
            _latest_reports[request.product_id] = QualityReportResponse(
                product_id=request.product_id,
                record_count=result.quality_report.record_count,
                passed=result.quality_report.passed,
                score=result.quality_report.score,
                results=[
                    {
                        "rule_name": r.rule_name,
                        "dimension": r.dimension.value,
                        "passed": r.passed,
                        "score": r.score,
                        "measurement": r.measurement,
                    }
                    for r in result.quality_report.results
                ],
            )

        return CurateResponse(
            input_count=result.input_count,
            output_count=result.output_count,
            steps_applied=result.steps_applied,
            quality_passed=(
                result.quality_report.passed if result.quality_report else None
            ),
            quality_score=(
                result.quality_report.score if result.quality_report else None
            ),
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
        return [
            ProductResponse(
                product_id=p.product_id,
                name=p.name,
                description=p.description,
                owner=p.owner,
                status=p.status.value,
                schema_ref=p.schema.schema_ref,
                schema_version=p.schema.version,
                source_adapters=p.source_adapters,
                tags=p.tags,
            )
            for p in products
        ]

    @app.get("/products/{product_id}", response_model=ProductResponse)
    async def get_product(product_id: str) -> ProductResponse:
        product = prod_registry.get(product_id)
        if product is None:
            raise HTTPException(404, f"Data product not found: {product_id}")
        return ProductResponse(
            product_id=product.product_id,
            name=product.name,
            description=product.description,
            owner=product.owner,
            status=product.status.value,
            schema_ref=product.schema.schema_ref,
            schema_version=product.schema.version,
            source_adapters=product.source_adapters,
            tags=product.tags,
        )

    @app.post("/products", response_model=ProductResponse, status_code=201)
    async def create_product(request: CreateProductRequest) -> ProductResponse:
        product = prod_registry.create(
            name=request.name,
            description=request.description,
            owner=request.owner,
            schema_ref=request.schema_ref,
            schema_version=request.schema_version,
            source_adapters=request.source_adapters,
            tags=request.tags,
        )
        return ProductResponse(
            product_id=product.product_id,
            name=product.name,
            description=product.description,
            owner=product.owner,
            status=product.status.value,
            schema_ref=product.schema.schema_ref,
            schema_version=product.schema.version,
            source_adapters=product.source_adapters,
            tags=product.tags,
        )

    @app.put("/products/{product_id}/publish", response_model=ProductResponse)
    async def publish_product(product_id: str) -> ProductResponse:
        try:
            product = prod_registry.publish(product_id)
        except KeyError:
            raise HTTPException(404, f"Data product not found: {product_id}")  # noqa: B904
        except ValueError as e:
            raise HTTPException(400, str(e))  # noqa: B904
        return ProductResponse(
            product_id=product.product_id,
            name=product.name,
            description=product.description,
            owner=product.owner,
            status=product.status.value,
            schema_ref=product.schema.schema_ref,
            schema_version=product.schema.version,
            source_adapters=product.source_adapters,
            tags=product.tags,
        )

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
        report = _latest_reports.get(product_id)
        if report is None:
            raise HTTPException(404, f"No quality report for product: {product_id}")
        return report

    return app


# Default app instance
app = create_curation_app()
