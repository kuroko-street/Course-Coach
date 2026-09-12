import os

from fastapi import Depends, Header, HTTPException, Request

from db import get_connection
from repositories.user_repository import UserRepository


user_repository = UserRepository()


def mock_auth_enabled():
    return (os.getenv("APP_ENV", "production").lower() in {"development", "test"}
            and os.getenv("ALLOW_MOCK_AUTH", "false").casefold() == "true")


def _session_user_id(request: Request, x_user_id: int | None):
    user_id = request.session.get("user_id")
    # Turning mock authentication off also revokes existing mock sessions.
    if user_id is not None and not mock_auth_enabled():
        conn = get_connection()
        try:
            if user_repository.find_mock_by_id(conn, user_id):
                request.session.clear()
                return None
        finally:
            conn.close()
    if user_id is None and x_user_id is not None and mock_auth_enabled():
        conn = get_connection()
        try:
            mock = user_repository.find_mock_by_id(conn, x_user_id)
            user_id = mock["user_id"] if mock else None
        finally:
            conn.close()
    return user_id


def require_user(
    request: Request,
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
):
    user_id = _session_user_id(request, x_user_id)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    conn = get_connection()
    try:
        user = user_repository.find_by_id(conn, user_id)
    finally:
        conn.close()
    if user is None:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Authenticated user no longer exists.")
    return user


def require_admin(user: dict = Depends(require_user)):
    if user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin role required for this endpoint.")
    return user


def optional_user_id(
    request: Request,
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
):
    return _session_user_id(request, x_user_id)
