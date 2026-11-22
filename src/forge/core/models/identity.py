"""Who is acting: the signed-in user and the role they hold.

The hub authenticates; a module only reads the result, so the types live in the shared
foundation (D-17, S-3). The role model of `docs/decisions/roles.md` replaces them (FB-075).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class Role(StrEnum):
    """Gateway role hierarchy: admin > operator > viewer."""

    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"


# Numeric rank for hierarchy comparison (higher = more privileged)
ROLE_RANK: dict[Role, int] = {
    Role.VIEWER: 0,
    Role.OPERATOR: 1,
    Role.ADMIN: 2,
}


@dataclass(frozen=True)
class ForgeUser:
    """Authenticated user identity extracted from JWT or API key."""

    user_id: str
    role: Role = Role.VIEWER
    scopes: frozenset[str] = field(default_factory=frozenset)
    source: str = "jwt"  # "jwt" or "api_key"

    def has_scope(self, scope: str) -> bool:
        """Check if the user has a specific scope."""
        return scope in self.scopes

    def has_role_or_higher(self, required: Role) -> bool:
        """Check if the user's role meets or exceeds the required role."""
        return ROLE_RANK[self.role] >= ROLE_RANK[required]
