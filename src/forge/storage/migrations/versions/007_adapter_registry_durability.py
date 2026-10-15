"""007 — durable adapter registry and ingest log (BACKLOG FB-060).

Migration 001 created ``forge_core.adapters`` and ``forge_core.records_log``
but the hub never wrote to them. ``PostgresAdapterRegistryStore`` now does,
and needs a little more than 001 provided:

* ``adapters.health`` — the last heartbeat (``AdapterHealth`` JSON).
* ``records_log.session_id`` plus the batch outcome counters
  (``accepted``, ``rejected``, ``persisted``, ``failed``, ``errors``), so a
  row says what happened to the batch, not just that it arrived.
* An index on ``(adapter_id, ingested_at DESC)`` for the per-adapter log.

Revision ID: 007
Create Date: 2026-10-16
"""

import sqlalchemy as sa
from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("adapters", sa.Column("health", sa.JSON), schema="forge_core")
    op.add_column("records_log", sa.Column("session_id", sa.Text), schema="forge_core")
    for name in ("accepted", "rejected", "persisted", "failed"):
        op.add_column(
            "records_log",
            sa.Column(name, sa.Integer, nullable=False, server_default="0"),
            schema="forge_core",
        )
    op.add_column("records_log", sa.Column("errors", sa.JSON), schema="forge_core")
    op.create_index(
        "ix_forge_core_records_log_adapter_time",
        "records_log",
        ["adapter_id", sa.text("ingested_at DESC")],
        schema="forge_core",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_forge_core_records_log_adapter_time", table_name="records_log", schema="forge_core"
    )
    for name in ("errors", "failed", "persisted", "rejected", "accepted", "session_id"):
        op.drop_column("records_log", name, schema="forge_core")
    op.drop_column("adapters", "health", schema="forge_core")
