from fastapi import APIRouter, Depends, HTTPException, Request

from api.dependencies import require_admin
from domain.errors import ServiceError
from schemas.admin import AdminAction
from services.moderation_service import ModerationService


router = APIRouter(prefix="/api", tags=["admin"])
service = ModerationService()


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


@router.post("/admin/reviews/{review_id}/action")
def admin_review_action(
    review_id: int,
    payload: AdminAction,
    request: Request,
    admin: dict = Depends(require_admin),
):
    ip = request.client.host if request.client else None
    return invoke(service.apply_action, review_id, payload.action, admin, ip)


@router.get("/audit-logs")
def list_audit_logs(limit: int = 50, admin: dict = Depends(require_admin)):
    return invoke(service.list_audit_logs, limit)
