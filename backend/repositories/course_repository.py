import re

from db import dict_cursor
from repositories.review_repository import REVIEW_FIELDS


class CourseRepository:
    _ADVANCED_QUERY = re.compile(r'(^|\s)(OR\b|-) |"', re.IGNORECASE | re.VERBOSE)

    @classmethod
    def _plain_terms(cls, query):
        """Return safe terms for prefix/partial matching.

        PostgreSQL's web-search parser remains responsible for advanced
        syntax (OR, quoted phrases and exclusions).  Plain user input gets
        the friendlier prefix and every-term fallback used by type-ahead.
        Only Unicode word characters survive, so the generated tsquery can
        never contain operators supplied by the caller.
        """
        if not query or cls._ADVANCED_QUERY.search(query):
            return []
        return re.findall(r"[^\W_]+", query.casefold(), flags=re.UNICODE)

    def list_departments(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT DISTINCT department FROM courses ORDER BY department;")
            return [row["department"] for row in cur.fetchall()]

    def list_tags(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT tag_id, tag_name FROM tags ORDER BY tag_name;")
            return cur.fetchall()

    def search(self, conn, search=None, department=None):
        query = search.strip() if search and search.strip() else ""
        terms = self._plain_terms(query)
        prefix_query = " & ".join(f"{term}:*" for term in terms)

        clauses, filter_params = [], []
        if query:
            clauses.append(
                "(c.search_document @@ q.web_query "
                "OR (q.prefix_query IS NOT NULL AND c.search_document @@ q.prefix_query) "
                "OR (CARDINALITY(q.terms) > 0 AND NOT EXISTS ("
                "    SELECT 1 FROM UNNEST(q.terms) AS term "
                "    WHERE c.search_text NOT ILIKE ('%%' || term || '%%')"
                ")) "
                "OR WORD_SIMILARITY(q.query_text, c.search_text) >= 0.55)"
            )
        if department and department.strip():
            clauses.append("c.department = %s")
            filter_params.append(department.strip())
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with dict_cursor(conn) as cur:
            cur.execute(
                f"""
                WITH query_params AS (
                    SELECT %s::text AS query_text,
                           WEBSEARCH_TO_TSQUERY('simple', %s) AS web_query,
                           CASE WHEN %s = '' THEN NULL
                                ELSE TO_TSQUERY('simple', %s) END AS prefix_query,
                           %s::text[] AS terms
                ), searchable_courses AS (
                    SELECT c.*,
                           COALESCE((
                               SELECT STRING_AGG(DISTINCT i.name, ' ')
                               FROM course_instructors ci
                               JOIN instructors i ON i.instructor_id = ci.instructor_id
                               WHERE ci.course_id = c.course_id
                           ), '') AS instructor_names,
                           COALESCE((
                               SELECT STRING_AGG(DISTINCT t.tag_name, ' ')
                               FROM course_tags ct
                               JOIN tags t ON t.tag_id = ct.tag_id
                               WHERE ct.course_id = c.course_id
                           ), '') AS tag_names,
                           COALESCE((
                               SELECT ARRAY_AGG(DISTINCT i.name ORDER BY i.name)
                               FROM course_instructors ci
                               JOIN instructors i ON i.instructor_id = ci.instructor_id
                               WHERE ci.course_id = c.course_id
                           ), ARRAY[]::varchar[]) AS instructors,
                           COALESCE((
                               SELECT ARRAY_AGG(DISTINCT t.tag_name ORDER BY t.tag_name)
                               FROM course_tags ct
                               JOIN tags t ON t.tag_id = ct.tag_id
                               WHERE ct.course_id = c.course_id
                           ), ARRAY[]::varchar[]) AS tags
                    FROM courses c
                ), search_ready AS (
                    SELECT c.*,
                           CONCAT_WS(' ', c.course_code, c.course_name, c.department,
                                     c.instructor_names, c.tag_names) AS search_text,
                           SETWEIGHT(TO_TSVECTOR('simple', COALESCE(c.course_code, '')), 'A') ||
                           SETWEIGHT(TO_TSVECTOR('simple', COALESCE(c.course_name, '')), 'A') ||
                           SETWEIGHT(TO_TSVECTOR('simple', COALESCE(c.instructor_names, '')), 'A') ||
                           SETWEIGHT(TO_TSVECTOR('simple', COALESCE(c.tag_names, '')), 'B') ||
                           SETWEIGHT(TO_TSVECTOR('simple', COALESCE(c.department, '')), 'C')
                               AS search_document
                    FROM searchable_courses c
                )
                SELECT c.course_id, c.course_code, c.course_name, c.department,
                       (SELECT COUNT(*) FROM reviews r
                        WHERE r.course_id = c.course_id AND r.status = 'ACTIVE') AS review_count,
                       (SELECT ROUND(AVG(r2.rating_satisfaction)::numeric, 1)
                        FROM reviews r2 WHERE r2.course_id = c.course_id
                        AND r2.status = 'ACTIVE') AS avg_rating,
                       c.tags, c.instructors,
                       CASE WHEN q.query_text = '' THEN 0 ELSE
                           CASE
                               WHEN LOWER(c.course_code) = LOWER(q.query_text) THEN 100
                               WHEN LOWER(c.course_name) = LOWER(q.query_text) THEN 90
                               WHEN LOWER(c.instructor_names) = LOWER(q.query_text) THEN 80
                               WHEN LOWER(c.tag_names) = LOWER(q.query_text) THEN 70
                               WHEN c.course_code ILIKE (q.query_text || '%%') THEN 60
                               ELSE 0
                           END
                           + TS_RANK_CD(c.search_document, q.web_query) * 30
                           + CASE WHEN q.prefix_query IS NULL THEN 0 ELSE
                               TS_RANK_CD(c.search_document, q.prefix_query) * 20 END
                           + WORD_SIMILARITY(q.query_text, c.search_text) * 10
                           + CASE WHEN CARDINALITY(q.terms) > 0 AND NOT EXISTS (
                               SELECT 1 FROM UNNEST(q.terms) AS term
                               WHERE c.search_text NOT ILIKE ('%%' || term || '%%')
                             ) THEN 5 ELSE 0 END
                         END AS search_score
                FROM search_ready c
                CROSS JOIN query_params q
                {where}
                ORDER BY search_score DESC, c.course_code;
                """,
                [query, query, prefix_query, prefix_query, terms, *filter_params],
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
