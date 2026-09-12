from db import get_connection
from domain.errors import ServiceError
from repositories.plan_repository import PlanRepository


class PlanService:
    """Personal planning only, with no attendance or registration claims."""

    def __init__(self, connection_factory=get_connection, plan_repository=None):
        self.connection_factory = connection_factory
        self.plans = plan_repository or PlanRepository()

    @staticmethod
    def _sem_rank(semester):
        try:
            return int(semester)
        except (TypeError, ValueError):
            return 99

    def _term_key(self, item):
        return (item["academic_year"], self._sem_rank(item["semester"]))

    def _own_plan(self, conn, plan_id, user):
        plan = self.plans.find_by_id(conn, plan_id)
        if plan is None:
            raise ServiceError(404, f"Plan id {plan_id} not found.")
        if plan["student_id"] != user["user_id"]:
            raise ServiceError(403, "You can only manage your own study plans.")
        return plan

    def list_plans(self, user):
        conn = self.connection_factory()
        try:
            return {"plans": self.plans.list_for_student(conn, user["user_id"])}
        finally:
            conn.close()

    def create_plan(self, user, data):
        conn = self.connection_factory()
        try:
            plan_id = self.plans.create(conn, user["user_id"], data.plan_name.strip())
            conn.commit()
            return {"plan_id": plan_id, "message": "Study plan created."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def rename_plan(self, plan_id, user, data):
        conn = self.connection_factory()
        try:
            self._own_plan(conn, plan_id, user)
            self.plans.rename(conn, plan_id, data.plan_name.strip())
            conn.commit()
            return {"plan_id": plan_id, "message": "Study plan renamed."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def delete_plan(self, plan_id, user):
        conn = self.connection_factory()
        try:
            self._own_plan(conn, plan_id, user)
            self.plans.delete(conn, plan_id)
            conn.commit()
            return {"plan_id": plan_id, "message": "Study plan deleted."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def add_item(self, plan_id, user, data):
        conn = self.connection_factory()
        try:
            self._own_plan(conn, plan_id, user)
            if not self.plans.course_exists(conn, data.course_id):
                raise ServiceError(404, f"Course id {data.course_id} not found.")
            if self.plans.item_exists_for_course(conn, plan_id, data.course_id, data.academic_year, data.semester):
                raise ServiceError(409, "This course is already in the plan.")
            item_id = self.plans.add_item(conn, plan_id, data.course_id, data.academic_year, data.semester)
            self.plans.touch(conn, plan_id)
            conn.commit()
            return {"item_id": item_id, "message": "Course added to plan."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def move_item(self, plan_id, item_id, user, data):
        conn = self.connection_factory()
        try:
            self._own_plan(conn, plan_id, user)
            item = self.plans.find_item(conn, item_id)
            if item is None or item["plan_id"] != plan_id:
                raise ServiceError(404, f"Item id {item_id} not found in this plan.")
            if self.plans.item_exists_for_course(conn, plan_id, item['course_id'], data.academic_year, data.semester, item_id):
                raise ServiceError(409, "รายวิชานี้อยู่ในเทอมเป้าหมายนั้นแล้ว")
            self.plans.move_item(conn, item_id, data.academic_year, data.semester)
            self.plans.touch(conn, plan_id)
            conn.commit()
            return {"item_id": item_id, "message": "Course moved."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def delete_item(self, plan_id, item_id, user):
        conn = self.connection_factory()
        try:
            self._own_plan(conn, plan_id, user)
            item = self.plans.find_item(conn, item_id)
            if item is None or item["plan_id"] != plan_id:
                raise ServiceError(404, f"Item id {item_id} not found in this plan.")
            self.plans.delete_item(conn, item_id)
            self.plans.touch(conn, plan_id)
            conn.commit()
            return {"item_id": item_id, "message": "Course removed from plan."}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def get_plan(self, plan_id, user):
        conn = self.connection_factory()
        try:
            plan = self._own_plan(conn, plan_id, user)
            items = self.plans.list_items(conn, plan_id)
        finally:
            conn.close()

        return {
            "plan_id": plan["plan_id"],
            "plan_name": plan["plan_name"],
            "created_at": plan["created_at"],
            "updated_at": plan["updated_at"],
            "terms": self._build_terms(items),
        }

    def _build_terms(self, items):
        grouped = {}
        for it in items:
            term_id = (it["academic_year"], it["semester"])
            grouped.setdefault(term_id, []).append(it)

        ordered_term_ids = sorted(grouped.keys(), key=lambda t: (t[0], self._sem_rank(t[1])))

        terms = []
        for academic_year, semester in ordered_term_ids:
            term_items = grouped[(academic_year, semester)]
            warnings = []
            credits_by_code = {}
            counts = {}
            for it in term_items:
                key = it.get('code_normalized') or it['course_code'].strip().casefold()
                counts[key] = counts.get(key, 0) + 1
                credits_by_code[key] = max(credits_by_code.get(key, 0), it['credits'])
            duplicate_codes = [key for key,count in counts.items() if count > 1]
            if duplicate_codes:
                warnings.append({'code':'DUPLICATE_CODE','message':'มีรหัสวิชาซ้ำในเทอมนี้: ' + ', '.join(duplicate_codes) + ' ยอดประมาณนับรหัสละหนึ่งครั้ง โดยใช้หน่วยกิตสูงสุดของรายการซ้ำ กรุณาเลือกเก็บรายการที่ต้องการ'})
            if any(not it.get('is_active', True) for it in term_items):
                warnings.append({'code':'INACTIVE_COURSE','message':'มีรายการวิชาที่แอดมินปิดแสดงแล้ว ข้อมูลในแผนเป็นเพียงรายการอ้างอิงเดิม'})

            terms.append({
                "academic_year": academic_year,
                "semester": semester,
                "total_credits": sum(credits_by_code.values()),
                "raw_credits": sum(it['credits'] for it in term_items),
                "warnings": warnings,
                "items": term_items,
            })

        return terms
