"""forge.security — User/security information SDK module.

Replaces Ignition's ``system.security.*`` and ``system.user.*`` functions
for querying the current user, checking permissions, and listing users.

In Forge, user identity flows from the session context (set by the
ScriptEngine based on the trigger source).  The module does NOT manage
authentication directly — that's handled by the API layer.

Usage in scripts::

    import forge

    username = forge.security.get_username()
    user = await forge.security.get_user(username)
    has_access = await forge.security.has_role("operator")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("forge.security")


# ---------------------------------------------------------------------------
# User model
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class UserInfo:
    """Information about a user."""

    username: str
    display_name: str = ""
    email: str = ""
    roles: tuple[str, ...] = ()
    enabled: bool = True
    last_login: str = ""


# ---------------------------------------------------------------------------
# SecurityModule
# ---------------------------------------------------------------------------


class SecurityModule:
    """The forge.security SDK module — user and permissions facade.

    In production, this is backed by the authentication provider
    (WorkOS, Azure AD, etc.).  For scripting, it provides a simple
    interface to query the current user and check roles.
    """

    def __init__(self) -> None:
        self._current_username: str = ""
        self._user_provider: Any = None  # Auth backend, set via bind()
        self._users: dict[str, UserInfo] = {}  # In-memory cache for testing

    def bind(
        self,
        user_provider: Any = None,
        current_username: str = "system",
    ) -> None:
        """Bind to a user provider and set the current user.

        Args:
            user_provider: Authentication backend (optional).
            current_username: Default username for gateway-scoped scripts.
        """
        self._user_provider = user_provider
        self._current_username = current_username
        logger.debug("forge.security bound (user=%s)", current_username)

    def set_current_user(self, username: str) -> None:
        """Set the current user (called per-request or per-session)."""
        self._current_username = username

    def get_username(self) -> str:
        """Get the current user's username.

        Replaces: ``system.security.getUsername()``
        """
        return self._current_username

    async def get_user(self, username: str | None = None) -> UserInfo | None:
        """Get user information.

        Args:
            username: Username to look up (defaults to current user).

        Returns:
            UserInfo or None if not found.

        Replaces: ``system.user.getUser(source, username)``
        """
        uname = username or self._current_username
        if not uname:
            return None

        # Check in-memory cache first
        if uname in self._users:
            return self._users[uname]

        # Delegate to provider
        if self._user_provider is not None:
            try:
                user_data = await self._user_provider.get_user(uname)
                if user_data:
                    return UserInfo(
                        username=user_data.get("username", uname),
                        display_name=user_data.get("display_name", ""),
                        email=user_data.get("email", ""),
                        roles=tuple(user_data.get("roles", [])),
                        enabled=user_data.get("enabled", True),
                    )
            except Exception as exc:
                logger.error("Failed to get user %s: %s", uname, exc)

        return None

    async def get_users(self) -> list[UserInfo]:
        """List all users.

        Replaces: ``system.user.getUsers(source)``
        """
        if self._user_provider is not None:
            try:
                users_data = await self._user_provider.list_users()
                return [
                    UserInfo(
                        username=u.get("username", ""),
                        display_name=u.get("display_name", ""),
                        email=u.get("email", ""),
                        roles=tuple(u.get("roles", [])),
                        enabled=u.get("enabled", True),
                    )
                    for u in users_data
                ]
            except Exception as exc:
                logger.error("Failed to list users: %s", exc)

        return list(self._users.values())

    async def has_role(self, role: str, username: str | None = None) -> bool:
        """Check if a user has a specific role.

        Args:
            role: Role name to check.
            username: User to check (defaults to current user).

        Returns:
            True if the user has the role.
        """
        user = await self.get_user(username)
        if user is None:
            return False
        return role in user.roles

    def register_user(self, user: UserInfo) -> None:
        """Register a user in the in-memory cache (for testing)."""
        self._users[user.username] = user


# Module-level singleton
_instance = SecurityModule()

get_username = _instance.get_username
get_user = _instance.get_user
get_users = _instance.get_users
has_role = _instance.has_role
set_current_user = _instance.set_current_user
register_user = _instance.register_user
bind = _instance.bind
