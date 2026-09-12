from fastapi import APIRouter,Depends,Query
from pydantic import BaseModel,ConfigDict
from api.dependencies import require_admin
from api.course_routes import invoke,filter_params
from schemas.catalog import CoursePayload,MergePreviewPayload,MergeConfirmPayload
from services.catalog_service import CatalogService
from services.course_service import CourseService
from db import get_connection,dict_cursor

router=APIRouter(prefix='/api',tags=['admin'])
catalog=CatalogService()
courses=CourseService()
class CourseStatus(BaseModel):
    model_config=ConfigDict(extra='forbid')
    is_active:bool

@router.get('/admin/courses')
def list_courses(search:str=Query('',max_length=300),code:str|None=None,page:int=Query(1,ge=1),page_size:int=Query(50,ge=1,le=100),filters:dict=Depends(filter_params),admin:dict=Depends(require_admin)):
    return invoke(courses.search,search,filters={**filters,'code':code},page=page,page_size=page_size,admin=True)
@router.put('/admin/courses/{course_id}')
def update(course_id:int,payload:CoursePayload,admin:dict=Depends(require_admin)): return invoke(catalog.update,course_id,payload,admin)
@router.patch('/admin/courses/{course_id}/status')
def status(course_id:int,payload:CourseStatus,admin:dict=Depends(require_admin)): return invoke(catalog.status,course_id,payload.is_active,admin)
@router.post('/admin/courses/merge/preview')
def merge_preview(payload:MergePreviewPayload,admin:dict=Depends(require_admin)): return invoke(catalog.merge_preview,payload,admin)
@router.post('/admin/courses/merge')
def merge(payload:MergeConfirmPayload,admin:dict=Depends(require_admin)): return invoke(catalog.merge,payload,admin)
@router.get('/admin/merge-history')
def history(admin:dict=Depends(require_admin)): return invoke(catalog.history)
@router.get('/audit-logs')
def audit(limit:int=Query(50,ge=1,le=200),admin:dict=Depends(require_admin)):
    conn=get_connection()
    try:
        with dict_cursor(conn) as cur:
            cur.execute('SELECT log_id,timestamp,user_id,action,target_id FROM audit_logs ORDER BY log_id DESC LIMIT %s',(limit,))
            return {'logs':cur.fetchall()}
    finally: conn.close()
