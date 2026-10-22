"""forge.registry — F20 Schema Registry Service.

Public API:
    SchemaType, CompatibilityMode, SchemaVersion, SchemaMetadata — domain models
    SchemaStore, InMemorySchemaStore — ABC + in-memory backend
    PostgresSchemaStore — asyncpg-backed backend
"""

from forge.registry.models import (
    CompatibilityMode,
    SchemaMetadata,
    SchemaType,
    SchemaVersion,
)
from forge.registry.postgres_store import PostgresSchemaStore
from forge.registry.service import build_registry_router, create_registry_app
from forge.registry.store import InMemorySchemaStore, SchemaStore

__all__ = [
    "CompatibilityMode",
    "InMemorySchemaStore",
    "PostgresSchemaStore",
    "SchemaMetadata",
    "SchemaStore",
    "SchemaType",
    "SchemaVersion",
    "build_registry_router",
    "create_registry_app",
]
