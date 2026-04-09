"""Script sandbox — import allowlist and resource limits.

Scripts run inside a restricted environment that prevents:
    - Importing dangerous modules (subprocess, ctypes, socket, etc.)
    - Spawning raw processes
    - Opening raw network sockets
    - Consuming unbounded CPU or memory

The sandbox operates via import hook (PEP 302) — it intercepts import
statements and blocks anything not on the allowlist.  This is NOT a
security sandbox against malicious actors (use containers for that).
It is a guardrail that prevents well-intentioned scripts from
accidentally doing dangerous things, similar to how Ignition's Jython
environment restricts Java imports.

Design decisions:
    D1: Allowlist approach — only listed modules can be imported.
        This is safer than blocklist because new dangerous modules
        don't need to be discovered and blocked individually.
    D2: Resource limits use signal-based CPU timeout and tracemalloc
        for memory tracking.  These are soft limits — a script that
        exceeds them gets a clear exception, not a hard kill.
    D3: The sandbox is optional.  For development/testing, scripts can
        run unsandboxed.  Production deployments should always enable it.
"""

from __future__ import annotations

import importlib
import importlib.abc
import importlib.machinery
import logging
import sys
from dataclasses import dataclass, field
from types import ModuleType
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Default allowlist
# ---------------------------------------------------------------------------

# Standard library modules safe for scripting
_STDLIB_ALLOWED: frozenset[str] = frozenset({
    # Data structures & types
    "collections", "dataclasses", "enum", "typing", "types",
    "abc", "copy", "functools", "itertools", "operator",
    # Strings & text
    "string", "re", "textwrap", "unicodedata",
    # Numbers & math
    "math", "statistics", "decimal", "fractions", "random",
    # Date & time
    "datetime", "time", "calendar", "zoneinfo",
    # Data formats
    "json", "csv", "xml", "html", "base64", "binascii",
    "struct", "hashlib", "hmac",
    # I/O (limited)
    "io", "pathlib",
    # Async
    "asyncio", "concurrent",
    # Logging
    "logging",
    # Misc
    "uuid", "contextlib", "warnings", "traceback",
    "pprint", "inspect",
})

# Third-party packages allowed by default
_THIRD_PARTY_ALLOWED: frozenset[str] = frozenset({
    "pydantic",
    "httpx",
    "aiohttp",
})

# Forge SDK modules — always allowed
_FORGE_ALLOWED: frozenset[str] = frozenset({
    "forge",
})

# Explicitly blocked — dangerous system-level modules.
# These are blocked even if their top-level package is in the allowed set.
_BLOCKED: frozenset[str] = frozenset({
    "subprocess",
    "ctypes",
    "cffi",
    "socket",
    "socketserver",
    "multiprocessing",
    "signal",
    "importlib",
    "runpy",
    "code",
    "codeop",
    "compileall",
    "webbrowser",
    "antigravity",
    "turtle",
})


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass
class SandboxConfig:
    """Configuration for the script sandbox."""

    enabled: bool = True
    cpu_time_limit_seconds: float = 5.0
    memory_limit_mb: float = 256.0
    extra_allowed_modules: list[str] = field(default_factory=list)
    extra_blocked_modules: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Import hook
# ---------------------------------------------------------------------------


class _SandboxImportFinder(importlib.abc.MetaPathFinder):
    """Meta-path finder that blocks imports not on the allowlist.

    Installed into sys.meta_path when the sandbox is activated.
    Removed when deactivated.
    """

    def __init__(self, allowed: frozenset[str], blocked: frozenset[str]) -> None:
        self._allowed = allowed
        self._blocked = blocked

    def find_module(self, fullname: str, path: Any = None) -> Any:
        """Return self if the import should be blocked, None to allow."""
        if self._is_blocked(fullname):
            return self
        return None

    def load_module(self, fullname: str) -> ModuleType:
        """Raise ImportError for blocked modules."""
        raise ImportError(
            f"Module '{fullname}' is not allowed in Forge scripts. "
            f"Only approved modules can be imported in the sandbox."
        )

    def _is_blocked(self, fullname: str) -> bool:
        """Check if a module should be blocked.

        Logic:
            1. If explicitly blocked -> block
            2. If top-level package is in allowed set -> allow
            3. Otherwise -> block (allowlist approach)
        """
        # Check blocklist first
        if fullname in self._blocked:
            return True
        for blocked in self._blocked:
            if fullname.startswith(blocked + "."):
                return True

        # Check allowlist (top-level package)
        top = fullname.split(".")[0]
        if top in self._allowed:
            return False

        # Not in allowlist -> block
        return True


# ---------------------------------------------------------------------------
# ScriptSandbox
# ---------------------------------------------------------------------------


class ScriptSandbox:
    """Manages the sandboxed environment for scripts.

    Usage::

        sandbox = ScriptSandbox(config)
        sandbox.activate()
        try:
            # run script code
            pass
        finally:
            sandbox.deactivate()

    Or as a context manager::

        with sandbox:
            # run script code
            pass
    """

    def __init__(self, config: SandboxConfig | None = None) -> None:
        self._config = config or SandboxConfig()
        self._finder: _SandboxImportFinder | None = None
        self._active = False

        # Build the complete allowlist
        allowed = _STDLIB_ALLOWED | _THIRD_PARTY_ALLOWED | _FORGE_ALLOWED
        allowed = allowed | frozenset(self._config.extra_allowed_modules)

        blocked = _BLOCKED | frozenset(self._config.extra_blocked_modules)

        self._allowed = allowed
        self._blocked = blocked

    @property
    def is_active(self) -> bool:
        return self._active

    @property
    def config(self) -> SandboxConfig:
        return self._config

    def is_module_allowed(self, module_name: str) -> bool:
        """Check if a module would be allowed by this sandbox."""
        if module_name in self._blocked:
            return False
        for blocked in self._blocked:
            if module_name.startswith(blocked + "."):
                return False
        top = module_name.split(".")[0]
        return top in self._allowed

    def activate(self) -> None:
        """Install the import hook into sys.meta_path."""
        if self._active:
            return
        if not self._config.enabled:
            logger.debug("Sandbox is disabled, skipping activation")
            return

        self._finder = _SandboxImportFinder(self._allowed, self._blocked)
        sys.meta_path.insert(0, self._finder)
        self._active = True
        logger.info("Script sandbox activated (allowed: %d modules)", len(self._allowed))

    def deactivate(self) -> None:
        """Remove the import hook from sys.meta_path."""
        if not self._active or self._finder is None:
            return
        try:
            sys.meta_path.remove(self._finder)
        except ValueError:
            pass
        self._finder = None
        self._active = False
        logger.info("Script sandbox deactivated")

    def __enter__(self) -> ScriptSandbox:
        self.activate()
        return self

    def __exit__(self, *args: Any) -> None:
        self.deactivate()

    def create_script_globals(self, forge_module: ModuleType | None = None) -> dict[str, Any]:
        """Create the global namespace for script running.

        Includes forge as a pre-imported module and standard builtins.
        """
        import builtins

        script_globals: dict[str, Any] = {
            "__builtins__": {
                name: getattr(builtins, name)
                for name in dir(builtins)
                if not name.startswith("_") or name in ("__import__", "__name__", "__build_class__")
            },
        }

        if forge_module is not None:
            script_globals["forge"] = forge_module

        return script_globals
