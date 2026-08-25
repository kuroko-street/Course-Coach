# Course Coach — Sprint 2 (Demo Prototype)

Microservices scaffold running on Docker Compose:

| Service    | Tech               | Port |
|------------|--------------------|------|
| `db`       | PostgreSQL 16      | 5432 |
| `backend`  | FastAPI (Python)   | 5000 |
| `frontend` | React + React Router (Vite) | 3000 (mapped to host `80`) |

## Run

Copy `.env.example` to `.env`, create a Google OAuth 2.0 Web client, and set
`GOOGLE_CLIENT_ID`. For local use, add `http://localhost` to the client's
authorised JavaScript origins. Keep `SESSION_SECRET` private and replace the
example value before deployment.

```bash
docker compose up --build
```

To put this on a VPS for a live demo link, see [DEPLOY.md](DEPLOY.md).

Then open:

- Frontend: http://localhost (host port `80`, see `docker-compose.yml`)
- Backend health: http://localhost:5000/health
- API docs (Swagger): http://localhost:5000/docs

The database schema and mock data are loaded automatically from
`db/init.sql` on first startup. `backend` waits for `db` to be **healthy**
(via `pg_isready`) before starting. Course-level summary files are
persisted in the `uploads_data` volume, mounted at `/app/uploads` in the
`backend` container.

## Demo walkthrough (End-to-End)

1. **`/login`** — sign in with a Google Workspace account managed by
   `kmitl.ac.th`. The backend verifies Google's signed ID token and hosted
   domain, links or creates the local user, writes a `LOGIN` audit event, and
   starts an HttpOnly cookie session. The application never receives the
   university password.
2. **`/` Course Catalog** — search by code, name, **or tag** (e.g. try
   `เขียนโปรแกรม`) or instructor name using PostgreSQL full-text search, and
   filter by department. Course cards show their instructors and tags;
   clicking a tag chip (here or on the tag filter row) re-runs the search.
3. **`/course/:id` Course Detail** — shows the deep course fields
   (prerequisites, syllabus, teaching format, workload, assessment), the
   instructor(s) teaching it with their teaching/grading style, the
   term/section offerings from the (mocked) university registrar API, and
   the `ACTIVE` reviews. Each review shows its six-aspect rating breakdown
   (satisfaction/recommendation/workload/content/teaching/exam), a like button,
   and a comment thread. Reviews and summary files are separate resources.
   - The write-review form only shows a term/section you were actually
     **enrolled** in (see `enrollments` below) — if you have zero
     enrollments for this course, the form is replaced with a notice
     instead. `somchai_s` can review CS101 (`2567`/term `2`/sec `001`,
     enrolled but not yet reviewed); switch to `malee_p` and this course's
     form is gone because she was never enrolled in it.
   - **+ รีวิว** opens the review form in a modal. Deleting that review
     restores the right to review the same enrolled term again.
   - As the review's author, use **✎ แก้ไข** / **🗑 ลบ** to edit or
     soft-delete it.
   - **+ อัปโหลด** opens a separate summary-file modal. Only students with
     a matching enrollment can upload. Each request is one upload round,
     contains 1–3 files (20MB each), and each student gets two active rounds
     per course/year/semester. Deleting every file in a round restores it.
   - **ดูทั้งหมด** opens per-course review and file pages. Reviews sort by
     newest/likes/comments; files group by academic year and semester.
   - Hit **⚑ Report** on a review **five times**: on the fifth report the
     review is auto-hidden and vanishes from the list.
4. **`/dashboard`** — summary cards plus separate rankings for review count,
   engagement (likes), and all six rating aspects. Rankings can be filtered
   by department and minimum review count. The recommendation-score tab is
   deliberately disabled until the scoring policy is agreed.
5. **`/profile/:id`** — click a reviewer's name anywhere (or your own
   username in the navbar) to see their avatar, average rating per aspect,
   total likes received, and full review history. On your **own** profile
   only, a **"วิชาที่มีสิทธิ์รีวิว"** section lists every course/term you're
   enrolled in and whether you've reviewed it yet — this is exactly the set
   of courses the write-review form on `/course/:id` will let you submit
   for.
6. **`/admin` Admin Queue** — an existing administrator must grant the local
   `ADMIN` role to the appropriate verified KMITL user in the database. The
   hidden review or summary file is then available in its moderation queue.
   **✓ Keep** restores it (`status = ACTIVE`, `report_count = 0`) while
   preserving the `review_reports` history; **🗑 Delete** soft-deletes it
   (`status = DELETED`).

Trying to open `/admin` as a STUDENT is blocked in the router *and*
rejected with `403` by the API. Editing/deleting someone else's review, or
uploading a summary file without a matching enrollment, is likewise blocked
in the UI *and* rejected with `403` by the API.

## Seed users

| id | username       | role    |
|----|----------------|---------|
| 1  | `somchai_s`    | STUDENT |
| 2  | `malee_p`      | STUDENT |
| 3  | `admin_wichai` | ADMIN   |

## Engineering rules enforced

- **Transactions:** every endpoint that writes more than one table
  (`reviews` + `audit_logs` on create/edit/delete, `review_reports` +
  `reviews` + `audit_logs` on report, or summary-file batch + files + audit
  logs on upload) commits or rolls back as a single unit. Transaction boundaries live
  in `backend/services/`; repositories never commit independently.
- **Row locking:** the report, edit, and delete endpoints take
  `SELECT … FOR UPDATE` on the review row so concurrent requests cannot
  race past the report-hide threshold or clobber each other's writes.
- **ENUM over VARCHAR:** fixed-value columns (`users.role`,
  `reviews.status`, `audit_logs.action`) use PostgreSQL `ENUM` types
  (see `db/init.sql`).
- **Server-side authentication and authorisation:** Google Workspace proves
  identity, while a signed HttpOnly cookie carries the application session.
  The backend re-resolves that user and checks the role in the database.
  Review edit/delete re-check ownership, while summary-file upload re-checks
  the enrollment and term server-side. Hiding a button is never the only protection.
- **Soft delete:** reviews are never physically removed — author or admin
  `DELETE` sets `status = 'DELETED'`, keeping the audit trail intact.
- **Complete-or-reject writes:** a review cannot be saved without all six
  rating aspects (`NOT NULL` + `CHECK (... BETWEEN 1 AND 5)` on every
  `rating_*` column).
- **Eligibility over trust:** `POST`/`PUT /api/reviews` check the
  `enrollments` table for the (student, course, year, semester, section)
  before writing — a student cannot review a course/term they were never
  enrolled in, no matter what the client sends.
- **Hybrid full-text course search:** weighted PostgreSQL FTS handles
  multi-word/web-style queries, prefix queries handle incomplete terms,
  and `pg_trgm` plus an every-term fallback cover small typos and partial
  Thai text. Exact identifiers receive the strongest relevance boost; no
  external search server or duplicated search table is required.

## API

| Method | Path                                  | Auth        | Description                                          |
|--------|---------------------------------------|-------------|--------------------------------------------------------|
| GET    | `/health`                             | —           | Service + DB status                                    |
| GET    | `/api/auth/config`                    | —           | Public Google login configuration                       |
| POST   | `/api/auth/google`                    | —           | Verify Google ID token and create an HttpOnly session   |
| GET    | `/api/auth/me`                        | login       | Return the session's current user                       |
| POST   | `/api/auth/logout`                    | login       | Clear the current session                               |
| GET    | `/api/departments`                    | —           | Distinct department list (powers the filter)            |
| GET    | `/api/tags`                           | —           | Full tag list (tag filter row / autocomplete)           |
| GET    | `/api/courses?search=&department=`    | —           | Full-text course search (code, name, department, tag, or instructor) |
| GET    | `/api/courses/{id}`                   | —           | Course detail + instructors + tags + mock offerings     |
| GET    | `/api/courses/{id}/reviews`           | optional¹   | `ACTIVE` reviews, with ratings/likes/comment counts      |
| GET    | `/api/courses/{id}/enrollments/me`    | login       | Caller's own enrolled term/section for this course (drives the write-review form) |
| POST   | `/api/reviews`                        | enrolled²   | Create a review with full rating breakdown (transactional) |
| PUT    | `/api/reviews/{id}`                   | own review + enrolled² | Edit your own review (transactional)         |
| DELETE | `/api/reviews/{id}`                   | own review  | Soft-delete your own review (transactional)             |
| POST   | `/api/reviews/{id}/report`            | —           | Report a review; auto-hides at 5 (transactional)        |
| POST   | `/api/reviews/{id}/like`              | login       | Like a review (idempotent)                              |
| DELETE | `/api/reviews/{id}/like`              | login       | Unlike a review                                         |
| GET    | `/api/reviews/{id}/comments`          | —           | List comments on a review                                |
| POST   | `/api/reviews/{id}/comments`          | login       | Post a comment on a review                               |
| GET    | `/api/courses/{id}/summary-files`     | login       | List active summary files for this course                |
| POST   | `/api/courses/{id}/summary-files`     | enrolled    | Upload 1–3 files as one round (multipart, 20MB each)     |
| GET    | `/api/summary-files/{id}/download`    | login       | Download an active summary file                          |
| POST   | `/api/summary-files/{id}/like`        | login       | Toggle a like on a summary file                          |
| POST   | `/api/summary-files/{id}/comments`    | login       | Comment on a summary file                                |
| POST   | `/api/summary-files/{id}/report`      | login       | Report; auto-hide at 5 reports                           |
| DELETE | `/api/summary-files/{id}`             | owner/admin | Soft-delete; restore round when its last file is deleted |
| GET    | `/api/dashboard/rankings?metric=&department=&min_reviews=` | — | Dashboard rankings by engagement or rating aspect |
| GET    | `/api/dashboard/summary`              | —           | Dashboard totals for courses, active reviews, reviewers, likes and comments |
| GET    | `/api/users/{id}/profile`             | —           | Reviewer profile: averages, total likes, review history   |
| GET    | `/api/users/{id}/enrollments`         | self-only   | "วิชาที่มีสิทธิ์รีวิว": every course/term the user is enrolled in + reviewed flag |
| GET    | `/api/admin/reports`                  | ADMIN       | Moderation queue (`HIDDEN` reviews)                       |
| POST   | `/api/admin/reviews/{id}/action`      | ADMIN       | `{"action": "KEEP" \| "DELETE"}`                          |
| GET    | `/api/admin/summary-files`            | ADMIN       | Moderation queue (`HIDDEN` summary files)                 |
| POST   | `/api/admin/summary-files/{id}/action`| ADMIN       | Keep or delete a reported summary file                   |
| GET    | `/api/audit-logs?limit=`              | ADMIN       | Recent audit trail                                        |

¹ `GET /api/courses/{id}/reviews` uses the optional session cookie to
personalise `liked_by_me`; it works without a signed-in user.

² "enrolled" means the signed-in user has a matching row in
`enrollments` for that exact (course, academic_year, semester, section) —
`403` otherwise, checked server-side regardless of what the client sends.

"login"-gated endpoints require a valid session (`401` if missing or
invalid). "own review"-gated endpoints additionally check that the session
user is the review's `reviewer_id` (`403`
otherwise). "self-only" endpoints require the header's user to BE the
`{id}` in the path (`403` for anyone else — this is enrollment history,
not public data). Admin endpoints require the session user to have the local
`ADMIN` role (`401` if unauthenticated, `403` if the user is a student).

### Example POST bodies

```json
// POST /api/reviews (the author comes from the session, never from this body)
{
  "course_id": 1,
  "content": "Really solid intro course.",
  "academic_year": 2567,
  "semester": "1",
  "section": "001",
  "rating_satisfaction": 5,
  "rating_recommendation": 4,
  "rating_workload": 2,
  "rating_content": 4,
  "rating_teaching": 5,
  "rating_exam": 3
}
```

```json
// POST /api/reviews/{id}/comments
{ "content": "How heavy is the workload really?" }
```

> **Note on existing data:** `db/init.sql` initializes a new database, while
> the idempotent scripts in `db/migrations/` upgrade an existing volume without
> deleting its data. Normal schema upgrades therefore do not require
> `docker compose down -v`.

## Backend architecture

```text
React -> FastAPI routes -> Services -> Repositories -> PostgreSQL / File Storage
```

- `backend/api/`: HTTP boundary, authentication dependencies, status codes.
- `backend/services/`: business rules and transaction ownership.
- `backend/repositories/`: SQL only; receives the service's connection.
- `backend/schemas/`: Pydantic request validation.
- `backend/domain/`: transport-independent application errors.

The implementation class diagram and create-review sequence are in
`docs/CLASS_DIAGRAM.md` and `docs/REVIEW_SEQUENCE_DIAGRAM.md`.
