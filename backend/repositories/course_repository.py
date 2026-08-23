from db import dict_cursor
from repositories.review_repository import REVIEW_FIELDS


class CourseRepository:
    def list_departments(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT DISTINCT department FROM courses ORDER BY department;")
            return [row["department"] for row in cur.fetchall()]

    def list_tags(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT tag_id, tag_name FROM tags ORDER BY tag_name;")
            return cur.fetchall()

    def search(self, conn, search=None, department=None):
        clauses, params = [], []
        if search and search.strip():
            pattern = f"%{search.strip()}%"
            clauses.append("(c.course_code ILIKE %s OR c.course_name ILIKE %s OR t.tag_name ILIKE %s)")
            params.extend([pattern, pattern, pattern])
        if department and department.strip():
            clauses.append("c.department = %s")
            params.append(department.strip())
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with dict_cursor(conn) as cur:
            cur.execute(
                f"""
                SELECT c.course_id, c.course_code, c.course_name, c.department,
                       COUNT(DISTINCT r.review_id) AS review_count,
                       (SELECT ROUND(AVG(r2.rating_satisfaction)::numeric, 1)
                        FROM reviews r2 WHERE r2.course_id = c.course_id
                        AND r2.status = 'ACTIVE') AS avg_rating,
                       ARRAY_REMOVE(ARRAY_AGG(DISTINCT t.tag_name), NULL) AS tags
                FROM courses c
                LEFT JOIN reviews r ON r.course_id = c.course_id AND r.status = 'ACTIVE'
                LEFT JOIN course_tags ct ON ct.course_id = c.course_id
                LEFT JOIN tags t ON t.tag_id = ct.tag_id
                {where}
                GROUP BY c.course_id, c.course_code, c.course_name, c.department
                ORDER BY c.course_code;
                """,
                params,
            )
            return cur.fetchall()

    def get_detail(self, conn, course_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT course_id, course_code, course_name, department,
                       prerequisites, syllabus, teaching_format, workload, assessment
                FROM courses WHERE course_id = %s;
                """,
                (course_id,),
            )
            course = cur.fetchone()
            if course is None:
                return None
            cur.execute(
                """
                SELECT i.instructor_id, i.name, i.bio, i.teaching_style, i.grading_style
                FROM instructors i
                JOIN course_instructors ci ON ci.instructor_id = i.instructor_id
                WHERE ci.course_id = %s ORDER BY i.name;
                """,
                (course_id,),
            )
            instructors = cur.fetchall()
            cur.execute(
                """
                SELECT t.tag_id, t.tag_name FROM tags t
                JOIN course_tags ct ON ct.tag_id = t.tag_id
                WHERE ct.course_id = %s ORDER BY t.tag_name;
                """,
                (course_id,),
            )
            tags = cur.fetchall()
            cur.execute(
                """
                SELECT ROUND(AVG(rating_satisfaction)::numeric, 2) AS avg_satisfaction,
                       ROUND(AVG(rating_difficulty)::numeric, 2) AS avg_difficulty,
                       ROUND(AVG(rating_workload)::numeric, 2) AS avg_workload,
                       ROUND(AVG(rating_content)::numeric, 2) AS avg_content,
                       ROUND(AVG(rating_teaching)::numeric, 2) AS avg_teaching,
                       ROUND(AVG(rating_exam)::numeric, 2) AS avg_exam,
                       COUNT(*) AS review_count
                FROM reviews WHERE course_id = %s AND status = 'ACTIVE';
                """,
                (course_id,),
            )
            averages = cur.fetchone()
        return course, instructors, tags, averages

    def list_reviews(self, conn, course_id, caller_id=None):
        with dict_cursor(conn) as cur:
            cur.execute(
                f"""
                SELECT {REVIEW_FIELDS}, c.course_code, c.course_name, c.department,
                       u.username AS reviewer_name, u.avatar_url AS reviewer_avatar,
                       (SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = r.review_id) AS like_count,
                       (SELECT COUNT(*) FROM review_comments rc WHERE rc.review_id = r.review_id) AS comment_count,
                       EXISTS(SELECT 1 FROM review_likes rl2
                              WHERE rl2.review_id = r.review_id AND rl2.user_id = %s) AS liked_by_me
                FROM reviews r
                JOIN courses c ON c.course_id = r.course_id
                JOIN users u ON u.user_id = r.reviewer_id
                WHERE r.course_id = %s AND r.status = 'ACTIVE'
                ORDER BY r.created_at DESC, r.review_id DESC;
                """,
                (caller_id, course_id),
            )
            return cur.fetchall()

    def list_my_enrollments(self, conn, user_id, course_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT e.enrollment_id, e.academic_year, e.semester, e.section,
                       EXISTS(SELECT 1 FROM reviews r
                              WHERE r.course_id = e.course_id AND r.reviewer_id = e.student_id
                              AND r.academic_year = e.academic_year AND r.semester = e.semester
                              AND r.section = e.section AND r.status <> 'DELETED') AS reviewed
                FROM enrollments e
                WHERE e.student_id = %s AND e.course_id = %s
                ORDER BY e.academic_year DESC, e.semester DESC, e.section;
                """,
                (user_id, course_id),
            )
            return cur.fetchall()

    def rankings(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT c.course_id, c.course_code, c.course_name, c.department,
                       (SELECT COUNT(*) FROM reviews r WHERE r.course_id = c.course_id AND r.status = 'ACTIVE') AS review_count,
                       (SELECT ROUND(AVG(r.rating_satisfaction)::numeric, 2) FROM reviews r
                        WHERE r.course_id = c.course_id AND r.status = 'ACTIVE') AS avg_satisfaction,
                       (SELECT COUNT(*) FROM review_likes rl JOIN reviews r ON r.review_id = rl.review_id
                        WHERE r.course_id = c.course_id AND r.status = 'ACTIVE') AS total_likes
                FROM courses c
                ORDER BY avg_satisfaction DESC NULLS LAST, review_count DESC, c.course_code;
                """
            )
            return cur.fetchall()
