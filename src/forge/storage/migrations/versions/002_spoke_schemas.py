"""002 — Per-spoke PostgreSQL schemas with scoped roles.

Creates isolated schemas for each spoke module and scoped
PostgreSQL roles that enforce single-writer access.

Revision ID: 002
Create Date: 2026-04-12
"""

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

SPOKE_SCHEMAS = [
    "mod_wms",
    "mod_mes",
    "mod_erpi",
    "mod_cmms",
    "mod_nms",
    "mod_ims",
]


def upgrade() -> None:
    for schema in SPOKE_SCHEMAS:
        op.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")
        # Create a scoped role for this spoke (idempotent)
        role_name = f"forge_{schema}"
        op.execute(
            f"DO $$ BEGIN "
            f"  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{role_name}') THEN "
            f"    CREATE ROLE {role_name} LOGIN PASSWORD 'changeme'; "
            f"  END IF; "
            f"END $$"
        )
        op.execute(f"GRANT USAGE ON SCHEMA {schema} TO {role_name}")
        op.execute(
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} "
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {role_name}"
        )
        # Grant read-only on forge_core
        op.execute(f"GRANT USAGE ON SCHEMA forge_core TO {role_name}")
        op.execute(
            f"GRANT SELECT ON ALL TABLES IN SCHEMA forge_core TO {role_name}"
        )


def downgrade() -> None:
    for schema in reversed(SPOKE_SCHEMAS):
        role_name = f"forge_{schema}"
        op.execute(f"REVOKE ALL ON SCHEMA {schema} FROM {role_name}")
        op.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
        op.execute(
            f"DO $$ BEGIN "
            f"  IF EXISTS (SELECT FROM pg_roles WHERE rolname = '{role_name}') THEN "
            f"    DROP ROLE {role_name}; "
            f"  END IF; "
            f"END $$"
        )
