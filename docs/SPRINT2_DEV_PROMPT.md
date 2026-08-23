# Prompt: พัฒนา Course Coach ให้ครบ Functional Requirement (Sprint 2)

> คัดลอกทั้งไฟล์นี้ไปวางเป็น prompt ให้ AI coding agent (เช่น Claude Code เซสชันใหม่)
> เพื่อพัฒนาต่อจาก Sprint 1 ให้ครบทุก FR ตามเอกสาร requirement (S2G1.md)

---

## บริบท (Context)

นี่คือโปรเจกต์ **Course Coach** — ระบบค้นหา/รีวิวรายวิชาสำหรับนักศึกษา
ปัจจุบัน (Sprint 1) เป็น microservices scaffold ที่รันได้จริงด้วย `docker compose up --build`:

| Service    | Tech                          | Port |
|------------|--------------------------------|------|
| `db`       | PostgreSQL 16 (`db/init.sql`)  | 5432 |
| `backend`  | FastAPI (Python, `backend/main.py`, `backend/db.py`) | 5000 |
| `frontend` | React + React Router (Vite, `frontend/src/`)         | 3000 |

**สิ่งที่มีอยู่แล้วใน Sprint 1** (ห้ามลบ/ห้ามทำลาย engineering rule เดิม):
- Mock login (`/login`, `POST /api/auth/login-mock`) — เลือก user แล้วเก็บ session ผ่าน `X-User-Id` header (ยังไม่มีรหัสผ่านจริง)
- ค้นหา/กรองรายวิชา: `GET /api/courses?search=&department=` (ค้นจาก course_code/course_name เท่านั้น)
- หน้ารายละเอียดวิชา `/course/:id` — แสดง offerings (เทอม/section แบบ mock) + รีวิว ACTIVE + ฟอร์มเขียนรีวิว (มีแค่ content เป็น free text, ไม่มีคะแนนแยกด้าน)
- ระบบรายงานรีวิว: กด report สะสมครบ 5 ครั้ง → auto-hide → เข้าคิว `/admin`
- หน้า Admin `/admin` (role ADMIN เท่านั้น ตรวจสิทธิ์ทั้ง router และ backend) — Keep/Delete รีวิวที่ถูกซ่อน
- Audit log (`audit_logs` table) บันทึกทุก action สำคัญ
- Engineering rules ที่ต้องรักษาไว้เสมอเมื่อเพิ่มโค้ดใหม่:
  1. **Transaction**: การเขียนหลายตารางพร้อมกัน (เช่น review + audit_log) ต้อง commit/rollback เป็น atomic unit เดียว
  2. **Row locking** (`SELECT ... FOR UPDATE`) เมื่อมีการอัปเดตค่าที่แข่งกันได้ (เช่น counter)
  3. **ENUM แทน VARCHAR** สำหรับคอลัมน์ที่ค่าคงที่ (status, role, action ฯลฯ)
  4. **Server-side authorization**: ห้ามเชื่อ role/ownership จาก frontend เพียงอย่างเดียว ต้อง re-check ที่ backend เสมอ (ผ่าน `X-User-Id` เหมือนเดิม)
  5. **Soft delete**: ห้าม hard-delete ข้อมูล review/ไฟล์ ให้ใช้ status/flag แทน

**ปัญหาที่ต้องแก้ในรอบนี้**: Sprint 1 ครอบคลุมแค่บางส่วนของ Functional Requirement เต็มระบบ
งานของคุณคือขยาย schema + API + UI ให้ครบทุกข้อด้านล่าง โดย **ต่อยอดจากโค้ดเดิม ไม่ใช่เขียนใหม่ทั้งหมด**

---

## Full Functional Requirement ที่ต้องพัฒนาให้ครบ

### 1. ระบบค้นหาและจัดหมวดหมู่
- **FR-1** ค้นหาด้วยรหัสวิชา, ชื่อวิชา, คำสำคัญ, หรือ **แท็ก** (ปัจจุบันค้นได้แค่ code/name)
  → เพิ่มตาราง `tags`, `course_tags` (many-to-many) และขยาย `WHERE` ใน `GET /api/courses` ให้ join ค้นจากแท็กด้วย
- **FR-2** หมวดหมู่รายวิชาที่ชัดเจน (มี `department` filter อยู่แล้ว — ตรวจสอบว่าพอหรือควรเพิ่ม `category` แยกจาก department)
- **FR-3** Dashboard จัดอันดับความนิยม (**ยังไม่มีเลย**)
  → เพิ่ม endpoint `GET /api/dashboard/rankings` (จัดอันดับจาก avg rating รวม, จำนวนรีวิว, จำนวนไลก์รวม) + หน้า `/dashboard` (`Dashboard.jsx`) + ลิงก์ใน `NavBar.jsx`

### 2. ระบบจัดการข้อมูลรายวิชาและรีวิว
- **FR-4** รายละเอียดวิชาต้องมี: เงื่อนไขรายวิชา (prerequisites), เนื้อหาที่เรียน (syllabus), รูปแบบการสอน (teaching_format), ภาระงาน (workload), วิธีประเมินผล (assessment)
  → `courses` table ปัจจุบันมีแค่ `course_code, course_name, department` ต้อง migrate เพิ่มคอลัมน์เหล่านี้ (TEXT) และแสดงใน `CourseDetail.jsx`
- **FR-5** ข้อมูลอาจารย์ผู้สอน + สไตล์การสอน/การให้คะแนน (**ยังไม่มี entity อาจารย์เลย**)
  → เพิ่มตาราง `instructors` (name, bio, teaching_style, grading_style) และ `course_instructors` (join table, รองรับหลายอาจารย์ต่อวิชา/section) แสดงในหน้า course detail
- **FR-6** สร้าง/เผยแพร่รีวิว — มีแล้ว (`POST /api/reviews`) แต่ต้องขยายให้รับคะแนนแยกด้าน (ดู FR-7)
- **FR-7** ฟอร์มให้คะแนนแยกด้าน: ความพึงพอใจรวม, ความยากง่าย, ภาระงาน, เนื้อหา, การสอน, การสอบ (แต่ละด้าน 1-5)
  → เพิ่มคอลัมน์ใน `reviews`: `rating_satisfaction, rating_difficulty, rating_workload, rating_content, rating_teaching, rating_exam` (SMALLINT, CHECK 1-5, NOT NULL — ตรงกับ NFR-10 ที่ห้ามบันทึกรีวิวที่ไม่มีคะแนน)
- **FR-8** ผู้เขียนรีวิวแก้ไข/ลบรีวิวของตัวเองได้ (ปัจจุบันมีแค่ report + admin delete ยังไม่มี owner edit/delete)
  → เพิ่ม `PUT /api/reviews/{id}` และ `DELETE /api/reviews/{id}` — เช็คว่า `reviewer_id` ตรงกับ `X-User-Id` เท่านั้น (403 ถ้าไม่ตรง ตาม NFR-07) ใช้ soft delete (status='DELETED') เหมือน admin delete แต่แยก audit action หรือใช้ target_id เดิมพร้อม note ผู้ลบ

### 3. ระบบจัดการไฟล์เอกสาร (ยังไม่มีเลย)
- **FR-9** อัปโหลดไฟล์ (ชีทสรุป ฯลฯ) แนบไปกับรีวิว — จำกัดขนาดไฟล์ **20MB/ไฟล์** (NFR-03)
  → เพิ่มตาราง `review_files` (review_id, filename, stored_path, size_bytes, uploaded_at) endpoint `POST /api/reviews/{id}/files` (multipart/form-data) เก็บไฟล์ลง volume ที่ mount ใน `docker-compose.yml` (เช่น `./uploads:/app/uploads`) ตรวจสิทธิ์ว่าเป็นเจ้าของรีวิวก่อนอัปโหลด
- **FR-10** ดาวน์โหลดไฟล์แนบ
  → `GET /api/reviews/{id}/files/{file_id}` คืนไฟล์แบบ streaming response พร้อม `Content-Disposition`

### 4. ระบบโปรไฟล์และปฏิสัมพันธ์ (ยังไม่มีเลย)
- **FR-11** หน้าโปรไฟล์ผู้เขียนรีวิว (รูปโปรไฟล์, ชื่อ, ค่าเฉลี่ยความพึงพอใจ, ประวัติการรีวิว)
  → เพิ่มคอลัมน์ `avatar_url` ใน `users`, endpoint `GET /api/users/{id}/profile` (รวม avg rating ทุกด้าน + list รีวิวของ user นั้น + ยอดไลก์รวม) + หน้า `/profile/:id` (`Profile.jsx`) กดจากชื่อผู้เขียนรีวิวในหน้า course detail ได้
- **FR-12** กดถูกใจรีวิว
  → เพิ่มตาราง `review_likes` (review_id, user_id, UNIQUE(review_id, user_id) กันไลก์ซ้ำ) endpoint `POST /api/reviews/{id}/like` และ `DELETE /api/reviews/{id}/like` (toggle) แสดง like count ในการ์ดรีวิว
- **FR-13** คอมเมนต์ใต้รีวิว/บนโปรไฟล์
  → เพิ่มตาราง `review_comments` (review_id, user_id, content, created_at) endpoints `GET/POST /api/reviews/{id}/comments` แสดงใต้แต่ละรีวิวใน `CourseDetail.jsx`

---

## Non-Functional Requirement ที่ต้องคำนึงระหว่างพัฒนา

| ข้อ | สิ่งที่ต้องทำ |
|---|---|
| NFR-01 | ผลค้นหาต้อง < 3 วิ — ใส่ index ให้คอลัมน์ที่ใช้ค้น/join ใหม่ (เช่น `course_tags.tag_id`, `courses` full-text) |
| NFR-03 | จำกัดไฟล์แนบ 20MB/ไฟล์ ทั้งฝั่ง frontend (เช็คก่อนอัปโหลด) และ backend (reject ถ้าเกิน) |
| NFR-06 | ถ้ามีการเพิ่มระบบสมัคร/ล็อกอินจริง (แทน mock) ต้อง hash รหัสผ่านด้วย bcrypt/argon2 ไม่เก็บ plaintext — **นอก scope Sprint 2 ถ้ายังใช้ mock login ต่อ ให้ระบุชัดเจนในโค้ด/README ว่าเป็น prototype auth** |
| NFR-07 | ทุก endpoint ที่แก้ไข/ลบของผู้ใช้ (review edit/delete, file upload/delete, like, comment) ต้องเช็คสิทธิ์เจ้าของที่ backend เสมอ ห้ามพึ่ง UI ซ่อนปุ่มอย่างเดียว |
| NFR-09 | Responsive — ทดสอบหน้าที่เพิ่มใหม่ (Dashboard, Profile) บนขนาดจอมือถือ/แท็บเล็ตด้วย |
| NFR-10 | Validate ความสมบูรณ์ก่อนบันทึก: รีวิวต้องมีครบทุกคะแนน (rating_*), ต้องมี course_id — ใช้ NOT NULL + CHECK constraint ที่ DB เป็นด่านสุดท้าย ไม่ใช่แค่ frontend validation |

---

## แนวทางการทำงาน (สำคัญ)

1. **DB migration**: อย่าแก้ `db/init.sql` แบบทำลายของเดิมเฉยๆ — ให้เพิ่ม `ALTER TABLE` / `CREATE TABLE` ใหม่ต่อท้ายไฟล์เดิม (หรือสร้างไฟล์ migration แยก เช่น `db/migrations/002_sprint2.sql` ถ้ามีกลไก migration) เพราะ `init.sql` รันแค่ตอน volume ว่างครั้งแรกเท่านั้น (`docker compose down -v` แล้ว `up` ใหม่เพื่อ apply ระหว่าง dev)
2. **ทำทีละ FR ทีละ endpoint ทีละหน้า** อย่ารื้อทุกอย่างพร้อมกัน — เริ่มจาก schema → backend endpoint → ทดสอบผ่าน `/docs` (Swagger) → ค่อยต่อ frontend
3. **รักษา engineering rules เดิม** (transaction, row lock, ENUM, server-side authz, soft delete) กับทุกฟีเจอร์ใหม่ที่มีการเขียนหลายตาราง หรือมี concurrent update
4. **อัปเดต README.md** (ตาราง API และ demo walkthrough) ทุกครั้งที่เพิ่ม endpoint ใหม่ ให้สอดคล้องกับของเดิม
5. เมื่อเสร็จแต่ละ feature ให้รัน `docker compose up --build` แล้วทดสอบ end-to-end จริงผ่านหน้าเว็บ ไม่ใช่แค่ดู code compile ผ่าน

## ลำดับความสำคัญที่แนะนำ

1. Schema migration ทั้งหมดก่อน (courses columns, instructors, ratings columns, likes, comments, files, tags) — ทำครั้งเดียวให้ครบเพื่อไม่ต้อง migrate ซ้ำ
2. Review rating แยกด้าน (FR-7) + edit/delete (FR-8) — ต่อยอดง่ายที่สุดจากโค้ดเดิม
3. Instructor + course detail fields (FR-4, FR-5)
4. Like + comment (FR-12, FR-13)
5. Tags search (FR-1) + Dashboard ranking (FR-3)
6. File upload/download (FR-9, FR-10) — ทำทีหลังเพราะต้องจัดการ storage/volume เพิ่ม
7. Profile page (FR-11) — รวมทุกอย่างข้างต้นมาแสดง จึงควรทำหลังสุด
