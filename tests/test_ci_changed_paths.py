"""The CI jobs that run only when something they check has changed (BACKLOG FB-173).

``hub-go`` and ``mes-module`` are required checks on ``main``, so they always report. A
script decides whether their steps have anything to do. It must never skip a job that
had something to check, so it compares the whole branch against ``main`` and runs in
full whenever it cannot compare.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / ".github" / "scripts" / "changed-paths.sh"
WORKFLOW = (REPO / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
MES = (
    "forge-modules/forge-mes/bridge/",
    "forge-core/contract/proto/",
    "forge-modules/forge-mes/src/python/forge_mes/manifest.json",
)

pytestmark = pytest.mark.skipif(
    shutil.which("bash") is None or shutil.which("git") is None,
    reason="the changed-paths script needs bash and git",
)


def _git(repo: Path, *args: str) -> str:
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "t",
        "GIT_AUTHOR_EMAIL": "t@example.invalid",
        "GIT_COMMITTER_NAME": "t",
        "GIT_COMMITTER_EMAIL": "t@example.invalid",
    }
    done = subprocess.run(
        ["git", "-c", "commit.gpgsign=false", *args],
        cwd=repo,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    return done.stdout.strip()


def _commit(repo: Path, path: str, text: str = "x") -> str:
    target = repo / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", f"change {path}")
    return _git(repo, "rev-parse", "HEAD")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A checkout whose ``origin/main`` is one commit, with a branch checked out on it."""
    root = tmp_path / "repo"
    root.mkdir()
    _git(root, "init", "-q", "-b", "main")
    _commit(root, "README.md")
    _git(root, "update-ref", "refs/remotes/origin/main", "HEAD")
    _git(root, "checkout", "-q", "-b", "work")
    return root


def decide(repo: Path, *prefixes: str, **env: str) -> tuple[str, str]:
    """``(run, message)`` as the job would see them."""
    output = repo.parent / "output"
    output.write_text("", encoding="utf-8")
    settings = {"EVENT_NAME": "push", "REF_NAME": "work", **env}
    done = subprocess.run(
        ["bash", str(SCRIPT), "job", *prefixes],
        cwd=repo,
        env={**os.environ, **settings, "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": ""},
        capture_output=True,
        text=True,
        check=True,
    )
    return output.read_text(encoding="utf-8").strip().removeprefix("run="), done.stdout.strip()


class TestABranch:
    def test_nothing_relevant_changed(self, repo: Path) -> None:
        _commit(repo, "docs/tutorial.md")
        run, message = decide(repo, *MES)
        assert run == "false" and "nothing to check" in message and "skipped" in message

    def test_a_relevant_file_changed(self, repo: Path) -> None:
        _commit(repo, "forge-modules/forge-mes/bridge/backend/src/main.ts")
        run, message = decide(repo, *MES)
        assert (
            run == "true"
            and "forge-modules/forge-mes/bridge/backend/src/main.ts changed" in message
        )

    def test_an_exact_file_is_a_prefix_too(self, repo: Path) -> None:
        _commit(repo, "forge-modules/forge-mes/src/python/forge_mes/manifest.json")
        assert decide(repo, *MES)[0] == "true"
        _commit(repo, "forge-modules/forge-mes/src/python/forge_mes/adapter.py")
        assert (
            decide(repo, "forge-modules/forge-mes/src/python/forge_mes/manifest.json")[0] == "true"
        )

    def test_a_neighbouring_path_does_not_match(self, repo: Path) -> None:
        _commit(repo, "gopher/notes.md")
        assert decide(repo, "go/")[0] == "false"

    def test_an_earlier_commit_on_the_branch_still_counts(self, repo: Path) -> None:
        """The whole branch is compared, not only the last push: a docs-only last commit
        must not hide a change to the bridge made before it."""
        _commit(repo, "forge-modules/forge-mes/bridge/frontend/app/page.tsx")
        _commit(repo, "docs/tutorial.md")
        assert decide(repo, *MES)[0] == "true"


class TestMainAndPullRequests:
    def test_a_push_to_main_is_compared_with_where_main_was(self, repo: Path) -> None:
        before = _git(repo, "rev-parse", "HEAD")
        _commit(repo, "go/internal/models/x.go")
        _commit(repo, "docs/tutorial.md")
        assert decide(repo, "go/", REF_NAME="main", BEFORE_SHA=before)[0] == "true"
        assert decide(repo, *MES, REF_NAME="main", BEFORE_SHA=before)[0] == "false"

    def test_a_pull_request_is_compared_with_its_base(self, repo: Path) -> None:
        base = _git(repo, "rev-parse", "HEAD")
        _commit(repo, "go/go.mod")
        env = {"EVENT_NAME": "pull_request", "PR_BASE_SHA": base}
        assert decide(repo, "go/", **env)[0] == "true"
        assert decide(repo, *MES, **env)[0] == "false"


class TestItFailsOpen:
    """Whenever the comparison cannot be made, the job runs in full."""

    @pytest.mark.parametrize(
        "env",
        [
            {"REF_NAME": "main", "BEFORE_SHA": "0" * 40},  # a branch's first push
            {"REF_NAME": "main", "BEFORE_SHA": ""},
            {"REF_NAME": "main", "BEFORE_SHA": "1" * 40},  # not in a shallow checkout
            {"EVENT_NAME": "pull_request", "PR_BASE_SHA": ""},
            {"EVENT_NAME": "workflow_dispatch"},
        ],
        ids=["zero-sha", "no-sha", "unknown-sha", "no-base", "another-event"],
    )
    def test_no_usable_base(self, repo: Path, env: dict[str, str]) -> None:
        _commit(repo, "docs/tutorial.md")
        run, message = decide(repo, *MES, **env)
        assert run == "true" and "running in full" in message

    def test_no_origin_main(self, repo: Path) -> None:
        _git(repo, "update-ref", "-d", "refs/remotes/origin/main")
        _commit(repo, "docs/tutorial.md")
        assert decide(repo, *MES)[0] == "true"


class TestTheWorkflow:
    def _job(self, name: str) -> str:
        match = re.search(rf"^  {name}:\n(.*?)(?=^  [a-z-]+:\n|\Z)", WORKFLOW, re.M | re.S)
        assert match, name
        return match.group(1)

    @pytest.mark.parametrize(
        ("job", "paths"),
        [
            ("hub-go", ["forge-core/src/go/", "forge-core/contract/proto/"]),
            ("mes-module", ['"forge-modules/forge-mes/bridge/"', *MES[1:]]),
            # FB-231: everything the hub image is built from (deploy/docker/Dockerfile.forge)
            (
                "hub-image",
                [
                    "deploy/docker/",
                    ".dockerignore",
                    "pyproject.toml",
                    "uv.lock",
                    "README.md",
                    "forge-core/src/",
                    "forge-core/contract/",
                    "forge-hub/src/",
                    "forge-hub/fxts/",
                    "forge-modules/",
                ],
            ),
        ],
    )
    def test_the_job_names_what_it_checks_and_its_own_definition(
        self, job: str, paths: list[str]
    ) -> None:
        body = self._job(job)
        call = re.search(r"changed-paths\.sh " + job + r"\n(.*?)\n        env:", body, re.S)
        assert call, f"{job} does not call the script"
        for path in [*paths, ".github/workflows/ci.yml", ".github/scripts/"]:
            assert path in call.group(1), f"{job} does not watch {path}"
        assert "fetch-depth: 0" in body

    @pytest.mark.parametrize("job", ["hub-go", "mes-module", "hub-image"])
    def test_every_step_after_the_decision_depends_on_it(self, job: str) -> None:
        body = self._job(job)
        steps = re.split(r"^      - ", body.split("    steps:\n", 1)[1], flags=re.M)[1:]
        assert steps[0].startswith("uses: actions/checkout") and "id: changes" in steps[1]
        assert len(steps) > 4
        for step in steps[2:]:
            assert "if: steps.changes.outputs.run == 'true'" in step, step.splitlines()[0]

    @pytest.mark.parametrize("job", ["hub-python", "secrets-scan"])
    def test_the_other_required_jobs_always_run_in_full(self, job: str) -> None:
        assert "steps.changes" not in self._job(job)

    def test_the_script_is_executable(self) -> None:
        assert os.access(SCRIPT, os.X_OK)


def test_the_image_job_watches_everything_the_image_is_built_from() -> None:
    """FB-230 was a package root the Dockerfile did not copy; this is the other side: a path
    the Dockerfile copies that hub-image does not watch would let a change break the image
    unbuilt. Every COPY source (not a stage or another image) is under a watched prefix."""
    dockerfile = (REPO / "deploy" / "docker" / "Dockerfile.forge").read_text(encoding="utf-8")
    match = re.search(r"changed-paths\.sh hub-image\n(.*?)\n        env:", WORKFLOW, re.S)
    assert match, "hub-image does not call the script"
    watched = match.group(1).split()
    sources = [
        part
        for line in dockerfile.splitlines()
        if line.startswith("COPY ") and "--from=" not in line
        for part in line.split()[1:-1]
        if not part.startswith("--")  # COPY's own flags, such as --chmod
    ]
    assert sources, "no COPY found in the Dockerfile"
    unwatched = [s for s in sources if not any(s.lstrip("./").startswith(w) for w in watched)]
    assert unwatched == [], f"hub-image does not watch {unwatched}"
