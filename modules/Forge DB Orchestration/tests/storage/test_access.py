"""Tests for the Forge Access Controller."""

from datetime import datetime, timedelta, timezone

import pytest

from forge.storage.access import (
    AccessAuditEntry,
    AccessController,
    AccessLevel,
    ConnectionGrant,
    ModulePermission,
)


# ── ModulePermission ───────────────────────────────────────────


class TestModulePermission:
    """Verify ModulePermission dataclass behavior."""

    def _make_perm(self, **overrides) -> ModulePermission:
        defaults = {
            "module_id": "whk-wms",
            "schema_name": "mod_wms",
            "access_level": AccessLevel.WRITE,
        }
        defaults.update(overrides)
        return ModulePermission(**defaults)

    def test_basic_creation(self):
        perm = self._make_perm()
        assert perm.module_id == "whk-wms"
        assert perm.schema_name == "mod_wms"
        assert perm.access_level == AccessLevel.WRITE
        assert perm.active is True
        assert perm.granted_by == "forge-core"

    def test_is_effective_when_active_and_not_expired(self):
        perm = self._make_perm()
        assert perm.is_effective is True

    def test_is_not_effective_when_inactive(self):
        perm = self._make_perm(active=False)
        assert perm.is_effective is False

    def test_is_expired_when_past_expiry(self):
        past = datetime.now(tz=timezone.utc) - timedelta(hours=1)
        perm = self._make_perm(expires_at=past)
        assert perm.is_expired is True
        assert perm.is_effective is False

    def test_not_expired_when_future_expiry(self):
        future = datetime.now(tz=timezone.utc) + timedelta(hours=1)
        perm = self._make_perm(expires_at=future)
        assert perm.is_expired is False
        assert perm.is_effective is True

    def test_not_expired_when_no_expiry(self):
        perm = self._make_perm(expires_at=None)
        assert perm.is_expired is False


# ── AccessLevel ────────────────────────────────────────────────


class TestAccessLevel:
    """Verify AccessLevel enum values."""

    def test_enum_values(self):
        assert AccessLevel.READ == "read"
        assert AccessLevel.WRITE == "write"
        assert AccessLevel.ADMIN == "admin"

    def test_enum_count(self):
        assert len(AccessLevel) == 3


# ── AccessController.grant ─────────────────────────────────────


class TestAccessControllerGrant:
    """Verify permission granting behavior."""

    def test_grant_new_permission(self):
        ac = AccessController()
        perm = ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        assert perm.module_id == "whk-wms"
        assert perm.schema_name == "mod_wms"
        assert perm.access_level == AccessLevel.WRITE
        assert perm.active is True

    def test_grant_updates_existing(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.READ)
        perm = ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        assert perm.access_level == AccessLevel.WRITE
        # Should still be only one effective grant
        grants = ac.list_grants("whk-wms")
        assert len(grants) == 1

    def test_grant_protected_schema_read_allowed(self):
        ac = AccessController()
        perm = ac.grant("whk-wms", "forge_canonical", AccessLevel.READ)
        assert perm.access_level == AccessLevel.READ

    def test_grant_protected_schema_write_denied(self):
        ac = AccessController()
        with pytest.raises(ValueError, match="protected schema"):
            ac.grant("whk-wms", "forge_canonical", AccessLevel.WRITE)

    def test_grant_protected_schema_admin_denied(self):
        ac = AccessController()
        with pytest.raises(ValueError, match="protected schema"):
            ac.grant("whk-wms", "forge_core", AccessLevel.ADMIN)

    def test_grant_all_protected_schemas_write_denied(self):
        ac = AccessController()
        for schema in ("forge_core", "forge_canonical", "curated", "lineage"):
            with pytest.raises(ValueError, match="protected schema"):
                ac.grant("whk-wms", schema, AccessLevel.WRITE)

    def test_grant_custom_granted_by(self):
        ac = AccessController()
        perm = ac.grant(
            "whk-wms", "mod_wms", AccessLevel.WRITE, granted_by="admin-user"
        )
        assert perm.granted_by == "admin-user"

    def test_grant_with_expiry(self):
        ac = AccessController()
        future = datetime.now(tz=timezone.utc) + timedelta(hours=24)
        perm = ac.grant(
            "whk-wms", "mod_wms", AccessLevel.WRITE, expires_at=future
        )
        assert perm.expires_at == future
        assert perm.is_effective is True


# ── AccessController.revoke ────────────────────────────────────


class TestAccessControllerRevoke:
    """Verify permission revocation behavior."""

    def test_revoke_existing_grant(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        result = ac.revoke("whk-wms", "mod_wms")
        assert result is True
        assert ac.check("whk-wms", "mod_wms", AccessLevel.WRITE) is False

    def test_revoke_nonexistent_grant(self):
        ac = AccessController()
        result = ac.revoke("whk-wms", "mod_wms")
        assert result is False

    def test_revoke_already_revoked(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        ac.revoke("whk-wms", "mod_wms")
        # Second revoke should return False
        result = ac.revoke("whk-wms", "mod_wms")
        assert result is False


# ── AccessController.check ─────────────────────────────────────


class TestAccessControllerCheck:
    """Verify permission checking with hierarchical access levels."""

    def test_check_exact_level(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        assert ac.check("whk-wms", "mod_wms", AccessLevel.WRITE) is True

    def test_write_satisfies_read(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        assert ac.check("whk-wms", "mod_wms", AccessLevel.READ) is True

    def test_admin_satisfies_all(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.ADMIN)
        assert ac.check("whk-wms", "mod_wms", AccessLevel.READ) is True
        assert ac.check("whk-wms", "mod_wms", AccessLevel.WRITE) is True
        assert ac.check("whk-wms", "mod_wms", AccessLevel.ADMIN) is True

    def test_read_does_not_satisfy_write(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.READ)
        assert ac.check("whk-wms", "mod_wms", AccessLevel.WRITE) is False

    def test_check_no_grant(self):
        ac = AccessController()
        assert ac.check("whk-wms", "mod_wms", AccessLevel.READ) is False

    def test_check_expired_grant(self):
        ac = AccessController()
        past = datetime.now(tz=timezone.utc) - timedelta(hours=1)
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE, expires_at=past)
        assert ac.check("whk-wms", "mod_wms", AccessLevel.WRITE) is False

    def test_check_revoked_grant(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        ac.revoke("whk-wms", "mod_wms")
        assert ac.check("whk-wms", "mod_wms", AccessLevel.WRITE) is False

    def test_check_wrong_module(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        assert ac.check("whk-mes", "mod_wms", AccessLevel.WRITE) is False


# ── AccessController.list_grants ───────────────────────────────


class TestAccessControllerListGrants:
    """Verify grant listing and filtering."""

    def test_list_all_grants(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        ac.grant("whk-mes", "mod_mes", AccessLevel.WRITE)
        grants = ac.list_grants()
        assert len(grants) == 2

    def test_list_grants_for_module(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        ac.grant("whk-wms", "forge_canonical", AccessLevel.READ)
        ac.grant("whk-mes", "mod_mes", AccessLevel.WRITE)
        grants = ac.list_grants("whk-wms")
        assert len(grants) == 2
        assert all(g.module_id == "whk-wms" for g in grants)

    def test_list_grants_excludes_revoked(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        ac.revoke("whk-wms", "mod_wms")
        grants = ac.list_grants("whk-wms")
        assert len(grants) == 0

    def test_list_grants_excludes_expired(self):
        ac = AccessController()
        past = datetime.now(tz=timezone.utc) - timedelta(hours=1)
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE, expires_at=past)
        grants = ac.list_grants("whk-wms")
        assert len(grants) == 0


# ── AccessController.list_modules_for_schema ───────────────────


class TestAccessControllerListModulesForSchema:
    """Verify schema-to-module lookups."""

    def test_list_modules_for_schema(self):
        ac = AccessController()
        ac.grant("whk-wms", "forge_canonical", AccessLevel.READ)
        ac.grant("whk-mes", "forge_canonical", AccessLevel.READ)
        modules = ac.list_modules_for_schema("forge_canonical")
        assert set(modules) == {"whk-wms", "whk-mes"}

    def test_list_modules_excludes_inactive(self):
        ac = AccessController()
        ac.grant("whk-wms", "forge_canonical", AccessLevel.READ)
        ac.revoke("whk-wms", "forge_canonical")
        modules = ac.list_modules_for_schema("forge_canonical")
        assert len(modules) == 0


# ── AccessController.issue_connection ──────────────────────────


class TestAccessControllerIssueConnection:
    """Verify connection string issuance."""

    def test_issue_connection_basic(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        conn = ac.issue_connection("whk-wms")
        assert isinstance(conn, ConnectionGrant)
        assert conn.module_id == "whk-wms"
        assert "mod_wms" in conn.schemas_accessible
        assert "forge-pg" in conn.connection_string

    def test_issue_connection_includes_all_schemas(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        ac.grant("whk-wms", "forge_canonical", AccessLevel.READ)
        conn = ac.issue_connection("whk-wms")
        assert "mod_wms" in conn.schemas_accessible
        assert "forge_canonical" in conn.schemas_accessible

    def test_issue_connection_rw_role_for_write(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        conn = ac.issue_connection("whk-wms")
        assert "whk_wms_rw" in conn.connection_string

    def test_issue_connection_ro_role_for_read_only(self):
        ac = AccessController()
        ac.grant("whk-wms", "forge_canonical", AccessLevel.READ)
        conn = ac.issue_connection("whk-wms")
        assert "whk_wms_ro" in conn.connection_string

    def test_issue_connection_no_grants_raises(self):
        ac = AccessController()
        with pytest.raises(ValueError, match="no active permission"):
            ac.issue_connection("whk-wms")

    def test_issue_connection_custom_host_port(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        conn = ac.issue_connection(
            "whk-wms", pg_host="db.forge.internal", pg_port=5433
        )
        assert "db.forge.internal:5433" in conn.connection_string


# ── AccessController.setup_default_grants ──────────────────────


class TestAccessControllerSetupDefaults:
    """Verify default grant bootstrapping."""

    def test_setup_creates_grants_for_all_modules(self):
        ac = AccessController()
        grants = ac.setup_default_grants()
        # 6 modules × 2 grants each (write on own + read on canonical)
        assert len(grants) == 12

    def test_setup_each_module_gets_write_on_own_schema(self):
        ac = AccessController()
        ac.setup_default_grants()
        assert ac.check("whk-wms", "mod_wms", AccessLevel.WRITE)
        assert ac.check("whk-mes", "mod_mes", AccessLevel.WRITE)
        assert ac.check("whk-erpi", "mod_erpi", AccessLevel.WRITE)
        assert ac.check("whk-cmms", "mod_cmms", AccessLevel.WRITE)
        assert ac.check("whk-nms", "mod_nms", AccessLevel.WRITE)
        assert ac.check("whk-ims", "mod_ims", AccessLevel.WRITE)

    def test_setup_each_module_gets_read_on_canonical(self):
        ac = AccessController()
        ac.setup_default_grants()
        for mod in ("whk-wms", "whk-mes", "whk-erpi", "whk-cmms", "whk-nms", "whk-ims"):
            assert ac.check(mod, "forge_canonical", AccessLevel.READ)

    def test_setup_modules_cannot_write_canonical(self):
        ac = AccessController()
        ac.setup_default_grants()
        for mod in ("whk-wms", "whk-mes", "whk-erpi"):
            assert ac.check(mod, "forge_canonical", AccessLevel.WRITE) is False

    def test_setup_cross_module_isolation(self):
        ac = AccessController()
        ac.setup_default_grants()
        # WMS should NOT have access to MES schema
        assert ac.check("whk-wms", "mod_mes", AccessLevel.READ) is False
        assert ac.check("whk-mes", "mod_wms", AccessLevel.WRITE) is False


# ── AccessController.audit_log ─────────────────────────────────


class TestAccessControllerAudit:
    """Verify audit trail immutability and completeness."""

    def test_grant_creates_audit_entry(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        assert len(ac.audit_log) == 1
        entry = ac.audit_log[0]
        assert entry.action == "grant"
        assert entry.module_id == "whk-wms"

    def test_revoke_creates_audit_entry(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        ac.revoke("whk-wms", "mod_wms")
        assert any(e.action == "revoke" for e in ac.audit_log)

    def test_denied_access_creates_audit_entry(self):
        ac = AccessController()
        with pytest.raises(ValueError):
            ac.grant("whk-wms", "forge_core", AccessLevel.WRITE)
        assert any(e.action == "access_denied" for e in ac.audit_log)

    def test_connection_issue_creates_audit_entry(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        ac.issue_connection("whk-wms")
        assert any(e.action == "connection_issued" for e in ac.audit_log)

    def test_audit_log_is_immutable_copy(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        log1 = ac.audit_log
        log1.clear()
        # Internal log should not be affected
        assert len(ac.audit_log) == 1


# ── AccessController.grant_count ───────────────────────────────


class TestAccessControllerGrantCount:
    """Verify grant counting."""

    def test_grant_count_empty(self):
        ac = AccessController()
        assert ac.grant_count == 0

    def test_grant_count_after_grants(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        ac.grant("whk-mes", "mod_mes", AccessLevel.WRITE)
        assert ac.grant_count == 2

    def test_grant_count_excludes_revoked(self):
        ac = AccessController()
        ac.grant("whk-wms", "mod_wms", AccessLevel.WRITE)
        ac.revoke("whk-wms", "mod_wms")
        assert ac.grant_count == 0
