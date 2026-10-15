"""Hub-side ingestion: validate, route and persist ContextualRecords.

Both transports converge here — the gRPC ``Ingest`` stream
(:mod:`forge.transport.hub_ingest`) and the REST ``POST /v1/records``
fallback (:mod:`forge.api.main`) — so a record is treated the same way
regardless of how it reached the hub.
"""

from forge.ingest.facts_check import (
    DEFAULT_SPECS_DIR,
    FactsCheckResult,
    check_manifest_against_facts,
    load_facts_spec,
)
from forge.ingest.pipeline import (
    IngestOutcome,
    IngestPipeline,
    IngestStats,
    InMemoryRecordSink,
    RecordSink,
    build_pipeline_from_storage,
)

__all__ = [
    "DEFAULT_SPECS_DIR",
    "FactsCheckResult",
    "InMemoryRecordSink",
    "IngestOutcome",
    "IngestPipeline",
    "IngestStats",
    "RecordSink",
    "build_pipeline_from_storage",
    "check_manifest_against_facts",
    "load_facts_spec",
]
