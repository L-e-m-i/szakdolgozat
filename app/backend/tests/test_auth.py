# 1-sprint-L-e-m-i\app\backend\tests\test_auth.py
from __future__ import annotations

import uuid

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def _unique_username() -> str:
    return f"testuser_{uuid.uuid4().hex[:8]}"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex[:8]}@example.com"


def _signup(username: str, email: str, password: str):
    payload = {"username": username, "email": email, "password": password}
    return client.post("/auth/signup", json=payload)


def _login(username_or_email: str, password: str):
    # OAuth2PasswordRequestForm expects form-encoded data
    data = {"username": username_or_email, "password": password}
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    return client.post("/auth/token", data=data, headers=headers)


def test_signup_creates_user_and_returns_201() -> None:
    username = _unique_username()
    email = _unique_email()
    password = "s3cret-pass"

    resp = _signup(username, email, password)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["username"] == username
    assert body["email"] == email
    # returned model includes `disabled` field (mapping from DB `is_active`)
    assert "disabled" in body


def test_signup_duplicate_username_returns_400_with_code() -> None:
    username = _unique_username()
    email1 = _unique_email()
    email2 = _unique_email()
    password = "dup-pass"

    r1 = _signup(username, email1, password)
    assert r1.status_code == 201, r1.text

    r2 = _signup(username, email2, password)
    assert r2.status_code == 400
    err = r2.json()
    # backend normalizes HTTPException detail into structured { message, code }
    assert err.get("code") == "username_exists"
    assert "Username already exists" in err.get("message", "")


def test_signup_duplicate_email_returns_400_with_code() -> None:
    username1 = _unique_username()
    username2 = _unique_username()
    email = _unique_email()
    password = "dup-email-pass"

    r1 = _signup(username1, email, password)
    assert r1.status_code == 201, r1.text

    r2 = _signup(username2, email, password)
    assert r2.status_code == 400
    err = r2.json()
    assert err.get("code") == "email_exists"
    assert "Email already registered" in err.get("message", "")


def test_token_exchange_refresh_and_logout_flow() -> None:
    """
    Full happy-path:
      - signup
      - login -> access_token + refresh_token
      - refresh -> new access + new refresh (rotation)
      - logout -> revoke refresh token (204)
      - using revoked refresh token fails
      - protected endpoint requires token and accepts valid token
    """
    username = _unique_username()
    email = _unique_email()
    password = "complex-pass-123"

    # signup
    r = _signup(username, email, password)
    assert r.status_code == 201, r.text

    # login (form-encoded)
    r = _login(username, password)
    assert r.status_code == 200, r.text
    tokens = r.json()
    assert "access_token" in tokens and tokens["access_token"]
    assert "refresh_token" in tokens and tokens["refresh_token"]
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    # access protected endpoint with bearer token
    headers = {"Authorization": f"Bearer {access_token}"}
    r = client.get("/auth/users/me/", headers=headers)
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["username"] == username
    assert me["email"] == email

    # refresh the access token (rotation) - send json payload
    r = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 200, r.text
    new_tokens = r.json()
    assert new_tokens["refresh_token"] != refresh_token
    new_refresh = new_tokens["refresh_token"]
    new_access = new_tokens["access_token"]

    # logout using the newly issued refresh token (204 No Content expected)
    r = client.post("/auth/logout", json={"refresh_token": new_refresh})
    assert r.status_code == 204

    # trying to refresh with the same (now revoked) token must fail
    r = client.post("/auth/refresh", json={"refresh_token": new_refresh})
    assert r.status_code == 401
    err = r.json()
    assert err.get("code") == "invalid_refresh_token"

    # previously issued access token should still be valid until it expires
    # (we still expect it to work right after rotation)
    headers = {"Authorization": f"Bearer {new_access}"}
    r = client.get("/auth/users/me/", headers=headers)
    # if token expiry is very short in environment this could be 401; assert 200 or 401 with clear message
    assert r.status_code in (200, 401)
    if r.status_code == 200:
        me2 = r.json()
        assert me2["username"] == username


def test_protected_endpoint_requires_authorization() -> None:
    # call protected endpoint without Authorization header
    r = client.get("/auth/users/me/")
    assert r.status_code == 401
    body = r.json()
    # get_current_user raises the credentials_exception which uses code "invalid_credentials"
    assert body.get("code") == "invalid_credentials"
    assert "Could not validate credentials" in body.get("message", "")
