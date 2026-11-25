"""FB-291: the hub's authentication flag, its tokens and its wildcards.

Before: ``FORGE_AUTH_ENABLED`` was true only for the word ``true``, so ``1``, ``yes`` or ``on``
turned authentication off and made every caller the anonymous administrator, silently; a
token without expiry, issuer or audience was accepted; an unknown role crashed; and ``*`` or
``ot:*`` granted ``ot:interlock:bypass``.
"""

from __future__ import annotations

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from forge_core.coerce import AmbiguousValueError
from forge_hub.gateway import auth as auth_module
from forge_hub.gateway.auth import (
    AuthConfigError,
    auth_config_from_env,
    configure_auth,
    get_current_user,
)
from forge_hub.gateway.models import AuthConfig, ForgeUser, Role
from forge_hub.gateway.rbac import _is_authorized, is_hard_limited

SECRET, ISS, AUD = "fb291-secret-of-thirty-two-bytes!", "hub-a", "forge-hub"


@pytest.fixture
def app() -> FastAPI:
    application = FastAPI()

    @application.get("/who")
    async def who(user: ForgeUser = Depends(get_current_user)):  # noqa: B008
        return {"user_id": user.user_id, "role": user.role}

    return application


@pytest.fixture
def _on():
    configure_auth(AuthConfig(enabled=True, jwt_secret=SECRET, jwt_issuer=ISS, jwt_audience=AUD))
    yield
    configure_auth(AuthConfig(enabled=False))


def _clean(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "FORGE_AUTH_ENABLED",
        "FORGE_JWT_SECRET",
        "FORGE_JWT_ISSUER",
        "FORGE_JWT_AUDIENCE",
        "FORGE_API_KEYS",
    ):
        monkeypatch.delenv(name, raising=False)


@pytest.mark.parametrize(
    "spelling", ["true", "TRUE", "True", "1", "yes", "YES", "on", "On", "true ", " 1 "]
)
def test_every_spelling_of_on_turns_authentication_on(
    monkeypatch: pytest.MonkeyPatch, spelling: str
) -> None:
    _clean(monkeypatch)
    monkeypatch.setenv("FORGE_AUTH_ENABLED", spelling)
    assert auth_config_from_env().enabled is True


@pytest.mark.parametrize("spelling", ["false", "0", "no", "off", "OFF"])
def test_every_spelling_of_off_turns_it_off(monkeypatch: pytest.MonkeyPatch, spelling: str) -> None:
    _clean(monkeypatch)
    monkeypatch.setenv("FORGE_AUTH_ENABLED", spelling)
    assert auth_config_from_env().enabled is False


@pytest.mark.parametrize("spelling", ["enabled", "tru", "2", "y"])
def test_an_ambiguous_flag_stops_the_hub_with_its_cause(
    monkeypatch: pytest.MonkeyPatch, spelling: str
) -> None:
    _clean(monkeypatch)
    monkeypatch.setenv("FORGE_AUTH_ENABLED", spelling)
    with pytest.raises(AmbiguousValueError, match="FORGE_AUTH_ENABLED"):
        auth_config_from_env()


def test_a_jwt_secret_without_issuer_and_audience_stops_the_hub(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clean(monkeypatch)
    monkeypatch.setenv("FORGE_AUTH_ENABLED", "true")
    monkeypatch.setenv("FORGE_JWT_SECRET", SECRET)
    with pytest.raises(AuthConfigError, match="FORGE_JWT_ISSUER"):
        auth_config_from_env()
    monkeypatch.setenv("FORGE_JWT_ISSUER", ISS)
    monkeypatch.setenv("FORGE_JWT_AUDIENCE", AUD)
    assert auth_config_from_env().jwt_audience == AUD


GOOD = {"sub": "u1", "role": "operator", "exp": 4102444800, "iss": ISS, "aud": AUD}
REFUSED = {
    "no expiry": {k: v for k, v in GOOD.items() if k != "exp"},
    "no issuer": {k: v for k, v in GOOD.items() if k != "iss"},
    "no audience": {k: v for k, v in GOOD.items() if k != "aud"},
    "no subject": {k: v for k, v in GOOD.items() if k != "sub"},
    "another issuer": {**GOOD, "iss": "hub-b"},
    "another audience": {**GOOD, "aud": "elsewhere"},
    "expired": {**GOOD, "exp": 1},
    "unknown role": {**GOOD, "role": "overlord"},
    "wildcard scopes, no expiry": {
        "sub": "x",
        "role": "viewer",
        "scopes": "*",
        "iss": ISS,
        "aud": AUD,
    },
}


@pytest.mark.usefixtures("_on")
def test_a_bound_token_is_accepted(app: FastAPI) -> None:
    token = jwt.encode(GOOD, SECRET, algorithm="HS256")
    resp = TestClient(app).get("/who", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200 and resp.json()["user_id"] == "u1"


@pytest.mark.usefixtures("_on")
@pytest.mark.parametrize("case", sorted(REFUSED))
def test_a_token_missing_a_binding_or_naming_an_unknown_role_is_401(
    app: FastAPI, case: str
) -> None:
    token = jwt.encode(REFUSED[case], SECRET, algorithm="HS256")
    resp = TestClient(app, raise_server_exceptions=False).get(
        "/who", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 401, case


def _user(*scopes: str) -> ForgeUser:
    return ForgeUser(user_id="u", role=Role.ADMIN, scopes=frozenset(scopes), source="test")


@pytest.mark.parametrize(
    "scope",
    [
        "ot:interlock:bypass",
        "ot:safety:override",
        "governance:spec:approve",
        "governance:list:approve",
    ],
)
def test_no_wildcard_reaches_a_hard_limited_scope(scope: str) -> None:
    assert is_hard_limited(scope)
    domain = scope.split(":")[0]
    assert not _is_authorized(_user("*"), scope)
    assert not _is_authorized(_user(f"{domain}:*"), scope)
    assert _is_authorized(_user(scope), scope)  # only its exact name grants it


def test_ordinary_scopes_still_follow_wildcards() -> None:
    assert not is_hard_limited("adapters:write")
    assert _is_authorized(_user("*"), "adapters:write")
    assert _is_authorized(_user("adapters:*"), "adapters:write")


def test_the_state_is_described_never_silent() -> None:
    configure_auth(AuthConfig(enabled=False))
    off = auth_module.describe()
    assert off["enabled"] is False and off["anonymous_administrator"] is True
    configure_auth(AuthConfig(enabled=True, jwt_secret=SECRET, jwt_issuer=ISS, jwt_audience=AUD))
    on = auth_module.describe()
    assert (
        on["enabled"] is True and on["anonymous_administrator"] is False and on["jwt_issuer"] == ISS
    )
    configure_auth(AuthConfig(enabled=False))
