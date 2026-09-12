-- Refuse to pick winners from legacy duplicates. Resolve explicitly after backup.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM reviews WHERE status='ACTIVE' GROUP BY course_id,reviewer_id HAVING COUNT(*)>1) THEN
  RAISE EXCEPTION 'Active duplicate reviews exist: explicitly choose which review to retain before applying contribution quotas';
 END IF;
END $$;
CREATE UNIQUE INDEX uq_active_review_per_account ON reviews(course_id,reviewer_id) WHERE status='ACTIVE';
CREATE TABLE contribution_cooldowns (
 cooldown_id BIGSERIAL PRIMARY KEY,
 course_id INT NOT NULL REFERENCES courses,
 user_id INT NOT NULL REFERENCES users,
 review_id INT UNIQUE REFERENCES reviews,
 file_id INT UNIQUE REFERENCES summary_files,
 started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp()+INTERVAL '7 days'),
 CHECK ((review_id IS NOT NULL)::int + (file_id IS NOT NULL)::int=1),
 CHECK (expires_at>started_at)
);
CREATE INDEX idx_cooldowns_account_course ON contribution_cooldowns(course_id,user_id,expires_at);
-- Existing reported content starts from the recorded fifth distinct report time,
-- not deployment time. Soft deletion does not erase the original penalty.
INSERT INTO contribution_cooldowns(course_id,user_id,review_id,started_at,expires_at)
 SELECT r.course_id,r.reviewer_id,r.review_id,p.hidden_at,p.hidden_at+INTERVAL '7 days'
 FROM reviews r CROSS JOIN LATERAL (
  SELECT reported_at AT TIME ZONE 'UTC' AS hidden_at FROM review_reports
  WHERE review_id=r.review_id ORDER BY reported_at,report_id OFFSET 4 LIMIT 1
 ) p WHERE r.report_count>=5;
INSERT INTO contribution_cooldowns(course_id,user_id,file_id,started_at,expires_at)
 SELECT b.course_id,b.uploader_id,f.file_id,p.hidden_at,p.hidden_at+INTERVAL '7 days'
 FROM summary_files f JOIN summary_file_upload_batches b USING(upload_batch_id)
 CROSS JOIN LATERAL (
  SELECT reported_at AT TIME ZONE 'UTC' AS hidden_at FROM summary_file_reports
  WHERE file_id=f.file_id ORDER BY reported_at,report_id OFFSET 4 LIMIT 1
 ) p WHERE f.report_count>=5;
