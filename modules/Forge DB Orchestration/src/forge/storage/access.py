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
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from forge._compat import StrEnum

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
    granted_at: datetime = field(
        default_factory=lambda: datetime.now(tz=timezone.utc)
    )
    granted_by: str = "forge-core"
    expires_at: datetime | None = None
    active: bool = True

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return datetime.now(tz=timezone.utc) > self.expires_at

    @property
    def is_effective(self) -> bool:
        return self.active and not self.is_expired


@dataclass
class ConnectionGrant:
    """An issued connection string for a module to access Forge databases."""

    module_id: str
    connection_string: str
    schemas_accessible: list[str]
    access_level: AccessLevel
    issued_at: datetime = field(
        default_factory=lambda: datetime.now(tz=timezone.utc)
    )


@dataclass
class AccessAuditEntry:
    """Immutable audit record of an access control action."""

    action: str  # "grant", "revoke", "connection_issued", "access_denied"
    module_id: str
    schema_name: str
    access_level: AccessLevel | None = None
    reason: str = ""
    timestamp: datetime = field(
        default_factory=lambda: datetime.now(tz=timezone.utc)
    )


# Protected schemas that modules cannot be granted write access to
_PROTECTED_SCHEMAS = frozenset({
    "forge_core",
    "forge_canonical",
    "curated",
    "lineage",
})


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

    _permissions: list[ModulePermission] = field(
        default_factory=list, init=False
    )
    _audit_log: list[AccessAuditEntry] = field(
        default_factory=list, init=False
    )

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
            if (
                perm.module_id == module_id
                and perm.schema_name == schema_name
                and perm.active
            ):
                perm.access_level = access_level
                perm.granted_at = datetime.now(tz=timezone.utc)
                perm.granted_by = granted_by
                perm.expires_at = expires_at
                self._audit(
                    "grant", module_id, schema_name, access_level, "updated"
                )
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
            if (
                perm.module_id == module_id
                and perm.schema_name == schema_name
                and perm.active
            ):
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
            ):
                if level_hierarchy[perm.access_level] >= level_hierarchy[required_level]:
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
        return list({
            p.module_id
            for p in self._permissions
            if p.schema_name == schema_name and p.is_effective
        })

    def issue_connection(
        self,
        module_id: str,
        pg_host: str = "forge-pg",
        pg_port: int = 5432,
        pg_database: str = "forge",
    ) -> ConnectionGrant:
        """Issue a connection string for a module with its authorized schemas.

        The connection string includes a search_path scoped to the
        module's authorized schemas. Forge Core enforces the permission
        model — the connection string is the delivery mechanism.

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

        schemas = [g.schema_name for g in grants]
        max_level = max(grants, key=lambda g: {
            AccessLevel.READ: 0,
            AccessLevel.WRITE: 1,
            AccessLevel.ADMIN: 2,
        }[g.access_level])

        # Role name derived from module_id
        role = f"{module_id.replace('-', '_')}_{'rw' if max_level.access_level != AccessLevel.READ else 'ro'}"
        search_path = ",".join(schemas)

        conn_str = (
            f"postgresql://{role}:managed@{pg_host}:{pg_port}"
            f"/{pg_database}?search_path={search_path}"
        )

        grant = ConnectionGrant(
            module_id=module_id,
            connection_string=conn_str,
            schemas_accessible=schemas,
            access_level=max_level.access_level,
        )

        self._audit(
            "connection_issued",
            module_id,
            search_path,
            max_level.access_level,
            f"role={role}",
        )
        logger.info(
            "Issued connection: %s → %s (schemas: %s)",
            module_id,
            role,
            search_path,
        )
        return grant

    def setup_default_grants(self) -> list[ModulePermission]:
        """Create the standard permission grants for all known modules.

        Each module gets WRITE on its own schema and READ on forge_canonical.
        """
        defaults = [
            ("whk-wms", "mod_wms"),
            ("whk-mes", "mod_mes"),
            ("whk-erpi", "mod_erpi"),
            ("whk-cmms", "mod_cmms"),
            ("whk-nms", "mod_nms"),
            ("whk-ims", "mod_ims"),
        ]

        grants = []
        for module_id, schema_name in defaults:
            grants.append(
                self.grant(module_id, schema_name, AccessLevel.WRITE)
            )
            grants.append(
                self.grant(module_id, "forge_canonical", AccessLevel.READ)
            )

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
