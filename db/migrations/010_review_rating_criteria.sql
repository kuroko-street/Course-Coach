-- Replace the old perceived-difficulty score with a recommendation Likert item.
-- Existing mock/demo values are preserved so deployed databases can migrate safely.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reviews' AND column_name = 'rating_difficulty'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reviews' AND column_name = 'rating_recommendation'
    ) THEN
        ALTER TABLE reviews RENAME COLUMN rating_difficulty TO rating_recommendation;
    END IF;

    -- The local migration runner replays older idempotent migrations. Migration
    -- 002 may therefore recreate the retired column on a later startup.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reviews' AND column_name = 'rating_difficulty'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reviews' AND column_name = 'rating_recommendation'
    ) THEN
        ALTER TABLE reviews DROP COLUMN rating_difficulty;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reviews_rating_difficulty_range'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reviews_rating_recommendation_range'
    ) THEN
        ALTER TABLE reviews RENAME CONSTRAINT reviews_rating_difficulty_range
            TO reviews_rating_recommendation_range;
    END IF;
END $$;
