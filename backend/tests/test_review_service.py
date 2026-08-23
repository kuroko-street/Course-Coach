from types import SimpleNamespace

import pytest

from services.review_service import ReviewService


class FakeConnection:
    def __init__(self):
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


class SuccessfulReviewRepository:
    def course_exists(self, conn, course_id):
        return True

    def create(self, conn, reviewer_id, data):
        return 99


class SuccessfulEnrollmentRepository:
    def exists(self, *args):
        return True


class FailingAuditRepository:
    def create(self, *args):
        raise RuntimeError("audit write failed")


def test_create_review_rolls_back_when_audit_write_fails():
    conn = FakeConnection()
    service = ReviewService(
        connection_factory=lambda: conn,
        review_repository=SuccessfulReviewRepository(),
        enrollment_repository=SuccessfulEnrollmentRepository(),
        audit_repository=FailingAuditRepository(),
    )
    data = SimpleNamespace(
        course_id=2,
        academic_year=2567,
        semester="2",
        section="001",
    )

    with pytest.raises(RuntimeError, match="audit write failed"):
        service.create_review({"user_id": 1}, data)

    assert conn.rolled_back is True
    assert conn.committed is False
    assert conn.closed is True
