-- Initial scope: KMITL, Faculty of Science; not an exhaustive university catalog.
-- Official program names verified 2026-09-11: https://www.science.kmitl.ac.th/curriculums/bachelor
-- General category is our catalog grouping, not an additional official degree.
INSERT INTO universities(university_id,code,name) VALUES
 (1,'KMITL','สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง');
INSERT INTO faculties(faculty_id,university_id,name) VALUES(1,1,'คณะวิทยาศาสตร์');
INSERT INTO departments(department_id,faculty_id,name,is_general) VALUES
 (1,1,'วิทยาการคอมพิวเตอร์',FALSE),
 (2,1,'คณิตศาสตร์ประยุกต์',FALSE),
 (3,1,'ฟิสิกส์อุตสาหกรรม',FALSE),
 (4,1,'รายวิชากลาง / ใช้ร่วมหลายสาขา',TRUE);
SELECT setval(pg_get_serial_sequence('universities','university_id'),1);
SELECT setval(pg_get_serial_sequence('faculties','faculty_id'),1);
SELECT setval(pg_get_serial_sequence('departments','department_id'),4);
INSERT INTO tags(tag_name) VALUES
 ('งานเยอะ'),('งานไม่มาก'),('มีงานกลุ่ม'),('มีโปรเจกต์'),
 ('แลบเยอะ'),('เน้นปฏิบัติ'),('เน้นทฤษฎี'),('ใช้การคำนวณเยอะ'),('มีการเขียนโปรแกรม'),
 ('มีการนำเสนอ'),('มีการอภิปรายในชั้นเรียน'),('มีคะแนนเข้าเรียน'),('เลิกคลาสก่อนเวลา'),
 ('มีสอบย่อย'),('มีข้อสอบอัตนัย'),('มีข้อสอบปรนัย');
