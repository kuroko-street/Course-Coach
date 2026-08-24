def test_list_plans_requires_authenticated_user(client):
    response = client.get("/api/plans")
    assert response.status_code == 401


def test_seeded_plan_shows_unmet_prerequisite_and_under_credit_warning(client):
    """Seed data (db/init.sql): plan_id 1 belongs to malee_p (user 2) and
    plans MTH201 (needs MTH101) without MTH101 anywhere in the plan or her
    enrollment history, in a term totalling 6 credits (< the 9-credit min).
    """
    response = client.get("/api/plans/1", headers={"X-User-Id": "2"})
    assert response.status_code == 200, response.text
    data = response.json()
    term = data["terms"][0]
    assert term["total_credits"] == 6
    codes = {w["code"] for w in term["warnings"]}
    assert "UNDER_CREDIT_MIN" in codes
    mth201 = next(i for i in term["items"] if i["course_code"] == "MTH201")
    assert mth201["prerequisite_unmet"] is True
    assert mth201["missing_prerequisites"][0]["course_code"] == "MTH101"


def test_other_student_cannot_view_someone_elses_plan(client):
    response = client.get("/api/plans/1", headers={"X-User-Id": "1"})
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
