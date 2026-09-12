from db import dict_cursor


REVIEW_FIELDS = """
    r.review_id, r.course_id, r.reviewer_id, r.content,
    r.rating_satisfaction, r.rating_recommendation, r.rating_workload,
    r.rating_content, r.rating_teaching, r.rating_exam,
    r.report_count, r.status, r.created_at, r.edited_at
"""


class ReviewRepository:
    def find_by_id(self, conn, review_id):
        return self._find(conn, review_id, lock=False)

    def find_by_id_for_update(self, conn, review_id):
        return self._find(conn, review_id, lock=True)

    def _find(self, conn, review_id, lock):
        suffix = " FOR UPDATE OF r FOR SHARE OF c" if lock else ""
        with dict_cursor(conn) as cur:
            cur.execute(
                f"SELECT {REVIEW_FIELDS} FROM reviews r "
                "JOIN courses c ON c.course_id = r.course_id "
                "WHERE r.review_id = %s AND c.is_active = TRUE "
                f"AND c.merged_into_course_id IS NULL{suffix};",
                (review_id,),
            )
            return cur.fetchone()

    def course_exists(self, conn, course_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                "SELECT course_id FROM courses WHERE course_id = %s "
                "AND is_active = TRUE AND merged_into_course_id IS NULL FOR SHARE;",
                (course_id,),
            )
            return cur.fetchone() is not None

    def tags_by_ids(self, conn, tag_ids):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT tag_id, tag_name FROM tags WHERE tag_id = ANY(%s);", (tag_ids,))
            return cur.fetchall()

    def _replace_tags(self, conn, review_id, tag_ids):
        with dict_cursor(conn) as cur:
            cur.execute("DELETE FROM review_tags WHERE review_id = %s;", (review_id,))
            if tag_ids:
                cur.executemany(
                    "INSERT INTO review_tags (review_id, tag_id) VALUES (%s, %s);",
                    [(review_id, tag_id) for tag_id in tag_ids],
                )

    def create(self, conn, reviewer_id, data):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO reviews
                    (course_id, reviewer_id, content, rating_satisfaction,
                     rating_recommendation, rating_workload, rating_content,
                     rating_teaching, rating_exam)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING review_id;
                """,
                (data.course_id, reviewer_id, data.content, data.rating_satisfaction,
                 data.rating_recommendation, data.rating_workload, data.rating_content,
                 data.rating_teaching, data.rating_exam),
            )
            review_id = cur.fetchone()["review_id"]
        self._replace_tags(conn, review_id, data.tag_ids)
        return review_id

    def update(self, conn, review_id, data):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE reviews SET content = %s, rating_satisfaction = %s,
                    rating_recommendation = %s, rating_workload = %s, rating_content = %s,
                    rating_teaching = %s, rating_exam = %s, edited_at = NOW()
                WHERE review_id = %s;
                """,
                (data.content, data.rating_satisfaction, data.rating_recommendation,
                 data.rating_workload, data.rating_content, data.rating_teaching,
                 data.rating_exam, review_id),
            )
        self._replace_tags(conn, review_id, data.tag_ids)

    def soft_delete(self, conn, review_id):
        with dict_cursor(conn) as cur:
            cur.execute("UPDATE reviews SET status = 'DELETED' WHERE review_id = %s;", (review_id,))

    def exists(self, conn, review_id):
        return self.find_by_id(conn, review_id) is not None

    def add_like(self, conn, review_id, user_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                "INSERT INTO review_likes (review_id, user_id) VALUES (%s, %s) "
                "ON CONFLICT (review_id, user_id) DO NOTHING;", (review_id, user_id),
            )

    def remove_like(self, conn, review_id, user_id):
        with dict_cursor(conn) as cur:
            cur.execute("DELETE FROM review_likes WHERE review_id = %s AND user_id = %s;", (review_id, user_id))

    def count_likes(self, conn, review_id):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT COUNT(*) AS n FROM review_likes WHERE review_id = %s;", (review_id,))
            return cur.fetchone()["n"]

    def list_comments(self, conn, review_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT rc.comment_id, rc.review_id, rc.content, rc.created_at, rc.edited_at,
                       u.user_id AS author_id,
                       COALESCE(NULLIF(u.display_name, ''), u.username) AS author_name,
                       u.avatar_url AS author_avatar
                FROM review_comments rc JOIN reviews r ON r.review_id = rc.review_id
                JOIN courses c ON c.course_id = r.course_id
                JOIN users u ON u.user_id = rc.user_id
                WHERE rc.review_id = %s AND rc.status = 'ACTIVE' AND r.status = 'ACTIVE'
                  AND c.is_active = TRUE AND c.merged_into_course_id IS NULL
                ORDER BY rc.created_at ASC, rc.comment_id ASC;
                """, (review_id,),
            )
            return cur.fetchall()

    def add_comment(self, conn, review_id, user_id, content):
        with dict_cursor(conn) as cur:
            cur.execute(
                "INSERT INTO review_comments (review_id, user_id, content) VALUES (%s, %s, %s) "
                "RETURNING comment_id, created_at;", (review_id, user_id, content),
            )
            return cur.fetchone()

    def add_report(self, conn, review_id, reporter_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                "INSERT INTO review_reports (review_id, reporter_id) VALUES (%s, %s) "
                "ON CONFLICT (review_id, reporter_id) DO NOTHING RETURNING report_id;",
                (review_id, reporter_id),
            )
            report = cur.fetchone()
            return report["report_id"] if report else None

    def increment_report_count(self, conn, review_id, threshold):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE reviews SET report_count = report_count + 1,
                    status = CASE WHEN report_count + 1 >= %s THEN 'HIDDEN'::review_status ELSE status END
                WHERE review_id = %s RETURNING report_count, status;
                """, (threshold, review_id),
            )
            return cur.fetchone()
