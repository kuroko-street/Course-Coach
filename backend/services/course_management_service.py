import psycopg2

from db import get_connection
from domain.errors import ServiceError
from repositories.audit_log_repository import AuditLogRepository
from repositories.course_management_repository import CourseManagementRepository


class CourseManagementService:
    def __init__(self, connection_factory=get_connection):
        self.connection_factory = connection_factory
        self.courses = CourseManagementRepository()
        self.audit = AuditLogRepository()

    def list_courses(self):
        conn = self.connection_factory()
        try:
            return {"courses": self.courses.list_courses(conn)}
        finally:
            conn.close()

    def list_instructors(self):
        conn = self.connection_factory()
        try:
            return {"instructors": self.courses.list_instructors(conn)}
        finally:
            conn.close()

    def create_instructor(self, data, admin, ip_address=None):
        name = data.name.strip()
        conn = self.connection_factory()
        try:
            if self.courses.find_instructor_by_name(conn, name):
                raise ServiceError(409, "An instructor with this name already exists.")
            created = self.courses.create_instructor(conn, name)
            self.audit.create(conn, admin["user_id"], "MANAGE_COURSE", created["instructor_id"], ip_address)
            conn.commit()
            return {"instructor": created, "message": "Instructor created."}
        except ServiceError:
            conn.rollback()
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def list_curriculums(self):
        conn = self.connection_factory()
        try:
            return {"curriculums": self.courses.list_curriculums(conn)}
        finally:
            conn.close()

    def create_curriculum(self, data, admin, ip_address=None):
        conn = self.connection_factory()
        try:
            created = self.courses.create_curriculum(conn, data)
            self.audit.create(conn, admin["user_id"], "MANAGE_COURSE", created["curriculum_id"], ip_address)
            conn.commit()
            return {"curriculum": created, "message": "Curriculum created."}
        except psycopg2.IntegrityError as exc:
            conn.rollback()
            raise ServiceError(409, "A curriculum with this name and year already exists.") from exc
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def create_course(self, data, admin, ip_address=None):
        return self._write_course(None, data, admin, ip_address)

    def update_course(self, course_id, data, admin, ip_address=None):
        return self._write_course(course_id, data, admin, ip_address)

    def _write_course(self, course_id, data, admin, ip_address):
        conn = self.connection_factory()
        try:
            mappings = data.curriculum_mappings
            ids = [item.curriculum_id for item in mappings]
            tag_names = self._normalize_tags(data.tag_names)
            instructor_names = self._normalize_instructors(data.instructor_names)
            if len(ids) != len(set(ids)):
                raise ServiceError(422, "A course can be mapped to each curriculum only once.")
            if not self.courses.curriculums_exist(conn, ids):
                raise ServiceError(422, "One or more selected curriculums do not exist or are inactive.")
            if course_id is None:
                course_id = self.courses.create_course(conn, data)
                message = "Course created."
            else:
                if self.courses.lock_course(conn, course_id) is None:
                    raise ServiceError(404, f"Course id {course_id} not found.")
                self.courses.update_course(conn, course_id, data)
                message = "Course updated."
            self.courses.replace_mappings(conn, course_id, mappings)
            self.courses.replace_tags(conn, course_id, tag_names)
            self.courses.replace_instructors(conn, course_id, instructor_names)
            self.audit.create(conn, admin["user_id"], "MANAGE_COURSE", course_id, ip_address)
            conn.commit()
            return {"course_id": course_id, "message": message}
        except psycopg2.IntegrityError as exc:
            conn.rollback()
            raise ServiceError(409, "Course code already exists.") from exc
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def _normalize_tags(tag_names):
        normalized = [name.strip() for name in tag_names if name and name.strip()]
        if len(normalized) != len(set(normalized)):
            raise ServiceError(422, "Each tag can be used only once per course.")
        if any(len(name) > 100 for name in normalized):
            raise ServiceError(422, "A tag must be at most 100 characters.")
        return normalized

    @staticmethod
    def _normalize_instructors(instructor_names):
        normalized = [name.strip() for name in instructor_names if name and name.strip()]
        if len(normalized) != len(set(normalized)):
            raise ServiceError(422, "Each instructor can be assigned only once per course.")
        if any(len(name) > 255 for name in normalized):
            raise ServiceError(422, "An instructor name must be at most 255 characters.")
        return normalized

    def set_status(self, course_id, is_active, admin, ip_address=None):
        conn = self.connection_factory()
        try:
            if self.courses.lock_course(conn, course_id) is None:
                raise ServiceError(404, f"Course id {course_id} not found.")
            updated = self.courses.set_status(conn, course_id, is_active)
            self.audit.create(conn, admin["user_id"], "MANAGE_COURSE", course_id, ip_address)
            conn.commit()
            return {**updated, "message": "Course activated." if is_active else "Course hidden from the catalog."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
