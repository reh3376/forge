"""009 — Schema Registry and equipment registry tables (BACKLOG FB-005).

``PostgresSchemaStore`` (``forge.registry.postgres_store``) and
``PostgresEquipmentStore`` (``forge.context.equipment``) have written to
``forge_core.registry_schemas``, ``forge_core.registry_versions`` and
``forge_core.equipment_registry`` since F20/F21, but no migration created the
tables, and since FB-001 the hub serves both registries from memory. This
migration creates the three tables the stores' SQL expects, column for
column (``tests/storage/test_migrations.py`` holds the alignment), and the
storage factory hands the Postgres stores to the hub.

* ``registry_schemas`` — one row per schema: identity, type, compatibility
  mode, latest version, owner, description, tags, status, timestamps.
* ``registry_versions`` — one row per (schema, version): the schema document,
  its integrity hash, description, previous version, created_at. Deleting a
  schema deletes its versions.
* ``equipment_registry`` — one row per asset of the site → area → equipment
  tree. ``parent_id`` is not a foreign key on purpose: the in-memory store
  accepts a child before its parent, and the Postgres store keeps that.

Revision ID: 009
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "registry_schemas",
        sa.Column("schema_id", sa.Text, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("schema_type", sa.Text, nullable=False),
        sa.Column("compatibility", sa.Text, nullable=False),
        sa.Column("latest_version", sa.Integer, nullable=False, server_default="0"),
        sa.Column("owner", sa.Text, nullable=False, server_default=""),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("tags", postgresql.ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema="forge_core",
    )
    op.create_index(
        "ix_forge_core_registry_schemas_type_status",
        "registry_schemas",
        ["schema_type", "status"],
        schema="forge_core",
    )
    op.create_table(
        "registry_versions",
        sa.Column(
            "schema_id",
            sa.Text,
            sa.ForeignKey("forge_core.registry_schemas.schema_id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("version", sa.Integer, primary_key=True),
        sa.Column("schema_json", postgresql.JSONB, nullable=False),
        sa.Column("integrity_hash", sa.Text, nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("previous_version", sa.Integer),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="forge_core",
    )
    op.create_table(
        "equipment_registry",
        sa.Column("equipment_id", sa.Text, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("site", sa.Text, nullable=False),
        sa.Column("area", sa.Text, nullable=False, server_default=""),
        sa.Column("parent_id", sa.Text),
        sa.Column("equipment_type", sa.Text, nullable=False, server_default=""),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("attributes", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema="forge_core",
    )
    op.create_index(
        "ix_forge_core_equipment_registry_site_area",
        "equipment_registry",
        ["site", "area"],
        schema="forge_core",
    )
    op.create_index(
        "ix_forge_core_equipment_registry_parent",
        "equipment_registry",
        ["parent_id"],
        schema="forge_core",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_forge_core_equipment_registry_parent", "equipment_registry", schema="forge_core"
    )
    op.drop_index(
        "ix_forge_core_equipment_registry_site_area", "equipment_registry", schema="forge_core"
    )
    op.drop_table("equipment_registry", schema="forge_core")
    op.drop_table("registry_versions", schema="forge_core")
    op.drop_index(
        "ix_forge_core_registry_schemas_type_status", "registry_schemas", schema="forge_core"
    )
    op.drop_table("registry_schemas", schema="forge_core")
