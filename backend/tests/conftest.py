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
