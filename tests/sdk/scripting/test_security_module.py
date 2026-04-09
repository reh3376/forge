"""Tests for the forge.security SDK module."""

import pytest

from forge.sdk.scripting.modules.security import SecurityModule, UserInfo


# ---------------------------------------------------------------------------
# Mock user provider
# ---------------------------------------------------------------------------


class MockUserProvider:
    """Mock user backend for testing."""

    def __init__(self):
        self._users = {}

    def add_user(self, username, **kwargs):
        self._users[username] = {"username": username, **kwargs}

    async def get_user(self, username):
        return self._users.get(username)

    async def list_users(self):
        return list(self._users.values())


# ---------------------------------------------------------------------------
# SecurityModule
# ---------------------------------------------------------------------------


class TestSecurityModule:
    """Tests for the SecurityModule."""

    def test_default_username(self):
        sm = SecurityModule()
        assert sm.get_username() == ""

    def test_bind_sets_username(self):
        sm = SecurityModule()
        sm.bind(current_username="pmannion")
        assert sm.get_username() == "pmannion"

    def test_set_current_user(self):
        sm = SecurityModule()
        sm.set_current_user("admin")
        assert sm.get_username() == "admin"

    @pytest.mark.asyncio
    async def test_get_user_from_cache(self):
        sm = SecurityModule()
        sm.register_user(UserInfo(
            username="pmannion",
            display_name="Patrick Mannion",
            email="pmannion@whiskeyhouse.com",
            roles=("admin", "engineer"),
        ))
        user = await sm.get_user("pmannion")
        assert user is not None
        assert user.display_name == "Patrick Mannion"
        assert "admin" in user.roles

    @pytest.mark.asyncio
    async def test_get_user_not_found(self):
        sm = SecurityModule()
        user = await sm.get_user("nonexistent")
        assert user is None

    @pytest.mark.asyncio
    async def test_get_user_from_provider(self):
        provider = MockUserProvider()
        provider.add_user("admin", display_name="Admin", roles=["admin"])

        sm = SecurityModule()
        sm.bind(user_provider=provider)
        user = await sm.get_user("admin")
        assert user is not None
        assert user.display_name == "Admin"

    @pytest.mark.asyncio
    async def test_get_users_from_provider(self):
        provider = MockUserProvider()
        provider.add_user("user1", display_name="User One")
        provider.add_user("user2", display_name="User Two")

        sm = SecurityModule()
        sm.bind(user_provider=provider)
        users = await sm.get_users()
        assert len(users) == 2

    @pytest.mark.asyncio
    async def test_get_users_from_cache(self):
        sm = SecurityModule()
        sm.register_user(UserInfo(username="a"))
        sm.register_user(UserInfo(username="b"))
        users = await sm.get_users()
        assert len(users) == 2

    @pytest.mark.asyncio
    async def test_has_role_true(self):
        sm = SecurityModule()
        sm.register_user(UserInfo(username="admin", roles=("admin", "engineer")))
        assert await sm.has_role("admin", "admin") is True

    @pytest.mark.asyncio
    async def test_has_role_false(self):
        sm = SecurityModule()
        sm.register_user(UserInfo(username="viewer", roles=("viewer",)))
        assert await sm.has_role("admin", "viewer") is False

    @pytest.mark.asyncio
    async def test_has_role_user_not_found(self):
        sm = SecurityModule()
        assert await sm.has_role("admin", "nonexistent") is False

    @pytest.mark.asyncio
    async def test_get_current_user(self):
        sm = SecurityModule()
        sm.bind(current_username="pmannion")
        sm.register_user(UserInfo(
            username="pmannion",
            display_name="Patrick Mannion",
        ))
        user = await sm.get_user()  # No arg → uses current user
        assert user is not None
        assert user.username == "pmannion"

    def test_user_info_frozen(self):
        user = UserInfo(username="test", roles=("admin",))
        with pytest.raises(AttributeError):
            user.username = "changed"  # type: ignore

    def test_user_info_defaults(self):
        user = UserInfo(username="test")
        assert user.display_name == ""
        assert user.email == ""
        assert user.roles == ()
        assert user.enabled is True
