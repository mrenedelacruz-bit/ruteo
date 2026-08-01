import jwt as pyjwt
import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip():
    hashed = hash_password("secreto123")
    assert hashed != "secreto123"
    assert verify_password("secreto123", hashed)
    assert not verify_password("otra-clave", hashed)


def test_verify_password_with_malformed_hash_returns_false():
    assert not verify_password("x", "no-es-un-hash-bcrypt")


def test_token_roundtrip_contains_username_and_role():
    token = create_access_token("maria", "dispatcher")
    payload = decode_access_token(token)
    assert payload["sub"] == "maria"
    assert payload["role"] == "dispatcher"


def test_tampered_token_is_rejected():
    token = create_access_token("maria", "clerk")
    tampered = token[:-2] + ("aa" if not token.endswith("aa") else "bb")
    with pytest.raises(pyjwt.InvalidTokenError):
        decode_access_token(tampered)
