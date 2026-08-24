from db import get_connection
from auth import GoogleIdentityError
from domain.errors import ServiceError
from repositories.audit_log_repository import AuditLogRepository
from repositories.user_repository import UserRepository


class UserService:
    def __init__(self, connection_factory=get_connection, google_verifier=None):
        self.connection_factory = connection_factory
        self.users = UserRepository()
        self.audit = AuditLogRepository()
        self.google_verifier = google_verifier

    def list_users(self):
        conn = self.connection_factory()
        try:
            return {"users": self.users.list_all(conn)}
        finally:
            conn.close()

    def login_mock(self, user_id, ip_address=None):
        conn = self.connection_factory()
        try:
            user = self.users.find_by_id(conn, user_id)
            if user is None:
                raise ServiceError(404, f"User id {user_id} not found.")
            self.audit.create(conn, user_id, "LOGIN", user_id, ip_address)
            conn.commit()
            return {"user": user, "message": f"Logged in as {user['username']}."}
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
        user, reviews, averages, total_likes = result
        return {"user": user, "averages": averages, "total_likes": total_likes,
                "review_count": len(reviews), "reviews": reviews}

    def enrollments(self, requested_user_id, caller):
        if caller["user_id"] != requested_user_id:
            raise ServiceError(403, "You can only view your own enrollment / review-eligibility list.")
        conn = self.connection_factory()
        try:
            return {"enrollments": self.users.list_enrollments(conn, requested_user_id)}
        finally:
            conn.close()
