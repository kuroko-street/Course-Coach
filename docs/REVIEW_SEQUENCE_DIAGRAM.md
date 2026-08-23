# Create Review — Implementation Sequence Diagram

All participant and operation names correspond to the current implementation.
`create_review` in the API lane is a FastAPI route function; the remaining
named operations are real class methods.

```mermaid
sequenceDiagram
actor Student
participant UI as CourseDetail.jsx
participant API as review_routes.create_review
participant Auth as dependencies.require_user
participant Service as ReviewService
participant CourseRepo as ReviewRepository
participant EnrollRepo as EnrollmentRepository
participant ReviewRepo as ReviewRepository
participant AuditRepo as AuditLogRepository
participant DB as PostgreSQL

Student->>UI: submit review form
UI->>API: POST /api/reviews + X-User-Id
API->>Auth: require_user(X-User-Id)
Auth->>DB: SELECT user
DB-->>Auth: authenticated user
API->>Service: create_review(user, payload, ip_address)
Service->>CourseRepo: course_exists(conn, course_id)
CourseRepo->>DB: SELECT course
DB-->>CourseRepo: exists
Service->>EnrollRepo: exists(conn, user_id, course, term, section)
EnrollRepo->>DB: SELECT enrollment
DB-->>EnrollRepo: eligible
Service->>ReviewRepo: create(conn, user_id, payload)
ReviewRepo->>DB: INSERT review
DB-->>ReviewRepo: review_id
Service->>AuditRepo: create(conn, user_id, WRITE_REVIEW, review_id, ip)
AuditRepo->>DB: INSERT audit_log
Service->>DB: commit()
Service-->>API: review_id and message
API-->>UI: 201 Created
UI-->>Student: show created review

alt any write or business rule fails
  Service->>DB: rollback()
  API-->>UI: 4xx or 5xx error
end
```

## Identity rule

The author ID is taken only from `require_user`; `ReviewCreate` deliberately
does not contain `reviewer_id`. A client therefore cannot create a review in
another user's name by changing the JSON body.
