-- Course-level summary files, separate from attachments that belong to reviews.

DO $$
BEGIN
    CREATE TYPE summary_file_status AS ENUM ('ACTIVE', 'HIDDEN', 'DELETED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'UPLOAD_SUMMARY_FILE';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'DELETE_SUMMARY_FILE';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'REPORT_SUMMARY_FILE';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'MODERATE_SUMMARY_FILE';

CREATE TABLE IF NOT EXISTS summary_file_upload_batches (
    upload_batch_id SERIAL PRIMARY KEY,
    course_id       INT       NOT NULL REFERENCES courses(course_id),
    uploader_id     INT       NOT NULL REFERENCES users(user_id),
    enrollment_id   INT       NOT NULL REFERENCES enrollments(enrollment_id),
    uploaded_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS summary_files (
    file_id        SERIAL PRIMARY KEY,
    upload_batch_id INT                NOT NULL REFERENCES summary_file_upload_batches(upload_batch_id),
    filename       VARCHAR(255)        NOT NULL,
    stored_path    VARCHAR(500)        NOT NULL,
    mime_type      VARCHAR(150)        NULL,
    size_bytes     BIGINT              NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
    report_count   INT                 NOT NULL DEFAULT 0,
    status         summary_file_status NOT NULL DEFAULT 'ACTIVE',
    uploaded_at    TIMESTAMP           NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMP           NULL
);

CREATE TABLE IF NOT EXISTS summary_file_likes (
    like_id     SERIAL PRIMARY KEY,
    file_id     INT       NOT NULL REFERENCES summary_files(file_id) ON DELETE CASCADE,
    user_id     INT       NOT NULL REFERENCES users(user_id),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (file_id, user_id)
);

CREATE TABLE IF NOT EXISTS summary_file_comments (
    comment_id  SERIAL PRIMARY KEY,
    file_id     INT       NOT NULL REFERENCES summary_files(file_id) ON DELETE CASCADE,
    user_id     INT       NOT NULL REFERENCES users(user_id),
    content     TEXT      NOT NULL CHECK (LENGTH(BTRIM(content)) BETWEEN 1 AND 2000),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS summary_file_reports (
    report_id    SERIAL PRIMARY KEY,
    file_id      INT       NOT NULL REFERENCES summary_files(file_id) ON DELETE CASCADE,
    reporter_id  INT       NOT NULL REFERENCES users(user_id),
    reported_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (file_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_summary_batches_course_term
    ON summary_file_upload_batches (course_id, uploader_id, enrollment_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_summary_files_status
    ON summary_files (status, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_summary_file_comments_file
    ON summary_file_comments (file_id, created_at);
CREATE INDEX IF NOT EXISTS idx_summary_file_reports_file
    ON summary_file_reports (file_id);
