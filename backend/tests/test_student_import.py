from api import user_routes


def test_admin_import_creates_review_eligibility_and_google_links_same_account(
    client, db_conn, monkeypatch, student_import_cleanup
):
    email = student_import_cleanup["email"]
    student_number = student_import_cleanup["student_number"]
    csv_body = (
        "student_number,email,course_code,academic_year,semester,section\n"
        f"{student_number},{email},CS101,2568,1,1\n"
    )
    admin_headers = {"X-User-Id": "3"}

    preview = client.post(
        "/api/admin/students/import/preview",
        headers=admin_headers,
        files={"file": ("students.csv", csv_body.encode("utf-8"), "text/csv")},
    )
    assert preview.status_code == 200, preview.text
    preview_data = preview.json()
    assert preview_data["valid_count"] == 1
    assert preview_data["invalid_count"] == 0
    assert preview_data["rows"][0]["operation"] == "create_student"
    assert preview_data["rows"][0]["section"] == "001"

    imported = client.post(
        "/api/admin/students/import",
        headers=admin_headers,
        json={"rows": preview_data["rows"]},
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["created_count"] == 1

    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT user_id, google_sub FROM users WHERE student_number = %s",
            (student_number,),
        )
        user_id, google_sub = cur.fetchone()
        assert google_sub is None
        cur.execute(
            "SELECT COUNT(*) FROM enrollments WHERE student_id = %s",
            (user_id,),
        )
        assert cur.fetchone()[0] == 1

    repeated = client.post(
        "/api/admin/students/import/preview",
        headers=admin_headers,
        files={"file": ("students.csv", csv_body.encode("utf-8"), "text/csv")},
    )
    assert repeated.status_code == 200
    assert repeated.json()["rows"][0]["operation"] == "skip"

    monkeypatch.setattr(
        user_routes.service.google_verifier,
        "verify",
        lambda _credential: {
            "sub": "google-student-import-test",
            "email": email,
            "email_verified": True,
            "hd": "kmitl.ac.th",
            "name": "Imported Student",
        },
    )
    login = client.post("/api/auth/google", json={"credential": "signed-token"})
    assert login.status_code == 200, login.text
    assert login.json()["user"]["user_id"] == user_id
    assert login.json()["user"]["student_number"] == student_number

    eligibility = client.get(f"/api/users/{user_id}/enrollments")
    assert eligibility.status_code == 200
    assert eligibility.json()["enrollments"][0]["course_code"] == "CS101"
    client.post("/api/auth/logout")


def test_student_import_rejects_non_kmitl_email(client):
    csv_body = (
        "student_number,email,course_code,academic_year,semester,section\n"
        "67999998,student@gmail.com,CS101,2568,1,001\n"
    )
    preview = client.post(
        "/api/admin/students/import/preview",
        headers={"X-User-Id": "3"},
        files={"file": ("students.csv", csv_body.encode("utf-8"), "text/csv")},
    )
    assert preview.status_code == 200
    assert preview.json()["invalid_count"] == 1
    assert preview.json()["rows"][0]["operation"] == "invalid"


def test_admin_import_attaches_to_student_who_logged_in_first(
    client, db_conn, monkeypatch, student_import_cleanup
):
    email = student_import_cleanup["email"]
    student_number = student_import_cleanup["student_number"]
    monkeypatch.setattr(
        user_routes.service.google_verifier,
        "verify",
        lambda _credential: {
            "sub": "google-before-student-import",
            "email": email,
            "email_verified": True,
            "hd": "kmitl.ac.th",
            "name": "Google First Student",
        },
    )
    login = client.post("/api/auth/google", json={"credential": "signed-token"})
    assert login.status_code == 200
    original_user_id = login.json()["user"]["user_id"]
    client.post("/api/auth/logout")

    csv_body = (
        "student_number,email,course_code,academic_year,semester,section\n"
        f"{student_number},{email},MTH201,2568,2,1\n"
    )
    preview = client.post(
        "/api/admin/students/import/preview",
        headers={"X-User-Id": "3"},
        files={"file": ("students.csv", csv_body.encode("utf-8"), "text/csv")},
    )
    assert preview.status_code == 200, preview.text
    row = preview.json()["rows"][0]
    assert row["operation"] == "link_existing_user"
    assert row["google_linked"] is True

    imported = client.post(
        "/api/admin/students/import",
        headers={"X-User-Id": "3"},
        json={"rows": [row]},
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["results"][0]["user_id"] == original_user_id
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT student_number FROM users WHERE user_id = %s",
            (original_user_id,),
        )
        assert cur.fetchone()[0] == student_number
