from db import dict_cursor


class ContentCommentRepository:
    """Shared SQL; identifiers come only from this server-side allowlist."""

    def __init__(self, kind):
        configurations = {
            "review": ("review_comments", "review_comment_reports", "review_id"),
            "file": ("summary_file_comments", "summary_file_comment_reports", "file_id"),
        }
        self.table, self.report_table, self.parent_key = configurations[kind]

    def find_for_update(self, conn, parent_id, comment_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                f"SELECT comment_id, {self.parent_key}, user_id, content, status, "
                f"report_count FROM {self.table} "
                f"WHERE comment_id = %s AND {self.parent_key} = %s FOR UPDATE;",
                (comment_id, parent_id),
            )
            return cur.fetchone()

    def add_report(self, conn, comment_id, user_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                f"INSERT INTO {self.report_table} (comment_id, reporter_id) VALUES (%s, %s) "
                "ON CONFLICT (comment_id, reporter_id) DO NOTHING RETURNING report_id;",
                (comment_id, user_id),
            )
            row = cur.fetchone()
            return row["report_id"] if row else None

    def increment_report_count(self, conn, comment_id, threshold):
        with dict_cursor(conn) as cur:
            cur.execute(
                f"UPDATE {self.table} SET report_count = report_count + 1, "
                "status = CASE WHEN report_count + 1 >= %s THEN 'HIDDEN'::review_status "
                "ELSE status END WHERE comment_id = %s RETURNING report_count, status;",
                (threshold, comment_id),
            )
            return cur.fetchone()

    def update(self, conn, comment_id, content):
        with dict_cursor(conn) as cur:
            cur.execute(
                f"UPDATE {self.table} SET content = %s, edited_at = NOW() WHERE comment_id = %s;",
                (content, comment_id),
            )

    def soft_delete(self, conn, comment_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                f"UPDATE {self.table} SET status = 'DELETED', edited_at = NOW() WHERE comment_id = %s;",
                (comment_id,),
            )
