"""001 — Forge Core PostgreSQL schema.

Replaces inline SQL from deploy/docker/init-entrypoint.sh lines 106-140.
Creates the core Forge tables: adapters, records log, governance reports,
schema entries, module permissions, and access audit log.

Revision ID: 001
Create Date: 2026-04-12
"""

import sqlalchemy as sa
from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create forge_core schema
    op.execute("CREATE SCHEMA IF NOT EXISTS forge_core")

    # Adapters (was forge_adapters in inline SQL)
    op.create_table(
        "adapters",
        sa.Column("adapter_id", sa.Text, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("version", sa.Text, nullable=False, server_default="0.1.0"),
        sa.Column("type", sa.Text, nullable=False, server_default="INGESTION"),
        sa.Column("tier", sa.Text, nullable=False, server_default="MES_MOM"),
        sa.Column("protocol", sa.Text, nullable=False, server_default="grpc"),
        sa.Column(
            "registered_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("last_health_at", sa.DateTime(timezone=True)),
        sa.Column("state", sa.Text, nullable=False, server_default="REGISTERED"),
        sa.Column("manifest", sa.JSON),
        schema="forge_core",
    )

    # Records log (was forge_records_log)
    op.create_table(
        "records_log",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("adapter_id", sa.Text, nullable=False),
        sa.Column("batch_size", sa.Integer, nullable=False),
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["adapter_id"],
            ["forge_core.adapters.adapter_id"],
        ),
        schema="forge_core",
    )

    # Governance reports (was forge_governance_reports)
    op.create_table(
        "governance_reports",
        sa.Column("report_id", sa.Text, primary_key=True),
        sa.Column("framework", sa.Text, nullable=False),
        sa.Column("target", sa.Text, nullable=False),
        sa.Column("passed", sa.Boolean, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("report", sa.JSON),
        schema="forge_core",
    )

    # Schema entries (mirrors SchemaEntry dataclass)
    op.create_table(
        "schema_entries",
        sa.Column("schema_id", sa.Text, primary_key=True),
        sa.Column("spoke_id", sa.Text, nullable=False),
        sa.Column("entity_name", sa.Text, nullable=False),
        sa.Column("version", sa.Text, nullable=False),
        sa.Column("schema_json", sa.JSON, nullable=False),
        sa.Column("canonical_model", sa.Text),
        sa.Column("authoritative_spoke", sa.Text),
        sa.Column("storage_engine", sa.Text, nullable=False, server_default="postgresql"),
        sa.Column("storage_namespace", sa.Text),
        sa.Column("retention_policy", sa.Text, server_default="permanent"),
        sa.Column("integrity_hash", sa.Text),
        sa.Column("status", sa.Text, nullable=False, server_default="draft"),
        sa.Column(
            "registered_at",
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
        schema="forge_core",
    )

    # Module permissions (mirrors ModulePermission dataclass)
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

    # Access audit log (immutable)
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


def downgrade() -> None:
    op.drop_table("access_audit_log", schema="forge_core")
    op.drop_table("module_permissions", schema="forge_core")
    op.drop_table("schema_entries", schema="forge_core")
    op.drop_table("governance_reports", schema="forge_core")
    op.drop_table("records_log", schema="forge_core")
    op.drop_table("adapters", schema="forge_core")
    op.execute("DROP SCHEMA IF EXISTS forge_core CASCADE")
