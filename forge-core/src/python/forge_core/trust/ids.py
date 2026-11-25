"""The SPIFFE id of a deployment, a hub or a module (D-21 SF-13, D-23 T-4).

Three forms, and nothing else is an id::

    spiffe://<deployment>
    spiffe://<deployment>/hub/<hub>
    spiffe://<deployment>/hub/<hub>/module/<module>

Each name is lower-case letters, digits and inner hyphens, 1 to 63 characters, so it also
fits a certificate's common name. An id is parsed strictly, never repaired: no port, user,
query, fragment, percent-encoding, upper case, empty segment or trailing slash.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

#: A name, matched whole (``fullmatch``): Python's ``$`` would also match before a final
#: newline, so ``forge-ot\n`` passed for ``forge-ot`` (found by the Go verifier's probe).
NAME_PATTERN = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
NAME = re.compile(NAME_PATTERN)
SCHEME = "spiffe://"


class Identity(StrEnum):
    """Which of the three forms an id has."""

    DEPLOYMENT = "deployment"
    HUB = "hub"
    MODULE = "module"


class IdError(ValueError):
    """Text that is not one of the three forms; it names what was given."""


@dataclass(frozen=True)
class SpiffeId:
    deployment: str
    hub: str | None = None
    module: str | None = None

    def __post_init__(self) -> None:
        for part, value in (("deployment", self.deployment), ("hub", self.hub)):
            if value is not None and not NAME.fullmatch(value):
                msg = f"{part} {value!r} is not a name (a-z, 0-9, inner hyphens, 1-63)"
                raise IdError(msg)
        if self.module is not None:
            if self.hub is None:
                msg = "a module's id names its hub"
                raise IdError(msg)
            if not NAME.fullmatch(self.module):
                msg = f"module {self.module!r} is not a name (a-z, 0-9, inner hyphens, 1-63)"
                raise IdError(msg)

    @property
    def kind(self) -> Identity:
        if self.module is not None:
            return Identity.MODULE
        return Identity.HUB if self.hub is not None else Identity.DEPLOYMENT

    @property
    def last(self) -> str:
        """The last name in the id: the module, else the hub, else the deployment."""
        return self.module or self.hub or self.deployment

    def is_under(self, other: SpiffeId) -> bool:
        """Whether this id is ``other`` or sits below it."""
        if self.deployment != other.deployment:
            return False
        if other.hub is None:
            return True
        if self.hub != other.hub:
            return False
        return other.module is None or self.module == other.module

    def __str__(self) -> str:
        text = SCHEME + self.deployment
        if self.hub is not None:
            text += f"/hub/{self.hub}"
        if self.module is not None:
            text += f"/module/{self.module}"
        return text

    @classmethod
    def parse(cls, text: str) -> SpiffeId:
        if not isinstance(text, str) or not text.startswith(SCHEME):
            msg = f"{text!r} is not a spiffe:// id"
            raise IdError(msg)
        rest = text[len(SCHEME) :]
        parts = rest.split("/")
        if any(c in rest for c in "?#%@:") or not all(parts):
            msg = f"{text!r} is not one of the three id forms"
            raise IdError(msg)
        deployment, path = parts[0], parts[1:]
        if path == []:
            return cls(deployment)
        if len(path) == 2 and path[0] == "hub":
            return cls(deployment, hub=path[1])
        if len(path) == 4 and path[0] == "hub" and path[2] == "module":
            return cls(deployment, hub=path[1], module=path[3])
        msg = f"{text!r} is not one of the three id forms"
        raise IdError(msg)
