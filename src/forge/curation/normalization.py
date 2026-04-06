"""Normalization engine — unit conversion, time bucketing, value alignment.

The normalization engine transforms raw ContextualRecord values into
canonical forms so that records from different source systems are
directly comparable. A temperature from WMS in °F and a temperature
from MES in °C become the same unit; timestamps at arbitrary
precision are bucketed to configurable windows for aggregation.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from forge.core.models.contextual_record import ContextualRecord, RecordValue

# ---------------------------------------------------------------------------
# Unit Conversion
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class UnitConversion:
    """A single unit conversion rule.

    Conversion formula: result = (value - pre_offset) * factor + post_offset

    For linear conversions (gallons → liters):
        factor=3.78541, pre_offset=0, post_offset=0

    For affine conversions (°F → °C):
        factor=5/9, pre_offset=32, post_offset=0
        i.e., (value - 32) * 5/9
    """

    from_unit: str
    to_unit: str
    factor: float
    pre_offset: float = 0.0
    post_offset: float = 0.0
    dimension: str = ""  # e.g. "temperature", "volume", "concentration"

    def convert(self, value: float) -> float:
        """Apply the conversion to a numeric value."""
        return (value - self.pre_offset) * self.factor + self.post_offset

    @property
    def inverse(self) -> UnitConversion:
        """Return the inverse conversion (to_unit → from_unit)."""
        # Inverse of y = (x - pre) * factor + post
        # → x = (y - post) / factor + pre
        inv_factor = 1.0 / self.factor
        return UnitConversion(
            from_unit=self.to_unit,
            to_unit=self.from_unit,
            factor=inv_factor,
            pre_offset=self.post_offset,
            post_offset=self.pre_offset,
            dimension=self.dimension,
        )


class UnitRegistry:
    """Registry of unit conversions with lookup by (from_unit, to_unit).

    Automatically registers inverse conversions. Tracks canonical
    units per dimension so normalization can target a single standard.
    """

    def __init__(self) -> None:
        self._conversions: dict[tuple[str, str], UnitConversion] = {}
        self._canonical: dict[str, str] = {}  # dimension → canonical unit

    def register(self, conversion: UnitConversion, *, register_inverse: bool = True) -> None:
        """Register a conversion (and optionally its inverse)."""
        key = (conversion.from_unit.lower(), conversion.to_unit.lower())
        self._conversions[key] = conversion
        if register_inverse:
            inv = conversion.inverse
            inv_key = (inv.from_unit.lower(), inv.to_unit.lower())
            self._conversions[inv_key] = inv

    def set_canonical(self, dimension: str, unit: str) -> None:
        """Set the canonical (target) unit for a dimension.

        Stores the unit in its original case to preserve display formatting.
        """
        self._canonical[dimension.lower()] = unit

    def get_canonical(self, dimension: str) -> str | None:
        """Get the canonical unit for a dimension."""
        return self._canonical.get(dimension.lower())

    def get_conversion(self, from_unit: str, to_unit: str) -> UnitConversion | None:
        """Look up a conversion by (from_unit, to_unit) pair."""
        return self._conversions.get((from_unit.lower(), to_unit.lower()))

    def convert(self, value: float, from_unit: str, to_unit: str) -> float:
        """Convert a value between units. Raises KeyError if no conversion found."""
        if from_unit.lower() == to_unit.lower():
            return value
        conv = self.get_conversion(from_unit, to_unit)
        if conv is None:
            msg = f"No conversion registered: {from_unit} → {to_unit}"
            raise KeyError(msg)
        return conv.convert(value)

    def list_conversions(self) -> list[UnitConversion]:
        """Return all registered conversions."""
        return list(self._conversions.values())

    def __len__(self) -> int:
        return len(self._conversions)

    def __contains__(self, pair: tuple[str, str]) -> bool:
        return (pair[0].lower(), pair[1].lower()) in self._conversions


def build_whk_unit_registry() -> UnitRegistry:
    """Build a UnitRegistry pre-loaded with WHK manufacturing conversions."""
    registry = UnitRegistry()

    # Temperature: canonical = °C
    registry.register(UnitConversion(
        from_unit="°F", to_unit="°C",
        factor=5.0 / 9.0, pre_offset=32.0,
        dimension="temperature",
    ))
    registry.register(UnitConversion(
        from_unit="K", to_unit="°C",
        factor=1.0, pre_offset=273.15,
        dimension="temperature",
    ))
    registry.set_canonical("temperature", "°C")

    # Volume: canonical = liters
    registry.register(UnitConversion(
        from_unit="gal", to_unit="L",
        factor=3.78541,
        dimension="volume",
    ))
    registry.register(UnitConversion(
        from_unit="bbl", to_unit="L",
        factor=158.987,  # US barrel (petroleum)
        dimension="volume",
    ))
    registry.register(UnitConversion(
        from_unit="wine_bbl", to_unit="L",
        factor=119.24,  # Wine/whiskey barrel (~31.5 US gal)
        dimension="volume",
    ))
    registry.set_canonical("volume", "L")

    # Concentration: canonical = ABV (percent)
    registry.register(UnitConversion(
        from_unit="proof", to_unit="ABV",
        factor=0.5,
        dimension="concentration",
    ))
    registry.set_canonical("concentration", "ABV")

    # Mass: canonical = kg
    registry.register(UnitConversion(
        from_unit="lb", to_unit="kg",
        factor=0.453592,
        dimension="mass",
    ))
    registry.register(UnitConversion(
        from_unit="oz", to_unit="kg",
        factor=0.0283495,
        dimension="mass",
    ))
    registry.set_canonical("mass", "kg")

    # Pressure: canonical = kPa
    registry.register(UnitConversion(
        from_unit="psi", to_unit="kPa",
        factor=6.89476,
        dimension="pressure",
    ))
    registry.register(UnitConversion(
        from_unit="bar", to_unit="kPa",
        factor=100.0,
        dimension="pressure",
    ))
    registry.set_canonical("pressure", "kPa")

    return registry


# ---------------------------------------------------------------------------
# Time Bucketing
# ---------------------------------------------------------------------------

# Named time windows
TIME_WINDOWS: dict[str, timedelta] = {
    "1s": timedelta(seconds=1),
    "10s": timedelta(seconds=10),
    "30s": timedelta(seconds=30),
    "1min": timedelta(minutes=1),
    "5min": timedelta(minutes=5),
    "15min": timedelta(minutes=15),
    "30min": timedelta(minutes=30),
    "1hr": timedelta(hours=1),
    "4hr": timedelta(hours=4),
    "8hr": timedelta(hours=8),
    "1day": timedelta(days=1),
}


@dataclass
class TimeBucketer:
    """Floors timestamps to configurable window boundaries.

    Window can be specified as a named string ("5min", "1hr") or
    as a timedelta directly. All bucketing uses UTC.
    """

    window: timedelta = field(default_factory=lambda: timedelta(minutes=5))

    @classmethod
    def from_name(cls, name: str) -> TimeBucketer:
        """Create a TimeBucketer from a named window (e.g. '5min', '1hr')."""
        td = TIME_WINDOWS.get(name)
        if td is None:
            msg = f"Unknown time window: {name}. Available: {list(TIME_WINDOWS.keys())}"
            raise ValueError(msg)
        return cls(window=td)

    def bucket(self, dt: datetime) -> datetime:
        """Floor a datetime to the nearest window boundary (UTC)."""
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)

        epoch = datetime(2000, 1, 1, tzinfo=UTC)
        delta = dt - epoch
        window_seconds = self.window.total_seconds()
        bucket_num = int(delta.total_seconds() // window_seconds)
        return epoch + timedelta(seconds=bucket_num * window_seconds)

    def bucket_records(
        self, records: list[ContextualRecord],
    ) -> dict[datetime, list[ContextualRecord]]:
        """Group records by their bucketed source_time."""
        buckets: dict[datetime, list[ContextualRecord]] = {}
        for record in records:
            bucket_time = self.bucket(record.timestamp.source_time)
            buckets.setdefault(bucket_time, []).append(record)
        return buckets


# ---------------------------------------------------------------------------
# Value Normalizer
# ---------------------------------------------------------------------------

@dataclass
class ValueNormalizer:
    """Applies unit conversion and value normalization to ContextualRecords.

    Given a unit registry, converts RecordValue.raw from its source
    engineering_units to the canonical unit for that dimension. Also
    normalizes string enums to uppercase and handles edge cases
    (NaN, None, non-numeric values).
    """

    unit_registry: UnitRegistry

    def normalize_value(
        self,
        value: RecordValue,
        target_unit: str | None = None,
    ) -> RecordValue:
        """Return a new RecordValue with normalized raw and engineering_units.

        If target_unit is not specified, attempts to find the canonical
        unit for the value's current unit via the registry.
        """
        raw = value.raw
        source_unit = value.engineering_units
        units_out = source_unit

        # Numeric conversion
        is_numeric = source_unit and isinstance(raw, (int, float))
        is_special = isinstance(raw, float) and (math.isnan(raw) or math.isinf(raw))
        is_finite = is_numeric and not is_special
        if is_finite:
            to_unit = target_unit or self._find_canonical(source_unit)
            if to_unit and to_unit.lower() != source_unit.lower():
                try:
                    raw = self.unit_registry.convert(raw, source_unit, to_unit)
                    units_out = to_unit
                except KeyError:
                    pass  # No conversion found — keep original

        # String normalization: uppercase enum-like strings
        if isinstance(raw, str) and value.data_type in ("string", "enum"):
            raw = raw.strip().upper()

        return RecordValue(
            raw=raw,
            engineering_units=units_out,
            quality=value.quality,
            data_type=value.data_type,
        )

    def normalize_record(
        self,
        record: ContextualRecord,
        target_unit: str | None = None,
    ) -> ContextualRecord:
        """Return a new ContextualRecord with normalized value.

        Appends 'normalize' to the lineage transformation_chain.
        """
        new_value = self.normalize_value(record.value, target_unit)
        new_chain = [*record.lineage.transformation_chain, "normalize"]
        return record.model_copy(update={
            "value": new_value,
            "lineage": record.lineage.model_copy(update={
                "transformation_chain": new_chain,
            }),
        })

    def _find_canonical(self, unit: str) -> str | None:
        """Find the canonical unit for a given unit by scanning conversions."""
        for conv in self.unit_registry.list_conversions():
            if conv.from_unit.lower() == unit.lower() and conv.dimension:
                return self.unit_registry.get_canonical(conv.dimension)
        return None
