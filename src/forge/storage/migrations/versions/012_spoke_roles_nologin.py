"""012 — spoke roles lose the placeholder login 002's earlier text gave them (BACKLOG FB-099).

Until 2026-10-26 migration 002 created the six spoke roles ``LOGIN PASSWORD
'changeme'``, so on a database that applied that text anyone who can reach
the port can log in as ``forge_mod_<x>`` until ``forge db access issue``
rotates the password (FB-057), and a spoke never issued keeps the
placeholder for good. 002 now creates the roles ``NOLOGIN`` without a
password; this revision repairs the databases migrated before it.

Every spoke role that can log in and that Forge has never issued a
connection for (no ``connection_issued`` row in ``forge_core.access_audit``
naming it as provisioned) is set ``NOLOGIN`` and its placeholder password
cleared. A role Forge did issue keeps
its login: its password is the Forge-issued one. A role provisioned by any
other path loses its login here and gets it back, with a fresh password,
from ``forge db access issue``. Fail closed.

The downgrade restores nothing: the placeholder login is not a state to
return to, and a role stays ``NOLOGIN`` until issued.

Revision ID: 012
Create Date: 2026-10-26
"""

from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None

# The roles 002 creates, one per spoke schema (kept in step by the migration tests).
SPOKE_ROLES = (
    "forge_mod_wms",
    "forge_mod_mes",
    "forge_mod_erpi",
    "forge_mod_cmms",
    "forge_mod_nms",
    "forge_mod_ims",
)


def upgrade() -> None:
    for role_name in SPOKE_ROLES:
        # The reason text is exactly what AccessController.record_issued audits for a
        # provisioned issue; a dry run audits provisioned=no and does not count.
        op.execute(
            f"DO $$ BEGIN "
            f"  IF EXISTS (SELECT FROM pg_roles WHERE rolname = '{role_name}' AND rolcanlogin) "
            f"     AND NOT EXISTS (SELECT FROM forge_core.access_audit "
            f"                     WHERE action = 'connection_issued' "
            f"                       AND reason = 'role={role_name} provisioned=yes') THEN "
            f"    ALTER ROLE {role_name} NOLOGIN PASSWORD NULL; "
            f"  END IF; "
            f"END $$"
        )


def downgrade() -> None:
    # Nothing to restore: a role without login is the state 002 now creates.
    pass
