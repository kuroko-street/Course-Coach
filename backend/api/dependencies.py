import os

from fastapi import Depends, Header, HTTPException, Request

from db import get_connection
from repositories.user_repository import UserRepository


user_repository = UserRepository()


def _session_user_id(request: Request, x_user_id: int | None):
    user_id = request.session.get("user_id")
    allow_mock = os.getenv("ALLOW_MOCK_AUTH", "false").casefold() == "true"
    if user_id is None and allow_mock:
        user_id = x_user_id
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
