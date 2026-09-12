-- Community edition: fresh database only. Legacy migrations/volumes are untouched.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TYPE user_role AS ENUM ('STUDENT', 'ADMIN');
CREATE TYPE review_status AS ENUM ('ACTIVE', 'HIDDEN', 'DELETED');
CREATE TYPE summary_file_status AS ENUM ('ACTIVE', 'HIDDEN', 'DELETED');

CREATE TABLE users (
 user_id SERIAL PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE,
 display_name VARCHAR(100), email VARCHAR(255) NOT NULL UNIQUE,
 google_sub VARCHAR(255) UNIQUE, student_number VARCHAR(20) UNIQUE,
 role user_role NOT NULL DEFAULT 'STUDENT', avatar_url VARCHAR(500),
 is_mock BOOLEAN NOT NULL DEFAULT FALSE,
 is_report_blocked BOOLEAN NOT NULL DEFAULT FALSE, blocked_until TIMESTAMP
);
CREATE TABLE universities (
 university_id SERIAL PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE,
 name VARCHAR(255) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE faculties (
 faculty_id SERIAL PRIMARY KEY, university_id INT NOT NULL REFERENCES universities,
 name VARCHAR(255) NOT NULL, UNIQUE(university_id,name), UNIQUE(faculty_id,university_id)
);
CREATE TABLE departments (
 department_id SERIAL PRIMARY KEY, faculty_id INT NOT NULL REFERENCES faculties,
 name VARCHAR(255) NOT NULL, is_general BOOLEAN NOT NULL DEFAULT FALSE,
 UNIQUE(faculty_id,name), UNIQUE(department_id,faculty_id)
);
CREATE TABLE instructors (
 instructor_id SERIAL PRIMARY KEY, university_id INT NOT NULL REFERENCES universities DEFAULT 1,
 name VARCHAR(255) NOT NULL, affiliation VARCHAR(255),
 bio TEXT, teaching_style TEXT, grading_style TEXT,
 creator_id INT REFERENCES users, created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE courses (
 course_id SERIAL PRIMARY KEY, university_id INT NOT NULL REFERENCES universities,
 faculty_id INT NOT NULL, department_id INT NOT NULL,
 course_code VARCHAR(30) NOT NULL, course_name VARCHAR(255) NOT NULL,
 code_normalized VARCHAR(30) NOT NULL, name_normalized VARCHAR(255) NOT NULL,
 instructor_key VARCHAR(500) NOT NULL CHECK (instructor_key <> ''),
 department VARCHAR(255) NOT NULL,
 academic_year INT NOT NULL CHECK(academic_year BETWEEN 2500 AND 3000),
 semester VARCHAR(10) NOT NULL CHECK(semester IN ('1','2','summer')),
 credits NUMERIC(4,1) NOT NULL CHECK(credits > 0 AND credits <= 30),
 syllabus TEXT, additional_details TEXT,
 prerequisites TEXT, teaching_format TEXT, workload TEXT, assessment TEXT,
 creator_id INT NOT NULL REFERENCES users,
 created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 merged_into_course_id INT REFERENCES courses,
 FOREIGN KEY(faculty_id,university_id) REFERENCES faculties(faculty_id,university_id),
 FOREIGN KEY(department_id,faculty_id) REFERENCES departments(department_id,faculty_id),
 CHECK(merged_into_course_id IS NULL OR merged_into_course_id <> course_id)
);
CREATE UNIQUE INDEX courses_identity_unique ON courses
 (university_id,code_normalized,name_normalized,academic_year,semester,instructor_key)
 WHERE merged_into_course_id IS NULL;
CREATE TABLE course_instructors (
 course_id INT NOT NULL REFERENCES courses, instructor_id INT NOT NULL REFERENCES instructors,
 PRIMARY KEY(course_id,instructor_id)
);
CREATE TABLE tags (tag_id SERIAL PRIMARY KEY,tag_name VARCHAR(100) NOT NULL UNIQUE);
CREATE TABLE reviews (
 review_id SERIAL PRIMARY KEY,course_id INT NOT NULL REFERENCES courses,
 reviewer_id INT NOT NULL REFERENCES users,content TEXT NOT NULL,
 rating_satisfaction SMALLINT NOT NULL CHECK(rating_satisfaction BETWEEN 1 AND 5),
 rating_recommendation SMALLINT NOT NULL CHECK(rating_recommendation BETWEEN 1 AND 5),
 rating_workload SMALLINT NOT NULL CHECK(rating_workload BETWEEN 1 AND 5),
 rating_content SMALLINT NOT NULL CHECK(rating_content BETWEEN 1 AND 5),
 rating_teaching SMALLINT NOT NULL CHECK(rating_teaching BETWEEN 1 AND 5),
 rating_exam SMALLINT NOT NULL CHECK(rating_exam BETWEEN 1 AND 5),
 status review_status NOT NULL DEFAULT 'ACTIVE', report_count INT NOT NULL DEFAULT 0 CHECK(report_count>=0),
 created_at TIMESTAMP NOT NULL DEFAULT NOW(),edited_at TIMESTAMP
);
CREATE TABLE review_tags (
 review_id INT NOT NULL REFERENCES reviews ON DELETE CASCADE,
 tag_id INT NOT NULL REFERENCES tags,PRIMARY KEY(review_id,tag_id)
);
CREATE TABLE review_reports (
 report_id SERIAL PRIMARY KEY,review_id INT NOT NULL REFERENCES reviews ON DELETE CASCADE,
 reporter_id INT NOT NULL REFERENCES users,reported_at TIMESTAMP NOT NULL DEFAULT NOW(),
 UNIQUE(review_id,reporter_id)
);
CREATE TABLE review_likes (
 like_id SERIAL PRIMARY KEY,review_id INT NOT NULL REFERENCES reviews ON DELETE CASCADE,
 user_id INT NOT NULL REFERENCES users,created_at TIMESTAMP NOT NULL DEFAULT NOW(),UNIQUE(review_id,user_id)
);
CREATE TABLE review_comments (
 comment_id SERIAL PRIMARY KEY,review_id INT NOT NULL REFERENCES reviews ON DELETE CASCADE,
 user_id INT NOT NULL REFERENCES users,content TEXT NOT NULL CHECK(LENGTH(BTRIM(content)) BETWEEN 1 AND 2000),
 status review_status NOT NULL DEFAULT 'ACTIVE',report_count INT NOT NULL DEFAULT 0 CHECK(report_count>=0),
 created_at TIMESTAMP NOT NULL DEFAULT NOW(),edited_at TIMESTAMP
);
CREATE TABLE review_comment_reports (
 report_id SERIAL PRIMARY KEY,comment_id INT NOT NULL REFERENCES review_comments ON DELETE CASCADE,
 reporter_id INT NOT NULL REFERENCES users,reported_at TIMESTAMP NOT NULL DEFAULT NOW(),UNIQUE(comment_id,reporter_id)
);
CREATE TABLE summary_file_upload_batches (
 upload_batch_id SERIAL PRIMARY KEY,course_id INT NOT NULL REFERENCES courses,
 uploader_id INT NOT NULL REFERENCES users,upload_request_id UUID,
 uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),deleted_at TIMESTAMP,
 UNIQUE(uploader_id,upload_request_id)
);
CREATE TABLE summary_files (
 file_id SERIAL PRIMARY KEY,upload_batch_id INT NOT NULL REFERENCES summary_file_upload_batches,
 filename VARCHAR(255) NOT NULL,stored_path VARCHAR(500) NOT NULL,mime_type VARCHAR(150),
 size_bytes BIGINT NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520),
 report_count INT NOT NULL DEFAULT 0 CHECK(report_count>=0),status summary_file_status NOT NULL DEFAULT 'ACTIVE',
 uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),deleted_at TIMESTAMP
);
CREATE TABLE summary_file_likes (
 like_id SERIAL PRIMARY KEY,file_id INT NOT NULL REFERENCES summary_files ON DELETE CASCADE,
 user_id INT NOT NULL REFERENCES users,created_at TIMESTAMP NOT NULL DEFAULT NOW(),UNIQUE(file_id,user_id)
);
CREATE TABLE summary_file_comments (
 comment_id SERIAL PRIMARY KEY,file_id INT NOT NULL REFERENCES summary_files ON DELETE CASCADE,
 user_id INT NOT NULL REFERENCES users,content TEXT NOT NULL CHECK(LENGTH(BTRIM(content)) BETWEEN 1 AND 2000),
 status review_status NOT NULL DEFAULT 'ACTIVE',report_count INT NOT NULL DEFAULT 0 CHECK(report_count>=0),
 created_at TIMESTAMP NOT NULL DEFAULT NOW(),edited_at TIMESTAMP
);
CREATE TABLE summary_file_reports (
 report_id SERIAL PRIMARY KEY,file_id INT NOT NULL REFERENCES summary_files ON DELETE CASCADE,
 reporter_id INT NOT NULL REFERENCES users,reported_at TIMESTAMP NOT NULL DEFAULT NOW(),UNIQUE(file_id,reporter_id)
);
CREATE TABLE summary_file_comment_reports (
 report_id SERIAL PRIMARY KEY,comment_id INT NOT NULL REFERENCES summary_file_comments ON DELETE CASCADE,
 reporter_id INT NOT NULL REFERENCES users,reported_at TIMESTAMP NOT NULL DEFAULT NOW(),UNIQUE(comment_id,reporter_id)
);
CREATE TABLE study_plans (
 plan_id SERIAL PRIMARY KEY,student_id INT NOT NULL REFERENCES users,plan_name VARCHAR(255) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT NOW(),updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE study_plan_items (
 item_id SERIAL PRIMARY KEY,plan_id INT NOT NULL REFERENCES study_plans,
 course_id INT NOT NULL REFERENCES courses,academic_year INT NOT NULL,
 semester VARCHAR(20) NOT NULL,added_at TIMESTAMP NOT NULL DEFAULT NOW(),
 UNIQUE(plan_id,course_id,academic_year,semester)
);
CREATE TABLE course_aliases (
 alias_id SERIAL PRIMARY KEY,source_course_id INT UNIQUE REFERENCES courses,
 canonical_course_id INT NOT NULL REFERENCES courses,
 course_code VARCHAR(30) NOT NULL,course_name VARCHAR(255) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT NOW(),CHECK(source_course_id IS NULL OR source_course_id<>canonical_course_id)
);
CREATE TABLE course_merge_history (
 merge_id SERIAL PRIMARY KEY,request_id UUID NOT NULL UNIQUE,
 admin_id INT NOT NULL REFERENCES users,primary_course_id INT NOT NULL REFERENCES courses,
 source_course_ids INT[] NOT NULL,reason TEXT NOT NULL,
 before_snapshot JSONB NOT NULL,after_snapshot JSONB NOT NULL,moved_records JSONB NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE audit_logs (
 log_id SERIAL PRIMARY KEY,timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
 user_id INT REFERENCES users,action VARCHAR(80) NOT NULL,target_id INT,ip_address VARCHAR(45),details JSONB
);
CREATE INDEX idx_courses_filter ON courses(university_id,faculty_id,department_id,academic_year,semester);
CREATE INDEX idx_courses_code_trgm ON courses USING GIN(course_code gin_trgm_ops);
CREATE INDEX idx_courses_name_trgm ON courses USING GIN(course_name gin_trgm_ops);
CREATE INDEX idx_instructors_name_trgm ON instructors USING GIN(name gin_trgm_ops);
CREATE INDEX idx_course_instructors_teacher ON course_instructors(instructor_id,course_id);
CREATE INDEX idx_reviews_course_status ON reviews(course_id,status);
CREATE INDEX idx_review_tags_tag ON review_tags(tag_id,review_id);
CREATE INDEX idx_review_comments_parent ON review_comments(review_id,status);
CREATE INDEX idx_summary_batches_course ON summary_file_upload_batches(course_id);
CREATE INDEX idx_summary_files_status ON summary_files(upload_batch_id,status);
CREATE INDEX idx_summary_comments_parent ON summary_file_comments(file_id,status);
CREATE INDEX idx_study_plans_student ON study_plans(student_id);
CREATE INDEX idx_study_plan_items_course ON study_plan_items(course_id);
CREATE INDEX idx_course_aliases_canonical ON course_aliases(canonical_course_id);
