from datetime import datetime
import os

from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from psycopg2.errors import UniqueViolation
from db import get_connection, dict_cursor
from domain.errors import ServiceError
from repositories.catalog_repository import CatalogRepository, fingerprint
from repositories.course_repository import CourseRepository


class CatalogService:
    def __init__(self,connection_factory=get_connection):
        self.connection_factory=connection_factory
        self.repo=CatalogRepository()
        self.signer=URLSafeTimedSerializer(os.getenv('SESSION_SECRET','community-local-dev-change-before-cloud'),salt='merge-preview-v1')

    def options(self):
        conn=self.connection_factory()
        try:
            result=self.repo.options(conn)
            year=datetime.now().year+543
            with dict_cursor(conn) as cur:
                cur.execute('SELECT DISTINCT academic_year FROM courses WHERE is_active AND merged_into_course_id IS NULL')
                result['academic_years']=sorted(set(range(year-5,year+3))|{x['academic_year'] for x in cur.fetchall()},reverse=True)
            return result
        finally: conn.close()

    def instructors(self,search=''):
        conn=self.connection_factory()
        try: return {'instructors':self.repo.instructors(conn,search)}
        finally: conn.close()

    def _write(self,operation):
        conn=self.connection_factory()
        try:
            result=operation(conn)
            conn.commit()
            return result
        except Exception:
            conn.rollback(); raise
        finally: conn.close()

    def instructor_create(self,payload,user):
        return self._write(lambda conn: {'instructor':self.repo.add_instructor(conn,payload,user['user_id'])})

    @staticmethod
    def duplicate_error(duplicate):
        return ServiceError(409,{'message':'มีรายการนี้แล้ว เปิดรายวิชาเดิมได้เลย','duplicate':duplicate,'course_id':duplicate['course_id']})

    def preview(self,payload):
        conn=self.connection_factory()
        try:
            data=self.repo.validate(conn,payload)
            with dict_cursor(conn) as cur:
                cur.execute('SELECT instructor_id,name,affiliation FROM instructors WHERE instructor_id=ANY(%s) ORDER BY name,instructor_id',(data['instructor_ids'],))
                data['instructors']=cur.fetchall()
                cur.execute('SELECT name FROM faculties WHERE faculty_id=%s',(data['faculty_id'],))
                data['faculty_name']=cur.fetchone()['name']
            return {'duplicate':self.repo.duplicate(conn,data),'similar_courses':self.repo.similar(conn,data),'course':data}
        finally: conn.close()

    def create(self,payload,user):
        def operation(conn):
            # Serialize equal identities to return a friendly duplicate under races.
            data=self.repo.validate(conn,payload)
            with conn.cursor() as cur:
                cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(fingerprint([data[k] for k in ('university_id','code_normalized','name_normalized','academic_year','semester','instructor_key')]),))
            duplicate=self.repo.duplicate(conn,data)
            if duplicate: raise self.duplicate_error(duplicate)
            try: row=self.repo.insert_course(conn,data,user['user_id'])
            except UniqueViolation as exc: raise ServiceError(409,'รายวิชาถูกสร้างพร้อมกัน กรุณาค้นหาอีกครั้ง') from exc
            self.repo.audit(conn,user['user_id'],'CREATE_COURSE',row['course_id'],after=row)
            return {'course_id':row['course_id'],'course':row}
        return self._write(operation)

    @staticmethod
    def require_admin(user):
        if user['role']!='ADMIN': raise ServiceError(403,'Admin required')

    def update(self,course_id,payload,user):
        self.require_admin(user)
        def operation(conn):
            before=self.repo.lock_courses(conn,[course_id])[0]
            data=self.repo.validate(conn,payload)
            duplicate=self.repo.duplicate(conn,data,[course_id])
            if duplicate: raise self.duplicate_error(duplicate)
            if before['course_name']!=data['course_name'] or before['course_code']!=data['course_code']: self.repo.preserve_name(conn,before)
            try: row=self.repo.update_course(conn,course_id,data)
            except UniqueViolation as exc: raise ServiceError(409,'ข้อมูลชนกับรายวิชาที่มีอยู่ กรุณาใช้การรวมรายวิชา') from exc
            self.repo.audit(conn,user['user_id'],'EDIT_COURSE',course_id,before,row)
            return {'course':row}
        return self._write(operation)

    def status(self,course_id,is_active,user):
        self.require_admin(user)
        def operation(conn):
            before=self.repo.lock_courses(conn,[course_id])[0]
            with conn.cursor() as cur: cur.execute('UPDATE courses SET is_active=%s,updated_at=clock_timestamp() WHERE course_id=%s',(is_active,course_id))
            self.repo.audit(conn,user['user_id'],'COURSE_STATUS',course_id,before,{'is_active':is_active})
            return {'course_id':course_id,'is_active':is_active}
        return self._write(operation)

    def merge_preview(self,payload,user):
        self.require_admin(user)
        conn=self.connection_factory()
        try:
            conn.set_session(isolation_level='REPEATABLE READ',readonly=True)
            ids=sorted([payload.primary_course_id,*payload.source_course_ids])
            data=self.repo.validate(conn,payload.final_course)
            duplicate=self.repo.duplicate(conn,data,ids)
            if duplicate: raise self.duplicate_error(duplicate)
            snapshot=self.repo.merge_snapshot(conn,ids)
            digest=fingerprint(payload.model_dump(mode='json'))
            token=self.signer.dumps({'admin':user['user_id'],'request':digest,'state':fingerprint(snapshot)})
            contexts={(c['academic_year'],c['semester'],c['instructor_key']) for c in snapshot['courses']}
            return {'preview_token':token,'courses':snapshot['courses'],'final_course':data,
                    'counts':{k:len(snapshot[key]) for k,key in [('reviews','reviews'),('files','files'),('plans','plan_items')]},
                    'plan_conflicts':self.repo.plan_conflicts(snapshot),
                    'review_conflicts':self.repo.review_conflicts(snapshot),
                    'file_overages':self.repo.file_overages(snapshot),
                    'warnings':['ปี เทอม หรือผู้สอนต่างกัน ปกติควรแยกกัน รวมเฉพาะเมื่อยืนยันว่าข้อมูลเดิมผิดจริง'] if len(contexts)>1 else []}
        finally: conn.close()

    def merge(self,payload,user):
        self.require_admin(user)
        body=payload.model_dump(mode='json',exclude={'preview_token','request_id'})
        request_hash=fingerprint(body)
        def operation(conn):
            self.repo.lock_merge_tables(conn)
            previous=self.repo.existing_merge(conn,payload.request_id)
            if previous:
                if previous['admin_id']!=user['user_id'] or previous['after_snapshot']['request_hash']!=request_hash: raise ServiceError(409,'Request ID already used for another merge')
                return {'merge_id':previous['merge_id'],'course_id':previous['primary_course_id'],'idempotent':True}
            try: signed=self.signer.loads(payload.preview_token,max_age=600)
            except (BadSignature,SignatureExpired) as exc: raise ServiceError(409,'Preview หมดอายุ กรุณาตรวจสอบอีกครั้ง') from exc
            if signed['admin']!=user['user_id'] or signed['request']!=request_hash: raise ServiceError(409,'ข้อมูลต่างจาก preview กรุณาตรวจสอบอีกครั้ง')
            ids=sorted([payload.primary_course_id,*payload.source_course_ids])
            self.repo.lock_courses(conn,ids)
            snapshot=self.repo.merge_snapshot(conn,ids)
            if signed['state']!=fingerprint(snapshot): raise ServiceError(409,'มีข้อมูลเปลี่ยนหลัง preview กรุณาตรวจสอบอีกครั้ง')
            data=self.repo.validate(conn,payload.final_course)
            duplicate=self.repo.duplicate(conn,data,ids)
            if duplicate: raise self.duplicate_error(duplicate)
            merge_id=self.repo.merge(conn,payload,data,snapshot,user['user_id'],request_hash)
            self.repo.audit(conn,user['user_id'],'MERGE_COURSES',payload.primary_course_id,after={'merge_id':merge_id})
            return {'merge_id':merge_id,'course_id':payload.primary_course_id,'merged_source_ids':payload.source_course_ids}
        return self._write(operation)

    def history(self):
        conn=self.connection_factory()
        try: return {'history':self.repo.history(conn)}
        finally: conn.close()
