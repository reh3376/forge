"""Gateway data models — users, configuration, and security types."""

from __future__ import annotations

from dataclasses import dataclass, field

from forge_core.models.identity import ROLE_RANK, ForgeUser, Role


@dataclass
class AuthConfig:
    """Authentication configuration."""

    enabled: bool = True
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    #: Every accepted JWT must name this issuer and this audience (FB-291).
    jwt_issuer: str = ""
    jwt_audience: str = ""
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


__all__ = ["ROLE_RANK", "AuthConfig", "ForgeUser", "RBACConfig", "Role"]
