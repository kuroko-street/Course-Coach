from typing import List
from fastapi import APIRouter, UploadFile, File, Form, Header, HTTPException, Request
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api", tags=["Summary Files"])
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

@router.post("/courses/{course_id}/summary-files")
def upload_summary_files(
    request: Request,
    course_id: int,
    academic_year: str = Form(...),
    files: List[UploadFile] = File(...),
    x_user_id: int = Header(..., alias="X-User-Id")
):
    if len(files) > 3:
        raise HTTPException(status_code=400, detail="อัปโหลดได้สูงสุดไม่เกิน 3 ไฟล์ต่อครั้ง")

    for file in files:
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"ไฟล์ '{file.filename}' มีขนาดเกิน 20MB")

    file_service = request.app.state.file_service
    return file_service.upload_summary_files(course_id, academic_year, x_user_id, files)

@router.get("/courses/{course_id}/summary-files")
def get_summary_files(request: Request, course_id: int, academic_year: str = None):
    file_service = request.app.state.file_service
    return file_service.get_summary_files(course_id, academic_year)