import mimetypes
import uuid
from pathlib import Path

from db import get_connection
from auth import GoogleIdentityError
from domain.errors import ServiceError
from repositories.audit_log_repository import AuditLogRepository
from repositories.user_repository import UserRepository


class UserService:
    MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024
    CHUNK_SIZE_BYTES = 1024 * 1024
    ALLOWED_AVATAR_TYPES = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }

    def __init__(self, connection_factory=get_connection, google_verifier=None, avatars_dir=None):
        self.connection_factory = connection_factory
        self.users = UserRepository()
        self.audit = AuditLogRepository()
        self.google_verifier = google_verifier
        self.avatars_dir = Path(avatars_dir or "/app/avatars")
        self.avatars_dir.mkdir(parents=True, exist_ok=True)

    def list_users(self):
        conn = self.connection_factory()
        try:
            return {"users": self.users.list_all(conn)}
        finally:
            conn.close()

    def list_mock_users(self):
        conn = self.connection_factory()
        try:
            return {"users": self.users.list_mock_users(conn)}
        finally:
            conn.close()

    def login_mock(self, user_id, ip_address=None):
        conn = self.connection_factory()
        try:
            user = self.users.find_mock_by_id(conn, user_id)
            if user is None:
                raise ServiceError(404, f"Mock user id {user_id} not found.")
            self.audit.create(conn, user_id, "LOGIN", user_id, ip_address)
            conn.commit()
            return {"user": user, "message": f"Logged in as {user['display_name']}."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def login_google(self, credential, ip_address=None):
        if self.google_verifier is None:
            raise ServiceError(503, "Google login is not configured.")
        try:
            identity = self.google_verifier.verify(credential)
        except GoogleIdentityError as exc:
            raise ServiceError(401, str(exc)) from exc

        conn = self.connection_factory()
        try:
            user = self.users.find_or_create_google_user(
                conn,
                identity["sub"],
                identity["email"],
                identity.get("name"),
                identity.get("picture"),
            )
            self.audit.create(conn, user["user_id"], "LOGIN", user["user_id"], ip_address)
            conn.commit()
            return user
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def profile(self, user_id):
        conn = self.connection_factory()
        try:
            result = self.users.get_profile(conn, user_id)
        finally:
            conn.close()
        if result is None:
            raise ServiceError(404, f"User id {user_id} not found.")
        user, reviews, total_likes = result
        return {"user": user, "total_likes": total_likes,
                "review_count": len(reviews), "reviews": reviews}

    def update_profile(self, user, data):
        conn = self.connection_factory()
        try:
            updated = self.users.update_display_name(conn, user["user_id"], data.display_name.strip())
            conn.commit()
            return {"user": updated, "message": "Profile updated."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    async def upload_avatar(self, user, upload):
        content_type = (upload.content_type or "").lower()
        extension = self.ALLOWED_AVATAR_TYPES.get(content_type)
        if extension is None:
            raise ServiceError(400, "Only JPEG, PNG, or WEBP images are allowed.")

        user_dir = self.avatars_dir / str(user["user_id"])
        user_dir.mkdir(parents=True, exist_ok=True)
        stored_path = user_dir / f"{uuid.uuid4().hex}{extension}"
        size = 0
        try:
            with stored_path.open("wb") as destination:
                while chunk := await upload.read(self.CHUNK_SIZE_BYTES):
                    size += len(chunk)
                    if size > self.MAX_AVATAR_SIZE_BYTES:
                        raise ServiceError(413, "Avatar image exceeds the 5MB limit.")
                    destination.write(chunk)
        except Exception:
            stored_path.unlink(missing_ok=True)
            raise

        for existing_file in user_dir.iterdir():
            if existing_file != stored_path:
                existing_file.unlink(missing_ok=True)

        conn = self.connection_factory()
        try:
            avatar_url = f"/api/users/{user['user_id']}/avatar?v={uuid.uuid4().hex[:8]}"
            updated = self.users.update_avatar_url(conn, user["user_id"], avatar_url)
            conn.commit()
            return {"user": updated, "message": "Avatar updated."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def get_avatar_path(self, user_id):
        user_dir = self.avatars_dir / str(user_id)
        if user_dir.is_dir():
            for stored_file in sorted(user_dir.iterdir()):
                if stored_file.is_file():
                    media_type = mimetypes.guess_type(stored_file.name)[0] or "application/octet-stream"
                    return stored_file, media_type
        raise ServiceError(404, f"No avatar uploaded for user id {user_id}.")

    def enrollments(self, requested_user_id, caller):
        if caller["user_id"] != requested_user_id:
            raise ServiceError(403, "You can only view your own enrollment / review-eligibility list.")
        conn = self.connection_factory()
        try:
            return {"enrollments": self.users.list_enrollments(conn, requested_user_id)}
        finally:
            conn.close()
