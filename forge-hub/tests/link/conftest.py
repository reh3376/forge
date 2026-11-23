"""Shared fixtures for tests of the link: the samples of ``tests/samples.py`` by name."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from tests import samples

if TYPE_CHECKING:
    from forge_core.models.adapter import AdapterHealth, AdapterManifest
    from forge_core.models.contextual_record import ContextualRecord


@pytest.fixture()
def sample_record() -> ContextualRecord:
    return samples.sample_record()


@pytest.fixture()
def sample_manifest() -> AdapterManifest:
    return samples.sample_manifest()


@pytest.fixture()
def sample_health() -> AdapterHealth:
    return samples.sample_health()
