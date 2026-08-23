from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import optional_user_id, require_user
from domain.errors import ServiceError
from services.course_service import CourseService


router = APIRouter(prefix="/api", tags=["courses"])
service = CourseService()


def invoke(operation, *args):
    try:
        return operation(*args)
    except ServiceError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.get("/departments")
def list_departments():
    return invoke(service.list_departments)


@router.get("/tags")
def list_tags():
    return invoke(service.list_tags)


@router.get("/courses")
def list_courses(search: str | None = None, department: str | None = None):
    return invoke(service.search, search, department)


@router.get("/courses/{course_id}")
def get_course(course_id: int):
    return invoke(service.detail, course_id)


@router.get("/courses/{course_id}/reviews")
def list_course_reviews(
    course_id: int,
    caller_id: int | None = Depends(optional_user_id),
):
    return invoke(service.reviews, course_id, caller_id)


@router.get("/courses/{course_id}/enrollments/me")
def my_course_enrollments(course_id: int, user: dict = Depends(require_user)):
    return invoke(service.my_enrollments, course_id, user["user_id"])


@router.get("/dashboard/rankings")
def dashboard_rankings():
    return invoke(service.rankings)
