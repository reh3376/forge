"""Script RBAC — role-based access control for script write operations.

Every script has an owner (set via ``__forge_owner__`` attribute or
defaulting to the directory-level owner).  Write operations in scripts
(tag writes, DB mutations) are checked against the owner's permissions
before being allowed.

This is NOT a security boundary (scripts run in the same process).
It is an operational guardrail that prevents:
    - A commissioning script from writing to production areas
    - A monitoring script from accidentally mutating tag values
    - Cross-area writes without explicit authorization

Design decisions:
    D1: Permission model is area-based + tag-pattern-based.  An owner
        can be granted write access to specific areas and/or tag patterns.
        This mirrors how Ignition's security zones work.
    D2: Default policy is DENY — scripts with no explicit grants cannot
        write.  This forces conscious permission configuration.
    D3: The RBAC check is synchronous and in-memory (dict lookup) to
        avoid adding latency to the tag write hot path.
    D4: Audit integration — every permission check (pass or fail) can
        be logged via the audit trail system.
"""

from __future__ import annotations

import fnmatch
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Permission model
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ScriptPermission:
    """A write permission grant for a script owner.

    Either area_pattern or tag_pattern (or both) must be set.
    If both are set, both must match for the permission to apply.
    """

    owner: str
    area_pattern: str = "*"       # fnmatch pattern for area names
    tag_pattern: str = "**"       # tag path pattern (same as trigger patterns)
    can_write_tags: bool = True
    can_write_db: bool = False
    granted_at: datetime = field(default_factory=lambda: datetime.now(tz=timezone.utc))
    granted_by: str = "forge-admin"
    description: str = ""


@dataclass
class PermissionCheckResult:
    """Result of an RBAC permission check."""

    allowed: bool
    owner: str
    operation: str
    target: str
    matching_permission: ScriptPermission | None = None
    reason: str = ""


# ---------------------------------------------------------------------------
# ScriptRBAC
# ---------------------------------------------------------------------------


class ScriptRBAC:
    """In-memory RBAC engine for script write operations.

    Usage::

        rbac = ScriptRBAC()
        rbac.grant(ScriptPermission(owner="commissioning", area_pattern="Distillery01"))
        rbac.grant(ScriptPermission(owner="monitoring", can_write_tags=False))

        result = rbac.check_tag_write("commissioning", "WH/WHK01/Distillery01/SP/Temp", area="Distillery01")
        assert result.allowed is True

        result = rbac.check_tag_write("monitoring", "WH/WHK01/Distillery01/SP/Temp", area="Distillery01")
        assert result.allowed is False
    """

    def __init__(self, default_policy: str = "deny") -> None:
        self._permissions: list[ScriptPermission] = []
        self._default_policy = default_policy  # "deny" or "allow"

    @property
    def permission_count(self) -> int:
        return len(self._permissions)

    def grant(self, permission: ScriptPermission) -> None:
        """Add a permission grant."""
        self._permissions.append(permission)
        logger.info(
            "RBAC grant: owner=%s area=%s tags=%s write_tags=%s write_db=%s",
            permission.owner, permission.area_pattern, permission.tag_pattern,
            permission.can_write_tags, permission.can_write_db,
        )

    def revoke(self, owner: str) -> int:
        """Revoke all permissions for an owner. Returns count removed."""
        before = len(self._permissions)
        self._permissions = [p for p in self._permissions if p.owner != owner]
        removed = before - len(self._permissions)
        if removed:
            logger.info("RBAC revoke: owner=%s, removed=%d", owner, removed)
        return removed

    def check_tag_write(
        self,
        owner: str,
        tag_path: str,
        area: str = "",
    ) -> PermissionCheckResult:
        """Check if a script owner can write to a tag.

        Args:
            owner: The script's __forge_owner__ value.
            tag_path: Target tag path.
            area: Resolved area (from enrichment pipeline).

        Returns:
            PermissionCheckResult with allowed flag and reason.
        """
        for perm in self._permissions:
            if perm.owner != owner:
                continue
            if not perm.can_write_tags:
                continue
            if not fnmatch.fnmatch(area or "", perm.area_pattern):
                continue
            if not _match_tag_pattern_simple(perm.tag_pattern, tag_path):
                continue
            return PermissionCheckResult(
                allowed=True,
                owner=owner,
                operation="tag_write",
                target=tag_path,
                matching_permission=perm,
                reason=f"Matched grant: area={perm.area_pattern} tags={perm.tag_pattern}",
            )

        # No matching grant found
        if self._default_policy == "allow":
            return PermissionCheckResult(
                allowed=True, owner=owner, operation="tag_write",
                target=tag_path, reason="Default policy: allow",
            )

        return PermissionCheckResult(
            allowed=False, owner=owner, operation="tag_write",
            target=tag_path,
            reason=f"No matching permission for owner={owner!r} on tag={tag_path!r} area={area!r}",
        )

    def check_db_write(self, owner: str, db_name: str = "default") -> PermissionCheckResult:
        """Check if a script owner can write to a database."""
        for perm in self._permissions:
            if perm.owner != owner:
                continue
            if not perm.can_write_db:
                continue
            return PermissionCheckResult(
                allowed=True, owner=owner, operation="db_write",
                target=db_name, matching_permission=perm,
                reason=f"Matched grant: owner={perm.owner} can_write_db=True",
            )

        if self._default_policy == "allow":
            return PermissionCheckResult(
                allowed=True, owner=owner, operation="db_write",
                target=db_name, reason="Default policy: allow",
            )

        return PermissionCheckResult(
            allowed=False, owner=owner, operation="db_write",
            target=db_name,
            reason=f"No db_write permission for owner={owner!r}",
        )

    def get_permissions(self, owner: str) -> list[ScriptPermission]:
        """Get all permissions for a specific owner."""
        return [p for p in self._permissions if p.owner == owner]

    def clear(self) -> None:
        """Remove all permissions."""
        self._permissions.clear()


# ---------------------------------------------------------------------------
# Pattern matching (simplified — reuses trigger pattern logic)
# ---------------------------------------------------------------------------


def _match_tag_pattern_simple(pattern: str, tag_path: str) -> bool:
    """Match a tag path against a pattern.

    Supports:
        ``*``  → matches one path segment
        ``**`` → matches any depth
    """
    if pattern == "**":
        return True

    parts = pattern.split("/")
    regex_parts = []
    for part in parts:
        if part == "**":
            regex_parts.append(".*")
        elif "*" in part:
            regex_parts.append(part.replace("*", "[^/]+"))
        else:
            regex_parts.append(re.escape(part))
    regex = "^" + "/".join(regex_parts) + "$"
    return bool(re.match(regex, tag_path))
