"""Role-based write authorization.

Third gate in the control write defense chain.  Enforces a default-deny
permission model: every write must be explicitly authorized by at least
one matching WritePermission grant.

A WritePermission combines:
- ``area_pattern``: fnmatch pattern against the request's area field
- ``tag_pattern``: fnmatch pattern against the request's tag_path
- ``min_role``: minimum WriteRole required

Both patterns must match AND the requestor's role must be ≥ min_role
for the permission to authorize the write.

Design notes:
- Default-deny is the ISA-62443 pattern for industrial control systems.
  Implicit write access does not exist.
- Permissions are additive — if *any* permission grants access, the
  write is authorized.  There is no explicit "deny" permission.
- ADMIN role does not automatically bypass authorization.  Even admins
  must have a matching permission.  This is deliberate: if an admin
  needs to write to a tag they don't have permission for, the correct
  action is to add a permission, not to skip the check.
"""

from __future__ import annotations

import fnmatch

from forge.modules.ot.control.models import (
    WritePermission,
    WriteRequest,
    WriteResult,
    WriteStatus,
)


class WriteAuthorizer:
    """Default-deny write authorization engine.

    Usage::

        authorizer = WriteAuthorizer()
        authorizer.add_permission(WritePermission(
            area_pattern="Distillery*",
            tag_pattern="WH/WHK01/Distillery01/**",
            min_role=WriteRole.OPERATOR,
        ))

        result = authorizer.authorize(request, result)
        # result.auth_passed is True/False
    """

    def __init__(self) -> None:
        self._permissions: dict[str, WritePermission] = {}

    # -- Permission registry -------------------------------------------------

    def add_permission(self, perm: WritePermission) -> None:
        """Register a write permission grant."""
        self._permissions[perm.permission_id] = perm

    def remove_permission(self, permission_id: str) -> bool:
        """Remove a permission. Returns True if it existed."""
        return self._permissions.pop(permission_id, None) is not None

    def get_permission(self, permission_id: str) -> WritePermission | None:
        return self._permissions.get(permission_id)

    def get_all_permissions(self) -> list[WritePermission]:
        return list(self._permissions.values())

    @property
    def permission_count(self) -> int:
        return len(self._permissions)

    # -- Authorization -------------------------------------------------------

    def authorize(
        self, request: WriteRequest, result: WriteResult
    ) -> WriteResult:
        """Check write authorization.  Mutates and returns *result*.

        Iterates all permissions — if any match, the write is authorized.
        On failure, sets ``result.status`` to REJECTED_AUTH.
        """
        for perm in self._permissions.values():
            if self._permission_matches(perm, request):
                result.auth_passed = True
                return result

        # Default-deny: no matching permission found.
        result.auth_passed = False
        result.auth_error = (
            f"No write permission for role={request.role.value} "
            f"tag={request.tag_path} area={request.area}"
        )
        result.status = WriteStatus.REJECTED_AUTH
        return result

    # -- Internals -----------------------------------------------------------

    @staticmethod
    def _permission_matches(perm: WritePermission, request: WriteRequest) -> bool:
        """Check if a single permission grants access for this request."""
        # Area pattern must match
        if not fnmatch.fnmatch(request.area, perm.area_pattern):
            return False

        # Tag pattern must match
        if not fnmatch.fnmatch(request.tag_path, perm.tag_pattern):
            return False

        # Requestor's role must be ≥ the permission's minimum role
        if not request.role.has_authority_over(perm.min_role):
            return False

        return True
