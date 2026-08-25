import logging

from db import get_connection
from domain.errors import ServiceError
from repositories.audit_log_repository import AuditLogRepository
from repositories.enrollment_repository import EnrollmentRepository
from repositories.review_repository import ReviewRepository


logger = logging.getLogger("coursecoach.review_service")


class ReviewService:
    REPORT_HIDE_THRESHOLD = 5

    def __init__(
        self,
        connection_factory=get_connection,
        review_repository=None,
        enrollment_repository=None,
        audit_repository=None,
    ):
        self.connection_factory = connection_factory
        self.reviews = review_repository or ReviewRepository()
        self.enrollments = enrollment_repository or EnrollmentRepository()
        self.audit = audit_repository or AuditLogRepository()

    def create_review(self, user, data, ip_address=None):
        conn = self.connection_factory()
        try:
            if not self.reviews.course_exists(conn, data.course_id):
                raise ServiceError(404, f"Course id {data.course_id} not found.")
            if not self.enrollments.exists(
                conn, user["user_id"], data.course_id, data.academic_year,
                data.semester, data.section,
            ):
                raise ServiceError(403, "You can only review a course you were enrolled in for that academic year/semester/section.")
            review_id = self.reviews.create(conn, user["user_id"], data)
            self.audit.create(conn, user["user_id"], "WRITE_REVIEW", review_id, ip_address)
            conn.commit()
            return {"review_id": review_id, "message": "Review created successfully."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def update_review(self, review_id, user, data, ip_address=None):
        conn = self.connection_factory()
        try:
            review = self.reviews.find_by_id_for_update(conn, review_id)
            if review is None:
                raise ServiceError(404, f"Review id {review_id} not found.")
            if review["reviewer_id"] != user["user_id"]:
                raise ServiceError(403, "You can only edit reviews you wrote yourself.")
            if review["status"] == "DELETED":
                raise ServiceError(409, "This review has already been deleted.")
            if not self.enrollments.exists(
                conn, user["user_id"], review["course_id"], data.academic_year,
                data.semester, data.section,
            ):
                raise ServiceError(403, "You can only review a course you were enrolled in for that academic year/semester/section.")
            self.reviews.update(conn, review_id, data)
            self.audit.create(conn, user["user_id"], "EDIT_REVIEW", review_id, ip_address)
            conn.commit()
            return {"review_id": review_id, "message": "Review updated."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def delete_review(self, review_id, user, ip_address=None):
        conn = self.connection_factory()
        try:
            review = self.reviews.find_by_id_for_update(conn, review_id)
            if review is None:
                raise ServiceError(404, f"Review id {review_id} not found.")
            if review["reviewer_id"] != user["user_id"]:
                raise ServiceError(403, "You can only delete reviews you wrote yourself.")
            if review["status"] == "DELETED":
                raise ServiceError(409, "This review has already been deleted.")
            self.reviews.soft_delete(conn, review_id)
            self.audit.create(conn, user["user_id"], "DELETE_REVIEW", review_id, ip_address)
            conn.commit()
            return {"review_id": review_id, "message": "Review deleted."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def like_review(self, review_id, user):
        conn = self.connection_factory()
        try:
            review = self.reviews.find_by_id(conn, review_id)
            if review is None:
                raise ServiceError(404, f"Review id {review_id} not found.")
            if review["status"] != "ACTIVE":
                raise ServiceError(409, "Only active reviews can be liked.")
            self.reviews.add_like(conn, review_id, user["user_id"])
            count = self.reviews.count_likes(conn, review_id)
            conn.commit()
            return {"review_id": review_id, "liked": True, "like_count": count}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def unlike_review(self, review_id, user):
        conn = self.connection_factory()
        try:
            self.reviews.remove_like(conn, review_id, user["user_id"])
            count = self.reviews.count_likes(conn, review_id)
            conn.commit()
            return {"review_id": review_id, "liked": False, "like_count": count}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def list_comments(self, review_id):
        conn = self.connection_factory()
        try:
            return {"comments": self.reviews.list_comments(conn, review_id)}
        finally:
            conn.close()

    def add_comment(self, review_id, user, content):
        conn = self.connection_factory()
        try:
            review = self.reviews.find_by_id(conn, review_id)
            if review is None:
                raise ServiceError(404, f"Review id {review_id} not found.")
            if review["status"] != "ACTIVE":
                raise ServiceError(409, "Only active reviews can receive comments.")
            created = self.reviews.add_comment(conn, review_id, user["user_id"], content)
            conn.commit()
            return {
                "comment_id": created["comment_id"], "review_id": review_id,
                "author_id": user["user_id"], "author_name": user["username"],
                "author_avatar": user["avatar_url"], "content": content,
                "created_at": created["created_at"],
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def report_review(self, review_id, user, ip_address=None):
        conn = self.connection_factory()
        try:
            review = self.reviews.find_by_id_for_update(conn, review_id)
            if review is None:
                raise ServiceError(404, f"Review id {review_id} not found.")
            if review["status"] == "DELETED":
                raise ServiceError(409, "This review has already been deleted.")
            if user["is_report_blocked"]:
                raise ServiceError(403, "Your reporting privileges are currently suspended.")
            report_id = self.reviews.add_report(conn, review_id, user["user_id"])
            if report_id is None:
                raise ServiceError(409, "You have already reported this review.")
            updated = self.reviews.increment_report_count(conn, review_id, self.REPORT_HIDE_THRESHOLD)
            self.audit.create(conn, user["user_id"], "FLAG_REPORT", review_id, ip_address)
            conn.commit()
            auto_hidden = updated["status"] == "HIDDEN" and review["status"] != "HIDDEN"
            return {
                "report_id": report_id, "review_id": review_id,
                "report_count": updated["report_count"], "status": updated["status"],
                "auto_hidden": auto_hidden,
                "message": "Review hidden pending admin review." if auto_hidden else "Report submitted. Thank you.",
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
