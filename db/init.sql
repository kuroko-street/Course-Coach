-- ============================================================
-- Course Coach - Database Schema (Sprint 2)
-- PostgreSQL 16
-- Engineering rule: fixed-value columns use ENUM, never VARCHAR
-- ============================================================

-- ----------------------------------------------------------------
-- ENUM Types (fixed-value domains)
-- ----------------------------------------------------------------
CREATE TYPE user_role     AS ENUM ('STUDENT', 'ADMIN');
CREATE TYPE review_status AS ENUM ('ACTIVE', 'HIDDEN', 'DELETED');
CREATE TYPE audit_action  AS ENUM (
    'LOGIN', 'WRITE_REVIEW', 'EDIT_REVIEW', 'DELETE_REVIEW',
    'UPLOAD_FILE', 'FLAG_REPORT', 'MODERATE_REVIEW', 'MANAGE_COURSE'
);

-- ----------------------------------------------------------------
-- Table: users
-- ----------------------------------------------------------------
CREATE TABLE users (
    user_id            SERIAL PRIMARY KEY,
    username           VARCHAR(100) NOT NULL UNIQUE,
    email              VARCHAR(255) NOT NULL UNIQUE,
    role               user_role    NOT NULL DEFAULT 'STUDENT',
    avatar_url         VARCHAR(500) NULL,
    is_report_blocked  BOOLEAN      NOT NULL DEFAULT FALSE,
    blocked_until      TIMESTAMP    NULL
);

-- ----------------------------------------------------------------
-- Table: courses
-- FR-4: deep course detail fields beyond code/name/department.
-- ----------------------------------------------------------------
CREATE TABLE courses (
    course_id        SERIAL PRIMARY KEY,
    course_code      VARCHAR(20)  NOT NULL UNIQUE,
    course_name      VARCHAR(255) NOT NULL,
    department       VARCHAR(255) NOT NULL,
    prerequisites    TEXT NULL,
    syllabus         TEXT NULL,
    teaching_format  TEXT NULL,
    workload         TEXT NULL,
    assessment       TEXT NULL
    ,is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);

-- A course is shared data; its recommended year/term belongs to a particular
-- curriculum version, not to the course itself.
CREATE TABLE curriculums (
    curriculum_id    SERIAL PRIMARY KEY,
    curriculum_name  VARCHAR(255) NOT NULL,
    academic_year    INT          NOT NULL,
    department       VARCHAR(255) NOT NULL,
    degree_level     VARCHAR(100) NOT NULL DEFAULT 'ปริญญาตรี',
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    UNIQUE (curriculum_name, academic_year)
);

CREATE TABLE curriculum_courses (
    curriculum_id        INT NOT NULL REFERENCES curriculums(curriculum_id),
    course_id            INT NOT NULL REFERENCES courses(course_id),
    recommended_year     SMALLINT NOT NULL CHECK (recommended_year BETWEEN 1 AND 8),
    recommended_semester VARCHAR(20) NOT NULL,
    requirement_type     VARCHAR(20) NOT NULL DEFAULT 'REQUIRED'
                         CHECK (requirement_type IN ('REQUIRED', 'ELECTIVE')),
    PRIMARY KEY (curriculum_id, course_id)
);

-- ----------------------------------------------------------------
-- Table: instructors  (FR-5)
-- ----------------------------------------------------------------
CREATE TABLE instructors (
    instructor_id   SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    bio             TEXT NULL,
    teaching_style  TEXT NULL,
    grading_style   TEXT NULL
);

-- Many instructors can teach one course over different sections/terms,
-- and one instructor can teach many courses.
CREATE TABLE course_instructors (
    course_id      INT NOT NULL REFERENCES courses(course_id),
    instructor_id  INT NOT NULL REFERENCES instructors(instructor_id),
    PRIMARY KEY (course_id, instructor_id)
);

-- ----------------------------------------------------------------
-- Table: enrollments
-- Source of truth for "which courses is this student allowed to review".
-- A review may only be created for a (course, academic_year, semester,
-- section) the reviewer actually has an enrollment row for.
-- ----------------------------------------------------------------
CREATE TABLE enrollments (
    enrollment_id  SERIAL PRIMARY KEY,
    student_id     INT         NOT NULL REFERENCES users(user_id),
    course_id      INT         NOT NULL REFERENCES courses(course_id),
    academic_year  INT         NOT NULL,
    semester       VARCHAR(20) NOT NULL,
    section        VARCHAR(20) NOT NULL,
    UNIQUE (student_id, course_id, academic_year, semester, section)
);

-- ----------------------------------------------------------------
-- Table: tags + course_tags  (FR-1 keyword/tag search)
-- ----------------------------------------------------------------
CREATE TABLE tags (
    tag_id    SERIAL PRIMARY KEY,
    tag_name  VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE course_tags (
    course_id  INT NOT NULL REFERENCES courses(course_id),
    tag_id     INT NOT NULL REFERENCES tags(tag_id),
    PRIMARY KEY (course_id, tag_id)
);

-- ----------------------------------------------------------------
-- Table: reviews
-- FR-7: rating is broken down per-aspect, 1-5, all required (NFR-10 -
-- a review cannot be saved without a complete rating breakdown).
-- Note: academic_year is INT; semester/section are free-text VARCHAR
-- (they are NOT fixed-value domains, so ENUM would be wrong here).
-- status IS a fixed-value domain -> ENUM.
-- ----------------------------------------------------------------
CREATE TABLE reviews (
    review_id            SERIAL PRIMARY KEY,
    course_id            INT           NOT NULL REFERENCES courses(course_id),
    reviewer_id          INT           NOT NULL REFERENCES users(user_id),
    content              TEXT          NOT NULL,
    academic_year        INT           NOT NULL,
    semester             VARCHAR(20)   NOT NULL,
    section              VARCHAR(20)   NOT NULL,
    rating_satisfaction  SMALLINT      NOT NULL CHECK (rating_satisfaction BETWEEN 1 AND 5),
    rating_difficulty    SMALLINT      NOT NULL CHECK (rating_difficulty   BETWEEN 1 AND 5),
    rating_workload      SMALLINT      NOT NULL CHECK (rating_workload     BETWEEN 1 AND 5),
    rating_content       SMALLINT      NOT NULL CHECK (rating_content      BETWEEN 1 AND 5),
    rating_teaching      SMALLINT      NOT NULL CHECK (rating_teaching     BETWEEN 1 AND 5),
    rating_exam          SMALLINT      NOT NULL CHECK (rating_exam         BETWEEN 1 AND 5),
    report_count         INT           NOT NULL DEFAULT 0,
    status               review_status NOT NULL DEFAULT 'ACTIVE',
    created_at           TIMESTAMP     NOT NULL DEFAULT NOW(),
    edited_at            TIMESTAMP     NULL
);

-- ----------------------------------------------------------------
-- Table: review_reports (Transaction Table)
-- One user can report each review only once, preventing report spam.
-- ----------------------------------------------------------------
CREATE TABLE review_reports (
    report_id    SERIAL PRIMARY KEY,
    review_id    INT       NOT NULL REFERENCES reviews(review_id),
    reporter_id  INT       NOT NULL REFERENCES users(user_id),
    reported_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (review_id, reporter_id)
);

-- ----------------------------------------------------------------
-- Table: review_likes  (FR-12) - one like per user per review.
-- ----------------------------------------------------------------
CREATE TABLE review_likes (
    like_id     SERIAL PRIMARY KEY,
    review_id   INT       NOT NULL REFERENCES reviews(review_id),
    user_id     INT       NOT NULL REFERENCES users(user_id),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (review_id, user_id)
);

-- ----------------------------------------------------------------
-- Table: review_comments  (FR-13)
-- ----------------------------------------------------------------
CREATE TABLE review_comments (
    comment_id  SERIAL PRIMARY KEY,
    review_id   INT       NOT NULL REFERENCES reviews(review_id),
    user_id     INT       NOT NULL REFERENCES users(user_id),
    content     TEXT      NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- Table: review_files  (FR-9 / FR-10) - attachments, 20MB cap enforced
-- in the API layer (NFR-03).
-- ----------------------------------------------------------------
CREATE TABLE review_files (
    file_id      SERIAL PRIMARY KEY,
    review_id    INT          NOT NULL REFERENCES reviews(review_id),
    uploader_id  INT          NOT NULL REFERENCES users(user_id),
    filename     VARCHAR(255) NOT NULL,
    stored_path  VARCHAR(500) NOT NULL,
    size_bytes   BIGINT       NOT NULL,
    uploaded_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- Table: audit_logs (Logical Log)
-- target_id is a LOOSE reference (no FK) - it may point at a review,
-- a file, a report, etc. depending on `action`.
-- ----------------------------------------------------------------
CREATE TABLE audit_logs (
    log_id      SERIAL PRIMARY KEY,
    timestamp   TIMESTAMP    NOT NULL DEFAULT NOW(),
    user_id     INT          NULL REFERENCES users(user_id),
    action      audit_action NOT NULL,
    target_id   INT          NULL,
    ip_address  VARCHAR(45)  NULL
);

-- Indexes that back the hot read paths of the demo flow.
CREATE INDEX idx_reviews_course_status ON reviews (course_id, status);
CREATE INDEX idx_reviews_status        ON reviews (status);
CREATE INDEX idx_audit_logs_user       ON audit_logs (user_id);
CREATE INDEX idx_course_tags_tag       ON course_tags (tag_id);
CREATE INDEX idx_review_likes_review   ON review_likes (review_id);
CREATE INDEX idx_review_comments_review ON review_comments (review_id);
CREATE INDEX idx_review_files_review   ON review_files (review_id);
CREATE INDEX idx_courses_search        ON courses (course_code, course_name);
CREATE INDEX idx_enrollments_student   ON enrollments (student_id);
CREATE INDEX idx_enrollments_course    ON enrollments (course_id);

-- ================================================================
-- MOCK DATA
-- ================================================================

-- Users: two students, one admin, and three mock reporters.
-- No avatar_url for mock users: the UI falls back to a generic silhouette
-- placeholder (see frontend/src/Avatar.jsx) instead of loading photos.
INSERT INTO users (username, email, role, avatar_url) VALUES
    ('somchai_s',   'somchai.s@example.ac.th', 'STUDENT', NULL),
    ('malee_p',     'malee.p@example.ac.th',   'STUDENT', NULL),
    ('admin_wichai','wichai.a@example.ac.th',  'ADMIN',   NULL),
    ('reporter_1',  'reporter1@example.ac.th', 'STUDENT', NULL),
    ('reporter_2',  'reporter2@example.ac.th', 'STUDENT', NULL),
    ('reporter_3',  'reporter3@example.ac.th', 'STUDENT', NULL);

-- Courses (3) - all Faculty of Science, spread across departments so the
-- department filter has something to actually filter. Deep detail fields
-- power the course-detail page (FR-4).
INSERT INTO courses (course_code, course_name, department, prerequisites, syllabus, teaching_format, workload, assessment) VALUES
    ('SCI101', 'General Science', 'สาขาฟิสิกส์',
     'ไม่มีวิชาบังคับก่อน',
     'พื้นฐานฟิสิกส์, เคมี และชีววิทยาเบื้องต้นสำหรับนักศึกษาปี 1 ทุกคณะ',
     'บรรยายในห้องเรียน + ห้องปฏิบัติการรายสัปดาห์',
     'การบ้านรายสัปดาห์ + รายงานแล็บ 5 ครั้งต่อภาคการศึกษา',
     'สอบกลางภาค 30% สอบปลายภาค 40% แล็บ 20% การบ้าน 10%'),
    ('CS101', 'Introduction to Computer Science', 'สาขาวิทยาการคอมพิวเตอร์',
     'ไม่มีวิชาบังคับก่อน',
     'พื้นฐานการเขียนโปรแกรม, โครงสร้างข้อมูลเบื้องต้น, การคิดเชิงคำนวณ, recursion และ algorithm เบื้องต้น',
     'บรรยาย + Lab เขียนโค้ดทุกสัปดาห์',
     'Assignment เขียนโปรแกรม 6 ชิ้น + โปรเจกต์ปลายภาค 1 ชิ้น',
     'สอบกลางภาค 25% สอบปลายภาค 35% Assignment 25% โปรเจกต์ 15%'),
    ('MTH201', 'Calculus II', 'สาขาคณิตศาสตร์',
     'ผ่านวิชา Calculus I (MTH101)',
     'อนุพันธ์และปริพันธ์ของฟังก์ชันหลายตัวแปร, อนุกรมอนันต์, สมการเชิงอนุพันธ์เบื้องต้น',
     'บรรยาย + Tutorial แก้โจทย์รายสัปดาห์',
     'แบบฝึกหัดรายสัปดาห์ ควรทำทุกข้อเพื่อสอบผ่าน',
     'สอบกลางภาค 35% สอบปลายภาค 50% แบบฝึกหัด 15%');

-- Instructors (FR-5) linked to courses.
INSERT INTO instructors (name, bio, teaching_style, grading_style) VALUES
    ('อ.ดร.สมศักดิ์ วิทยากร', 'อาจารย์ประจำภาควิชาฟิสิกส์ เชี่ยวชาญฟิสิกส์เบื้องต้น',
     'สอนช้า อธิบายละเอียด เน้นยกตัวอย่างในชีวิตประจำวัน', 'ให้คะแนนตามความเข้าใจ ไม่เข้มงวดเรื่องรูปแบบรายงาน'),
    ('อ.วิภาวรรณ เขียนโค้ด', 'อาจารย์ประจำภาควิชาวิทยาการคอมพิวเตอร์',
     'สอนเร็ว เน้นลงมือปฏิบัติ มีแบบฝึกหัดในห้องทุกครั้ง', 'ตรวจ Assignment ละเอียด ให้คะแนน partial credit'),
    ('อ.ประเสริฐ เลขคณิต', 'อาจารย์ประจำภาควิชาคณิตศาสตร์',
     'สอนตามตำรา เน้นพิสูจน์ทฤษฎีบท', 'เข้มงวด ต้องแสดงวิธีทำครบทุกขั้นตอนจึงจะได้คะแนนเต็ม');

INSERT INTO course_instructors (course_id, instructor_id) VALUES
    (1, 1),
    (2, 2),
    (3, 3);

INSERT INTO curriculums (curriculum_name, academic_year, department, degree_level) VALUES
    ('วิทยาการคอมพิวเตอร์', 2569, 'สาขาวิทยาการคอมพิวเตอร์', 'ปริญญาตรี');

INSERT INTO curriculum_courses
    (curriculum_id, course_id, recommended_year, recommended_semester, requirement_type)
VALUES
    (1, 2, 1, '1', 'REQUIRED');

-- Tags (FR-1) + course_tags mapping.
INSERT INTO tags (tag_name) VALUES
    ('ปี1'), ('พื้นฐาน'), ('เขียนโปรแกรม'), ('คณิต'), ('วิทยาศาสตร์'), ('บังคับ');

INSERT INTO course_tags (course_id, tag_id) VALUES
    (1, 1), (1, 2), (1, 5),
    (2, 1), (2, 2), (2, 3),
    (3, 4), (3, 6);

-- Enrollments: which (student, course, term, section) combos a student
-- actually took, and therefore has the right to review. Two rows per
-- student line up with their existing mock reviews below (so those show as
-- "already reviewed"); one extra row per student is left unreviewed so the
-- "eligible, not yet reviewed" state has something to demo too.
INSERT INTO enrollments (student_id, course_id, academic_year, semester, section) VALUES
    (1, 1, 2567, '1', '001'),  -- somchai_s / SCI101  -> matches review #1
    (1, 3, 2567, '2', '001'),  -- somchai_s / MTH201  -> matches review #3
    (1, 2, 2567, '2', '001'),  -- somchai_s / CS101   -> not yet reviewed
    (2, 2, 2567, '1', '002'),  -- malee_p   / CS101   -> matches review #2
    (2, 2, 2566, '1', '001'),  -- malee_p   / CS101   -> matches review #4 (HIDDEN)
    (2, 1, 2567, '1', '001');  -- malee_p   / SCI101  -> not yet reviewed

-- Reviews (4): review #4 is HIDDEN with report_count = 5.
-- Every review carries a full rating breakdown (FR-7 / NFR-10).
INSERT INTO reviews (course_id, reviewer_id, content, academic_year, semester, section, rating_satisfaction, rating_difficulty, rating_workload, rating_content, rating_teaching, rating_exam, report_count, status) VALUES
    (1, 1, 'เนื้อหาปูพื้นฐานดีมาก อาจารย์สอนเข้าใจง่าย เหมาะกับปี 1 ทุกคณะ',            2567, '1', '001', 5, 2, 2, 4, 5, 3, 0, 'ACTIVE'),
    (2, 2, 'วิชาปูพื้นดีมาก อาจารย์อธิบายเรื่อง recursion ได้เข้าใจง่ายสุดๆ',            2567, '1', '002', 4, 3, 4, 5, 5, 3, 0, 'ACTIVE'),
    (3, 1, 'เนื้อหายากพอสมควรแต่ให้คะแนนตรงไปตรงมา ถ้าทำแบบฝึกหัดครบก็ผ่านสบาย',        2567, '2', '001', 3, 4, 4, 4, 3, 4, 1, 'ACTIVE'),
    (2, 2, 'วิชานี้ห่วยมาก อาจารย์สอนไม่รู้เรื่อง [เนื้อหาไม่เหมาะสม - ถูกรายงาน]',      2566, '1', '001', 1, 5, 5, 1, 1, 1, 5, 'HIDDEN');

-- Review Reports - 5 distinct users against the HIDDEN review (review_id = 4),
-- matching its report_count of 5.
INSERT INTO review_reports (review_id, reporter_id) VALUES
    (4, 1),
    (4, 3),
    (4, 4),
    (4, 5),
    (4, 6);

-- A few likes and a comment so the interaction UI has something to show.
INSERT INTO review_likes (review_id, user_id) VALUES
    (1, 2),
    (1, 3),
    (2, 1);

INSERT INTO review_comments (review_id, user_id, content) VALUES
    (1, 2, 'เห็นด้วยเลย อาจารย์ใจดีมาก'),
    (2, 1, 'recursion เข้าใจยากไหมสำหรับคนไม่มีพื้นฐานเลย?');

-- Audit Logs - starting trail for testing
INSERT INTO audit_logs (user_id, action, target_id, ip_address) VALUES
    (1, 'LOGIN',        NULL, '192.168.1.10'),
    (2, 'LOGIN',        NULL, '192.168.1.11'),
    (3, 'LOGIN',        NULL, '192.168.1.12'),
    (1, 'WRITE_REVIEW', 1,    '192.168.1.10'),
    (2, 'WRITE_REVIEW', 2,    '192.168.1.11'),
    (1, 'WRITE_REVIEW', 3,    '192.168.1.10'),
    (2, 'WRITE_REVIEW', 4,    '192.168.1.11'),
    (1, 'FLAG_REPORT',  4,    '192.168.1.10'),
    (3, 'FLAG_REPORT',  4,    '192.168.1.12');
