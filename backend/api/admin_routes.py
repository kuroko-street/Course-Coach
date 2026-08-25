from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from api.dependencies import require_admin
from domain.errors import ServiceError
from schemas.admin import (
    AdminAction,
    CourseImportRequest,
    CourseManagePayload,
    CourseStatus,
    CurriculumCreate,
    InstructorCreate,
    StudentEnrollmentImportRequest,
)
from services.course_import_service import CourseImportService
from services.course_management_service import CourseManagementService
from services.moderation_service import ModerationService
from services.student_import_service import StudentImportService


router = APIRouter(prefix="/api", tags=["admin"])
service = ModerationService()
course_management_service = CourseManagementService()
course_import_service = CourseImportService(course_management_service)
student_import_service = StudentImportService()


def invoke(operation, *args):
    try:
        return operation(*args)
    except ServiceError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.get("/admin/reports")
def admin_reports(admin: dict = Depends(require_admin)):
    return invoke(service.list_hidden_reviews)


@router.get("/admin/reports/summary")
def admin_report_summary(admin: dict = Depends(require_admin)):
    return invoke(service.report_summary)


@router.post("/admin/reviews/{review_id}/action")
def admin_review_action(
    review_id: int,
    payload: AdminAction,
    request: Request,
    admin: dict = Depends(require_admin),
):
    ip = request.client.host if request.client else None
    return invoke(service.apply_action, review_id, payload.action, admin, ip)


@router.get("/admin/summary-files")
def admin_summary_files(admin: dict = Depends(require_admin)):
    return invoke(service.list_hidden_summary_files)


@router.get("/admin/summary-files/{file_id}/download")
def admin_summary_file_download(file_id: int, admin: dict = Depends(require_admin)):
    path, filename, mime_type = invoke(service.get_summary_file_download, file_id)
    return FileResponse(path, filename=filename, media_type=mime_type)


@router.post("/admin/summary-files/{file_id}/action")
def admin_summary_file_action(
    file_id: int,
    payload: AdminAction,
    request: Request,
    admin: dict = Depends(require_admin),
):
    ip = request.client.host if request.client else None
    return invoke(
        service.apply_summary_file_action, file_id, payload.action, admin, ip,
    )


@router.get("/audit-logs")
def list_audit_logs(limit: int = 50, admin: dict = Depends(require_admin)):
    return invoke(service.list_audit_logs, limit)


@router.get("/admin/courses")
def admin_courses(admin: dict = Depends(require_admin)):
    return invoke(course_management_service.list_courses)


@router.get("/admin/instructors")
def admin_instructors(admin: dict = Depends(require_admin)):
    return invoke(course_management_service.list_instructors)


@router.post("/admin/instructors", status_code=201)
def create_instructor(payload: InstructorCreate, request: Request, admin: dict = Depends(require_admin)):
    ip = request.client.host if request.client else None
    return invoke(course_management_service.create_instructor, payload, admin, ip)


@router.post("/admin/courses", status_code=201)
def create_course(payload: CourseManagePayload, request: Request, admin: dict = Depends(require_admin)):
    ip = request.client.host if request.client else None
    return invoke(course_management_service.create_course, payload, admin, ip)


@router.put("/admin/courses/{course_id}")
def update_course(course_id: int, payload: CourseManagePayload, request: Request, admin: dict = Depends(require_admin)):
    ip = request.client.host if request.client else None
    return invoke(course_management_service.update_course, course_id, payload, admin, ip)


@router.patch("/admin/courses/{course_id}/status")
def set_course_status(course_id: int, payload: CourseStatus, request: Request, admin: dict = Depends(require_admin)):
    ip = request.client.host if request.client else None
    return invoke(course_management_service.set_status, course_id, payload.is_active, admin, ip)


@router.get("/admin/curriculums")
def admin_curriculums(admin: dict = Depends(require_admin)):
    return invoke(course_management_service.list_curriculums)


@router.post("/admin/curriculums", status_code=201)
def create_curriculum(payload: CurriculumCreate, request: Request, admin: dict = Depends(require_admin)):
    ip = request.client.host if request.client else None
    return invoke(course_management_service.create_curriculum, payload, admin, ip)


@router.post("/admin/courses/import/preview")
async def preview_course_import(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    try:
        return await course_import_service.preview(file)
    except ServiceError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/admin/courses/import")
def confirm_course_import(payload: CourseImportRequest, request: Request, admin: dict = Depends(require_admin)):
    ip = request.client.host if request.client else None
    return invoke(course_import_service.confirm, payload.rows, admin, ip)


@router.get("/admin/students")
def admin_students(admin: dict = Depends(require_admin)):
    return invoke(student_import_service.list_students)


@router.post("/admin/students/import/preview")
async def preview_student_import(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    try:
        return await student_import_service.preview(file)
    except ServiceError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/admin/students/import")
def confirm_student_import(
    payload: StudentEnrollmentImportRequest,
    request: Request,
    admin: dict = Depends(require_admin),
):
    ip = request.client.host if request.client else None
    return invoke(student_import_service.confirm, payload.rows, admin, ip)
