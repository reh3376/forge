"""What Forge needs of its object store, checked on the store itself (FB-314).

Forge depends on the S3 protocol, not on a product. Its object store is whichever store an
installation runs: RustFS as Forge ships it, or one an enterprise already operates. What Forge
relies on is written here as capabilities, and each is checked by doing it against the store:
keeping an object and its metadata, listing past one page, a multipart upload, versions, a
record that cannot be deleted or have its retention shortened, encryption at rest, and
refusing a request that carries no credentials.

A capability is ``met``, ``not-met`` (the store refused, or cannot) or ``wrong``: the store
accepted the request and did not do it. ``wrong`` is the dangerous answer, as when a store
takes a lock and then deletes the record, and it is why this is a check and not a reading of
a store's documentation.

Run it against the configured store (``OBJECT_STORE_*`` in the environment)::

    python -m forge_hub.storage.object_store_check

The command takes no arguments. ``--help`` says what it does and contacts no store; anything
else on the command line is refused before the environment is read. Exit code 2 says the
check was not run, for that or because the environment names no store a client can be built
for; 1 says it ran and the store is not Forge's object store as it is.

It writes only to buckets named ``forge-check-<run>`` and removes them when it is done, after
waiting out the few seconds of retention it sets. Anything it could not remove is named. The
retention is seconds long and is set from this machine's clock, so a store whose clock is
far from it shows here too.
"""

from __future__ import annotations

import contextlib
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from minio import Minio
from minio.commonconfig import COMPLIANCE, ENABLED, CopySource, Filter, Tags
from minio.deleteobjects import DeleteObject
from minio.lifecycleconfig import Expiration, LifecycleConfig, Rule
from minio.retention import Retention
from minio.sse import SseS3
from minio.versioningconfig import VersioningConfig

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

#: The permission running this check needs: it writes to and deletes from the object store.
SCOPE = "storage:object-store:check"
#: The command as it is typed.
COMMAND = "python -m forge_hub.storage.object_store_check"
#: The command's exit code when the check was not run: the command line was refused, or the
#: environment names no store a client can be built for. 0 is every capability met and
#: nothing left behind; 1 is the check run and the store not Forge's object store as it is.
EXIT_NOT_RUN = 2
#: How long the check locks its own record. Long enough to try to delete it, short enough to
#: wait out, so the check leaves nothing behind.
LOCK_SECONDS = 4
#: More keys than one page of an S3 listing holds.
MANY = 1050


class Verdict(StrEnum):
    MET = "met"
    NOT_MET = "not-met"
    WRONG = "wrong"


@dataclass(frozen=True)
class Capability:
    id: str
    #: What Forge relies on it for.
    needs: str


@dataclass(frozen=True)
class Result:
    capability: str
    verdict: Verdict
    detail: str = ""


@dataclass(frozen=True)
class Report:
    results: tuple[Result, ...]
    #: What the check could not remove from the store, named so a person can.
    left_behind: tuple[str, ...] = ()

    @property
    def met(self) -> bool:
        return not self.left_behind and all(r.verdict is Verdict.MET for r in self.results)


class NotDoneError(Exception):
    """The store accepted a request and did not do what it asked."""


class RefusedError(Exception):
    """The store refused a request that carried no credentials."""


def client_for(
    endpoint: str,
    access_key: str,
    secret_key: str,
    *,
    secure: bool = False,
    region: str | None = None,
) -> Minio:
    """The S3 client for a store. One place makes it, for the check and the health probe."""
    return Minio(
        endpoint, access_key=access_key, secret_key=secret_key, secure=secure, region=region
    )


def fetch(url: str) -> bytes:
    """An HTTP GET with no credentials; :class:`RefusedError` when the store refuses it."""
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise RefusedError(f"HTTP {exc.code}") from exc
        raise


@dataclass
class _Run:
    client: Any
    base_url: str
    run_id: str
    fetch: Callable[[str], bytes]
    sleep: Callable[[float], None]
    payload: bytes = field(default_factory=lambda: os.urandom(70_000))
    locked_at: float | None = None

    @property
    def bucket(self) -> str:
        return f"forge-check-{self.run_id}"

    @property
    def versions(self) -> str:
        return f"{self.bucket}-versions"

    @property
    def lock(self) -> str:
        return f"{self.bucket}-lock"

    def put(self, bucket: str, name: str, data: bytes, **options: Any) -> Any:
        return self.client.put_object(bucket, name, io.BytesIO(data), len(data), **options)

    def get(self, bucket: str, name: str, **options: Any) -> bytes:
        response = self.client.get_object(bucket, name, **options)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def url(self, bucket: str, name: str) -> str:
        return f"{self.base_url}/{bucket}/{name}"

    def must_refuse(
        self, what: str, act: Callable[[], Any], still: Callable[[], bytes], data: bytes
    ) -> str:
        """``act`` must be refused, and the record must still be there afterwards."""
        try:
            act()
        except Exception as refusal:
            if still() != data:
                raise NotDoneError(
                    f"{what} was refused, and the record is not what was stored"
                ) from refusal
            return _said(refusal)
        try:
            intact = still() == data
        except Exception:
            intact = False
        if intact:
            raise NotDoneError(f"{what} was accepted (the record is still there)")
        raise NotDoneError(f"{what} was accepted and the record is gone")


def _said(exc: Exception) -> str:
    code = getattr(exc, "code", None)
    return f"refused with {code}" if code else f"refused with {type(exc).__name__}"


def _objects(run: _Run) -> None:
    run.client.make_bucket(run.bucket)
    if not run.client.bucket_exists(run.bucket) or run.bucket not in [
        b.name for b in run.client.list_buckets()
    ]:
        raise NotDoneError("the bucket it made is not listed")
    run.put(
        run.bucket,
        "a/one.bin",
        run.payload,
        content_type="application/x-forge",
        metadata={"x-amz-meta-batch": "B-17"},
    )
    if run.get(run.bucket, "a/one.bin") != run.payload:
        raise NotDoneError("the bytes read are not the bytes stored")
    stat = run.client.stat_object(run.bucket, "a/one.bin")
    if stat.size != len(run.payload) or stat.content_type != "application/x-forge":
        raise NotDoneError(f"it says {stat.size} bytes of {stat.content_type}")
    if stat.metadata.get("x-amz-meta-batch") != "B-17":
        raise NotDoneError("the object's own metadata is lost")


def _ranges(run: _Run) -> None:
    if run.get(run.bucket, "a/one.bin", offset=1000, length=500) != run.payload[1000:1500]:
        raise NotDoneError("a range of bytes is not that range")


def _listing(run: _Run) -> None:
    for name in _many(run):
        run.put(run.bucket, name, b"x")
    keys = [
        o.object_name for o in run.client.list_objects(run.bucket, prefix="many/", recursive=True)
    ]
    if len(keys) != MANY or keys != sorted(keys):
        raise NotDoneError(f"{len(keys)} of {MANY} keys listed, in order: {keys == sorted(keys)}")
    folders = [o.object_name for o in run.client.list_objects(run.bucket, prefix="many/")]
    if folders != [f"many/{i}/" for i in range(7)]:
        raise NotDoneError(f"the common prefixes are {folders[:3]}")


def _many(run: _Run) -> list[str]:
    return [f"many/{i % 7}/k{i:05d}" for i in range(MANY)]


def _bulk_delete(run: _Run) -> None:
    # By name, and each key is then asked for: this must not lean on listing, which is its
    # own capability.
    names = _many(run)
    errors = list(run.client.remove_objects(run.bucket, (DeleteObject(name) for name in names)))
    if errors:
        raise NotDoneError(f"{len(errors)} keys were not deleted")
    kept = 0
    for name in names:
        try:
            run.client.stat_object(run.bucket, name)
        except Exception:
            continue
        kept += 1
    if kept:
        raise NotDoneError(f"{kept} of {MANY} keys are still there after their delete")


def _multipart(run: _Run) -> None:
    part = 5 * 1024 * 1024
    data = os.urandom(2 * part + 1024)
    run.client.put_object(run.bucket, "big.bin", io.BytesIO(data), len(data), part_size=part)
    if hashlib.sha256(run.get(run.bucket, "big.bin")).digest() != hashlib.sha256(data).digest():
        raise NotDoneError("the bytes read are not the bytes sent in parts")


def _copy(run: _Run) -> None:
    run.client.copy_object(run.bucket, "a/copy.bin", CopySource(run.bucket, "a/one.bin"))
    if run.get(run.bucket, "a/copy.bin") != run.payload:
        raise NotDoneError("the copy is not the object")


def _presigned(run: _Run) -> None:
    url = run.client.presigned_get_object(run.bucket, "a/one.bin", expires=timedelta(minutes=5))
    if run.fetch(url) != run.payload:
        raise NotDoneError("a presigned link does not serve the object")


def _tags(run: _Run) -> None:
    tags = Tags.new_object_tags()
    tags["site"] = "plant-a"
    run.client.set_object_tags(run.bucket, "a/one.bin", tags)
    if (run.client.get_object_tags(run.bucket, "a/one.bin") or {}).get("site") != "plant-a":
        raise NotDoneError("a tag set on an object is not read back")


def _versioning(run: _Run) -> None:
    run.client.make_bucket(run.versions)
    run.client.set_bucket_versioning(run.versions, VersioningConfig(ENABLED))
    first = run.put(run.versions, "doc", b"first").version_id
    second = run.put(run.versions, "doc", b"second").version_id
    if not first or not second or first == second:
        raise NotDoneError(f"two writes gave the versions {first!r} and {second!r}")
    listed = {o.version_id for o in run.client.list_objects(run.versions, include_version=True)}
    if listed != {first, second}:
        raise NotDoneError(f"{len(listed)} versions listed of 2")
    if (
        run.get(run.versions, "doc", version_id=first) != b"first"
        or run.get(run.versions, "doc") != b"second"
    ):
        raise NotDoneError("a version read is not that version")
    run.client.remove_object(run.versions, "doc")
    if run.get(run.versions, "doc", version_id=second) != b"second":
        raise NotDoneError("deleting the object removed a version's data")


def _lock(run: _Run) -> str:
    run.client.make_bucket(run.lock, object_lock=True)
    run.locked_at = time.monotonic()
    until = datetime.now(UTC) + timedelta(seconds=LOCK_SECONDS)
    how = ""
    try:
        version = run.put(
            run.lock, "sealed", b"sealed", retention=Retention(COMPLIANCE, until)
        ).version_id
    except Exception as exc:
        if "MD5" not in str(exc):
            raise
        # S3 wants a Content-MD5 on a locked put, which this client does not send; a store
        # that holds to that is locked in a second call, which does carry one.
        version = run.put(run.lock, "sealed", b"sealed").version_id
        run.client.set_object_retention(
            run.lock, "sealed", Retention(COMPLIANCE, until), version_id=version
        )
        how = "; the retention was set after the put"
    if not version:
        raise NotDoneError("a locked write has no version")

    def still() -> bytes:
        return run.get(run.lock, "sealed", version_id=version)

    said = run.must_refuse(
        "deleting a locked record",
        lambda: run.client.remove_object(run.lock, "sealed", version_id=version),
        still,
        b"sealed",
    )
    sooner = Retention(COMPLIANCE, datetime.now(UTC) + timedelta(seconds=1))
    run.must_refuse(
        "shortening a record's retention",
        lambda: run.client.set_object_retention(run.lock, "sealed", sooner, version_id=version),
        still,
        b"sealed",
    )
    run.must_refuse(
        "removing the bucket that holds a locked record",
        lambda: run.client.remove_bucket(run.lock),
        still,
        b"sealed",
    )
    return f"{said}{how}"


def _legal_hold(run: _Run) -> str:
    version = run.put(run.lock, "held", b"held").version_id
    run.client.enable_object_legal_hold(run.lock, "held", version_id=version)
    try:
        return run.must_refuse(
            "deleting a record under legal hold",
            lambda: run.client.remove_object(run.lock, "held", version_id=version),
            lambda: run.get(run.lock, "held", version_id=version),
            b"held",
        )
    finally:
        # Lifting the hold must not hide what was found: a store that deleted the held record
        # has nothing left to lift it from. A hold that will not lift is named when the check
        # cleans up.
        with contextlib.suppress(Exception):
            run.client.disable_object_legal_hold(run.lock, "held", version_id=version)


def _encryption(run: _Run) -> None:
    run.put(run.bucket, "a/sealed.bin", b"secret", sse=SseS3())
    if run.get(run.bucket, "a/sealed.bin") != b"secret":
        raise NotDoneError("an encrypted object does not read back")
    said = run.client.stat_object(run.bucket, "a/sealed.bin").metadata.get(
        "x-amz-server-side-encryption"
    )
    if said != "AES256":
        raise NotDoneError(f"asked to encrypt, the store does not say it did ({said})")


def _policy(run: _Run) -> None:
    statement = {
        "Effect": "Allow",
        "Principal": {"AWS": ["*"]},
        "Action": ["s3:GetObject"],
        "Resource": [f"arn:aws:s3:::{run.bucket}/a/*"],
    }
    run.client.set_bucket_policy(
        run.bucket, json.dumps({"Version": "2012-10-17", "Statement": [statement]})
    )
    try:
        if run.fetch(run.url(run.bucket, "a/one.bin")) != run.payload:
            raise NotDoneError("a prefix opened for reading does not serve its object")
        try:
            run.fetch(run.url(run.bucket, "big.bin"))
        except RefusedError:
            return
        raise NotDoneError("opening one prefix opened the rest of the bucket")
    finally:
        run.client.delete_bucket_policy(run.bucket)


def _lifecycle(run: _Run) -> None:
    rule = Rule(
        ENABLED,
        rule_filter=Filter(prefix="tmp/"),
        rule_id="expire-tmp",
        expiration=Expiration(days=30),
    )
    run.client.set_bucket_lifecycle(run.bucket, LifecycleConfig([rule]))
    rules = run.client.get_bucket_lifecycle(run.bucket).rules
    if len(rules) != 1 or rules[0].expiration.days != 30 or rules[0].rule_filter.prefix != "tmp/":
        raise NotDoneError("a lifecycle rule is not read back as it was set")


def _anonymous(run: _Run) -> str:
    try:
        run.fetch(run.url(run.bucket, "a/one.bin"))
    except RefusedError as refusal:
        return f"refused with {refusal}"
    raise NotDoneError("a request with no credentials was served")


#: What Forge needs, in the order it is checked. Every one is required: a store that lacks
#: one is not Forge's object store until it has it.
CAPABILITIES: tuple[tuple[Capability, Callable[[_Run], str | None]], ...] = (
    (
        Capability("objects", "documents and reports, with their type and their own metadata"),
        _objects,
    ),
    (Capability("ranges", "reading part of a large object"), _ranges),
    (Capability("listing", "finding objects by prefix, past one page of results"), _listing),
    (Capability("bulk-delete", "removing many objects in one request"), _bulk_delete),
    (Capability("multipart", "objects too large for one request"), _multipart),
    (Capability("copy", "copying an object inside the store"), _copy),
    (
        Capability("presigned", "a link that lets a screen fetch one object for a short time"),
        _presigned,
    ),
    (Capability("tags", "marking an object with its site or batch"), _tags),
    (Capability("versioning", "keeping what an object was before it was replaced"), _versioning),
    (Capability("lock", "a record nobody can delete or shorten until its retention ends"), _lock),
    (Capability("legal-hold", "a record held with no end date"), _legal_hold),
    (Capability("encryption", "objects encrypted at rest by the store"), _encryption),
    (Capability("policy", "opening one prefix and nothing else"), _policy),
    (Capability("lifecycle", "expiring what need not be kept"), _lifecycle),
    (Capability("anonymous-refused", "no credentials, no answer"), _anonymous),
)


def _clean_up(run: _Run) -> list[str]:
    """Remove everything the check wrote, waiting out its own lock; name what would not go."""
    if run.locked_at is not None:
        left = LOCK_SECONDS + 1 - (time.monotonic() - run.locked_at)
        if left > 0:
            run.sleep(left)
    left_behind = []
    for bucket in (run.bucket, run.versions, run.lock):
        try:
            if not run.client.bucket_exists(bucket):
                continue
            for item in list(run.client.list_objects(bucket, recursive=True, include_version=True)):
                run.client.remove_object(bucket, item.object_name, version_id=item.version_id)
            run.client.remove_bucket(bucket)
        except Exception as exc:
            left_behind.append(f"{bucket}: {_summary(exc)}")
    return left_behind


def _summary(exc: Exception) -> str:
    code = getattr(exc, "code", None)
    text = getattr(exc, "message", None) or str(exc)
    return f"{code or type(exc).__name__}: {' '.join(text.split())[:110]}"


def check(
    client: Any,
    base_url: str,
    *,
    run_id: str | None = None,
    fetch: Callable[[str], bytes] = fetch,
    sleep: Callable[[float], None] = time.sleep,
) -> Report:
    """Do each thing Forge needs on the store behind ``client``, and say how it went.

    ``base_url`` is where the store answers plain HTTP requests, for the checks that go
    without credentials.
    """
    run = _Run(client, base_url.rstrip("/"), run_id or uuid.uuid4().hex[:12], fetch, sleep)
    results = []
    try:
        for capability, step in CAPABILITIES:
            try:
                detail = step(run) or ""
            except NotDoneError as exc:
                results.append(Result(capability.id, Verdict.WRONG, str(exc)))
            except Exception as exc:
                results.append(Result(capability.id, Verdict.NOT_MET, _summary(exc)))
            else:
                results.append(Result(capability.id, Verdict.MET, detail))
    finally:
        left_behind = _clean_up(run)
    return Report(tuple(results), tuple(left_behind))


def render(report: Report) -> str:
    needs = {capability.id: capability.needs for capability, _ in CAPABILITIES}
    lines = [
        f"{r.verdict.value:8} {r.capability:18} {needs[r.capability]}"
        + (f"  [{r.detail}]" if r.detail else "")
        for r in report.results
    ]
    lines += [f"LEFT BEHIND  {item}" for item in report.left_behind]
    count = sum(r.verdict is Verdict.MET for r in report.results)
    verdict = (
        "this store can be Forge's object store"
        if report.met
        else "NOT Forge's object store as it is"
    )
    lines.append(f"{count} of {len(report.results)} capabilities met: {verdict}")
    return "\n".join(lines)


def usage() -> str:
    """What ``--help`` prints: what the check does to a store, and how the store is named."""
    from forge_hub.storage.config import ObjectStoreConfig

    return "\n".join(
        (
            f"usage: {COMMAND}",
            "",
            "Does each thing Forge needs of an object store on the configured store, and says",
            "which it met (FB-314). It takes no arguments.",
            "",
            "The store is named in the environment:",
            f"  OBJECT_STORE_ENDPOINT    its host:port; when unset, {ObjectStoreConfig().endpoint}",
            "  OBJECT_STORE_ACCESS_KEY  the access key",
            "  OBJECT_STORE_SECRET_KEY  the secret key",
            "  OBJECT_STORE_SECURE      a boolean: https when true",
            "  OBJECT_STORE_REGION      the region the store signs for, when it needs one",
            "",
            "It writes to that store: buckets named forge-check-<run>, which it removes when",
            "it is done, naming anything it could not remove.",
            f"Running it needs the permission {SCOPE}.",
            "",
            "Exit codes: 0, every capability met and nothing left behind; 1, a capability not",
            f"met or something left behind; {EXIT_NOT_RUN}, the check was not run.",
        )
    )


def _not_run(why: str) -> int:
    """Say on stderr why the check was not run; nothing was asked of any store."""
    print(f"{why} The check was not run and no store was contacted.", file=sys.stderr)
    return EXIT_NOT_RUN


def main(argv: Sequence[str] = ()) -> int:
    """Run the check on the configured store; ``argv`` is the command line after the name.

    The command takes no arguments, and it says so before it reads the environment or builds
    a client: asking what the check does must never do it. ``--help`` alone prints
    :func:`usage`. Anything else on the command line, an environment that cannot be read and
    a store address no client can be built for all end the same way: the reason on stderr,
    no store contacted, and :data:`EXIT_NOT_RUN`.
    """
    arguments = list(argv)
    if arguments in (["--help"], ["-h"]):
        print(usage())
        return 0
    if arguments:
        return _not_run(
            f"{COMMAND} takes no arguments, and was given {arguments!r}. "
            f"`{COMMAND} --help` says what it does."
        )

    from forge_hub.storage.config import StorageConfig

    try:
        store = StorageConfig.from_env().object_store
        client = client_for(
            store.endpoint,
            store.access_key,
            store.secret_key,
            secure=store.secure,
            region=store.region,
        )
    except ValueError as exc:
        return _not_run(f"The environment does not name a store this check can reach: {exc}.")
    print(
        f"No permission check point is wired for {SCOPE} on the command line (FB-280): "
        "whoever holds the store's credentials can run this check."
    )
    scheme = "https" if store.secure else "http"
    print(f"Checking the object store at {scheme}://{store.endpoint} ...")
    report = check(client, f"{scheme}://{store.endpoint}")
    print(render(report))
    return 0 if report.met else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
