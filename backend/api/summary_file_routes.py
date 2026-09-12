import os
import asyncio
from pathlib import Path
from uuid import UUID
from fastapi import APIRouter,Depends,File,Form,UploadFile,HTTPException,Request
from fastapi.responses import FileResponse
from api.dependencies import require_user,optional_user_id
from api.course_routes import invoke
from domain.errors import ServiceError
from schemas.summary_file import SummaryFileCommentCreate
from services.summary_file_service import SummaryFileService

router=APIRouter(prefix='/api',tags=['summary-files'])
service=SummaryFileService(Path(os.getenv('UPLOADS_DIR','/app/uploads')))
@router.post('/courses/{course_id}/summary-files',status_code=201)
async def upload(course_id:int,files:list[UploadFile]=File(...),upload_request_id:UUID|None=Form(None),user:dict=Depends(require_user)):
    # psycopg2 transactions/locks run off the ASGI event loop. Simultaneous
    # uploads must not block the event loop while another upload awaits I/O.
    try: return await asyncio.to_thread(lambda: asyncio.run(service.upload(course_id,user,files,upload_request_id=upload_request_id)))
    except ServiceError as exc: raise HTTPException(exc.status_code,exc.detail) from exc
@router.get('/courses/{course_id}/summary-files')
def listing(course_id:int,caller_id:int|None=Depends(optional_user_id)): return invoke(service.list_files,course_id,caller_id)
@router.get('/summary-files')
def all_files(caller_id:int|None=Depends(optional_user_id)): return invoke(service.list_files,None,caller_id)
@router.get('/summary-files/{file_id}/download')
def download(file_id:int,user:dict=Depends(require_user)):
    path,name,mime=invoke(service.get_download,file_id)
    return FileResponse(path,filename=name,media_type=mime,headers={'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'})
@router.post('/summary-files/{file_id}/like')
def like(file_id:int,user:dict=Depends(require_user)): return invoke(service.toggle_like,file_id,user)
@router.get('/summary-files/{file_id}/comments')
def comments(file_id:int): return invoke(service.list_comments,file_id)
@router.post('/summary-files/{file_id}/comments',status_code=201)
def comment(file_id:int,payload:SummaryFileCommentCreate,user:dict=Depends(require_user)): return invoke(service.add_comment,file_id,user,payload.content)
@router.post('/summary-files/{file_id}/report',status_code=201)
def report(file_id:int,user:dict=Depends(require_user)): return invoke(service.report,file_id,user)
@router.delete('/summary-files/{file_id}')
def delete(file_id:int,user:dict=Depends(require_user)): return invoke(service.delete,file_id,user)
@router.post('/summary-files/{file_id}/comments/{comment_id}/report',status_code=201)
def report_comment(file_id:int,comment_id:int,user:dict=Depends(require_user)): return invoke(service.comments.report,file_id,comment_id,user)
@router.put('/summary-files/{file_id}/comments/{comment_id}')
def edit_comment(file_id:int,comment_id:int,payload:SummaryFileCommentCreate,user:dict=Depends(require_user)): return invoke(service.comments.update,file_id,comment_id,user,payload.content)
@router.delete('/summary-files/{file_id}/comments/{comment_id}')
def delete_comment(file_id:int,comment_id:int,user:dict=Depends(require_user)): return invoke(service.comments.delete,file_id,comment_id,user)
