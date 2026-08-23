from db import dict_cursor


class FileRepository:
    def create(self, conn, review_id, uploader_id, filename, stored_path, size_bytes):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO review_files (review_id, uploader_id, filename, stored_path, size_bytes)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING file_id, uploaded_at;
                """,
                (review_id, uploader_id, filename, stored_path, size_bytes),
            )
            return cur.fetchone()

    def list_by_review(self, conn, review_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT rf.file_id, rf.review_id, rf.filename, rf.size_bytes, rf.uploaded_at,
                       u.username AS uploader_name
                FROM review_files rf
                JOIN users u ON u.user_id = rf.uploader_id
                WHERE rf.review_id = %s
                ORDER BY rf.uploaded_at, rf.file_id;
                """,
                (review_id,),
            )
            return cur.fetchall()

    def find_download(self, conn, file_id):
        with dict_cursor(conn) as cur:
            cur.execute(
                """
                SELECT rf.file_id, rf.filename, rf.stored_path, r.status
                FROM review_files rf
                JOIN reviews r ON r.review_id = rf.review_id
                WHERE rf.file_id = %s;
                """,
                (file_id,),
            )
            return cur.fetchone()
