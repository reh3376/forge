"""Curation engine — one pipeline per data product, run on demand or on ingest (FB-009).

The engine turns a product's :class:`~forge.core.models.data_product.CurationSpec`
into a :class:`CurationPipeline` (normalise, bucket, aggregate), runs it, keeps
the product's latest quality report and a bounded window of its curated
records, and hands every curated record to ``persist`` so it lands in the
hub's stores next to the raw ones.

The ingest pipeline calls :meth:`on_ingested` after it has persisted a batch:
every *published* product that lists the batch's adapter in
``source_adapters`` and has ``curation.on_ingest`` set is curated with that
batch. A product's failure is logged and reported, never raised into the
ingest path.
"""

from __future__ import annotations

import logging
from collections import deque
from typing import TYPE_CHECKING, Any

from forge.core.models.data_product import CurationSpec, DataProduct, DataProductStatus
from forge.curation.aggregation import AggregationFunction, AggregationSpec
from forge.curation.lineage import LineageTracker
from forge.curation.normalization import TIME_WINDOWS, UnitRegistry, build_whk_unit_registry
from forge.curation.pipeline import (
    AggregationStep,
    CurationPipeline,
    CurationResult,
    CurationStep,
    NormalizationStep,
    TimeBucketStep,
)
from forge.curation.quality import QualityMonitor, QualityReport
from forge.curation.registry import DataProductRegistry

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable, Iterable

    from forge.core.models.contextual_record import ContextualRecord

logger = logging.getLogger(__name__)

DEFAULT_KEEP = 10_000


def validate_spec(spec: CurationSpec) -> None:
    """Raise ``ValueError`` when the spec names a window or function Forge does not have."""
    if spec.time_window not in TIME_WINDOWS:
        msg = (
            f"unknown time_window {spec.time_window!r}; "
            f"available: {', '.join(sorted(TIME_WINDOWS))}"
        )
        raise ValueError(msg)
    known = {f.value for f in AggregationFunction}
    bad = [f for f in spec.functions if f.upper() not in known]
    if bad:
        msg = f"unknown aggregation function(s) {bad}; available: {', '.join(sorted(known))}"
        raise ValueError(msg)
    if not spec.functions:
        msg = "curation.functions must name at least one aggregation function"
        raise ValueError(msg)
    if not spec.group_by:
        msg = "curation.group_by must name at least one context field"
        raise ValueError(msg)


class CurationEngine:
    """Builds and runs the per-product curation pipelines."""

    def __init__(
        self,
        registry: DataProductRegistry | None = None,
        *,
        lineage_tracker: LineageTracker | None = None,
        quality_monitor: QualityMonitor | None = None,
        unit_registry: UnitRegistry | None = None,
        persist: Callable[[list[ContextualRecord]], Awaitable[int]] | None = None,
        keep: int = DEFAULT_KEEP,
    ) -> None:
        self.registry = registry or DataProductRegistry()
        self.lineage = lineage_tracker or LineageTracker()
        self.quality = quality_monitor or QualityMonitor()
        self.units = unit_registry or build_whk_unit_registry()
        self.persist = persist
        self._keep = keep
        self._curated: dict[str, deque[ContextualRecord]] = {}
        self._reports: dict[str, QualityReport] = {}
        self.runs = 0
        self.persisted = 0

    # -- pipelines -------------------------------------------------------------

    def build_pipeline(self, product: DataProduct) -> CurationPipeline:
        """The product's pipeline from its ``curation`` spec; ``ValueError`` on a bad spec."""
        spec = product.curation
        validate_spec(spec)
        steps: list[CurationStep] = []
        if spec.normalize:
            steps.append(NormalizationStep(self.units))
        steps.append(TimeBucketStep(spec.time_window))
        steps.append(
            AggregationStep(
                AggregationSpec(
                    group_by=list(spec.group_by),
                    time_window=spec.time_window,
                    functions=[AggregationFunction(f.upper()) for f in spec.functions],
                    product_id=product.product_id,
                )
            )
        )
        return CurationPipeline(
            steps=steps,
            lineage_tracker=self.lineage,
            quality_monitor=self.quality,
            product_id=product.product_id,
        )

    # -- runs ------------------------------------------------------------------

    async def curate(self, product_id: str, records: Iterable[ContextualRecord]) -> CurationResult:
        """Run ``product_id``'s pipeline over ``records`` (``KeyError`` when unknown)."""
        product = self.registry.get(product_id)
        if product is None:
            msg = f"Data product not found: {product_id}"
            raise KeyError(msg)
        pipeline = self.build_pipeline(product)
        result = pipeline.execute(list(records), product_id)
        self.runs += 1
        window = self._curated.setdefault(product_id, deque(maxlen=self._keep))
        window.extend(result.output_records)
        if result.quality_report is not None:
            self._reports[product_id] = result.quality_report
        if self.persist is not None and result.output_records:
            self.persisted += await self.persist(list(result.output_records))
        return result

    def products_for(self, adapter_id: str) -> list[DataProduct]:
        """The published products that take ``adapter_id``'s records on ingest."""
        return [
            product
            for product in self.registry.list_products(DataProductStatus.PUBLISHED)
            if product.curation.on_ingest and adapter_id in product.source_adapters
        ]

    async def on_ingested(
        self, adapter_id: str, records: list[ContextualRecord]
    ) -> tuple[dict[str, int], list[str]]:
        """Curate an ingested batch for every product fed by ``adapter_id``.

        Returns ``(curated, errors)``: output counts per product, and one message per
        product whose run failed. Nothing here raises into the ingest path.
        """
        curated: dict[str, int] = {}
        errors: list[str] = []
        if not records:
            return curated, errors
        for product in self.products_for(adapter_id):
            try:
                result = await self.curate(product.product_id, records)
            except Exception as exc:
                logger.exception("Curation of %s for %s failed", product.product_id, adapter_id)
                errors.append(f"{product.product_id}: {exc}")
                continue
            curated[product.product_id] = result.output_count
        return curated, errors

    # -- state -----------------------------------------------------------------

    def curated(self, product_id: str, limit: int | None = None) -> list[ContextualRecord]:
        """The most recent curated records of a product (newest last)."""
        window = self._curated.get(product_id)
        if not window:
            return []
        records = list(window)
        return records[-limit:] if limit else records

    def latest_report(self, product_id: str) -> QualityReport | None:
        return self._reports.get(product_id)

    def describe(self) -> dict[str, Any]:
        return {
            "runs": self.runs,
            "persisted": self.persisted,
            "keep": self._keep,
            "products": {pid: len(window) for pid, window in self._curated.items()},
            "persists": self.persist is not None,
        }
