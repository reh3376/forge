"""Access Controller — permissioned database access for Forge modules.

Forge Core owns every database instance. Modules (WMS, MES, CMMS, etc.)
connect with Forge-issued credentials scoped to their authorized schemas.
The Access Controller manages permission grants, enforces single-writer
rules, issues connection strings, and audits all access changes.

Key invariants:
    - A module can only read/write schemas it has been explicitly granted.
    - Each entity has exactly one authoritative writer (from Schema Registry).
    - forge_canonical is read-only for all modules (written by curation).
    - forge_core is accessible only to Forge Core (ADMIN).
    - All grants are immutably logged.
"""

from __future__ import annotations

import logging
import re
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any, Protocol
from urllib.parse import quote

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Sequence

logger = logging.getLogger(__name__)


class AccessLevel(StrEnum):
    """Database access levels for module permissions."""

    READ = "read"
    WRITE = "write"
    ADMIN = "admin"


@dataclass
class ModulePermission:
    """A database access grant for a Forge module.

    Attributes:
        module_id: Module requesting access (e.g., "whk-wms")
        schema_name: Target schema (e.g., "mod_wms", "forge_canonical")
        access_level: READ, WRITE, or ADMIN
        granted_at: When the permission was granted
        granted_by: Who granted it ("forge-core" or admin user)
        expires_at: Optional TTL for temporary grants
        active: Whether the grant is currently active
    """

    module_id: str
    schema_name: str
    access_level: AccessLevel
    granted_at: datetime = field(default_factory=lambda: datetime.now(tz=UTC))
    granted_by: str = "forge-core"
    expires_at: datetime | None = None
    active: bool = True

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return datetime.now(tz=UTC) > self.expires_at

    @property
    def is_effective(self) -> bool:
        return self.active and not self.is_expired


@dataclass(repr=False)
class ConnectionGrant:
    """An issued connection string for a module to access Forge databases."""

    module_id: str
    connection_string: str
    schemas_accessible: list[str]
    access_level: AccessLevel
    issued_at: datetime = field(default_factory=lambda: datetime.now(tz=UTC))
    role: str = ""
    search_path: str = ""
    password: str = field(default="", repr=False)
    statements: list[str] = field(default_factory=list, repr=False)

    def redacted(self) -> str:
        """The connection string with the password masked (safe for logs and terminals)."""
        return re.sub(r"://([^:/@]+):[^@]*@", r"://\1:***@", self.connection_string)

    def __repr__(self) -> str:
        return (
            f"ConnectionGrant(module_id={self.module_id!r}, role={self.role!r}, "
            f"schemas={self.schemas_accessible!r}, access_level={self.access_level.value!r}, "
            f"dsn={self.redacted()!r}, issued_at={self.issued_at.isoformat()!r})"
        )


@dataclass
class AccessAuditEntry:
    """Immutable audit record of an access control action."""

    action: str  # "grant", "revoke", "connection_issued", "access_denied"
    module_id: str
    schema_name: str
    access_level: AccessLevel | None = None
    reason: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(tz=UTC))


# Protected schemas that modules cannot be granted write access to
_PROTECTED_SCHEMAS = frozenset(
    {
        "forge_core",
        "forge_canonical",
        "curated",
        "lineage",
    }
)

# Module id → schema naming, shared with migration 002 (BACKLOG FB-004)
_MODULE_PREFIXES = ("forge-", "whk-")
_IDENT = re.compile(r"[a-z_][a-z0-9_]*")


def module_schema(module_id: str) -> str:
    """``forge-mes`` → ``mod_mes``, ``whk-wms`` → ``mod_wms`` (the schemas of migration 002)."""
    name = module_id.strip().lower()
    for prefix in _MODULE_PREFIXES:
        if name.startswith(prefix):
            name = name[len(prefix) :]
            break
    name = re.sub(r"[^a-z0-9]+", "_", name).strip("_")
    if not name:
        msg = f"cannot derive a schema name from module id {module_id!r}"
        raise ValueError(msg)
    return f"mod_{name}"


def schema_role(schema_name: str) -> str:
    """The PostgreSQL role migration 002 creates for a module schema: ``forge_<schema>``."""
    return f"forge_{_ident(schema_name)}"


def _ident(name: str) -> str:
    if not _IDENT.fullmatch(name):
        msg = f"unsafe SQL identifier: {name!r}"
        raise ValueError(msg)
    return name


def _literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def provisioning_statements(
    role: str, password: str, grants: Iterable[tuple[str, AccessLevel]]
) -> list[str]:
    """SQL that makes ``role`` exist with ``password`` and the schema rights in ``grants``.

    READ: USAGE on the schema and SELECT on its tables, now and by default on
    future ones. WRITE: also INSERT, UPDATE, DELETE and sequence use. ADMIN:
    also CREATE on the schema, so the module may run its own DDL there (the
    MES bridge does, through Prisma, until the hub owns that DDL). Every
    statement is idempotent: re-issuing rotates the password and re-applies
    the grants.
    """
    r = _ident(role)
    statements = [
        "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = "
        f"{_literal(role)}) THEN CREATE ROLE {r}; END IF; END $$",
        f"ALTER ROLE {r} WITH LOGIN PASSWORD {_literal(password)}",
    ]
    for schema_name, level in grants:
        s = _ident(schema_name)
        tables = "SELECT" if level == AccessLevel.READ else "SELECT, INSERT, UPDATE, DELETE"
        usage = "USAGE, CREATE" if level == AccessLevel.ADMIN else "USAGE"
        statements.append(f"GRANT {usage} ON SCHEMA {s} TO {r}")
        statements.append(f"GRANT {tables} ON ALL TABLES IN SCHEMA {s} TO {r}")
        statements.append(f"ALTER DEFAULT PRIVILEGES IN SCHEMA {s} GRANT {tables} ON TABLES TO {r}")
        if level != AccessLevel.READ:
            statements.append(f"GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA {s} TO {r}")
            statements.append(
                f"ALTER DEFAULT PRIVILEGES IN SCHEMA {s} GRANT USAGE, SELECT, UPDATE "
                f"ON SEQUENCES TO {r}"
            )
    return statements


@dataclass
class AccessController:
    """Manages permissioned database access for Forge modules.

    Phase 1: in-memory permission store for development and testing.
    Phase 2: PostgreSQL-backed persistence in forge_core.module_permissions.

    Usage::

        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        ac.grant("whk-wms", "forge_canonical", AccessLevel.READ)

        if ac.check("whk-wms", "mod_wms", AccessLevel.WRITE):
            # proceed with write
            ...

        conn = ac.issue_connection("whk-wms", pg_host="forge-pg", pg_port=5432)
    """

    _permissions: list[ModulePermission] = field(default_factory=list, init=False)
    _audit_log: list[AccessAuditEntry] = field(default_factory=list, init=False)

    @classmethod
    def restore(cls, permissions: Iterable[ModulePermission]) -> AccessController:
        """A controller seeded from persisted grants (:meth:`PermissionStore.list_permissions`)."""
        controller = cls()
        controller._permissions.extend(permissions)
        return controller

    def all_permissions(self) -> list[ModulePermission]:
        """Every grant row, revoked and expired ones included (what persistence writes)."""
        return list(self._permissions)

    def grant(
        self,
        module_id: str,
        schema_name: str,
        access_level: AccessLevel,
        granted_by: str = "forge-core",
        expires_at: datetime | None = None,
    ) -> ModulePermission:
        """Grant a module access to a schema.

        Raises ValueError if attempting to grant WRITE or ADMIN
        to a protected schema (forge_core, forge_canonical, etc.).
        """
        # Enforce protected schema rules
        if schema_name in _PROTECTED_SCHEMAS and access_level != AccessLevel.READ:
            self._audit(
                "access_denied",
                module_id,
                schema_name,
                access_level,
                f"Cannot grant {access_level.value} to protected schema {schema_name}",
            )
            raise ValueError(
                f"Cannot grant {access_level.value} access to protected "
                f"schema '{schema_name}'. Protected schemas are read-only "
                f"for modules."
            )

        # Check for existing grant and update if found
        for perm in self._permissions:
            if perm.module_id == module_id and perm.schema_name == schema_name and perm.active:
                perm.access_level = access_level
                perm.granted_at = datetime.now(tz=UTC)
                perm.granted_by = granted_by
                perm.expires_at = expires_at
                self._audit("grant", module_id, schema_name, access_level, "updated")
                logger.info(
                    "Updated grant: %s → %s [%s]",
                    module_id,
                    schema_name,
                    access_level.value,
                )
                return perm

        # Create new grant
        perm = ModulePermission(
            module_id=module_id,
            schema_name=schema_name,
            access_level=access_level,
            granted_by=granted_by,
            expires_at=expires_at,
        )
        self._permissions.append(perm)
        self._audit("grant", module_id, schema_name, access_level, "new")
        logger.info(
            "Granted: %s → %s [%s]",
            module_id,
            schema_name,
            access_level.value,
        )
        return perm

    def revoke(self, module_id: str, schema_name: str) -> bool:
        """Revoke a module's access to a schema. Returns True if found."""
        for perm in self._permissions:
            if perm.module_id == module_id and perm.schema_name == schema_name and perm.active:
                perm.active = False
                self._audit(
                    "revoke",
                    module_id,
                    schema_name,
                    perm.access_level,
                    "revoked",
                )
                logger.info("Revoked: %s → %s", module_id, schema_name)
                return True
        return False

    def check(
        self,
        module_id: str,
        schema_name: str,
        required_level: AccessLevel,
    ) -> bool:
        """Check if a module has the required access level for a schema.

        Access levels are hierarchical: ADMIN > WRITE > READ.
        A WRITE grant satisfies a READ check. An ADMIN grant satisfies all.
        """
        level_hierarchy = {
            AccessLevel.READ: 0,
            AccessLevel.WRITE: 1,
            AccessLevel.ADMIN: 2,
        }

        for perm in self._permissions:
            if (
                perm.module_id == module_id
                and perm.schema_name == schema_name
                and perm.is_effective
                and level_hierarchy[perm.access_level] >= level_hierarchy[required_level]
            ):
                return True
        return False

    def list_grants(self, module_id: str | None = None) -> list[ModulePermission]:
        """List active permission grants, optionally filtered by module."""
        grants = [p for p in self._permissions if p.is_effective]
        if module_id:
            grants = [p for p in grants if p.module_id == module_id]
        return grants

    def list_modules_for_schema(self, schema_name: str) -> list[str]:
        """List all modules with active access to a schema."""
        return list(
            {
                p.module_id
                for p in self._permissions
                if p.schema_name == schema_name and p.is_effective
            }
        )

    def issue_connection(
        self,
        module_id: str,
        pg_host: str = "forge-pg",
        pg_port: int = 5432,
        pg_database: str = "forge",
        *,
        password: str | None = None,
        provisioner: Callable[[Sequence[str]], Any] | None = None,
    ) -> ConnectionGrant:
        """Issue the module's connection string, provisioning its role through ``provisioner``.

        The role is the one migration 002 creates for the module's own schema
        (``forge_mod_mes``); a module holding only READ grants gets
        ``forge_<module>_ro``. The password is generated unless given, set on the
        role by the provisioner (``ALTER ROLE ... PASSWORD``, so re-issuing rotates
        it) and returned only inside the grant: the controller never stores it.
        The connection string carries ``?schema=<own schema>`` (what Prisma and
        most drivers read); ``search_path`` lists every accessible schema for
        clients that set it themselves.

        Raises ValueError if the module has no active grants.
        """
        grants = self.list_grants(module_id)
        if not grants:
            self._audit(
                "access_denied",
                module_id,
                "",
                None,
                "No active grants — connection refused",
            )
            raise ValueError(
                f"Module '{module_id}' has no active permission grants. "
                f"Cannot issue connection string."
            )
        order = {AccessLevel.READ: 0, AccessLevel.WRITE: 1, AccessLevel.ADMIN: 2}
        max_level = max(grants, key=lambda g: order[g.access_level])
        writable = [g for g in grants if g.access_level != AccessLevel.READ]
        if writable:
            own = module_schema(module_id)
            primary = next((g for g in writable if g.schema_name == own), writable[0])
            role = schema_role(primary.schema_name)
        else:
            primary = grants[0]
            role = f"forge_{re.sub(r'[^a-z0-9]+', '_', module_id.lower()).strip('_')}_ro"
        schemas = [primary.schema_name] + [g.schema_name for g in grants if g is not primary]
        secret = password or secrets.token_urlsafe(24)
        statements = provisioning_statements(
            role, secret, [(g.schema_name, g.access_level) for g in grants]
        )
        if provisioner is not None:
            provisioner(statements)
        search_path = ",".join(schemas)
        conn_str = (
            f"postgresql://{role}:{quote(secret, safe='')}@{pg_host}:{pg_port}"
            f"/{pg_database}?schema={schemas[0]}"
        )
        grant = ConnectionGrant(
            module_id=module_id,
            connection_string=conn_str,
            schemas_accessible=schemas,
            access_level=max_level.access_level,
            role=role,
            search_path=search_path,
            password=secret,
            statements=statements,
        )
        self._audit(
            "connection_issued",
            module_id,
            search_path,
            max_level.access_level,
            f"role={role} provisioned={'yes' if provisioner is not None else 'no'}",
        )
        logger.info("Issued connection: %s → %s (schemas: %s)", module_id, role, search_path)
        return grant

    def setup_default_grants(self) -> list[ModulePermission]:
        """Create the standard permission grants for all known modules.

        Each module gets WRITE on its own schema and READ on forge_canonical.
        """
        modules = ("whk-wms", "forge-mes", "whk-erpi", "whk-cmms", "whk-nms", "whk-ims")
        defaults = [(module_id, module_schema(module_id)) for module_id in modules]

        grants = []
        for module_id, schema_name in defaults:
            grants.append(self.grant(module_id, schema_name, AccessLevel.WRITE))
            grants.append(self.grant(module_id, "forge_canonical", AccessLevel.READ))

        return grants

    @property
    def audit_log(self) -> list[AccessAuditEntry]:
        return list(self._audit_log)

    @property
    def grant_count(self) -> int:
        return len([p for p in self._permissions if p.is_effective])

    def _audit(
        self,
        action: str,
        module_id: str,
        schema_name: str,
        access_level: AccessLevel | None,
        reason: str,
    ) -> None:
        self._audit_log.append(
            AccessAuditEntry(
                action=action,
                module_id=module_id,
                schema_name=schema_name,
                access_level=access_level,
                reason=reason,
            )
        )


# ---------------------------------------------------------------------------
# Persistence (Phase 2): forge_core.module_permissions / access_audit (migration 008)
# ---------------------------------------------------------------------------


class PermissionStore(Protocol):
    """Where grants and the access audit live between CLI runs."""

    async def list_permissions(self) -> list[ModulePermission]: ...

    async def upsert(self, perm: ModulePermission) -> None: ...

    async def deactivate(self, module_id: str, schema_name: str) -> None: ...

    async def append_audit(self, entry: AccessAuditEntry) -> None: ...


class InMemoryPermissionStore:
    """Dictionary-backed store (tests, ``--dry-run``)."""

    def __init__(self) -> None:
        self.permissions: dict[tuple[str, str], ModulePermission] = {}
        self.audit: list[AccessAuditEntry] = []

    async def list_permissions(self) -> list[ModulePermission]:
        return list(self.permissions.values())

    async def upsert(self, perm: ModulePermission) -> None:
        self.permissions[(perm.module_id, perm.schema_name)] = perm

    async def deactivate(self, module_id: str, schema_name: str) -> None:
        perm = self.permissions.get((module_id, schema_name))
        if perm is not None:
            perm.active = False

    async def append_audit(self, entry: AccessAuditEntry) -> None:
        self.audit.append(entry)


_UPSERT_PERMISSION = """
INSERT INTO forge_core.module_permissions
    (module_id, schema_name, access_level, granted_at, granted_by, expires_at, active)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (module_id, schema_name) DO UPDATE SET
    access_level = EXCLUDED.access_level,
    granted_at = EXCLUDED.granted_at,
    granted_by = EXCLUDED.granted_by,
    expires_at = EXCLUDED.expires_at,
    active = EXCLUDED.active
"""

_SELECT_PERMISSIONS = """
SELECT module_id, schema_name, access_level, granted_at, granted_by, expires_at, active
FROM forge_core.module_permissions
ORDER BY module_id, schema_name
"""

_DEACTIVATE_PERMISSION = """
UPDATE forge_core.module_permissions SET active = FALSE
WHERE module_id = $1 AND schema_name = $2
"""

_INSERT_AUDIT = """
INSERT INTO forge_core.access_audit
    (action, module_id, schema_name, access_level, reason, timestamp)
VALUES ($1, $2, $3, $4, $5, $6)
"""


class PostgresPermissionStore:
    """asyncpg-backed :class:`PermissionStore` over ``forge_core`` (migration 008)."""

    def __init__(self, pool: Any) -> None:
        self._pool = pool

    async def list_permissions(self) -> list[ModulePermission]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(_SELECT_PERMISSIONS)
        return [
            ModulePermission(
                module_id=row["module_id"],
                schema_name=row["schema_name"],
                access_level=AccessLevel(row["access_level"]),
                granted_at=row["granted_at"],
                granted_by=row["granted_by"],
                expires_at=row["expires_at"],
                active=row["active"],
            )
            for row in rows
        ]

    async def upsert(self, perm: ModulePermission) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                _UPSERT_PERMISSION,
                perm.module_id,
                perm.schema_name,
                perm.access_level.value,
                perm.granted_at,
                perm.granted_by,
                perm.expires_at,
                perm.active,
            )

    async def deactivate(self, module_id: str, schema_name: str) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(_DEACTIVATE_PERMISSION, module_id, schema_name)

    async def append_audit(self, entry: AccessAuditEntry) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                _INSERT_AUDIT,
                entry.action,
                entry.module_id,
                entry.schema_name,
                entry.access_level.value if entry.access_level else None,
                entry.reason,
                entry.timestamp,
            )
