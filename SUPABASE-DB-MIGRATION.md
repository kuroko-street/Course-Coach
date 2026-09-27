# ย้ายฐานข้อมูล Course Coach บน VM ไป Supabase

คู่มือนี้ใช้กับ VM ที่รันเว็บด้วย `docker compose` ในโฟลเดอร์โปรเจกต์
และใช้ฐาน PostgreSQL ใน service `db` อยู่แล้ว
งานนี้มีช่วงหยุดเว็บสั้น ๆ ระหว่างสำรองและย้ายข้อมูล เพื่อไม่ให้มีข้อมูลใหม่
ถูกเขียนลงฐานเดิมหลังสำรอง ฐานเดิมและ Docker volume จะยังอยู่สำหรับย้อนกลับ

## 1. ปิด Data API และตรวจการเชื่อมต่อก่อนหยุดเว็บ

ใน Supabase ไปที่ **Integrations → Data API** แล้วปิด **Enable Data API**
ก่อนนำข้อมูลจริงเข้า โครงการนี้ใช้ PostgreSQL โดยตรงผ่าน backend ไม่ได้ใช้
Supabase REST/GraphQL API การปิดส่วนนี้ยังเปิดให้ดูตารางผ่าน Table Editor
และ SQL Editor ได้ วิธีนี้ป้องกันไม่ให้ตารางใน `public` ถูกเปิดผ่าน API
โดยไม่ได้ตั้งใจ

ใน Supabase กด **Connect → Session pooler → Connection parameters** แล้ว
สร้างไฟล์ `/home/ubuntu/coursecoach-cloud.pg.env` บน VM ด้วย `nano`:

```dotenv
PGHOST=host-จาก-Supabase-Connect
PGPORT=5432
PGDATABASE=postgres
PGUSER=postgres.รหัสโปรเจกต์จาก-Supabase-Connect
PGPASSWORD=ใส่รหัสผ่านฐานข้อมูลของ Supabase ที่นี่
PGSSLMODE=require
```

แทนค่าตัวอย่างด้วยข้อมูลจาก Supabase Connect และอย่านำไฟล์นี้ขึ้น GitHub
สร้างไฟล์ด้วย `nano` แล้วจำกัดสิทธิ์:

```bash
chmod 600 /home/ubuntu/coursecoach-cloud.pg.env
sudo docker run --rm --env-file /home/ubuntu/coursecoach-cloud.pg.env postgres:16 \
  psql -v ON_ERROR_STOP=1 -Atc "SELECT current_database(), current_user; SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'; SELECT extname, extnamespace::regnamespace FROM pg_extension WHERE extname='pg_trgm';"
```

ต้องเชื่อมต่อได้ และจำนวนตารางใน `public` ต้องเป็น `0` ถ้าเชื่อมต่อไม่ได้
หรือมีตารางอยู่แล้ว ให้หยุดตรงนี้ก่อน อย่า restore ทับฐานเดิม หาก `pg_trgm`
มีอยู่ใน schema `extensions` ให้ตรวจวิธีย้าย extension/index ก่อน เพราะฐานเดิม
สร้าง trigram index โดยอ้าง operator class ใน `public`

## 2. เตรียม Compose บน VM

นำ `docker-compose.cloud-db.yml` ไปวางข้าง `docker-compose.yml` ใน
โฟลเดอร์โปรเจกต์ ไฟล์ใหม่นี้เปลี่ยนค่าเชื่อมต่อเฉพาะ service `migrate` และ
`backend` เท่านั้น จึงไม่ต้องทับ `docker-compose.yml` ที่ VM เคยแก้ไว้
และ service `db` กับ Docker volume เดิมยังคงอยู่

## 3. หยุดการเขียนและสำรองฐานเดิม

รันในโฟลเดอร์โปรเจกต์บน VM เมื่อพร้อมให้เว็บหยุดชั่วคราว:

```bash
mkdir -p /home/ubuntu/coursecoach-backups
chmod 700 /home/ubuntu/coursecoach-backups
umask 077
sudo docker compose stop frontend backend
sudo docker compose exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -n public --no-owner --no-acl' \
  > /home/ubuntu/coursecoach-backups/pre-supabase.dump
test -s /home/ubuntu/coursecoach-backups/pre-supabase.dump
```

ไฟล์ dump มีข้อมูลผู้ใช้จริง ต้องเก็บไว้เฉพาะบน VM ในโฟลเดอร์ที่กำหนด
ถ้า `pg_dump` หรือ `test -s` ล้มเหลว ให้เริ่มเว็บกลับด้วย
`sudo docker compose start backend frontend` แล้วแก้สาเหตุก่อน

## 4. Restore ไป Supabase

Supabase มี schema `public` อยู่แล้ว จึงข้ามคำสั่งสร้าง schema นั้นจาก dump:

```bash
sudo docker run --rm -v /home/ubuntu/coursecoach-backups:/backup:ro postgres:16 \
  pg_restore --list /backup/pre-supabase.dump \
  > /home/ubuntu/coursecoach-backups/restore.list
sed -i '/ SCHEMA - public /d' /home/ubuntu/coursecoach-backups/restore.list
sudo docker run --rm \
  --env-file /home/ubuntu/coursecoach-cloud.pg.env \
  -v /home/ubuntu/coursecoach-backups:/backup:ro postgres:16 \
  pg_restore --exit-on-error --no-owner --no-acl \
  --use-list=/backup/restore.list --dbname=postgres \
  /backup/pre-supabase.dump
```

ถ้า restore แสดง error ให้หยุด ไม่สลับ backend มายัง Supabase และเริ่มเว็บ
กับฐานเดิมด้วย `sudo docker compose start backend frontend` ฐาน Supabase
อาจถูกเขียนไปบางส่วนแล้ว ต้องตรวจและล้างอย่างระมัดระวังก่อนลองซ้ำ

## 5. ตรวจข้อมูลก่อนสลับ backend

เทียบผลของคำสั่งสองชุดนี้ โดยเฉพาะ `users`, `courses`, `reviews`,
`summary_files` และ `schema_migrations`:

```bash
sudo docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM courses), (SELECT count(*) FROM reviews), (SELECT count(*) FROM summary_files), (SELECT count(*) FROM schema_migrations)"'
sudo docker run --rm --env-file /home/ubuntu/coursecoach-cloud.pg.env postgres:16 \
  psql -Atc "SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM courses), (SELECT count(*) FROM reviews), (SELECT count(*) FROM summary_files), (SELECT count(*) FROM schema_migrations)"
```

หากตัวเลขไม่เท่ากัน ให้ใช้ฐานเดิมต่อและตรวจการ restore

## 6. สลับ backend

สำรอง `.env` เดิมก่อน แล้วเพิ่มค่าต่อไปนี้ใน `.env` บน VM โดยใช้รหัส Supabase
จากไฟล์ที่สร้างในขั้นที่ 1 ไม่ต้องส่งรหัสผ่านในแชต:

```dotenv
CLOUD_DB_HOST=host-จาก-Supabase-Connect
CLOUD_DB_PORT=5432
CLOUD_DB_NAME=postgres
CLOUD_DB_USER=postgres.รหัสโปรเจกต์จาก-Supabase-Connect
CLOUD_DB_PASSWORD='รหัสผ่านฐานข้อมูล Supabase'
COMPOSE_FILE=docker-compose.yml:docker-compose.cloud-db.yml
```

ตัวอย่างคำสั่งสำรองและเปิดแก้ไฟล์:

```bash
cp -p .env /home/ubuntu/coursecoach-backups/env.before-cloud
chmod 600 /home/ubuntu/coursecoach-backups/env.before-cloud
nano .env
sudo docker compose config --quiet
```

รันคำสั่งทดสอบฐานก่อนเริ่มเว็บ โดยไม่พิมพ์ค่ารหัสผ่านออกมา:

```bash
sudo docker compose run --rm --no-deps backend python -c 'from db import get_connection; c=get_connection(); q=c.cursor(); q.execute("SELECT current_database(), current_user, (SELECT count(*) FROM users)"); print(q.fetchone()); c.close()'
```

ถ้าเชื่อมต่อได้ ให้เริ่ม backend และ frontend แล้วตรวจ health:

```bash
sudo docker compose up -d --no-deps --force-recreate backend
sudo docker compose start frontend
curl -fsS http://localhost/health
curl -fsS http://localhost/api/auth/config
```

ทดสอบ Google login, หน้า Admin, รายวิชา และการอัปโหลด/ดาวน์โหลดจาก
โดเมนเว็บที่ใช้งานจริง ก่อนถือว่าย้ายสำเร็จ

## ย้อนกลับ

ถ้าหลังสลับเว็บมีปัญหา ให้หยุด backend ก่อน เรียกคืน `.env` เดิม (ซึ่งไม่มี
`COMPOSE_FILE` ของ Cloud) และ recreate backend กลับไปต่อฐาน Docker:

```bash
sudo docker compose stop backend
cp -p /home/ubuntu/coursecoach-backups/env.before-cloud .env
sudo docker compose up -d --no-deps --force-recreate backend
sudo docker compose start frontend
curl -fsS http://localhost/health
```

ข้อมูลที่ถูกเขียนลง Supabase หลังสลับจะไม่ย้อนกลับมาฐานเดิมอัตโนมัติ
จึงควรทดสอบทันทีและจำกัดช่วงเวลาที่อาจต้องย้อนกลับ
