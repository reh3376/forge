"""``DataProduct`` keeps ``schema`` as the wire name of ``product_schema`` (FB-086)."""

from __future__ import annotations

import json

from forge.core.models.data_product import DataProduct, DataProductSchema

_SCHEMA = DataProductSchema(schema_ref="forge://schemas/test/v1", version="1.0.0")
_BASE = {"product_id": "dp-1", "name": "Test", "description": "A product", "owner": "tester"}


def test_attribute_is_product_schema_and_does_not_shadow_base_model() -> None:
    assert "schema" not in DataProduct.model_fields
    assert DataProduct.model_fields["product_schema"].alias == "schema"
    assert callable(DataProduct.schema)  # the (deprecated) BaseModel classmethod is reachable again


def test_constructs_by_alias_and_by_name() -> None:
    by_alias = DataProduct(**_BASE, schema=_SCHEMA)
    by_name = DataProduct(**_BASE, product_schema=_SCHEMA)
    assert by_alias.product_schema == by_name.product_schema == _SCHEMA


def test_validates_json_with_schema_key() -> None:
    product = DataProduct.model_validate({**_BASE, "schema": _SCHEMA.model_dump()})
    assert product.product_schema.schema_ref == "forge://schemas/test/v1"


def test_dumps_schema_key_not_attribute_name() -> None:
    product = DataProduct(**_BASE, product_schema=_SCHEMA)
    dumped = product.model_dump()
    assert "schema" in dumped and "product_schema" not in dumped
    assert json.loads(product.model_dump_json())["schema"]["version"] == "1.0.0"


def test_json_schema_exposes_schema_property() -> None:
    props = DataProduct.model_json_schema()["properties"]
    assert "schema" in props and "product_schema" not in props
    assert "schema" in DataProduct.model_json_schema()["required"]
