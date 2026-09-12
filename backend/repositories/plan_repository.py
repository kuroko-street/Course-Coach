from db import dict_cursor


class PlanRepository:
    def course_exists(self, conn, course_id):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT course_id FROM courses WHERE course_id = %s AND is_active AND merged_into_course_id IS NULL FOR SHARE;", (course_id,))
            return cur.fetchone() is not None

    def create(self, conn, student_id, plan_name):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO study_plans (student_id, plan_name)
                VALUES (%s, %s) RETURNING plan_id;
                """,
                (student_id, plan_name),
            )
            return cur.fetchone()["plan_id"]

    def list_for_student(self, conn, student_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT p.plan_id, p.plan_name, p.created_at, p.updated_at,
                       COUNT(i.item_id) AS item_count,
                       COALESCE((SELECT SUM(x.credits) FROM (
                           SELECT i2.academic_year,i2.semester,c2.code_normalized,MAX(c2.credits) AS credits
                           FROM study_plan_items i2 JOIN courses c2 ON c2.course_id=i2.course_id
                           WHERE i2.plan_id=p.plan_id GROUP BY i2.academic_year,i2.semester,c2.code_normalized
                       ) x), 0) AS total_credits
                FROM study_plans p
                LEFT JOIN study_plan_items i ON i.plan_id = p.plan_id
                LEFT JOIN courses c ON c.course_id = i.course_id
                WHERE p.student_id = %s
                GROUP BY p.plan_id
                ORDER BY p.updated_at DESC;
                """,
                (student_id,),
            )
            return cur.fetchall()

    def find_by_id(self, conn, plan_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                "SELECT plan_id, student_id, plan_name, created_at, updated_at FROM study_plans WHERE plan_id = %s FOR UPDATE;",
                (plan_id,),
            )
            return cur.fetchone()

    def rename(self, conn, plan_id, plan_name):
        with dict_cursor(conn) as cur:
            cur.execute(
                "UPDATE study_plans SET plan_name = %s, updated_at = NOW() WHERE plan_id = %s;",
                (plan_name, plan_id),
            )

    def touch(self, conn, plan_id):
        with dict_cursor(conn) as cur:
            cur.execute("UPDATE study_plans SET updated_at = NOW() WHERE plan_id = %s;", (plan_id,))

    def delete(self, conn, plan_id):
        with dict_cursor(conn) as cur:
            cur.execute("DELETE FROM study_plan_items WHERE plan_id = %s;", (plan_id,))
            cur.execute("DELETE FROM study_plans WHERE plan_id = %s;", (plan_id,))

    def item_exists_for_course(self, conn, plan_id, course_id, academic_year, semester, excluded_id=0):
        with dict_cursor(conn) as cur:
            cur.execute(
                "SELECT 1 FROM study_plan_items WHERE plan_id = %s AND course_id = %s AND academic_year=%s AND semester=%s AND item_id<>%s;",
                (plan_id, course_id, academic_year, semester, excluded_id),
            )
            return cur.fetchone() is not None

    def add_item(self, conn, plan_id, course_id, academic_year, semester):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO study_plan_items (plan_id, course_id, academic_year, semester)
                VALUES (%s, %s, %s, %s) RETURNING item_id;
                """,
                (plan_id, course_id, academic_year, semester),
            )
            return cur.fetchone()["item_id"]

    def find_item(self, conn, item_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                "SELECT item_id, plan_id, course_id, academic_year, semester FROM study_plan_items WHERE item_id = %s;",
                (item_id,),
            )
            return cur.fetchone()

    def move_item(self, conn, item_id, academic_year, semester):
        with dict_cursor(conn) as cur:
            cur.execute(
                "UPDATE study_plan_items SET academic_year = %s, semester = %s WHERE item_id = %s;",
                (academic_year, semester, item_id),
            )

    def delete_item(self, conn, item_id):
        with dict_cursor(conn) as cur:
            cur.execute("DELETE FROM study_plan_items WHERE item_id = %s;", (item_id,))

    def list_items(self, conn, plan_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT i.item_id, i.course_id, i.academic_year, i.semester, i.added_at,
                       c.course_code, c.code_normalized, c.course_name, c.credits,
                       c.academic_year AS source_academic_year,c.semester AS source_semester,c.is_active,
                       (SELECT string_agg(ins.name, ', ' ORDER BY ins.name) FROM course_instructors ci JOIN instructors ins USING(instructor_id) WHERE ci.course_id=c.course_id) AS instructor_names,
                       (SELECT ROUND(AVG(r.rating_satisfaction)::numeric, 1) FROM reviews r
                        WHERE r.course_id = c.course_id AND r.status = 'ACTIVE') AS avg_satisfaction,
                       (SELECT ROUND(AVG(r.rating_recommendation)::numeric, 1) FROM reviews r
                        WHERE r.course_id = c.course_id AND r.status = 'ACTIVE') AS avg_recommendation,
                       (SELECT ROUND(AVG(r.rating_workload)::numeric, 1) FROM reviews r
                        WHERE r.course_id = c.course_id AND r.status = 'ACTIVE') AS avg_workload
                FROM study_plan_items i
                JOIN courses c ON c.course_id = i.course_id
                WHERE i.plan_id = %s
                ORDER BY i.academic_year, i.semester, c.course_code;
                """,
                (plan_id,),
            )
            return cur.fetchall()

    def prerequisites_for(self, conn, course_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT p.prerequisite_course_id AS course_id, c.course_code, c.course_name
                FROM course_prerequisites p
                JOIN courses c ON c.course_id = p.prerequisite_course_id
                WHERE p.course_id = %s;
                """,
                (course_id,),
            )
            return cur.fetchall()

    def completed_course_ids(self, conn, student_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                "SELECT DISTINCT course_id FROM enrollments WHERE student_id = %s;",
                (student_id,),
            )
            return {row["course_id"] for row in cur.fetchall()}
