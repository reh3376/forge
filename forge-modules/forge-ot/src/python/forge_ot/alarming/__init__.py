"""forge_ot.alarming — ISA-18.2 Alarm Engine.

Implements the ISA-18.2 (IEC 62682) alarm management standard with:
- 7-state alarm lifecycle: NORMAL → ACTIVE_UNACK → ACTIVE_ACK → CLEAR_UNACK → NORMAL
  plus SUPPRESSED, SHELVED, OUT_OF_SERVICE administrative states
- Table-driven state transitions (auditable, serializable)
- Event-sourced persistence (append-only alarm journal)
- Alarm detection: threshold (HI/HIHI/LO/LOLO), digital, rate-of-change, quality
- Flood suppression (per-area max active alarms)
- Cross-module integration (MQTT, RabbitMQ, CMMS, scripting hooks)

Architecture::

    ┌──────────────┐     ┌──────────────┐     ┌────────────────┐
    │ Tag Engine   │────▶│ AlarmDetector │────▶│  AlarmEngine   │
    │ (tag values) │     │ (thresholds)  │     │ (state machine)│
    └──────────────┘     └──────────────┘     └────────┬───────┘
                                                       │
                              ┌─────────────────┬──────┴──────┐
                              ▼                 ▼             ▼
                         ┌─────────┐     ┌──────────┐  ┌──────────┐
                         │  MQTT   │     │ Journal  │  │ Scripts  │
                         │ publish │     │ (events) │  │ dispatch │
                         └─────────┘     └──────────┘  └──────────┘
"""

from forge_ot.alarming.engine import AlarmEngine
from forge_ot.alarming.models import (
    AlarmAction,
    AlarmConfig,
    AlarmEvent,
    AlarmInstance,
    AlarmPriority,
    AlarmState,
    AlarmType,
    ThresholdConfig,
)
from forge_ot.alarming.state_machine import AlarmStateMachine

__all__ = [
    "AlarmAction",
    "AlarmConfig",
    "AlarmEngine",
    "AlarmEvent",
    "AlarmInstance",
    "AlarmPriority",
    "AlarmState",
    "AlarmStateMachine",
    "AlarmType",
    "ThresholdConfig",
]
