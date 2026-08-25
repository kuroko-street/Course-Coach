def test_dashboard_summary_uses_active_reviews_only(client):
    response = client.get("/api/dashboard/summary")

    assert response.status_code == 200
    summary = response.json()["summary"]
    assert summary == {
        "course_count": 3,
        "review_count": 3,
        "reviewer_count": 2,
        "total_likes": 3,
        "total_comments": 2,
        "avg_satisfaction": 4.0,
    }


def test_dashboard_review_ranking_uses_satisfaction_as_tie_breaker(client):
    response = client.get("/api/dashboard/rankings", params={"metric": "reviews"})

    assert response.status_code == 200
    assert [row["course_code"] for row in response.json()["rankings"]] == [
        "SCI101", "CS101", "MTH201"
    ]


def test_dashboard_like_ranking_counts_active_review_likes(client):
    response = client.get("/api/dashboard/rankings", params={"metric": "likes"})

    assert response.status_code == 200
    rows = response.json()["rankings"]
    assert [(row["course_code"], row["metric_value"]) for row in rows] == [
        ("SCI101", 2), ("CS101", 1), ("MTH201", 0)
    ]


def test_dashboard_returns_all_six_rating_averages(client):
    response = client.get("/api/dashboard/rankings", params={"metric": "teaching"})

    assert response.status_code == 200
    rows = response.json()["rankings"]
    assert [row["course_code"] for row in rows] == ["CS101", "SCI101", "MTH201"]
    assert set(rows[0]) >= {
        "avg_satisfaction", "avg_recommendation", "avg_workload",
        "avg_content", "avg_teaching", "avg_exam",
        "review_count", "reviewer_count", "total_likes", "total_comments",
    }
    assert rows[0]["metric_value"] == 5.0


def test_dashboard_ranks_by_recommendation(client):
    response = client.get(
        "/api/dashboard/rankings", params={"metric": "recommendation"}
    )

    assert response.status_code == 200
    rows = response.json()["rankings"]
    assert all("avg_recommendation" in row for row in rows)
    values = [float(row["metric_value"]) for row in rows if row["metric_value"] is not None]
    assert values == sorted(values, reverse=True)


def test_dashboard_filters_by_department(client):
    response = client.get(
        "/api/dashboard/rankings",
        params={"metric": "reviews", "department": "สาขาคณิตศาสตร์"},
    )

    assert response.status_code == 200
    assert [row["course_code"] for row in response.json()["rankings"]] == [
        "MTH201"
    ]


def test_dashboard_filters_by_minimum_review_count(client):
    response = client.get(
        "/api/dashboard/rankings", params={"metric": "reviews", "min_reviews": 3}
    )

    assert response.status_code == 200
    assert response.json()["rankings"] == []


def test_dashboard_rejects_unknown_metric(client):
    response = client.get(
        "/api/dashboard/rankings", params={"metric": "invented-score"}
    )

    assert response.status_code == 400


def test_dashboard_rejects_negative_minimum_reviews(client):
    response = client.get(
        "/api/dashboard/rankings", params={"metric": "reviews", "min_reviews": -1}
    )

    assert response.status_code == 422
