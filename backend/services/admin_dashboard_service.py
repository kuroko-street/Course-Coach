from db import get_connection, dict_cursor


def dashboard():
    conn = get_connection()
    try:
        conn.set_session(isolation_level='REPEATABLE READ', readonly=True)
        with dict_cursor(conn) as cur:
            cur.execute("""SELECT
                (SELECT count(*) FROM users) AS users,
                (SELECT count(*) FROM users WHERE is_mock) AS mock_users,
                (SELECT count(*) FROM courses WHERE merged_into_course_id IS NULL AND is_active) AS active_courses,
                (SELECT count(*) FROM courses WHERE merged_into_course_id IS NULL AND NOT is_active) AS inactive_courses,
                (SELECT count(*) FROM reviews WHERE status='ACTIVE') AS active_reviews,
                (SELECT count(*) FROM reviews WHERE status='HIDDEN') AS hidden_reviews,
                (SELECT count(*) FROM summary_files WHERE status='ACTIVE') AS active_files,
                (SELECT count(*) FROM summary_files WHERE status='HIDDEN') AS hidden_files""")
            counts = cur.fetchone()
            cur.execute("""SELECT university_id, code_normalized, min(course_code) AS course_code,
                       count(*) AS course_count, array_agg(course_id ORDER BY course_id) AS course_ids,
                       count(*) OVER () AS total_groups
                FROM courses WHERE merged_into_course_id IS NULL
                GROUP BY university_id, code_normalized HAVING count(*) > 1
                ORDER BY count(*) DESC, university_id, code_normalized LIMIT 10""")
            duplicates = cur.fetchall()
            cur.execute("""SELECT a.log_id,a.timestamp,a.action,a.target_id,
                       coalesce(u.display_name,u.username,'บัญชีที่ไม่พร้อมใช้งาน') AS actor
                FROM audit_logs a LEFT JOIN users u ON u.user_id=a.user_id
                WHERE a.action IN ('EDIT_COURSE','COURSE_STATUS','MERGE_COURSES')
                ORDER BY a.log_id DESC LIMIT 15""")
            return {'counts': counts, 'duplicates': duplicates,
                    'duplicate_groups': duplicates[0]['total_groups'] if duplicates else 0,
                    'activity': cur.fetchall()}
    finally:
        conn.close()
