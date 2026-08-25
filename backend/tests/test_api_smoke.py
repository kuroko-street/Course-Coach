def test_public_read_endpoints(client):
    cases = [
        "/health",
        "/api/users",
        "/api/departments",
        "/api/tags",
        "/api/courses",
        "/api/courses/1",
        "/api/courses/1/reviews",
        "/api/dashboard/rankings",
        "/api/users/1/profile",
    ]
    for path in cases:
        response = client.get(path)
        assert response.status_code == 200, f"{path}: {response.text}"


def test_protected_endpoints_enforce_role_and_identity(client):
    assert client.get("/api/admin/reports", headers={"X-User-Id": "1"}).status_code == 403
    assert client.get("/api/admin/reports", headers={"X-User-Id": "3"}).status_code == 200
    summary = client.get("/api/admin/reports/summary", headers={"X-User-Id": "3"})
    assert summary.status_code == 200
    assert {"pending_count", "reviewed_count"} <= summary.json().keys()
    assert client.get("/api/users/1/enrollments", headers={"X-User-Id": "2"}).status_code == 403
    assert client.get("/api/users/1/enrollments", headers={"X-User-Id": "1"}).status_code == 200


def test_admin_can_manage_courses_and_curriculum(client):
    admin_headers = {"X-User-Id": "3"}
    assert client.get("/api/admin/courses", headers={"X-User-Id": "1"}).status_code == 403
    instructors = client.get("/api/admin/instructors", headers=admin_headers)
    assert instructors.status_code == 200
    created_instructor = client.post(
        "/api/admin/instructors", headers=admin_headers,
        json={"name": "อ.เพิ่มจากหน้า Admin"},
    )
    assert created_instructor.status_code == 201, created_instructor.text
    assert created_instructor.json()["instructor"]["name"] == "อ.เพิ่มจากหน้า Admin"

    curriculum = client.post(
        "/api/admin/curriculums", headers=admin_headers,
        json={
            "curriculum_name": "Test Curriculum Admin", "academic_year": 2999,
            "department": "Test Department", "degree_level": "ปริญญาตรี",
        },
    )
    assert curriculum.status_code == 201, curriculum.text
    curriculum_id = curriculum.json()["curriculum"]["curriculum_id"]

    created = client.post(
        "/api/admin/courses", headers=admin_headers,
        json={
            "course_code": "ADM999", "course_name": "Admin Managed Course",
            "department": "Test Department", "tag_names": ["admin-created", "ทดลอง"],
            "instructor_names": ["อ.ทดสอบ ระบบ"], "curriculum_mappings": [{
                "curriculum_id": curriculum_id, "recommended_year": 2,
                "recommended_semester": "1", "requirement_type": "ELECTIVE",
            }],
        },
    )
    assert created.status_code == 201, created.text
    course_id = created.json()["course_id"]
    admin_courses = client.get("/api/admin/courses", headers=admin_headers).json()["courses"]
    managed = next(course for course in admin_courses if course["course_id"] == course_id)
    assert set(managed["tags"]) == {"admin-created", "ทดลอง"}
    assert managed["instructors"] == ["อ.ทดสอบ ระบบ"]
    assert client.patch(
        f"/api/admin/courses/{course_id}/status", headers=admin_headers,
        json={"is_active": False},
    ).status_code == 200
    listed = client.get("/api/courses").json()["courses"]
    assert all(course["course_id"] != course_id for course in listed)


def test_admin_can_preview_and_confirm_excel_course_import(client):
    from io import BytesIO
    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    sheet.append([
        "course_code", "course_name", "department", "curriculum_name", "curriculum_year",
        "recommended_year", "recommended_semester", "requirement_type", "prerequisites", "syllabus",
    ])
    sheet.append(["IMP999", "Imported Course", "Import Department", "Import Curriculum", 2998, 2, "1", "ELECTIVE", "CS101", "Imported from Excel"])
    buffer = BytesIO()
    workbook.save(buffer)
    headers = {"X-User-Id": "3"}
    preview = client.post(
        "/api/admin/courses/import/preview", headers=headers,
        files={"file": ("courses.xlsx", buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert preview.status_code == 200, preview.text
    data = preview.json()
    assert data["valid_count"] == 1
    assert data["invalid_count"] == 0
    imported = client.post("/api/admin/courses/import", headers=headers, json={"rows": data["rows"]})
    assert imported.status_code == 200, imported.text
    assert imported.json()["imported_count"] == 1

    buffer.seek(0)
    repeated_preview = client.post(
        "/api/admin/courses/import/preview", headers=headers,
        files={"file": ("courses.xlsx", buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert repeated_preview.status_code == 200, repeated_preview.text
    assert repeated_preview.json()["rows"][0]["operation"] == "skip"
    repeated_import = client.post("/api/admin/courses/import", headers=headers, json={"rows": repeated_preview.json()["rows"]})
    assert repeated_import.status_code == 200, repeated_import.text
    assert repeated_import.json()["results"][0]["operation"] == "skipped"
