"""forge_hub.curation: the curation layer, turning raw records into decision-ready data products.

The curation package provides:
- Normalization engine: unit conversion, time bucketing, value alignment
- Data product registry: define, version, publish, deprecate
- Curation pipeline: composable transformation steps
- Lineage tracking: raw → transformations → data product
- Quality monitoring: SLO evaluation aligned with FQTS
"""

from forge_hub.curation.normalization import (
    TimeBucketer,
    UnitConversion,
    UnitRegistry,
    ValueNormalizer,
)

__all__ = [
    "TimeBucketer",
    "UnitConversion",
    "UnitRegistry",
    "ValueNormalizer",
]
