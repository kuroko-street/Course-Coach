from db import get_connection
from domain.errors import ServiceError
from repositories.audit_log_repository import AuditLogRepository
from repositories.moderation_repository import ModerationRepository


class ModerationService:
    def __init__(self, connection_factory=get_connection):
        self.connection_factory = connection_factory
        self.moderation = ModerationRepository()
        self.audit = AuditLogRepository()

    def list_hidden_reviews(self):
        conn = self.connection_factory()
        try:
            return {"reviews": self.moderation.list_hidden(conn)}
        finally:
            conn.close()

    def report_summary(self):
        conn = self.connection_factory()
        try:
            return self.moderation.summary(conn)
        finally:
            conn.close()

    def apply_action(self, review_id, action, admin, ip_address=None):
        conn = self.connection_factory()
        try:
            if self.moderation.lock_review(conn, review_id) is None:
                raise ServiceError(404, f"Review id {review_id} not found.")
            updated = self.moderation.apply_action(conn, review_id, action)
            self.audit.create(conn, admin["user_id"], "MODERATE_REVIEW", review_id, ip_address)
            conn.commit()
            return {
                "review_id": review_id, "action": action,
                "status": updated["status"], "report_count": updated["report_count"],
                "message": "Review restored and report count reset." if action == "KEEP" else "Review deleted.",
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def list_audit_logs(self, limit):
        conn = self.connection_factory()
        try:
            return {"logs": self.audit.list_recent(conn, max(1, min(limit, 200)))}
        finally:
            conn.close()
