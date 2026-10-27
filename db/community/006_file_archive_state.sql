-- Preserve files excluded during merging.
ALTER TYPE summary_file_status ADD VALUE IF NOT EXISTS 'ARCHIVED';
