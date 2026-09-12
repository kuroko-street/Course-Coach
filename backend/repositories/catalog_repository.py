import hashlib
import json
from collections import defaultdict

from psycopg2.extras import Json

from db import dict_cursor
from domain.errors import ServiceError
from schemas.catalog import normalize_text


def canonical_values(payload):
    data = payload.model_dump() if hasattr(payload, "model_dump") else dict(payload)
    data["course_code"] = normalize_text(data["course_code"])
    data["course_name"] = normalize_text(data["course_name"])
    data["code_normalized"] = data["course_code"].casefold()
    data["name_normalized"] = data["course_name"].casefold()
    data["instructor_ids"] = sorted(set(data["instructor_ids"]))
    data["instructor_key"] = ",".join(str(x) for x in data["instructor_ids"])
    return data


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, ensure_ascii=False).encode()).hexdigest()


class CatalogRepository:
    COURSE_FIELDS = ("university_id", "faculty_id", "department_id", "course_code", "course_name",
                     "code_normalized", "name_normalized", "instructor_key", "department",
                     "academic_year", "semester", "credits", "syllabus", "additional_details")

    def options(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT university_id,code,name FROM universities WHERE university_id=1 AND is_active")
            universities = cur.fetchall()
            cur.execute("SELECT faculty_id,university_id,name FROM faculties WHERE university_id=1 ORDER BY name")
            faculties = cur.fetchall()
            cur.execute("SELECT d.* FROM departments d JOIN faculties f USING(faculty_id) WHERE f.university_id=1 ORDER BY d.is_general,d.name")
            departments = cur.fetchall()
            cur.execute("SELECT tag_id,tag_name FROM tags ORDER BY tag_id")
            tags = cur.fetchall()
        return dict(universities=universities, faculties=faculties, departments=departments, tags=tags)

    def instructors(self, conn, search=""):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT instructor_id,name,affiliation FROM instructors WHERE university_id=1 AND name ILIKE %s ORDER BY name,instructor_id LIMIT 100", ("%" + search.strip() + "%",))
            return cur.fetchall()

    def add_instructor(self, conn, payload, user_id):
        # Equal names can be different people; suggestions are not a global UNIQUE constraint.
        with dict_cursor(conn) as cur:
            cur.execute("INSERT INTO instructors(university_id,name,affiliation,creator_id) VALUES(1,%s,%s,%s) RETURNING instructor_id,name,affiliation", (payload.name, payload.affiliation, user_id))
            return cur.fetchone()

    def validate(self, conn, payload):
        data = canonical_values(payload)
        with dict_cursor(conn) as cur:
            cur.execute("SELECT d.name FROM departments d JOIN faculties f USING(faculty_id) JOIN universities u USING(university_id) WHERE d.department_id=%s AND f.faculty_id=%s AND u.university_id=1 AND u.is_active", (data["department_id"], data["faculty_id"]))
            row = cur.fetchone()
            if row is None or data["university_id"] != 1:
                raise ServiceError(400, "กรุณาเลือกคณะและสาขาที่อยู่ใน สจล. จากตัวเลือกของระบบ")
            data["department"] = row["name"]
            cur.execute("SELECT instructor_id FROM instructors WHERE instructor_id=ANY(%s) AND university_id=1", (data["instructor_ids"],))
            if {r["instructor_id"] for r in cur.fetchall()} != set(data["instructor_ids"]):
                raise ServiceError(400, "ไม่พบผู้สอนบางคนในมหาวิทยาลัยที่เลือก")
        return data

    def duplicate(self, conn, data, excluded=()):
        with dict_cursor(conn) as cur:
            cur.execute("""SELECT COALESCE(merged_into_course_id,course_id) AS course_id,course_code,course_name,academic_year,semester,is_active FROM courses
              WHERE university_id=%s AND code_normalized=%s AND name_normalized=%s
                AND academic_year=%s AND semester=%s AND instructor_key=%s
                AND NOT(course_id=ANY(%s)) LIMIT 1""",
                        (data["university_id"], data["code_normalized"], data["name_normalized"], data["academic_year"], data["semester"], data["instructor_key"], list(excluded)))
            return cur.fetchone()

    def similar(self, conn, data):
        with dict_cursor(conn) as cur:
            cur.execute("""SELECT course_id,course_code,course_name,academic_year,semester FROM courses
             WHERE university_id=1 AND is_active AND merged_into_course_id IS NULL
             AND (code_normalized=%s OR similarity(course_name,%s)>=0.45)
             ORDER BY (code_normalized=%s) DESC,course_id DESC LIMIT 10""", (data["code_normalized"], data["course_name"], data["code_normalized"]))
            return cur.fetchall()

    def insert_course(self, conn, data, creator_id):
        with dict_cursor(conn) as cur:
            fields = ",".join(self.COURSE_FIELDS)
            placeholders = ",".join(["%s"] * len(self.COURSE_FIELDS))
            cur.execute(f"INSERT INTO courses({fields},creator_id) VALUES({placeholders},%s) RETURNING *", [*(data[k] for k in self.COURSE_FIELDS), creator_id])
            row = cur.fetchone()
            self._teachers(cur, row["course_id"], data["instructor_ids"])
            return row

    def _teachers(self, cur, course_id, instructor_ids):
        cur.execute("DELETE FROM course_instructors WHERE course_id=%s", (course_id,))
        cur.executemany("INSERT INTO course_instructors(course_id,instructor_id) VALUES(%s,%s)", [(course_id, i) for i in instructor_ids])

    def update_course(self, conn, course_id, data):
        with dict_cursor(conn) as cur:
            assignments = ",".join(f"{field}=%s" for field in self.COURSE_FIELDS)
            cur.execute(f"UPDATE courses SET {assignments},updated_at=clock_timestamp() WHERE course_id=%s RETURNING *", [*(data[k] for k in self.COURSE_FIELDS), course_id])
            row = cur.fetchone()
            self._teachers(cur, course_id, data["instructor_ids"])
            return row

    def preserve_name(self, conn, course):
        with dict_cursor(conn) as cur:
            cur.execute("INSERT INTO course_aliases(canonical_course_id,course_code,course_name) VALUES(%s,%s,%s)",
                        (course["course_id"], course["course_code"], course["course_name"]))

    def lock_courses(self, conn, ids):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM courses WHERE course_id=ANY(%s) ORDER BY course_id FOR UPDATE", (ids,))
            rows = cur.fetchall()
            if len(rows) != len(ids) or any(r["merged_into_course_id"] for r in rows):
                raise ServiceError(409, "รายการวิชาเปลี่ยนไปหรือถูกรวมแล้ว กรุณาโหลดใหม่")
            return rows

    def audit(self, conn, user_id, action, target_id, before=None, after=None):
        with dict_cursor(conn) as cur:
            cur.execute("INSERT INTO audit_logs(user_id,action,target_id,details) VALUES(%s,%s,%s,%s)",
                        (user_id, action, target_id, Json({"before": before, "after": after}, dumps=lambda x: json.dumps(x, default=str))))

    def merge_snapshot(self, conn, ids):
        snapshot = {}
        queries = {
            "courses": "SELECT * FROM courses WHERE course_id=ANY(%s) ORDER BY course_id",
            "teachers": "SELECT * FROM course_instructors WHERE course_id=ANY(%s) ORDER BY course_id,instructor_id",
            "reviews": "SELECT * FROM reviews WHERE course_id=ANY(%s) ORDER BY review_id",
            "batches": "SELECT * FROM summary_file_upload_batches WHERE course_id=ANY(%s) ORDER BY upload_batch_id",
            "files": "SELECT sf.* FROM summary_files sf JOIN summary_file_upload_batches b USING(upload_batch_id) WHERE b.course_id=ANY(%s) ORDER BY file_id",
            "plan_items": "SELECT * FROM study_plan_items WHERE course_id=ANY(%s) ORDER BY item_id",
            "aliases": "SELECT * FROM course_aliases WHERE canonical_course_id=ANY(%s) ORDER BY alias_id",
            "cooldowns": "SELECT * FROM contribution_cooldowns WHERE course_id=ANY(%s) ORDER BY cooldown_id",
        }
        with dict_cursor(conn) as cur:
            for key, query in queries.items():
                cur.execute(query, (ids,))
                snapshot[key] = cur.fetchall()
        if len(snapshot["courses"]) != len(ids) or any(c["merged_into_course_id"] is not None for c in snapshot["courses"]):
            raise ServiceError(409, "รายการวิชาเปลี่ยนไปหรือถูกรวมแล้ว กรุณาโหลดใหม่")
        return snapshot

    @staticmethod
    def plan_conflicts(snapshot):
        groups = defaultdict(list)
        for item in snapshot["plan_items"]:
            groups[(item["plan_id"], item["academic_year"], item["semester"])].append(item["item_id"])
        return [dict(plan_id=k[0], academic_year=k[1], semester=k[2], item_ids=v) for k, v in groups.items() if len(v) > 1]

    def existing_merge(self, conn, request_id):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM course_merge_history WHERE request_id=%s", (str(request_id),))
            return cur.fetchone()

    @staticmethod
    def review_conflicts(snapshot):
        groups=defaultdict(list)
        for review in snapshot['reviews']:
            if review['status']=='ACTIVE':
                groups[review['reviewer_id']].append({k:review[k] for k in ('review_id','course_id','content','rating_satisfaction','created_at')})
        return [{'reviewer_id':uid,'reviews':rows} for uid,rows in groups.items() if len(rows)>1]

    @staticmethod
    def file_overages(snapshot):
        from datetime import datetime,timezone
        now=datetime.now(timezone.utc)
        owners={b['upload_batch_id']:b['uploader_id'] for b in snapshot['batches']}
        counts=defaultdict(lambda:{'used':0,'held':0})
        for f in snapshot['files']:
            if f['status']=='ACTIVE': counts[owners[f['upload_batch_id']]]['used']+=1
        for hold in snapshot['cooldowns']:
            if hold['file_id'] and hold['expires_at']>now: counts[hold['user_id']]['held']+=1
        return [{'user_id':uid,**value} for uid,value in counts.items() if value['used']+value['held']>3]

    def lock_merge_tables(self, conn):
        # Rare admin operation: block content/plan changes briefly while moving pointers.
        # Taking table locks before course locks gives every merge the same lock order.
        with dict_cursor(conn) as cur:
            cur.execute("LOCK TABLE courses,course_instructors,reviews,summary_file_upload_batches,summary_files,contribution_cooldowns,study_plan_items,course_aliases,course_merge_history IN SHARE ROW EXCLUSIVE MODE")

    def merge(self, conn, payload, data, snapshot, user_id, request_hash):
        sources, primary = payload.source_course_ids, payload.primary_course_id
        review_conflicts=self.review_conflicts(snapshot)
        chosen=set(payload.keep_review_ids); archive=[]; allowed_reviews=set()
        for conflict in review_conflicts:
            ids={r['review_id'] for r in conflict['reviews']}; allowed_reviews.update(ids)
            if len(chosen & ids)!=1: raise ServiceError(400,'เลือกหนึ่งรีวิวที่จะคงแสดงต่อบัญชี ส่วนที่เหลือจะเก็บเป็นประวัติ')
            archive.extend(ids-chosen)
        if not chosen.issubset(allowed_reviews): raise ServiceError(400,'ตัวเลือกรีวิวไม่ตรงกับ preview')
        if self.file_overages(snapshot) and not payload.accept_file_overage:
            raise ServiceError(400,'ต้องยืนยันเก็บไฟล์เดิมแม้เกินโควต้า และงดอัปเพิ่มจนมีช่องว่าง')
        conflicts = self.plan_conflicts(snapshot)
        keep = set(payload.keep_plan_item_ids)
        remove = []
        for conflict in conflicts:
            choices = keep.intersection(conflict["item_ids"])
            if len(choices) != 1:
                raise ServiceError(400, "กรุณาเลือกรายการแผนเรียนที่จะเก็บหนึ่งรายการต่อจุดที่ซ้ำ")
            remove.extend(set(conflict["item_ids"]) - choices)
        allowed = {item_id for c in conflicts for item_id in c["item_ids"]}
        if not keep.issubset(allowed):
            raise ServiceError(400, "ตัวเลือกแผนเรียนไม่ตรงกับ preview")
        with dict_cursor(conn) as cur:
            # Release source uniqueness before changing the primary to a selected source's identity.
            cur.execute("UPDATE courses SET merged_into_course_id=%s,is_active=FALSE,updated_at=clock_timestamp() WHERE course_id=ANY(%s)", (primary, sources))
            self.update_course(conn, primary, data)
            if archive:
                cur.execute("UPDATE reviews SET status='ARCHIVED' WHERE review_id=ANY(%s)",(archive,))
            cur.execute("UPDATE reviews SET course_id=%s WHERE course_id=ANY(%s)", (primary, sources))
            cur.execute("UPDATE summary_file_upload_batches SET course_id=%s WHERE course_id=ANY(%s)", (primary, sources))
            cur.execute('UPDATE contribution_cooldowns SET course_id=%s WHERE course_id=ANY(%s)',(primary,sources))
            if remove:
                cur.execute("DELETE FROM study_plan_items WHERE item_id=ANY(%s)", (remove,))
            cur.execute("UPDATE study_plan_items SET course_id=%s WHERE course_id=ANY(%s)", (primary, sources))
            cur.execute("UPDATE study_plans SET updated_at=clock_timestamp() WHERE plan_id IN(SELECT plan_id FROM study_plan_items WHERE course_id=%s)", (primary,))
            cur.execute("UPDATE course_aliases SET canonical_course_id=%s WHERE canonical_course_id=ANY(%s)", (primary, sources))
            for course in snapshot["courses"]:
                if course["course_id"] in sources:
                    cur.execute("INSERT INTO course_aliases(source_course_id,canonical_course_id,course_code,course_name) VALUES(%s,%s,%s,%s)", (course["course_id"], primary, course["course_code"], course["course_name"]))
                elif course["course_code"] != data["course_code"] or course["course_name"] != data["course_name"]:
                    self.preserve_name(conn, course)
            moved = {"review_ids": [r["review_id"] for r in snapshot["reviews"] if r["course_id"] in sources],
                     "batch_ids": [r["upload_batch_id"] for r in snapshot["batches"] if r["course_id"] in sources],
                     "plan_items_before": snapshot["plan_items"], "explicitly_consolidated_plan_item_ids": remove,
                     "explicitly_archived_review_ids": archive, "file_overage_accepted": payload.accept_file_overage}
            encode = lambda x: json.dumps(x, default=str, ensure_ascii=False)
            cur.execute("""INSERT INTO course_merge_history(request_id,admin_id,primary_course_id,source_course_ids,reason,before_snapshot,after_snapshot,moved_records)
                           VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING merge_id""",
                        (str(payload.request_id), user_id, primary, sources, payload.reason,
                         Json(snapshot, dumps=encode), Json({"course": data, "request_hash": request_hash}, dumps=encode), Json(moved, dumps=encode)))
            return cur.fetchone()["merge_id"]

    def history(self, conn):
        with dict_cursor(conn) as cur:
            cur.execute("SELECT merge_id,admin_id,primary_course_id,source_course_ids,reason,created_at FROM course_merge_history ORDER BY merge_id DESC LIMIT 100")
            return cur.fetchall()
