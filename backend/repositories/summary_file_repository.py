from db import dict_cursor

FILE_SELECT="""SELECT sf.*,b.course_id,b.uploader_id,c.course_code,c.course_name,c.academic_year,c.semester,
 COALESCE(NULLIF(u.display_name,''),u.username) AS uploader_name,u.avatar_url AS uploader_avatar
 FROM summary_files sf JOIN summary_file_upload_batches b USING(upload_batch_id)
 JOIN courses c ON c.course_id=b.course_id JOIN users u ON u.user_id=b.uploader_id"""

class SummaryFileRepository:
    def find_by_id_for_update(self,conn,file_id): return self.find(conn,file_id,True)
    def find(self,conn,file_id,lock=False):
        with dict_cursor(conn) as cur:
            cur.execute(FILE_SELECT+" WHERE sf.file_id=%s AND c.is_active AND c.merged_into_course_id IS NULL"+(' FOR UPDATE OF sf FOR SHARE OF c' if lock else ''),(file_id,))
            return cur.fetchone()
    def list(self,conn,course_id,caller_id=None):
        with dict_cursor(conn) as cur:
            cur.execute("""SELECT sf.file_id,sf.filename,sf.mime_type,sf.size_bytes,sf.uploaded_at,sf.status,sf.report_count,b.uploader_id,b.course_id,
            COALESCE(NULLIF(u.display_name,''),u.username) AS uploader_name,u.avatar_url AS uploader_avatar,c.course_code,c.course_name,c.academic_year,c.semester,
            (SELECT COUNT(*) FROM summary_file_likes l WHERE l.file_id=sf.file_id) AS like_count,
            (SELECT COUNT(*) FROM summary_file_comments rc WHERE rc.file_id=sf.file_id AND rc.status='ACTIVE') AS comment_count,
            EXISTS(SELECT 1 FROM summary_file_likes l WHERE l.file_id=sf.file_id AND l.user_id=%s) AS liked_by_me,
            EXISTS(SELECT 1 FROM summary_file_reports rp WHERE rp.file_id=sf.file_id AND rp.reporter_id=%s) AS reported_by_me
            FROM summary_files sf JOIN summary_file_upload_batches b USING(upload_batch_id) JOIN courses c ON c.course_id=b.course_id JOIN users u ON u.user_id=b.uploader_id
            WHERE c.is_active AND c.merged_into_course_id IS NULL AND sf.status='ACTIVE' AND (%s IS NULL OR c.course_id=%s) ORDER BY sf.uploaded_at DESC,sf.file_id DESC""",(caller_id,caller_id,course_id,course_id))
            return cur.fetchall()
    def comments(self,conn,file_id):
        with dict_cursor(conn) as cur:
            cur.execute("""SELECT rc.comment_id,rc.file_id,rc.content,rc.created_at,rc.edited_at,rc.user_id AS author_id,
             COALESCE(NULLIF(u.display_name,''),u.username) AS author_name,u.avatar_url AS author_avatar
             FROM summary_file_comments rc JOIN users u ON u.user_id=rc.user_id WHERE rc.file_id=%s AND rc.status='ACTIVE' ORDER BY rc.created_at,rc.comment_id""",(file_id,))
            return cur.fetchall()
