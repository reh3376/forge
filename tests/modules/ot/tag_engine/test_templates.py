"""Tests for tag templates — parameterized equipment definitions and built-in templates."""

import pytest

from forge.modules.ot.opcua_client.types import DataType
from forge.modules.ot.tag_engine.models import (
    MemoryTag,
    ScanClass,
    StandardTag,
    TagType,
)
from forge.modules.ot.tag_engine.templates import (
    TagTemplate,
    TemplateParam,
    TemplateRegistry,
    TemplateTagDef,
)
from forge.modules.ot.tag_engine.builtin_templates import (
    ANALOG_INSTRUMENT,
    DISCRETE_VALVE,
    MOTOR_STARTER,
    VFD_DRIVE,
    create_builtin_registry,
)


# ---------------------------------------------------------------------------
# TemplateParam tests
# ---------------------------------------------------------------------------


class TestTemplateParam:

    def test_string_coercion(self):
        p = TemplateParam(type="str")
        assert p.coerce(42) == "42"
        assert p.coerce("hello") == "hello"

    def test_int_coercion(self):
        p = TemplateParam(type="int")
        assert p.coerce("42") == 42
        assert p.coerce(42.9) == 42

    def test_float_coercion(self):
        p = TemplateParam(type="float")
        assert p.coerce("3.14") == 3.14

    def test_bool_coercion(self):
        p = TemplateParam(type="bool")
        assert p.coerce(1) is True
        assert p.coerce(0) is False

    def test_none_coercion(self):
        p = TemplateParam(type="str")
        assert p.coerce(None) is None

    def test_invalid_type_rejected(self):
        with pytest.raises(ValueError, match="must be one of"):
            TemplateParam(type="complex")


# ---------------------------------------------------------------------------
# TagTemplate tests
# ---------------------------------------------------------------------------


class TestTagTemplate:

    @pytest.fixture
    def simple_template(self):
        return TagTemplate(
            name="SimpleInstrument",
            parameters={
                "connection": TemplateParam(type="str", required=True),
                "tag_id": TemplateParam(type="str", required=True),
                "units": TemplateParam(type="str", default="°F"),
            },
            tags=[
                TemplateTagDef(
                    path_template="Area/{tag_id}/Out_PV",
                    tag_type="standard",
                    data_type="Float",
                    scan_class="high",
                    description_template="{tag_id} process value",
                    engineering_units_template="{units}",
                    opcua_node_id_template="ns=2;s=Area.{tag_id}.Out_PV",
                    connection_name_template="{connection}",
                ),
                TemplateTagDef(
                    path_template="Area/{tag_id}/Status",
                    tag_type="memory",
                    data_type="Int32",
                    description_template="{tag_id} status memory",
                    default_value=0,
                ),
            ],
        )

    def test_validate_params_fills_defaults(self, simple_template):
        resolved = simple_template.validate_params(
            {"connection": "WHK01", "tag_id": "TIT_2010"}
        )
        assert resolved["connection"] == "WHK01"
        assert resolved["tag_id"] == "TIT_2010"
        assert resolved["units"] == "°F"  # Default filled in

    def test_validate_params_rejects_missing_required(self, simple_template):
        with pytest.raises(ValueError, match="Required parameter"):
            simple_template.validate_params({"connection": "WHK01"})

    def test_validate_params_coerces_types(self):
        tmpl = TagTemplate(
            name="test",
            parameters={
                "count": TemplateParam(type="int", required=True),
            },
        )
        resolved = tmpl.validate_params({"count": "42"})
        assert resolved["count"] == 42

    def test_instantiate_produces_correct_tags(self, simple_template):
        tags = simple_template.instantiate(
            instance_name="TIT_2010",
            params={"connection": "WHK01", "tag_id": "TIT_2010"},
        )
        assert len(tags) == 2

        # First tag: StandardTag
        pv = tags[0]
        assert isinstance(pv, StandardTag)
        assert pv.path == "Area/TIT_2010/Out_PV"
        assert pv.opcua_node_id == "ns=2;s=Area.TIT_2010.Out_PV"
        assert pv.connection_name == "WHK01"
        assert pv.engineering_units == "°F"
        assert pv.scan_class == ScanClass.HIGH
        assert pv.data_type == DataType.FLOAT

        # Second tag: MemoryTag
        status = tags[1]
        assert isinstance(status, MemoryTag)
        assert status.path == "Area/TIT_2010/Status"
        assert status.default_value == 0

    def test_instantiate_with_path_prefix(self, simple_template):
        tags = simple_template.instantiate(
            instance_name="TIT_2010",
            params={"connection": "WHK01", "tag_id": "TIT_2010"},
            path_prefix="WH/WHK01",
        )
        assert tags[0].path == "WH/WHK01/Area/TIT_2010/Out_PV"

    def test_template_metadata_tag(self, simple_template):
        """Every instantiated tag gets _template metadata."""
        tags = simple_template.instantiate(
            instance_name="TIT_2010",
            params={"connection": "WHK01", "tag_id": "TIT_2010"},
        )
        assert tags[0].metadata["_template"] == "SimpleInstrument"

    def test_unresolved_tag_refs_preserved(self):
        """Parameter placeholders that match tag refs ({other/tag}) stay as-is."""
        tmpl = TagTemplate(
            name="ExprTest",
            parameters={
                "tag_id": TemplateParam(type="str", required=True),
            },
            tags=[
                TemplateTagDef(
                    path_template="{tag_id}/Calc",
                    tag_type="expression",
                    expression_template="{src/temp} + 10",
                ),
            ],
        )
        tags = tmpl.instantiate(
            instance_name="test",
            params={"tag_id": "TIT_2010"},
        )
        # {src/temp} should NOT be resolved (it's a tag reference, not a param)
        assert tags[0].expression == "{src/temp} + 10"


# ---------------------------------------------------------------------------
# TemplateRegistry tests
# ---------------------------------------------------------------------------


class TestTemplateRegistry:

    def test_register_and_list(self):
        reg = TemplateRegistry()
        tmpl = TagTemplate(name="TestTemplate")
        reg.register(tmpl)
        assert reg.count == 1
        assert "TestTemplate" in reg.list_templates()

    def test_register_duplicate_raises(self):
        reg = TemplateRegistry()
        tmpl = TagTemplate(name="Dup")
        reg.register(tmpl)
        with pytest.raises(ValueError, match="already registered"):
            reg.register(TagTemplate(name="Dup"))

    def test_register_with_missing_parent_raises(self):
        reg = TemplateRegistry()
        child = TagTemplate(name="Child", extends="NonExistentParent")
        with pytest.raises(ValueError, match="not registered"):
            reg.register(child)

    def test_get_returns_template(self):
        reg = TemplateRegistry()
        tmpl = TagTemplate(name="T1")
        reg.register(tmpl)
        assert reg.get("T1") is tmpl
        assert reg.get("unknown") is None

    def test_inheritance_instantiation(self):
        """Child template extends parent — gets parent's tags plus its own."""
        reg = TemplateRegistry()

        parent = TagTemplate(
            name="Parent",
            parameters={
                "tag_id": TemplateParam(type="str", required=True),
            },
            tags=[
                TemplateTagDef(
                    path_template="{tag_id}/ParentTag",
                    tag_type="memory",
                    description_template="From parent",
                ),
            ],
        )
        child = TagTemplate(
            name="Child",
            extends="Parent",
            parameters={
                "tag_id": TemplateParam(type="str", required=True),
                "extra": TemplateParam(type="str", default="x"),
            },
            tags=[
                TemplateTagDef(
                    path_template="{tag_id}/ChildTag",
                    tag_type="memory",
                    description_template="From child",
                ),
            ],
        )

        reg.register(parent)
        reg.register(child)

        tags = reg.instantiate("Child", "inst1", {"tag_id": "M001"})
        paths = [t.path for t in tags]
        assert "M001/ParentTag" in paths  # From parent
        assert "M001/ChildTag" in paths   # From child
        assert len(tags) == 2

    def test_child_overrides_parent_tag(self):
        """If child defines same path as parent, child wins."""
        reg = TemplateRegistry()

        parent = TagTemplate(
            name="P",
            parameters={"id": TemplateParam(type="str", required=True)},
            tags=[
                TemplateTagDef(
                    path_template="{id}/Shared",
                    tag_type="memory",
                    description_template="parent version",
                ),
            ],
        )
        child = TagTemplate(
            name="C",
            extends="P",
            parameters={"id": TemplateParam(type="str", required=True)},
            tags=[
                TemplateTagDef(
                    path_template="{id}/Shared",
                    tag_type="memory",
                    description_template="child version",
                ),
            ],
        )

        reg.register(parent)
        reg.register(child)

        tags = reg.instantiate("C", "inst", {"id": "X"})
        assert len(tags) == 1
        assert tags[0].description == "child version"


# ---------------------------------------------------------------------------
# Built-in template tests
# ---------------------------------------------------------------------------


class TestBuiltinTemplates:

    @pytest.fixture
    def builtin_reg(self):
        return create_builtin_registry()

    def test_all_builtins_registered(self, builtin_reg):
        names = builtin_reg.list_templates()
        assert "AnalogInstrument" in names
        assert "DiscreteValve" in names
        assert "MotorStarter" in names
        assert "VFD_Drive" in names
        assert builtin_reg.count == 4

    def test_analog_instrument_instantiation(self, builtin_reg):
        tags = builtin_reg.instantiate(
            "AnalogInstrument",
            "TIT_2010",
            {
                "connection": "WHK01",
                "base_path": "Distillery01",
                "tag_id": "TIT_2010",
                "units": "°F",
                "area": "Distillery",
            },
        )
        # AnalogInstrument has 4 tags: PV, Alarm, SP, Mode
        assert len(tags) == 4
        paths = [t.path for t in tags]
        assert "Distillery01/TIT_2010/Out_PV" in paths
        assert "Distillery01/TIT_2010/Out_Alarm" in paths
        assert "Distillery01/TIT_2010/In_SP" in paths
        assert "Distillery01/TIT_2010/Out_Mode" in paths

        # Check PV tag properties
        pv = next(t for t in tags if t.path.endswith("Out_PV"))
        assert isinstance(pv, StandardTag)
        assert pv.engineering_units == "°F"
        assert pv.area == "Distillery"
        assert pv.scan_class == ScanClass.HIGH
        assert pv.history is not None
        assert pv.history.enabled is True

    def test_discrete_valve_instantiation(self, builtin_reg):
        tags = builtin_reg.instantiate(
            "DiscreteValve",
            "XV_3010",
            {
                "connection": "WHK01",
                "base_path": "Distillery01",
                "tag_id": "XV_3010",
            },
        )
        # 4 tags: Open, Closed, Cmd, Fault
        assert len(tags) == 4
        paths = [t.path for t in tags]
        assert "Distillery01/XV_3010/Out_Open" in paths
        assert "Distillery01/XV_3010/Out_Closed" in paths

    def test_motor_starter_instantiation(self, builtin_reg):
        tags = builtin_reg.instantiate(
            "MotorStarter",
            "P_4010",
            {
                "connection": "WHK01",
                "base_path": "Utility01",
                "tag_id": "P_4010",
            },
        )
        # 4 tags: Running, Run, Fault, Amps
        assert len(tags) == 4

    def test_vfd_drive_inherits_motor_starter(self, builtin_reg):
        """VFD_Drive extends MotorStarter — gets parent + child tags."""
        tags = builtin_reg.instantiate(
            "VFD_Drive",
            "VFD_5010",
            {
                "connection": "WHK01",
                "base_path": "Distillery01",
                "tag_id": "VFD_5010",
            },
        )
        # MotorStarter has 4 tags, VFD adds 3 = 7 total
        assert len(tags) == 7
        paths = [t.path for t in tags]
        # From MotorStarter parent
        assert "Distillery01/VFD_5010/Out_Running" in paths
        assert "Distillery01/VFD_5010/Out_Amps" in paths
        # From VFD child
        assert "Distillery01/VFD_5010/In_Speed" in paths
        assert "Distillery01/VFD_5010/Out_Speed" in paths
        assert "Distillery01/VFD_5010/Out_Freq" in paths

    def test_analog_with_path_prefix(self, builtin_reg):
        tags = builtin_reg.instantiate(
            "AnalogInstrument",
            "LIT_6050B",
            {
                "connection": "WHK01",
                "base_path": "Distillery01/Utility01",
                "tag_id": "LIT_6050B",
                "units": "%",
            },
            path_prefix="WH/WHK01",
        )
        pv = tags[0]
        assert pv.path.startswith("WH/WHK01/")
