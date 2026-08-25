from db import dict_cursor


SUMMARY_FILE_FIELDS = """
    sf.file_id, sf.upload_batch_id, b.course_id, b.uploader_id,
    e.academic_year, e.semester,
    sf.filename, sf.stored_path, sf.mime_type, sf.size_bytes,
    sf.report_count, sf.status, sf.uploaded_at, sf.deleted_at
"""


class SummaryFileRepository:
    def find_eligible_enrollment(self, conn, enrollment_id, course_id, user_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT enrollment_id, course_id, student_id, academic_year,
                       semester, section
                FROM enrollments
                WHERE enrollment_id = %s AND course_id = %s AND student_id = %s
                FOR UPDATE;
                """,
                (enrollment_id, course_id, user_id),
            )
            return cur.fetchone()

    def lock_term_enrollments(self, conn, user_id, course_id, academic_year, semester):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT enrollment_id FROM enrollments
                WHERE student_id = %s AND course_id = %s
                  AND academic_year = %s AND semester = %s
                ORDER BY enrollment_id
                FOR UPDATE;
                """,
                (user_id, course_id, academic_year, semester),
            )
            cur.fetchall()

    def count_active_batches(self, conn, user_id, course_id, academic_year, semester):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS count
                FROM summary_file_upload_batches b
                JOIN enrollments e ON e.enrollment_id = b.enrollment_id
                WHERE b.uploader_id = %s AND b.course_id = %s
                  AND e.academic_year = %s AND e.semester = %s
                  AND b.deleted_at IS NULL;
                """,
                (user_id, course_id, academic_year, semester),
            )
            return cur.fetchone()["count"]

    def create_batch(self, conn, course_id, uploader_id, enrollment_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO summary_file_upload_batches
                    (course_id, uploader_id, enrollment_id)
                VALUES (%s, %s, %s)
                RETURNING upload_batch_id, uploaded_at;
                """,
                (course_id, uploader_id, enrollment_id),
            )
            return cur.fetchone()

    def create(
        self, conn, upload_batch_id, filename, stored_path, mime_type, size_bytes,
    ):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO summary_files
                    (upload_batch_id, filename, stored_path, mime_type, size_bytes)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING file_id, uploaded_at;
                """,
                (
                    upload_batch_id, filename, stored_path, mime_type, size_bytes,
                ),
            )
            return cur.fetchone()

    def list_active(
        self, conn, user_id, course_id=None, academic_year=None, semester=None,
    ):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT sf.file_id, sf.upload_batch_id, b.course_id, b.uploader_id,
                       e.academic_year, e.semester, e.section,
                       sf.filename, sf.mime_type, sf.size_bytes,
                       sf.report_count, sf.uploaded_at,
                       c.course_code, c.course_name,
                       COALESCE(NULLIF(u.display_name, ''), u.username) AS uploader_name,
                       u.avatar_url AS uploader_avatar,
                       (SELECT COUNT(*) FROM summary_file_likes sfl
                        WHERE sfl.file_id = sf.file_id) AS like_count,
                       EXISTS(
                           SELECT 1 FROM summary_file_likes sfl
                           WHERE sfl.file_id = sf.file_id AND sfl.user_id = %s
                       ) AS user_liked,
                       COALESCE((
                           SELECT JSON_AGG(
                               JSON_BUILD_OBJECT(
                                   'comment_id', sfc.comment_id,
                                   'author_id', cu.user_id,
                                   'author_name', COALESCE(NULLIF(cu.display_name, ''), cu.username),
                                   'author_avatar', cu.avatar_url,
                                   'content', sfc.content,
                                   'created_at', sfc.created_at
                               ) ORDER BY sfc.created_at, sfc.comment_id
                           )
                           FROM summary_file_comments sfc
                           JOIN users cu ON cu.user_id = sfc.user_id
                           WHERE sfc.file_id = sf.file_id
                       ), '[]'::JSON) AS comments
                FROM summary_files sf
                JOIN summary_file_upload_batches b
                  ON b.upload_batch_id = sf.upload_batch_id
                JOIN enrollments e ON e.enrollment_id = b.enrollment_id
                JOIN courses c ON c.course_id = b.course_id
                JOIN users u ON u.user_id = b.uploader_id
                WHERE sf.status = 'ACTIVE' AND b.deleted_at IS NULL
                  AND (%s::INT IS NULL OR b.course_id = %s)
                  AND (%s::INT IS NULL OR e.academic_year = %s)
                  AND (%s::VARCHAR IS NULL OR e.semester = %s)
                ORDER BY e.academic_year DESC, e.semester DESC,
                         sf.uploaded_at DESC, sf.file_id DESC;
                """,
                (
                    user_id, course_id, course_id, academic_year, academic_year,
                    semester, semester,
                ),
            )
            return cur.fetchall()

    def find_by_id(self, conn, file_id, lock=False):
        suffix = " FOR UPDATE" if lock else ""
        with dict_cursor(conn) as cur:
            cur.execute(
                f"SELECT {SUMMARY_FILE_FIELDS} FROM summary_files sf "
                "JOIN summary_file_upload_batches b "
                "ON b.upload_batch_id = sf.upload_batch_id "
                "JOIN enrollments e ON e.enrollment_id = b.enrollment_id "
                f"WHERE sf.file_id = %s{suffix};",
                (file_id,),
            )
            return cur.fetchone()

    def add_like(self, conn, file_id, user_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO summary_file_likes (file_id, user_id)
                VALUES (%s, %s)
                ON CONFLICT (file_id, user_id) DO NOTHING
                RETURNING like_id;
                """,
                (file_id, user_id),
            )
            return cur.fetchone() is not None

    def remove_like(self, conn, file_id, user_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                "DELETE FROM summary_file_likes WHERE file_id = %s AND user_id = %s;",
                (file_id, user_id),
            )

    def count_likes(self, conn, file_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                "SELECT COUNT(*) AS count FROM summary_file_likes WHERE file_id = %s;",
                (file_id,),
            )
            return cur.fetchone()["count"]

    def add_comment(self, conn, file_id, user_id, content):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                WITH inserted AS (
                    INSERT INTO summary_file_comments (file_id, user_id, content)
                    VALUES (%s, %s, %s)
                    RETURNING comment_id, user_id, content, created_at
                )
                SELECT i.comment_id, i.content, i.created_at,
                       u.user_id AS author_id,
                       COALESCE(NULLIF(u.display_name, ''), u.username) AS author_name,
                       u.avatar_url AS author_avatar
                FROM inserted i
                JOIN users u ON u.user_id = i.user_id;
                """,
                (file_id, user_id, content),
            )
            return cur.fetchone()

    def add_report(self, conn, file_id, reporter_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO summary_file_reports (file_id, reporter_id)
                VALUES (%s, %s)
                ON CONFLICT (file_id, reporter_id) DO NOTHING
                RETURNING report_id;
                """,
                (file_id, reporter_id),
            )
            row = cur.fetchone()
            return row["report_id"] if row else None

    def increment_report_count(self, conn, file_id, threshold):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE summary_files
                SET report_count = report_count + 1,
                    status = CASE
                        WHEN report_count + 1 >= %s THEN 'HIDDEN'::summary_file_status
                        ELSE status
                    END
                WHERE file_id = %s
                RETURNING report_count, status;
                """,
                (threshold, file_id),
            )
            return cur.fetchone()

    def soft_delete(self, conn, file_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE summary_files
                SET status = 'DELETED', deleted_at = NOW()
                WHERE file_id = %s;
                """,
                (file_id,),
            )

    def close_batch_if_empty(self, conn, upload_batch_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE summary_file_upload_batches b
                SET deleted_at = NOW()
                WHERE b.upload_batch_id = %s
                  AND NOT EXISTS (
                      SELECT 1 FROM summary_files sf
                      WHERE sf.upload_batch_id = b.upload_batch_id
                        AND sf.status <> 'DELETED'
                  );
                """,
                (upload_batch_id,),
            )

    def list_hidden_for_moderation(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT sf.file_id, sf.upload_batch_id, sf.filename, sf.mime_type,
                       sf.size_bytes, sf.report_count, sf.status, sf.uploaded_at,
                       b.course_id, e.academic_year, e.semester, e.section,
                       c.course_code, c.course_name,
                       COALESCE(NULLIF(u.display_name, ''), u.username) AS uploader_name,
                       (SELECT MAX(reported_at) FROM summary_file_reports sfr
                        WHERE sfr.file_id = sf.file_id) AS last_reported_at
                FROM summary_files sf
                JOIN summary_file_upload_batches b
                  ON b.upload_batch_id = sf.upload_batch_id
                JOIN enrollments e ON e.enrollment_id = b.enrollment_id
                JOIN courses c ON c.course_id = b.course_id
                JOIN users u ON u.user_id = b.uploader_id
                WHERE sf.status = 'HIDDEN'
                ORDER BY sf.report_count DESC, sf.file_id;
                """
            )
            return cur.fetchall()

    def moderate(self, conn, file_id, action):
        with dict_cursor(conn) as cur:
            if action == "KEEP":
                cur.execute(
                    "DELETE FROM summary_file_reports WHERE file_id = %s;",
                    (file_id,),
                )
                cur.execute(
                    """
                    UPDATE summary_files
                    SET status = 'ACTIVE', report_count = 0, deleted_at = NULL
                    WHERE file_id = %s
                    RETURNING file_id, upload_batch_id, status, report_count;
                    """,
                    (file_id,),
                )
            else:
                cur.execute(
                    """
                    UPDATE summary_files
                    SET status = 'DELETED', deleted_at = NOW()
                    WHERE file_id = %s
                    RETURNING file_id, upload_batch_id, status, report_count;
                    """,
                    (file_id,),
                )
            return cur.fetchone()
