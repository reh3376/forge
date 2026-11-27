"""The object store's capability check, on a stand-in store that can be made to misbehave
(FB-314).

The check exists because a store can accept a request and not do it: one of the stores tried
took a lock and then deleted the record. So the check is proved here by being seen to fail:
the stand-in store does everything, and each fault breaks one thing a real store has broken
or could. A fault must show on the capability it breaks, and on no other.

The same check is run against the pinned image by CI (the ``hub-image`` job starts the
development stack and runs ``python -m forge_hub.storage.object_store_check`` in it).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from forge_hub.storage import object_store_check as osc
from forge_hub.storage.object_store_check import Verdict

BASE = "fake://store"


class StoreError(Exception):
    """What the stand-in store raises: an S3 error's code and message."""

    def __init__(self, code: str, message: str = "") -> None:
        self.code, self.message = code, message or code
        super().__init__(f"{code}: {self.message}")


@dataclass
class Version:
    data: bytes
    version_id: str | None
    content_type: str = "application/octet-stream"
    metadata: dict[str, str] = field(default_factory=dict)
    retain_until: datetime | None = None
    hold: bool = False
    tags: dict[str, str] = field(default_factory=dict)
    marker: bool = False


@dataclass
class Bucket:
    versioned: bool = False
    objects: dict[str, list[Version]] = field(default_factory=dict)
    policy: dict | None = None
    lifecycle: Any = None


@dataclass
class Item:
    object_name: str
    version_id: str | None = None


@dataclass
class Named:
    name: str


@dataclass
class Written:
    version_id: str | None


class Body:
    def __init__(self, data: bytes) -> None:
        self.data = data

    def read(self) -> bytes:
        return self.data

    def close(self) -> None:
        pass

    def release_conn(self) -> None:
        pass


@dataclass
class Stat:
    size: int
    content_type: str
    metadata: dict[str, str]


class Store:
    """An S3 store in memory with the calls the check makes. ``faults`` names what it gets
    wrong; with none it does everything."""

    def __init__(self, *faults: str) -> None:
        self.faults = set(faults)
        self.buckets: dict[str, Bucket] = {}
        self.ahead = timedelta()
        self.count = 0

    # -- the clock the retention is judged by, moved by the check's own waiting
    def now(self) -> datetime:
        return datetime.now(UTC) + self.ahead

    def sleep(self, seconds: float) -> None:
        self.ahead += timedelta(seconds=seconds)

    def _bucket(self, name: str) -> Bucket:
        if name not in self.buckets:
            raise StoreError("NoSuchBucket")
        return self.buckets[name]

    def _version(self, bucket: str, name: str, version_id: str | None = None) -> Version:
        versions = self._bucket(bucket).objects.get(name, [])
        if version_id is not None:
            found = [v for v in versions if v.version_id == version_id]
        else:
            found = versions[-1:]
        if not found or found[0].marker:
            raise StoreError("NoSuchKey")
        return found[0]

    def _locked(self, version: Version) -> bool:
        if version.hold and "ignores-legal-hold" not in self.faults:
            return True
        if "forgets-locks" in self.faults or version.retain_until is None:
            return False
        return "never-unlocks" in self.faults or version.retain_until > self.now()

    # -- buckets
    def make_bucket(self, name: str, object_lock: bool = False) -> None:
        self.buckets[name] = Bucket(versioned=object_lock)

    def bucket_exists(self, name: str) -> bool:
        return name in self.buckets

    def list_buckets(self) -> list[Named]:
        return [Named(name) for name in self.buckets]

    def remove_bucket(self, name: str) -> None:
        if any(self._bucket(name).objects.values()):
            raise StoreError("BucketNotEmpty")
        del self.buckets[name]

    def set_bucket_versioning(self, name: str, config: Any) -> None:
        if "no-versioning" in self.faults:
            raise StoreError("NotImplemented", "Unimplemented action: PutBucketVersioning")
        self._bucket(name).versioned = True

    def set_bucket_policy(self, name: str, policy: str) -> None:
        self._bucket(name).policy = json.loads(policy)

    def delete_bucket_policy(self, name: str) -> None:
        self._bucket(name).policy = None

    def set_bucket_lifecycle(self, name: str, config: Any) -> None:
        self._bucket(name).lifecycle = None if "forgets-lifecycle" in self.faults else config

    def get_bucket_lifecycle(self, name: str) -> Any:
        config = self._bucket(name).lifecycle
        if config is None:
            raise StoreError("NoSuchLifecycleConfiguration")
        return config

    # -- objects
    def put_object(
        self, bucket: str, name: str, stream: Any, length: int, **options: Any
    ) -> Written:
        data = stream.read()
        assert len(data) == length
        if options.get("sse") is not None and "refuses-encryption" in self.faults:
            raise StoreError("InvalidRequest", "SSE-S3 requires a master key to be set")
        if length > 5 * 1024 * 1024 and "corrupts-multipart" in self.faults:
            data = data[:-1] + bytes([data[-1] ^ 1])
        held = self._bucket(bucket)
        metadata = {} if "drops-metadata" in self.faults else dict(options.get("metadata") or {})
        if options.get("sse") is not None and "ignores-encryption" not in self.faults:
            metadata["x-amz-server-side-encryption"] = "AES256"
        self.count += 1
        retention = options.get("retention")
        version = Version(
            data,
            f"v{self.count}" if held.versioned else None,
            options.get("content_type") or "application/octet-stream",
            metadata,
            retention.retain_until_date if retention else None,
        )
        if held.versioned:
            held.objects.setdefault(name, []).append(version)
        else:
            held.objects[name] = [version]
        return Written(version.version_id)

    def get_object(
        self,
        bucket: str,
        name: str,
        offset: int = 0,
        length: int = 0,
        version_id: str | None = None,
    ) -> Body:
        data = self._version(bucket, name, version_id).data
        if length:
            start = offset + 1 if "wrong-range" in self.faults else offset
            return Body(data[start : start + length])
        return Body(data)

    def stat_object(self, bucket: str, name: str) -> Stat:
        version = self._version(bucket, name)
        return Stat(len(version.data), version.content_type, dict(version.metadata))

    def list_objects(
        self,
        bucket: str,
        prefix: str | None = None,
        recursive: bool = False,
        include_version: bool = False,
    ) -> list[Item]:
        held = self._bucket(bucket)
        names = sorted(n for n in held.objects if n.startswith(prefix or ""))
        if include_version:
            return [Item(n, v.version_id) for n in names for v in held.objects[n]]
        live = [n for n in names if held.objects[n] and not held.objects[n][-1].marker]
        if not recursive:
            cut = len(prefix or "")
            folders = sorted({n[: n.index("/", cut) + 1] for n in live if "/" in n[cut:]})
            return [Item(n) for n in folders] + [Item(n) for n in live if "/" not in n[cut:]]
        if "one-page" in self.faults:
            live = live[:1000]
        return [Item(n) for n in live]

    def remove_object(self, bucket: str, name: str, version_id: str | None = None) -> None:
        held = self._bucket(bucket)
        versions = held.objects.get(name, [])
        if version_id is None and held.versioned:
            versions.append(Version(b"", f"m{len(versions)}", marker=True))
            return
        for version in [v for v in versions if v.version_id == version_id]:
            if self._locked(version):
                raise StoreError("AccessDenied", "the object is locked")
            versions.remove(version)
        if not versions:
            held.objects.pop(name, None)

    def remove_objects(self, bucket: str, objects: Any) -> list[Any]:
        for item in list(objects):
            if "keeps-deleted" not in self.faults:
                self.remove_object(bucket, item.name)
        return []

    def copy_object(self, bucket: str, name: str, source: Any) -> None:
        original = self._version(source.bucket_name, source.object_name)
        data = b"" if "stale-copy" in self.faults else original.data
        self._bucket(bucket).objects[name] = [Version(data, None, original.content_type)]

    def presigned_get_object(self, bucket: str, name: str, expires: timedelta) -> str:
        return f"fake://presigned/{bucket}/{name}"

    def set_object_tags(self, bucket: str, name: str, tags: Any) -> None:
        if "loses-tags" not in self.faults:
            self._version(bucket, name).tags = dict(tags)

    def get_object_tags(self, bucket: str, name: str) -> dict[str, str]:
        return dict(self._version(bucket, name).tags)

    def set_object_retention(
        self, bucket: str, name: str, retention: Any, version_id: str | None = None
    ) -> None:
        version = self._version(bucket, name, version_id)
        shorter = (
            version.retain_until is not None and retention.retain_until_date < version.retain_until
        )
        if shorter and "shortens-retention" not in self.faults:
            raise StoreError("AccessDenied", "a retention is never shortened")
        version.retain_until = retention.retain_until_date

    def enable_object_legal_hold(
        self, bucket: str, name: str, version_id: str | None = None
    ) -> None:
        self._version(bucket, name, version_id).hold = True

    def disable_object_legal_hold(
        self, bucket: str, name: str, version_id: str | None = None
    ) -> None:
        self._version(bucket, name, version_id).hold = False

    # -- requests that carry no credentials
    def fetch(self, url: str) -> bytes:
        kind, bucket, name = url.removeprefix("fake://").split("/", 2)
        if kind == "presigned":
            if "dead-presigned" in self.faults:
                raise osc.RefusedError("HTTP 403")
            return self._version(bucket, name).data
        policy = self._bucket(bucket).policy
        allowed = "serves-anyone" in self.faults
        if policy:
            prefixes = [
                r.split(f":::{bucket}/", 1)[1].rstrip("*")
                for s in policy["Statement"]
                for r in s["Resource"]
            ]
            allowed = (
                allowed
                or "policy-opens-all" in self.faults
                or any(name.startswith(p) for p in prefixes)
            )
        if not allowed:
            raise osc.RefusedError("HTTP 403")
        return self._version(bucket, name).data


def run(store: Store) -> osc.Report:
    return osc.check(store, BASE, run_id="t", fetch=store.fetch, sleep=store.sleep)


def test_a_store_that_does_everything_meets_every_capability_and_is_left_empty() -> None:
    store = Store()
    report = run(store)
    assert [(r.capability, r.verdict) for r in report.results] == [
        (capability.id, Verdict.MET) for capability, _ in osc.CAPABILITIES
    ]
    assert report.met and report.left_behind == ()
    assert store.buckets == {}, "the check removes what it wrote"


#: Each way the stand-in store can misbehave, with what the check must then say: ``wrong`` when
#: the store took the request and did not do it, ``not-met`` when it refused. One fault breaks
#: one capability, but for a store that serves anyone: that breaks the two that rest on it.
FAULTS = {
    "drops-metadata": {"objects": Verdict.WRONG},
    "wrong-range": {"ranges": Verdict.WRONG},
    "one-page": {"listing": Verdict.WRONG},
    "keeps-deleted": {"bulk-delete": Verdict.WRONG},
    "corrupts-multipart": {"multipart": Verdict.WRONG},
    "stale-copy": {"copy": Verdict.WRONG},
    "dead-presigned": {"presigned": Verdict.NOT_MET},
    "loses-tags": {"tags": Verdict.WRONG},
    "no-versioning": {"versioning": Verdict.NOT_MET},
    "forgets-locks": {"lock": Verdict.WRONG},
    "shortens-retention": {"lock": Verdict.WRONG},
    "ignores-legal-hold": {"legal-hold": Verdict.WRONG},
    "ignores-encryption": {"encryption": Verdict.WRONG},
    "refuses-encryption": {"encryption": Verdict.NOT_MET},
    "policy-opens-all": {"policy": Verdict.WRONG},
    "forgets-lifecycle": {"lifecycle": Verdict.NOT_MET},
    "serves-anyone": {"policy": Verdict.WRONG, "anonymous-refused": Verdict.WRONG},
}


@pytest.mark.parametrize("fault", sorted(FAULTS))
def test_a_fault_shows_on_what_it_breaks_and_on_nothing_else(fault: str) -> None:
    store = Store(fault)
    report = run(store)
    told = {r.capability: r.verdict for r in report.results if r.verdict is not Verdict.MET}
    assert told == FAULTS[fault], [
        (r.capability, r.verdict.value, r.detail)
        for r in report.results
        if r.verdict is not Verdict.MET
    ]
    assert not report.met
    assert report.left_behind == () and store.buckets == {}, "a failed check still cleans up"


def test_every_capability_has_been_seen_to_fail() -> None:
    broken = {capability for told in FAULTS.values() for capability in told}
    assert broken == {capability.id for capability, _ in osc.CAPABILITIES}


def test_a_store_that_took_a_lock_and_deleted_the_record_is_told_so() -> None:
    """The fault that was met on a real store (Garage 2.6.0, 2026-11-27)."""
    report = run(Store("forgets-locks"))
    lock = next(r for r in report.results if r.capability == "lock")
    assert lock.verdict is Verdict.WRONG
    assert lock.detail == "deleting a locked record was accepted and the record is gone"


def test_what_the_check_cannot_remove_is_named_and_fails_it() -> None:
    store = Store("never-unlocks")
    report = run(store)
    assert all(r.verdict is Verdict.MET for r in report.results)
    assert not report.met, "a check that leaves a record behind has not passed"
    assert len(report.left_behind) == 1 and report.left_behind[0].startswith(
        "forge-check-t-lock: AccessDenied"
    )
    assert "LEFT BEHIND  forge-check-t-lock" in osc.render(report)
    assert list(store.buckets) == ["forge-check-t-lock"], (
        "the other buckets are removed all the same"
    )


def test_the_check_writes_only_to_its_own_buckets() -> None:
    store = Store()
    store.make_bucket("forge-archive")
    store.put_object("forge-archive", "kept", __import__("io").BytesIO(b"kept"), 4)
    run(store)
    assert list(store.buckets) == ["forge-archive"]
    assert store.get_object("forge-archive", "kept").read() == b"kept"


def test_the_report_says_whether_the_store_can_be_forges() -> None:
    assert osc.render(run(Store())).endswith(
        "15 of 15 capabilities met: this store can be Forge's object store"
    )
    told = osc.render(run(Store("refuses-encryption")))
    assert told.endswith("14 of 15 capabilities met: NOT Forge's object store as it is")
    assert "not-met  encryption" in told and "InvalidRequest: SSE-S3 requires a master key" in told


def test_the_command_reads_the_store_from_the_environment_and_fails_when_one_is_not_met(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    made = {}

    def client_for(
        endpoint: str, access: str, secret: str, *, secure: bool, region: str | None
    ) -> Store:
        made.update(endpoint=endpoint, access=access, secure=secure, region=region)
        return made.setdefault("store", Store("refuses-encryption"))

    monkeypatch.setenv("OBJECT_STORE_ENDPOINT", "store.plant-a:9000")
    monkeypatch.setenv("OBJECT_STORE_ACCESS_KEY", "forge-a")
    monkeypatch.setenv("OBJECT_STORE_SECURE", "true")
    monkeypatch.setenv("OBJECT_STORE_REGION", "plant-a")
    monkeypatch.setattr(osc, "client_for", client_for)
    real = osc.check
    monkeypatch.setattr(
        osc,
        "check",
        lambda client, base_url: real(
            client, BASE, run_id="t", fetch=client.fetch, sleep=client.sleep
        ),
    )
    assert osc.main() == 1
    assert made == {
        "endpoint": "store.plant-a:9000",
        "access": "forge-a",
        "secure": True,
        "region": "plant-a",
        "store": made["store"],
    }
    said = capsys.readouterr().out
    assert f"No permission check point is wired for {osc.SCOPE}" in said
    assert "Checking the object store at https://store.plant-a:9000" in said


# -- the command line -------------------------------------------------------
# As first written the command read no arguments, so ``--help`` ran the check on whatever
# store the environment named. Asking what the check does must never do it.


def _no_store(*_: Any, **__: Any) -> Any:
    raise AssertionError("a client was built: a store would have been contacted")


@pytest.mark.parametrize("arguments", [["--help"], ["-h"]])
def test_asking_what_the_check_does_never_does_it(
    arguments: list[str], monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """``--help`` describes the check before the environment is read or a client is built."""
    monkeypatch.setattr(osc, "client_for", _no_store)
    monkeypatch.setenv("OBJECT_STORE_SECURE", "perhaps")  # a run would be refused on this word
    assert osc.main(arguments) == 0
    said, complaint = capsys.readouterr()
    assert complaint == ""
    assert "It takes no arguments." in said
    for named in ("OBJECT_STORE_ENDPOINT", "OBJECT_STORE_SECURE", "forge-check-<run>", osc.SCOPE):
        assert named in said
    assert f"{osc.EXIT_NOT_RUN}, the check was not run" in said


def test_the_help_names_the_address_a_bare_run_goes_to(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """With no endpoint named, the run uses a default: the help shows that same address."""
    from forge_hub.storage.config import StorageConfig

    monkeypatch.delenv("OBJECT_STORE_ENDPOINT", raising=False)
    used = StorageConfig.from_env().object_store.endpoint
    assert osc.main(["--help"]) == 0
    assert f"when unset, {used}" in capsys.readouterr().out


@pytest.mark.parametrize(
    "arguments",
    [
        ["--endpoint", "store.plant-a:9000"],  # naming the store on the command line
        ["status"],
        ["--help", "--verbose"],  # help with anything beside it is not a request for help
        ["-hv"],
        ["--he"],  # no abbreviation stands for --help
        ["--"],  # what an argument parser would drop without a word
        [""],
    ],
)
def test_anything_else_on_the_command_line_is_refused_and_nothing_is_checked(
    arguments: list[str], monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(osc, "client_for", _no_store)
    monkeypatch.setenv("OBJECT_STORE_SECURE", "perhaps")  # refused before this is read
    assert osc.main(arguments) == osc.EXIT_NOT_RUN == 2
    said, complaint = capsys.readouterr()
    assert said == ""
    assert f"takes no arguments, and was given {arguments!r}" in complaint
    assert "The check was not run and no store was contacted." in complaint


@pytest.mark.parametrize(
    ("variable", "value", "names"),
    [
        ("OBJECT_STORE_SECURE", "perhaps", "OBJECT_STORE_SECURE='perhaps' is not a boolean"),
        ("OBJECT_STORE_ENDPOINT", "https://store.plant-a:9000", "path in endpoint"),
        ("OBJECT_STORE_ENDPOINT", "store.plant-a:https", "invalid port"),
    ],
)
def test_an_environment_that_names_no_reachable_store_is_not_run_and_says_why(
    variable: str,
    value: str,
    names: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Not run is its own exit code, so "the store failed" is never said of a check that
    did not reach a store."""
    monkeypatch.setattr(osc, "check", _no_store)
    monkeypatch.setenv(variable, value)
    assert osc.main() == osc.EXIT_NOT_RUN
    said, complaint = capsys.readouterr()
    assert said == ""
    assert names in complaint
    assert "The check was not run and no store was contacted." in complaint


def test_the_module_passes_its_command_line_when_run_as_it_is_typed() -> None:
    """The fault was at the module's entry, so this runs the entry itself. The endpoint is
    one nothing listens on, so a run that got through would reach no store."""
    env = {**os.environ, "OBJECT_STORE_ENDPOINT": "127.0.0.1:9"}

    def typed(*arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "-m", "forge_hub.storage.object_store_check", *arguments],
            capture_output=True,
            text=True,
            env=env,
            timeout=120,
            check=False,
        )

    described = typed("--help")
    assert described.returncode == 0, described.stderr
    assert described.stdout.startswith(f"usage: {osc.COMMAND}")
    assert "Checking the object store" not in described.stdout

    refused = typed("status")
    assert refused.returncode == osc.EXIT_NOT_RUN
    assert refused.stdout == ""
    assert "takes no arguments, and was given ['status']" in refused.stderr
