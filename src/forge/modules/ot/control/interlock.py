"""Safety interlock engine.

Second gate in the control write defense chain.  Evaluates configurable
interlock rules that prevent writes when dangerous process conditions
exist.

Example rule: "Cannot open Valve_V101 while Pump_P01 is running."

Design notes:
- Rules use fnmatch patterns on tag paths — one rule can protect many
  tags (e.g., ``WH/WHK01/Distillery01/*/Valve_Open``).
- The engine needs to *read* live process values to evaluate check_tags.
  This is done through an injected ``tag_reader`` callback (async), so
  the interlock logic is completely decoupled from OPC-UA transport.
- Bypass is allowed only if the requestor's role meets the rule's
  ``bypass_min_role`` AND the request carries ``interlock_bypass=True``
  with a non-empty ``reason``.
- All interlock evaluations are recorded in the WriteResult for the
  audit trail, even if the write is ultimately allowed.
"""

from __future__ import annotations

import fnmatch
from typing import Any, Protocol, runtime_checkable

from forge.modules.ot.control.models import (
    InterlockCondition,
    InterlockRule,
    WriteRequest,
    WriteResult,
    WriteStatus,
)


# ---------------------------------------------------------------------------
# Tag reader protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class TagReader(Protocol):
    """Reads a live tag value from the process (e.g., OPC-UA)."""

    async def read_tag(self, tag_path: str) -> Any: ...


class _NullReader:
    """Fallback reader that always returns None."""

    async def read_tag(self, tag_path: str) -> Any:
        return None


# ---------------------------------------------------------------------------
# Condition evaluator
# ---------------------------------------------------------------------------


def _evaluate_condition(
    actual: Any,
    condition: InterlockCondition,
    check_value: Any,
    check_value_high: Any = None,
) -> bool:
    """Return True if the interlock condition is *satisfied* (i.e., the
    interlock *blocks* the write).
    """
    if actual is None:
        # Cannot evaluate — treat as *not* blocking (fail-open for reads).
        # Individual sites can add a dedicated "tag unreachable" interlock
        # if they want fail-closed behavior.
        return False

    if condition == InterlockCondition.EQUALS:
        return actual == check_value

    if condition == InterlockCondition.NOT_EQUALS:
        return actual != check_value

    if condition == InterlockCondition.GREATER_THAN:
        try:
            return float(actual) > float(check_value)
        except (TypeError, ValueError):
            return False

    if condition == InterlockCondition.LESS_THAN:
        try:
            return float(actual) < float(check_value)
        except (TypeError, ValueError):
            return False

    if condition == InterlockCondition.IN_RANGE:
        try:
            val = float(actual)
            lo = float(check_value)
            hi = float(check_value_high)
            return lo <= val <= hi
        except (TypeError, ValueError):
            return False

    if condition == InterlockCondition.IS_TRUE:
        return bool(actual) is True

    if condition == InterlockCondition.IS_FALSE:
        return bool(actual) is False

    return False


# ---------------------------------------------------------------------------
# Interlock engine
# ---------------------------------------------------------------------------


class InterlockEngine:
    """Evaluates safety interlock rules against live process state.

    Usage::

        engine = InterlockEngine(tag_reader=opc_client)
        engine.add_rule(InterlockRule(
            rule_id="IL-001",
            name="Pump running guard",
            target_tag_pattern="WH/WHK01/Distillery01/*/Valve_Open",
            check_tag="WH/WHK01/Distillery01/Pump01/Running",
            condition=InterlockCondition.IS_TRUE,
        ))

        result = await engine.check(request, result)
        # result.interlock_passed is True/False
    """

    def __init__(self, tag_reader: TagReader | None = None) -> None:
        self._rules: dict[str, InterlockRule] = {}
        self._reader: TagReader = tag_reader or _NullReader()

    # -- Rule registry -------------------------------------------------------

    def add_rule(self, rule: InterlockRule) -> None:
        """Register an interlock rule."""
        self._rules[rule.rule_id] = rule

    def remove_rule(self, rule_id: str) -> bool:
        """Remove a rule. Returns True if it existed."""
        return self._rules.pop(rule_id, None) is not None

    def get_rule(self, rule_id: str) -> InterlockRule | None:
        return self._rules.get(rule_id)

    def get_all_rules(self) -> list[InterlockRule]:
        return list(self._rules.values())

    @property
    def rule_count(self) -> int:
        return len(self._rules)

    # -- Evaluation ----------------------------------------------------------

    async def check(
        self, request: WriteRequest, result: WriteResult
    ) -> WriteResult:
        """Evaluate all matching interlock rules.  Mutates *result*.

        Stops at the first blocking rule (unless bypassed).  On failure,
        sets ``result.status`` to REJECTED_INTERLOCK.
        """
        matching_rules = self._find_matching_rules(request.tag_path)

        if not matching_rules:
            result.interlock_passed = True
            return result

        for rule in matching_rules:
            if not rule.enabled:
                continue

            # Read the check tag's live value
            check_value = await self._reader.read_tag(rule.check_tag)

            blocked = _evaluate_condition(
                actual=check_value,
                condition=rule.condition,
                check_value=rule.check_value,
                check_value_high=rule.check_value_high,
            )

            if not blocked:
                continue

            # The interlock condition is satisfied — write is blocked
            # unless the requestor can bypass.
            if self._can_bypass(request, rule):
                # Bypass granted — record it but allow the write
                result.interlock_rule_id = rule.rule_id
                continue

            # Blocked.
            result.interlock_passed = False
            result.interlock_error = (
                f"Interlock [{rule.rule_id}] {rule.name}: "
                f"cannot write to {request.tag_path} while "
                f"{rule.check_tag} satisfies {rule.condition.value}"
            )
            result.interlock_rule_id = rule.rule_id
            result.status = WriteStatus.REJECTED_INTERLOCK
            return result

        result.interlock_passed = True
        return result

    # -- Internals -----------------------------------------------------------

    def _find_matching_rules(self, tag_path: str) -> list[InterlockRule]:
        """Return rules whose target_tag_pattern matches the tag path."""
        return [
            rule
            for rule in self._rules.values()
            if fnmatch.fnmatch(tag_path, rule.target_tag_pattern)
        ]

    @staticmethod
    def _can_bypass(request: WriteRequest, rule: InterlockRule) -> bool:
        """Check if the requestor is allowed to bypass this interlock."""
        if not request.interlock_bypass:
            return False
        if not request.reason:
            return False
        return request.role.has_authority_over(rule.bypass_min_role)
