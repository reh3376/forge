"""010 — the curation spec of a data product (BACKLOG FB-009).

``DataProduct.curation`` says how the curation engine builds the product's
pipeline (normalise, time window, group-by, aggregation functions) and
whether the ingest path runs it. ``forge_canonical.data_products`` gains the
column; NULL means the default spec (5-minute buckets, AVG by equipment_id),
which is what every product had before.

Revision ID: 010
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("data_products", sa.Column("curation", sa.JSON), schema="forge_canonical")


def downgrade() -> None:
    op.drop_column("data_products", "curation", schema="forge_canonical")
