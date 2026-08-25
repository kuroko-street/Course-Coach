-- Self-service nickname, shown everywhere a user's name appears in the UI
-- instead of the login `username`. Nullable with no backfill: every read
-- query coalesces NULLIF(display_name, '') back to username, so existing
-- rows behave unchanged until a user sets their own nickname.

ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100) NULL;
