"""Tests for the data product registry."""

from __future__ import annotations

import pytest

from forge.core.models.data_product import DataProductStatus, QualitySLO
from forge.curation.registry import (
    DataProductField,
    DataProductRegistry,
    InMemoryProductStore,
)


class TestInMemoryProductStore:
    def test_save_and_get(self) -> None:
        from forge.core.models.data_product import DataProduct, DataProductSchema
        store = InMemoryProductStore()
        product = DataProduct(
            product_id="dp-test",
            name="Test",
            description="Test product",
            owner="tester",
            schema=DataProductSchema(schema_ref="forge://test/v1", version="1.0"),
        )
        store.save(product)
        assert store.get("dp-test") is not None
        assert store.get("dp-test").name == "Test"

    def test_list_all(self) -> None:
        from forge.core.models.data_product import DataProduct, DataProductSchema
        store = InMemoryProductStore()
        for i in range(3):
            store.save(DataProduct(
                product_id=f"dp-{i}",
                name=f"Product {i}",
                description="...",
                owner="tester",
                schema=DataProductSchema(schema_ref="forge://test", version="1.0"),
            ))
        assert len(store.list_all()) == 3

    def test_list_by_status(self) -> None:
        from forge.core.models.data_product import DataProduct, DataProductSchema
        store = InMemoryProductStore()
        store.save(DataProduct(
            product_id="dp-1", name="A", description="...", owner="o",
            status=DataProductStatus.DRAFT,
            schema=DataProductSchema(schema_ref="x", version="1"),
        ))
        store.save(DataProduct(
            product_id="dp-2", name="B", description="...", owner="o",
            status=DataProductStatus.PUBLISHED,
            schema=DataProductSchema(schema_ref="x", version="1"),
        ))
        assert len(store.list_all(DataProductStatus.DRAFT)) == 1
        assert len(store.list_all(DataProductStatus.PUBLISHED)) == 1

    def test_delete(self) -> None:
        from forge.core.models.data_product import DataProduct, DataProductSchema
        store = InMemoryProductStore()
        store.save(DataProduct(
            product_id="dp-del", name="D", description="...", owner="o",
            schema=DataProductSchema(schema_ref="x", version="1"),
        ))
        assert store.delete("dp-del")
        assert store.get("dp-del") is None
        assert not store.delete("dp-nonexistent")


class TestDataProductRegistry:
    def test_create(self, product_registry: DataProductRegistry) -> None:
        product = product_registry.create(
            name="Production Context",
            description="Test product",
            owner="reh3376",
            schema_ref="forge://schemas/production-context/v1",
        )
        assert product.product_id.startswith("dp-")
        assert product.status == DataProductStatus.DRAFT
        assert product.name == "Production Context"

    def test_get(self, product_registry: DataProductRegistry) -> None:
        product = product_registry.create(
            name="Test", description="...", owner="o",
            schema_ref="forge://test/v1",
        )
        retrieved = product_registry.get(product.product_id)
        assert retrieved is not None
        assert retrieved.name == "Test"

    def test_get_nonexistent(self, product_registry: DataProductRegistry) -> None:
        assert product_registry.get("dp-nonexistent") is None

    def test_list_products(self, product_registry: DataProductRegistry) -> None:
        product_registry.create(name="A", description="...", owner="o", schema_ref="x")
        product_registry.create(name="B", description="...", owner="o", schema_ref="x")
        assert len(product_registry.list_products()) == 2

    def test_publish(self, product_registry: DataProductRegistry) -> None:
        product = product_registry.create(
            name="Test", description="...", owner="o", schema_ref="x",
        )
        published = product_registry.publish(product.product_id)
        assert published.status == DataProductStatus.PUBLISHED

    def test_publish_non_draft_raises(self, product_registry: DataProductRegistry) -> None:
        product = product_registry.create(
            name="Test", description="...", owner="o", schema_ref="x",
        )
        product_registry.publish(product.product_id)
        with pytest.raises(ValueError, match="Can only publish DRAFT"):
            product_registry.publish(product.product_id)

    def test_deprecate(self, product_registry: DataProductRegistry) -> None:
        product = product_registry.create(
            name="Test", description="...", owner="o", schema_ref="x",
        )
        product_registry.publish(product.product_id)
        deprecated = product_registry.deprecate(product.product_id)
        assert deprecated.status == DataProductStatus.DEPRECATED

    def test_retire(self, product_registry: DataProductRegistry) -> None:
        product = product_registry.create(
            name="Test", description="...", owner="o", schema_ref="x",
        )
        product_registry.publish(product.product_id)
        product_registry.deprecate(product.product_id)
        retired = product_registry.retire(product.product_id)
        assert retired.status == DataProductStatus.RETIRED

    def test_lifecycle_invalid_transition(
        self, product_registry: DataProductRegistry,
    ) -> None:
        product = product_registry.create(
            name="Test", description="...", owner="o", schema_ref="x",
        )
        with pytest.raises(ValueError, match="Can only deprecate PUBLISHED"):
            product_registry.deprecate(product.product_id)

    def test_add_version(self, product_registry: DataProductRegistry) -> None:
        product = product_registry.create(
            name="Test", description="...", owner="o", schema_ref="x",
        )
        ver = product_registry.add_version(
            product.product_id,
            version="0.2.0",
            schema_ref="forge://test/v2",
            notes="Added new field",
        )
        assert ver.version == "0.2.0"
        versions = product_registry.get_versions(product.product_id)
        assert len(versions) == 2  # initial + new

    def test_create_with_slos(self, product_registry: DataProductRegistry) -> None:
        slos = [
            QualitySLO(metric="completeness", target=95.0, measurement="pct non-null"),
            QualitySLO(metric="freshness", target=99.0, measurement="pct within 1hr"),
        ]
        product = product_registry.create(
            name="Test", description="...", owner="o",
            schema_ref="x", quality_slos=slos,
        )
        assert len(product.quality_slos) == 2

    def test_create_with_fields(self, product_registry: DataProductRegistry) -> None:
        fields = [
            DataProductField(name="temperature", field_type="float64", source_context_field="raw"),
            DataProductField(name="equipment_id", field_type="string"),
        ]
        product = product_registry.create(
            name="Test", description="...", owner="o",
            schema_ref="x", fields=fields,
        )
        versions = product_registry.get_versions(product.product_id)
        assert len(versions[0].fields) == 2

    def test_delete_draft(self, product_registry: DataProductRegistry) -> None:
        product = product_registry.create(
            name="Test", description="...", owner="o", schema_ref="x",
        )
        assert product_registry.delete(product.product_id)
        assert product_registry.get(product.product_id) is None

    def test_delete_published_raises(self, product_registry: DataProductRegistry) -> None:
        product = product_registry.create(
            name="Test", description="...", owner="o", schema_ref="x",
        )
        product_registry.publish(product.product_id)
        with pytest.raises(ValueError, match="Can only delete DRAFT or RETIRED"):
            product_registry.delete(product.product_id)

    def test_publish_nonexistent_raises(
        self, product_registry: DataProductRegistry,
    ) -> None:
        with pytest.raises(KeyError, match="not found"):
            product_registry.publish("dp-nonexistent")
