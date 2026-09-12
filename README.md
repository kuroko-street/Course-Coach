# Course Coach — Community edition (dev)

รุ่นชุมชนล่าสุด: ผู้ใช้ล็อกอินสร้างรายวิชาแยกตามปี/เทอม/ผู้สอนได้ มีรีวิวหกด้าน แท็ก ไฟล์เรียน ความคิดเห็น การรายงานอัตโนมัติ ค้นหา Dashboard และแผนการเรียน

## เริ่มใช้งานในเครื่อง

ต้องมี Docker Desktop ที่เปิดทำงานแล้ว จากโฟลเดอร์โปรเจกต์:

```powershell
git switch dev
git pull --ff-only origin dev
docker compose up -d --build
docker compose --profile tools run --rm seed-mock
```

เปิด [หน้าเว็บ](http://localhost/) แล้วเข้า Login เพื่อเลือกบัญชีทดสอบ แอดมิน 1 บัญชีและผู้ใช้ 6 บัญชี คำสั่ง seed ทำซ้ำได้ ไม่สร้างรายวิชาทดลองให้อัตโนมัติ

- หน้าเว็บพอร์ต 80, API พอร์ต 5001, PostgreSQL พอร์ต 5433 เปิดเฉพาะ localhost
- ใช้ฐานข้อมูลและ volume ชื่อ community แยกจากระบบเก่า **อย่าเอา volume/schema เก่ามาเสียบ และอย่าลบ volume เพื่อแก้ปัญหาโดยไม่ได้สำรอง**
- `.env` ไม่อยู่ใน Git หากต้องกำหนด Google Client ID หรือ session secret ให้ตั้ง `GOOGLE_CLIENT_ID` และ `SESSION_SECRET` ในเครื่องตัวเอง
- Google login ต้องใช้ origin ที่ลงทะเบียนกับเจ้าของ Client ID โค้ดไม่สามารถเพิ่มโดเมนให้ Google โดยอัตโนมัติ
- ไฟล์และข้อมูลที่ลองบนเครื่องผู้พัฒนาไม่ได้ติดไปกับ Git เพื่อนจะเริ่มจากฐานข้อมูลใหม่ของตัวเอง
- ไฟล์เรียนดาวน์โหลดได้ตามเดิม พรีวิวพักไว้ทำรอบหน้า

## อ่านรายละเอียด

- [คู่มือรุ่นชุมชนและวิธีรัน](LOCAL-REDESIGN.md)
- [โควต้าและการพักสิทธิ์](CONTENT-QUOTAS-2026-09-12.md)
- [UX / รายการที่ทดสอบ](UX-REDESIGN-2026-09-13.md)

## ตรวจสอบพื้นฐาน

```powershell
docker compose exec -T frontend npm run build
docker compose exec -T frontend node --test src/lib/catalogQuery.test.js
docker compose -f docker-compose.test.yml run --rm test
```

ชุด backend test ใช้ฐานข้อมูลทดสอบแยก ห้ามเปลี่ยนให้ชี้ข้อมูลจริง

## ก่อนนำขึ้นเซิร์ฟเวอร์

Docker Compose ชุดนี้เป็น **local development** มี mock login และค่า secret สำหรับ local เท่านั้น ไม่ใช่ production configuration ห้ามนำค่าเหล่านี้ออกสู่สาธารณะ ต้องเตรียม HTTPS, origin ของ Google, ปิด mock, เปลี่ยน secrets, สำรองฐานข้อมูล/ไฟล์ และกำหนดพื้นที่จัดเก็บก่อน deploy

เอกสาร/SQL ของ Sprint เดิมยังเก็บไว้เพื่ออ้างอิงประวัติ ไม่ใช่คู่มือรันรุ่นนี้ โดยเฉพาะคำแนะนำ deploy รุ่นเดิมต้องตรวจปรับก่อนใช้ สคีมารุ่นชุมชนที่ใช้อยู่จริงอยู่ใน `db/community`
