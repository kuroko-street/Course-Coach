from fastapi import APIRouter, Depends, HTTPException, Request

from api.dependencies import require_user
from domain.errors import ServiceError
from schemas.review import CommentCreate, ReviewCreate, ReviewUpdate
from services.review_service import ReviewService


router = APIRouter(prefix="/api", tags=["reviews"])
review_service = ReviewService()


def client_ip(request: Request):
    return request.client.host if request.client else None


def invoke(operation, *args, **kwargs):
    try:
        return operation(*args, **kwargs)
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/reviews", status_code=201)
def create_review(
    payload: ReviewCreate,
    request: Request,
    user: dict = Depends(require_user),
):
    return invoke(review_service.create_review, user, payload, client_ip(request))


@router.put("/reviews/{review_id}")
def update_review(
    review_id: int,
    payload: ReviewUpdate,
    request: Request,
    user: dict = Depends(require_user),
):
    return invoke(review_service.update_review, review_id, user, payload, client_ip(request))


@router.delete("/reviews/{review_id}")
def delete_review(
    review_id: int,
    request: Request,
    user: dict = Depends(require_user),
):
    return invoke(review_service.delete_review, review_id, user, client_ip(request))


@router.post("/reviews/{review_id}/like", status_code=201)
def like_review(review_id: int, user: dict = Depends(require_user)):
    return invoke(review_service.like_review, review_id, user)


@router.delete("/reviews/{review_id}/like")
def unlike_review(review_id: int, user: dict = Depends(require_user)):
    return invoke(review_service.unlike_review, review_id, user)


@router.get("/reviews/{review_id}/comments")
def list_comments(review_id: int):
    return invoke(review_service.list_comments, review_id)


@router.post("/reviews/{review_id}/comments", status_code=201)
def create_comment(
    review_id: int,
    payload: CommentCreate,
    user: dict = Depends(require_user),
):
    return invoke(review_service.add_comment, review_id, user, payload.content)


@router.post("/reviews/{review_id}/report", status_code=201)
def report_review(
    review_id: int,
    request: Request,
    user: dict = Depends(require_user),
):
    return invoke(review_service.report_review, review_id, user, client_ip(request))
