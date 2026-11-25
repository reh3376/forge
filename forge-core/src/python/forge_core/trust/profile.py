"""The certificate profile: the roles of certificate, written once (D-23 T-4).

The profile is the governed list ``certificate-roles`` (approved by the owner, its hash pinned
by the anchor's policy), so the issuer, the Python verifier and the Go verifier read the
same data. Each role says who issues it, the form of its SPIFFE id, whether it is a CA and
its path length, exactly which key usages and extended key usages it carries, its curve, and
the hash its key signs with. No role carries name constraints. Lifetimes are not here: they
are capped by the anchor's policy, never chosen by a signer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from forge_core.trust.ids import Identity

if TYPE_CHECKING:
    from collections.abc import Mapping
    from pathlib import Path

#: The roles' order of identity: a role may only sit at or below its issuer's.
_DEPTH = {Identity.DEPLOYMENT: 0, Identity.HUB: 1, Identity.MODULE: 2}


class ProfileError(ValueError):
    """The profile cannot be used; it names every problem."""


@dataclass(frozen=True)
class Role:
    id: str
    description: str
    issued_by: str
    identity: Identity
    ca: bool
    path_length: int | None
    key_usage: frozenset[str]
    extended_key_usage: frozenset[str]
    curve: str
    signs_with: str | None

    @property
    def self_signed(self) -> bool:
        return self.issued_by == self.id


def role_problems(entries: list[dict[str, Any]]) -> list[str]:
    """What is wrong with a set of roles beyond its shape (the schema checks the shape)."""
    problems: list[str] = []
    by_id = {str(e.get("id")): e for e in entries if isinstance(e, dict)}
    roots = [i for i, e in by_id.items() if e.get("issued_by") == i]
    if len(roots) != 1:
        problems.append(f"exactly one role signs itself (the certificate root); found {roots}")
    seen: set[tuple[str, str]] = set()
    for role_id, entry in by_id.items():
        issuer = by_id.get(str(entry.get("issued_by")))
        ca = entry.get("ca") is True
        if ca and entry.get("path_length") is None:
            problems.append(f"{role_id}: a CA role states its path length")
        if not ca and entry.get("path_length") is not None:
            problems.append(f"{role_id}: a leaf role has no path length")
        if ca != ("key_cert_sign" in (entry.get("key_usage") or [])):
            problems.append(f"{role_id}: a role signs certificates if and only if it is a CA")
        if ca != (entry.get("signs_with") is not None):
            problems.append(f"{role_id}: a CA role names the hash it signs with; a leaf none")
        if issuer is None:
            problems.append(f"{role_id}: issued by the unknown role {entry.get('issued_by')!r}")
            continue
        if issuer is entry:
            continue
        if issuer.get("ca") is not True:
            problems.append(f"{role_id}: its issuer {issuer['id']} is not a CA role")
        elif ca and not (entry["path_length"] < issuer["path_length"]):
            problems.append(f"{role_id}: its path length is not below its issuer's")
        try:
            if _DEPTH[Identity(entry["identity"])] < _DEPTH[Identity(issuer["identity"])]:
                problems.append(f"{role_id}: its id would sit above its issuer's")
        except (KeyError, ValueError):
            problems.append(f"{role_id}: an unknown identity form")
        key = (str(entry.get("issued_by")), str(entry.get("identity")))
        if key in seen:
            problems.append(f"{role_id}: two roles share an issuer and an identity form")
        seen.add(key)
    for role_id in by_id:  # every chain of issuers ends at the root, with no loop
        chain, current = [role_id], by_id[role_id]
        while current.get("issued_by") != current.get("id"):
            nxt = str(current.get("issued_by"))
            if nxt in chain or nxt not in by_id:
                problems.append(f"{role_id}: its chain of issuers does not end at the root")
                break
            chain.append(nxt)
            current = by_id[nxt]
    return problems


@dataclass(frozen=True)
class Profile:
    """The roles, and the hash of the list they were read from (the anchor pins it)."""

    roles: Mapping[str, Role]
    hash: str

    @classmethod
    def from_entries(cls, entries: list[dict[str, Any]], *, hash_: str) -> Profile:
        problems = role_problems(entries)
        if problems:
            raise ProfileError("; ".join(problems))
        roles = {
            str(e["id"]): Role(
                id=str(e["id"]),
                description=str(e["description"]),
                issued_by=str(e["issued_by"]),
                identity=Identity(e["identity"]),
                ca=bool(e["ca"]),
                path_length=e["path_length"],
                key_usage=frozenset(e["key_usage"]),
                extended_key_usage=frozenset(e["extended_key_usage"]),
                curve=str(e["curve"]),
                signs_with=e["signs_with"],
            )
            for e in entries
        }
        return cls(roles=roles, hash=hash_)

    @property
    def root(self) -> Role:
        return next(r for r in self.roles.values() if r.self_signed)

    def issued_by(self, issuer: Role, identity: Identity) -> Role | None:
        """The one role an issuer of this role issues for an id of this form, if any."""
        return next(
            (
                r
                for r in self.roles.values()
                if not r.self_signed and r.issued_by == issuer.id and r.identity is identity
            ),
            None,
        )


def load(lists_dir: Path | None = None) -> Profile:
    """The approved profile, or :class:`ProfileError` naming why it cannot be used."""
    from forge_core.fxts.shared import lists

    governed = lists.load(lists.CERTIFICATE_ROLES, lists_dir)
    if not governed.usable:
        raise ProfileError("; ".join(governed.problems))
    return Profile.from_entries(
        governed.entries, hash_=str(governed.document["integrity"]["spec_hash"])
    )
