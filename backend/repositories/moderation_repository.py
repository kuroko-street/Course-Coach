from db import dict_cursor


class ModerationRepository:
    def summary(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE status = 'HIDDEN') AS pending_count,
                    (SELECT COUNT(*) FROM audit_logs WHERE action = 'MODERATE_REVIEW') AS reviewed_count
                FROM reviews;
                """
            )
            return cur.fetchone()

    def list_hidden(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT r.review_id, r.content, r.academic_year, r.semester, r.section,
                       r.report_count, r.status, r.created_at, c.course_id,
                       c.course_code, c.course_name, c.department,
                       COALESCE(NULLIF(u.display_name, ''), u.username) AS reviewer_name,
                       (SELECT MAX(reported_at) FROM review_reports rr
                        WHERE rr.review_id = r.review_id) AS last_reported_at
                FROM reviews r
                JOIN courses c ON c.course_id = r.course_id
                JOIN users u ON u.user_id = r.reviewer_id
                WHERE r.status = 'HIDDEN'
                ORDER BY r.report_count DESC, r.review_id;
                """
            )
            return cur.fetchall()

    def lock_review(self, conn, review_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                "SELECT review_id, status FROM reviews WHERE review_id = %s FOR UPDATE;",
                (review_id,),
            )
            return cur.fetchone()

    def apply_action(self, conn, review_id, action):
        with dict_cursor(conn) as cur:
            if action == "KEEP":
                cur.execute(
                    """
                    UPDATE reviews SET status = 'ACTIVE', report_count = 0
                    WHERE review_id = %s RETURNING status, report_count;
                    """,
                    (review_id,),
                )
            else:
                cur.execute(
                    """
                    UPDATE reviews SET status = 'DELETED'
                    WHERE review_id = %s RETURNING status, report_count;
                    """,
                    (review_id,),
                )
            return cur.fetchone()
