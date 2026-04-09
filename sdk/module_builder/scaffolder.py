"""Module Scaffolder — generates a complete adapter directory from a manifest.

The scaffolder is the main orchestrator that calls individual generators
and writes the resulting files to disk. It can generate a complete,
working adapter module from a single ManifestBuilder output.

Architecture
------------
Every Forge adapter follows a proven 6-file pattern:

    my_adapter/
    ├── __init__.py          ← Module init, exports the adapter class
    ├── manifest.json        ← Declares identity, capabilities, connection params
    ├── adapter.py           ← AdapterBase subclass with lifecycle + collect()
    ├── config.py            ← Pydantic model mapping connection_params to fields
    ├── context.py           ← Transforms raw events → RecordContext
    └── record_builder.py    ← Assembles ContextualRecord from raw + context

Additionally, the scaffolder can generate:

    tests/test_<id>.py       ← pytest scaffold with lifecycle + collection tests
    specs/<id>.facts.json    ← FACTS governance spec scaffold

How It Works
------------
1. You build a manifest using ``ManifestBuilder`` (fluent API).
2. You pass that manifest dict to ``ModuleScaffolder``.
3. ``scaffolder.generate(target_dir)`` writes all files.

The generated code compiles and passes tests immediately. Domain-specific
logic (the ``collect()`` implementation, enrichment rules, entity mappers)
is left as TODO stubs for the developer to fill in.

Example
-------
::

    from forge.sdk.module_builder import ManifestBuilder, ModuleScaffolder

    manifest = (
        ManifestBuilder("acme-plc")
        .name("ACME PLC Adapter")
        .protocol("opcua")
        .tier("OT")
        .capability("read", True)
        .capability("subscribe", True)
        .connection_param("endpoint_url", required=True, description="OPC-UA server URL")
        .connection_param("security_policy", required=False, default="Basic256Sha256")
        .context_field("equipment_id")
        .context_field("area")
        .build()
    )

    scaffolder = ModuleScaffolder(manifest)
    result = scaffolder.generate("./src/forge/adapters/acme_plc/")

    # result.files_created lists all generated files
    # result.adapter_class is "AcmePlcAdapter"
    # result.test_file is the path to the test scaffold
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from forge.sdk.module_builder.generators import (
    generate_adapter,
    generate_config,
    generate_context,
    generate_facts_spec,
    generate_init,
    generate_record_builder,
    generate_tests,
)

logger = logging.getLogger(__name__)


def _to_snake(name: str) -> str:
    """Convert adapter_id like 'whk-plc' to snake_case 'whk_plc'."""
    return name.replace("-", "_")


def _to_pascal(name: str) -> str:
    """Convert adapter_id like 'whk-plc' to PascalCase 'WhkPlc'."""
    return "".join(part.capitalize() for part in name.replace("-", "_").split("_"))


@dataclass
class ScaffoldResult:
    """Result of a module scaffolding operation.

    Attributes:
        adapter_id: The adapter identifier (e.g. "acme-plc").
        adapter_class: The generated adapter class name (e.g. "AcmePlcAdapter").
        module_dir: Path to the generated module directory.
        files_created: List of all files that were created.
        test_file: Path to the generated test file (if requested).
        facts_file: Path to the generated FACTS spec (if requested).
    """

    adapter_id: str
    adapter_class: str
    module_dir: Path
    files_created: list[Path] = field(default_factory=list)
    test_file: Path | None = None
    facts_file: Path | None = None


class ModuleScaffolder:
    """Generates a complete adapter module from a manifest dict.

    The scaffolder is stateless — it reads the manifest and produces files.
    It will NOT overwrite existing files unless ``overwrite=True`` is set.

    Parameters
    ----------
    manifest : dict
        A manifest dict, typically produced by ``ManifestBuilder.build()``.
        Must contain at minimum: adapter_id, name, capabilities, tier, protocol.
    """

    def __init__(self, manifest: dict[str, Any]) -> None:
        self._manifest = manifest
        self._adapter_id = manifest["adapter_id"]
        self._snake = _to_snake(self._adapter_id)
        self._pascal = _to_pascal(self._adapter_id)

    @property
    def adapter_id(self) -> str:
        """The adapter identifier."""
        return self._adapter_id

    @property
    def adapter_class_name(self) -> str:
        """The PascalCase adapter class name (e.g. 'AcmePlcAdapter')."""
        return f"{self._pascal}Adapter"

    def generate(
        self,
        target_dir: str | Path,
        *,
        include_tests: bool = True,
        include_facts: bool = True,
        overwrite: bool = False,
    ) -> ScaffoldResult:
        """Generate the complete adapter module.

        Parameters
        ----------
        target_dir : str or Path
            The directory where the adapter module files will be written.
            Typically ``src/forge/adapters/<snake_name>/``.
        include_tests : bool
            If True (default), also generates a test file in a ``tests/``
            sibling directory.
        include_facts : bool
            If True (default), also generates a FACTS governance spec
            in a ``specs/`` sibling directory.
        overwrite : bool
            If True, overwrite existing files. Default is False (skip
            existing files with a warning).

        Returns
        -------
        ScaffoldResult
            Details about what was generated.
        """
        target = Path(target_dir).resolve()
        target.mkdir(parents=True, exist_ok=True)

        result = ScaffoldResult(
            adapter_id=self._adapter_id,
            adapter_class=self.adapter_class_name,
            module_dir=target,
        )

        # ── Core module files ──────────────────────────────────
        core_files = {
            "__init__.py": generate_init(self._manifest),
            "manifest.json": json.dumps(self._manifest, indent=2) + "\n",
            "adapter.py": generate_adapter(self._manifest),
            "config.py": generate_config(self._manifest),
            "context.py": generate_context(self._manifest),
            "record_builder.py": generate_record_builder(self._manifest),
        }

        for filename, content in core_files.items():
            filepath = target / filename
            if filepath.exists() and not overwrite:
                logger.warning("Skipping existing file: %s", filepath)
                continue
            filepath.write_text(content)
            result.files_created.append(filepath)
            logger.info("Created: %s", filepath)

        # ── Test scaffold ──────────────────────────────────────
        if include_tests:
            # Place tests relative to the adapter directory
            # Convention: tests/adapters/test_<snake>.py
            tests_dir = target.parent.parent.parent.parent / "tests" / "adapters"
            tests_dir.mkdir(parents=True, exist_ok=True)

            test_file = tests_dir / f"test_{self._snake}.py"
            if test_file.exists() and not overwrite:
                logger.warning("Skipping existing test file: %s", test_file)
            else:
                test_file.write_text(generate_tests(self._manifest))
                result.test_file = test_file
                result.files_created.append(test_file)
                logger.info("Created: %s", test_file)

            # Ensure conftest.py exists in tests/adapters/
            conftest = tests_dir / "conftest.py"
            if not conftest.exists():
                conftest.write_text(_adapter_conftest())
                result.files_created.append(conftest)

        # ── FACTS governance spec ──────────────────────────────
        if include_facts:
            specs_dir = (
                target.parent.parent / "governance" / "facts" / "specs"
            )
            specs_dir.mkdir(parents=True, exist_ok=True)

            facts_file = specs_dir / f"{self._adapter_id}.facts.json"
            if facts_file.exists() and not overwrite:
                logger.warning("Skipping existing FACTS spec: %s", facts_file)
            else:
                facts_file.write_text(generate_facts_spec(self._manifest))
                result.facts_file = facts_file
                result.files_created.append(facts_file)
                logger.info("Created: %s", facts_file)

        return result


def _adapter_conftest() -> str:
    """Generate a minimal conftest.py for adapter tests."""
    return '''# ruff: noqa: E402, UP017, UP042
"""Shared fixtures for adapter tests."""

from __future__ import annotations

import datetime as _dt_mod
import enum
import sys
from pathlib import Path

# Python 3.10 compat patches (sandbox may be 3.10, code targets 3.12+)
if not hasattr(_dt_mod, "UTC"):
    _dt_mod.UTC = _dt_mod.timezone.utc

if not hasattr(enum, "StrEnum"):
    class StrEnum(str, enum.Enum):
        pass
    enum.StrEnum = StrEnum

# Ensure src/ is importable
_src = Path(__file__).resolve().parent.parent.parent / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))
'''
