"""Tests for the ModuleScaffolder — end-to-end file generation.

Validates:
1. Complete module generation into a temp directory
2. All required files are created
3. Generated manifest.json is valid
4. Generated code compiles (syntax check)
5. Test and FACTS spec generation
6. Overwrite protection
7. ScaffoldResult correctness
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest

from forge_core.sdk.module_builder.manifest_builder import ManifestBuilder
from forge_core.sdk.module_builder.scaffolder import ModuleScaffolder

if TYPE_CHECKING:
    from pathlib import Path


@pytest.fixture()
def manifest() -> dict:
    return (
        ManifestBuilder("test-scaffold")
        .name("Test Scaffold Adapter")
        .protocol("rest")
        .tier("MES_MOM")
        .capability("subscribe", True)
        .capability("discover", True)
        .connection_param("api_url", required=True, description="API URL")
        .connection_param("token", required=True, secret=True, description="Auth token")
        .context_field("equipment_id")
        .context_field("batch_id")
        .auth_method("bearer_token")
        .build()
    )


@pytest.fixture()
def temp_project(tmp_path) -> Path:
    """Create a minimal project structure for scaffolding into."""
    (tmp_path / "forge-modules").mkdir()
    return tmp_path


class TestModuleScaffolder:
    def test_generate_creates_module_dir(self, manifest, temp_project):
        scaffolder = ModuleScaffolder(manifest)
        target = scaffolder.package_dir(temp_project / "forge-modules")
        result = scaffolder.generate(target)
        assert result.module_dir == target
        assert target.is_dir()

    def test_all_required_files_created(self, manifest, temp_project):
        scaffolder = ModuleScaffolder(manifest)
        target = scaffolder.package_dir(temp_project / "forge-modules")
        scaffolder.generate(target, include_tests=False, include_facts=False)

        required = [
            "__init__.py",
            "manifest.json",
            "adapter.py",
            "config.py",
            "context.py",
            "record_builder.py",
        ]
        for fname in required:
            assert (target / fname).exists(), f"Missing: {fname}"

    def test_manifest_json_valid(self, manifest, temp_project):
        scaffolder = ModuleScaffolder(manifest)
        target = scaffolder.package_dir(temp_project / "forge-modules")
        scaffolder.generate(target, include_tests=False, include_facts=False)

        with (target / "manifest.json").open() as f:
            parsed = json.load(f)
        assert parsed["adapter_id"] == "test-scaffold"
        assert parsed["capabilities"]["subscribe"] is True

    def test_generated_python_compiles(self, manifest, temp_project):
        """All generated .py files must be syntactically valid."""
        scaffolder = ModuleScaffolder(manifest)
        target = scaffolder.package_dir(temp_project / "forge-modules")
        scaffolder.generate(target, include_tests=False, include_facts=False)

        for py_file in target.glob("*.py"):
            source = py_file.read_text()
            try:
                compile(source, str(py_file), "exec")
            except SyntaxError as e:
                pytest.fail(f"Syntax error in {py_file.name}: {e}")

    def test_result_adapter_class(self, manifest, temp_project):
        scaffolder = ModuleScaffolder(manifest)
        target = scaffolder.package_dir(temp_project / "forge-modules")
        result = scaffolder.generate(target, include_tests=False, include_facts=False)
        assert result.adapter_class == "TestScaffoldAdapter"
        assert result.adapter_id == "test-scaffold"

    def test_result_files_created_count(self, manifest, temp_project):
        scaffolder = ModuleScaffolder(manifest)
        target = scaffolder.package_dir(temp_project / "forge-modules")
        result = scaffolder.generate(target, include_tests=False, include_facts=False)
        assert len(result.files_created) == 6  # 6 core files

    def test_test_file_generated(self, manifest, temp_project):
        scaffolder = ModuleScaffolder(manifest)
        target = scaffolder.package_dir(temp_project / "forge-modules")
        result = scaffolder.generate(target, include_tests=True, include_facts=False)
        assert result.test_file is not None
        assert result.test_file.exists()
        assert "test_test_scaffold.py" in result.test_file.name

    def test_facts_spec_generated(self, manifest, temp_project):
        scaffolder = ModuleScaffolder(manifest)
        target = scaffolder.package_dir(temp_project / "forge-modules")
        result = scaffolder.generate(target, include_tests=False, include_facts=True)
        assert result.facts_file is not None
        assert result.facts_file.exists()
        spec = json.loads(result.facts_file.read_text())
        assert spec["adapter_identity"]["adapter_id"] == "test-scaffold"

    def test_no_overwrite_by_default(self, manifest, temp_project):
        """Existing files should not be overwritten without --overwrite."""
        scaffolder = ModuleScaffolder(manifest)
        target = scaffolder.package_dir(temp_project / "forge-modules")

        # First generation
        scaffolder.generate(target, include_tests=False, include_facts=False)

        # Mark a file with custom content
        (target / "config.py").write_text("# CUSTOM CONTENT")

        # Second generation — should skip existing
        result = scaffolder.generate(target, include_tests=False, include_facts=False)

        # File should retain custom content
        assert (target / "config.py").read_text() == "# CUSTOM CONTENT"
        assert len(result.files_created) == 0  # All skipped

    def test_overwrite_when_enabled(self, manifest, temp_project):
        scaffolder = ModuleScaffolder(manifest)
        target = scaffolder.package_dir(temp_project / "forge-modules")

        scaffolder.generate(target, include_tests=False, include_facts=False)
        (target / "config.py").write_text("# CUSTOM")

        result = scaffolder.generate(
            target, include_tests=False, include_facts=False, overwrite=True
        )
        assert "# CUSTOM" not in (target / "config.py").read_text()
        assert len(result.files_created) == 6

    def test_conftest_created_for_tests(self, manifest, temp_project):
        scaffolder = ModuleScaffolder(manifest)
        target = scaffolder.package_dir(temp_project / "forge-modules")
        scaffolder.generate(target, include_tests=True, include_facts=False)

        module = temp_project / "forge-modules" / "test-scaffold"
        assert (module / "tests" / "conftest.py").exists()
        assert (module / "tests" / "test_test_scaffold.py").exists()

    def test_the_module_is_laid_out_in_the_standard_structure(self, manifest, temp_project):
        """Its package, its tests and its spec are in the module's own folder (FB-201)."""
        scaffolder = ModuleScaffolder(manifest)
        target = scaffolder.package_dir(temp_project / "forge-modules")
        result = scaffolder.generate(target)
        module = temp_project / "forge-modules" / "test-scaffold"
        assert target == module / "src" / "python" / "test_scaffold"
        assert ModuleScaffolder.module_root(target) == module
        assert result.facts_file == module / "fxts" / "facts" / "test-scaffold.facts.json"
        assert result.test_file == module / "tests" / "test_test_scaffold.py"
        produced = {path.relative_to(module).parts[0] for path in result.files_created}
        assert produced == {"src", "tests", "fxts"}

    def test_the_generated_code_imports_the_modules_own_package(self, manifest, temp_project):
        """There is no package ``forge``: a generated module imports itself by its name."""
        scaffolder = ModuleScaffolder(manifest)
        result = scaffolder.generate(scaffolder.package_dir(temp_project / "forge-modules"))
        text = "".join(path.read_text() for path in result.files_created if path.suffix == ".py")
        assert "from test_scaffold.config import" in text
        assert "forge.adapters" not in text and "from forge." not in text


class TestModuleScaffolderProperties:
    def test_adapter_id_property(self, manifest):
        scaffolder = ModuleScaffolder(manifest)
        assert scaffolder.adapter_id == "test-scaffold"

    def test_adapter_class_name_property(self, manifest):
        scaffolder = ModuleScaffolder(manifest)
        assert scaffolder.adapter_class_name == "TestScaffoldAdapter"
