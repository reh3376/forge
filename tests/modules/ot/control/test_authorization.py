"""Tests for the WriteAuthorizer.

Covers:
- Permission registry (add, remove, lookup)
- Default-deny — no permissions means rejection
- Area pattern matching
- Tag pattern matching
- Role hierarchy (OPERATOR < ENGINEER < ADMIN)
- Wildcard permissions
- Multiple permissions — first match wins
"""

import pytest

from forge.modules.ot.control.models import (
    WritePermission,
    WriteRequest,
    WriteResult,
    WriteRole,
    WriteStatus,
)
from forge.modules.ot.control.authorization import WriteAuthorizer


@pytest.fixture
def authorizer() -> WriteAuthorizer:
    auth = WriteAuthorizer()
    auth.add_permission(WritePermission(
        permission_id="perm-op-dist",
        area_pattern="Distillery*",
        tag_pattern="WH/WHK01/Distillery01/**",
        min_role=WriteRole.OPERATOR,
        description="Operators can write to Distillery01 tags",
    ))
    auth.add_permission(WritePermission(
        permission_id="perm-eng-all",
        area_pattern="*",
        tag_pattern="**",
        min_role=WriteRole.ENGINEER,
        description="Engineers can write anywhere",
    ))
    return auth


def _make_request(
    tag_path: str = "WH/WHK01/Distillery01/TIT_2010/SP",
    role: WriteRole = WriteRole.OPERATOR,
    area: str = "Distillery01",
    **kw,
):
    return WriteRequest(tag_path=tag_path, value=100.0, role=role, area=area, **kw)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class TestPermissionRegistry:
    def test_add_and_get(self, authorizer: WriteAuthorizer):
        perm = authorizer.get_permission("perm-op-dist")
        assert perm is not None
        assert perm.area_pattern == "Distillery*"

    def test_get_nonexistent(self, authorizer: WriteAuthorizer):
        assert authorizer.get_permission("nope") is None

    def test_remove(self, authorizer: WriteAuthorizer):
        assert authorizer.remove_permission("perm-op-dist") is True
        assert authorizer.get_permission("perm-op-dist") is None

    def test_remove_nonexistent(self, authorizer: WriteAuthorizer):
        assert authorizer.remove_permission("nope") is False

    def test_get_all(self, authorizer: WriteAuthorizer):
        assert len(authorizer.get_all_permissions()) == 2

    def test_permission_count(self, authorizer: WriteAuthorizer):
        assert authorizer.permission_count == 2


# ---------------------------------------------------------------------------
# Default-deny
# ---------------------------------------------------------------------------


class TestDefaultDeny:
    def test_no_permissions_rejects(self):
        auth = WriteAuthorizer()
        req = _make_request()
        result = auth.authorize(req, WriteResult(request=req))
        assert result.auth_passed is False
        assert result.status == WriteStatus.REJECTED_AUTH
        assert "No write permission" in result.auth_error

    def test_no_matching_area(self, authorizer: WriteAuthorizer):
        """Operator has Distillery permission but tries to write Granary."""
        req = _make_request(
            tag_path="WH/WHK01/Granary/T01/SP",
            area="Granary",
            role=WriteRole.OPERATOR,
        )
        result = authorizer.authorize(req, WriteResult(request=req))
        assert result.auth_passed is False

    def test_no_matching_tag(self, authorizer: WriteAuthorizer):
        """Area matches but tag pattern doesn't."""
        # Remove the engineer wildcard so only operator perm remains
        authorizer.remove_permission("perm-eng-all")

        req = _make_request(
            tag_path="WH/WHK01/Granary/T01/SP",  # Doesn't match Distillery01/**
            area="Distillery01",
            role=WriteRole.OPERATOR,
        )
        result = authorizer.authorize(req, WriteResult(request=req))
        assert result.auth_passed is False


# ---------------------------------------------------------------------------
# Role hierarchy
# ---------------------------------------------------------------------------


class TestRoleHierarchy:
    def test_operator_authorized(self, authorizer: WriteAuthorizer):
        req = _make_request(role=WriteRole.OPERATOR)
        result = authorizer.authorize(req, WriteResult(request=req))
        assert result.auth_passed is True

    def test_engineer_authorized(self, authorizer: WriteAuthorizer):
        req = _make_request(role=WriteRole.ENGINEER)
        result = authorizer.authorize(req, WriteResult(request=req))
        assert result.auth_passed is True

    def test_admin_authorized(self, authorizer: WriteAuthorizer):
        req = _make_request(role=WriteRole.ADMIN)
        result = authorizer.authorize(req, WriteResult(request=req))
        assert result.auth_passed is True

    def test_operator_cannot_use_engineer_permission(self):
        """Engineer-only permission doesn't grant operator access."""
        auth = WriteAuthorizer()
        auth.add_permission(WritePermission(
            permission_id="eng-only",
            area_pattern="*",
            tag_pattern="**",
            min_role=WriteRole.ENGINEER,
        ))

        req = _make_request(role=WriteRole.OPERATOR)
        result = auth.authorize(req, WriteResult(request=req))
        assert result.auth_passed is False

    def test_admin_can_use_operator_permission(self):
        """Admin has authority over OPERATOR min_role."""
        auth = WriteAuthorizer()
        auth.add_permission(WritePermission(
            permission_id="op-perm",
            area_pattern="*",
            tag_pattern="**",
            min_role=WriteRole.OPERATOR,
        ))

        req = _make_request(role=WriteRole.ADMIN)
        result = auth.authorize(req, WriteResult(request=req))
        assert result.auth_passed is True


# ---------------------------------------------------------------------------
# Pattern matching
# ---------------------------------------------------------------------------


class TestPatternMatching:
    def test_wildcard_area(self):
        auth = WriteAuthorizer()
        auth.add_permission(WritePermission(
            permission_id="all-areas",
            area_pattern="*",
            tag_pattern="t/**",
            min_role=WriteRole.OPERATOR,
        ))

        for area in ["Distillery01", "Granary", "Bottling"]:
            req = _make_request(tag_path="t/some/tag", area=area)
            result = auth.authorize(req, WriteResult(request=req))
            assert result.auth_passed is True

    def test_specific_area_pattern(self):
        auth = WriteAuthorizer()
        auth.add_permission(WritePermission(
            permission_id="dist-only",
            area_pattern="Distillery*",
            tag_pattern="**",
            min_role=WriteRole.OPERATOR,
        ))

        req_ok = _make_request(area="Distillery01")
        assert auth.authorize(req_ok, WriteResult(request=req_ok)).auth_passed is True

        req_bad = _make_request(area="Granary")
        assert auth.authorize(req_bad, WriteResult(request=req_bad)).auth_passed is False

    def test_empty_area_matches_star(self):
        auth = WriteAuthorizer()
        auth.add_permission(WritePermission(
            permission_id="star",
            area_pattern="*",
            tag_pattern="**",
            min_role=WriteRole.OPERATOR,
        ))

        req = _make_request(area="")
        result = auth.authorize(req, WriteResult(request=req))
        assert result.auth_passed is True
