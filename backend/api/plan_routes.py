from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import require_user
from domain.errors import ServiceError
from schemas.plan import PlanCreate, PlanItemCreate, PlanItemMove, PlanUpdate
from services.plan_service import PlanService


router = APIRouter(prefix="/api", tags=["plans"])
service = PlanService()


def invoke(operation, *args):
    try:
        return operation(*args)
    except ServiceError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.get("/plans")
def list_plans(user: dict = Depends(require_user)):
    return invoke(service.list_plans, user)


@router.post("/plans", status_code=201)
def create_plan(payload: PlanCreate, user: dict = Depends(require_user)):
    return invoke(service.create_plan, user, payload)


@router.get("/plans/{plan_id}")
def get_plan(plan_id: int, user: dict = Depends(require_user)):
    return invoke(service.get_plan, plan_id, user)


@router.put("/plans/{plan_id}")
def rename_plan(plan_id: int, payload: PlanUpdate, user: dict = Depends(require_user)):
    return invoke(service.rename_plan, plan_id, user, payload)


@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: int, user: dict = Depends(require_user)):
    return invoke(service.delete_plan, plan_id, user)


@router.post("/plans/{plan_id}/items", status_code=201)
def add_plan_item(plan_id: int, payload: PlanItemCreate, user: dict = Depends(require_user)):
    return invoke(service.add_item, plan_id, user, payload)


@router.put("/plans/{plan_id}/items/{item_id}")
def move_plan_item(plan_id: int, item_id: int, payload: PlanItemMove, user: dict = Depends(require_user)):
    return invoke(service.move_item, plan_id, item_id, user, payload)


@router.delete("/plans/{plan_id}/items/{item_id}")
def delete_plan_item(plan_id: int, item_id: int, user: dict = Depends(require_user)):
    return invoke(service.delete_item, plan_id, item_id, user)
