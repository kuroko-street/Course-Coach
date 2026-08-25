def upload_summary(client, *, user_id=1, filename="summary-test-notes.pdf", content=b"%PDF test"):
    return client.post(
        "/api/courses/2/summary-files",
        headers={"X-User-Id": str(user_id)},
        data={"enrollment_id": "3"},
        files=[("files", (filename, content, "application/pdf"))],
    )


def test_summary_file_full_flow(client, summary_file_cleanup):
    client.post("/api/auth/logout")

    anonymous = client.post(
        "/api/courses/2/summary-files",
        data={"enrollment_id": "3"},
        files=[("files", ("summary-test-anonymous.pdf", b"%PDF", "application/pdf"))],
    )
    assert anonymous.status_code == 401

    uploaded = upload_summary(client)
    assert uploaded.status_code == 201, uploaded.text
    assert uploaded.json()["created_count"] == 1
    file_id = uploaded.json()["files"][0]["file_id"]

    listing = client.get(
        "/api/courses/2/summary-files", headers={"X-User-Id": "2"}
    )
    assert listing.status_code == 200, listing.text
    row = next(item for item in listing.json()["files"] if item["file_id"] == file_id)
    assert row["course_code"] == "CS101"
    assert row["academic_year"] == 2567
    assert row["semester"] == "2"
    assert row["like_count"] == 0
    assert row["comments"] == []

    download = client.get(
        f"/api/summary-files/{file_id}/download", headers={"X-User-Id": "2"}
    )
    assert download.status_code == 200
    assert download.content == b"%PDF test"

    liked = client.post(
        f"/api/summary-files/{file_id}/like", headers={"X-User-Id": "2"}
    )
    assert liked.status_code == 200
    assert liked.json() == {"liked": True, "like_count": 1}
    unliked = client.post(
        f"/api/summary-files/{file_id}/like", headers={"X-User-Id": "2"}
    )
    assert unliked.json() == {"liked": False, "like_count": 0}

    comment = client.post(
        f"/api/summary-files/{file_id}/comments",
        headers={"X-User-Id": "2"},
        json={"content": "อ่านง่ายมาก"},
    )
    assert comment.status_code == 201, comment.text
    assert comment.json()["author_id"] == 2
    assert comment.json()["content"] == "อ่านง่ายมาก"

    self_report = client.post(
        f"/api/summary-files/{file_id}/report", headers={"X-User-Id": "1"}
    )
    assert self_report.status_code == 409
    reported = client.post(
        f"/api/summary-files/{file_id}/report", headers={"X-User-Id": "2"}
    )
    assert reported.status_code == 201
    assert reported.json()["report_count"] == 1
    duplicate = client.post(
        f"/api/summary-files/{file_id}/report", headers={"X-User-Id": "2"}
    )
    assert duplicate.status_code == 409

    forbidden = client.delete(
        f"/api/summary-files/{file_id}", headers={"X-User-Id": "2"}
    )
    assert forbidden.status_code == 403
    deleted = client.delete(
        f"/api/summary-files/{file_id}", headers={"X-User-Id": "3"}
    )
    assert deleted.status_code == 200
    assert deleted.json()["status"] == "DELETED"
    missing = client.get(
        f"/api/summary-files/{file_id}/download", headers={"X-User-Id": "2"}
    )
    assert missing.status_code == 404


def test_summary_file_validates_type_count_and_size(client, summary_file_cleanup):
    client.post("/api/auth/logout")

    invalid_type = upload_summary(
        client, filename="summary-test-malware.exe", content=b"not executable"
    )
    assert invalid_type.status_code == 415

    too_many = client.post(
        "/api/courses/2/summary-files",
        headers={"X-User-Id": "1"},
        data={"enrollment_id": "3"},
        files=[
            ("files", (f"summary-test-{index}.pdf", b"%PDF", "application/pdf"))
            for index in range(4)
        ],
    )
    assert too_many.status_code == 400

    empty = upload_summary(client, filename="summary-test-empty.pdf", content=b"")
    assert empty.status_code == 422

    oversized = upload_summary(
        client,
        filename="summary-test-oversized.pdf",
        content=b"x" * (20 * 1024 * 1024 + 1),
    )
    assert oversized.status_code == 413


def test_two_upload_rounds_are_restored_after_deleting_a_round(
    client, summary_file_cleanup
):
    client.post("/api/auth/logout")
    first = upload_summary(client, filename="summary-test-round-1.pdf")
    second = upload_summary(client, filename="summary-test-round-2.pdf")
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert second.json()["remaining_upload_rounds"] == 0

    blocked = upload_summary(client, filename="summary-test-round-3.pdf")
    assert blocked.status_code == 409

    first_file_id = first.json()["files"][0]["file_id"]
    deleted = client.delete(
        f"/api/summary-files/{first_file_id}", headers={"X-User-Id": "1"}
    )
    assert deleted.status_code == 200

    replacement = upload_summary(client, filename="summary-test-round-replacement.pdf")
    assert replacement.status_code == 201, replacement.text
    assert replacement.json()["remaining_upload_rounds"] == 0


def test_admin_can_inspect_and_restore_a_hidden_file(
    client, db_conn, summary_file_cleanup
):
    client.post("/api/auth/logout")
    uploaded = upload_summary(client, filename="summary-test-moderation.pdf")
    assert uploaded.status_code == 201, uploaded.text
    file_id = uploaded.json()["files"][0]["file_id"]

    with db_conn.cursor() as cur:
        cur.execute(
            "UPDATE summary_files SET status = 'HIDDEN', report_count = 5 "
            "WHERE file_id = %s",
            (file_id,),
        )
    db_conn.commit()

    queue = client.get("/api/admin/summary-files", headers={"X-User-Id": "3"})
    assert queue.status_code == 200, queue.text
    assert file_id in [item["file_id"] for item in queue.json()["files"]]

    download = client.get(
        f"/api/admin/summary-files/{file_id}/download",
        headers={"X-User-Id": "3"},
    )
    assert download.status_code == 200
    assert download.content == b"%PDF test"

    restored = client.post(
        f"/api/admin/summary-files/{file_id}/action",
        headers={"X-User-Id": "3"},
        json={"action": "KEEP"},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["status"] == "ACTIVE"
    assert restored.json()["report_count"] == 0
