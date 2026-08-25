import pytest


@pytest.fixture()
def unmet_prereq_plan(db_conn):
    """Builds its own MTH101/prerequisite/plan data instead of relying on
    the demo seed (db/migrations/003_study_plans_demo_seed.sql), so this
    test suite doesn't depend on data that's excluded from the test DB.
    Plans MTH201 (needs MTH101) for malee_p without MTH101 anywhere in the
    plan, in a term totalling 6 credits (< the 9-credit min).
    """
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO courses (course_code, course_name, department, credits, prerequisites)
            VALUES ('MTH101', 'Calculus I', 'สาขาคณิตศาสตร์', 3, 'ไม่มีวิชาบังคับก่อน')
            ON CONFLICT (course_code) DO NOTHING
            """
        )
        cur.execute("SELECT course_id FROM courses WHERE course_code = 'MTH101'")
        mth101_id = cur.fetchone()[0]
        cur.execute("SELECT course_id FROM courses WHERE course_code = 'MTH201'")
        mth201_id = cur.fetchone()[0]
        cur.execute("SELECT course_id FROM courses WHERE course_code = 'SCI101'")
        sci101_id = cur.fetchone()[0]

        cur.execute(
            "INSERT INTO course_prerequisites (course_id, prerequisite_course_id) "
            "VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (mth201_id, mth101_id),
        )

        cur.execute("SELECT user_id FROM users WHERE username = 'malee_p'")
        student_id = cur.fetchone()[0]

        cur.execute(
            "INSERT INTO study_plans (student_id, plan_name) VALUES (%s, %s) RETURNING plan_id",
            (student_id, "Test unmet prereq plan"),
        )
        plan_id = cur.fetchone()[0]

        cur.executemany(
            "INSERT INTO study_plan_items (plan_id, course_id, academic_year, semester) "
            "VALUES (%s, %s, 2568, '1')",
            [(plan_id, sci101_id), (plan_id, mth201_id)],
        )
    db_conn.commit()

    yield plan_id

    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM study_plan_items WHERE plan_id = %s", (plan_id,))
        cur.execute("DELETE FROM study_plans WHERE plan_id = %s", (plan_id,))
        cur.execute("DELETE FROM course_prerequisites WHERE prerequisite_course_id = %s", (mth101_id,))
        cur.execute("DELETE FROM courses WHERE course_id = %s", (mth101_id,))
    db_conn.commit()


def test_list_plans_requires_authenticated_user(client):
    response = client.get("/api/plans")
    assert response.status_code == 401


def test_seeded_plan_shows_unmet_prerequisite_and_under_credit_warning(client, unmet_prereq_plan):
    plan_id = unmet_prereq_plan
    response = client.get(f"/api/plans/{plan_id}", headers={"X-User-Id": "2"})
    assert response.status_code == 200, response.text
    data = response.json()
    term = data["terms"][0]
    assert term["total_credits"] == 6
    codes = {w["code"] for w in term["warnings"]}
    assert "UNDER_CREDIT_MIN" in codes
    mth201 = next(i for i in term["items"] if i["course_code"] == "MTH201")
    assert mth201["prerequisite_unmet"] is True
    assert mth201["missing_prerequisites"][0]["course_code"] == "MTH101"


def test_other_student_cannot_view_someone_elses_plan(client, unmet_prereq_plan):
    plan_id = unmet_prereq_plan
    response = client.get(f"/api/plans/{plan_id}", headers={"X-User-Id": "1"})
    assert response.status_code == 403


def test_create_plan_add_item_and_delete_full_lifecycle(client, db_conn):
    create = client.post("/api/plans", headers={"X-User-Id": "1"}, json={"plan_name": "Integration test plan"})
    assert create.status_code == 201, create.text
    plan_id = create.json()["plan_id"]

    add = client.post(
        f"/api/plans/{plan_id}/items",
        headers={"X-User-Id": "1"},
        json={"course_id": 2, "academic_year": 2568, "semester": "1"},
    )
    assert add.status_code == 201, add.text
    item_id = add.json()["item_id"]

    detail = client.get(f"/api/plans/{plan_id}", headers={"X-User-Id": "1"})
    assert detail.status_code == 200
    assert detail.json()["terms"][0]["items"][0]["course_id"] == 2

    duplicate = client.post(
        f"/api/plans/{plan_id}/items",
        headers={"X-User-Id": "1"},
        json={"course_id": 2, "academic_year": 2568, "semester": "2"},
    )
    assert duplicate.status_code == 409

    move = client.put(
        f"/api/plans/{plan_id}/items/{item_id}",
        headers={"X-User-Id": "1"},
        json={"academic_year": 2568, "semester": "2"},
    )
    assert move.status_code == 200

    delete_item = client.delete(f"/api/plans/{plan_id}/items/{item_id}", headers={"X-User-Id": "1"})
    assert delete_item.status_code == 200

    delete_plan = client.delete(f"/api/plans/{plan_id}", headers={"X-User-Id": "1"})
    assert delete_plan.status_code == 200

    with db_conn.cursor() as cur:
        cur.execute("SELECT 1 FROM study_plans WHERE plan_id = %s", (plan_id,))
        assert cur.fetchone() is None
