-- Keep development-only identities separate from real Google users.
-- Existing seed accounts are marked explicitly; every other user remains real.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET is_mock = TRUE
WHERE email IN (
    'somchai.s@example.ac.th',
    'malee.p@example.ac.th',
    'wichai.a@example.ac.th'
);
