from db import dict_cursor


class StudentImportRepository:
    USER_FIELDS = """user_id, username, email, student_number, role,
                     google_sub IS NOT NULL AS google_linked"""

    def list_students(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT u.user_id, u.username, u.email, u.student_number,
                       (u.google_sub IS NOT NULL) AS google_linked,
                       COUNT(e.enrollment_id) AS enrollment_count
                FROM users u
                LEFT JOIN enrollments e ON e.student_id = u.user_id
                WHERE u.student_number IS NOT NULL AND u.role = 'STUDENT'
                GROUP BY u.user_id
                ORDER BY u.student_number;
                """
            )
            return cur.fetchall()

    def identity_matches(self, conn, student_number, email, lock=False):
        suffix = " FOR UPDATE" if lock else ""
        with dict_cursor(conn) as cur:
            cur.execute(
                f"SELECT {self.USER_FIELDS} FROM users "
                f"WHERE student_number = %s{suffix};",
                (student_number,),
            )
            by_number = cur.fetchone()
            cur.execute(
                f"SELECT {self.USER_FIELDS} FROM users "
                f"WHERE LOWER(email) = LOWER(%s){suffix};",
                (email,),
            )
            by_email = cur.fetchone()
            return by_number, by_email

    def find_course(self, conn, course_code):
        with dict_cursor(conn) as cur:
            cur.execute(
                "SELECT course_id, course_code, course_name, is_active "
                "FROM courses WHERE UPPER(course_code) = UPPER(%s);",
                (course_code,),
            )
            return cur.fetchone()

    def enrollment_exists(self, conn, user_id, course_id, academic_year, semester, section):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT enrollment_id FROM enrollments
                WHERE student_id = %s AND course_id = %s AND academic_year = %s
                  AND semester = %s AND section = %s;
                """,
                (user_id, course_id, academic_year, semester, section),
            )
            return cur.fetchone()

    def attach_student_number(self, conn, user_id, student_number):
        with dict_cursor(conn) as cur:
            cur.execute(
                "UPDATE users SET student_number = %s WHERE user_id = %s "
                f"RETURNING {self.USER_FIELDS};",
                (student_number, user_id),
            )
            return cur.fetchone()

    def create_student(self, conn, student_number, email):
        base = student_number
        username = base
        suffix = 1
        with dict_cursor(conn) as cur:
            while True:
                cur.execute("SELECT 1 FROM users WHERE username = %s;", (username,))
                if cur.fetchone() is None:
                    break
                suffix += 1
                username = f"{base}-{suffix}"
            cur.execute(
                f"""
                INSERT INTO users (username, email, student_number, role, is_mock)
                VALUES (%s, %s, %s, 'STUDENT', FALSE)
                RETURNING {self.USER_FIELDS};
                """,
                (username, email, student_number),
            )
            return cur.fetchone()

    def create_enrollment(self, conn, user_id, course_id, academic_year, semester, section):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO enrollments
                    (student_id, course_id, academic_year, semester, section)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (student_id, course_id, academic_year, semester, section)
                DO NOTHING
                RETURNING enrollment_id;
                """,
                (user_id, course_id, academic_year, semester, section),
            )
            return cur.fetchone()
