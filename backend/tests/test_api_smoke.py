def test_public_read_endpoints(client):
    cases = [
        "/health",
        "/api/users",
        "/api/departments",
        "/api/tags",
        "/api/courses",
        "/api/courses/1",
        "/api/courses/1/reviews",
        "/api/dashboard/rankings",
        "/api/dashboard/summary",
        "/api/users/1/profile",
    ]
    for path in cases:
        response = client.get(path)
        assert response.status_code == 200, f"{path}: {response.text}"


def test_course_full_text_search_includes_instructor_names(client):
    response = client.get("/api/courses", params={"search": "วิภาวรรณ"})

    assert response.status_code == 200
    courses = response.json()["courses"]
    assert [course["course_code"] for course in courses] == ["CS101"]
    assert "อ.วิภาวรรณ เขียนโค้ด" in courses[0]["instructors"]


def test_course_full_text_search_accepts_multiple_terms(client):
    response = client.get(
        "/api/courses", params={"search": "Introduction Computer"}
    )

    assert response.status_code == 200
    assert [course["course_code"] for course in response.json()["courses"]] == [
        "CS101"
    ]


def test_course_search_supports_prefixes_across_separate_words(client):
    response = client.get(
        "/api/courses", params={"search": "Introduction Com"}
    )

    assert response.status_code == 200
    assert [course["course_code"] for course in response.json()["courses"]] == [
        "CS101"
    ]


def test_course_search_supports_partial_thai_words(client):
    response = client.get("/api/courses", params={"search": "คอม"})

    assert response.status_code == 200
    assert [course["course_code"] for course in response.json()["courses"]] == [
        "CS101"
    ]


def test_course_search_tolerates_small_typing_mistakes(client):
    response = client.get("/api/courses", params={"search": "Computor"})

    assert response.status_code == 200
    assert [course["course_code"] for course in response.json()["courses"]] == [
        "CS101"
    ]


def test_course_search_preserves_websearch_or_syntax(client):
    response = client.get(
        "/api/courses", params={"search": "Calculus OR Computer"}
    )

    assert response.status_code == 200
    assert {course["course_code"] for course in response.json()["courses"]} == {
        "CS101", "MTH201"
    }


def test_exact_course_code_is_ranked_first(client):
    response = client.get("/api/courses", params={"search": "CS101"})

    assert response.status_code == 200
    assert response.json()["courses"][0]["course_code"] == "CS101"
    assert float(response.json()["courses"][0]["search_score"]) >= 100


def test_protected_endpoints_enforce_role_and_identity(client):
    assert client.get("/api/admin/reports", headers={"X-User-Id": "1"}).status_code == 403
    assert client.get("/api/admin/reports", headers={"X-User-Id": "3"}).status_code == 200
    assert client.get("/api/users/1/enrollments", headers={"X-User-Id": "2"}).status_code == 403
    assert client.get("/api/users/1/enrollments", headers={"X-User-Id": "1"}).status_code == 200
