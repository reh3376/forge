"""Gateway data models — users, configuration, and security types."""

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


@dataclass
class AuthConfig:
    """Authentication configuration."""

    enabled: bool = True
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    api_keys: dict[str, ForgeUser] = field(default_factory=dict)


@dataclass
class RBACConfig:
    """RBAC configuration."""

    enabled: bool = True
    default_role: Role = Role.VIEWER


@dataclass
class RateLimitConfig:
    """Rate limiting configuration."""

    enabled: bool = True
    redis_url: str = "redis://localhost:6379"
    default_rpm: int = 120
    default_burst: int = 10
