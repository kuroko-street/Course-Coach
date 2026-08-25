import os
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from auth import GoogleIdentityVerifier
from api.dependencies import require_user
from domain.errors import ServiceError
from schemas.user import GoogleLogin, LoginMock, UserUpdate
from services.user_service import UserService


router = APIRouter(prefix="/api", tags=["users"])
google_verifier = GoogleIdentityVerifier()
service = UserService(
    google_verifier=google_verifier,
    avatars_dir=Path(os.getenv("AVATARS_DIR", "/app/avatars")),
)


def mock_login_enabled():
    return os.getenv("ALLOW_MOCK_AUTH", "false").casefold() == "true"


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
    if not mock_login_enabled():
        raise HTTPException(404, "Mock login is disabled.")
    ip = request.client.host if request.client else None
    result = invoke(service.login_mock, payload.user_id, ip)
    request.session.clear()
    request.session["user_id"] = result["user"]["user_id"]
    return result


@router.get("/auth/mock-users")
def list_mock_users():
    if not mock_login_enabled():
        raise HTTPException(404, "Mock login is disabled.")
    return invoke(service.list_mock_users)


@router.get("/auth/config")
def auth_config():
    return {
        "google_client_id": google_verifier.client_id,
        "allowed_domain": google_verifier.allowed_domain,
        "configured": google_verifier.configured,
        "mock_login_enabled": mock_login_enabled(),
    }


@router.post("/auth/google")
def login_google(payload: GoogleLogin, request: Request):
    ip = request.client.host if request.client else None
    user = invoke(service.login_google, payload.credential, ip)
    request.session.clear()
    request.session["user_id"] = user["user_id"]
    return {"user": user, "message": f"Logged in as {user['display_name']}."}


@router.post("/auth/logout", status_code=204)
def logout(request: Request):
    request.session.clear()


@router.get("/auth/me")
def current_user(user: dict = Depends(require_user)):
    return {"user": user}


@router.put("/users/me")
def update_own_profile(payload: UserUpdate, user: dict = Depends(require_user)):
    return invoke(service.update_profile, user, payload)


@router.post("/users/me/avatar")
async def upload_own_avatar(file: UploadFile = File(...), user: dict = Depends(require_user)):
    try:
        return await service.upload_avatar(user, file)
    except ServiceError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.get("/users/{user_id}/avatar")
def get_user_avatar(user_id: int):
    try:
        path, media_type = service.get_avatar_path(user_id)
    except ServiceError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc
    return FileResponse(path=str(path), media_type=media_type)


@router.get("/users/{user_id}/profile")
def get_user_profile(user_id: int):
    return invoke(service.profile, user_id)


@router.get("/users/{user_id}/enrollments")
def list_user_enrollments(user_id: int, caller: dict = Depends(require_user)):
    return invoke(service.enrollments, user_id, caller)
