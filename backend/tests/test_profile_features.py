def test_update_own_display_name_reflected_in_profile_and_reviews(client, db_conn):
    try:
        response = client.put(
            "/api/users/me",
            headers={"X-User-Id": "1"},
            json={"display_name": "Somchai Nickname"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["user"]["display_name"] == "Somchai Nickname"

        profile = client.get("/api/users/1/profile")
        assert profile.json()["user"]["display_name"] == "Somchai Nickname"

        # course_id 3 = MTH201, reviewed (ACTIVE) by user 1 (somchai_s) per db/init.sql.
        reviews = client.get("/api/courses/3/reviews")
        names = {r["reviewer_name"] for r in reviews.json()["reviews"]}
        assert "Somchai Nickname" in names
    finally:
        with db_conn.cursor() as cur:
            cur.execute("UPDATE users SET display_name = NULL WHERE user_id = 1")
        db_conn.commit()


def test_update_display_name_requires_auth(client):
    response = client.put("/api/users/me", json={"display_name": "no auth"})
    assert response.status_code == 401


def test_update_display_name_rejects_empty_string(client):
    response = client.put(
        "/api/users/me", headers={"X-User-Id": "1"}, json={"display_name": ""}
    )
    assert response.status_code == 422


def test_upload_and_fetch_own_avatar(client, db_conn):
    try:
        upload = client.post(
            "/api/users/me/avatar",
            headers={"X-User-Id": "1"},
            files={"file": ("avatar.png", b"fake-png-bytes", "image/png")},
        )
        assert upload.status_code == 200, upload.text
        avatar_url = upload.json()["user"]["avatar_url"]
        assert avatar_url.startswith("/api/users/1/avatar")

        download = client.get("/api/users/1/avatar")
        assert download.status_code == 200
        assert download.content == b"fake-png-bytes"
    finally:
        with db_conn.cursor() as cur:
            cur.execute("UPDATE users SET avatar_url = NULL WHERE user_id = 1")
        db_conn.commit()


def test_avatar_upload_rejects_non_image_content_type(client):
    response = client.post(
        "/api/users/me/avatar",
        headers={"X-User-Id": "1"},
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400


def test_avatar_upload_requires_auth(client):
    response = client.post(
        "/api/users/me/avatar",
        files={"file": ("avatar.png", b"bytes", "image/png")},
    )
    assert response.status_code == 401


def test_instructor_profile_returns_bio_and_taught_courses(client, db_conn):
    with db_conn.cursor() as cur:
        cur.execute("SELECT instructor_id FROM instructors WHERE name = 'อ.วิภาวรรณ เขียนโค้ด'")
        instructor_id = cur.fetchone()[0]

    response = client.get(f"/api/instructors/{instructor_id}/profile")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["instructor"]["name"] == "อ.วิภาวรรณ เขียนโค้ด"
    assert "CS101" in {c["course_code"] for c in data["courses"]}


def test_instructor_profile_404_for_missing_instructor(client):
    response = client.get("/api/instructors/999999/profile")
    assert response.status_code == 404
