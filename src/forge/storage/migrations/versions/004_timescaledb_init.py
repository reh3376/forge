"""004 — TimescaleDB hypertables for time-series data.

Replaces inline SQL from deploy/docker/init-entrypoint.sh lines 145-171.
Creates the contextual_records hypertable and adapter_metrics hypertable.

NOTE: This migration targets TimescaleDB (FORGE_MIGRATE_TARGET=timescale).

Revision ID: 004
Create Date: 2026-04-12
"""

import sqlalchemy as sa
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")

    # Contextual records hypertable
    op.create_table(
        "contextual_records",
        sa.Column("time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("adapter_id", sa.Text, nullable=False),
        sa.Column("source_entity", sa.Text),
        sa.Column("source_field", sa.Text),
        sa.Column("value_float", sa.Float),
        sa.Column("value_text", sa.Text),
        sa.Column("quality_code", sa.Integer, server_default="192"),
        sa.Column("context", sa.JSON, server_default="{}"),
    )

    op.execute(
        "SELECT create_hypertable('contextual_records', 'time', "
        "if_not_exists => TRUE, "
        "chunk_time_interval => INTERVAL '1 day')"
    )

    op.create_index(
        "idx_cr_adapter",
        "contextual_records",
        ["adapter_id", sa.text("time DESC")],
    )
    op.create_index(
        "idx_cr_entity",
        "contextual_records",
        ["source_entity", sa.text("time DESC")],
    )

    # Adapter metrics hypertable
    op.create_table(
        "adapter_metrics",
        sa.Column("time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("adapter_id", sa.Text, nullable=False),
        sa.Column("metric_name", sa.Text, nullable=False),
        sa.Column("metric_value", sa.Float, nullable=False),
        sa.Column("labels", sa.JSON, server_default="{}"),
    )

    op.execute(
        "SELECT create_hypertable('adapter_metrics', 'time', "
        "if_not_exists => TRUE, "
        "chunk_time_interval => INTERVAL '1 day')"
    )

    op.create_index(
        "idx_am_adapter",
        "adapter_metrics",
        ["adapter_id", sa.text("time DESC")],
    )


def downgrade() -> None:
    op.drop_table("adapter_metrics")
    op.drop_table("contextual_records")
