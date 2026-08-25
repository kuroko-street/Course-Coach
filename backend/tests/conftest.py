import os
import sys
from pathlib import Path

import psycopg2
import pytest
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("ALLOW_MOCK_AUTH", "true")

from main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture()
def db_conn():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST", "test_db"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "coursecoach_test"),
        user=os.getenv("DB_USER", "coursecoach"),
        password=os.getenv("DB_PASSWORD", "coursecoach_pass"),
    )
    try:
        yield conn
    finally:
        conn.rollback()
        conn.close()


@pytest.fixture()
def admin_catalog_cleanup(db_conn):
    """Remove catalog records created by admin tests, even if a test fails."""
    yield
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT course_id FROM courses WHERE course_code IN ('ADM999', 'IMP999')"
        )
        course_ids = [row[0] for row in cur.fetchall()]
        if course_ids:
            cur.execute(
                "DELETE FROM audit_logs WHERE action = 'MANAGE_COURSE' "
                "AND target_id = ANY(%s)",
                (course_ids,),
            )
            cur.execute("DELETE FROM curriculum_courses WHERE course_id = ANY(%s)", (course_ids,))
            cur.execute("DELETE FROM course_tags WHERE course_id = ANY(%s)", (course_ids,))
            cur.execute("DELETE FROM course_instructors WHERE course_id = ANY(%s)", (course_ids,))
            cur.execute("DELETE FROM courses WHERE course_id = ANY(%s)", (course_ids,))
        cur.execute(
            "DELETE FROM curriculums WHERE curriculum_name IN "
            "('Test Curriculum Admin', 'Import Curriculum')"
        )
        cur.execute(
            "DELETE FROM instructors i WHERE i.name IN "
            "('อ.เพิ่มจากหน้า Admin', 'อ.ทดสอบ ระบบ') "
            "AND NOT EXISTS (SELECT 1 FROM course_instructors ci "
            "WHERE ci.instructor_id = i.instructor_id)"
        )
        cur.execute(
            "DELETE FROM tags t WHERE t.tag_name IN ('admin-created', 'ทดลอง') "
            "AND NOT EXISTS (SELECT 1 FROM course_tags ct WHERE ct.tag_id = t.tag_id)"
        )
    db_conn.commit()


@pytest.fixture()
def student_import_cleanup(db_conn):
    email = "student-import-test@kmitl.ac.th"
    yield {"email": email, "student_number": "67999999"}
    with db_conn.cursor() as cur:
        cur.execute("SELECT user_id FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
        row = cur.fetchone()
        if row:
            user_id = row[0]
            cur.execute("DELETE FROM audit_logs WHERE user_id = %s", (user_id,))
            cur.execute(
                "DELETE FROM audit_logs WHERE action = 'IMPORT_ENROLLMENT' "
                "AND target_id IN (SELECT enrollment_id FROM enrollments WHERE student_id = %s)",
                (user_id,),
            )
            cur.execute("DELETE FROM enrollments WHERE student_id = %s", (user_id,))
            cur.execute("DELETE FROM users WHERE user_id = %s", (user_id,))
    db_conn.commit()


@pytest.fixture()
def summary_file_cleanup(db_conn):
    """Remove summary-file rows and disk artifacts created by API tests."""
    yield
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT file_id, stored_path, upload_batch_id FROM summary_files "
            "WHERE filename LIKE 'summary-test-%'"
        )
        rows = cur.fetchall()
        file_ids = [row[0] for row in rows]
        batch_ids = list({row[2] for row in rows})
        for _, stored_path, _ in rows:
            Path(stored_path).unlink(missing_ok=True)
        if file_ids:
            cur.execute(
                "DELETE FROM audit_logs WHERE action IN "
                "('UPLOAD_SUMMARY_FILE', 'DELETE_SUMMARY_FILE', 'REPORT_SUMMARY_FILE', "
                "'MODERATE_SUMMARY_FILE') "
                "AND target_id = ANY(%s)",
                (file_ids,),
            )
            cur.execute("DELETE FROM summary_files WHERE file_id = ANY(%s)", (file_ids,))
            cur.execute(
                "DELETE FROM summary_file_upload_batches "
                "WHERE upload_batch_id = ANY(%s)",
                (batch_ids,),
            )
    db_conn.commit()


@pytest.fixture()
def valid_review_payload():
    return {
        "course_id": 2,
        "content": "Integration test review",
        "academic_year": 2567,
        "semester": "2",
        "section": "001",
        "rating_satisfaction": 5,
        "rating_difficulty": 3,
        "rating_workload": 3,
        "rating_content": 5,
        "rating_teaching": 4,
        "rating_exam": 4,
    }


@pytest.fixture()
def created_review(client, db_conn, valid_review_payload):
    response = client.post(
        "/api/reviews",
        headers={"X-User-Id": "1"},
        json=valid_review_payload,
    )
    assert response.status_code == 201, response.text
    review_id = response.json()["review_id"]
    yield review_id
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM audit_logs WHERE target_id = %s", (review_id,))
        cur.execute("DELETE FROM review_reports WHERE review_id = %s", (review_id,))
        cur.execute("DELETE FROM review_likes WHERE review_id = %s", (review_id,))
        cur.execute("DELETE FROM review_comments WHERE review_id = %s", (review_id,))
        cur.execute("DELETE FROM review_files WHERE review_id = %s", (review_id,))
        cur.execute("DELETE FROM reviews WHERE review_id = %s", (review_id,))
    db_conn.commit()
