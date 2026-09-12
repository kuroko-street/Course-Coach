"""One active review, three file slots, and durable seven-day report cooldowns.

All writes for an account/course take the same transaction advisory lock.
Cooldowns expire on database time; no scheduler or administrative unlock required.
"""
from db import dict_cursor
from domain.errors import ServiceError


class ContributionRepository:
    FILE_LIMIT = 3

    def lock_tables(self, conn):
        # Merge takes these table locks exclusively BEFORE course/row locks.
        # Compatible writer locks first prevent lock-upgrade cycles with merge.
        with conn.cursor() as cur:
            cur.execute('LOCK TABLE courses,reviews,summary_file_upload_batches,summary_files,contribution_cooldowns IN ROW EXCLUSIVE MODE')

    def lock(self, conn, course_id, user_id):
        self.lock_tables(conn)
        with conn.cursor() as cur:
            cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', (f'contribution:{course_id}:{user_id}',))

    def record_hide(self, conn, row, kind):
        column, source_id, user_id = ('review_id',row['review_id'],row['reviewer_id']) if kind=='review' else ('file_id',row['file_id'],row['uploader_id'])
        with conn.cursor() as cur:
            cur.execute(f'INSERT INTO contribution_cooldowns(course_id,user_id,{column}) VALUES(%s,%s,%s) ON CONFLICT({column}) DO NOTHING', (row['course_id'],user_id,source_id))

    def status(self, conn, course_id, user_id):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT review_id FROM reviews WHERE course_id=%s AND reviewer_id=%s AND status='ACTIVE'",(course_id,user_id))
            review=cur.fetchone()
            cur.execute('SELECT clock_timestamp() AS server_now')
            now=cur.fetchone()['server_now']
            cur.execute('SELECT review_id,file_id,expires_at FROM contribution_cooldowns WHERE course_id=%s AND user_id=%s AND expires_at>%s ORDER BY expires_at,cooldown_id',(course_id,user_id,now))
            cooldowns=cur.fetchall()
            review_until=max((c['expires_at'] for c in cooldowns if c['review_id']),default=None)
            file_holds=[c for c in cooldowns if c['file_id']]
            cur.execute("SELECT COUNT(*) AS n FROM summary_files f JOIN summary_file_upload_batches b USING(upload_batch_id) WHERE b.course_id=%s AND b.uploader_id=%s AND f.status='ACTIVE'",(course_id,user_id))
            used=cur.fetchone()['n']
            return {'course_id':course_id,'server_now':now.isoformat(),
                    'review':{'active_review_id':review['review_id'] if review else None,'can_create':not review and review_until is None,'available_at':review_until.isoformat() if review_until else None},
                    'files':{'limit':self.FILE_LIMIT,'used':used,'held':len(file_holds),'available':max(0,self.FILE_LIMIT-used-len(file_holds)),'holds':[{'file_id':h['file_id'],'expires_at':h['expires_at'].isoformat()} for h in file_holds],'over_limit':max(0,used+len(file_holds)-self.FILE_LIMIT)}}

    def require_review_slot(self, conn, course_id, user_id):
        state=self.status(conn,course_id,user_id)
        if not state['review']['can_create']:
            message='คุณมีรีวิวในรายการวิชานี้แล้ว กรุณาแก้ไขรีวิวเดิม' if state['review']['active_review_id'] else 'อยู่ระหว่างพักสิทธิ์รีวิว 7 วันหลังถูกซ่อน'
            raise ServiceError(409,{'message':message,'code':'REVIEW_NOT_AVAILABLE','contribution':state})

    def require_file_slots(self, conn, course_id, user_id, count):
        state=self.status(conn,course_id,user_id)
        if count>state['files']['available']:
            raise ServiceError(409,{'message':f'เหลือโควต้าไฟล์ {state["files"]["available"]} รายการ จากทั้งหมด 3 รายการ','code':'FILE_QUOTA_EXCEEDED','contribution':state})
