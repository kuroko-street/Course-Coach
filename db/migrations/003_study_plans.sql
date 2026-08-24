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

-- Seed course: MTH201's free-text `prerequisites` field already reads
-- "ผ่านวิชา Calculus I (MTH101)" but MTH101 never existed as a row, so the
-- structured prerequisite check had nothing to point at. Adding it here
-- (not in db/init.sql) per GIT_WORKFLOW.md #7 — init.sql stays untouched,
-- every schema/seed change for this feature lives in this migration.
INSERT INTO courses (course_code, course_name, department, credits, prerequisites, syllabus, teaching_format, workload, assessment)
VALUES (
    'MTH101', 'Calculus I', 'สาขาคณิตศาสตร์', 3,
    'ไม่มีวิชาบังคับก่อน',
    'ลิมิต, อนุพันธ์, ปริพันธ์ของฟังก์ชันตัวแปรเดียว',
    'บรรยาย + Tutorial แก้โจทย์รายสัปดาห์',
    'แบบฝึกหัดรายสัปดาห์',
    'สอบกลางภาค 35% สอบปลายภาค 50% แบบฝึกหัด 15%'
)
ON CONFLICT (course_code) DO NOTHING;

-- Backfill MTH201's structured prerequisite link, now that MTH101 exists.
INSERT INTO course_prerequisites (course_id, prerequisite_course_id)
SELECT mth201.course_id, mth101.course_id
FROM courses mth201, courses mth101
WHERE mth201.course_code = 'MTH201' AND mth101.course_code = 'MTH101'
ON CONFLICT DO NOTHING;

-- Demo study plan for malee_p (student_id resolved by username, not a
-- literal id): deliberately plans MTH201 without MTH101 anywhere in the
-- plan or her enrollment history, so the prerequisite-unmet warning has
-- something to show out of the box. Total credits (SCI101 3 + MTH201 3 = 6)
-- is also under PlanService.MIN_CREDITS_PER_TERM, demoing that warning too.
-- Guarded by NOT EXISTS (no natural unique key on study_plans) so re-running
-- this migration doesn't create duplicate demo plans.
INSERT INTO study_plans (student_id, plan_name)
SELECT u.user_id, 'แผนเทอมหน้า'
FROM users u
WHERE u.username = 'malee_p'
  AND NOT EXISTS (
      SELECT 1 FROM study_plans p
      WHERE p.student_id = u.user_id AND p.plan_name = 'แผนเทอมหน้า'
  );

INSERT INTO study_plan_items (plan_id, course_id, academic_year, semester)
SELECT p.plan_id, c.course_id, 2568, '1'
FROM study_plans p
JOIN users u ON u.user_id = p.student_id AND u.username = 'malee_p'
JOIN courses c ON c.course_code IN ('SCI101', 'MTH201')
WHERE p.plan_name = 'แผนเทอมหน้า'
ON CONFLICT (plan_id, course_id) DO NOTHING;
