"""008 — persisted module → schema permissions and access audit (BACKLOG FB-057, FB-003).

``AccessController`` (``forge.storage.access``) kept its grants in memory
("Phase 1"). From here on they persist, so a grant made today still exists
when a credential is issued tomorrow:

* ``forge_core.module_permissions`` — one row per (module, schema), that pair
  being the key the store's upsert conflicts on: the access level, who
  granted it, when, an optional expiry and the active flag.
* ``forge_core.access_audit`` — every grant, revoke, issued connection and
  refusal, append-only. Never holds a password.

Migration 001 had already created ``forge_core.module_permissions`` (a
surrogate ``id`` key, no unique (module, schema) pair) and
``forge_core.access_audit_log`` for a Postgres controller that was never
written (FB-003), so neither ever held a row. This revision replaces both.
Until 2026-10-22 it re-created ``module_permissions`` instead and failed on
every database that had applied 001, so no database carries its earlier text.

Revision ID: 008
Create Date: 2026-10-16
"""

import sqlalchemy as sa
from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The 001 tables: never written (FB-003), replaced by the shapes below.
    op.drop_table("access_audit_log", schema="forge_core")
    op.drop_table("module_permissions", schema="forge_core")

    op.create_table(
        "module_permissions",
        sa.Column("module_id", sa.Text, primary_key=True),
        sa.Column("schema_name", sa.Text, primary_key=True),
        sa.Column("access_level", sa.Text, nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("granted_by", sa.Text, nullable=False, server_default="forge-core"),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        schema="forge_core",
    )
    op.create_table(
        "access_audit",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("action", sa.Text, nullable=False),
        sa.Column("module_id", sa.Text, nullable=False),
        sa.Column("schema_name", sa.Text, nullable=False, server_default=""),
        sa.Column("access_level", sa.Text),
        sa.Column("reason", sa.Text, nullable=False, server_default=""),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        schema="forge_core",
    )
    op.create_index(
        "ix_forge_core_access_audit_module_time",
        "access_audit",
        ["module_id", sa.text("timestamp DESC")],
        schema="forge_core",
    )


def downgrade() -> None:
    op.drop_index("ix_forge_core_access_audit_module_time", "access_audit", schema="forge_core")
    op.drop_table("access_audit", schema="forge_core")
    op.drop_table("module_permissions", schema="forge_core")

    # Back to the 001 shapes, so 001's own downgrade finds what it created.
    op.create_table(
        "module_permissions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("module_id", sa.Text, nullable=False),
        sa.Column("schema_name", sa.Text, nullable=False),
        sa.Column("access_level", sa.Text, nullable=False),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("granted_by", sa.Text, nullable=False, server_default="forge-core"),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        schema="forge_core",
    )
    op.create_table(
        "access_audit_log",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("module_id", sa.Text, nullable=False),
        sa.Column("action", sa.Text, nullable=False),
        sa.Column("schema_name", sa.Text, nullable=False),
        sa.Column("access_level", sa.Text),
        sa.Column("granted_by", sa.Text),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("details", sa.JSON),
        schema="forge_core",
    )
