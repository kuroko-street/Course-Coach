from db import dict_cursor


class EnrollmentRepository:
    def exists(self, conn, student_id, course_id, academic_year, semester, section):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT 1 FROM enrollments
                WHERE student_id = %s AND course_id = %s
                  AND academic_year = %s AND semester = %s AND section = %s;
                """,
                (student_id, course_id, academic_year, semester, section),
            )
            return cur.fetchone() is not None
