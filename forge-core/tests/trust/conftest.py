"""SoftHSM, the software stand-in for a security device under the ``test`` stage (D-21 SF-2).

A token is made fresh in a temporary folder once per run. On a machine without SoftHSM the
device tests skip and say why (A-20); CI sets ``FORGE_TEST_SOFTHSM_REQUIRED`` so a missing
SoftHSM fails the run there instead of skipping it.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

from forge_core.coerce import env_boolean

MODULES = (
    "/opt/homebrew/lib/softhsm/libsofthsm2.so",  # Homebrew on Apple silicon
    "/usr/local/lib/softhsm/libsofthsm2.so",  # Homebrew on Intel
    "/usr/lib/softhsm/libsofthsm2.so",  # Debian and Ubuntu (softhsm2)
)
PIN, SO_PIN, LABEL = "1234", "5678", "forge-test"


@pytest.fixture(scope="session")
def softhsm(tmp_path_factory: pytest.TempPathFactory) -> tuple[str, str, str]:
    module = os.environ.get("FORGE_TEST_PKCS11_MODULE") or next(
        (m for m in MODULES if Path(m).exists()), None
    )
    util = shutil.which("softhsm2-util")
    if not module or not util:
        reason = (
            "SoftHSM is not installed (softhsm2 on Ubuntu, `brew install softhsm` on a Mac); "
            "the tests that sign on a device need it"
        )
        if env_boolean("FORGE_TEST_SOFTHSM_REQUIRED", False):
            pytest.fail(reason)
        pytest.skip(reason)
    folder = tmp_path_factory.mktemp("softhsm")
    (folder / "tokens").mkdir()
    conf = folder / "softhsm2.conf"
    conf.write_text(
        f"directories.tokendir = {folder / 'tokens'}\n"
        "objectstore.backend = file\nlog.level = ERROR\n",
        encoding="utf-8",
    )
    # Read once, when the module first initialises in this process.
    os.environ["SOFTHSM2_CONF"] = str(conf)
    subprocess.run(
        [util, "--init-token", "--free", "--label", LABEL, "--pin", PIN, "--so-pin", SO_PIN],
        check=True,
        capture_output=True,
    )
    return module, LABEL, PIN
