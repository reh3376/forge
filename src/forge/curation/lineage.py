"""Lineage tracking — records the full transformation chain from raw to curated.

Every transformation applied to a ContextualRecord is tracked as a
LineageEntry. The lineage tracker can reconstruct the full chain
from source adapter to curated data product, enabling:

- Impact analysis: "If this source field changes, which data products are affected?"
- Root cause: "This data product has bad values — where did they originate?"
- Compliance: "Prove that this curated value was derived correctly."
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4


@dataclass(frozen=True)
class TransformationStep:
    """A single transformation applied during curation.

    Records what was done, by which component, and when.
    """

    step_name: str  # e.g. "normalize", "time_bucket", "aggregate_avg"
    component: str  # e.g. "NormalizationStep", "AggregationStep"
    description: str = ""
    parameters: dict[str, str] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class LineageEntry:
    """A lineage record linking source records to curated outputs.

    Tracks which raw record IDs were inputs, what transformations
    were applied, and which data product received the output.
    """

    lineage_id: str = field(default_factory=lambda: str(uuid4()))
    source_record_ids: list[str] = field(default_factory=list)
    output_record_id: str = ""
    product_id: str = ""
    adapter_ids: list[str] = field(default_factory=list)
    steps: list[TransformationStep] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


# ---------------------------------------------------------------------------
# Lineage Store abstraction
# ---------------------------------------------------------------------------

class LineageStore(ABC):
    """Abstract storage backend for lineage entries."""

    @abstractmethod
    def save(self, entry: LineageEntry) -> None: ...

    @abstractmethod
    def get(self, lineage_id: str) -> LineageEntry | None: ...

    @abstractmethod
    def get_by_output(self, output_record_id: str) -> list[LineageEntry]: ...

    @abstractmethod
    def get_by_source(self, source_record_id: str) -> list[LineageEntry]: ...

    @abstractmethod
    def get_by_product(self, product_id: str) -> list[LineageEntry]: ...

    @abstractmethod
    def list_all(self) -> list[LineageEntry]: ...


class InMemoryLineageStore(LineageStore):
    """In-memory lineage store for development and testing."""

    def __init__(self) -> None:
        self._entries: dict[str, LineageEntry] = {}

    def save(self, entry: LineageEntry) -> None:
        self._entries[entry.lineage_id] = entry

    def get(self, lineage_id: str) -> LineageEntry | None:
        return self._entries.get(lineage_id)

    def get_by_output(self, output_record_id: str) -> list[LineageEntry]:
        return [
            e for e in self._entries.values()
            if e.output_record_id == output_record_id
        ]

    def get_by_source(self, source_record_id: str) -> list[LineageEntry]:
        return [
            e for e in self._entries.values()
            if source_record_id in e.source_record_ids
        ]

    def get_by_product(self, product_id: str) -> list[LineageEntry]:
        return sorted(
            [e for e in self._entries.values() if e.product_id == product_id],
            key=lambda e: e.created_at,
        )

    def list_all(self) -> list[LineageEntry]:
        return sorted(self._entries.values(), key=lambda e: e.created_at)

    def __len__(self) -> int:
        return len(self._entries)


# ---------------------------------------------------------------------------
# Lineage Tracker
# ---------------------------------------------------------------------------

class LineageTracker:
    """High-level API for recording and querying lineage.

    Provides methods for building lineage entries step-by-step
    as records flow through the curation pipeline.
    """

    def __init__(self, store: LineageStore | None = None) -> None:
        self._store = store or InMemoryLineageStore()

    def start_entry(
        self,
        source_record_ids: list[str | UUID],
        adapter_ids: list[str] | None = None,
    ) -> LineageEntry:
        """Start a new lineage entry with source record IDs."""
        entry = LineageEntry(
            source_record_ids=[str(rid) for rid in source_record_ids],
            adapter_ids=adapter_ids or [],
        )
        return entry

    def add_step(
        self,
        entry: LineageEntry,
        step_name: str,
        component: str,
        *,
        description: str = "",
        parameters: dict[str, str] | None = None,
    ) -> LineageEntry:
        """Append a transformation step to a lineage entry."""
        step = TransformationStep(
            step_name=step_name,
            component=component,
            description=description,
            parameters=parameters or {},
        )
        entry.steps.append(step)
        return entry

    def complete_entry(
        self,
        entry: LineageEntry,
        *,
        output_record_id: str,
        product_id: str,
    ) -> LineageEntry:
        """Finalize and persist a lineage entry."""
        entry.output_record_id = output_record_id
        entry.product_id = product_id
        self._store.save(entry)
        return entry

    def get_lineage(self, output_record_id: str) -> list[LineageEntry]:
        """Get lineage for a specific output record."""
        return self._store.get_by_output(output_record_id)

    def get_downstream(self, source_record_id: str) -> list[LineageEntry]:
        """Get all downstream lineage from a source record."""
        return self._store.get_by_source(source_record_id)

    def get_product_lineage(self, product_id: str) -> list[LineageEntry]:
        """Get all lineage entries for a data product."""
        return self._store.get_by_product(product_id)

    @property
    def store(self) -> LineageStore:
        """Access the underlying store."""
        return self._store
