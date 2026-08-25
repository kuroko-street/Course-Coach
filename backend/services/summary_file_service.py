import uuid
from pathlib import Path

from db import get_connection
from domain.errors import ServiceError
from repositories.audit_log_repository import AuditLogRepository
from repositories.summary_file_repository import SummaryFileRepository


class SummaryFileService:
    MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
    MAX_FILES_PER_UPLOAD = 3
    MAX_UPLOAD_BATCHES_PER_TERM = 2
    CHUNK_SIZE_BYTES = 1024 * 1024
    REPORT_THRESHOLD = 5
    ALLOWED_EXTENSIONS = {
        ".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".ppt", ".pptx",
    }

    def __init__(self, uploads_dir, connection_factory=get_connection):
        self.uploads_dir = Path(uploads_dir) / "summary-files"
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.connection_factory = connection_factory
        self.files = SummaryFileRepository()
        self.audit = AuditLogRepository()

    async def upload(
        self, course_id, enrollment_id, user, uploads, ip_address=None,
    ):
        if not uploads or len(uploads) > self.MAX_FILES_PER_UPLOAD:
            raise ServiceError(400, "Upload between 1 and 3 files per request.")

        conn = self.connection_factory()
        stored_paths = []
        try:
            enrollment = self.files.find_eligible_enrollment(
                conn, enrollment_id, course_id, user["user_id"],
            )
            if enrollment is None:
                raise ServiceError(
                    403, "You can upload files only for a course term you studied.",
                )
            self.files.lock_term_enrollments(
                conn, user["user_id"], course_id,
                enrollment["academic_year"], enrollment["semester"],
            )
            used_batches = self.files.count_active_batches(
                conn, user["user_id"], course_id,
                enrollment["academic_year"], enrollment["semester"],
            )
            if used_batches >= self.MAX_UPLOAD_BATCHES_PER_TERM:
                raise ServiceError(
                    409, "You already used both upload rounds for this course term.",
                )

            batch = self.files.create_batch(
                conn, course_id, user["user_id"], enrollment_id,
            )

            upload_dir = (
                self.uploads_dir / str(course_id) / str(user["user_id"])
                / f"{enrollment['academic_year']}-{enrollment['semester'].replace('/', '_')}"
                / str(batch["upload_batch_id"])
            )
            upload_dir.mkdir(parents=True, exist_ok=True)
            created_rows = []

            for upload in uploads:
                original_name = Path(upload.filename or "").name
                extension = Path(original_name).suffix.casefold()
                if extension not in self.ALLOWED_EXTENSIONS:
                    raise ServiceError(
                        415,
                        f"File type '{extension or 'unknown'}' is not allowed. "
                        "Use PDF, PNG, JPG, DOC, DOCX, PPT, or PPTX.",
                    )

                stored_path = upload_dir / f"{uuid.uuid4().hex}{extension}"
                stored_paths.append(stored_path)
                size = 0
                with stored_path.open("wb") as destination:
                    while chunk := await upload.read(self.CHUNK_SIZE_BYTES):
                        size += len(chunk)
                        if size > self.MAX_FILE_SIZE_BYTES:
                            raise ServiceError(413, f"File '{original_name}' exceeds 20MB.")
                        destination.write(chunk)
                if size == 0:
                    raise ServiceError(422, f"File '{original_name}' is empty.")

                created = self.files.create(
                    conn, batch["upload_batch_id"], original_name,
                    str(stored_path), upload.content_type, size,
                )
                self.audit.create(
                    conn, user["user_id"], "UPLOAD_SUMMARY_FILE",
                    created["file_id"], ip_address,
                )
                created_rows.append({
                    "file_id": created["file_id"],
                    "filename": original_name,
                    "size_bytes": size,
                    "uploaded_at": created["uploaded_at"],
                })

            conn.commit()
            return {
                "upload_batch_id": batch["upload_batch_id"],
                "files": created_rows,
                "created_count": len(created_rows),
                "remaining_upload_rounds": self.MAX_UPLOAD_BATCHES_PER_TERM - used_batches - 1,
            }
        except Exception:
            conn.rollback()
            for stored_path in stored_paths:
                stored_path.unlink(missing_ok=True)
            raise
        finally:
            conn.close()

    def list_files(self, user, course_id=None, academic_year=None, semester=None):
        conn = self.connection_factory()
        try:
            return {
                "files": self.files.list_active(
                    conn, user["user_id"], course_id, academic_year, semester,
                )
            }
        finally:
            conn.close()

    def get_download(self, file_id):
        conn = self.connection_factory()
        try:
            row = self.files.find_by_id(conn, file_id)
        finally:
            conn.close()
        if row is None or row["status"] != "ACTIVE":
            raise ServiceError(404, f"Summary file id {file_id} not found.")
        path = Path(row["stored_path"])
        if not path.is_file():
            raise ServiceError(404, "Stored summary file is missing.")
        return path, row["filename"], row["mime_type"]

    def toggle_like(self, file_id, user):
        conn = self.connection_factory()
        try:
            row = self.files.find_by_id(conn, file_id, lock=True)
            self._require_active(row, file_id)
            liked = self.files.add_like(conn, file_id, user["user_id"])
            if not liked:
                self.files.remove_like(conn, file_id, user["user_id"])
            count = self.files.count_likes(conn, file_id)
            conn.commit()
            return {"liked": liked, "like_count": count}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def add_comment(self, file_id, user, content):
        content = content.strip()
        if not content:
            raise ServiceError(422, "Comment cannot be empty.")
        conn = self.connection_factory()
        try:
            row = self.files.find_by_id(conn, file_id, lock=True)
            self._require_active(row, file_id)
            comment = self.files.add_comment(conn, file_id, user["user_id"], content)
            conn.commit()
            return comment
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def report(self, file_id, user, ip_address=None):
        conn = self.connection_factory()
        try:
            row = self.files.find_by_id(conn, file_id, lock=True)
            self._require_active(row, file_id)
            if row["uploader_id"] == user["user_id"]:
                raise ServiceError(409, "You cannot report your own summary file.")
            report_id = self.files.add_report(conn, file_id, user["user_id"])
            if report_id is None:
                raise ServiceError(409, "You have already reported this summary file.")
            state = self.files.increment_report_count(conn, file_id, self.REPORT_THRESHOLD)
            self.audit.create(
                conn, user["user_id"], "REPORT_SUMMARY_FILE", file_id, ip_address,
            )
            conn.commit()
            return {
                "report_id": report_id,
                "report_count": state["report_count"],
                "auto_hidden": state["status"] == "HIDDEN",
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def delete(self, file_id, user, ip_address=None):
        conn = self.connection_factory()
        try:
            row = self.files.find_by_id(conn, file_id, lock=True)
            if row is None:
                raise ServiceError(404, f"Summary file id {file_id} not found.")
            if row["status"] == "DELETED":
                raise ServiceError(409, "Summary file has already been deleted.")
            if row["uploader_id"] != user["user_id"] and user["role"] != "ADMIN":
                raise ServiceError(403, "Only the uploader or an admin can delete this file.")
            self.files.soft_delete(conn, file_id)
            self.files.close_batch_if_empty(conn, row["upload_batch_id"])
            self.audit.create(
                conn, user["user_id"], "DELETE_SUMMARY_FILE", file_id, ip_address,
            )
            conn.commit()
            return {"file_id": file_id, "status": "DELETED"}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def _require_active(row, file_id):
        if row is None or row["status"] != "ACTIVE":
            raise ServiceError(404, f"Summary file id {file_id} not found.")
