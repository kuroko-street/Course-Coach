import os
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from api.dependencies import require_user
from domain.errors import ServiceError
from schemas.summary_file import SummaryFileCommentCreate
from services.summary_file_service import SummaryFileService


router = APIRouter(prefix="/api", tags=["summary-files"])
summary_file_service = SummaryFileService(Path(os.getenv("UPLOADS_DIR", "/app/uploads")))


def client_ip(request):
    return request.client.host if request.client else None


def invoke(operation, *args, **kwargs):
    try:
        return operation(*args, **kwargs)
    except ServiceError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


def translate(exc):
    if isinstance(exc, ServiceError):
        raise HTTPException(exc.status_code, exc.detail) from exc
    if isinstance(exc, HTTPException):
        raise exc
    raise HTTPException(500, str(exc)) from exc


@router.post("/courses/{course_id}/summary-files", status_code=201)
async def upload_summary_files(
    course_id: int,
    request: Request,
    enrollment_id: Annotated[int, Form(ge=1)],
    files: Annotated[list[UploadFile], File()],
    user: dict = Depends(require_user),
):
    try:
        return await summary_file_service.upload(
            course_id, enrollment_id, user, files, client_ip(request),
        )
    except Exception as exc:
        translate(exc)


@router.get("/courses/{course_id}/summary-files")
def list_course_summary_files(
    course_id: int,
    academic_year: int | None = None,
    semester: str | None = None,
    user: dict = Depends(require_user),
):
    return invoke(
        summary_file_service.list_files, user, course_id, academic_year, semester,
    )


@router.get("/summary-files")
def list_all_summary_files(
    academic_year: int | None = None,
    semester: str | None = None,
    user: dict = Depends(require_user),
):
    return invoke(
        summary_file_service.list_files, user, None, academic_year, semester,
    )


@router.get("/summary-files/{file_id}/download")
def download_summary_file(file_id: int, _user: dict = Depends(require_user)):
    try:
        path, filename, mime_type = summary_file_service.get_download(file_id)
        return FileResponse(
            path=str(path), filename=filename,
            media_type=mime_type or "application/octet-stream",
        )
    except Exception as exc:
        translate(exc)


@router.post("/summary-files/{file_id}/like")
def toggle_summary_file_like(file_id: int, user: dict = Depends(require_user)):
    return invoke(summary_file_service.toggle_like, file_id, user)


@router.post("/summary-files/{file_id}/comments", status_code=201)
def create_summary_file_comment(
    file_id: int,
    payload: SummaryFileCommentCreate,
    user: dict = Depends(require_user),
):
    return invoke(summary_file_service.add_comment, file_id, user, payload.content)


@router.post("/summary-files/{file_id}/report", status_code=201)
def report_summary_file(
    file_id: int,
    request: Request,
    user: dict = Depends(require_user),
):
    return invoke(summary_file_service.report, file_id, user, client_ip(request))


@router.delete("/summary-files/{file_id}")
def delete_summary_file(
    file_id: int,
    request: Request,
    user: dict = Depends(require_user),
):
    return invoke(summary_file_service.delete, file_id, user, client_ip(request))
