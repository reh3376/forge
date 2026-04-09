"""Built-in tag templates for common distillery/manufacturing equipment.

These templates mirror the UDT patterns found in WHK's existing Ignition
SCADA project, adapted for Forge's 9-type tag system.  Each template
produces a standard set of tags when instantiated per device.

Templates:
    AnalogInstrument  — Temperature, pressure, level, flow transmitters
    DiscreteValve     — On/off valves with feedback and command tags
    MotorStarter      — Simple motor (run/stop/fault/amps)
    VFD_Drive         — Variable frequency drive (extends MotorStarter)

All templates use the WHK tag path convention:
    {site}/{connection}/{area}/{tag_id}/...
"""

from __future__ import annotations

from forge.modules.ot.tag_engine.models import (
    AlarmConfig,
    HistoryConfig,
    ScaleConfig,
)
from forge.modules.ot.tag_engine.templates import (
    TagTemplate,
    TemplateParam,
    TemplateTagDef,
    TemplateRegistry,
)


def _common_params() -> dict[str, TemplateParam]:
    """Parameters shared by all equipment templates."""
    return {
        "connection": TemplateParam(
            type="str", required=True, description="PLC connection name (e.g., WHK01)"
        ),
        "base_path": TemplateParam(
            type="str", required=True, description="Area path (e.g., Distillery01)"
        ),
        "tag_id": TemplateParam(
            type="str", required=True, description="Equipment tag ID (e.g., TIT_2010)"
        ),
        "area": TemplateParam(
            type="str", default="", description="Area name for context enrichment"
        ),
        "equipment_id": TemplateParam(
            type="str", default="", description="CMMS equipment ID"
        ),
    }


# ---------------------------------------------------------------------------
# AnalogInstrument
# ---------------------------------------------------------------------------


ANALOG_INSTRUMENT = TagTemplate(
    name="AnalogInstrument",
    description=(
        "Analog transmitter (4-20mA / 0-10V). Produces PV, alarm state, "
        "and setpoint tags. Covers TIT (temp), LIT (level), PIT (pressure), "
        "FIT (flow) instrument families."
    ),
    version="1.0.0",
    parameters={
        **_common_params(),
        "units": TemplateParam(type="str", default="", description="Engineering units (°F, PSI, %, GPM)"),
        "hi_alarm": TemplateParam(type="float", default=None, description="High alarm threshold"),
        "lo_alarm": TemplateParam(type="float", default=None, description="Low alarm threshold"),
        "hihi_alarm": TemplateParam(type="float", default=None, description="High-high alarm threshold"),
        "lolo_alarm": TemplateParam(type="float", default=None, description="Low-low alarm threshold"),
        "raw_min": TemplateParam(type="float", default=0.0, description="Raw PLC minimum"),
        "raw_max": TemplateParam(type="float", default=65535.0, description="Raw PLC maximum"),
        "scaled_min": TemplateParam(type="float", default=0.0, description="Scaled minimum"),
        "scaled_max": TemplateParam(type="float", default=100.0, description="Scaled maximum"),
    },
    tags=[
        # Process Value — the primary measurement
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/Out_PV",
            tag_type="standard",
            data_type="Float",
            scan_class="high",
            description_template="{tag_id} process value",
            engineering_units_template="{units}",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.Out_PV",
            connection_name_template="{connection}",
            history=HistoryConfig(enabled=True, sample_mode="on_change", deadband=0.1),
        ),
        # Alarm state (from PLC)
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/Out_Alarm",
            tag_type="standard",
            data_type="Int32",
            scan_class="standard",
            description_template="{tag_id} alarm state word",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.Out_Alarm",
            connection_name_template="{connection}",
        ),
        # Setpoint (writable)
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/In_SP",
            tag_type="standard",
            data_type="Float",
            scan_class="standard",
            description_template="{tag_id} setpoint",
            engineering_units_template="{units}",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.In_SP",
            connection_name_template="{connection}",
        ),
        # Mode (auto/manual/cascade)
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/Out_Mode",
            tag_type="standard",
            data_type="Int32",
            scan_class="slow",
            description_template="{tag_id} operating mode",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.Out_Mode",
            connection_name_template="{connection}",
        ),
    ],
)


# ---------------------------------------------------------------------------
# DiscreteValve
# ---------------------------------------------------------------------------


DISCRETE_VALVE = TagTemplate(
    name="DiscreteValve",
    description=(
        "Discrete on/off valve with command and feedback. "
        "Covers solenoid valves and simple actuated valves."
    ),
    version="1.0.0",
    parameters={
        **_common_params(),
    },
    tags=[
        # Open feedback
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/Out_Open",
            tag_type="standard",
            data_type="Boolean",
            scan_class="high",
            description_template="{tag_id} open feedback",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.Out_Open",
            connection_name_template="{connection}",
        ),
        # Closed feedback
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/Out_Closed",
            tag_type="standard",
            data_type="Boolean",
            scan_class="high",
            description_template="{tag_id} closed feedback",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.Out_Closed",
            connection_name_template="{connection}",
        ),
        # Command
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/In_Cmd",
            tag_type="standard",
            data_type="Boolean",
            scan_class="high",
            description_template="{tag_id} open command",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.In_Cmd",
            connection_name_template="{connection}",
        ),
        # Fault
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/Out_Fault",
            tag_type="standard",
            data_type="Boolean",
            scan_class="standard",
            description_template="{tag_id} fault indicator",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.Out_Fault",
            connection_name_template="{connection}",
        ),
    ],
)


# ---------------------------------------------------------------------------
# MotorStarter
# ---------------------------------------------------------------------------


MOTOR_STARTER = TagTemplate(
    name="MotorStarter",
    description=(
        "Simple motor starter (contactor-based). Run/stop command, "
        "running feedback, fault, and amps."
    ),
    version="1.0.0",
    parameters={
        **_common_params(),
        "fla": TemplateParam(type="float", default=0.0, description="Full load amps (for scaling)"),
    },
    tags=[
        # Running feedback
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/Out_Running",
            tag_type="standard",
            data_type="Boolean",
            scan_class="high",
            description_template="{tag_id} running feedback",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.Out_Running",
            connection_name_template="{connection}",
        ),
        # Run command
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/In_Run",
            tag_type="standard",
            data_type="Boolean",
            scan_class="high",
            description_template="{tag_id} run command",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.In_Run",
            connection_name_template="{connection}",
        ),
        # Fault
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/Out_Fault",
            tag_type="standard",
            data_type="Boolean",
            scan_class="standard",
            description_template="{tag_id} fault indicator",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.Out_Fault",
            connection_name_template="{connection}",
        ),
        # Current (amps)
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/Out_Amps",
            tag_type="standard",
            data_type="Float",
            scan_class="standard",
            description_template="{tag_id} motor current",
            engineering_units_template="A",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.Out_Amps",
            connection_name_template="{connection}",
            history=HistoryConfig(enabled=True, sample_mode="on_change", deadband=0.5),
        ),
    ],
)


# ---------------------------------------------------------------------------
# VFD_Drive (extends MotorStarter)
# ---------------------------------------------------------------------------


VFD_DRIVE = TagTemplate(
    name="VFD_Drive",
    description=(
        "Variable frequency drive. Extends MotorStarter with speed "
        "command, speed feedback, and frequency tags."
    ),
    version="1.0.0",
    extends="MotorStarter",
    parameters={
        **_common_params(),
        "fla": TemplateParam(type="float", default=0.0, description="Full load amps"),
        "max_speed": TemplateParam(type="float", default=60.0, description="Maximum speed (Hz)"),
    },
    tags=[
        # Speed command (Hz)
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/In_Speed",
            tag_type="standard",
            data_type="Float",
            scan_class="high",
            description_template="{tag_id} speed command",
            engineering_units_template="Hz",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.In_Speed",
            connection_name_template="{connection}",
        ),
        # Speed feedback (Hz)
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/Out_Speed",
            tag_type="standard",
            data_type="Float",
            scan_class="high",
            description_template="{tag_id} speed feedback",
            engineering_units_template="Hz",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.Out_Speed",
            connection_name_template="{connection}",
            history=HistoryConfig(enabled=True, sample_mode="on_change", deadband=0.1),
        ),
        # Output frequency
        TemplateTagDef(
            path_template="{base_path}/{tag_id}/Out_Freq",
            tag_type="standard",
            data_type="Float",
            scan_class="standard",
            description_template="{tag_id} output frequency",
            engineering_units_template="Hz",
            area_template="{area}",
            equipment_id_template="{equipment_id}",
            opcua_node_id_template="ns=2;s={base_path}.{tag_id}.Out_Freq",
            connection_name_template="{connection}",
        ),
    ],
)


# ---------------------------------------------------------------------------
# Registry initialization
# ---------------------------------------------------------------------------


def create_builtin_registry() -> TemplateRegistry:
    """Create a TemplateRegistry pre-loaded with all built-in templates.

    Registration order matters for inheritance: parents before children.
    """
    registry = TemplateRegistry()
    registry.register(ANALOG_INSTRUMENT)
    registry.register(DISCRETE_VALVE)
    registry.register(MOTOR_STARTER)
    registry.register(VFD_DRIVE)  # Must come after MotorStarter (extends it)
    return registry
