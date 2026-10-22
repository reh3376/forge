"""011 — one column per RecordContext slot on forge_ts.contextual_records (BACKLOG FB-013).

Migration 006 gave the hypertable four context columns (``equipment_id``,
``area``, ``batch_id``, ``operating_mode``) and ``context_extra`` for what a
spoke adds; the writer dropped the other slots (``site``, ``lot_id``,
``recipe_id``, ``shift``, ``operator_id``). FB-013 aligns ``RecordContext``
with the context field registry (``shift_id``, ``event_type``,
``event_timestamp``, ``work_order_id`` join the slots), so the table gains
one column per slot and ``TimescaleRecordWriter`` writes them all.

Revision ID: 011
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None

_TEXT_COLUMNS = (
    "site",
    "lot_id",
    "recipe_id",
    "shift_id",
    "operator_id",
    "event_type",
    "work_order_id",
)


def upgrade() -> None:
    for name in _TEXT_COLUMNS:
        op.add_column("contextual_records", sa.Column(name, sa.Text), schema="forge_ts")
    op.add_column(
        "contextual_records",
        sa.Column("event_timestamp", sa.DateTime(timezone=True)),
        schema="forge_ts",
    )


def downgrade() -> None:
    op.drop_column("contextual_records", "event_timestamp", schema="forge_ts")
    for name in reversed(_TEXT_COLUMNS):
        op.drop_column("contextual_records", name, schema="forge_ts")
