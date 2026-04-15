"""Schema Store abstraction — ABC and in-memory implementation.

The SchemaStore ABC defines the persistence contract for the F20
Schema Registry Service.  InMemorySchemaStore provides a dict-backed
implementation for tests and local development.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from copy import deepcopy

from forge.registry.models import SchemaMetadata  # noqa: TC001


class SchemaStore(ABC):
    """Abstract storage backend for schema metadata and versions."""

    @abstractmethod
    async def save(self, metadata: SchemaMetadata) -> None:
        """Persist a schema (insert or update)."""
        ...

    @abstractmethod
    async def get(self, schema_id: str) -> SchemaMetadata | None:
        """Retrieve a schema by its unique ID."""
        ...

    @abstractmethod
    async def list_all(
        self,
        *,
        schema_type: str | None = None,
        status: str | None = None,
        owner: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[SchemaMetadata]:
        """List schemas with optional filters and pagination."""
        ...

    @abstractmethod
    async def delete(self, schema_id: str) -> bool:
        """Delete a schema and all its versions.  Returns True if it existed."""
        ...

    @abstractmethod
    async def count(self) -> int:
        """Return the total number of registered schemas."""
        ...


class InMemorySchemaStore(SchemaStore):
    """In-memory schema store for development and testing."""

    def __init__(self) -> None:
        self._entries: dict[str, SchemaMetadata] = {}

    async def save(self, metadata: SchemaMetadata) -> None:
        self._entries[metadata.schema_id] = metadata

    async def get(self, schema_id: str) -> SchemaMetadata | None:
        entry = self._entries.get(schema_id)
        return deepcopy(entry) if entry else None

    async def list_all(
        self,
        *,
        schema_type: str | None = None,
        status: str | None = None,
        owner: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[SchemaMetadata]:
        results = list(self._entries.values())
        if schema_type:
            results = [r for r in results if r.schema_type == schema_type]
        if status:
            results = [r for r in results if r.status == status]
        if owner:
            results = [r for r in results if r.owner == owner]
        return results[offset : offset + limit]

    async def delete(self, schema_id: str) -> bool:
        return self._entries.pop(schema_id, None) is not None

    async def count(self) -> int:
        return len(self._entries)
