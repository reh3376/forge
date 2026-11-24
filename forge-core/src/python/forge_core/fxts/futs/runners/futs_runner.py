"""FUTS runner: widget specs and view documents (BACKLOG FB-176; D-16).

A widget spec is checked for what every widget owes: names that do not collide, an
enumerated property with its values, and quality and staleness shown whenever something
can be bound. A view document is checked against the widget specs of the widgets it
uses, against the governed list of container kinds, and against the view spec (FVTS) of
the module whose data it shows: it may bind only the points and call only the actions of
the surface it lays out.

Expressions are CEL. The Go server compiles and type-checks them (D-16, S-2); this
runner cannot, and says so on every run with a ``NOT_RUN`` verdict.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

import jsonschema

from forge_core.fxts import locations
from forge_core.fxts.futs import REPO_ROOT
from forge_core.fxts.futs.checks import CHECKS as FUTS_CHECKS
from forge_core.fxts.shared import lists
from forge_core.fxts.shared.runner import (
    FxTSRunner,
    FxTSVerdict,
    SpecViolation,
    VerdictStatus,
    verify_spec_hash,
)

if TYPE_CHECKING:
    from pathlib import Path

CONTAINER_KINDS = "container-kinds"
EXPRESSION_ITEM = "FB-181"
ALARMS_POINT = "@alarms"

#: FVTS point data types by the value type a widget binding asks for.
NUMERIC = frozenset({"FLOAT", "DOUBLE", "INT", "INTEGER", "LONG", "NUMBER"})
ACCEPTS: dict[str, frozenset[str] | None] = {
    "number": NUMERIC,
    "series": NUMERIC,
    "boolean": frozenset({"BOOLEAN", "BOOL"}),
    "enum": frozenset({"ENUM", "BOOLEAN", "BOOL", "STRING"}),
    "string": frozenset({"STRING", "ENUM"}),
    "any": None,
    "objects": None,
}
PROP_TYPES: dict[str, tuple[type, ...]] = {
    "string": (str,),
    "token": (str,),
    "enum": (str,),
    "number": (int, float),
    "boolean": (bool,),
}

_TOP_LEVEL = frozenset(
    {"spec_version", "spec_kind", "identity", "widget", "view", "metadata", "integrity"}
)
_DEFS = frozenset(
    {
        # widgetSpec
        "category", "properties", "bindings", "shows", "actions", "events", "profiles",
        # widgetProperty, widgetBinding, widgetAction, widgetEvent
        "prop_name", "prop_type", "prop_required", "prop_enum", "prop_default", "prop_description",
        "binding_name", "value_type", "binding_required", "expression_allowed",
        "binding_description", "action_name", "action_kind", "action_description",
        "event_name", "event_description",
        # viewDocument, container, breakpoint, place
        "owner_module", "fvts_spec", "surface_id", "root", "scripts",
        "node_id", "container", "place", "layout", "children", "min_width", "show",
        "x", "y", "w", "h",
        # widgetInstance, bound, scriptRef
        "widget", "props", "bind", "act", "on", "point", "object", "expression",
        "script_id", "script_path",
    }
)  # fmt: skip


def _load(path: Path) -> tuple[Any, str]:
    try:
        return json.loads(path.read_text(encoding="utf-8")), ""
    except FileNotFoundError:
        return None, "not found"
    except (OSError, json.JSONDecodeError) as exc:
        return None, f"not readable as JSON: {exc}"


def _walk(node: dict[str, Any], parent: dict[str, Any] | None = None):
    """Every node of a view document with its parent container, depth first."""
    yield node, parent
    for child in node.get("children", []) if "container" in node else []:
        yield from _walk(child, node)


class FUTSRunner(FxTSRunner):
    """UI runner for the FUTS framework: widget specs and view documents."""

    CHECKS = FUTS_CHECKS

    framework = "FUTS"
    version = "0.1.0"

    _ENFORCED_FIELDS: ClassVar[set[str]] = set(_TOP_LEVEL) | {f"$.{name}" for name in _DEFS}
    _repo_root: Path = REPO_ROOT

    def implemented_fields(self) -> set[str]:
        return set(self._ENFORCED_FIELDS)

    async def _run_checks(self, target: str, **kwargs: Any) -> list[FxTSVerdict]:
        spec: dict[str, Any] | None = kwargs.get("spec")
        if spec is None:
            return [
                FxTSVerdict(
                    check_id="futs:spec-load",
                    spec_ref="FUTS/spec-load",
                    status=VerdictStatus.ERROR,
                    message=f"No spec provided for '{target}'.",
                )
            ]
        schema_verdict = self._check_schema(spec)
        head = [schema_verdict, self._check_identity(spec, target)]
        if schema_verdict.status != VerdictStatus.PASS:
            return head  # the remaining checks read fields the schema guarantees
        if spec["spec_kind"] == "widget":
            return [*head, *self._widget_checks(spec["widget"])]
        return [
            *head,
            *self._view_checks(
                spec["view"],
                repo_root=kwargs.get("repo_root") or REPO_ROOT,
                specs_dir=kwargs.get("specs_dir"),
                lists_dir=kwargs.get("lists_dir"),
            ),
        ]

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _verdict(
        check: str,
        ref: str,
        violations: list[SpecViolation],
        ok: str,
        *,
        evidence: dict[str, Any] | None = None,
    ) -> FxTSVerdict:
        if violations:
            head = "; ".join(v.message for v in violations[:3])
            more = f" (+{len(violations) - 3} more)" if len(violations) > 3 else ""
            return FxTSVerdict(
                check_id=f"futs:{check}",
                spec_ref=f"FUTS/{ref}",
                status=VerdictStatus.FAIL,
                message=f"{len(violations)} violation(s): {head}{more}",
                violations=violations,
                evidence=evidence or {},
            )
        return FxTSVerdict(
            check_id=f"futs:{check}",
            spec_ref=f"FUTS/{ref}",
            status=VerdictStatus.PASS,
            message=ok,
            evidence=evidence or {},
        )

    def _check_schema(self, spec: dict[str, Any]) -> FxTSVerdict:
        if self.schema is None:
            return FxTSVerdict(
                check_id="futs:schema-valid",
                spec_ref="FUTS/schema",
                status=VerdictStatus.ERROR,
                message="No schema configured.",
            )
        schema = self.schema_for(spec) or self.schema
        validator = jsonschema.Draft202012Validator(schema)
        violations = [
            SpecViolation(
                field="/".join(str(part) for part in error.absolute_path) or "<root>",
                message=error.message[:200],
            )
            for error in sorted(validator.iter_errors(spec), key=lambda e: list(e.absolute_path))
        ]
        return self._verdict(
            "schema-valid", "schema", violations, f"Spec validates against {schema['$id']}."
        )

    def _check_identity(self, spec: dict[str, Any], target: str) -> FxTSVerdict:
        found = (spec.get("identity") or {}).get("id", "") if isinstance(spec, dict) else ""
        violations = (
            []
            if found == target
            else [
                SpecViolation(
                    field="identity.id",
                    expected=target,
                    actual=found,
                    message=f"spec is for '{found}', not '{target}'",
                )
            ]
        )
        return self._verdict(
            "identity-match", "identity/id", violations, f"Spec is for '{target}'."
        )

    # ------------------------------------------------------------------
    # a widget spec
    # ------------------------------------------------------------------

    def _widget_checks(self, widget: dict[str, Any]) -> list[FxTSVerdict]:
        names: list[SpecViolation] = []
        for section, key in (
            ("properties", "prop_name"),
            ("bindings", "binding_name"),
            ("actions", "action_name"),
            ("events", "event_name"),
        ):
            seen: set[str] = set()
            for entry in widget[section]:
                if entry[key] in seen:
                    names.append(
                        SpecViolation(
                            field=f"widget.{section}", message=f"'{entry[key]}' is declared twice"
                        )
                    )
                seen.add(entry[key])
        enums = []
        for prop in widget["properties"]:
            values = prop.get("prop_enum")
            if prop["prop_type"] == "enum" and not values:
                enums.append(
                    SpecViolation(
                        field=f"widget.properties.{prop['prop_name']}",
                        message=f"'{prop['prop_name']}' is an enum with no values",
                    )
                )
            if prop["prop_type"] != "enum" and values:
                enums.append(
                    SpecViolation(
                        field=f"widget.properties.{prop['prop_name']}",
                        message=f"'{prop['prop_name']}' lists values but is not an enum",
                    )
                )
            if "prop_default" in prop:
                problem = self._prop_problem(prop, prop["prop_default"])
                if problem:
                    enums.append(
                        SpecViolation(
                            field=f"widget.properties.{prop['prop_name']}",
                            message=f"default of '{prop['prop_name']}': {problem}",
                        )
                    )
        shows = []
        if widget["bindings"]:
            shows = [
                SpecViolation(
                    field=f"widget.shows.{what}",
                    message=(
                        f"the widget can be bound to a point, so it shows its {what}: a bad "
                        "or stale value is never shown as a good one"
                    ),
                )
                for what in ("quality", "staleness")
                if not widget["shows"][what]
            ]
        return [
            self._verdict("widget-names", "widget", names, "Every declared name is unique."),
            self._verdict(
                "widget-properties",
                "widget/properties",
                enums,
                f"{len(widget['properties'])} properties, each with a usable type and default.",
            ),
            self._verdict(
                "widget-shows",
                "widget/shows",
                shows,
                "Quality and staleness are shown for what is bound."
                if widget["bindings"]
                else "Nothing can be bound, so there is no quality or staleness to show.",
            ),
        ]

    @staticmethod
    def _prop_problem(prop: dict[str, Any], value: Any) -> str:
        wanted = PROP_TYPES[prop["prop_type"]]
        if isinstance(value, bool) and bool not in wanted:
            return f"{value!r} is not a {prop['prop_type']}"
        if not isinstance(value, wanted):
            return f"{value!r} is not a {prop['prop_type']}"
        if prop["prop_type"] == "enum" and value not in prop.get("prop_enum", []):
            return f"{value!r} is not one of {prop.get('prop_enum', [])}"
        return ""

    # ------------------------------------------------------------------
    # a view document
    # ------------------------------------------------------------------

    def _view_checks(
        self, view: dict[str, Any], *, repo_root: Path, specs_dir: Path, lists_dir: Path | None
    ) -> list[FxTSVerdict]:
        kinds = lists.load(CONTAINER_KINDS, lists_dir)
        self._repo_root = repo_root
        nodes = list(_walk(view["root"]))
        instances = [(node, parent) for node, parent in nodes if "widget" in node]
        fvts, fvts_error = _load(repo_root / view["fvts_spec"])
        surface, fvts_verdict = self._check_fvts(view, fvts, fvts_error)
        widgets = self._load_widgets({node["widget"] for node, _ in instances}, specs_dir)
        return [
            self._verdict(
                "lists",
                "lists",
                [
                    SpecViolation(field=f"lists/{CONTAINER_KINDS}", message=p)
                    for p in kinds.problems
                ],
                "The governed list of container kinds verifies and is approved by the owner.",
            ),
            self._check_nodes(view, nodes, kinds),
            fvts_verdict,
            self._check_widgets(instances, widgets),
            self._check_props(instances, widgets),
            self._check_bindings(instances, widgets, fvts, surface),
            self._check_expressions(instances),
            self._check_actions(instances, widgets, fvts, surface),
            self._check_events(view, instances, widgets, repo_root),
            self._check_profiles(instances, widgets, surface),
        ]

    def _load_widgets(
        self, ids: set[str], specs_dir: Path | None
    ) -> dict[str, tuple[dict[str, Any] | None, str]]:
        """Each widget spec a view document uses, or why it cannot be used.

        A widget spec is looked for in ``specs_dir`` when one is given, and otherwise in
        every ``fxts/futs`` folder: the widgets are forge-display's, a view is its module's.
        """
        out: dict[str, tuple[dict[str, Any] | None, str]] = {}
        for widget_id in sorted(ids):
            name = f"{widget_id}.widget.futs.json"
            file = specs_dir / name if specs_dir is not None else locations.find_spec("futs", name)
            spec, error = (
                _load(file) if file is not None else (None, f"{name} is in no fxts folder")
            )
            if spec is None:
                out[widget_id] = (None, f"no widget spec ({error})")
                continue
            verified, message = verify_spec_hash(spec)
            integrity = spec.get("integrity") or {}
            if verified is not True:
                out[widget_id] = (None, f"its spec's hash does not verify: {message}")
            elif integrity.get("hash_state") != "approved" or not integrity.get("approved_by"):
                out[widget_id] = (None, "its spec is not approved by the owner")
            elif spec.get("spec_kind") != "widget" or spec["identity"]["id"] != widget_id:
                out[widget_id] = (None, "the file is not the spec of that widget")
            else:
                out[widget_id] = (spec["widget"], "")
        return out

    def _check_nodes(
        self,
        view: dict[str, Any],
        nodes: list[tuple[dict[str, Any], dict[str, Any] | None]],
        kinds: lists.GovernedList,
    ) -> FxTSVerdict:
        violations: list[SpecViolation] = []
        seen: set[str] = set()
        for node, parent in nodes:
            node_id = node["node_id"]
            if node_id in seen:
                violations.append(
                    SpecViolation(
                        field=f"view.{node_id}", message=f"node id '{node_id}' is used twice"
                    )
                )
            seen.add(node_id)
            parent_kind = kinds.entry(parent["container"]) if parent else None
            needs_place = bool(parent_kind and parent_kind.get("children_need_place"))
            if needs_place and "place" not in node:
                violations.append(
                    SpecViolation(
                        field=f"view.{node_id}.place",
                        message=(
                            f"'{node_id}' is inside the '{parent['container']}' container "
                            f"'{parent['node_id']}' and has no position"
                        ),
                    )
                )
            if "place" in node and not needs_place:
                where = f"the '{parent['container']}' container" if parent else "the root"
                violations.append(
                    SpecViolation(
                        field=f"view.{node_id}.place",
                        message=(
                            f"'{node_id}' has a position but {where} does not place its children"
                        ),
                    )
                )
            if "container" not in node:
                continue
            kind = kinds.entry(node["container"])
            if kind is None:
                violations.append(
                    SpecViolation(
                        field=f"view.{node_id}.container",
                        actual=node["container"],
                        message=(
                            f"'{node['container']}' is not in the governed list of container kinds"
                        ),
                    )
                )
                continue
            layout = node.get("layout", {})
            allowed = set(kind.get("layout_fields", []))
            for name in sorted(set(layout) - allowed):
                violations.append(
                    SpecViolation(
                        field=f"view.{node_id}.layout.{name}",
                        message=f"'{name}' does not apply to a '{node['container']}' container",
                    )
                )
            if "breakpoints" in allowed:
                violations.extend(self._breakpoint_violations(node, layout))
        return self._verdict(
            "nodes",
            "view/root",
            violations,
            f"{len(nodes)} nodes with unique ids; every container's kind and layout fit.",
            evidence={"nodes": len(nodes)},
        )

    @staticmethod
    def _breakpoint_violations(node: dict[str, Any], layout: dict[str, Any]) -> list[SpecViolation]:
        node_id = node["node_id"]
        points = layout.get("breakpoints")
        if not points:
            return [
                SpecViolation(
                    field=f"view.{node_id}.layout.breakpoints",
                    message=f"'{node_id}' switches between its children and names no breakpoint",
                )
            ]
        children = {child["node_id"] for child in node["children"]}
        out = [
            SpecViolation(
                field=f"view.{node_id}.layout.breakpoints",
                message=f"breakpoint shows '{point['show']}', which is not a child of '{node_id}'",
            )
            for point in points
            if point["show"] not in children
        ]
        widths = [point["min_width"] for point in points]
        if 0 not in widths:
            out.append(
                SpecViolation(
                    field=f"view.{node_id}.layout.breakpoints",
                    message=(
                        f"'{node_id}' has no breakpoint from width 0: a narrow "
                        "display shows nothing"
                    ),
                )
            )
        if len(set(widths)) != len(widths):
            out.append(
                SpecViolation(
                    field=f"view.{node_id}.layout.breakpoints",
                    message=f"'{node_id}' names the same width twice",
                )
            )
        return out

    def _check_fvts(
        self, view: dict[str, Any], fvts: Any, error: str
    ) -> tuple[dict[str, Any] | None, FxTSVerdict]:
        violations: list[SpecViolation] = []
        surface = None
        if not isinstance(fvts, dict):
            violations.append(
                SpecViolation(field="view.fvts_spec", message=f"{view['fvts_spec']}: {error}")
            )
        else:
            verified, message = verify_spec_hash(fvts)
            if verified is not True:
                violations.append(SpecViolation(field="view.fvts_spec", message=message))
            owner = (fvts.get("view_identity") or {}).get("owner_module")
            if owner != view["owner_module"]:
                violations.append(
                    SpecViolation(
                        field="view.owner_module",
                        expected=owner,
                        actual=view["owner_module"],
                        message=f"the view spec belongs to '{owner}', not '{view['owner_module']}'",
                    )
                )
            surface = next(
                (s for s in fvts.get("surfaces", []) if s.get("surface_id") == view["surface_id"]),
                None,
            )
            if surface is None:
                violations.append(
                    SpecViolation(
                        field="view.surface_id",
                        actual=view["surface_id"],
                        message=f"the view spec has no surface '{view['surface_id']}'",
                    )
                )
        return surface, self._verdict(
            "view-spec",
            "view/fvts_spec",
            violations,
            f"Lays out surface '{view['surface_id']}' of {view['owner_module']}'s view spec.",
        )

    def _check_widgets(self, instances: list, widgets: dict) -> FxTSVerdict:
        violations = [
            SpecViolation(field=f"view.{node['node_id']}.widget", message=f"'{wid}': {why}")
            for node, _ in instances
            for wid, (spec, why) in [(node["widget"], widgets[node["widget"]])]
            if spec is None
        ]
        return self._verdict(
            "widgets",
            "view/widgets",
            violations,
            f"{len(instances)} widget instances of {len(widgets)} approved widget specs.",
            evidence={"widgets": sorted(widgets)},
        )

    def _check_props(self, instances: list, widgets: dict) -> FxTSVerdict:
        violations = []
        for node, _ in instances:
            widget, _why = widgets[node["widget"]]
            if widget is None:
                continue
            declared = {prop["prop_name"]: prop for prop in widget["properties"]}
            given = node.get("props", {})
            where = f"view.{node['node_id']}.props"
            for name in sorted(set(given) - set(declared)):
                violations.append(
                    SpecViolation(
                        field=where,
                        message=f"'{node['widget']}' has no property '{name}' ({node['node_id']})",
                    )
                )
            for name, prop in declared.items():
                if name in given:
                    problem = self._prop_problem(prop, given[name])
                    if problem:
                        violations.append(
                            SpecViolation(field=f"{where}.{name}", message=f"{name}: {problem}")
                        )
                elif prop["prop_required"]:
                    violations.append(
                        SpecViolation(
                            field=f"{where}.{name}",
                            message=(
                                f"'{node['node_id']}' does not set the required property '{name}'"
                            ),
                        )
                    )
        return self._verdict(
            "props", "view/props", violations, "Every property is one the widget declares."
        )

    def _check_bindings(
        self, instances: list, widgets: dict, fvts: Any, surface: dict[str, Any] | None
    ) -> FxTSVerdict:
        violations = []
        points = {}
        if isinstance(fvts, dict):
            points = {p["point_id"]: p for p in (fvts.get("data_bindings") or {}).get("points", [])}
        on_surface = set(surface.get("points", [])) if surface else set()
        objects = {}
        if isinstance(fvts, dict):
            objects = {
                o["object_id"]: o for o in (fvts.get("data_bindings") or {}).get("objects", [])
            }
        for node, _ in instances:
            widget, _why = widgets[node["widget"]]
            if widget is None:
                continue
            declared = {b["binding_name"]: b for b in widget["bindings"]}
            bound = node.get("bind", {})
            where = f"view.{node['node_id']}.bind"
            for name in sorted(set(bound) - set(declared)):
                violations.append(
                    SpecViolation(
                        field=where, message=f"'{node['widget']}' has no binding '{name}'"
                    )
                )
            for name, binding in declared.items():
                if name not in bound:
                    if binding["binding_required"]:
                        violations.append(
                            SpecViolation(
                                field=f"{where}.{name}",
                                message=f"'{node['node_id']}' does not bind the required '{name}'",
                            )
                        )
                    continue
                point_id = bound[name].get("point")
                object_id = bound[name].get("object")
                expression = bound[name].get("expression")
                if (point_id is None) == (object_id is None):
                    violations.append(
                        SpecViolation(
                            field=f"{where}.{name}",
                            message=(
                                f"'{node['node_id']}.{name}' names a point or an object, "
                                "one of them"
                            ),
                        )
                    )
                    continue
                takes_objects = binding["value_type"] == "objects"
                if takes_objects != (object_id is not None):
                    violations.append(
                        SpecViolation(
                            field=f"{where}.{name}",
                            message=(
                                f"'{node['widget']}.{name}' takes "
                                + (
                                    "an object, not a point"
                                    if takes_objects
                                    else "a point, not an object"
                                )
                            ),
                        )
                    )
                    continue
                if object_id is not None:
                    violations.extend(
                        self._object_violations(node, name, object_id, objects, surface)
                    )
                    continue
                if expression and not binding["expression_allowed"]:
                    violations.append(
                        SpecViolation(
                            field=f"{where}.{name}.expression",
                            message=f"'{node['widget']}.{name}' does not take an expression",
                        )
                    )
                if binding["value_type"] == "alarms":
                    if point_id != ALARMS_POINT:
                        violations.append(
                            SpecViolation(
                                field=f"{where}.{name}.point",
                                message=(
                                    f"'{name}' is bound to the module's alarms, '{ALARMS_POINT}'"
                                ),
                            )
                        )
                    continue
                if point_id not in on_surface:
                    violations.append(
                        SpecViolation(
                            field=f"{where}.{name}.point",
                            actual=point_id,
                            message=(
                                f"'{point_id}' is not a point of the surface this screen lays out"
                            ),
                        )
                    )
                    continue
                accepts = ACCEPTS[binding["value_type"]]
                data_type = str(points.get(point_id, {}).get("data_type", "")).upper()
                if accepts is not None and not expression and data_type not in accepts:
                    violations.append(
                        SpecViolation(
                            field=f"{where}.{name}.point",
                            message=(
                                f"'{point_id}' is {data_type or 'of no declared type'}; "
                                f"'{node['widget']}.{name}' takes {binding['value_type']}"
                            ),
                        )
                    )
        return self._verdict(
            "bindings",
            "view/bindings",
            violations,
            (
                "Every binding is one the widget declares, to a point of the "
                "surface, of a fitting type."
            ),
        )

    def _object_violations(
        self,
        node: dict[str, Any],
        name: str,
        object_id: str,
        objects: dict[str, dict[str, Any]],
        surface: dict[str, Any] | None,
    ) -> list[SpecViolation]:
        """A binding to one of the module's collections, and the columns shown from it."""
        where = f"view.{node['node_id']}.bind.{name}"
        if node["bind"][name].get("expression"):
            return [SpecViolation(field=where, message="a collection takes no expression")]
        if object_id not in set(surface.get("objects", []) if surface else []):
            return [
                SpecViolation(
                    field=f"{where}.object",
                    actual=object_id,
                    message=f"'{object_id}' is not an object of the surface this screen lays out",
                )
            ]
        columns = [c.strip() for c in str(node.get("props", {}).get("columns", "")).split(",")]
        columns = [c for c in columns if c]
        if not columns:
            return []
        schema, error = _load(self._repo_root / objects[object_id]["schema_path"])
        if not isinstance(schema, dict):
            return [SpecViolation(field=where, message=f"the schema of '{object_id}': {error}")]
        fields = set(schema.get("properties", {}))
        return [
            SpecViolation(
                field=f"view.{node['node_id']}.props.columns",
                actual=column,
                message=f"'{column}' is not a field of '{object_id}'",
            )
            for column in columns
            if column not in fields
        ]

    def _check_expressions(self, instances: list) -> FxTSVerdict:
        """Named on every run: this runner cannot compile CEL; the Go server does (S-2)."""
        expressions = [
            bound["expression"]
            for node, _ in instances
            for bound in node.get("bind", {}).values()
            if bound.get("expression")
        ]
        if not expressions:
            return self._verdict("expressions", "view/expressions", [], "No expressions.")
        return FxTSVerdict(
            check_id="futs:expressions",
            spec_ref="FUTS/view/expressions",
            status=VerdictStatus.NOT_RUN,
            message=(
                f"NOT RUN: {len(expressions)} CEL expression(s). The Go server compiles "
                f"and type-checks an expression; it is not built ({EXPRESSION_ITEM})."
            ),
            evidence={
                "expressions": expressions,
                "unverified": True,
                "blocked_on": EXPRESSION_ITEM,
            },
        )

    def _check_actions(
        self, instances: list, widgets: dict, fvts: Any, surface: dict[str, Any] | None
    ) -> FxTSVerdict:
        violations = []
        actions = {}
        if isinstance(fvts, dict):
            actions = {a["action_id"]: a for a in fvts.get("actions", [])}
        on_surface = set(surface.get("actions", [])) if surface else set()
        for node, _ in instances:
            widget, _why = widgets[node["widget"]]
            if widget is None:
                continue
            declared = {a["action_name"]: a for a in widget["actions"]}
            where = f"view.{node['node_id']}.act"
            for name, target in node.get("act", {}).items():
                if name not in declared:
                    violations.append(
                        SpecViolation(
                            field=where, message=f"'{node['widget']}' has no action '{name}'"
                        )
                    )
                    continue
                kind = declared[name]["action_kind"]
                if kind == "navigate":
                    continue  # the target is another view; checked when views are stored (FB-184)
                if target not in on_surface:
                    violations.append(
                        SpecViolation(
                            field=f"{where}.{name}",
                            actual=target,
                            message=(
                                f"'{target}' is not an action of the surface this screen lays out"
                            ),
                        )
                    )
                elif actions.get(target, {}).get("kind") != kind:
                    violations.append(
                        SpecViolation(
                            field=f"{where}.{name}",
                            message=(
                                f"'{target}' is a {actions.get(target, {}).get('kind')}; "
                                f"'{node['widget']}.{name}' asks for a {kind}"
                            ),
                        )
                    )
        return self._verdict(
            "actions",
            "view/actions",
            violations,
            "Every action is one the widget offers and the surface declares; the core decides "
            "whether a user may take it.",
        )

    def _check_events(
        self, view: dict[str, Any], instances: list, widgets: dict, repo_root: Path
    ) -> FxTSVerdict:
        violations = []
        scripts = {s["script_id"]: s for s in view.get("scripts", [])}
        if len(scripts) != len(view.get("scripts", [])):
            violations.append(
                SpecViolation(field="view.scripts", message="a script id is used twice")
            )
        for script in scripts.values():
            path = (repo_root / script["script_path"]).resolve()
            if repo_root.resolve() not in path.parents or not path.is_file():
                violations.append(
                    SpecViolation(
                        field=f"view.scripts.{script['script_id']}",
                        message=f"{script['script_path']} is not a file inside the repository",
                    )
                )
        for node, _ in instances:
            widget, _why = widgets[node["widget"]]
            if widget is None:
                continue
            declared = {e["event_name"] for e in widget["events"]}
            for name, script_id in node.get("on", {}).items():
                if name not in declared:
                    violations.append(
                        SpecViolation(
                            field=f"view.{node['node_id']}.on",
                            message=f"'{node['widget']}' has no event '{name}'",
                        )
                    )
                if script_id not in scripts:
                    violations.append(
                        SpecViolation(
                            field=f"view.{node['node_id']}.on.{name}",
                            message=f"script '{script_id}' is not declared by this document",
                        )
                    )
        return self._verdict(
            "events", "view/events", violations, "Every event handler names a declared script."
        )

    def _check_profiles(
        self, instances: list, widgets: dict, surface: dict[str, Any] | None
    ) -> FxTSVerdict:
        wanted = set(surface.get("allowed_profiles", [])) if surface else set()
        violations = []
        for node, _ in instances:
            widget, _why = widgets[node["widget"]]
            if widget is None:
                continue
            missing = sorted(wanted - set(widget["profiles"]))
            if missing:
                violations.append(
                    SpecViolation(
                        field=f"view.{node['node_id']}.widget",
                        message=(
                            f"'{node['widget']}' does not support {missing}, which the "
                            "surface allows"
                        ),
                    )
                )
        profiles = ", ".join(sorted(wanted)) or "none"
        return self._verdict(
            "profiles",
            "view/profiles",
            violations,
            f"Every widget supports the surface's profiles ({profiles}).",
        )
