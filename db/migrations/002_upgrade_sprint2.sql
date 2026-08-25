-- Idempotent in-place upgrade from the original prototype schema.
-- Safe to run on both an old populated volume and a freshly initialized DB.

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'EDIT_REVIEW';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'DELETE_REVIEW';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'UPLOAD_FILE';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'MODERATE_REVIEW';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'MANAGE_COURSE';

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500) NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='courses' AND column_name='faculty')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='courses' AND column_name='department') THEN
        ALTER TABLE courses RENAME COLUMN faculty TO department;
    END IF;
END $$;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS prerequisites TEXT NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS syllabus TEXT NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS teaching_format TEXT NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS workload TEXT NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS assessment TEXT NULL;

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS rating_satisfaction SMALLINT NOT NULL DEFAULT 3;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS rating_difficulty SMALLINT NOT NULL DEFAULT 3;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS rating_workload SMALLINT NOT NULL DEFAULT 3;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS rating_content SMALLINT NOT NULL DEFAULT 3;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS rating_teaching SMALLINT NOT NULL DEFAULT 3;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS rating_exam SMALLINT NOT NULL DEFAULT 3;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP NULL;

DO $$
DECLARE col TEXT;
BEGIN
    FOREACH col IN ARRAY ARRAY['rating_satisfaction','rating_difficulty','rating_workload',
                               'rating_content','rating_teaching','rating_exam'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_' || col || '_range') THEN
            EXECUTE format('ALTER TABLE reviews ADD CONSTRAINT %I CHECK (%I BETWEEN 1 AND 5)',
                           'reviews_' || col || '_range', col);
        END IF;
    END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS instructors (
    instructor_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    bio TEXT NULL,
    teaching_style TEXT NULL,
    grading_style TEXT NULL
);

CREATE TABLE IF NOT EXISTS course_instructors (
    course_id INT NOT NULL REFERENCES courses(course_id),
    instructor_id INT NOT NULL REFERENCES instructors(instructor_id),
    PRIMARY KEY (course_id, instructor_id)
);

CREATE TABLE IF NOT EXISTS enrollments (
    enrollment_id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES users(user_id),
    course_id INT NOT NULL REFERENCES courses(course_id),
    academic_year INT NOT NULL,
    semester VARCHAR(20) NOT NULL,
    section VARCHAR(20) NOT NULL,
    UNIQUE (student_id, course_id, academic_year, semester, section)
);

CREATE TABLE IF NOT EXISTS tags (
    tag_id SERIAL PRIMARY KEY,
    tag_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS course_tags (
    course_id INT NOT NULL REFERENCES courses(course_id),
    tag_id INT NOT NULL REFERENCES tags(tag_id),
    PRIMARY KEY (course_id, tag_id)
);

CREATE TABLE IF NOT EXISTS review_likes (
    like_id SERIAL PRIMARY KEY,
    review_id INT NOT NULL REFERENCES reviews(review_id),
    user_id INT NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS review_comments (
    comment_id SERIAL PRIMARY KEY,
    review_id INT NOT NULL REFERENCES reviews(review_id),
    user_id INT NOT NULL REFERENCES users(user_id),
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_files (
    file_id SERIAL PRIMARY KEY,
    review_id INT NOT NULL REFERENCES reviews(review_id),
    uploader_id INT NOT NULL REFERENCES users(user_id),
    filename VARCHAR(255) NOT NULL,
    stored_path VARCHAR(500) NOT NULL,
    size_bytes BIGINT NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_tags_tag ON course_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_review_likes_review ON review_likes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_review ON review_comments(review_id);
CREATE INDEX IF NOT EXISTS idx_review_files_review ON review_files(review_id);
CREATE INDEX IF NOT EXISTS idx_courses_search ON courses(course_code, course_name);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);

-- Existing reviews prove that the reviewer took that exact course offering.
INSERT INTO enrollments (student_id, course_id, academic_year, semester, section)
SELECT reviewer_id, course_id, academic_year, semester, section FROM reviews
ON CONFLICT DO NOTHING;

-- Keep one unreviewed demo offering for each student when those seed users/courses exist.
INSERT INTO enrollments (student_id, course_id, academic_year, semester, section)
SELECT u.user_id, c.course_id, 2567, '2', '001'
FROM users u CROSS JOIN courses c
WHERE u.username='somchai_s' AND c.course_code='CS101'
ON CONFLICT DO NOTHING;

INSERT INTO enrollments (student_id, course_id, academic_year, semester, section)
SELECT u.user_id, c.course_id, 2567, '1', '001'
FROM users u CROSS JOIN courses c
WHERE u.username='malee_p' AND c.course_code='SCI101'
ON CONFLICT DO NOTHING;

INSERT INTO tags(tag_name) VALUES
    ('ปี1'), ('พื้นฐาน'), ('เขียนโปรแกรม'), ('คณิต'), ('วิทยาศาสตร์'), ('บังคับ')
ON CONFLICT DO NOTHING;

INSERT INTO course_tags(course_id, tag_id)
SELECT c.course_id, t.tag_id FROM courses c CROSS JOIN tags t
WHERE (c.course_code='CS101' AND t.tag_name IN ('ปี1','พื้นฐาน','เขียนโปรแกรม'))
   OR (c.course_code='SCI101' AND t.tag_name IN ('ปี1','พื้นฐาน','วิทยาศาสตร์'))
   OR (c.course_code='MTH201' AND t.tag_name IN ('คณิต','บังคับ'))
ON CONFLICT DO NOTHING;
