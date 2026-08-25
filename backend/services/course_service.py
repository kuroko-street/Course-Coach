from db import get_connection
from domain.errors import ServiceError
from repositories.course_repository import CourseRepository


class CourseService:
    DASHBOARD_METRICS = frozenset(CourseRepository.RANKING_COLUMNS)
    def __init__(self, connection_factory=get_connection):
        self.connection_factory = connection_factory
        self.courses = CourseRepository()

    @staticmethod
    def mock_offerings(course_id):
        sections, offerings = ["001", "002", "003"], []
        for year in (2566, 2567):
            for semester in ("1", "2"):
                count = 1 + ((course_id + year + int(semester)) % len(sections))
                offerings.append({"academic_year": year, "semester": semester, "sections": sections[:count]})
        return offerings

    def _read(self, operation, *args):
        conn = self.connection_factory()
        try:
            return operation(conn, *args)
        finally:
            conn.close()

    def list_departments(self):
        return {"departments": self._read(self.courses.list_departments)}

    def list_tags(self):
        return {"tags": self._read(self.courses.list_tags)}

    def search(self, search=None, department=None):
        return {"courses": self._read(self.courses.search, search, department)}

    def detail(self, course_id):
        result = self._read(self.courses.get_detail, course_id)
        if result is None:
            raise ServiceError(404, f"Course id {course_id} not found.")
        course, instructors, tags, averages = result
        return {**course, "instructors": instructors, "tags": tags, "averages": averages,
                "offerings": self.mock_offerings(course_id)}

    def instructor_profile(self, instructor_id):
        result = self._read(self.courses.get_instructor_profile, instructor_id)
        if result is None:
            raise ServiceError(404, f"Instructor id {instructor_id} not found.")
        instructor, courses = result
        return {"instructor": instructor, "courses": courses}

    def reviews(self, course_id, caller_id=None):
        return {"reviews": self._read(self.courses.list_reviews, course_id, caller_id)}

    def my_enrollments(self, course_id, user_id):
        return {"enrollments": self._read(self.courses.list_my_enrollments, user_id, course_id)}

    def dashboard_summary(self):
        return {"summary": self._read(self.courses.dashboard_summary)}

    def rankings(self, metric="reviews", department=None, min_reviews=0):
        if metric not in self.DASHBOARD_METRICS:
            raise ServiceError(400, f"Unsupported dashboard metric: {metric}.")
        return {
            "metric": metric,
            "department": department or None,
            "min_reviews": min_reviews,
            "rankings": self._read(
                self.courses.rankings, metric, department, min_reviews
            ),
        }
