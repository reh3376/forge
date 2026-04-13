"""Integration test fixtures.

Integration tests require a running Docker Compose stack. They are
skipped by default — run with: ``pytest -m integration``

To start the stack:
    cd deploy/docker && docker compose up -d
"""

from __future__ import annotations

import pytest

# Skip all integration tests unless FORGE_INTEGRATION is set or -m integration is used
integration = pytest.mark.integration

# Register the custom marker
def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: marks tests as requiring Docker infrastructure"
        " (deselect with '-m \"not integration\"')",
    )


@pytest.fixture(scope="session")
def docker_available() -> bool:
    """Check if Docker infrastructure is reachable."""
    import socket

    try:
        sock = socket.create_connection(("localhost", 5432), timeout=2)
        sock.close()
        return True
    except OSError:
        return False


@pytest.fixture(scope="session")
def skip_without_docker(docker_available):
    """Skip the test if Docker is not running."""
    if not docker_available:
        pytest.skip("Docker infrastructure not available")
