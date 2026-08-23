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
        "/api/users/1/profile",
    ]
    for path in cases:
        response = client.get(path)
        assert response.status_code == 200, f"{path}: {response.text}"


def test_protected_endpoints_enforce_role_and_identity(client):
    assert client.get("/api/admin/reports", headers={"X-User-Id": "1"}).status_code == 403
    assert client.get("/api/admin/reports", headers={"X-User-Id": "3"}).status_code == 200
    assert client.get("/api/users/1/enrollments", headers={"X-User-Id": "2"}).status_code == 403
    assert client.get("/api/users/1/enrollments", headers={"X-User-Id": "1"}).status_code == 200
