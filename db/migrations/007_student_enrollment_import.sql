-- Admin-managed student roster and review eligibility.

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'IMPORT_ENROLLMENT';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS student_number VARCHAR(20) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_number
    ON users (student_number)
    WHERE student_number IS NOT NULL;

UPDATE users SET student_number = '65000001'
WHERE email = 'somchai.s@example.ac.th' AND student_number IS NULL;

UPDATE users SET student_number = '65000002'
WHERE email = 'malee.p@example.ac.th' AND student_number IS NULL;
