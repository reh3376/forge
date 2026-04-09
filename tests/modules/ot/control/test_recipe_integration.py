"""Tests for MES Recipe Write Integration.

Covers:
- RecipeWriteConfig registry and parameter mapping
- Full batch success (all parameters confirmed)
- Partial failure (some params fail validation/interlock)
- Missing equipment config → all skipped
- Missing parameter mapping → individual skip
- RecipeWriteResult properties (success, partial)
- Batch ID propagation to write requests
- Custom role and requestor overrides
"""

import pytest
from unittest.mock import AsyncMock

from forge.modules.ot.control.models import (
    DataType,
    InterlockCondition,
    InterlockRule,
    TagWriteConfig,
    WritePermission,
    WriteRole,
)
from forge.modules.ot.control.validation import WriteValidator
from forge.modules.ot.control.interlock import InterlockEngine
from forge.modules.ot.control.authorization import WriteAuthorizer
from forge.modules.ot.control.write_engine import ControlWriteEngine
from forge.modules.ot.control.recipe_integration import (
    RecipeParameterMapping,
    RecipeWriteAdapter,
    RecipeWriteConfig,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_engine(interlock_reader=None) -> ControlWriteEngine:
    validator = WriteValidator()
    for tag, min_v, max_v in [
        ("WH/WHK01/Distillery01/TIT_2010/SP", 0.0, 200.0),
        ("WH/WHK01/Distillery01/TIT_2010/RampRate", 0.0, 10.0),
        ("WH/WHK01/Distillery01/FIC_3010/SP", 0.0, 500.0),
    ]:
        validator.register_tag(TagWriteConfig(
            tag_path=tag, data_type=DataType.FLOAT,
            min_value=min_v, max_value=max_v,
        ))

    il_engine = InterlockEngine(tag_reader=interlock_reader or AsyncMock(
        read_tag=AsyncMock(return_value=None),
    ))

    authorizer = WriteAuthorizer()
    authorizer.add_permission(WritePermission(
        permission_id="all", area_pattern="*", tag_pattern="**",
        min_role=WriteRole.OPERATOR,
    ))

    return ControlWriteEngine(
        validator=validator,
        interlock_engine=il_engine,
        authorizer=authorizer,
    )


def _build_adapter(engine=None, interlock_reader=None) -> RecipeWriteAdapter:
    eng = engine or _build_engine(interlock_reader)
    adapter = RecipeWriteAdapter(eng)
    adapter.register_config(RecipeWriteConfig(
        equipment_id="Distillery01/TIT_2010",
        area="Distillery01",
        mappings=[
            RecipeParameterMapping(
                "target_temp",
                "WH/WHK01/Distillery01/TIT_2010/SP",
                engineering_units="°F",
            ),
            RecipeParameterMapping(
                "ramp_rate",
                "WH/WHK01/Distillery01/TIT_2010/RampRate",
                engineering_units="°F/min",
            ),
            RecipeParameterMapping(
                "flow_rate",
                "WH/WHK01/Distillery01/FIC_3010/SP",
                engineering_units="GPM",
            ),
        ],
    ))
    return adapter


# ---------------------------------------------------------------------------
# Config registry
# ---------------------------------------------------------------------------


class TestRecipeWriteConfig:
    def test_register_and_get(self):
        adapter = _build_adapter()
        config = adapter.get_config("Distillery01/TIT_2010")
        assert config is not None
        assert len(config.mappings) == 3

    def test_get_nonexistent(self):
        adapter = _build_adapter()
        assert adapter.get_config("nope") is None

    def test_unregister(self):
        adapter = _build_adapter()
        assert adapter.unregister_config("Distillery01/TIT_2010") is True
        assert adapter.get_config("Distillery01/TIT_2010") is None

    def test_get_all(self):
        adapter = _build_adapter()
        assert len(adapter.get_all_configs()) == 1

    def test_parameter_mapping_lookup(self):
        config = RecipeWriteConfig(
            equipment_id="test",
            mappings=[RecipeParameterMapping("temp", "t/temp")],
        )
        assert config.get_mapping("temp") is not None
        assert config.get_mapping("nope") is None

    def test_add_mapping_replaces(self):
        config = RecipeWriteConfig(
            equipment_id="test",
            mappings=[RecipeParameterMapping("temp", "t/temp")],
        )
        config.add_mapping(RecipeParameterMapping("temp", "t/temp_new"))
        assert len(config.mappings) == 1
        assert config.get_mapping("temp").tag_path == "t/temp_new"


# ---------------------------------------------------------------------------
# Batch execution — success
# ---------------------------------------------------------------------------


class TestBatchSuccess:
    @pytest.mark.asyncio
    async def test_all_confirmed(self):
        adapter = _build_adapter()
        result = await adapter.execute_recipe_write(
            equipment_id="Distillery01/TIT_2010",
            parameters={"target_temp": 165.0, "ramp_rate": 2.5},
            production_order_id="PO-001",
            recipe_id="R-BOURBON-01",
        )

        assert result.success is True
        assert result.confirmed == 2
        assert result.failed == 0
        assert result.skipped == 0
        assert result.total_parameters == 2
        assert result.completed_at is not None

    @pytest.mark.asyncio
    async def test_batch_id_propagated(self):
        engine = _build_engine()
        adapter = RecipeWriteAdapter(engine)
        adapter.register_config(RecipeWriteConfig(
            equipment_id="test",
            area="A",
            mappings=[RecipeParameterMapping("temp", "WH/WHK01/Distillery01/TIT_2010/SP")],
        ))

        result = await adapter.execute_recipe_write(
            equipment_id="test",
            parameters={"temp": 100.0},
        )

        journal = engine.get_journal()
        assert len(journal) == 1
        assert journal[0]["batch_id"] == result.batch_id
        assert journal[0]["batch_id"] != ""

    @pytest.mark.asyncio
    async def test_to_dict(self):
        adapter = _build_adapter()
        result = await adapter.execute_recipe_write(
            equipment_id="Distillery01/TIT_2010",
            parameters={"target_temp": 165.0},
            production_order_id="PO-001",
        )

        d = result.to_dict()
        assert d["success"] is True
        assert d["equipment_id"] == "Distillery01/TIT_2010"
        assert d["production_order_id"] == "PO-001"
        assert len(d["results"]) == 1


# ---------------------------------------------------------------------------
# Partial failure
# ---------------------------------------------------------------------------


class TestPartialFailure:
    @pytest.mark.asyncio
    async def test_validation_failure_partial(self):
        adapter = _build_adapter()
        result = await adapter.execute_recipe_write(
            equipment_id="Distillery01/TIT_2010",
            parameters={
                "target_temp": 165.0,  # OK
                "ramp_rate": 99.0,  # Exceeds max of 10.0
            },
        )

        assert result.partial is True
        assert result.confirmed == 1
        assert result.failed == 1

    @pytest.mark.asyncio
    async def test_missing_mapping_skipped(self):
        adapter = _build_adapter()
        result = await adapter.execute_recipe_write(
            equipment_id="Distillery01/TIT_2010",
            parameters={
                "target_temp": 165.0,
                "unknown_param": 42.0,  # No mapping
            },
        )

        assert result.confirmed == 1
        assert result.skipped == 1
        assert result.results[1]["status"] == "SKIPPED" or result.results[0]["status"] == "SKIPPED"


# ---------------------------------------------------------------------------
# Missing config
# ---------------------------------------------------------------------------


class TestMissingConfig:
    @pytest.mark.asyncio
    async def test_no_equipment_config_all_skipped(self):
        adapter = _build_adapter()
        result = await adapter.execute_recipe_write(
            equipment_id="Unknown/Equipment",
            parameters={"temp": 100.0, "rate": 5.0},
        )

        assert result.success is False
        assert result.skipped == 2
        assert result.confirmed == 0


# ---------------------------------------------------------------------------
# Custom overrides
# ---------------------------------------------------------------------------


class TestOverrides:
    @pytest.mark.asyncio
    async def test_custom_role(self):
        engine = _build_engine()
        adapter = RecipeWriteAdapter(engine)
        adapter.register_config(RecipeWriteConfig(
            equipment_id="test",
            area="A",
            mappings=[RecipeParameterMapping("temp", "WH/WHK01/Distillery01/TIT_2010/SP")],
        ))

        await adapter.execute_recipe_write(
            equipment_id="test",
            parameters={"temp": 100.0},
            role=WriteRole.ADMIN,
            requestor="admin-override",
        )

        journal = engine.get_journal()
        assert journal[0]["role"] == "ADMIN"
        assert journal[0]["requestor"] == "admin-override"

    @pytest.mark.asyncio
    async def test_default_requestor(self):
        engine = _build_engine()
        adapter = RecipeWriteAdapter(engine)
        adapter.register_config(RecipeWriteConfig(
            equipment_id="test",
            area="A",
            default_requestor="mes-v2",
            mappings=[RecipeParameterMapping("temp", "WH/WHK01/Distillery01/TIT_2010/SP")],
        ))

        await adapter.execute_recipe_write(
            equipment_id="test",
            parameters={"temp": 100.0},
        )

        journal = engine.get_journal()
        assert journal[0]["requestor"] == "mes-v2"


# ---------------------------------------------------------------------------
# RecipeWriteResult properties
# ---------------------------------------------------------------------------


class TestResultProperties:
    @pytest.mark.asyncio
    async def test_success_when_all_confirmed(self):
        adapter = _build_adapter()
        result = await adapter.execute_recipe_write(
            equipment_id="Distillery01/TIT_2010",
            parameters={"target_temp": 100.0},
        )
        assert result.success is True
        assert result.partial is False

    @pytest.mark.asyncio
    async def test_not_success_when_any_failed(self):
        adapter = _build_adapter()
        result = await adapter.execute_recipe_write(
            equipment_id="Distillery01/TIT_2010",
            parameters={"target_temp": 100.0, "ramp_rate": 999.0},
        )
        assert result.success is False

    @pytest.mark.asyncio
    async def test_not_success_when_all_skipped(self):
        adapter = _build_adapter()
        result = await adapter.execute_recipe_write(
            equipment_id="Unknown",
            parameters={"temp": 100.0},
        )
        assert result.success is False
        assert result.partial is False
