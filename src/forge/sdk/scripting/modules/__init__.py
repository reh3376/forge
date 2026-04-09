"""forge.* SDK modules — the scripting API surface.

Each module in this package provides a namespace that user scripts
import via ``import forge`` or ``from forge import tag, db, net``.

Core modules (Phase 2B — implemented):
    forge.tag         — Tag read/write/browse/subscribe
    forge.db          — SQL query/named_query/transaction
    forge.net         — HTTP client (async, typed)
    forge.log         — Structured JSON logging
    forge.alarm       — ISA-18.2 alarm interface

Extended modules (Phase 6 — script migration):
    forge.date        — Date/time utilities (replaces system.date.*)
    forge.dataset     — Tabular data manipulation (replaces system.dataset.*)
    forge.perspective — HMI/UI interaction (replaces system.perspective.*)
    forge.file        — Sandboxed file I/O (replaces system.file.*)
    forge.util        — JSON, globals, messages (replaces system.util.*)
    forge.security    — User/role queries (replaces system.security.*/user.*)

These modules are thin facades over the underlying engine components.
They are bound to a specific engine instance at script startup time
via ``bind(engine)``.
"""
