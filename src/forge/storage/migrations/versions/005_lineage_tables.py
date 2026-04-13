"""005 — Lineage tracking tables.

Mirrors LineageEntry and TransformationStep dataclasses from
src/forge/curation/lineage.py.

Revision ID: 005
Create Date: 2026-04-12
"""

import sqlalchemy as sa
from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Lineage entries
    op.create_table(
        "lineage_entries",
        sa.Column("lineage_id", sa.Text, primary_key=True),
        sa.Column("source_record_ids", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("output_record_id", sa.Text, nullable=False, server_default=""),
        sa.Column("product_id", sa.Text, nullable=False, server_default=""),
        sa.Column("adapter_ids", sa.JSON, nullable=False, server_default="[]"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        schema="forge_core",
    )

    op.create_index(
        "idx_lineage_product",
        "lineage_entries",
        ["product_id"],
        schema="forge_core",
    )
    op.create_index(
        "idx_lineage_output",
        "lineage_entries",
        ["output_record_id"],
        schema="forge_core",
    )

    # Transformation steps
    op.create_table(
        "transformation_steps",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("lineage_id", sa.Text, nullable=False),
        sa.Column("step_name", sa.Text, nullable=False),
        sa.Column("component", sa.Text, nullable=False),
        sa.Column("description", sa.Text, server_default=""),
        sa.Column("parameters", sa.JSON, server_default="{}"),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("step_order", sa.Integer, nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["lineage_id"],
            ["forge_core.lineage_entries.lineage_id"],
        ),
        schema="forge_core",
    )


def downgrade() -> None:
    op.drop_table("transformation_steps", schema="forge_core")
    op.drop_table("lineage_entries", schema="forge_core")
