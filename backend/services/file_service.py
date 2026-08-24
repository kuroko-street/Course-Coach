import os
import uuid
from fastapi import HTTPException
from repositories.file_repository import FileRepository

BASE_UPLOADS_DIR = os.getenv("UPLOADS_DIR", "/app/uploads")
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".doc", ".ptff"}
MAX_FILES_LIMIT = 3

class FileService:
    def __init__(self, get_db_conn):
        self.get_db_conn = get_db_conn
        self.repo = FileRepository()

    def upload_summary_files(self, course_id: int, academic_year: str, user_id: int, files: list):
        if len(files) > MAX_FILES_LIMIT:
            raise HTTPException(
                status_code=400, 
                detail=f"สามารถอัปโหลดได้สูงสุดไม่เกิน {MAX_FILES_LIMIT} ไฟล์เท่านั้น"
            )

        # 3.4 แยกโฟลเดอร์ตาม User ID และปีการศึกษา
        safe_year = academic_year.replace("/", "_")
        user_upload_dir = os.path.join(BASE_UPLOADS_DIR, "users", str(user_id), "courses", str(course_id), safe_year)
        os.makedirs(user_upload_dir, exist_ok=True)

        uploaded_records = []

        with self.get_db_conn() as conn:
            for file in files:
                file_ext = os.path.splitext(file.filename)[1].lower()
                # 3.1 ตรวจสอบประเภทไฟล์
                if file_ext not in ALLOWED_EXTENSIONS:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"ไฟล์ประเภท '{file_ext}' ไม่ได้รับอนุญาตเพื่อความปลอดภัย"
                    )

                stored_name = f"{uuid.uuid4().hex}{file_ext}"
                file_path = os.path.join(user_upload_dir, stored_name)

                content = file.file.read()
                size_bytes = len(content)

                with open(file_path, "wb") as f:
                    f.write(content)

                # บันทึกข้อมูลลงฐานข้อมูล
                record = self.repo.create_summary_file(
                    conn=conn,
                    course_id=course_id,
                    academic_year=academic_year,
                    uploader_id=user_id,
                    filename=file.filename,
                    stored_path=file_path,
                    size_bytes=size_bytes
                )
                
                uploaded_records.append(record)

        return uploaded_records

    def get_summary_files(self, course_id: int, academic_year: str = None):
        with self.get_db_conn() as conn:
            return self.repo.list_summary_files(conn, course_id, academic_year)