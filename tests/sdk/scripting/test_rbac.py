"""Tests for ScriptRBAC — role-based access control for script writes."""

import pytest

from forge.sdk.scripting.rbac import (
    PermissionCheckResult,
    ScriptPermission,
    ScriptRBAC,
    _match_tag_pattern_simple,
)


# ---------------------------------------------------------------------------
# Pattern matching
# ---------------------------------------------------------------------------


class TestTagPatternMatching:

    def test_double_star_matches_everything(self):
        assert _match_tag_pattern_simple("**", "WH/WHK01/Distillery01/TIT/Out_PV") is True

    def test_exact_match(self):
        assert _match_tag_pattern_simple("WH/WHK01/TIT/Out_PV", "WH/WHK01/TIT/Out_PV") is True

    def test_exact_mismatch(self):
        assert _match_tag_pattern_simple("WH/WHK01/TIT/Out_PV", "WH/WHK01/FIT/Out_PV") is False

    def test_single_star_matches_one_segment(self):
        assert _match_tag_pattern_simple("WH/*/TIT/Out_PV", "WH/WHK01/TIT/Out_PV") is True

    def test_single_star_does_not_match_multiple_segments(self):
        assert _match_tag_pattern_simple("WH/*/Out_PV", "WH/WHK01/TIT/Out_PV") is False

    def test_double_star_matches_multiple_segments(self):
        assert _match_tag_pattern_simple("WH/**/Out_PV", "WH/WHK01/Distillery01/TIT/Out_PV") is True

    def test_trailing_double_star(self):
        assert _match_tag_pattern_simple("WH/WHK01/**", "WH/WHK01/Distillery01/TIT/Out_PV") is True

    def test_leading_double_star(self):
        assert _match_tag_pattern_simple("**/Out_PV", "WH/WHK01/TIT/Out_PV") is True

    def test_empty_tag_path(self):
        assert _match_tag_pattern_simple("**", "") is True

    def test_single_segment(self):
        assert _match_tag_pattern_simple("*", "TIT") is True


# ---------------------------------------------------------------------------
# Default deny policy
# ---------------------------------------------------------------------------


class TestDefaultDeny:

    def test_no_grants_denies_tag_write(self):
        rbac = ScriptRBAC()
        result = rbac.check_tag_write("unknown_owner", "WH/WHK01/TIT/Out_PV")
        assert result.allowed is False
        assert "No matching permission" in result.reason

    def test_no_grants_denies_db_write(self):
        rbac = ScriptRBAC()
        result = rbac.check_db_write("unknown_owner")
        assert result.allowed is False

    def test_wrong_owner_denied(self):
        rbac = ScriptRBAC()
        rbac.grant(ScriptPermission(owner="commissioning", area_pattern="*"))
        result = rbac.check_tag_write("monitoring", "WH/WHK01/TIT/Out_PV")
        assert result.allowed is False


# ---------------------------------------------------------------------------
# Default allow policy
# ---------------------------------------------------------------------------


class TestDefaultAllow:

    def test_allow_policy_permits_without_grants(self):
        rbac = ScriptRBAC(default_policy="allow")
        result = rbac.check_tag_write("anyone", "WH/WHK01/TIT/Out_PV")
        assert result.allowed is True
        assert "Default policy" in result.reason

    def test_allow_policy_db_write(self):
        rbac = ScriptRBAC(default_policy="allow")
        result = rbac.check_db_write("anyone")
        assert result.allowed is True


# ---------------------------------------------------------------------------
# Tag write grants
# ---------------------------------------------------------------------------


class TestTagWriteGrants:

    @pytest.fixture
    def rbac(self):
        r = ScriptRBAC()
        r.grant(ScriptPermission(
            owner="commissioning",
            area_pattern="Distillery01",
            tag_pattern="WH/WHK01/Distillery01/**",
        ))
        r.grant(ScriptPermission(
            owner="monitoring",
            can_write_tags=False,  # read-only
        ))
        return r

    def test_matching_grant_allows(self, rbac):
        result = rbac.check_tag_write(
            "commissioning", "WH/WHK01/Distillery01/TIT/Out_PV",
            area="Distillery01",
        )
        assert result.allowed is True
        assert result.matching_permission is not None
        assert result.matching_permission.owner == "commissioning"

    def test_wrong_area_denies(self, rbac):
        result = rbac.check_tag_write(
            "commissioning", "WH/WHK01/Granary01/TIT/Out_PV",
            area="Granary01",
        )
        assert result.allowed is False

    def test_wrong_tag_pattern_denies(self, rbac):
        result = rbac.check_tag_write(
            "commissioning", "WH/WHK02/Distillery01/TIT/Out_PV",
            area="Distillery01",
        )
        assert result.allowed is False

    def test_read_only_owner_denied(self, rbac):
        result = rbac.check_tag_write(
            "monitoring", "WH/WHK01/Distillery01/TIT/Out_PV",
            area="Distillery01",
        )
        assert result.allowed is False

    def test_wildcard_area_grant(self):
        rbac = ScriptRBAC()
        rbac.grant(ScriptPermission(owner="admin", area_pattern="*", tag_pattern="**"))
        result = rbac.check_tag_write("admin", "WH/WHK01/TIT/Out_PV", area="Distillery01")
        assert result.allowed is True

    def test_no_area_with_star_pattern(self):
        rbac = ScriptRBAC()
        rbac.grant(ScriptPermission(owner="global", area_pattern="*", tag_pattern="**"))
        # Empty area string should match "*" via fnmatch
        result = rbac.check_tag_write("global", "WH/TIT/Out_PV", area="")
        assert result.allowed is True


# ---------------------------------------------------------------------------
# DB write grants
# ---------------------------------------------------------------------------


class TestDbWriteGrants:

    def test_db_write_allowed(self):
        rbac = ScriptRBAC()
        rbac.grant(ScriptPermission(owner="etl", can_write_db=True))
        result = rbac.check_db_write("etl")
        assert result.allowed is True

    def test_db_write_denied_without_flag(self):
        rbac = ScriptRBAC()
        rbac.grant(ScriptPermission(owner="etl", can_write_db=False))
        result = rbac.check_db_write("etl")
        assert result.allowed is False


# ---------------------------------------------------------------------------
# Permission management
# ---------------------------------------------------------------------------


class TestPermissionManagement:

    def test_grant_increments_count(self):
        rbac = ScriptRBAC()
        assert rbac.permission_count == 0
        rbac.grant(ScriptPermission(owner="a"))
        assert rbac.permission_count == 1

    def test_revoke_removes_all_for_owner(self):
        rbac = ScriptRBAC()
        rbac.grant(ScriptPermission(owner="a", area_pattern="area1"))
        rbac.grant(ScriptPermission(owner="a", area_pattern="area2"))
        rbac.grant(ScriptPermission(owner="b"))
        removed = rbac.revoke("a")
        assert removed == 2
        assert rbac.permission_count == 1

    def test_revoke_nonexistent_returns_zero(self):
        rbac = ScriptRBAC()
        assert rbac.revoke("nobody") == 0

    def test_get_permissions(self):
        rbac = ScriptRBAC()
        rbac.grant(ScriptPermission(owner="x", area_pattern="a1"))
        rbac.grant(ScriptPermission(owner="y", area_pattern="a2"))
        rbac.grant(ScriptPermission(owner="x", area_pattern="a3"))
        perms = rbac.get_permissions("x")
        assert len(perms) == 2

    def test_clear_removes_all(self):
        rbac = ScriptRBAC()
        rbac.grant(ScriptPermission(owner="a"))
        rbac.grant(ScriptPermission(owner="b"))
        rbac.clear()
        assert rbac.permission_count == 0

    def test_permission_check_result_fields(self):
        result = PermissionCheckResult(
            allowed=False, owner="test", operation="tag_write",
            target="some/tag", reason="denied",
        )
        assert result.allowed is False
        assert result.matching_permission is None
