from fastapi import Depends, Header, HTTPException

from db import get_connection
from repositories.user_repository import UserRepository


user_repository = UserRepository()


def require_user(x_user_id: int | None = Header(default=None, alias="X-User-Id")):
    if x_user_id is None:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header.")
    conn = get_connection()
    try:
        user = user_repository.find_by_id(conn, x_user_id)
    finally:
        conn.close()
    if user is None:
        raise HTTPException(status_code=401, detail=f"Unknown user id {x_user_id}.")
    return user


def require_admin(user: dict = Depends(require_user)):
    if user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin role required for this endpoint.")
    return user


def optional_user_id(x_user_id: int | None = Header(default=None, alias="X-User-Id")):
    return x_user_id
