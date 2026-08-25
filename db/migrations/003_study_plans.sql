-- Idempotent in-place upgrade adding the course-planning feature.
-- Safe to run on both an old populated volume and a freshly initialized DB.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS credits SMALLINT NOT NULL DEFAULT 3;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_credits_range') THEN
        ALTER TABLE courses ADD CONSTRAINT courses_credits_range CHECK (credits BETWEEN 1 AND 6);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS course_prerequisites (
    course_id               INT NOT NULL REFERENCES courses(course_id),
    prerequisite_course_id  INT NOT NULL REFERENCES courses(course_id),
    PRIMARY KEY (course_id, prerequisite_course_id),
    CHECK (course_id <> prerequisite_course_id)
);

CREATE TABLE IF NOT EXISTS study_plans (
    plan_id     SERIAL PRIMARY KEY,
    student_id  INT          NOT NULL REFERENCES users(user_id),
    plan_name   VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_plan_items (
    item_id        SERIAL PRIMARY KEY,
    plan_id        INT         NOT NULL REFERENCES study_plans(plan_id),
    course_id      INT         NOT NULL REFERENCES courses(course_id),
    academic_year  INT         NOT NULL,
    semester       VARCHAR(20) NOT NULL,
    added_at       TIMESTAMP   NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_prereq_course  ON course_prerequisites(course_id);
CREATE INDEX IF NOT EXISTS idx_study_plans_student   ON study_plans(student_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_items_plan ON study_plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_items_term ON study_plan_items(plan_id, academic_year, semester);
