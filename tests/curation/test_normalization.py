"""Tests for the normalization engine."""

from __future__ import annotations

import math
from datetime import datetime, timezone, timedelta

import pytest

from forge.core.models.contextual_record import (
    ContextualRecord,
    QualityCode,
    RecordValue,
)
from forge.curation.normalization import (
    TimeBucketer,
    UnitConversion,
    UnitRegistry,
    ValueNormalizer,
)

# ---------------------------------------------------------------------------
# UnitConversion
# ---------------------------------------------------------------------------

class TestUnitConversion:
    def test_linear_conversion(self) -> None:
        conv = UnitConversion(from_unit="gal", to_unit="L", factor=3.78541)
        assert conv.convert(1.0) == pytest.approx(3.78541)

    def test_affine_conversion_f_to_c(self) -> None:
        conv = UnitConversion(
            from_unit="°F", to_unit="°C",
            factor=5.0 / 9.0, pre_offset=32.0,
        )
        assert conv.convert(32.0) == pytest.approx(0.0)
        assert conv.convert(212.0) == pytest.approx(100.0)
        assert conv.convert(78.4) == pytest.approx(25.7778, rel=1e-3)

    def test_inverse_linear(self) -> None:
        conv = UnitConversion(from_unit="gal", to_unit="L", factor=3.78541)
        inv = conv.inverse
        assert inv.from_unit == "L"
        assert inv.to_unit == "gal"
        assert inv.convert(3.78541) == pytest.approx(1.0, rel=1e-5)

    def test_inverse_affine(self) -> None:
        conv = UnitConversion(
            from_unit="°F", to_unit="°C",
            factor=5.0 / 9.0, pre_offset=32.0,
        )
        inv = conv.inverse
        assert inv.convert(0.0) == pytest.approx(32.0, rel=1e-4)
        assert inv.convert(100.0) == pytest.approx(212.0, rel=1e-4)

    def test_zero_value(self) -> None:
        conv = UnitConversion(from_unit="lb", to_unit="kg", factor=0.453592)
        assert conv.convert(0.0) == 0.0

    def test_negative_value(self) -> None:
        conv = UnitConversion(
            from_unit="°F", to_unit="°C",
            factor=5.0 / 9.0, pre_offset=32.0,
        )
        assert conv.convert(-40.0) == pytest.approx(-40.0)  # F and C meet at -40


# ---------------------------------------------------------------------------
# UnitRegistry
# ---------------------------------------------------------------------------

class TestUnitRegistry:
    def test_register_and_lookup(self) -> None:
        registry = UnitRegistry()
        conv = UnitConversion(from_unit="gal", to_unit="L", factor=3.78541)
        registry.register(conv)
        assert registry.get_conversion("gal", "L") is not None
        assert registry.get_conversion("L", "gal") is not None  # auto-inverse

    def test_convert(self, unit_registry: UnitRegistry) -> None:
        result = unit_registry.convert(1.0, "gal", "L")
        assert result == pytest.approx(3.78541)

    def test_same_unit_no_op(self, unit_registry: UnitRegistry) -> None:
        assert unit_registry.convert(42.0, "°C", "°C") == 42.0

    def test_unknown_conversion_raises(self, unit_registry: UnitRegistry) -> None:
        with pytest.raises(KeyError, match="No conversion registered"):
            unit_registry.convert(1.0, "furlongs", "parsecs")

    def test_canonical_unit(self, unit_registry: UnitRegistry) -> None:
        assert unit_registry.get_canonical("temperature") == "°C"
        assert unit_registry.get_canonical("volume") == "L"

    def test_case_insensitive(self, unit_registry: UnitRegistry) -> None:
        result = unit_registry.convert(1.0, "GAL", "l")
        assert result == pytest.approx(3.78541)

    def test_contains(self, unit_registry: UnitRegistry) -> None:
        assert ("°f", "°c") in unit_registry
        assert ("furlongs", "parsecs") not in unit_registry

    def test_whk_proof_to_abv(self, unit_registry: UnitRegistry) -> None:
        assert unit_registry.convert(100.0, "proof", "ABV") == pytest.approx(50.0)
        assert unit_registry.convert(80.0, "proof", "ABV") == pytest.approx(40.0)

    def test_whk_psi_to_kpa(self, unit_registry: UnitRegistry) -> None:
        assert unit_registry.convert(14.696, "psi", "kPa") == pytest.approx(101.325, rel=1e-3)

    def test_whk_kelvin_to_celsius(self, unit_registry: UnitRegistry) -> None:
        assert unit_registry.convert(373.15, "K", "°C") == pytest.approx(100.0, rel=1e-3)


# ---------------------------------------------------------------------------
# TimeBucketer
# ---------------------------------------------------------------------------

class TestTimeBucketer:
    def test_5min_bucket(self) -> None:
        bucketer = TimeBucketer.from_name("5min")
        dt = datetime(2026, 4, 5, 14, 33, 45, tzinfo=timezone.utc)
        assert bucketer.bucket(dt) == datetime(2026, 4, 5, 14, 30, 0, tzinfo=timezone.utc)

    def test_1hr_bucket(self) -> None:
        bucketer = TimeBucketer.from_name("1hr")
        dt = datetime(2026, 4, 5, 14, 59, 59, tzinfo=timezone.utc)
        assert bucketer.bucket(dt) == datetime(2026, 4, 5, 14, 0, 0, tzinfo=timezone.utc)

    def test_1min_bucket(self) -> None:
        bucketer = TimeBucketer.from_name("1min")
        dt = datetime(2026, 4, 5, 14, 30, 45, 500000, tzinfo=timezone.utc)
        assert bucketer.bucket(dt) == datetime(2026, 4, 5, 14, 30, 0, tzinfo=timezone.utc)

    def test_1day_bucket(self) -> None:
        bucketer = TimeBucketer.from_name("1day")
        dt = datetime(2026, 4, 5, 23, 59, 59, tzinfo=timezone.utc)
        assert bucketer.bucket(dt) == datetime(2026, 4, 5, 0, 0, 0, tzinfo=timezone.utc)

    def test_naive_datetime_treated_as_utc(self) -> None:
        bucketer = TimeBucketer.from_name("5min")
        dt = datetime(2026, 4, 5, 14, 33, 45)  # naive
        result = bucketer.bucket(dt)
        assert result.tzinfo == UTC

    def test_unknown_window_raises(self) -> None:
        with pytest.raises(ValueError, match="Unknown time window"):
            TimeBucketer.from_name("7min")

    def test_bucket_records(self, sample_record: ContextualRecord) -> None:
        bucketer = TimeBucketer.from_name("1hr")
        buckets = bucketer.bucket_records([sample_record])
        assert len(buckets) == 1
        bucket_time = next(iter(buckets.keys()))
        assert bucket_time.minute == 0
        assert bucket_time.second == 0

    def test_multiple_buckets(self) -> None:
        from tests.curation.conftest import make_record_batch
        bucketer = TimeBucketer.from_name("5min")
        records = make_record_batch(
            count=15,
            interval=timedelta(minutes=1),
        )
        buckets = bucketer.bucket_records(records)
        assert len(buckets) == 3  # 0-4, 5-9, 10-14 → 3 five-minute windows


# ---------------------------------------------------------------------------
# ValueNormalizer
# ---------------------------------------------------------------------------

class TestValueNormalizer:
    def test_normalize_f_to_c(self, unit_registry: UnitRegistry) -> None:
        normalizer = ValueNormalizer(unit_registry=unit_registry)
        value = RecordValue(raw=78.4, engineering_units="°F", data_type="float64")
        result = normalizer.normalize_value(value)
        assert result.raw == pytest.approx(25.7778, rel=1e-3)
        assert result.engineering_units == "°C"

    def test_normalize_no_unit(self, unit_registry: UnitRegistry) -> None:
        normalizer = ValueNormalizer(unit_registry=unit_registry)
        value = RecordValue(raw=42.0, engineering_units=None, data_type="float64")
        result = normalizer.normalize_value(value)
        assert result.raw == 42.0  # unchanged

    def test_normalize_string_uppercase(self, unit_registry: UnitRegistry) -> None:
        normalizer = ValueNormalizer(unit_registry=unit_registry)
        value = RecordValue(raw="  production  ", data_type="string")
        result = normalizer.normalize_value(value)
        assert result.raw == "PRODUCTION"

    def test_normalize_enum_uppercase(self, unit_registry: UnitRegistry) -> None:
        normalizer = ValueNormalizer(unit_registry=unit_registry)
        value = RecordValue(raw="running", data_type="enum")
        result = normalizer.normalize_value(value)
        assert result.raw == "RUNNING"

    def test_normalize_nan_preserved(self, unit_registry: UnitRegistry) -> None:
        normalizer = ValueNormalizer(unit_registry=unit_registry)
        value = RecordValue(raw=float("nan"), engineering_units="°F", data_type="float64")
        result = normalizer.normalize_value(value)
        assert math.isnan(result.raw)

    def test_normalize_inf_preserved(self, unit_registry: UnitRegistry) -> None:
        normalizer = ValueNormalizer(unit_registry=unit_registry)
        value = RecordValue(raw=float("inf"), engineering_units="°F", data_type="float64")
        result = normalizer.normalize_value(value)
        assert math.isinf(result.raw)

    def test_normalize_explicit_target(self, unit_registry: UnitRegistry) -> None:
        normalizer = ValueNormalizer(unit_registry=unit_registry)
        value = RecordValue(raw=78.4, engineering_units="°F", data_type="float64")
        result = normalizer.normalize_value(value, target_unit="°C")
        assert result.raw == pytest.approx(25.7778, rel=1e-3)

    def test_normalize_record_updates_lineage(
        self, unit_registry: UnitRegistry, sample_record: ContextualRecord,
    ) -> None:
        normalizer = ValueNormalizer(unit_registry=unit_registry)
        result = normalizer.normalize_record(sample_record)
        assert "normalize" in result.lineage.transformation_chain
        assert result.value.engineering_units == "°C"

    def test_normalize_preserves_quality(self, unit_registry: UnitRegistry) -> None:
        normalizer = ValueNormalizer(unit_registry=unit_registry)
        value = RecordValue(
            raw=78.4, engineering_units="°F",
            quality=QualityCode.UNCERTAIN, data_type="float64",
        )
        result = normalizer.normalize_value(value)
        assert result.quality == QualityCode.UNCERTAIN

    def test_normalize_unknown_unit_unchanged(self, unit_registry: UnitRegistry) -> None:
        normalizer = ValueNormalizer(unit_registry=unit_registry)
        value = RecordValue(raw=42.0, engineering_units="furlongs", data_type="float64")
        result = normalizer.normalize_value(value)
        assert result.raw == 42.0
        assert result.engineering_units == "furlongs"
