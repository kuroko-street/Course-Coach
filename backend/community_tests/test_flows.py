"""Real PostgreSQL + HTTP integration tests against an ISOLATED test database.

Run with docker compose -f docker-compose.test.yml run --rm test.
Never point this suite at development or production: setup refuses them.
"""
import io
import os
import unittest
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from PIL import Image
from db import get_connection
from main import app
from migrate import migrate

ASPECTS=('satisfaction','recommendation','workload','content','teaching','exam')

class CommunityFlows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.environ.get('DB_NAME')!='coursecoach_community_test': raise RuntimeError('Refusing to mutate a non-test database')
        cls.client=TestClient(app)

    def sql(self,query,args=(),fetch=True):
        conn=get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(query,args)
                rows=cur.fetchall() if fetch else None
            conn.commit();return rows
        finally: conn.close()

    def setUp(self):
        self.sql('TRUNCATE users, instructors, courses RESTART IDENTITY CASCADE',fetch=False)
        self.sql("INSERT INTO users(username,email,display_name,role,is_mock) SELECT 'test-'||i,'test-'||i||'@example.invalid','User '||i,CASE WHEN i=1 THEN 'ADMIN'::user_role ELSE 'STUDENT'::user_role END,TRUE FROM generate_series(1,8) i",fetch=False)
        self.client.cookies.clear()
        self.teacher=self.call('post','/instructors',2,{'name':'อาจารย์ ทดสอบ','affiliation':'สจล.'}).json()['instructor']['instructor_id']
        self.payload=dict(university_id=1,faculty_id=1,department_id=1,course_code='06000001',course_name='Introduction Computer',credits=3,academic_year=2569,semester='1',instructor_ids=[self.teacher],syllabus='หัวข้อคอมพิวเตอร์',additional_details='')
        self.course=self.create_course()

    def call(self,method,path,user=None,body=None,**kwargs):
        return self.client.request(method,'/api'+path,headers={'X-User-Id':str(user)} if user else {},json=body,**kwargs)
    def create_course(self,**changes):
        r=self.call('post','/courses',2,{**self.payload,**changes});self.assertEqual(r.status_code,201,r.text);return r.json()['course_id']
    def review(self,user=2,course=None,score=5,**changes):
        body={'course_id':course or self.course,'content':'ประสบการณ์รายวิชา','tag_ids':[],**{f'rating_{k}':score for k in ASPECTS},**changes}
        r=self.call('post','/reviews',user,body);self.assertEqual(r.status_code,201,r.text);return r.json()['review_id']
    def pdf(self):
        stream=io.BytesIO();writer=PdfWriter();writer.add_blank_page(width=100,height=100);writer.write(stream);return stream.getvalue()
    def upload(self,user=2,course=None,name='test.pdf',body=None,key=None):
        return self.client.post(f'/api/courses/{course or self.course}/summary-files',headers={'X-User-Id':str(user)},files=[('files',(name,self.pdf() if body is None else body,'application/octet-stream'))],data={'upload_request_id':str(key or uuid.uuid4())})
    def detail(self,course=None):
        r=self.call('get',f'/courses/{course or self.course}');self.assertEqual(r.status_code,200,r.text);return r.json()
    def merge_body(self,source,**extra):
        return {**dict(primary_course_id=self.course,source_course_ids=[source],final_course=self.payload,reason='ข้อมูลซ้ำจากการพิมพ์ผิด',keep_plan_item_ids=[]),**extra}
    def preview(self,body):
        r=self.call('post','/admin/courses/merge/preview',1,body);self.assertEqual(r.status_code,200,r.text);return r.json()
    def merge(self,body,preview=None,key=None):
        preview=preview or self.preview(body)
        return self.call('post','/admin/courses/merge',1,{**body,'preview_token':preview['preview_token'],'request_id':str(key or uuid.uuid4())})

    def test_public_read_private_write(self):
        for path in ('/courses','/courses/'+str(self.course),'/dashboard/summary','/dashboard/rankings','/catalog/options','/courses/'+str(self.course)+'/summary-files'):
            with self.subTest(path=path): self.assertEqual(self.call('get',path).status_code,200)
        self.assertEqual(self.call('post','/courses',None,self.payload).status_code,401)
        self.assertEqual(self.call('get','/users').status_code,401)
        self.assertEqual(self.call('get','/admin/courses',2).status_code,403)
        self.assertEqual(self.call('get','/users/2/enrollments',2).status_code,404)

    def test_identity_duplicates_and_contexts(self):
        r=self.call('post','/courses',2,self.payload);self.assertEqual(r.status_code,409);self.assertEqual(r.json()['detail']['course_id'],self.course)
        for change in ({'semester':'2'},{'academic_year':2570},{'course_name':'Introduction to Computer'}):
            with self.subTest(change=change): self.create_course(**change)
        self.assertEqual(self.call('post','/courses',2,{**self.payload,'syllabus':'different description','credits':4}).status_code,409)
        self.assertEqual(self.call('post','/courses',2,{**self.payload,'university_id':2}).status_code,422)
        self.assertEqual(self.call('post','/courses',2,{**self.payload,'department_id':999}).status_code,400)

    def test_unordered_teacher_set_and_leading_zero(self):
        teacher2=self.call('post','/instructors',2,{'name':'Second Teacher'}).json()['instructor']['instructor_id']
        cid=self.create_course(instructor_ids=[self.teacher,teacher2])
        self.assertEqual(self.call('post','/courses',2,{**self.payload,'instructor_ids':[teacher2,self.teacher]}).status_code,409)
        self.assertEqual(self.call('post','/courses',2,{**self.payload,'instructor_ids':[self.teacher,self.teacher]}).status_code,422)
        self.assertEqual(self.detail(cid)['course_code'],'06000001')

    def test_concurrent_course_creation(self):
        payload={**self.payload,'course_code':'000020'}
        with ThreadPoolExecutor(max_workers=2) as pool:
            codes=list(pool.map(lambda _:self.call('post','/courses',2,payload).status_code,range(2)))
        self.assertEqual(sorted(codes),[201,409])

    def test_only_admin_edits_immediately(self):
        body={**self.payload,'course_name':'Changed name'}
        self.assertEqual(self.call('put',f'/admin/courses/{self.course}',2,body).status_code,403)
        self.assertEqual(self.call('put',f'/admin/courses/{self.course}',1,body).status_code,200)
        self.assertEqual(self.detail()['course_name'],'Changed name')

    def test_one_review_per_account_separate_averages(self):
        self.review(user=2,score=1,rating_teaching=5);self.review(user=3,score=5,rating_teaching=5);self.review(user=4,score=3,rating_teaching=2)
        c=self.detail();self.assertEqual(c['review_count'],3);self.assertEqual(c['avg_satisfaction'],3);self.assertEqual(c['avg_teaching'],4)
        other=self.create_course(semester='2');self.review(course=other,score=1);self.assertEqual(self.detail()['avg_satisfaction'],3)

    def test_tags_counts_hidden_deleted_not_counted(self):
        self.review(tag_ids=[1,5,9]);second=self.review(user=3,tag_ids=[1,5]);c=self.detail();self.assertEqual(c['review_count'],2)
        self.assertEqual({t['tag_id']:t['review_count'] for t in c['tags']},{1:2,5:2,9:1})
        self.call('delete',f'/reviews/{second}',3)
        self.assertEqual({t['tag_id']:t['review_count'] for t in self.detail()['tags']},{1:1,5:1,9:1})
        body={'course_id':self.course,'content':'test','tag_ids':[1,2],**{f'rating_{k}':3 for k in ASPECTS}}
        self.assertEqual(self.call('post','/reviews',2,body).status_code,422)
        body['tag_ids']=[999];self.assertEqual(self.call('post','/reviews',2,body).status_code,422)

    def test_no_grade_or_enrollment_payload(self):
        body={'course_id':self.course,'content':'test',**{f'rating_{k}':3 for k in ASPECTS}}
        for field,value in [('grade','A'),('academic_year',2569),('semester','1'),('section','001')]:
            with self.subTest(field=field): self.assertEqual(self.call('post','/reviews',2,{**body,field:value}).status_code,422)

    def test_review_reports_five_unique_and_no_self(self):
        rid=self.review()
        self.assertEqual(self.call('post',f'/reviews/{rid}/report',2).status_code,409)
        for user in [3,4,5,6]: self.assertEqual(self.call('post',f'/reviews/{rid}/report',user).json()['status'],'ACTIVE')
        self.assertEqual(self.call('post',f'/reviews/{rid}/report',3).status_code,409)
        self.assertEqual(self.call('post',f'/reviews/{rid}/report',7).json()['status'],'HIDDEN')
        self.assertEqual(self.detail()['review_count'],0)
        self.assertEqual(self.call('get',f'/reviews/{rid}/comments').status_code,404)
        body={'content':'edited after hide',**{f'rating_{k}':5 for k in ASPECTS}}
        self.assertEqual(self.call('put',f'/reviews/{rid}',2,body).status_code,200)
        self.assertEqual(self.detail()['review_count'],0)
        self.assertEqual(self.call('post',f'/admin/reviews/{rid}/action',1,{'action':'KEEP'}).status_code,404)

    def test_concurrent_reports(self):
        rid=self.review()
        with ThreadPoolExecutor(max_workers=5) as pool:
            codes=list(pool.map(lambda uid:self.call('post',f'/reviews/{rid}/report',uid).status_code,[3,4,5,6,7]))
        self.assertEqual(codes,[201]*5)
        self.assertEqual(self.sql('SELECT report_count,status FROM reviews WHERE review_id=%s',(rid,))[0],(5,'HIDDEN'))

    def test_comment_report_independent(self):
        rid=self.review();r=self.call('post',f'/reviews/{rid}/comments',2,{'content':'Comment'});cid=r.json()['comment_id']
        for uid in range(3,8): self.assertEqual(self.call('post',f'/reviews/{rid}/comments/{cid}/report',uid).status_code,201)
        self.assertEqual(self.call('get',f'/reviews/{rid}/comments').json()['comments'],[])
        self.assertEqual(self.detail()['review_count'],1)
        self.assertEqual(self.call('get',f'/courses/{self.course}/reviews').json()['reviews'][0]['comment_count'],0)

    def test_display_name_and_privacy(self):
        self.review();self.call('put','/users/me',2,{'display_name':'ชื่อใหม่'})
        self.assertEqual(self.call('get',f'/courses/{self.course}/reviews').json()['reviews'][0]['reviewer_name'],'ชื่อใหม่')
        profile=self.call('get','/users/2/profile').json()
        for key in ['email','student_number','google_sub']: self.assertNotIn(key,profile['user'])

    def test_hybrid_search_and_filters(self):
        self.review(tag_ids=[1,5]);other=self.create_course(semester='2',course_name='Chemistry')
        for query in ['Introduction Com','Computor','06000001','ทดสอบ','งานเยอะ']:
            with self.subTest(query=query):
                r=self.call('get','/courses',params={'search':query});self.assertEqual(r.status_code,200,r.text);self.assertIn(self.course,[c['course_id'] for c in r.json()['courses']])
        self.assertEqual(self.call('get','/courses',params={'semester':'2'}).json()['courses'][0]['course_id'],other)
        self.assertEqual(self.call('get','/courses',params={'tag_ids':[1,5]}).json()['total'],1)
        self.assertEqual(self.call('get','/courses',params={'tag_ids':[1,9]}).json()['total'],0)
        self.assertEqual(len(self.call('get','/courses',params={'page_size':1}).json()['courses']),1)
        self.assertEqual(self.call('get','/courses',params={'page':999}).json()['total'],2)

    def test_dashboard_scope_likes_and_inactive(self):
        rid=self.review(score=2);other=self.create_course(semester='2');self.review(course=other,score=5)
        self.call('post',f'/reviews/{rid}/like',3)
        summary=self.call('get','/dashboard/summary',params={'semester':'1'}).json()['summary']
        self.assertEqual(summary['review_count'],1);self.assertEqual(summary['avg_satisfaction'],2)
        ranking=self.call('get','/dashboard/rankings',params={'metric':'likes'}).json()['rankings'];self.assertEqual(ranking[0]['course_id'],self.course)
        self.call('patch',f'/admin/courses/{self.course}/status',1,{'is_active':False})
        self.assertEqual(self.call('get','/dashboard/summary').json()['summary']['review_count'],1)
        self.assertEqual(self.call('get',f'/reviews/{rid}/comments').status_code,404)

    def test_upload_quota_and_idempotent(self):
        key=uuid.uuid4();r=self.upload(key=key);self.assertEqual(r.status_code,201,r.text);file_id=r.json()['files'][0]['file_id']
        repeat=self.upload(key=key);self.assertEqual(repeat.json()['files'][0]['file_id'],file_id)
        for _ in range(2): self.assertEqual(self.upload().status_code,201)
        self.assertEqual(self.upload().status_code,409)
        self.assertEqual(self.upload(key=key).json()['files'][0]['file_id'],file_id)
        self.assertEqual(len(self.call('get',f'/courses/{self.course}/summary-files').json()['files']),3)
        self.assertEqual(self.call('get',f'/summary-files/{file_id}/download').status_code,401)
        self.assertEqual(self.call('get',f'/summary-files/{file_id}/download',2).status_code,200)

    def test_upload_types_and_size(self):
        self.assertEqual(self.upload(name='bad.pdf',body=b'not a pdf').status_code,422)
        self.assertEqual(self.upload(name='evil.exe',body=b'MZ').status_code,422)
        self.assertEqual(self.upload(name='empty.png',body=b'').status_code,422)
        self.assertEqual(self.upload(body=b'x'*(20971520+1)).status_code,413)
        stream=io.BytesIO();Image.new('RGB',(10,10),'white').save(stream,format='PNG')
        self.assertEqual(self.upload(name='image.png',body=stream.getvalue()).status_code,201)

    def test_file_and_file_comment_reports(self):
        r=self.upload();self.assertEqual(r.status_code,201,r.text);fid=r.json()['files'][0]['file_id']
        cid=self.call('post',f'/summary-files/{fid}/comments',2,{'content':'file comment'}).json()['comment_id']
        for uid in range(3,8): self.assertEqual(self.call('post',f'/summary-files/{fid}/comments/{cid}/report',uid).status_code,201)
        self.assertEqual(self.call('get',f'/summary-files/{fid}/comments').json()['comments'],[])
        self.assertEqual(self.call('post',f'/summary-files/{fid}/report',2).status_code,409)
        for uid in range(3,8): self.assertEqual(self.call('post',f'/summary-files/{fid}/report',uid).status_code,201)
        self.assertEqual(self.call('get',f'/summary-files/{fid}/download',2).status_code,404)
        self.assertEqual(self.call('get',f'/summary-files/{fid}/comments').status_code,404)

    def test_merge_preserves_content_aliases_states(self):
        source=self.create_course(course_name='Intro Computer Typo')
        self.review(user=3);rid=self.review(course=source);hidden=self.review(user=4,course=source,score=1)
        self.sql("UPDATE reviews SET status='HIDDEN',report_count=5 WHERE review_id=%s",(hidden,),False)
        fid=self.upload(course=source).json()['files'][0]['file_id'];self.call('post',f'/reviews/{rid}/like',3)
        body=self.merge_body(source);r=self.merge(body);self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(self.detail()['review_count'],2);self.assertEqual(self.detail(source)['course_id'],self.course)
        self.assertEqual(self.sql('SELECT status,report_count FROM reviews WHERE review_id=%s',(hidden,))[0],('HIDDEN',5))
        self.assertEqual(self.call('get',f'/summary-files/{fid}/download',2).status_code,200)
        self.assertEqual(self.call('get','/courses',params={'search':'Typo'}).json()['courses'][0]['course_id'],self.course)
        self.assertEqual(self.call('get','/courses').json()['total'],1)

    def test_merge_stale_idempotent_unauthorized(self):
        source=self.create_course(course_name='Typo version');body=self.merge_body(source)
        self.assertEqual(self.call('post','/admin/courses/merge/preview',2,body).status_code,403)
        preview=self.preview(body);self.review(course=source)
        self.assertEqual(self.merge(body,preview).status_code,409)
        preview=self.preview(body);key=uuid.uuid4();r=self.merge(body,preview,key);self.assertEqual(r.status_code,200,r.text)
        again=self.merge(body,preview,key);self.assertEqual(again.status_code,200,again.text);self.assertTrue(again.json()['idempotent'])

    def test_plan_without_enrollments_and_merge_conflict(self):
        source=self.create_course(course_name='Typo version')
        plan=self.call('post','/plans',2,{'plan_name':'My future plan'}).json()['plan_id']
        ids=[]
        for course in [self.course,source]:
            r=self.call('post',f'/plans/{plan}/items',2,{'course_id':course,'academic_year':2570,'semester':'1'});self.assertEqual(r.status_code,201,r.text);ids.append(r.json()['item_id'])
        result=self.call('get',f'/plans/{plan}',2).json();self.assertEqual(result['terms'][0]['total_credits'],3);self.assertEqual(result['terms'][0]['raw_credits'],6)
        body=self.merge_body(source);preview=self.preview(body);self.assertEqual(len(preview['plan_conflicts']),1)
        self.assertEqual(self.merge(body,preview).status_code,400)
        body['keep_plan_item_ids']=[ids[0]];r=self.merge(body);self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(len(self.call('get',f'/plans/{plan}',2).json()['terms'][0]['items']),1)

    def test_restart_migrations_no_reapply(self):
        before=self.sql('SELECT name,sha256 FROM schema_migrations ORDER BY name');migrate('/migrations')
        self.assertEqual(before,self.sql('SELECT name,sha256 FROM schema_migrations ORDER BY name'))
        self.assertEqual(self.detail()['course_id'],self.course)

    def test_merge_failure_rolls_back_every_move(self):
        source=self.create_course(course_name='Rollback source')
        rid=self.review(course=source)
        fid=self.upload(course=source).json()['files'][0]['file_id']
        body=self.merge_body(source);preview=self.preview(body)
        with patch('repositories.catalog_repository.CatalogRepository.audit',side_effect=RuntimeError('Simulated failure after merge writes')):
            self.assertEqual(self.merge(body,preview).status_code,500)
        self.assertEqual(self.detail(source)['course_id'],source)
        self.assertEqual(self.sql('SELECT course_id FROM reviews WHERE review_id=%s',(rid,))[0][0],source)
        self.assertEqual(self.sql('SELECT course_id FROM summary_file_upload_batches JOIN summary_files USING(upload_batch_id) WHERE file_id=%s',(fid,))[0][0],source)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM course_merge_history')[0][0],0)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM course_aliases')[0][0],0)

    def test_multihop_merge_and_hidden_file_state(self):
        source=self.create_course(course_name='Oldest alias')
        middle=self.create_course(course_name='Middle alias')
        fid=self.upload(course=source).json()['files'][0]['file_id']
        self.sql("UPDATE summary_files SET status='HIDDEN',report_count=5 WHERE file_id=%s",(fid,),False)
        body=self.merge_body(source,primary_course_id=middle,final_course={**self.payload,'course_name':'Middle alias'})
        self.assertEqual(self.merge(body).status_code,200)
        self.assertEqual(self.merge(self.merge_body(middle)).status_code,200)
        self.assertEqual(self.detail(source)['course_id'],self.course)
        self.assertEqual(self.call('get','/courses',params={'search':'Oldest alias'}).json()['courses'][0]['course_id'],self.course)
        self.assertEqual(self.sql('SELECT status,report_count FROM summary_files WHERE file_id=%s',(fid,))[0],('HIDDEN',5))
        self.assertEqual(self.call('get',f'/summary-files/{fid}/download',2).status_code,404)

    def test_concurrent_upload_request_is_one_file(self):
        key=uuid.uuid4()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _:self.upload(key=key),range(2)))
        self.assertEqual([r.status_code for r in results],[201,201])
        self.assertEqual(results[0].json()['files'][0]['file_id'],results[1].json()['files'][0]['file_id'])
        self.assertEqual(self.sql('SELECT COUNT(*) FROM summary_files')[0][0],1)

    def test_office_structure_validation_and_failed_batch_rollback(self):
        for extension,part,kind in [('docx','word/document.xml','wordprocessingml.document'),('pptx','ppt/presentation.xml','presentationml.presentation'),('xlsx','xl/workbook.xml','spreadsheetml.sheet')]:
            stream=io.BytesIO()
            with zipfile.ZipFile(stream,'w') as archive:
                archive.writestr('[Content_Types].xml',f'<Types><Override PartName="/{part}" ContentType="application/vnd.openxmlformats-officedocument.{kind}.main+xml" /></Types>')
                archive.writestr(part,'<root/>')
            self.assertEqual(self.upload(name='structure.'+extension,body=stream.getvalue()).status_code,201)
        before=self.sql('SELECT COUNT(*) FROM summary_files')[0][0]
        response=self.client.post(f'/api/courses/{self.course}/summary-files',headers={'X-User-Id':'3'},files=[('files',('valid.pdf',self.pdf(),'application/pdf')),('files',('bad.pdf',b'not a pdf','application/pdf'))])
        self.assertEqual(response.status_code,422)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM summary_files')[0][0],before)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM summary_file_upload_batches')[0][0],before)

    def test_plan_different_target_terms_and_ownership(self):
        plan=self.call('post','/plans',2,{'plan_name':'Term test'}).json()['plan_id']
        items=[]
        for semester in ['1','2']:
            r=self.call('post',f'/plans/{plan}/items',2,{'course_id':self.course,'academic_year':2570,'semester':semester})
            self.assertEqual(r.status_code,201);items.append(r.json()['item_id'])
        self.assertEqual(len(self.call('get',f'/plans/{plan}',2).json()['terms']),2)
        self.assertIn(self.call('get',f'/plans/{plan}',3).status_code,[403,404])
        self.assertIn(self.call('put',f'/plans/{plan}/items/{items[0]}',3,{'academic_year':2571,'semester':'1'}).status_code,[403,404])
        self.assertIn(self.call('put',f'/plans/{plan}/items/{items[0]}',2,{'academic_year':2570,'semester':'2'}).status_code,[400,409])

    def test_production_mock_disabled(self):
        self.assertEqual(self.call('post','/auth/login-mock',body={'user_id':2}).status_code,200)
        with patch.dict(os.environ,{'APP_ENV':'production','ALLOW_MOCK_AUTH':'true'}):
            self.assertEqual(self.call('get','/auth/me').status_code,401)
            self.assertEqual(self.call('post','/auth/login-mock',body={'user_id':2}).status_code,404)
            self.assertEqual(self.call('get','/auth/mock-users').status_code,404)
            self.assertEqual(self.call('post','/courses',2,self.payload).status_code,401)

    def test_disabling_mock_revokes_session_but_keeps_real_session(self):
        self.assertEqual(self.call('post','/auth/login-mock',body={'user_id':2}).status_code,200)
        with patch.dict(os.environ,{'ALLOW_MOCK_AUTH':'false'}):
            self.assertEqual(self.call('get','/auth/me').status_code,401)
        self.assertEqual(self.call('post','/auth/login-mock',body={'user_id':2}).status_code,200)
        self.sql('UPDATE users SET is_mock=FALSE WHERE user_id=2',fetch=False)
        with patch.dict(os.environ,{'APP_ENV':'production','ALLOW_MOCK_AUTH':'false'}):
            self.assertEqual(self.call('get','/auth/me').status_code,200)

    def permissions(self,user=2,course=None):
        r=self.call('get',f'/courses/{course or self.course}/contribution-status',user)
        self.assertEqual(r.status_code,200,r.text);return r.json()

    def review_body(self):
        return {'course_id':self.course,'content':'Quota test','tag_ids':[5],**{f'rating_{k}':4 for k in ASPECTS}}

    def hide_review(self,rid):
        for uid in range(3,8): self.assertEqual(self.call('post',f'/reviews/{rid}/report',uid).status_code,201)

    def hide_file(self,fid):
        for uid in range(3,8): self.assertEqual(self.call('post',f'/summary-files/{fid}/report',uid).status_code,201)

    def expire_holds(self,kind):
        column='review_id' if kind=='review' else 'file_id'
        self.sql(f"UPDATE contribution_cooldowns SET started_at=clock_timestamp()-INTERVAL '8 days',expires_at=clock_timestamp()-INTERVAL '1 second' WHERE {column} IS NOT NULL",fetch=False)

    def test_review_slot_edit_delete_and_unique_constraint(self):
        rid=self.review();body=self.review_body()
        self.assertEqual(self.call('post','/reviews',2,body).status_code,409)
        self.assertFalse(self.permissions()['review']['can_create'])
        edit={k:v for k,v in body.items() if k!='course_id'}
        self.assertEqual(self.call('put',f'/reviews/{rid}',2,edit).status_code,200)
        self.assertEqual(self.detail()['avg_satisfaction'],4)
        self.assertEqual(self.call('delete',f'/reviews/{rid}',2).status_code,200)
        self.assertTrue(self.permissions()['review']['can_create'])
        self.review();self.assertEqual(self.detail()['review_count'],1)
        self.assertEqual(self.sql("SELECT COUNT(*) FROM pg_indexes WHERE indexname='uq_active_review_per_account'")[0][0],1)

    def test_concurrent_reviews_only_one_wins(self):
        body=self.review_body()
        with ThreadPoolExecutor(max_workers=2) as pool:
            codes=list(pool.map(lambda _:self.call('post','/reviews',2,body).status_code,range(2)))
        self.assertEqual(sorted(codes),[201,409]);self.assertEqual(self.detail()['review_count'],1)

    def test_hidden_review_delete_does_not_clear_cooldown(self):
        rid=self.review();self.hide_review(rid)
        state=self.permissions();self.assertFalse(state['review']['can_create']);self.assertIsNotNone(state['review']['available_at'])
        self.assertEqual(self.call('post','/reviews',2,self.review_body()).status_code,409)
        self.assertEqual(self.call('delete',f'/reviews/{rid}',2).status_code,200)
        self.assertEqual(self.permissions()['review']['available_at'],state['review']['available_at'])
        self.assertEqual(self.call('post','/reviews',2,self.review_body()).status_code,409)
        other=self.create_course(semester='2');self.review(course=other)
        self.assertEqual(self.upload().status_code,201)
        self.expire_holds('review');self.assertTrue(self.permissions()['review']['can_create'])
        self.review();self.assertEqual(self.detail()['review_count'],1)
        self.assertEqual(self.sql('SELECT status FROM reviews WHERE review_id=%s',(rid,))[0][0],'DELETED')

    def test_expired_hidden_review_stays_hidden_and_can_write_again(self):
        rid=self.review();self.hide_review(rid);self.expire_holds('review');self.review()
        self.assertEqual(self.sql('SELECT status FROM reviews WHERE review_id=%s',(rid,))[0][0],'HIDDEN')
        self.assertEqual(self.detail()['review_count'],1)
        self.assertEqual(self.call('get',f'/reviews/{rid}/comments').status_code,404)

    def test_three_file_slots_delete_refunds_only_normal_files(self):
        ids=[self.upload().json()['files'][0]['file_id'] for _ in range(3)]
        self.assertEqual(self.permissions()['files']['available'],0)
        self.assertEqual(self.upload().status_code,409)
        self.hide_file(ids[0]);state=self.permissions()['files']
        self.assertEqual((state['used'],state['held'],state['available']),(2,1,0))
        self.call('delete',f'/summary-files/{ids[0]}',2)
        self.assertEqual(self.permissions()['files']['held'],1)
        self.assertEqual(self.upload().status_code,409)
        self.call('delete',f'/summary-files/{ids[1]}',2)
        self.assertEqual(self.permissions()['files']['available'],1)
        self.assertEqual(self.upload().status_code,201)
        self.expire_holds('file');self.assertEqual(self.permissions()['files']['available'],1)
        self.assertEqual(self.upload().status_code,201)
        self.assertEqual(self.call('get',f'/summary-files/{ids[0]}/download',2).status_code,404)

    def test_hidden_file_only_holds_its_own_slot(self):
        fid=self.upload().json()['files'][0]['file_id'];self.hide_file(fid)
        self.assertEqual(self.permissions()['files']['available'],2)
        self.assertTrue(self.permissions()['review']['can_create']);self.review()
        self.assertEqual(self.upload().status_code,201);self.assertEqual(self.upload().status_code,201)
        self.assertEqual(self.upload().status_code,409)

    def test_simultaneous_uploads_never_exceed_three(self):
        self.upload();self.upload()
        with ThreadPoolExecutor(max_workers=3) as pool:
            codes=list(pool.map(lambda _:self.upload().status_code,range(3)))
        self.assertEqual(sorted(codes),[201,409,409])
        self.assertEqual(self.permissions()['files']['used'],3)

    def test_rejected_upload_consumes_no_slot_and_batch_is_atomic(self):
        self.assertEqual(self.upload(body=b'bad').status_code,422)
        self.assertEqual(self.permissions()['files']['available'],3)
        self.upload();self.upload()
        r=self.client.post(f'/api/courses/{self.course}/summary-files',headers={'X-User-Id':'2'},files=[('files',('a.pdf',self.pdf(),'application/pdf')),('files',('b.pdf',self.pdf(),'application/pdf'))])
        self.assertEqual(r.status_code,409);self.assertEqual(self.permissions()['files']['used'],2)

    def test_comment_reports_do_not_suspend_reviews_or_files(self):
        rid=self.review();cid=self.call('post',f'/reviews/{rid}/comments',2,{'content':'test'}).json()['comment_id']
        for uid in range(3,8): self.call('post',f'/reviews/{rid}/comments/{cid}/report',uid)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM contribution_cooldowns')[0][0],0)
        self.assertEqual(self.call('post',f'/reviews/{rid}/comments',2,{'content':'new comment'}).status_code,201)

    def test_merge_requires_explicit_review_selection(self):
        first=self.review();source=self.create_course(course_name='Duplicate title');second=self.review(course=source,score=1)
        cid=self.call('post',f'/reviews/{second}/comments',3,{'content':'preserve'}).json()['comment_id']
        body=self.merge_body(source);p=self.preview(body)
        self.assertEqual(len(p['review_conflicts']),1);self.assertEqual(self.merge(body,p).status_code,400)
        body['keep_review_ids']=[first];self.assertEqual(self.merge(body).status_code,200)
        self.assertEqual(self.detail()['review_count'],1);self.assertEqual(self.detail()['avg_satisfaction'],5)
        self.assertEqual(self.sql('SELECT status FROM reviews WHERE review_id=%s',(second,))[0][0],'ARCHIVED')
        self.assertEqual(self.sql('SELECT content FROM review_comments WHERE comment_id=%s',(cid,))[0][0],'preserve')
        self.assertEqual(self.call('get',f'/reviews/{second}/comments').status_code,404)
        self.assertEqual(self.call('put',f'/reviews/{second}',2,{k:v for k,v in self.review_body().items() if k!='course_id'}).status_code,409)

    def test_merge_file_overage_kept_only_after_acknowledgment(self):
        source=self.create_course(course_name='Other name')
        for c in [self.course,source]:
            for _ in range(2): self.upload(course=c)
        body=self.merge_body(source);p=self.preview(body)
        self.assertEqual(p['file_overages'][0]['used'],4);self.assertEqual(self.merge(body,p).status_code,400)
        body['accept_file_overage']=True;self.assertEqual(self.merge(body).status_code,200)
        self.assertEqual(self.permissions()['files']['used'],4);self.assertEqual(self.upload().status_code,409)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM summary_files')[0][0],4)

    def test_merge_preserves_cooldowns_on_canonical_course(self):
        source=self.create_course(course_name='Reported source');rid=self.review(course=source);self.hide_review(rid)
        fid=self.upload(course=source).json()['files'][0]['file_id'];self.hide_file(fid)
        before=self.permissions(course=source)
        self.assertEqual(self.merge(self.merge_body(source)).status_code,200)
        state=self.permissions();self.assertEqual(state['review']['available_at'],before['review']['available_at'])
        self.assertEqual(state['files']['held'],1);self.assertFalse(state['review']['can_create'])
        self.assertEqual(self.permissions(course=source)['course_id'],self.course)

if __name__=='__main__': unittest.main()
