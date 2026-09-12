import logging
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from api.dependencies import optional_user_id,require_user
from domain.errors import ServiceError
from schemas.catalog import CoursePayload,InstructorPayload
from services.course_service import CourseService
from services.catalog_service import CatalogService
from repositories.contribution_repository import ContributionRepository
from repositories.course_repository import CourseRepository
from db import get_connection

router=APIRouter(prefix='/api',tags=['courses'])
service=CourseService()
catalog=CatalogService()
def invoke(operation,*args,**kwargs):
    try: return operation(*args,**kwargs)
    except ServiceError as exc: raise HTTPException(exc.status_code,exc.detail) from exc
    except HTTPException: raise
    except Exception as exc:
        logging.exception('Course operation failed')
        raise HTTPException(500,'ระบบไม่สามารถทำรายการได้ กรุณาลองอีกครั้ง') from exc

def filter_params(faculty_id:int|None=Query(None,gt=0),department_id:int|None=Query(None,gt=0),academic_year:int|None=Query(None,ge=2500,le=3000),semester:Literal['1','2','summer']|None=None,department:str|None=None,instructor_ids:list[int]=Query(default=[]),tag_ids:list[int]=Query(default=[])):
    if len(instructor_ids)>30 or len(tag_ids)>16: raise HTTPException(422,'Too many filters')
    return dict(faculty_id=faculty_id,department_id=department_id,academic_year=academic_year,semester=semester,department=department,instructor_ids=instructor_ids,tag_ids=tag_ids)

@router.get('/catalog/options')
def options(): return invoke(catalog.options)
@router.get('/departments')
def departments(): return invoke(service.list_departments)
@router.get('/tags')
def tags(): return invoke(service.list_tags)
@router.get('/instructors')
def instructors(search:str=Query('',max_length=255)): return invoke(catalog.instructors,search)
@router.post('/instructors',status_code=201)
def add_instructor(payload:InstructorPayload,user:dict=Depends(require_user)): return invoke(catalog.instructor_create,payload,user)
@router.post('/courses/preview')
def preview(payload:CoursePayload,user:dict=Depends(require_user)): return invoke(catalog.preview,payload)
@router.post('/courses',status_code=201)
def create(payload:CoursePayload,user:dict=Depends(require_user)): return invoke(catalog.create,payload,user)
@router.get('/courses')
def courses(search:str=Query('',max_length=300),page:int=Query(1,ge=1),page_size:int=Query(20,ge=1,le=100),filters:dict=Depends(filter_params)):
    return invoke(service.search,search,filters=filters,page=page,page_size=page_size)
@router.get('/courses/{course_id}')
def course(course_id:int): return invoke(service.detail,course_id)
@router.get('/courses/{course_id}/reviews')
def reviews(course_id:int,caller_id:int|None=Depends(optional_user_id)): return invoke(service.reviews,course_id,caller_id)
@router.get('/courses/{course_id}/contribution-status')
def contribution_status(course_id:int,user:dict=Depends(require_user)):
    conn=get_connection()
    try:
        # Read the active content and cooldowns from one consistent database snapshot.
        conn.set_session(isolation_level='REPEATABLE READ',readonly=True)
        course=CourseRepository().get_detail(conn,course_id)
        if not course: raise HTTPException(404,'ไม่พบรายวิชา')
        return ContributionRepository().status(conn,course['course_id'],user['user_id'])
    finally: conn.close()
@router.get('/instructors/{instructor_id}/profile')
def instructor_profile(instructor_id:int): return invoke(service.instructor_profile,instructor_id)
@router.get('/dashboard/rankings')
def rankings(metric:str='reviews',min_reviews:int=Query(0,ge=0),filters:dict=Depends(filter_params)): return invoke(service.rankings,metric,min_reviews=min_reviews,filters=filters)
@router.get('/dashboard/summary')
def summary(filters:dict=Depends(filter_params)): return invoke(service.dashboard_summary,filters)
