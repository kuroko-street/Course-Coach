from domain.errors import ServiceError
from repositories.content_comment_repository import ContentCommentRepository


class ContentCommentService:
    """Each comment has its own five-account report state, below a visible parent."""

    REPORT_THRESHOLD = 5

    def __init__(self, kind, connection_factory, parent_lookup, audit_repository):
        self.kind = kind
        self.connection_factory = connection_factory
        self.parent_lookup = parent_lookup
        self.comments = ContentCommentRepository(kind)
        self.audit = audit_repository

    def _find(self, conn, parent_id, comment_id):
        # Lock the parent first; hiding it cannot race a new child interaction.
        parent = self.parent_lookup(conn, parent_id)
        if parent is None or parent["status"] != "ACTIVE":
            raise ServiceError(404, "Content not found.")
        comment = self.comments.find_for_update(conn, parent_id, comment_id)
        if comment is None or comment["status"] == "DELETED":
            raise ServiceError(404, "Comment not found.")
        return comment

    def report(self, parent_id, comment_id, user, ip_address=None):
        conn = self.connection_factory()
        try:
            comment = self._find(conn, parent_id, comment_id)
            if comment["status"] != "ACTIVE":
                raise ServiceError(404, "Comment not found.")
            if comment["user_id"] == user["user_id"]:
                raise ServiceError(409, "You cannot report your own comment.")
            report_id = self.comments.add_report(conn, comment_id, user["user_id"])
            if report_id is None:
                raise ServiceError(409, "You have already reported this comment.")
            state = self.comments.increment_report_count(conn, comment_id, self.REPORT_THRESHOLD)
            self.audit.create(conn, user["user_id"], f"REPORT_{self.kind.upper()}_COMMENT", comment_id, ip_address)
            conn.commit()
            return {"comment_id": comment_id, "report_id": report_id, **state,
                    "auto_hidden": state["status"] == "HIDDEN"}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def update(self, parent_id, comment_id, user, content):
        content = content.strip()
        if not content or len(content) > 2000:
            raise ServiceError(422, "Comment must contain between 1 and 2000 characters.")
        conn = self.connection_factory()
        try:
            comment = self._find(conn, parent_id, comment_id)
            if comment["user_id"] != user["user_id"]:
                raise ServiceError(403, "You can only edit your own comment.")
            self.comments.update(conn, comment_id, content)
            conn.commit()
            # Deliberately preserve HIDDEN; edits never clear report history.
            return {"comment_id": comment_id, "content": content, "status": comment["status"]}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def delete(self, parent_id, comment_id, user):
        conn = self.connection_factory()
        try:
            comment = self._find(conn, parent_id, comment_id)
            if comment["user_id"] != user["user_id"]:
                raise ServiceError(403, "You can only delete your own comment.")
            self.comments.soft_delete(conn, comment_id)
            conn.commit()
            return {"comment_id": comment_id, "status": "DELETED"}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
