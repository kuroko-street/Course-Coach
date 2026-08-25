import pytest

from auth import GoogleIdentityError, GoogleIdentityVerifier
from api import user_routes


def test_auth_config_exposes_development_mock_mode(client):
    response = client.get("/api/auth/config")

    assert response.status_code == 200
    assert response.json()["mock_login_enabled"] is True


def test_mock_user_list_contains_only_seed_accounts(client):
    response = client.get("/api/auth/mock-users")

    assert response.status_code == 200
    assert {user["email"] for user in response.json()["users"]} == {
        "somchai.s@example.ac.th",
        "malee.p@example.ac.th",
        "wichai.a@example.ac.th",
    }


def test_google_verifier_rejects_non_kmitl_workspace(monkeypatch):
    verifier = GoogleIdentityVerifier("test-client", "kmitl.ac.th")
    monkeypatch.setattr(
        "auth.id_token.verify_oauth2_token",
        lambda *_args, **_kwargs: {
            "sub": "google-123",
            "email": "student@gmail.com",
            "email_verified": True,
            "hd": "gmail.com",
        },
    )

    with pytest.raises(GoogleIdentityError, match="kmitl.ac.th"):
        verifier.verify("signed-token")


def test_google_login_creates_session_and_user(client, db_conn, monkeypatch):
    google_sub = "google-test-kmitl-student"
    email = "auth-test@kmitl.ac.th"
    monkeypatch.setattr(
        user_routes.service.google_verifier,
        "verify",
        lambda _credential: {
            "sub": google_sub,
            "email": email,
            "email_verified": True,
            "hd": "kmitl.ac.th",
            "name": "Auth Test Student",
            "picture": "https://example.test/avatar.png",
        },
    )

    try:
        response = client.post("/api/auth/google", json={"credential": "signed-token"})
        assert response.status_code == 200, response.text
        assert response.json()["user"]["email"] == email
        assert response.json()["user"]["role"] == "STUDENT"

        me = client.get("/api/auth/me")
        assert me.status_code == 200
        assert me.json()["user"]["email"] == email

        mock_users = client.get("/api/auth/mock-users")
        assert email not in {user["email"] for user in mock_users.json()["users"]}

        mock_login = client.post(
            "/api/auth/login-mock",
            json={"user_id": response.json()["user"]["user_id"]},
        )
        assert mock_login.status_code == 404
    finally:
        client.post("/api/auth/logout")
        with db_conn.cursor() as cur:
            cur.execute(
                "DELETE FROM audit_logs WHERE user_id IN "
                "(SELECT user_id FROM users WHERE google_sub = %s)",
                (google_sub,),
            )
            cur.execute("DELETE FROM users WHERE google_sub = %s", (google_sub,))
        db_conn.commit()
