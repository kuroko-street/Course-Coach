import asyncio
from pathlib import Path
import uuid
import zipfile
import xml.etree.ElementTree as ET

from PIL import Image
from pypdf import PdfReader
from db import get_connection,dict_cursor
from domain.errors import ServiceError
from repositories.summary_file_repository import SummaryFileRepository
from repositories.audit_log_repository import AuditLogRepository
from repositories.review_repository import ReviewRepository
from repositories.contribution_repository import ContributionRepository
from services.content_comment_service import ContentCommentService

class SummaryFileService:
    MAX_FILE_SIZE_BYTES=20*1024*1024
    MIME={'.pdf':'application/pdf','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png',
          '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
    def __init__(self,uploads_dir=None,connection_factory=get_connection):
        self.uploads_dir=Path(uploads_dir or '/app/uploads').resolve()
        self.uploads_dir.mkdir(parents=True,exist_ok=True)
        self.connection_factory=connection_factory
        self.files=SummaryFileRepository()
        self.quotas=ContributionRepository()
        self.audit=AuditLogRepository()
        self.comments=ContentCommentService('file',connection_factory,self.files.find_by_id_for_update,self.audit)
    @staticmethod
    def active(row):
        if row is None or row['status']!='ACTIVE': raise ServiceError(404,'ไม่พบไฟล์ที่เปิดเผย')
        return row
    @classmethod
    def validate_file(cls,path,extension):
        try:
            if extension in {'.jpg','.jpeg','.png'}:
                with Image.open(path) as im:
                    if im.format!=('PNG' if extension=='.png' else 'JPEG'): raise ValueError('Image format mismatch')
                    im.verify()
            elif extension=='.pdf':
                with path.open('rb') as stream:
                    if stream.read(5)!=b'%PDF-': raise ValueError('PDF signature missing')
                    stream.seek(0)
                    pdf=PdfReader(stream,strict=True)
                    if pdf.is_encrypted or not len(pdf.pages): raise ValueError('Encrypted or empty PDF')
                    if any(k in pdf.trailer['/Root'] for k in ('/OpenAction','/AA')): raise ValueError('Active PDF not allowed')
            else:
                expected={'.docx':('word/document.xml','wordprocessingml.document.main+xml'),'.pptx':('ppt/presentation.xml','presentationml.presentation.main+xml'),'.xlsx':('xl/workbook.xml','spreadsheetml.sheet.main+xml')}[extension]
                with zipfile.ZipFile(path) as archive:
                    parts=archive.infolist()
                    if len(parts)>5000 or sum(p.file_size for p in parts)>100*1024*1024: raise ValueError('Expanded archive too large')
                    names={p.filename for p in parts}
                    if expected[0] not in names or '[Content_Types].xml' not in names: raise ValueError('Office content missing')
                    for part in parts:
                        lower=part.filename.lower()
                        if part.flag_bits&1 or lower.startswith('/') or '..' in Path(lower).parts or any(x in lower for x in ('vbaproject','/embeddings/','activex')) or lower.endswith(('.exe','.dll','.js','.vbs')): raise ValueError('Unsafe Office content')
                        if part.file_size>0 and part.file_size/max(1,part.compress_size)>500: raise ValueError('Suspicious compression')
                    manifest=ET.fromstring(archive.read('[Content_Types].xml'))
                    if not any(node.attrib.get('PartName')=='/'+expected[0] and node.attrib.get('ContentType','').endswith(expected[1]) for node in manifest): raise ValueError('Office type mismatch')
                    ET.fromstring(archive.read(expected[0]))
        except ServiceError: raise
        except Exception as exc: raise ServiceError(422,'เนื้อหาไฟล์ไม่ตรงชนิด ไฟล์เสีย หรือมีเนื้อหาแบบทำงานอัตโนมัติที่ไม่รองรับ') from exc

    async def upload(self,course_id,user,uploads,ip_address=None,upload_request_id=None):
        if not uploads: raise ServiceError(422,'กรุณาเลือกไฟล์')
        request_id=str(upload_request_id or uuid.uuid4())
        conn=self.connection_factory(); stored=[]
        try:
            self.quotas.lock(conn,course_id,user['user_id'])
            if not ReviewRepository().course_exists(conn,course_id): raise ServiceError(404,'ไม่พบรายวิชา')
            with dict_cursor(conn) as cur:
                cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(f'upload:{user["user_id"]}:{request_id}',))
                cur.execute('SELECT upload_batch_id,course_id FROM summary_file_upload_batches WHERE uploader_id=%s AND upload_request_id=%s',(user['user_id'],request_id))
                existing=cur.fetchone()
                if existing:
                    if existing['course_id']!=course_id: raise ServiceError(409,'Upload request ID already used')
                    cur.execute('SELECT file_id,filename,size_bytes,status FROM summary_files WHERE upload_batch_id=%s ORDER BY file_id',(existing['upload_batch_id'],))
                    return {'files':cur.fetchall(),'upload_batch_id':existing['upload_batch_id'],'idempotent':True}
                self.quotas.require_file_slots(conn,course_id,user['user_id'],len(uploads))
                cur.execute('INSERT INTO summary_file_upload_batches(course_id,uploader_id,upload_request_id) VALUES(%s,%s,%s) RETURNING upload_batch_id',(course_id,user['user_id'],request_id))
                batch_id=cur.fetchone()['upload_batch_id']
            result=[]
            for upload in uploads:
                filename=(upload.filename or '').replace('\\','/').rsplit('/',1)[-1].strip()
                extension=Path(filename).suffix.lower()
                if not filename or len(filename)>255 or any(ord(c)<32 for c in filename) or extension not in self.MIME: raise ServiceError(422,'รองรับ PDF, JPG, PNG, DOCX, PPTX และ XLSX เท่านั้น')
                path=self.uploads_dir/(uuid.uuid4().hex+extension); stored.append(path)
                size=0
                with path.open('xb') as destination:
                    while chunk:=await upload.read(1024*1024):
                        size+=len(chunk)
                        if size>self.MAX_FILE_SIZE_BYTES: raise ServiceError(413,'ไฟล์ต้องไม่เกิน 20 MB (20,971,520 bytes)')
                        destination.write(chunk)
                if not size: raise ServiceError(422,'ไฟล์ว่าง')
                await asyncio.to_thread(self.validate_file,path,extension)
                with dict_cursor(conn) as cur:
                    cur.execute('INSERT INTO summary_files(upload_batch_id,filename,stored_path,mime_type,size_bytes) VALUES(%s,%s,%s,%s,%s) RETURNING file_id,filename,size_bytes,status',(batch_id,filename,str(path),self.MIME[extension],size))
                    file=cur.fetchone(); result.append(file)
                    self.audit.create(conn,user['user_id'],'UPLOAD_SUMMARY_FILE',file['file_id'],ip_address)
            conn.commit()
            return {'files':result,'upload_batch_id':batch_id}
        except Exception:
            conn.rollback()
            for path in stored: path.unlink(missing_ok=True)
            raise
        finally:
            conn.close()
            for upload in uploads: await upload.close()

    def list_files(self,course_id=None,caller_id=None):
        conn=self.connection_factory()
        try:
            if course_id is not None:
                from repositories.course_repository import CourseRepository
                course=CourseRepository().get_detail(conn,course_id)
                if not course: raise ServiceError(404,'ไม่พบรายวิชา')
                course_id=course['course_id']
            return {'files':self.files.list(conn,course_id,caller_id)}
        finally: conn.close()
    def get_download(self,file_id):
        conn=self.connection_factory()
        try: row=self.active(self.files.find(conn,file_id))
        finally: conn.close()
        path=Path(row['stored_path']).resolve()
        if not path.is_relative_to(self.uploads_dir) or not path.is_file(): raise ServiceError(404,'ไม่พบไฟล์ต้นฉบับ')
        return path,row['filename'],row['mime_type']
    def _write(self,operation):
        conn=self.connection_factory()
        try:
            result=operation(conn); conn.commit(); return result
        except Exception: conn.rollback(); raise
        finally: conn.close()
    def toggle_like(self,file_id,user):
        def operation(conn):
            self.active(self.files.find_by_id_for_update(conn,file_id))
            with dict_cursor(conn) as cur:
                cur.execute('DELETE FROM summary_file_likes WHERE file_id=%s AND user_id=%s RETURNING like_id',(file_id,user['user_id']))
                liked=cur.fetchone() is None
                if liked: cur.execute('INSERT INTO summary_file_likes(file_id,user_id) VALUES(%s,%s)',(file_id,user['user_id']))
                cur.execute('SELECT COUNT(*) AS n FROM summary_file_likes WHERE file_id=%s',(file_id,))
                return {'liked':liked,'like_count':cur.fetchone()['n']}
        return self._write(operation)
    def list_comments(self,file_id):
        conn=self.connection_factory()
        try:
            self.active(self.files.find(conn,file_id))
            return {'comments':self.files.comments(conn,file_id)}
        finally: conn.close()
    def add_comment(self,file_id,user,content):
        if not content.strip(): raise ServiceError(422,'กรุณาเขียนความคิดเห็น')
        def operation(conn):
            self.active(self.files.find_by_id_for_update(conn,file_id))
            with dict_cursor(conn) as cur:
                cur.execute('INSERT INTO summary_file_comments(file_id,user_id,content) VALUES(%s,%s,%s) RETURNING comment_id',(file_id,user['user_id'],content.strip()))
                return cur.fetchone()
        return self._write(operation)
    def report(self,file_id,user,ip_address=None):
        def operation(conn):
            row=self.active(self._lock_file(conn,file_id))
            if row['uploader_id']==user['user_id']: raise ServiceError(409,'รายงานไฟล์ของตัวเองไม่ได้')
            with dict_cursor(conn) as cur:
                cur.execute('INSERT INTO summary_file_reports(file_id,reporter_id) VALUES(%s,%s) ON CONFLICT DO NOTHING RETURNING report_id',(file_id,user['user_id']))
                if cur.fetchone() is None: raise ServiceError(409,'คุณรายงานไฟล์นี้แล้ว')
                cur.execute("UPDATE summary_files SET report_count=report_count+1,status=CASE WHEN report_count+1>=5 THEN 'HIDDEN'::summary_file_status ELSE status END WHERE file_id=%s RETURNING report_count,status",(file_id,))
                state=cur.fetchone()
            self.audit.create(conn,user['user_id'],'REPORT_SUMMARY_FILE',file_id,ip_address)
            if state['status']=='HIDDEN': self.quotas.record_hide(conn,row,'file')
            return {**state,'auto_hidden':state['status']=='HIDDEN'}
        return self._write(operation)
    def delete(self,file_id,user,ip_address=None):
        def operation(conn):
            row=self._lock_file(conn,file_id)
            if not row or row['status']=='DELETED': raise ServiceError(404,'ไม่พบไฟล์')
            if row['uploader_id']!=user['user_id']: raise ServiceError(403,'ลบได้เฉพาะไฟล์ของตัวเอง')
            with conn.cursor() as cur: cur.execute("UPDATE summary_files SET status='DELETED',deleted_at=NOW() WHERE file_id=%s",(file_id,))
            self.audit.create(conn,user['user_id'],'DELETE_SUMMARY_FILE',file_id,ip_address)
            return {'file_id':file_id,'status':'DELETED'}
        return self._write(operation)

    def _lock_file(self,conn,file_id):
        # Read the course only after preventing a concurrent merge from moving it.
        self.quotas.lock_tables(conn)
        row=self.files.find(conn,file_id)
        if row: self.quotas.lock(conn,row['course_id'],row['uploader_id'])
        return self.files.find_by_id_for_update(conn,file_id)
