"""Tests for the Scanner Gateway spoke router."""

from forge.adapters.scanner_gateway.spoke_router import RouteTarget, SpokeRouter

# ── Default Configuration ─────────────────────────────────────────


class TestDefaultRouting:
    """Verify default routing table with WMS + IMS configured."""

    def setup_method(self):
        self.router = SpokeRouter(
            wms_adapter_id="whk-wms",
            ims_adapter_id="bosc-ims",
            qms_adapter_id=None,
        )

    def test_entry_routes_to_wms(self):
        targets = self.router.route("ENTRY")
        assert len(targets) == 1
        assert targets[0].adapter_id == "whk-wms"

    def test_dump_routes_to_wms(self):
        targets = self.router.route("DUMP")
        assert len(targets) == 1
        assert targets[0].adapter_id == "whk-wms"

    def test_withdrawal_routes_to_wms(self):
        targets = self.router.route("WITHDRAWAL")
        assert len(targets) == 1
        assert targets[0].adapter_id == "whk-wms"

    def test_relocation_routes_to_wms(self):
        targets = self.router.route("RELOCATION")
        assert len(targets) == 1
        assert targets[0].adapter_id == "whk-wms"

    def test_label_verification_routes_to_wms(self):
        targets = self.router.route("LABEL_VERIFICATION")
        assert len(targets) == 1
        assert targets[0].adapter_id == "whk-wms"

    def test_inspection_routes_to_wms_and_ims(self):
        targets = self.router.route("INSPECTION")
        ids = {t.adapter_id for t in targets}
        assert ids == {"whk-wms", "bosc-ims"}

    def test_inventory_routes_to_wms_and_ims(self):
        targets = self.router.route("INVENTORY")
        ids = {t.adapter_id for t in targets}
        assert ids == {"whk-wms", "bosc-ims"}

    def test_asset_receive_routes_to_ims(self):
        targets = self.router.route("ASSET_RECEIVE")
        assert len(targets) == 1
        assert targets[0].adapter_id == "bosc-ims"

    def test_asset_move_routes_to_ims(self):
        targets = self.router.route("ASSET_MOVE")
        assert len(targets) == 1
        assert targets[0].adapter_id == "bosc-ims"

    def test_asset_install_routes_to_ims(self):
        targets = self.router.route("ASSET_INSTALL")
        assert len(targets) == 1
        assert targets[0].adapter_id == "bosc-ims"

    def test_unknown_type_returns_empty(self):
        targets = self.router.route("NONEXISTENT")
        assert targets == []

    def test_prefix_stripping(self):
        targets = self.router.route("SCAN_TYPE_ENTRY")
        assert len(targets) == 1
        assert targets[0].adapter_id == "whk-wms"


# ── QMS Routing ───────────────────────────────────────────────────


class TestQmsRouting:
    """Verify QMS routing when qms_adapter_id is configured."""

    def setup_method(self):
        self.router = SpokeRouter(
            wms_adapter_id="whk-wms",
            ims_adapter_id="bosc-ims",
            qms_adapter_id="whk-qms",
        )

    def test_sample_collect_routes_to_qms(self):
        targets = self.router.route("SAMPLE_COLLECT")
        assert len(targets) == 1
        assert targets[0].adapter_id == "whk-qms"

    def test_sample_bind_routes_to_qms(self):
        targets = self.router.route("SAMPLE_BIND")
        assert len(targets) == 1
        assert targets[0].adapter_id == "whk-qms"

    def test_sample_ops_not_routed_without_qms(self):
        router = SpokeRouter(
            wms_adapter_id="whk-wms",
            ims_adapter_id="bosc-ims",
            qms_adapter_id=None,
        )
        assert router.route("SAMPLE_COLLECT") == []
        assert router.route("SAMPLE_BIND") == []


# ── No IMS Fallback ──────────────────────────────────────────────


class TestNoImsFallback:
    """Verify routing when IMS is not configured."""

    def setup_method(self):
        self.router = SpokeRouter(
            wms_adapter_id="whk-wms",
            ims_adapter_id=None,
            qms_adapter_id=None,
        )

    def test_inspection_routes_to_wms_only(self):
        targets = self.router.route("INSPECTION")
        assert len(targets) == 1
        assert targets[0].adapter_id == "whk-wms"

    def test_inventory_routes_to_wms_only(self):
        targets = self.router.route("INVENTORY")
        assert len(targets) == 1
        assert targets[0].adapter_id == "whk-wms"

    def test_asset_ops_not_routed(self):
        assert self.router.route("ASSET_RECEIVE") == []
        assert self.router.route("ASSET_MOVE") == []
        assert self.router.route("ASSET_INSTALL") == []


# ── Utility Methods ──────────────────────────────────────────────


class TestUtilityMethods:
    """Verify all_routes() and target_adapter_ids()."""

    def test_all_routes_returns_full_table(self):
        router = SpokeRouter(
            wms_adapter_id="whk-wms",
            ims_adapter_id="bosc-ims",
        )
        table = router.all_routes()
        assert isinstance(table, dict)
        assert "ENTRY" in table
        assert "INSPECTION" in table

    def test_target_adapter_ids_with_ims(self):
        router = SpokeRouter(
            wms_adapter_id="whk-wms",
            ims_adapter_id="bosc-ims",
        )
        ids = router.target_adapter_ids()
        assert ids == {"whk-wms", "bosc-ims"}

    def test_target_adapter_ids_with_all_spokes(self):
        router = SpokeRouter(
            wms_adapter_id="whk-wms",
            ims_adapter_id="bosc-ims",
            qms_adapter_id="whk-qms",
        )
        ids = router.target_adapter_ids()
        assert ids == {"whk-wms", "bosc-ims", "whk-qms"}

    def test_route_target_is_frozen(self):
        target = RouteTarget(adapter_id="test", transform_hint="hint")
        assert target.adapter_id == "test"
        assert target.transform_hint == "hint"
