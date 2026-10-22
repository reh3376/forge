"""Schema references: the one grammar behind every ``forge://schemas/...`` id (FB-008).

    forge://schemas/<spoke>[/<Entity>][/v<version>]

Three roles share the grammar; which one a reference plays follows from the
parts it carries:

* **contract ref** ``forge://schemas/<spoke>/v<version>`` names what an
  adapter emits as a whole: the FACTS ``data_contract.schema_ref``, the
  manifest's ``DataContract.schema_ref`` and ``RecordLineage.schema_ref`` on
  every record. ``<version>`` is the adapter's own version.
* **schema id** ``forge://schemas/<spoke>/<Entity>`` names one schema in the
  Schema Registry the hub serves at ``/v1/schemas``; the registry assigns its
  versions as integers.
* **version ref** ``forge://schemas/<spoke>/<Entity>/v<version>`` names one
  version of that schema: an integer names a registry version, a semantic
  version names a storage routing entry (``forge.storage.registry.SchemaEntry``).

A bare ``forge://schemas/<spoke>`` parses (it names the spoke's schemas) but
plays no role on its own. ``<spoke>`` is the adapter or module id; ``<Entity>``
starts with a letter and may not look like a version segment; ``<version>`` is
an integer or a semantic version with an optional pre-release tag.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

SCHEME = "forge://schemas/"
GRAMMAR = "forge://schemas/<spoke>[/<Entity>][/v<version>]"

_SPOKE = r"[A-Za-z0-9][A-Za-z0-9_.-]*"
_ENTITY = r"(?!v\d)[A-Za-z][A-Za-z0-9_-]*"
_VERSION = r"\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?"
_PATTERN = re.compile(
    rf"^forge://schemas/(?P<spoke>{_SPOKE})"
    rf"(?:/(?P<entity>{_ENTITY}))?"
    rf"(?:/v(?P<version>{_VERSION}))?$"
)

# The same grammar as a JSON Schema ``pattern`` (ECMA-262 and Python ``re`` agree
# on everything used here), for the FACTS schema's ``data_contract.schema_ref``.
JSON_SCHEMA_PATTERN_VERSIONED = (
    r"^forge://schemas/[A-Za-z0-9][A-Za-z0-9_.-]*(/(?!v[0-9])[A-Za-z][A-Za-z0-9_-]*)?"
    r"/v[0-9]+(\.[0-9]+){0,2}([-+][0-9A-Za-z.-]+)?$"
)


class SchemaRefError(ValueError):
    """The text is not a schema reference, or not one of the required role."""


@dataclass(frozen=True, slots=True)
class SchemaRef:
    """A parsed ``forge://schemas/...`` reference."""

    spoke: str
    entity: str | None = None
    version: str | None = None

    @classmethod
    def parse(cls, text: str) -> SchemaRef:
        match = _PATTERN.match(text or "")
        if match is None:
            msg = f"not a schema reference: {text!r}; expected {GRAMMAR}"
            raise SchemaRefError(msg)
        return cls(match["spoke"], match["entity"], match["version"])

    def __str__(self) -> str:
        text = f"{SCHEME}{self.spoke}"
        if self.entity is not None:
            text += f"/{self.entity}"
        if self.version is not None:
            text += f"/v{self.version}"
        return text

    @property
    def role(self) -> str:
        """``contract``, ``schema``, ``version`` or ``spoke`` (see the module doc)."""
        if self.entity is None:
            return "spoke" if self.version is None else "contract"
        return "schema" if self.version is None else "version"

    @property
    def schema_id(self) -> SchemaRef | None:
        """The schema id this reference belongs to (``None`` without an entity)."""
        if self.entity is None:
            return None
        return SchemaRef(self.spoke, self.entity)

    def versioned(self, version: str | int) -> SchemaRef:
        """The same reference at ``version``."""
        return SchemaRef(self.spoke, self.entity, str(version))


def parse_schema_ref(text: str) -> SchemaRef:
    """Parse ``text`` or raise :class:`SchemaRefError`."""
    return SchemaRef.parse(text)


def is_schema_ref(text: str) -> bool:
    return _PATTERN.match(text or "") is not None


def require_versioned_ref(text: str, *, field: str = "schema_ref") -> str:
    """Accept a contract ref or a version ref (anything that carries a version)."""
    ref = SchemaRef.parse(text)
    if ref.version is None:
        msg = (
            f"{field} must name a version: forge://schemas/<spoke>[/<Entity>]/v<version>;"
            f" got {text!r}"
        )
        raise SchemaRefError(msg)
    return text


def require_schema_id(text: str, *, field: str = "schema_id") -> str:
    """Accept a schema id: an entity under a spoke, without a version."""
    ref = SchemaRef.parse(text)
    if ref.role != "schema":
        msg = (
            f"{field} must be a schema id: forge://schemas/<spoke>/<Entity> (the registry"
            f" assigns the versions); got {text!r}"
        )
        raise SchemaRefError(msg)
    return text


def require_version_ref(text: str, *, field: str = "schema_id") -> str:
    """Accept a version ref: an entity under a spoke, at a version."""
    ref = SchemaRef.parse(text)
    if ref.role != "version":
        msg = (
            f"{field} must be a version ref: forge://schemas/<spoke>/<Entity>/v<version>;"
            f" got {text!r}"
        )
        raise SchemaRefError(msg)
    return text
