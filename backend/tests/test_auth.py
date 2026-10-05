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


def test_google_relogin_keeps_avatar_chosen_in_app(client, db_conn, monkeypatch):
    google_sub = "google-avatar-preserve-test"
    email = "avatar-preserve-test@kmitl.ac.th"
    identity = {
        "sub": google_sub,
        "email": email,
        "email_verified": True,
        "hd": "kmitl.ac.th",
        "name": "Avatar Test Student",
        "picture": "https://example.test/google-original.png",
    }
    monkeypatch.setattr(user_routes.service.google_verifier, "verify", lambda _credential: identity)

    try:
        first_login = client.post("/api/auth/google", json={"credential": "signed-token"})
        assert first_login.status_code == 200, first_login.text
        user_id = first_login.json()["user"]["user_id"]
        assert first_login.json()["user"]["avatar_url"] == identity["picture"]

        custom_avatar = f"/api/users/{user_id}/avatar?v=custom"
        with db_conn.cursor() as cur:
            cur.execute("UPDATE users SET avatar_url = %s WHERE user_id = %s", (custom_avatar, user_id))
        db_conn.commit()
        client.post("/api/auth/logout")

        identity["picture"] = "https://example.test/google-new.png"
        relogin = client.post("/api/auth/google", json={"credential": "signed-token"})
        assert relogin.status_code == 200, relogin.text
        assert relogin.json()["user"]["avatar_url"] == custom_avatar
        assert client.get("/api/auth/me").json()["user"]["avatar_url"] == custom_avatar
        assert client.get(f"/api/users/{user_id}/profile").json()["user"]["avatar_url"] == custom_avatar
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
