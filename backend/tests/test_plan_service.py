from types import SimpleNamespace

import pytest

from domain.errors import ServiceError
from services.plan_service import PlanService


class FakeConnection:
    def __init__(self):
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


class FakePlanRepository:
    def __init__(self, plan=None, course_exists=True, duplicate=False):
        self.plan = plan
        self._course_exists = course_exists
        self._duplicate = duplicate
        self.added = None

    def find_by_id(self, conn, plan_id):
        return self.plan

    def course_exists(self, conn, course_id):
        return self._course_exists

    def item_exists_for_course(self, conn, plan_id, course_id):
        return self._duplicate

    def add_item(self, conn, plan_id, course_id, academic_year, semester):
        self.added = (plan_id, course_id, academic_year, semester)
        return 42

    def touch(self, conn, plan_id):
        pass


def make_item(course_id, academic_year, semester, credits=3, avg_workload=None):
    return {
        "item_id": course_id * 10,
        "course_id": course_id,
        "academic_year": academic_year,
        "semester": semester,
        "course_code": f"C{course_id}",
        "course_name": f"Course {course_id}",
        "credits": credits,
        "avg_satisfaction": None,
        "avg_difficulty": None,
        "avg_workload": avg_workload,
    }


def test_add_item_rejects_when_plan_owned_by_someone_else():
    service = PlanService(
        connection_factory=FakeConnection,
        plan_repository=FakePlanRepository(plan={"plan_id": 1, "student_id": 99}),
    )
    with pytest.raises(ServiceError) as exc_info:
        service.add_item(1, {"user_id": 1}, SimpleNamespace(course_id=2, academic_year=2568, semester="1"))
    assert exc_info.value.status_code == 403


def test_add_item_rejects_missing_course():
    service = PlanService(
        connection_factory=FakeConnection,
        plan_repository=FakePlanRepository(plan={"plan_id": 1, "student_id": 1}, course_exists=False),
    )
    with pytest.raises(ServiceError) as exc_info:
        service.add_item(1, {"user_id": 1}, SimpleNamespace(course_id=2, academic_year=2568, semester="1"))
    assert exc_info.value.status_code == 404


def test_add_item_rejects_duplicate_course_in_plan():
    service = PlanService(
        connection_factory=FakeConnection,
        plan_repository=FakePlanRepository(plan={"plan_id": 1, "student_id": 1}, duplicate=True),
    )
    with pytest.raises(ServiceError) as exc_info:
        service.add_item(1, {"user_id": 1}, SimpleNamespace(course_id=2, academic_year=2568, semester="1"))
    assert exc_info.value.status_code == 409


def test_build_terms_flags_unmet_prerequisite_when_not_completed_or_planned_earlier():
    service = PlanService(connection_factory=FakeConnection, plan_repository=FakePlanRepository())
    items = [make_item(course_id=3, academic_year=2568, semester="1")]
    prereq_cache = {3: [{"course_id": 4, "course_code": "MTH101", "course_name": "Calculus I"}]}

    terms = service._build_terms(items, completed=set(), prereq_cache=prereq_cache)

    assert terms[0]["items"][0]["prerequisite_unmet"] is True


def test_build_terms_clears_prerequisite_when_completed():
    service = PlanService(connection_factory=FakeConnection, plan_repository=FakePlanRepository())
    items = [make_item(course_id=3, academic_year=2568, semester="1")]
    prereq_cache = {3: [{"course_id": 4, "course_code": "MTH101", "course_name": "Calculus I"}]}

    terms = service._build_terms(items, completed={4}, prereq_cache=prereq_cache)

    assert terms[0]["items"][0]["prerequisite_unmet"] is False


def test_build_terms_clears_prerequisite_when_planned_in_earlier_term():
    service = PlanService(connection_factory=FakeConnection, plan_repository=FakePlanRepository())
    items = [
        make_item(course_id=4, academic_year=2567, semester="2"),
        make_item(course_id=3, academic_year=2568, semester="1"),
    ]
    prereq_cache = {
        4: [],
        3: [{"course_id": 4, "course_code": "MTH101", "course_name": "Calculus I"}],
    }

    terms = service._build_terms(items, completed=set(), prereq_cache=prereq_cache)

    mth201 = next(i for t in terms for i in t["items"] if i["course_id"] == 3)
    assert mth201["prerequisite_unmet"] is False


def test_build_terms_keeps_prerequisite_unmet_when_planned_same_term():
    service = PlanService(connection_factory=FakeConnection, plan_repository=FakePlanRepository())
    items = [
        make_item(course_id=4, academic_year=2568, semester="1"),
        make_item(course_id=3, academic_year=2568, semester="1"),
    ]
    prereq_cache = {
        4: [],
        3: [{"course_id": 4, "course_code": "MTH101", "course_name": "Calculus I"}],
    }

    terms = service._build_terms(items, completed=set(), prereq_cache=prereq_cache)

    mth201 = next(i for t in terms for i in t["items"] if i["course_id"] == 3)
    assert mth201["prerequisite_unmet"] is True


def test_build_terms_warns_over_credit_cap():
    service = PlanService(connection_factory=FakeConnection, plan_repository=FakePlanRepository())
    items = [make_item(course_id=n, academic_year=2568, semester="1", credits=6) for n in range(1, 5)]
    for it in items:
        it["credits"] = 6  # 4 * 6 = 24 > 22 cap

    terms = service._build_terms(items, completed=set(), prereq_cache={n: [] for n in range(1, 5)})

    codes = [w["code"] for w in terms[0]["warnings"]]
    assert "OVER_CREDIT_CAP" in codes


def test_build_terms_warns_under_credit_minimum():
    service = PlanService(connection_factory=FakeConnection, plan_repository=FakePlanRepository())
    items = [make_item(course_id=1, academic_year=2568, semester="1", credits=3)]

    terms = service._build_terms(items, completed=set(), prereq_cache={1: []})

    codes = [w["code"] for w in terms[0]["warnings"]]
    assert "UNDER_CREDIT_MIN" in codes


def test_build_terms_warns_heavy_term():
    service = PlanService(connection_factory=FakeConnection, plan_repository=FakePlanRepository())
    items = [
        make_item(course_id=1, academic_year=2568, semester="1", credits=3, avg_workload=4.5),
        make_item(course_id=2, academic_year=2568, semester="1", credits=3, avg_workload=4.0),
    ]

    terms = service._build_terms(items, completed=set(), prereq_cache={1: [], 2: []})

    codes = [w["code"] for w in terms[0]["warnings"]]
    assert "HEAVY_TERM" in codes


def test_add_item_rolls_back_on_failure():
    conn = FakeConnection()

    class FailingRepo(FakePlanRepository):
        def add_item(self, conn, plan_id, course_id, academic_year, semester):
            raise RuntimeError("db write failed")

    service = PlanService(
        connection_factory=lambda: conn,
        plan_repository=FailingRepo(plan={"plan_id": 1, "student_id": 1}),
    )
    with pytest.raises(RuntimeError, match="db write failed"):
        service.add_item(1, {"user_id": 1}, SimpleNamespace(course_id=2, academic_year=2568, semester="1"))

    assert conn.rolled_back is True
    assert conn.committed is False
    assert conn.closed is True
