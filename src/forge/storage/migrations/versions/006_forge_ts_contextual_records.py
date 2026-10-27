"""006 — forge_ts.contextual_records matching TimescaleRecordWriter.

Migration 004 created ``public.contextual_records`` with a narrow,
metric-style layout (source_entity, value_float, value_text, ...), but the
writer and reader in ``forge.storage.engines.timescale`` target
``forge_ts.contextual_records`` with one column per ContextualRecord field.
Any write through the hub ingest pipeline would have failed against the
migrated schema. This revision creates the table the engine actually uses
and leaves the 004 table in place for anything still reading it.

The hypertable conversion only runs when the timescaledb extension is
present, so the same revision chain applies to a plain PostgreSQL target.

The downgrade removes the ``forge_ts`` schema it created along with the
table, without cascade: anything else placed in the schema since stops the
downgrade instead of vanishing with it (FB-101).

Revision ID: 006
Create Date: 2026-10-15
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import DropSchema

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS forge_ts")
    op.create_table(
        "contextual_records",
        sa.Column("time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("adapter_id", sa.Text, nullable=False),
        sa.Column("system", sa.Text, nullable=False),
        sa.Column("tag_path", sa.Text),
        sa.Column("raw_value", sa.Text),
        sa.Column("engineering_units", sa.Text),
        sa.Column("quality", sa.Text, nullable=False, server_default="GOOD"),
        sa.Column("data_type", sa.Text),
        sa.Column("equipment_id", sa.Text),
        sa.Column("area", sa.Text),
        sa.Column("batch_id", sa.Text),
        sa.Column("operating_mode", sa.Text),
        sa.Column("context_extra", sa.Text),
        sa.Column("schema_ref", sa.Text),
        sa.Column("adapter_version", sa.Text),
        schema="forge_ts",
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                PERFORM create_hypertable(
                    'forge_ts.contextual_records', 'time',
                    if_not_exists => TRUE,
                    chunk_time_interval => INTERVAL '1 day'
                );
            END IF;
        END
        $$;
        """
    )
    op.create_index(
        "idx_fts_cr_adapter_time",
        "contextual_records",
        ["adapter_id", sa.text("time DESC")],
        schema="forge_ts",
    )
    op.create_index(
        "idx_fts_cr_equipment_time",
        "contextual_records",
        ["equipment_id", sa.text("time DESC")],
        schema="forge_ts",
    )
    op.create_index(
        "idx_fts_cr_batch_time",
        "contextual_records",
        ["batch_id", sa.text("time DESC")],
        schema="forge_ts",
    )
    op.create_index(
        "idx_fts_cr_record_id",
        "contextual_records",
        ["record_id"],
        schema="forge_ts",
    )


def downgrade() -> None:
    op.drop_table("contextual_records", schema="forge_ts")
    # 011 only adds columns to that table, so the schema is empty here; no cascade,
    # so a foreign object in it is an error to look at rather than a silent loss.
    op.execute(DropSchema("forge_ts", if_exists=True))
