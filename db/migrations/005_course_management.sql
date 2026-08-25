-- Admin course-management upgrade. Safe for an existing Docker volume.

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'MANAGE_COURSE';

ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS curriculums (
    curriculum_id SERIAL PRIMARY KEY,
    curriculum_name VARCHAR(255) NOT NULL,
    academic_year INT NOT NULL,
    department VARCHAR(255) NOT NULL,
    degree_level VARCHAR(100) NOT NULL DEFAULT 'ปริญญาตรี',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (curriculum_name, academic_year)
);

CREATE TABLE IF NOT EXISTS curriculum_courses (
    curriculum_id INT NOT NULL REFERENCES curriculums(curriculum_id),
    course_id INT NOT NULL REFERENCES courses(course_id),
    recommended_year SMALLINT NOT NULL CHECK (recommended_year BETWEEN 1 AND 8),
    recommended_semester VARCHAR(20) NOT NULL,
    requirement_type VARCHAR(20) NOT NULL DEFAULT 'REQUIRED'
        CHECK (requirement_type IN ('REQUIRED', 'ELECTIVE')),
    PRIMARY KEY (curriculum_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_courses_course ON curriculum_courses(course_id);

INSERT INTO curriculums (curriculum_name, academic_year, department, degree_level)
SELECT 'วิทยาการคอมพิวเตอร์', 2569, 'สาขาวิทยาการคอมพิวเตอร์', 'ปริญญาตรี'
WHERE EXISTS (SELECT 1 FROM courses WHERE course_code = 'CS101')
ON CONFLICT DO NOTHING;

INSERT INTO curriculum_courses
    (curriculum_id, course_id, recommended_year, recommended_semester, requirement_type)
SELECT cu.curriculum_id, c.course_id, 1, '1', 'REQUIRED'
FROM curriculums cu
JOIN courses c ON c.course_code = 'CS101'
WHERE cu.curriculum_name = 'วิทยาการคอมพิวเตอร์' AND cu.academic_year = 2569
ON CONFLICT DO NOTHING;
