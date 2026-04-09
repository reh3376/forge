"""Tests for context resolvers — area, equipment, batch, mode, and pipeline."""

import pytest

from forge.modules.ot.context.resolvers import (
    AreaResolver,
    AreaRule,
    BatchContext,
    BatchContextResolver,
    EnrichmentContext,
    EnrichmentPipeline,
    EquipmentResolver,
    EquipmentRule,
    OperatingModeResolver,
)


# ---------------------------------------------------------------------------
# AreaResolver
# ---------------------------------------------------------------------------


class TestAreaResolver:

    def test_default_extraction_from_path(self):
        """Default heuristic: {site}/{connection}/{area}/..."""
        resolver = AreaResolver()
        area, site = resolver.resolve("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert area == "Distillery01"
        assert site == "WH"

    def test_default_extraction_short_path(self):
        resolver = AreaResolver()
        area, site = resolver.resolve("WH/WHK01")
        assert area is None
        assert site == "WH"

    def test_explicit_rule_match(self):
        resolver = AreaResolver(rules=[
            AreaRule(pattern="WH/WHK01/Distillery01/.*", area="Distillery", site="WHK"),
            AreaRule(pattern="WH/WHK01/Granary01/.*", area="Granary", site="WHK"),
        ])
        area, site = resolver.resolve("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert area == "Distillery"
        assert site == "WHK"

    def test_explicit_rule_second_match(self):
        resolver = AreaResolver(rules=[
            AreaRule(pattern="WH/WHK01/Distillery01/.*", area="Distillery", site="WHK"),
            AreaRule(pattern="WH/WHK01/Granary01/.*", area="Granary", site="WHK"),
        ])
        area, site = resolver.resolve("WH/WHK01/Granary01/TIT_1010/Out_PV")
        assert area == "Granary"

    def test_explicit_rule_no_match(self):
        resolver = AreaResolver(rules=[
            AreaRule(pattern="WH/WHK01/Distillery01/.*", area="Distillery", site="WHK"),
        ])
        area, site = resolver.resolve("WH/WHK02/Unknown/Tag")
        assert area is None
        assert site is None

    def test_empty_path(self):
        resolver = AreaResolver()
        area, site = resolver.resolve("")
        assert area is None


# ---------------------------------------------------------------------------
# EquipmentResolver
# ---------------------------------------------------------------------------


class TestEquipmentResolver:

    def test_default_extraction(self):
        """Default: equipment is second-to-last segment."""
        resolver = EquipmentResolver()
        equip = resolver.resolve("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert equip == "TIT_2010"

    def test_default_short_path(self):
        resolver = EquipmentResolver()
        equip = resolver.resolve("Out_PV")
        assert equip is None

    def test_explicit_rule_with_named_group(self):
        resolver = EquipmentResolver(rules=[
            EquipmentRule(pattern=r".*/(?P<equip>[A-Z]+_\d+)/Out_.*"),
        ])
        equip = resolver.resolve("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert equip == "TIT_2010"

    def test_explicit_rule_static_id(self):
        resolver = EquipmentResolver(rules=[
            EquipmentRule(pattern="WH/WHK01/Utility/.*", equipment_id="UTILITY-SYSTEM"),
        ])
        equip = resolver.resolve("WH/WHK01/Utility/Boiler/Temp")
        assert equip == "UTILITY-SYSTEM"


# ---------------------------------------------------------------------------
# BatchContextResolver
# ---------------------------------------------------------------------------


class TestBatchContextResolver:

    def test_no_active_batch(self):
        resolver = BatchContextResolver()
        ctx = resolver.resolve("Distillery01")
        assert ctx.batch_id is None

    def test_set_and_resolve(self):
        resolver = BatchContextResolver()
        resolver.set_active_batch(
            "Distillery", batch_id="B2026-0408-001",
            lot_id="L-001", recipe_id="R-BOURBON-01"
        )
        ctx = resolver.resolve("Distillery")
        assert ctx.batch_id == "B2026-0408-001"
        assert ctx.lot_id == "L-001"
        assert ctx.recipe_id == "R-BOURBON-01"

    def test_clear_active_batch(self):
        resolver = BatchContextResolver()
        resolver.set_active_batch("Distillery", batch_id="B001")
        resolver.clear_active_batch("Distillery")
        ctx = resolver.resolve("Distillery")
        assert ctx.batch_id is None

    def test_active_areas(self):
        resolver = BatchContextResolver()
        resolver.set_active_batch("Distillery", batch_id="B001")
        resolver.set_active_batch("Granary", batch_id="B002")
        assert sorted(resolver.active_areas) == ["Distillery", "Granary"]

    def test_resolve_none_area(self):
        resolver = BatchContextResolver()
        ctx = resolver.resolve(None)
        assert ctx.batch_id is None


# ---------------------------------------------------------------------------
# OperatingModeResolver
# ---------------------------------------------------------------------------


class TestOperatingModeResolver:

    def test_no_mode_set(self):
        resolver = OperatingModeResolver()
        assert resolver.resolve("Distillery") is None

    def test_set_and_resolve(self):
        resolver = OperatingModeResolver()
        resolver.set_mode("Distillery", "production", source="plc")
        assert resolver.resolve("Distillery") == "PRODUCTION"

    def test_mode_detail(self):
        resolver = OperatingModeResolver()
        resolver.set_mode("Distillery", "CIP", source="mes")
        detail = resolver.get_mode_detail("Distillery")
        assert detail["mode"] == "CIP"
        assert detail["source"] == "mes"

    def test_resolve_none_area(self):
        resolver = OperatingModeResolver()
        assert resolver.resolve(None) is None


# ---------------------------------------------------------------------------
# EnrichmentPipeline
# ---------------------------------------------------------------------------


class TestEnrichmentPipeline:

    def test_full_enrichment(self):
        """Pipeline resolves all context fields from a single tag path."""
        batch_resolver = BatchContextResolver()
        batch_resolver.set_active_batch(
            "Distillery01", batch_id="B2026-0408-001",
            lot_id="L-001", recipe_id="R-BOURBON-01"
        )
        mode_resolver = OperatingModeResolver()
        mode_resolver.set_mode("Distillery01", "PRODUCTION", source="plc")

        pipeline = EnrichmentPipeline(
            batch_resolver=batch_resolver,
            mode_resolver=mode_resolver,
        )

        ctx = pipeline.enrich("WH/WHK01/Distillery01/TIT_2010/Out_PV")

        assert ctx.site == "WH"
        assert ctx.area == "Distillery01"
        assert ctx.equipment_id == "TIT_2010"
        assert ctx.batch_id == "B2026-0408-001"
        assert ctx.lot_id == "L-001"
        assert ctx.recipe_id == "R-BOURBON-01"
        assert ctx.operating_mode == "PRODUCTION"

    def test_partial_enrichment(self):
        """Pipeline produces partial context when some resolvers have no data."""
        pipeline = EnrichmentPipeline()
        ctx = pipeline.enrich("WH/WHK01/Distillery01/TIT_2010/Out_PV")

        assert ctx.site == "WH"
        assert ctx.area == "Distillery01"
        assert ctx.equipment_id == "TIT_2010"
        assert ctx.batch_id is None  # No MES data
        assert ctx.operating_mode is None  # No mode set

    def test_enrichment_returns_enrichment_context(self):
        pipeline = EnrichmentPipeline()
        ctx = pipeline.enrich("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert isinstance(ctx, EnrichmentContext)

    def test_path_cache_populates(self):
        """Path resolution is cached after first call."""
        pipeline = EnrichmentPipeline()
        assert pipeline.path_cache_size == 0
        pipeline.enrich("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert pipeline.path_cache_size == 1
        # Second call uses cache — still 1 entry
        pipeline.enrich("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert pipeline.path_cache_size == 1

    def test_path_cache_invalidate_all(self):
        pipeline = EnrichmentPipeline()
        pipeline.enrich("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        pipeline.enrich("WH/WHK01/Granary01/FIT_1010/Out_PV")
        assert pipeline.path_cache_size == 2
        pipeline.invalidate_path_cache()
        assert pipeline.path_cache_size == 0

    def test_path_cache_invalidate_single(self):
        pipeline = EnrichmentPipeline()
        pipeline.enrich("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        pipeline.enrich("WH/WHK01/Granary01/FIT_1010/Out_PV")
        assert pipeline.path_cache_size == 2
        pipeline.invalidate_path("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert pipeline.path_cache_size == 1

    def test_dynamic_fields_resolve_live_despite_cache(self):
        """Batch/mode changes are reflected even with cached paths."""
        batch_resolver = BatchContextResolver()
        mode_resolver = OperatingModeResolver()
        pipeline = EnrichmentPipeline(
            batch_resolver=batch_resolver,
            mode_resolver=mode_resolver,
        )

        # First call — no batch or mode set
        ctx1 = pipeline.enrich("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert ctx1.batch_id is None
        assert ctx1.operating_mode is None

        # Change dynamic state
        batch_resolver.set_active_batch("Distillery01", batch_id="B001")
        mode_resolver.set_mode("Distillery01", "CIP")

        # Second call — path is cached but dynamic fields update
        ctx2 = pipeline.enrich("WH/WHK01/Distillery01/TIT_2010/Out_PV")
        assert ctx2.batch_id == "B001"
        assert ctx2.operating_mode == "CIP"
        # Path-based fields are still the same
        assert ctx2.area == "Distillery01"
        assert ctx2.site == "WH"
