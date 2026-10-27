"""Authentication must keep mock-session rules while using one DB lookup."""

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from api import dependencies


class FakeConnection:
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


def request_with_session(user_id=None):
    session = {} if user_id is None else {"user_id": user_id}
    return Request({"type": "http", "session": session, "headers": []})


def set_user_lookup(monkeypatch, is_mock):
    connections = []

    def connect():
        conn = FakeConnection()
        connections.append(conn)
        return conn

    monkeypatch.setattr(dependencies, "get_connection", connect)
    monkeypatch.setattr(
        dependencies.user_repository,
        "find_by_id",
        lambda conn, user_id: {"user_id": user_id, "role": "ADMIN", "is_mock": is_mock},
    )
    return connections


def test_real_session_uses_one_lookup_and_does_not_expose_mock_flag(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    connections = set_user_lookup(monkeypatch, is_mock=False)
    request = request_with_session(2)

    user = dependencies.require_user(request, x_user_id=None)

    assert user == {"user_id": 2, "role": "ADMIN"}
    assert request.session == {"user_id": 2, "is_mock": False}
    assert len(connections) == 1 and connections[0].closed


def test_optional_real_session_avoids_repeat_lookup(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    request = request_with_session(2)
    request.session["is_mock"] = False
    monkeypatch.setattr(dependencies, "get_connection", lambda: pytest.fail("unexpected DB lookup"))

    assert dependencies.optional_user_id(request, x_user_id=None) == 2


def test_optional_legacy_session_is_checked_once(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    connections = []

    def connect():
        conn = FakeConnection()
        connections.append(conn)
        return conn

    monkeypatch.setattr(dependencies, "get_connection", connect)
    monkeypatch.setattr(dependencies.user_repository, "find_mock_by_id", lambda _conn, _id: None)
    request = request_with_session(2)

    assert dependencies.optional_user_id(request, x_user_id=None) == 2
    assert request.session == {"user_id": 2, "is_mock": False}
    assert dependencies.optional_user_id(request, x_user_id=None) == 2
    assert len(connections) == 1 and connections[0].closed


def test_optional_mock_session_is_revoked_without_lookup(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    request = request_with_session(2)
    request.session["is_mock"] = True
    monkeypatch.setattr(dependencies, "get_connection", lambda: pytest.fail("unexpected DB lookup"))

    assert dependencies.optional_user_id(request, x_user_id=None) is None
    assert request.session == {}


def test_optional_mock_session_still_works_in_development(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("ALLOW_MOCK_AUTH", "true")
    request = request_with_session(2)
    request.session["is_mock"] = True
    monkeypatch.setattr(dependencies, "get_connection", lambda: pytest.fail("unexpected DB lookup"))

    assert dependencies.optional_user_id(request, x_user_id=None) == 2


def test_optional_legacy_mock_session_is_revoked(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    connections = []

    def connect():
        conn = FakeConnection()
        connections.append(conn)
        return conn

    monkeypatch.setattr(dependencies, "get_connection", connect)
    monkeypatch.setattr(dependencies.user_repository, "find_mock_by_id", lambda _conn, user_id: {"user_id": user_id})
    request = request_with_session(2)

    assert dependencies.optional_user_id(request, x_user_id=None) is None
    assert request.session == {}
    assert len(connections) == 1 and connections[0].closed


def test_mock_session_is_revoked_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    set_user_lookup(monkeypatch, is_mock=True)
    request = request_with_session(2)

    with pytest.raises(HTTPException) as error:
        dependencies.require_user(request, x_user_id=None)

    assert error.value.status_code == 401
    assert request.session == {}


def test_header_login_accepts_only_mock_users_in_development(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("ALLOW_MOCK_AUTH", "true")
    set_user_lookup(monkeypatch, is_mock=True)

    assert dependencies.require_user(request_with_session(), x_user_id=3)["user_id"] == 3

    set_user_lookup(monkeypatch, is_mock=False)
    with pytest.raises(HTTPException) as error:
        dependencies.require_user(request_with_session(), x_user_id=3)
    assert error.value.status_code == 401


def test_header_login_does_not_work_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    connections = set_user_lookup(monkeypatch, is_mock=True)

    with pytest.raises(HTTPException) as error:
        dependencies.require_user(request_with_session(), x_user_id=3)

    assert error.value.status_code == 401
    assert connections == []
