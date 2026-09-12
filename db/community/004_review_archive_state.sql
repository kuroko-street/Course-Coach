-- Separate transaction: PostgreSQL must commit a new enum value before use.
ALTER TYPE review_status ADD VALUE IF NOT EXISTS 'ARCHIVED';
