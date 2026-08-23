# คู่มือ Deploy Course Coach ขึ้น Server (สำหรับ Demo ชั่วคราว)

เป้าหมาย: เครื่อง Ubuntu บน Google Cloud (Compute Engine) ที่เรา SSH เข้าไปได้
คู่มือนี้เน้นความง่าย เหมาะกับการทำ demo ชั่วคราว ยังไม่ใช่ระดับ production
จริงจัง (ดูหัวข้อ "สิ่งที่ยังไม่ได้ทำ" ท้ายไฟล์)

## ขั้นที่ 0: สร้างเครื่อง VM (Google Cloud Console)

ก่อนเริ่ม ต้องมี Google Cloud project ที่เปิด billing ไว้แล้ว
(เข้า console.cloud.google.com → ถ้ายังไม่มี project กด "New Project" สร้างใหม่)

1. **เปิดใช้งาน Compute Engine API** — เข้าเมนู *Compute Engine → VM instances*
   ครั้งแรกระบบจะถามให้กดเปิด API รอประมาณ 1 นาทีให้เสร็จ
2. เข้าเมนู **Compute Engine → VM instances → Create Instance**
3. กรอกข้อมูลดังนี้:
   - **Name (ชื่อเครื่อง):** `course-coach-demo`
   - **Region/Zone:** เลือก `asia-southeast1` (สิงคโปร์) ใกล้ไทยที่สุด
   - **Machine type:** เลือก `e2-medium` (2 vCPU, RAM 4 GB) — ถ้าเลือก
     `e2-small` (RAM แค่ 2 GB) ก็พอใช้ได้ แต่ตอนรัน `docker build` /
     `npm install` อาจจะ RAM ไม่พอจนค้าง ใช้ `e2-medium` ปลอดภัยกว่า
   - **Boot disk → กด Change:** เลือก Operating system เป็น **Ubuntu**
     เวอร์ชัน **Ubuntu 22.04 LTS (x86_64)** ขนาด disk **20 GB** ก็เพียงพอ
     (สำหรับเก็บ Docker image ของทั้ง 3 service + Postgres)
   - **Firewall:** ติ๊กเลือก **"Allow HTTP traffic"** ด้วย — ตัวนี้จะเปิด
     port 80 ให้คนภายนอกเข้าถึงได้ ซึ่งตรงกับ port ที่หน้าเว็บ (frontend)
     ใช้ใน `docker-compose.yml`
4. กด **Create** รอประมาณ 30 วินาที เครื่องจะขึ้นเครื่องหมายถูกสีเขียว
   พร้อม **External IP** — IP นี้แหละคือลิงก์ demo ของเรา
   (`http://<external-ip>`)

### ถ้าอยากใช้คำสั่ง `gcloud` แทนการคลิกในเว็บ

ถ้าติดตั้ง [gcloud CLI](https://cloud.google.com/sdk/docs/install) และ
login แล้ว (`gcloud init`) รันคำสั่งนี้แทนขั้นตอนข้างบนได้เลย:

```bash
gcloud compute instances create course-coach-demo \
  --zone=asia-southeast1-b \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=http-server

# เปิด port 80 ให้เครื่องที่ติด tag http-server
# (ถ้าเคยสร้าง rule นี้ไว้แล้วในโปรเจกต์ ข้ามได้เลย)
gcloud compute firewall-rules create allow-http \
  --allow=tcp:80 \
  --target-tags=http-server \
  --direction=INGRESS
```

### วิธีเชื่อมต่อเข้าเครื่อง

- **ผ่านเว็บ Console:** ไปที่หน้า VM instances แล้วกดปุ่ม **SSH** ข้างชื่อ
  `course-coach-demo` — จะเปิด terminal ในเบราว์เซอร์เลย ไม่ต้องตั้งค่า key
  เอง
- **ผ่านคำสั่ง:** `gcloud compute ssh course-coach-demo --zone=asia-southeast1-b`

ต่อจากนี้ในคู่มือ พอบอกว่า "SSH เข้าเครื่อง" หมายถึงเครื่องนี้เครื่องเดียว

## ขั้นที่ 0.5: สร้าง user เอง ตั้งรหัสผ่าน ให้สิทธิ์ sudo และตั้งค่า SSH key

ขั้นนี้เผื่อไว้กรณีโจทย์/อาจารย์กำหนดให้สร้าง user เองแบบ manual แทนที่จะ
ใช้ user default ที่ Google Cloud สร้างให้อัตโนมัติตอนกด SSH ครั้งแรก
(ถ้าใช้ user default ของ GCP อยู่แล้วและมี sudo พร้อมใช้ ข้ามขั้นนี้ไปทำ
ขั้นที่ 1 ต่อได้เลย)

SSH เข้าเครื่องด้วย user เดิม (default) ก่อน แล้วทำตามลำดับนี้:

### 1) สร้าง user ใหม่ชื่อ `pu`

```bash
sudo adduser pu
```

คำสั่งนี้จะถามให้ **ตั้งรหัสผ่าน** ทันที (พิมพ์แล้วกด Enter, พิมพ์ซ้ำอีกรอบ
ยืนยัน) ส่วนคำถามอื่นๆ ที่ตามมา (Full Name, Room Number, ฯลฯ) กด Enter
ผ่านได้หมด ไม่จำเป็นต้องกรอก แล้วพิมพ์ `Y` ยืนยันตอนท้าย

> ถ้าต้องการแค่ **เปลี่ยนรหัสผ่าน** ของ user ที่มีอยู่แล้ว (ไม่ได้สร้างใหม่)
> ใช้คำสั่งนี้แทน:
> ```bash
> sudo passwd pu
> ```

### 2) ให้สิทธิ์ sudo (สิทธิ์ระดับ root) แก่ `pu`

```bash
sudo usermod -aG sudo pu
```

เช็คว่าได้สิทธิ์แล้วจริง:

```bash
groups pu
# ควรเห็นคำว่า "sudo" อยู่ในรายการกลุ่มที่แสดง
```

ทดสอบด้วยการสลับไปเป็น user `pu` แล้วลองสั่งงานแบบ root:

```bash
su - pu
sudo whoami
# ควรได้ผลลัพธ์ว่า "root"
```

### 3) ตั้งค่า SSH key ให้ `pu` (เข้าเครื่องได้โดยไม่ต้องพิมพ์รหัสผ่าน)

สร้างคู่ SSH key บนเครื่อง Windows ของเรา (รันใน PowerShell หรือ Git Bash):

```bash
ssh-keygen -t ed25519 -C "pu@course-coach-demo"
```

กด Enter ผ่านได้ทุกช่อง (จะเซฟไว้ที่ `~/.ssh/id_ed25519` โดย default) หรือ
จะตั้ง passphrase เพิ่มความปลอดภัยก็ได้ จะได้ไฟล์ 2 ไฟล์:
- `id_ed25519` — **private key** ห้ามให้ใครเห็นหรือส่งออกไปไหนเด็ดขาด
- `id_ed25519.pub` — **public key** เอาไปวางในเครื่อง VM ได้ ไม่เป็นความลับ

เปิดดูเนื้อหา public key:

```bash
cat ~/.ssh/id_ed25519.pub
```

จะได้ข้อความยาวๆ ขึ้นต้นด้วย `ssh-ed25519 ...` copy ทั้งบรรทัดไว้ แล้วกลับไป
ที่ฝั่ง VM (ยัง SSH ค้างอยู่ด้วย user เดิม) พิมพ์:

```bash
sudo mkdir -p /home/pu/.ssh
sudo nano /home/pu/.ssh/authorized_keys
```

วางบรรทัด public key ที่ copy มาลงในไฟล์ (คลิกขวาวางใน terminal ส่วนใหญ่ก็ใช้
ได้) แล้วกด `Ctrl+O` ตามด้วย `Enter` เพื่อบันทึก และ `Ctrl+X` เพื่อออกจาก
nano จากนั้นตั้งสิทธิ์ไฟล์ให้ถูกต้อง (SSH จะปฏิเสธ key ถ้า permission
หลวมเกินไป):

```bash
sudo chown -R pu:pu /home/pu/.ssh
sudo chmod 700 /home/pu/.ssh
sudo chmod 600 /home/pu/.ssh/authorized_keys
```

ทดสอบ SSH เข้าด้วย user `pu` จากเครื่อง Windows (ใช้ external IP ของ VM): 35.198.243.108

```bash
ssh -i ~/.ssh/id_ed25519 pu@35.198.243.108
```

ถ้าตั้งค่าถูกต้อง จะเข้าเครื่องได้เลยโดยไม่ถูกถามรหัสผ่าน จากนี้ไปในคู่มือ
SSH เข้าเครื่องด้วยคำสั่งนี้แทนที่จะใช้ `gcloud compute ssh` ก็ได้

## ขั้นที่ 1: ติดตั้ง Docker บนเครื่อง

SSH เข้าเครื่องแล้ว รันคำสั่งนี้:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

จากนั้น logout แล้ว login ใหม่ (หรือรัน `newgrp docker`) เพื่อให้ user
ของเรารันคำสั่ง `docker` ได้โดยไม่ต้องใส่ `sudo` ทุกครั้ง เช็คว่าติดตั้ง
สำเร็จด้วย:

```bash
docker --version
docker compose version
```

## ขั้นที่ 2: เปิด Firewall

มีแค่ port 80 (หน้าเว็บ) เท่านั้นที่ต้องเปิดให้คนภายนอกเข้าถึงได้ —
ฐานข้อมูล (database) ไม่เปิด port ออกสู่ภายนอกเลย และ backend ก็ผูกไว้กับ
`127.0.0.1` เท่านั้นใน `docker-compose.yml` ทั้งสองตัวนี้จึงเข้าถึงจาก
อินเทอร์เน็ตไม่ได้อยู่แล้ว

ถ้าตอนสร้างเครื่องติ๊ก **"Allow HTTP traffic"** ไว้แล้ว (หรือรันคำสั่ง
`gcloud compute firewall-rules create` ข้างบนแล้ว) แปลว่า port 80 เปิด
อยู่แล้วในระดับเครือข่าย ซึ่งเป็นด่านที่สำคัญที่สุดบน Google Cloud เพราะ
ทราฟฟิกจะถูกกรองตั้งแต่ก่อนเข้าถึงตัวเครื่องด้วยซ้ำ ส่วน `ufw` ในตัวเครื่อง
เองถือเป็นการป้องกันเสริม ไม่ทำก็ได้ถ้าอยากให้เรื่องง่ายเข้าไว้ หรือจะทำ
เพิ่มเพื่อความชัวร์ก็ได้:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
```

(ถ้าใช้ผู้ให้บริการ VPS เจ้าอื่นที่ไม่มี firewall ระดับเครือข่ายแบบ
Google Cloud เช่น DigitalOcean, Linode ขั้นตอน `ufw` ข้างบนนี้จำเป็นต้องทำ
เพราะเป็น firewall เดียวที่มี)

## ขั้นที่ 3: ก็อปโปรเจกต์ขึ้นเครื่อง

รันจากเครื่อง Windows ของเราเอง:

```bash
# แบบ A: ใช้ git (ถ้า push โค้ดขึ้น repo ไว้แล้ว ก็ clone จากในเครื่อง VM ได้เลย)
gcloud compute ssh course-coach-demo --zone=asia-southeast1-b
git clone <your-repo-url> course-coach
cd course-coach

# แบบ B: ใช้ gcloud scp ก็อปตรงจากเครื่อง Windows ไม่ต้องมี git
# ไม่ต้องตั้งค่า SSH key เอง (gcloud จัดการ auth ให้)
gcloud compute scp --recurse "D:/Y3_T1/ISE/project3" \
  course-coach-demo:~/course-coach --zone=asia-southeast1-b
```

## ขั้นที่ 4: สั่งรันระบบ

เข้าไปในโฟลเดอร์โปรเจกต์บนเครื่อง VM แล้วรัน:

```bash
docker compose up -d --build
```

ครั้งแรกที่รัน ระบบจะสร้าง volume ชื่อ `db_data` และรัน `db/init.sql`
(สร้างตาราง + ข้อมูลตัวอย่าง) ให้อัตโนมัติ รอสักครู่แล้วเช็คว่าทุกอย่าง
พร้อมด้วย:

```bash
docker compose ps
curl -s localhost/health   # ควรได้ {"status":"ok",...} ผ่าน proxy ของหน้าเว็บ
```

## ขั้นที่ 5: เปิดใช้งาน

```
http://35.198.243.108
```

เอาลิงก์นี้ไปแชร์ได้เลย ไม่ต้องมีเลข port ต่อท้าย เข้าหน้า `/login` แล้ว
เลือกล็อกอินเป็น `somchai_s`, `malee_p`, หรือ `admin_wichai` เพื่อทดลอง
flow ทั้งหมดตามที่อธิบายไว้ใน
[README.md](README.md#demo-walkthrough-end-to-end)

## คำสั่งที่ใช้บ่อย

```bash
docker compose logs -f backend      # ดู log ของ backend แบบ real-time
docker compose restart backend      # restart แค่ service เดียว
docker compose down                 # หยุดทุกอย่าง แต่ข้อมูลยังอยู่
docker compose down -v              # หยุดทุกอย่าง และ ลบข้อมูลในฐานข้อมูลทิ้งด้วย
docker compose up -d --build        # deploy โค้ดใหม่หลังแก้ไข/pull โค้ดล่าสุด
```

## สิ่งที่ยังไม่ได้ทำ (โอเคสำหรับ demo ชั่วคราว แต่ถ้าจะใช้ต่อเนื่องต้องแก้)

- **ยังไม่มี HTTPS** ทราฟฟิกวิ่งผ่าน HTTP ธรรมดา เหมาะกับลิงก์ demo
  ระยะสั้นๆ ถ้าจะใช้ยาวเป็นสัปดาห์ ควรเพิ่ม
  [Caddy](https://caddyserver.com/) หรือ nginx + Let's Encrypt ไว้ด้านหน้า
  พร้อมโดเมนของตัวเอง
- **รหัสผ่านฐานข้อมูลยังเป็นค่า default** (`coursecoach` / `coursecoach_pass`
  ใน `docker-compose.yml`) ตอนนี้ port ของฐานข้อมูลไม่เปิดสู่ภายนอกแล้ว
  ความเสี่ยงหลักจึงลดลงไปมาก แต่ถ้าจะเก็บข้อมูลจริง ควรเปลี่ยนรหัสผ่านก่อน
- **ระบบล็อกอินยังเป็น mock** `/api/auth/login-mock` เชื่อ `user_id` ที่
  ส่งมาโดยไม่ตรวจสอบอะไรเลย — นี่คือจุดประสงค์ของ Sprint 1 ที่ต้องการให้
  สลับตัวละครทดสอบได้ง่าย แต่ก็หมายความว่าใครก็ตามที่มีลิงก์นี้สามารถ
  ปลอมตัวเป็น user ทั้ง 3 คนได้ รวมถึงบัญชี admin ด้วย
