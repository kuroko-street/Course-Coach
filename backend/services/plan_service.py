from db import get_connection
from domain.errors import ServiceError
from repositories.plan_repository import PlanRepository


class PlanService:
    """Course-planning sandbox: draft study plans a student can build and
    revise before real registration opens.

    Credit-cap / prerequisite checks are deliberately *soft* (warnings, not
    hard blocks) — a student sketching a plan may legitimately want to place
    an over-cap or prerequisite-pending course while they're still figuring
    things out. `POST /api/reviews` enforces enrollment eligibility hard
    because that is a data-integrity rule; a study plan is just a draft.
    """

    MAX_CREDITS_PER_TERM = 22
    MIN_CREDITS_PER_TERM = 9
    HEAVY_WORKLOAD_THRESHOLD = 4
    HEAVY_TERM_COURSE_COUNT = 2

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
            if self.plans.item_exists_for_course(conn, plan_id, data.course_id):
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
            completed = self.plans.completed_course_ids(conn, user["user_id"])
            prereq_cache = {}
            for it in items:
                if it["course_id"] not in prereq_cache:
                    prereq_cache[it["course_id"]] = self.plans.prerequisites_for(conn, it["course_id"])
        finally:
            conn.close()

        return {
            "plan_id": plan["plan_id"],
            "plan_name": plan["plan_name"],
            "created_at": plan["created_at"],
            "updated_at": plan["updated_at"],
            "terms": self._build_terms(items, completed, prereq_cache),
        }

    def _build_terms(self, items, completed, prereq_cache):
        earliest_term_for_course = {}
        for it in items:
            key = self._term_key(it)
            current = earliest_term_for_course.get(it["course_id"])
            if current is None or key < current:
                earliest_term_for_course[it["course_id"]] = key

        grouped = {}
        for it in items:
            term_id = (it["academic_year"], it["semester"])
            grouped.setdefault(term_id, []).append(it)

        ordered_term_ids = sorted(grouped.keys(), key=lambda t: (t[0], self._sem_rank(t[1])))

        terms = []
        for academic_year, semester in ordered_term_ids:
            term_items = grouped[(academic_year, semester)]
            total_credits = sum(int(i["credits"]) for i in term_items)
            heavy_count = sum(
                1 for i in term_items
                if i["avg_workload"] is not None and float(i["avg_workload"]) >= self.HEAVY_WORKLOAD_THRESHOLD
            )

            warnings = []
            if total_credits > self.MAX_CREDITS_PER_TERM:
                warnings.append({
                    "code": "OVER_CREDIT_CAP",
                    "message": f"หน่วยกิตรวม {total_credits} เกินเกณฑ์สูงสุด {self.MAX_CREDITS_PER_TERM} หน่วยกิต",
                })
            if total_credits < self.MIN_CREDITS_PER_TERM:
                warnings.append({
                    "code": "UNDER_CREDIT_MIN",
                    "message": f"หน่วยกิตรวม {total_credits} ต่ำกว่าเกณฑ์ขั้นต่ำ {self.MIN_CREDITS_PER_TERM} หน่วยกิต",
                })
            if heavy_count >= self.HEAVY_TERM_COURSE_COUNT:
                warnings.append({
                    "code": "HEAVY_TERM",
                    "message": f"เทอมนี้มีวิชาภาระงานหนัก {heavy_count} วิชา",
                })

            item_rows = []
            for it in term_items:
                missing = []
                for prereq in prereq_cache.get(it["course_id"], []):
                    pid = prereq["course_id"]
                    if pid in completed:
                        continue
                    earliest = earliest_term_for_course.get(pid)
                    if earliest is not None and earliest < self._term_key(it):
                        continue
                    missing.append(prereq)
                item_rows.append({**it, "prerequisite_unmet": len(missing) > 0, "missing_prerequisites": missing})

            terms.append({
                "academic_year": academic_year,
                "semester": semester,
                "total_credits": total_credits,
                "warnings": warnings,
                "items": item_rows,
            })

        return terms
