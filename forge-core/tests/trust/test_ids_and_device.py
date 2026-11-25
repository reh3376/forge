"""The SPIFFE id grammar, a key on a device (SoftHSM under the test stage), and the trust
root's lists held to their shapes (FB-293 step 1a)."""

from __future__ import annotations

import json
from datetime import timedelta

import pytest
from cryptography.hazmat.primitives import serialization
from tests.trust_world import CAPS, DEPLOYMENT, HUB, MODULE, NOW, world

from forge_core.fxts.shared import lists
from forge_core.trust import signer
from forge_core.trust.anchor import Anchor
from forge_core.trust.ids import Identity, IdError, SpiffeId
from forge_core.trust.issuer import Request, issue
from forge_core.trust.verify import verify


@pytest.mark.parametrize(
    ("text", "kind"),
    [
        ("spiffe://plant-a", Identity.DEPLOYMENT),
        ("spiffe://plant-a/hub/area-1", Identity.HUB),
        ("spiffe://plant-a/hub/area-1/module/forge-ot", Identity.MODULE),
    ],
)
def test_the_three_forms_round_trip(text: str, kind: Identity) -> None:
    parsed = SpiffeId.parse(text)
    assert parsed.kind is kind and str(parsed) == text


@pytest.mark.parametrize(
    "text",
    [
        "spiffe://Plant-a",
        "spiffe://plant-a:443/hub/x",
        "spiffe://user@plant-a",
        "spiffe://plant-a/hub/x?y=1",
        "spiffe://plant-a/hub/x#y",
        "spiffe://plant-a/hub/x%2F",
        "spiffe://plant-a/",
        "spiffe://plant-a//hub/x",
        "spiffe://plant-a/module/x",
        "spiffe://plant-a/hub",
        "spiffe://plant-a/hub/x/module",
        "spiffe://plant-a/hub/x/module/y/z",
        "spiffe://plant-a/hub/-x",
        "spiffe://plant-a/hub/" + "x" * 64,
        "https://plant-a/hub/x",
        "",
    ],
)
def test_anything_else_is_not_an_id(text: str) -> None:
    with pytest.raises(IdError):
        SpiffeId.parse(text)


def test_is_under() -> None:
    hub = SpiffeId("d", hub="h")
    assert SpiffeId("d", hub="h", module="m").is_under(hub)
    assert hub.is_under(hub) and hub.is_under(SpiffeId("d"))
    assert not SpiffeId("d", hub="g", module="m").is_under(hub)
    assert not SpiffeId("e", hub="h").is_under(SpiffeId("d"))


# ---------------------------------------------------------------------------
# A key on a device
# ---------------------------------------------------------------------------


def test_a_chain_issued_on_the_device_verifies(softhsm: tuple[str, str, str]) -> None:
    """The certificate root and the hub intermediate are generated on the token and sign
    there; the leaf's key is the module's own. The private keys never leave the device."""
    module, label, pin = softhsm
    w = world()
    with signer.session(module, token_label=label, pin=pin) as opened:
        root_key = signer.generate_key(opened, curve="secp384r1", label="root")
        inter_key = signer.generate_key(opened, curve="secp256r1", label="hub-area-1")
        root = issue(
            Request(
                "certificate-root",
                SpiffeId(DEPLOYMENT),
                root_key.public_key(),
                NOW - timedelta(days=1),
                timedelta(days=3000),
            ),
            signer=root_key,
            issuer=None,
            profile=w.profile,
            caps=CAPS,
        )
        inter = issue(
            Request(
                "hub-intermediate",
                SpiffeId(DEPLOYMENT, hub=HUB),
                inter_key.public_key(),
                NOW - timedelta(hours=2),
                timedelta(days=30),
            ),
            signer=root_key,
            issuer=root,
            profile=w.profile,
            caps=CAPS,
        )
        leaf = issue(
            Request(
                "module-leaf",
                SpiffeId(DEPLOYMENT, hub=HUB, module=MODULE),
                w.leaf_key.public_key(),
                NOW - timedelta(hours=1),
                timedelta(hours=2),
            ),
            signer=inter_key,
            issuer=inter,
            profile=w.profile,
            caps=CAPS,
        )
        found = signer.find_key(opened, label="hub-area-1")
        assert found.public_key() == inter_key.public_key()
        with pytest.raises(signer.DeviceKeyError, match="stays on its device"):
            found.private_bytes(
                serialization.Encoding.DER,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
    pem = lambda c: c.public_bytes(serialization.Encoding.PEM).decode()  # noqa: E731
    anchor = {
        **w.anchor,
        "certificate_roots": [
            {
                "id": "root-b",
                "certificate": pem(root),
                "attestation": w.anchor["certificate_roots"][0]["attestation"],
            }
        ],
        "hub_intermediates": [{"hub": HUB, "certificate": pem(inter)}],
    }
    got = verify(leaf, [inter], anchor=Anchor.model_validate(anchor), profile=w.profile, now=NOW)
    assert str(got.identity) == f"spiffe://{DEPLOYMENT}/hub/{HUB}/module/{MODULE}"


def test_a_key_that_could_leave_the_device_is_refused(softhsm: tuple[str, str, str]) -> None:
    import pkcs11
    from pkcs11 import Attribute, KeyType, MechanismFlag
    from pkcs11.util.ec import encode_named_curve_parameters

    module, label, pin = softhsm
    with signer.session(module, token_label=label, pin=pin) as opened:
        parameters = opened.create_domain_parameters(
            KeyType.EC,
            {Attribute.EC_PARAMS: encode_named_curve_parameters("secp256r1")},
            local=True,
        )
        parameters.generate_keypair(
            store=True,
            label="leaky",
            capabilities=MechanismFlag.SIGN | MechanismFlag.VERIFY,
            private_template={Attribute.EXTRACTABLE: True, Attribute.SENSITIVE: False},
        )
        with pytest.raises(signer.DeviceKeyError, match="could leave the device"):
            signer.find_key(opened, label="leaky")
        with pytest.raises(signer.DeviceKeyError, match="not exactly one"):
            signer.find_key(opened, label="no-such-key")
    assert pkcs11  # the module is the one CI installs


# ---------------------------------------------------------------------------
# The trust root's lists, held to their shapes by name
# ---------------------------------------------------------------------------


def _write(tmp_path, name: str, entries: list[dict], version: str = "0.2.0") -> None:
    document = {
        "spec_version": version,
        "list": name,
        "title": "t",
        "description": "d",
        "entries": entries,
        "integrity": {},
    }
    (tmp_path / f"{name}.list.json").write_text(json.dumps(document), encoding="utf-8")


def _shape(problems: list[str]) -> list[str]:
    return [p for p in problems if "carries no hash" not in p]


def test_the_profile_list_is_held_to_its_shape(tmp_path) -> None:
    entries = json.loads(lists.list_path(lists.CERTIFICATE_ROLES).read_text(encoding="utf-8"))[
        "entries"
    ]
    _write(tmp_path, lists.CERTIFICATE_ROLES, entries)
    assert _shape(lists.load(lists.CERTIFICATE_ROLES, tmp_path).problems) == []
    broken = [dict(entries[0], name_constraints=True), *entries[1:]]
    _write(tmp_path, lists.CERTIFICATE_ROLES, broken)
    assert any(
        "name_constraints" in p for p in lists.load(lists.CERTIFICATE_ROLES, tmp_path).problems
    )
    looped = [
        dict(e, issued_by="hub-leaf") if e["id"] == "hub-intermediate" else e for e in entries
    ]
    _write(tmp_path, lists.CERTIFICATE_ROLES, looped)
    assert any("not a CA role" in p for p in lists.load(lists.CERTIFICATE_ROLES, tmp_path).problems)
    _write(tmp_path, lists.CERTIFICATE_ROLES, entries, version="0.1.0")
    assert any(
        "has no shape for it" in p for p in lists.load(lists.CERTIFICATE_ROLES, tmp_path).problems
    )


def test_an_allow_list_root_must_parse_as_a_ca(tmp_path) -> None:
    w = world()
    pem = lambda c: c.public_bytes(serialization.Encoding.PEM).decode()  # noqa: E731
    entry = {
        "id": "test-key",
        "description": "a model",
        "aaguid": "00000000-0000-4000-8000-000000000000",
        "attestation_format": "packed",
        "roots": [pem(w.root)],
        "intermediates": [],
        "required_properties": {
            "device_bound": True,
            "user_verification": "required",
            "cred_protect": 3,
        },
        "biometric": False,
        "fido_certificate": None,
        "fips_certificate": None,
        "source": "test",
    }
    _write(tmp_path, lists.AUTHENTICATOR_MODELS, [entry])
    assert _shape(lists.load(lists.AUTHENTICATOR_MODELS, tmp_path).problems) == []
    _write(tmp_path, lists.AUTHENTICATOR_MODELS, [dict(entry, roots=[pem(w.leaf)])])
    assert any(
        "is not a CA" in p for p in lists.load(lists.AUTHENTICATOR_MODELS, tmp_path).problems
    )
    _write(tmp_path, lists.AUTHENTICATOR_MODELS, [dict(entry, biometric=True)])
    assert any("biometric" in p for p in lists.load(lists.AUTHENTICATOR_MODELS, tmp_path).problems)
