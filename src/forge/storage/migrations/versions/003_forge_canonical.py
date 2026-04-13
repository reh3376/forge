"""003 — Forge Canonical schema for curated data products.

Mirrors the DataProduct Pydantic model from
src/forge/core/models/data_product.py.

Revision ID: 003
Create Date: 2026-04-12
"""

import sqlalchemy as sa
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS forge_canonical")

    # Data products (mirrors DataProduct model)
    op.create_table(
        "data_products",
        sa.Column("product_id", sa.Text, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("owner", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="DRAFT"),
        sa.Column("schema_ref", sa.Text),
        sa.Column("schema_version", sa.Text),
        sa.Column("compatibility_mode", sa.Text, server_default="BACKWARD"),
        sa.Column("source_adapters", sa.JSON, server_default="[]"),
        sa.Column("quality_slos", sa.JSON, server_default="[]"),
        sa.Column("tags", sa.JSON, server_default="[]"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("metadata", sa.JSON, server_default="{}"),
        schema="forge_canonical",
    )

    # Data product versions (for schema evolution tracking)
    op.create_table(
        "data_product_versions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("product_id", sa.Text, nullable=False),
        sa.Column("version", sa.Text, nullable=False),
        sa.Column("schema_json", sa.JSON, nullable=False),
        sa.Column("change_description", sa.Text),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["forge_canonical.data_products.product_id"],
        ),
        schema="forge_canonical",
    )

    # Data product fields (field-level metadata)
    op.create_table(
        "data_product_fields",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("product_id", sa.Text, nullable=False),
        sa.Column("field_name", sa.Text, nullable=False),
        sa.Column("field_type", sa.Text, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("nullable", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("source_mapping", sa.Text),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["forge_canonical.data_products.product_id"],
        ),
        schema="forge_canonical",
    )


def downgrade() -> None:
    op.drop_table("data_product_fields", schema="forge_canonical")
    op.drop_table("data_product_versions", schema="forge_canonical")
    op.drop_table("data_products", schema="forge_canonical")
    op.execute("DROP SCHEMA IF EXISTS forge_canonical CASCADE")
