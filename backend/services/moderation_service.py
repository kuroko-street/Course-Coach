from db import get_connection
from pathlib import Path
from domain.errors import ServiceError
from repositories.audit_log_repository import AuditLogRepository
from repositories.moderation_repository import ModerationRepository
from repositories.summary_file_repository import SummaryFileRepository


class ModerationService:
    def __init__(self, connection_factory=get_connection):
        self.connection_factory = connection_factory
        self.moderation = ModerationRepository()
        self.audit = AuditLogRepository()
        self.summary_files = SummaryFileRepository()

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

    def list_hidden_summary_files(self):
        conn = self.connection_factory()
        try:
            return {"files": self.summary_files.list_hidden_for_moderation(conn)}
        finally:
            conn.close()

    def apply_summary_file_action(self, file_id, action, admin, ip_address=None):
        conn = self.connection_factory()
        try:
            row = self.summary_files.find_by_id(conn, file_id, lock=True)
            if row is None:
                raise ServiceError(404, f"Summary file id {file_id} not found.")
            if row["status"] != "HIDDEN":
                raise ServiceError(409, "Only a hidden summary file can be moderated.")
            updated = self.summary_files.moderate(conn, file_id, action)
            if action == "DELETE":
                self.summary_files.close_batch_if_empty(conn, updated["upload_batch_id"])
            self.audit.create(
                conn, admin["user_id"], "MODERATE_SUMMARY_FILE", file_id, ip_address,
            )
            conn.commit()
            return {
                "file_id": file_id,
                "action": action,
                "status": updated["status"],
                "report_count": updated["report_count"],
                "message": (
                    "Summary file restored and reports reset."
                    if action == "KEEP" else "Summary file deleted."
                ),
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def get_summary_file_download(self, file_id):
        conn = self.connection_factory()
        try:
            row = self.summary_files.find_by_id(conn, file_id)
        finally:
            conn.close()
        if row is None or row["status"] != "HIDDEN":
            raise ServiceError(404, f"Hidden summary file id {file_id} not found.")
        path = Path(row["stored_path"])
        if not path.is_file():
            raise ServiceError(404, "Stored summary file is missing.")
        return path, row["filename"], row["mime_type"]
