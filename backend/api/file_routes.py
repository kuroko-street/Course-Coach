import os
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from api.dependencies import require_user
from domain.errors import ServiceError
from services.file_service import FileService


router = APIRouter(prefix="/api", tags=["files"])
file_service = FileService(Path(os.getenv("UPLOADS_DIR", "/app/uploads")))


def translate(exc):
    if isinstance(exc, ServiceError):
        raise HTTPException(exc.status_code, exc.detail) from exc
    raise HTTPException(500, str(exc)) from exc


@router.post("/reviews/{review_id}/files", status_code=201)
async def upload_review_file(
    review_id: int,
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(require_user),
):
    try:
        ip = request.client.host if request.client else None
        return await file_service.upload(review_id, user, file, ip)
    except Exception as exc:
        translate(exc)


@router.get("/reviews/{review_id}/files")
def list_review_files(review_id: int):
    try:
        return file_service.list_files(review_id)
    except Exception as exc:
        translate(exc)


@router.get("/files/{file_id}/download")
def download_review_file(file_id: int):
    try:
        path, filename = file_service.get_download(file_id)
        return FileResponse(path=str(path), filename=filename, media_type="application/octet-stream")
    except Exception as exc:
        translate(exc)
