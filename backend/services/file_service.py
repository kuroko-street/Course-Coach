import uuid
from pathlib import Path

from db import get_connection
from domain.errors import ServiceError
from repositories.audit_log_repository import AuditLogRepository
from repositories.file_repository import FileRepository
from repositories.review_repository import ReviewRepository


class FileService:
    MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
    CHUNK_SIZE_BYTES = 1024 * 1024

    def __init__(self, uploads_dir, connection_factory=get_connection):
        self.uploads_dir = Path(uploads_dir)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.connection_factory = connection_factory
        self.reviews = ReviewRepository()
        self.files = FileRepository()
        self.audit = AuditLogRepository()

    async def upload(self, review_id, user, upload, ip_address=None):
        conn = self.connection_factory()
        stored_path = None
        try:
            review = self.reviews.find_by_id(conn, review_id)
            if review is None:
                raise ServiceError(404, f"Review id {review_id} not found.")
            if review["reviewer_id"] != user["user_id"]:
                raise ServiceError(403, "Only the review's author can attach files to it.")
            if review["status"] == "DELETED":
                raise ServiceError(409, "This review has been deleted.")

            original_name = Path(upload.filename or "upload").name
            review_dir = self.uploads_dir / str(review_id)
            review_dir.mkdir(parents=True, exist_ok=True)
            stored_path = review_dir / f"{uuid.uuid4().hex}_{original_name}"
            size = 0
            with stored_path.open("wb") as destination:
                while chunk := await upload.read(self.CHUNK_SIZE_BYTES):
                    size += len(chunk)
                    if size > self.MAX_FILE_SIZE_BYTES:
                        raise ServiceError(413, "File exceeds the 20MB limit.")
                    destination.write(chunk)

            created = self.files.create(
                conn, review_id, user["user_id"], original_name, str(stored_path), size
            )
            self.audit.create(conn, user["user_id"], "UPLOAD_FILE", created["file_id"], ip_address)
            conn.commit()
            return {
                "file_id": created["file_id"], "review_id": review_id,
                "filename": original_name, "size_bytes": size,
                "uploaded_at": created["uploaded_at"],
            }
        except Exception:
            conn.rollback()
            if stored_path is not None:
                stored_path.unlink(missing_ok=True)
            raise
        finally:
            conn.close()

    def list_files(self, review_id):
        conn = self.connection_factory()
        try:
            return {"files": self.files.list_by_review(conn, review_id)}
        finally:
            conn.close()

    def get_download(self, file_id):
        conn = self.connection_factory()
        try:
            row = self.files.find_download(conn, file_id)
        finally:
            conn.close()
        if row is None:
            raise ServiceError(404, f"File id {file_id} not found.")
        if row["status"] == "DELETED":
            raise ServiceError(410, "The review containing this file was deleted.")
        path = Path(row["stored_path"])
        if not path.is_file():
            raise ServiceError(404, "Stored file is missing.")
        return path, row["filename"]
