def test_create_review_requires_authenticated_user(client, valid_review_payload):
    response = client.post("/api/reviews", json=valid_review_payload)
    assert response.status_code == 401


def test_create_review_uses_authenticated_identity(
    client, db_conn, valid_review_payload
):
    response = client.post(
        "/api/reviews", headers={"X-User-Id": "1"}, json=valid_review_payload
    )
    assert response.status_code == 201, response.text
    review_id = response.json()["review_id"]
    try:
        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT reviewer_id FROM reviews WHERE review_id = %s", (review_id,)
            )
            assert cur.fetchone()[0] == 1
            cur.execute(
                "SELECT user_id FROM audit_logs WHERE action = 'WRITE_REVIEW' AND target_id = %s",
                (review_id,),
            )
            assert cur.fetchone()[0] == 1
    finally:
        with db_conn.cursor() as cur:
            cur.execute("DELETE FROM audit_logs WHERE target_id = %s", (review_id,))
            cur.execute("DELETE FROM reviews WHERE review_id = %s", (review_id,))
        db_conn.commit()


def test_create_review_rejects_spoofed_reviewer_id(client, valid_review_payload):
    response = client.post(
        "/api/reviews",
        headers={"X-User-Id": "1"},
        json={**valid_review_payload, "reviewer_id": 2},
    )
    assert response.status_code == 422


def test_non_enrolled_user_cannot_create_review(client, valid_review_payload):
    response = client.post(
        "/api/reviews",
        headers={"X-User-Id": "2"},
        json={**valid_review_payload, "course_id": 3},
    )
    assert response.status_code == 403


def test_other_user_cannot_edit_review(client, created_review, valid_review_payload):
    update = {k: v for k, v in valid_review_payload.items() if k != "course_id"}
    response = client.put(
        f"/api/reviews/{created_review}",
        headers={"X-User-Id": "2"},
        json=update,
    )
    assert response.status_code == 403


def test_delete_is_soft_delete(client, db_conn, created_review):
    response = client.delete(
        f"/api/reviews/{created_review}", headers={"X-User-Id": "1"}
    )
    assert response.status_code == 200
    with db_conn.cursor() as cur:
        cur.execute("SELECT status FROM reviews WHERE review_id = %s", (created_review,))
        assert cur.fetchone()[0] == "DELETED"


def test_report_uses_authenticated_identity(client, db_conn, created_review):
    response = client.post(
        f"/api/reviews/{created_review}/report",
        headers={"X-User-Id": "2"},
        json={"reporter_id": 1},
    )
    assert response.status_code == 201, response.text
    report_id = response.json()["report_id"]
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT reporter_id FROM review_reports WHERE report_id = %s", (report_id,)
        )
        assert cur.fetchone()[0] == 2


def test_user_can_report_a_review_only_once(client, created_review):
    first = client.post(
        f"/api/reviews/{created_review}/report", headers={"X-User-Id": "2"}
    )
    assert first.status_code == 201, first.text

    duplicate = client.post(
        f"/api/reviews/{created_review}/report", headers={"X-User-Id": "2"}
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "You have already reported this review."
