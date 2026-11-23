# FUTS — Forge UI Test Specification

**Framework ID:** FUTS
**Full Name:** Forge UI Test Specification
**CI Gate:** Hard-fail (merge-blocking)
**Status:** v0.2.0 (2026-11-22, FB-187: a binding names a point or an object). Schema, runner (`futs_runner.py`) and 17 specs: twelve widget specs, the hub's four standard screens and one reference view document, all approved by the owner. Nothing renders them yet: forge-display has no code (FB-181).
**Decided in:** `docs/decisions/forge-display.md` (D-16, signed 2026-11-20), Q-12 and Q-13

---

## Purpose

FUTS governs what a screen is made of. It standardizes two things that are done over and over: describing a widget, and laying out a screen.

Every screen in Forge is data. An installation builds its screens in the designer, and Forge's own standard screens are built the same way. FUTS is the format of that data and the rules it must meet, so that a screen saved today still means the same thing after the client that draws it has changed.

It sits beside FVTS and does a different job:

| | FVTS | FUTS |
|---|---|---|
| Says | what a module can show and do: its points, alarms, actions, surfaces | how a screen is laid out, and what a widget accepts |
| Written by | Forge, for each module | Forge for widgets and standard screens; an installation for its own screens |
| Approved by | the owner | the owner for what is in the repository; a hub's approver for an installation's screens |

A view document may use only the points and actions of the surface it lays out. It can arrange what a module declared; it cannot reach past it.

## Two kinds of spec

One schema, `spec_kind` says which.

### A widget spec

`<widget>.widget.futs.json`. What one widget accepts. A widget is given only what its spec defines.

| Section | Content |
|---|---|
| `identity` | `id`, `name`, `version`, `description` |
| `widget.category` | `general` or `plant-floor` |
| `widget.properties` | what a designer may set: name, type (`string`, `number`, `boolean`, `enum`, `token`), whether required, values of an enum, a default |
| `widget.bindings` | what may be bound to a point: name, the kind of value it takes, whether required, whether an expression may transform it |
| `widget.shows` | `quality` and `staleness`: both true for any widget with a binding |
| `widget.actions` | what a user can do through it: `tag_write`, `alarm_operation`, `module_command`, `navigate` |
| `widget.events` | moments an event handler may be attached to |
| `widget.profiles` | the render profiles it supports |

Forge alone writes widgets (D-16, Q-10). An installation builds with them and cannot change them.

### A view document

`<view>.view.futs.json`. A laid-out screen: a tree of containers and widget instances.

| Section | Content |
|---|---|
| `view.owner_module`, `view.fvts_spec`, `view.surface_id` | the module, its view spec, and the surface of it this screen lays out |
| `view.root` | a container |
| a container | `node_id`, `container` (its kind), `layout`, `children`, and a `place` when its parent places its children |
| a widget instance | `node_id`, `widget`, `props`, `bind` (by binding name: a point with an optional expression, or an object), `act` (by action name: an action of the surface), `on` (by event name: a script), and a `place` |
| `view.scripts` | the Python event handlers the screen refers to; they run in the server's workers, never in the browser |

## Containers: how a screen adapts to its device

One client serves a control-room monitor and a phone. A screen is built from containers, mixed freely, and each has a kind from a governed list (owner, 2026-11-20):

| Kind | Arranges its children | For |
|---|---|---|
| `fixed` | each at an exact position and size; the container scales to fit or keeps its size | a process graphic |
| `reflow` | in a row or column that wraps and stacks as the display narrows | forms, tables, dashboards |
| `switch` | shows one child, chosen by the width of the display | a screen that must be arranged differently on a phone |

The list is `forge-core/contract/lists/container-kinds.list.json`, hashed and approved like a spec. Adding a kind is one approved change to it and never changes a saved screen.

## Expressions

A binding is direct, or carries a CEL expression over `v` (the value) and `q` (its quality). The Go server compiles and type-checks every expression when a view document is saved or loaded, and the browser evaluates only what Go accepted (D-16, S-2). This runner is Python and cannot compile CEL: a view document with expressions gets `futs:expressions` as `NOT CHECKED` on every run until the Go server exists (FB-181).

## Checks

Every run gives `futs:schema-valid`, `futs:identity-match`, and the three verdicts every framework gives (`futs:hash-verified`, `futs:hash-approved`, `futs:schema-current`).

A widget spec also gets:

| Check | Fails when |
|---|---|
| `futs:widget-names` | a property, binding, action or event name is declared twice |
| `futs:widget-properties` | an enum has no values, a non-enum lists values, or a default does not fit its type |
| `futs:widget-shows` | a widget with a binding does not show quality and staleness |

A view document also gets:

| Check | Fails when |
|---|---|
| `futs:lists` | the list of container kinds does not verify or is not approved |
| `futs:nodes` | a node id is used twice; a container's kind is not on the list; a layout field does not belong to its kind; a child of a `fixed` container has no position, or a child of another kind has one; a `switch` shows something that is not its child, or shows nothing on a narrow display |
| `futs:view-spec` | the module's view spec is missing, edited since its hash, not that module's, or has no such surface |
| `futs:widgets` | a widget has no spec, or its spec is edited or not approved |
| `futs:props` | a property is not the widget's, is of the wrong type, or a required one is not set |
| `futs:bindings` | a binding is not the widget's; a required one is not bound; it names both a point and an object, or neither; the point or object is not of the surface; the point's type does not fit; a widget that takes an object is given a point, or the other way round; a table's column is not a field of the object's schema; an expression is used where none is taken |
| `futs:expressions` | never fails here: reported as `NOT CHECKED` when the document has expressions |
| `futs:actions` | an action is not the widget's, not of the surface, or of another kind |
| `futs:events` | an event is not the widget's, or its script is not declared or not a file in the repository |
| `futs:profiles` | a widget does not support a profile the surface allows |

## Specs

| Spec | Kind | What it is |
|---|---|---|
| `text-label`, `value-display`, `status-indicator`, `data-table`, `action-button`, `input-field`, `view-link` | widget, general | the seven for any screen |
| `level-bar`, `two-state-symbol`, `trend-chart`, `alarm-list`, `alarm-banner` | widget, plant-floor | the five for control-room screens |
| `forge-hub-status`, `forge-hub-modules`, `forge-hub-governance`, `forge-hub-access` | view | the hub's four standard screens (D-16, Q-15): one reflowing column each, a title, a line of guidance and a table per object. Forge's first standard screens |
| `reference-ferm-overview` (`tests/governance/futs/fixtures/`) | view, a test fixture | the reference view document: the fermenter overview surface of the reference view spec, laid out with every container kind. Not a screen for a plant and not a governed file; the example the runner and the tests are held to |

The twelve widgets are the first set the owner chose on 2026-11-20. More are added as new widget specs.

## Running it

```bash
forge governance run futs value-display
forge governance run futs forge-hub-status
forge governance validate-spec forge-modules/forge-display/fxts/futs/level-bar.widget.futs.json
```

`tests/governance/futs/test_futs.py` runs every spec in CI and names each failure it allows.

A spec is held to the schema version it declares: the eleven widget specs written against 0.1.0 are validated against 0.1.0 and stay approved, and an object binding in a document that declares 0.1.0 is refused.

## What is not built

| Gap | Item |
|---|---|
| Nothing renders a view document or implements a widget | FB-181 |
| Expressions are not compiled or type-checked | FB-181 |
| Go and TypeScript types are not generated from the schema; the generator is chosen with the owner | FB-176 (the remaining part) |
| An installation's view documents: storage in the hub, versions, approval per hub, export, migration | FB-184 |
| A `navigate` action's target is not checked against the views that exist | FB-184 |
| A widget cannot yet show one field of one item of a collection (a single module's state as a status indicator): a table is the only widget that takes an object | with the first screens that need it (FB-181) |
