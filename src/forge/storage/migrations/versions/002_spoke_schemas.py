"""002 — Per-spoke PostgreSQL schemas with scoped roles.

Creates isolated schemas for each spoke module and scoped
PostgreSQL roles that enforce single-writer access.

The downgrade drops everything a role holds in this database before the
role itself: PostgreSQL refuses ``DROP ROLE`` while the role still owns an
object or holds a privilege, and after the upgrade each role holds ``USAGE``
on ``forge_core`` and ``SELECT`` on its tables (FB-098).

The roles are created ``NOLOGIN`` and without a password: ``forge db access
issue`` turns login on with a Forge-issued password (FB-057). Until
2026-10-26 this revision created them ``LOGIN PASSWORD 'changeme'``;
migration 012 repairs a database that applied that text (FB-099).

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
        # The spoke's role, idempotent, with no way in until `forge db access issue`
        # turns login on with a password Forge generated (FB-057, FB-099).
        role_name = f"forge_{schema}"
        op.execute(
            f"DO $$ BEGIN "
            f"  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{role_name}') THEN "
            f"    CREATE ROLE {role_name} NOLOGIN; "
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
        op.execute(f"GRANT SELECT ON ALL TABLES IN SCHEMA forge_core TO {role_name}")


def downgrade() -> None:
    for schema in reversed(SPOKE_SCHEMAS):
        role_name = f"forge_{schema}"
        # CASCADE takes the schema's objects, its ACL and its default privileges with it.
        op.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
        # DROP OWNED BY revokes every privilege the role holds in this database (the
        # forge_core grants above, anything `forge db access` granted since, FB-057) and
        # drops any object it owns; only then can the role go. Everything sits inside the
        # existence check, so a role already gone is not an error.
        op.execute(
            f"DO $$ BEGIN "
            f"  IF EXISTS (SELECT FROM pg_roles WHERE rolname = '{role_name}') THEN "
            f"    DROP OWNED BY {role_name}; "
            f"    DROP ROLE {role_name}; "
            f"  END IF; "
            f"END $$"
        )
