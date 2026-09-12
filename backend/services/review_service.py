import logging

from db import get_connection
from domain.errors import ServiceError
from domain.review_tags import CONFLICTING_WORKLOAD_TAGS, REVIEW_TAG_NAMES
from repositories.audit_log_repository import AuditLogRepository
from repositories.review_repository import ReviewRepository
from repositories.contribution_repository import ContributionRepository
from services.content_comment_service import ContentCommentService


logger = logging.getLogger("coursecoach.review_service")


class ReviewService:
    REPORT_HIDE_THRESHOLD = 5

    def __init__(
        self,
        connection_factory=get_connection,
        review_repository=None,
        audit_repository=None,
    ):
        self.connection_factory = connection_factory
        self.reviews = review_repository or ReviewRepository()
        self.audit = audit_repository or AuditLogRepository()
        self.quotas = ContributionRepository()
        self.comments = ContentCommentService(
            "review", connection_factory, self.reviews.find_by_id_for_update, self.audit,
        )

    def _validate_tags(self, conn, tag_ids):
        if not tag_ids:
            return
        rows = self.reviews.tags_by_ids(conn, tag_ids)
        names = {row["tag_name"] for row in rows}
        if len(rows) != len(tag_ids) or not names.issubset(REVIEW_TAG_NAMES):
            raise ServiceError(422, "Choose tags from the fixed review tag list.")
        if CONFLICTING_WORKLOAD_TAGS.issubset(names):
            raise ServiceError(422, "งานเยอะและงานไม่มากเลือกพร้อมกันไม่ได้")

    @staticmethod
    def _require_active(review):
        if review is None or review["status"] != "ACTIVE":
            raise ServiceError(404, "Review not found.")

    def create_review(self, user, data, ip_address=None):
        conn = self.connection_factory()
        try:
            self.quotas.lock(conn,data.course_id,user['user_id'])
            if not self.reviews.course_exists(conn, data.course_id):
                raise ServiceError(404, f"Course id {data.course_id} not found.")
            self._validate_tags(conn, data.tag_ids)
            self.quotas.require_review_slot(conn,data.course_id,user['user_id'])
            review_id = self.reviews.create(conn, user["user_id"], data)
            self.audit.create(conn, user["user_id"], "WRITE_REVIEW", review_id, ip_address)
            conn.commit()
            return {"review_id": review_id, "message": "Review created successfully."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _lock_review(self,conn,review_id):
        # Prevent a merge moving this review between looking up and locking its owner/course.
        self.quotas.lock_tables(conn)
        row=self.reviews.find_by_id(conn,review_id)
        if row: self.quotas.lock(conn,row['course_id'],row['reviewer_id'])
        return self.reviews.find_by_id_for_update(conn,review_id)

    def update_review(self, review_id, user, data, ip_address=None):
        conn = self.connection_factory()
        try:
            review = self._lock_review(conn, review_id)
            if review is None:
                raise ServiceError(404, f"Review id {review_id} not found.")
            if review["reviewer_id"] != user["user_id"]:
                raise ServiceError(403, "You can only edit reviews you wrote yourself.")
            if review["status"] in {"DELETED","ARCHIVED"}:
                raise ServiceError(409, "รีวิวนี้ถูกลบหรือเก็บเป็นประวัติแล้ว ไม่สามารถแก้ไขได้")
            self._validate_tags(conn, data.tag_ids)
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
            review = self._lock_review(conn, review_id)
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
            review = self.reviews.find_by_id_for_update(conn, review_id)
            self._require_active(review)
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
            self._require_active(self.reviews.find_by_id_for_update(conn, review_id))
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
            self._require_active(self.reviews.find_by_id(conn, review_id))
            return {"comments": self.reviews.list_comments(conn, review_id)}
        finally:
            conn.close()

    def add_comment(self, review_id, user, content):
        content = content.strip()
        if not content or len(content) > 2000:
            raise ServiceError(422, "Comment must contain between 1 and 2000 characters.")
        conn = self.connection_factory()
        try:
            review = self.reviews.find_by_id_for_update(conn, review_id)
            self._require_active(review)
            created = self.reviews.add_comment(conn, review_id, user["user_id"], content)
            conn.commit()
            return {
                "comment_id": created["comment_id"], "review_id": review_id,
                "author_id": user["user_id"], "author_name": user.get("display_name") or user.get("username"),
                "author_avatar": user.get("avatar_url"), "content": content,
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
            review = self._lock_review(conn, review_id)
            self._require_active(review)
            if review["reviewer_id"] == user["user_id"]:
                raise ServiceError(409, "You cannot report your own review.")
            report_id = self.reviews.add_report(conn, review_id, user["user_id"])
            if report_id is None:
                raise ServiceError(409, "You have already reported this review.")
            updated = self.reviews.increment_report_count(conn, review_id, self.REPORT_HIDE_THRESHOLD)
            if updated['status']=='HIDDEN': self.quotas.record_hide(conn,review,'review')
            self.audit.create(conn, user["user_id"], "FLAG_REPORT", review_id, ip_address)
            conn.commit()
            auto_hidden = updated["status"] == "HIDDEN" and review["status"] != "HIDDEN"
            return {
                "report_id": report_id, "review_id": review_id,
                "report_count": updated["report_count"], "status": updated["status"],
                "auto_hidden": auto_hidden,
                "message": "Review hidden after reports from five accounts." if auto_hidden else "Report submitted. Thank you.",
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
