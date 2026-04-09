"""Data product registry — define, version, publish, deprecate data products.

The registry is the catalog of all data products in the Forge platform.
Each data product has a lifecycle (DRAFT → PUBLISHED → DEPRECATED → RETIRED),
a versioned schema, quality SLOs, and an owner.

Storage is abstracted behind `ProductStore` so the registry works with
in-memory storage now and can be wired to PostgreSQL later.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from forge.core.models.data_product import (
    DataProduct,
    DataProductSchema,
    DataProductStatus,
    QualitySLO,
)

# ---------------------------------------------------------------------------
# Data Product Version tracking
# ---------------------------------------------------------------------------

@dataclass
class DataProductVersion:
    """A snapshot of a data product at a specific version."""

    version_id: str = field(default_factory=lambda: str(uuid4()))
    product_id: str = ""
    version: str = "0.1.0"
    schema: DataProductSchema | None = None
    fields: list[DataProductField] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    notes: str = ""


@dataclass
class DataProductField:
    """A field within a data product's output schema."""

    name: str
    field_type: str  # e.g. "float64", "string", "datetime"
    description: str = ""
    source_context_field: str | None = None  # maps to ContextFieldRegistry
    aggregation: str | None = None  # e.g. "avg", "last", "count"
    required: bool = True


# ---------------------------------------------------------------------------
# Product Store abstraction
# ---------------------------------------------------------------------------

class ProductStore(ABC):
    """Abstract storage backend for data products."""

    @abstractmethod
    def save(self, product: DataProduct) -> None: ...

    @abstractmethod
    def get(self, product_id: str) -> DataProduct | None: ...

    @abstractmethod
    def list_all(self, status: DataProductStatus | None = None) -> list[DataProduct]: ...

    @abstractmethod
    def delete(self, product_id: str) -> bool: ...


class InMemoryProductStore(ProductStore):
    """In-memory product store for development and testing."""

    def __init__(self) -> None:
        self._products: dict[str, DataProduct] = {}

    def save(self, product: DataProduct) -> None:
        self._products[product.product_id] = product

    def get(self, product_id: str) -> DataProduct | None:
        return self._products.get(product_id)

    def list_all(self, status: DataProductStatus | None = None) -> list[DataProduct]:
        products = list(self._products.values())
        if status is not None:
            products = [p for p in products if p.status == status]
        return sorted(products, key=lambda p: p.name)

    def delete(self, product_id: str) -> bool:
        return self._products.pop(product_id, None) is not None

    def __len__(self) -> int:
        return len(self._products)


# ---------------------------------------------------------------------------
# Data Product Registry
# ---------------------------------------------------------------------------

class DataProductRegistry:
    """Manages the lifecycle of data products.

    Provides CRUD operations plus lifecycle transitions:
    DRAFT → PUBLISHED → DEPRECATED → RETIRED

    Version history is tracked for each product.
    """

    def __init__(self, store: ProductStore | None = None) -> None:
        self._store = store or InMemoryProductStore()
        self._versions: dict[str, list[DataProductVersion]] = {}

    def create(
        self,
        *,
        name: str,
        description: str,
        owner: str,
        schema_ref: str,
        schema_version: str = "0.1.0",
        source_adapters: list[str] | None = None,
        quality_slos: list[QualitySLO] | None = None,
        tags: list[str] | None = None,
        fields: list[DataProductField] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> DataProduct:
        """Create a new data product in DRAFT status."""
        product_id = f"dp-{uuid4().hex[:12]}"
        schema = DataProductSchema(
            schema_ref=schema_ref,
            version=schema_version,
        )
        product = DataProduct(
            product_id=product_id,
            name=name,
            description=description,
            owner=owner,
            status=DataProductStatus.DRAFT,
            schema=schema,
            source_adapters=source_adapters or [],
            quality_slos=quality_slos or [],
            tags=tags or [],
            metadata=metadata or {},
        )
        self._store.save(product)

        # Record initial version
        version = DataProductVersion(
            product_id=product_id,
            version=schema_version,
            schema=schema,
            fields=fields or [],
            notes="Initial creation",
        )
        self._versions.setdefault(product_id, []).append(version)

        return product

    def get(self, product_id: str) -> DataProduct | None:
        """Retrieve a data product by ID."""
        return self._store.get(product_id)

    def list_products(
        self, status: DataProductStatus | None = None,
    ) -> list[DataProduct]:
        """List all data products, optionally filtered by status."""
        return self._store.list_all(status)

    def publish(self, product_id: str) -> DataProduct:
        """Transition a DRAFT data product to PUBLISHED."""
        product = self._store.get(product_id)
        if product is None:
            msg = f"Data product not found: {product_id}"
            raise KeyError(msg)
        if product.status != DataProductStatus.DRAFT:
            msg = f"Can only publish DRAFT products. Current status: {product.status}"
            raise ValueError(msg)

        product.status = DataProductStatus.PUBLISHED
        product.updated_at = datetime.now(UTC)
        self._store.save(product)
        return product

    def deprecate(self, product_id: str) -> DataProduct:
        """Transition a PUBLISHED data product to DEPRECATED."""
        product = self._store.get(product_id)
        if product is None:
            msg = f"Data product not found: {product_id}"
            raise KeyError(msg)
        if product.status != DataProductStatus.PUBLISHED:
            msg = f"Can only deprecate PUBLISHED products. Current status: {product.status}"
            raise ValueError(msg)

        product.status = DataProductStatus.DEPRECATED
        product.updated_at = datetime.now(UTC)
        self._store.save(product)
        return product

    def retire(self, product_id: str) -> DataProduct:
        """Transition a DEPRECATED data product to RETIRED."""
        product = self._store.get(product_id)
        if product is None:
            msg = f"Data product not found: {product_id}"
            raise KeyError(msg)
        if product.status != DataProductStatus.DEPRECATED:
            msg = f"Can only retire DEPRECATED products. Current status: {product.status}"
            raise ValueError(msg)

        product.status = DataProductStatus.RETIRED
        product.updated_at = datetime.now(UTC)
        self._store.save(product)
        return product

    def add_version(
        self,
        product_id: str,
        *,
        version: str,
        schema_ref: str | None = None,
        fields: list[DataProductField] | None = None,
        notes: str = "",
    ) -> DataProductVersion:
        """Add a new version to a data product."""
        product = self._store.get(product_id)
        if product is None:
            msg = f"Data product not found: {product_id}"
            raise KeyError(msg)

        schema = None
        if schema_ref:
            schema = DataProductSchema(schema_ref=schema_ref, version=version)
            product.schema = schema
            product.updated_at = datetime.now(UTC)
            self._store.save(product)

        ver = DataProductVersion(
            product_id=product_id,
            version=version,
            schema=schema or product.schema,
            fields=fields or [],
            notes=notes,
        )
        self._versions.setdefault(product_id, []).append(ver)
        return ver

    def get_versions(self, product_id: str) -> list[DataProductVersion]:
        """Get all versions of a data product, oldest first."""
        return self._versions.get(product_id, [])

    def delete(self, product_id: str) -> bool:
        """Delete a data product (only DRAFT or RETIRED)."""
        product = self._store.get(product_id)
        if product is None:
            return False
        if product.status not in (DataProductStatus.DRAFT, DataProductStatus.RETIRED):
            msg = f"Can only delete DRAFT or RETIRED products. Current: {product.status}"
            raise ValueError(msg)
        self._versions.pop(product_id, None)
        return self._store.delete(product_id)
