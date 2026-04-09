"""Tests for the script sandbox — import allowlist and module checking."""

import pytest

from forge.sdk.scripting.sandbox import (
    ScriptSandbox,
    SandboxConfig,
    _STDLIB_ALLOWED,
    _BLOCKED,
)


# ---------------------------------------------------------------------------
# Module allowlist checks (without activating the hook)
# ---------------------------------------------------------------------------


class TestModuleAllowlist:

    def test_stdlib_allowed(self):
        sandbox = ScriptSandbox()
        assert sandbox.is_module_allowed("json")
        assert sandbox.is_module_allowed("datetime")
        assert sandbox.is_module_allowed("math")
        assert sandbox.is_module_allowed("asyncio")
        assert sandbox.is_module_allowed("re")

    def test_forge_allowed(self):
        sandbox = ScriptSandbox()
        assert sandbox.is_module_allowed("forge")
        assert sandbox.is_module_allowed("forge.sdk.scripting")
        assert sandbox.is_module_allowed("forge.modules.ot")

    def test_blocked_modules(self):
        sandbox = ScriptSandbox()
        assert not sandbox.is_module_allowed("subprocess")
        assert not sandbox.is_module_allowed("ctypes")
        assert not sandbox.is_module_allowed("socket")
        assert not sandbox.is_module_allowed("multiprocessing")

    def test_unknown_module_blocked(self):
        sandbox = ScriptSandbox()
        assert not sandbox.is_module_allowed("boto3")
        assert not sandbox.is_module_allowed("django")
        assert not sandbox.is_module_allowed("flask")

    def test_third_party_allowed(self):
        sandbox = ScriptSandbox()
        assert sandbox.is_module_allowed("pydantic")
        assert sandbox.is_module_allowed("httpx")

    def test_submodule_of_allowed(self):
        sandbox = ScriptSandbox()
        assert sandbox.is_module_allowed("json.decoder")
        assert sandbox.is_module_allowed("collections.abc")

    def test_submodule_of_blocked(self):
        sandbox = ScriptSandbox()
        assert not sandbox.is_module_allowed("subprocess.run")
        assert not sandbox.is_module_allowed("ctypes.cdll")

    def test_extra_allowed(self):
        config = SandboxConfig(extra_allowed_modules=["numpy", "pandas"])
        sandbox = ScriptSandbox(config)
        assert sandbox.is_module_allowed("numpy")
        assert sandbox.is_module_allowed("pandas")
        assert sandbox.is_module_allowed("pandas.core")

    def test_extra_blocked(self):
        config = SandboxConfig(extra_blocked_modules=["pydantic"])
        sandbox = ScriptSandbox(config)
        assert not sandbox.is_module_allowed("pydantic")


# ---------------------------------------------------------------------------
# Sandbox activation / deactivation
# ---------------------------------------------------------------------------


class TestSandboxLifecycle:

    def test_not_active_by_default(self):
        sandbox = ScriptSandbox()
        assert not sandbox.is_active

    def test_activate_deactivate(self):
        sandbox = ScriptSandbox()
        sandbox.activate()
        assert sandbox.is_active
        sandbox.deactivate()
        assert not sandbox.is_active

    def test_context_manager(self):
        sandbox = ScriptSandbox()
        with sandbox:
            assert sandbox.is_active
        assert not sandbox.is_active

    def test_disabled_sandbox_skips_activation(self):
        config = SandboxConfig(enabled=False)
        sandbox = ScriptSandbox(config)
        sandbox.activate()
        assert not sandbox.is_active

    def test_double_activate_is_noop(self):
        sandbox = ScriptSandbox()
        sandbox.activate()
        sandbox.activate()  # Should not raise
        assert sandbox.is_active
        sandbox.deactivate()

    def test_double_deactivate_is_noop(self):
        sandbox = ScriptSandbox()
        sandbox.activate()
        sandbox.deactivate()
        sandbox.deactivate()  # Should not raise
        assert not sandbox.is_active


# ---------------------------------------------------------------------------
# Import blocking (with activation)
# ---------------------------------------------------------------------------


class TestImportBlocking:

    def test_blocked_import_raises(self):
        """When sandbox is active, importing a blocked module fails."""
        sandbox = ScriptSandbox()
        sandbox.activate()
        try:
            # Try to find the module through the sandbox finder
            finder = sandbox._finder
            assert finder is not None
            # The finder should return itself for blocked modules
            result = finder.find_module("subprocess")
            assert result is not None  # Means it will be blocked
            with pytest.raises(ImportError, match="not allowed"):
                finder.load_module("subprocess")
        finally:
            sandbox.deactivate()

    def test_allowed_import_passes(self):
        """Allowed modules return None from find_module (pass through)."""
        sandbox = ScriptSandbox()
        sandbox.activate()
        try:
            finder = sandbox._finder
            assert finder is not None
            result = finder.find_module("json")
            assert result is None  # Means it passes through to normal import
        finally:
            sandbox.deactivate()


# ---------------------------------------------------------------------------
# SandboxConfig
# ---------------------------------------------------------------------------


class TestSandboxConfig:

    def test_defaults(self):
        config = SandboxConfig()
        assert config.enabled is True
        assert config.cpu_time_limit_seconds == 5.0
        assert config.memory_limit_mb == 256.0
        assert config.extra_allowed_modules == []
        assert config.extra_blocked_modules == []

    def test_custom_config(self):
        config = SandboxConfig(
            cpu_time_limit_seconds=10.0,
            memory_limit_mb=512.0,
            extra_allowed_modules=["numpy"],
        )
        assert config.cpu_time_limit_seconds == 10.0
        assert config.memory_limit_mb == 512.0
        assert "numpy" in config.extra_allowed_modules


# ---------------------------------------------------------------------------
# Script globals
# ---------------------------------------------------------------------------


class TestScriptGlobals:

    def test_globals_include_builtins(self):
        sandbox = ScriptSandbox()
        g = sandbox.create_script_globals()
        assert "__builtins__" in g
        builtins = g["__builtins__"]
        assert "print" in builtins
        assert "len" in builtins
        assert "range" in builtins
        assert "dict" in builtins

    def test_globals_with_forge_module(self):
        import types
        fake_forge = types.ModuleType("forge")
        sandbox = ScriptSandbox()
        g = sandbox.create_script_globals(forge_module=fake_forge)
        assert "forge" in g
        assert g["forge"] is fake_forge
