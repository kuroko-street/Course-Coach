from fastapi import APIRouter, Depends, HTTPException, Request

from api.dependencies import require_user
from domain.errors import ServiceError
from schemas.user import LoginMock
from services.user_service import UserService


router = APIRouter(prefix="/api", tags=["users"])
service = UserService()


def invoke(operation, *args):
    try:
        return operation(*args)
    except ServiceError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.get("/users")
def list_users():
    return invoke(service.list_users)


@router.post("/auth/login-mock")
def login_mock(payload: LoginMock, request: Request):
    ip = request.client.host if request.client else None
    return invoke(service.login_mock, payload.user_id, ip)


@router.get("/users/{user_id}/profile")
def get_user_profile(user_id: int):
    return invoke(service.profile, user_id)


@router.get("/users/{user_id}/enrollments")
def list_user_enrollments(user_id: int, caller: dict = Depends(require_user)):
    return invoke(service.enrollments, user_id, caller)
