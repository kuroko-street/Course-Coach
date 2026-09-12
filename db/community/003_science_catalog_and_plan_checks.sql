-- Complete the initial Science program choices from the faculty's public list.
-- https://www.science.kmitl.ac.th/curriculums/bachelor (checked 2026-09-11).
-- These are responsible-program groupings, not a promise of current offerings.
INSERT INTO departments(faculty_id,name) VALUES
(1,'จุลชีววิทยาอุตสาหกรรม'),
(1,'เทคโนโลยีชีวภาพอุตสาหกรรม'),
(1,'เคมีอุตสาหกรรม'),
(1,'เทคโนโลยีสิ่งแวดล้อมและการจัดการอย่างยั่งยืน'),
(1,'เคมีวิศวกรรมและอุตสาหกรรม (หลักสูตรนานาชาติ)'),
(1,'เทคโนโลยีดิจิทัลและนวัตกรรมเชิงบูรณาการ (หลักสูตรนานาชาติ)'),
(1,'สถิติประยุกต์และการวิเคราะห์ข้อมูล')
ON CONFLICT(faculty_id,name) DO NOTHING;
ALTER TABLE study_plan_items ADD CONSTRAINT plan_year_range CHECK(academic_year BETWEEN 2500 AND 3000);
ALTER TABLE study_plan_items ADD CONSTRAINT plan_semester CHECK(semester IN ('1','2','summer'));
