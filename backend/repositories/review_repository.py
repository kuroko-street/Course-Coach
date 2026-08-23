from db import dict_cursor


REVIEW_FIELDS = """
    r.review_id, r.course_id, r.reviewer_id, r.content,
    r.academic_year, r.semester, r.section,
    r.rating_satisfaction, r.rating_difficulty, r.rating_workload,
    r.rating_content, r.rating_teaching, r.rating_exam,
    r.report_count, r.status, r.created_at, r.edited_at
"""


class ReviewRepository:
    def find_by_id(self, conn, review_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                f"SELECT {REVIEW_FIELDS} FROM reviews r WHERE r.review_id = %s;",
                (review_id,),
            )
            return cur.fetchone()

    def course_exists(self, conn, course_id):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT course_id FROM courses WHERE course_id = %s;", (course_id,))
            return cur.fetchone() is not None

    def find_by_id_for_update(self, conn, review_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                f"SELECT {REVIEW_FIELDS} FROM reviews r WHERE r.review_id = %s FOR UPDATE;",
                (review_id,),
            )
            return cur.fetchone()

    def create(self, conn, reviewer_id, data):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO reviews
                    (course_id, reviewer_id, content, academic_year, semester, section,
                     rating_satisfaction, rating_difficulty, rating_workload,
                     rating_content, rating_teaching, rating_exam)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING review_id;
                """,
                (
                    data.course_id, reviewer_id, data.content, data.academic_year,
                    data.semester, data.section, data.rating_satisfaction,
                    data.rating_difficulty, data.rating_workload, data.rating_content,
                    data.rating_teaching, data.rating_exam,
                ),
            )
            return cur.fetchone()["review_id"]

    def update(self, conn, review_id, data):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE reviews
                SET content = %s, academic_year = %s, semester = %s, section = %s,
                    rating_satisfaction = %s, rating_difficulty = %s,
                    rating_workload = %s, rating_content = %s,
                    rating_teaching = %s, rating_exam = %s, edited_at = NOW()
                WHERE review_id = %s;
                """,
                (
                    data.content, data.academic_year, data.semester, data.section,
                    data.rating_satisfaction, data.rating_difficulty,
                    data.rating_workload, data.rating_content, data.rating_teaching,
                    data.rating_exam, review_id,
                ),
            )

    def soft_delete(self, conn, review_id):
        with dict_cursor(conn) as cur:
            cur.execute("UPDATE reviews SET status = 'DELETED' WHERE review_id = %s;", (review_id,))

    def exists(self, conn, review_id):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT review_id FROM reviews WHERE review_id = %s;", (review_id,))
            return cur.fetchone() is not None

    def add_like(self, conn, review_id, user_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO review_likes (review_id, user_id)
                VALUES (%s, %s)
                ON CONFLICT (review_id, user_id) DO NOTHING;
                """,
                (review_id, user_id),
            )

    def remove_like(self, conn, review_id, user_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                "DELETE FROM review_likes WHERE review_id = %s AND user_id = %s;",
                (review_id, user_id),
            )

    def count_likes(self, conn, review_id):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT COUNT(*) AS n FROM review_likes WHERE review_id = %s;", (review_id,))
            return cur.fetchone()["n"]

    def list_comments(self, conn, review_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT rc.comment_id, rc.review_id, rc.content, rc.created_at,
                       u.user_id AS author_id, u.username AS author_name,
                       u.avatar_url AS author_avatar
                FROM review_comments rc
                JOIN users u ON u.user_id = rc.user_id
                WHERE rc.review_id = %s
                ORDER BY rc.created_at ASC, rc.comment_id ASC;
                """,
                (review_id,),
            )
            return cur.fetchall()

    def add_comment(self, conn, review_id, user_id, content):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO review_comments (review_id, user_id, content)
                VALUES (%s, %s, %s)
                RETURNING comment_id, created_at;
                """,
                (review_id, user_id, content),
            )
            return cur.fetchone()

    def add_report(self, conn, review_id, reporter_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO review_reports (review_id, reporter_id)
                VALUES (%s, %s) RETURNING report_id;
                """,
                (review_id, reporter_id),
            )
            return cur.fetchone()["report_id"]

    def increment_report_count(self, conn, review_id, threshold):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE reviews
                SET report_count = report_count + 1,
                    status = CASE
                        WHEN report_count + 1 >= %s THEN 'HIDDEN'::review_status
                        ELSE status
                    END
                WHERE review_id = %s
                RETURNING report_count, status;
                """,
                (threshold, review_id),
            )
            return cur.fetchone()
