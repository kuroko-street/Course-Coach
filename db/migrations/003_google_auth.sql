-- Real Google Workspace authentication support.
-- Google `sub` is the stable identity key; email remains display/contact data.

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
    ON users (google_sub) WHERE google_sub IS NOT NULL;
