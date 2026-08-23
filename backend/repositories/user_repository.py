from db import dict_cursor


class UserRepository:
    def list_all(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT user_id, username, email, role, avatar_url,
                       is_report_blocked, blocked_until
                FROM users ORDER BY user_id;
                """
            )
            return cur.fetchall()

    def find_by_id(self, conn, user_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT user_id, username, email, role, avatar_url,
                       is_report_blocked, blocked_until
                FROM users WHERE user_id = %s;
                """,
                (user_id,),
            )
            return cur.fetchone()

    def get_profile(self, conn, user_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                "SELECT user_id, username, avatar_url, role FROM users WHERE user_id = %s;",
                (user_id,),
            )
            user = cur.fetchone()
            if user is None:
                return None
            cur.execute(
                """
                SELECT r.review_id, r.course_id, r.reviewer_id, r.content,
                       r.academic_year, r.semester, r.section,
                       r.rating_satisfaction, r.rating_difficulty, r.rating_workload,
                       r.rating_content, r.rating_teaching, r.rating_exam,
                       r.report_count, r.status, r.created_at, r.edited_at,
                       c.course_code, c.course_name,
                       (SELECT COUNT(*) FROM review_likes rl
                        WHERE rl.review_id = r.review_id) AS like_count
                FROM reviews r JOIN courses c ON c.course_id = r.course_id
                WHERE r.reviewer_id = %s AND r.status = 'ACTIVE'
                ORDER BY r.created_at DESC;
                """,
                (user_id,),
            )
            reviews = cur.fetchall()
            cur.execute(
                """
                SELECT ROUND(AVG(rating_satisfaction)::numeric, 2) AS avg_satisfaction,
                       ROUND(AVG(rating_difficulty)::numeric, 2) AS avg_difficulty,
                       ROUND(AVG(rating_workload)::numeric, 2) AS avg_workload,
                       ROUND(AVG(rating_content)::numeric, 2) AS avg_content,
                       ROUND(AVG(rating_teaching)::numeric, 2) AS avg_teaching,
                       ROUND(AVG(rating_exam)::numeric, 2) AS avg_exam
                FROM reviews WHERE reviewer_id = %s AND status = 'ACTIVE';
                """,
                (user_id,),
            )
            averages = cur.fetchone()
            cur.execute(
                """
                SELECT COUNT(*) AS total_likes FROM review_likes rl
                JOIN reviews r ON r.review_id = rl.review_id
                WHERE r.reviewer_id = %s AND r.status = 'ACTIVE';
                """,
                (user_id,),
            )
            total_likes = cur.fetchone()["total_likes"]
        return user, reviews, averages, total_likes

    def list_enrollments(self, conn, user_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT e.enrollment_id, e.course_id, c.course_code, c.course_name,
                       e.academic_year, e.semester, e.section, r.review_id,
                       (r.review_id IS NOT NULL) AS reviewed
                FROM enrollments e
                JOIN courses c ON c.course_id = e.course_id
                LEFT JOIN LATERAL (
                    SELECT review_id FROM reviews r
                    WHERE r.course_id = e.course_id
                      AND r.reviewer_id = e.student_id
                      AND r.academic_year = e.academic_year
                      AND r.semester = e.semester
                      AND r.section = e.section
                      AND r.status <> 'DELETED'
                    ORDER BY r.review_id DESC
                    LIMIT 1
                ) r ON TRUE
                WHERE e.student_id = %s
                ORDER BY e.academic_year DESC, e.semester DESC, c.course_code;
                """,
                (user_id,),
            )
            return cur.fetchall()
