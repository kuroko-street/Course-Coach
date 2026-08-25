from db import dict_cursor


class CourseManagementRepository:
    def list_instructors(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT instructor_id, name, bio, teaching_style, grading_style
                FROM instructors
                ORDER BY name, instructor_id;
                """
            )
            return cur.fetchall()

    def find_instructor_by_name(self, conn, name):
        with dict_cursor(conn) as cur:
            cur.execute(
                "SELECT instructor_id, name FROM instructors WHERE LOWER(name) = LOWER(%s) ORDER BY instructor_id LIMIT 1;",
                (name,),
            )
            return cur.fetchone()

    def create_instructor(self, conn, name):
        with dict_cursor(conn) as cur:
            cur.execute(
                "INSERT INTO instructors (name) VALUES (%s) RETURNING instructor_id, name, bio, teaching_style, grading_style;",
                (name,),
            )
            return cur.fetchone()

    def list_courses(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT c.course_id, c.course_code, c.course_name, c.department, c.is_active,
                       c.prerequisites, c.syllabus, c.teaching_format, c.workload, c.assessment,
                       COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                           'curriculum_id', cu.curriculum_id,
                           'curriculum_name', cu.curriculum_name,
                           'academic_year', cu.academic_year,
                           'recommended_year', cc.recommended_year,
                           'recommended_semester', cc.recommended_semester,
                           'requirement_type', cc.requirement_type
                       )) FILTER (WHERE cu.curriculum_id IS NOT NULL), '[]'::jsonb)
                       AS curriculum_mappings,
                       COALESCE(array_agg(DISTINCT t.tag_name) FILTER (WHERE t.tag_name IS NOT NULL), '{}') AS tags,
                       ARRAY(SELECT i.name FROM instructors i JOIN course_instructors ci
                             ON ci.instructor_id = i.instructor_id
                             WHERE ci.course_id = c.course_id ORDER BY i.name) AS instructors
                FROM courses c
                LEFT JOIN curriculum_courses cc ON cc.course_id = c.course_id
                LEFT JOIN curriculums cu ON cu.curriculum_id = cc.curriculum_id
                LEFT JOIN course_tags ct ON ct.course_id = c.course_id
                LEFT JOIN tags t ON t.tag_id = ct.tag_id
                GROUP BY c.course_id
                ORDER BY c.is_active DESC, c.course_code;
                """
            )
            return cur.fetchall()

    def list_curriculums(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT curriculum_id, curriculum_name, academic_year, department, degree_level, is_active
                FROM curriculums WHERE is_active = TRUE
                ORDER BY academic_year DESC, curriculum_name;
                """
            )
            return cur.fetchall()

    def create_curriculum(self, conn, data):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO curriculums (curriculum_name, academic_year, department, degree_level)
                VALUES (%s, %s, %s, %s)
                RETURNING curriculum_id, curriculum_name, academic_year, department, degree_level, is_active;
                """,
                (data.curriculum_name.strip(), data.academic_year, data.department.strip(), data.degree_level.strip()),
            )
            return cur.fetchone()

    def find_or_create_curriculum(self, conn, curriculum_name, academic_year, department):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO curriculums (curriculum_name, academic_year, department)
                VALUES (%s, %s, %s)
                ON CONFLICT (curriculum_name, academic_year)
                DO UPDATE SET department = EXCLUDED.department
                RETURNING curriculum_id;
                """,
                (curriculum_name, academic_year, department),
            )
            return cur.fetchone()["curriculum_id"]

    def find_course_by_code_for_update(self, conn, course_code):
        with dict_cursor(conn) as cur:
            cur.execute(
                "SELECT course_id FROM courses WHERE course_code = %s FOR UPDATE;",
                (course_code,),
            )
            return cur.fetchone()

    def get_import_state(self, conn, course_code):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT course_id, course_code, course_name, department, prerequisites, syllabus
                FROM courses WHERE course_code = %s;
                """,
                (course_code,),
            )
            course = cur.fetchone()
            if course is None:
                return None
            cur.execute(
                """
                SELECT cu.curriculum_name, cu.academic_year, cc.recommended_year,
                       cc.recommended_semester, cc.requirement_type
                FROM curriculum_courses cc
                JOIN curriculums cu ON cu.curriculum_id = cc.curriculum_id
                WHERE cc.course_id = %s
                ORDER BY cu.curriculum_id;
                """,
                (course["course_id"],),
            )
            return course, cur.fetchall()

    def create_course(self, conn, data):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO courses
                    (course_code, course_name, department, prerequisites, syllabus, teaching_format, workload, assessment)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING course_id;
                """,
                self._course_values(data),
            )
            return cur.fetchone()["course_id"]

    def update_course(self, conn, course_id, data):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE courses SET course_code=%s, course_name=%s, department=%s,
                    prerequisites=%s, syllabus=%s, teaching_format=%s, workload=%s, assessment=%s
                WHERE course_id=%s RETURNING course_id;
                """,
                (*self._course_values(data), course_id),
            )
            return cur.fetchone()

    def update_imported_course(self, conn, course_id, data):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE courses SET course_name=%s, department=%s,
                    prerequisites=COALESCE(%s, prerequisites), syllabus=COALESCE(%s, syllabus)
                WHERE course_id=%s RETURNING course_id;
                """,
                (data.course_name.strip(), data.department.strip(), data.prerequisites, data.syllabus, course_id),
            )
            return cur.fetchone()

    def lock_course(self, conn, course_id):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT course_id FROM courses WHERE course_id = %s FOR UPDATE;", (course_id,))
            return cur.fetchone()

    def set_status(self, conn, course_id, is_active):
        with dict_cursor(conn) as cur:
            cur.execute(
                "UPDATE courses SET is_active=%s WHERE course_id=%s RETURNING course_id, is_active;",
                (is_active, course_id),
            )
            return cur.fetchone()

    def replace_mappings(self, conn, course_id, mappings):
        with dict_cursor(conn) as cur:
            cur.execute("DELETE FROM curriculum_courses WHERE course_id = %s;", (course_id,))
            for mapping in mappings:
                cur.execute(
                    """
                    INSERT INTO curriculum_courses
                        (curriculum_id, course_id, recommended_year, recommended_semester, requirement_type)
                    VALUES (%s, %s, %s, %s, %s);
                    """,
                    (mapping.curriculum_id, course_id, mapping.recommended_year,
                     mapping.recommended_semester.strip(), mapping.requirement_type),
                )

    def replace_tags(self, conn, course_id, tag_names):
        with dict_cursor(conn) as cur:
            cur.execute("DELETE FROM course_tags WHERE course_id = %s;", (course_id,))
            for tag_name in tag_names:
                cur.execute(
                    """
                    INSERT INTO tags (tag_name) VALUES (%s)
                    ON CONFLICT (tag_name) DO UPDATE SET tag_name = EXCLUDED.tag_name
                    RETURNING tag_id;
                    """,
                    (tag_name,),
                )
                tag_id = cur.fetchone()["tag_id"]
                cur.execute(
                    "INSERT INTO course_tags (course_id, tag_id) VALUES (%s, %s);",
                    (course_id, tag_id),
                )

    def replace_instructors(self, conn, course_id, instructor_names):
        with dict_cursor(conn) as cur:
            cur.execute("DELETE FROM course_instructors WHERE course_id = %s;", (course_id,))
            for name in instructor_names:
                cur.execute("SELECT instructor_id FROM instructors WHERE name = %s ORDER BY instructor_id LIMIT 1;", (name,))
                existing = cur.fetchone()
                if existing:
                    instructor_id = existing["instructor_id"]
                else:
                    cur.execute("INSERT INTO instructors (name) VALUES (%s) RETURNING instructor_id;", (name,))
                    instructor_id = cur.fetchone()["instructor_id"]
                cur.execute(
                    "INSERT INTO course_instructors (course_id, instructor_id) VALUES (%s, %s);",
                    (course_id, instructor_id),
                )

    def curriculums_exist(self, conn, curriculum_ids):
        if not curriculum_ids:
            return True
        with dict_cursor(conn) as cur:
            cur.execute(
                "SELECT COUNT(*) AS n FROM curriculums WHERE is_active=TRUE AND curriculum_id = ANY(%s);",
                (curriculum_ids,),
            )
            return cur.fetchone()["n"] == len(set(curriculum_ids))

    @staticmethod
    def _course_values(data):
        return (
            data.course_code.strip().upper(), data.course_name.strip(), data.department.strip(),
            data.prerequisites or None, data.syllabus or None, data.teaching_format or None,
            data.workload or None, data.assessment or None,
        )
