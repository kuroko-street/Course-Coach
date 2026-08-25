-- Existing volumes may contain duplicate report rows from the original mock.
-- Keep the earliest row for each reviewer/review pair before enforcing the rule.
DELETE FROM review_reports duplicate_report
USING review_reports original_report
WHERE duplicate_report.review_id = original_report.review_id
  AND duplicate_report.reporter_id = original_report.reporter_id
  AND duplicate_report.report_id > original_report.report_id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'review_reports_review_id_reporter_id_key'
    ) THEN
        ALTER TABLE review_reports
            ADD CONSTRAINT review_reports_review_id_reporter_id_key
            UNIQUE (review_id, reporter_id);
    END IF;
END $$;
