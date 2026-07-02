# เล่นออนไลน์จริง สำหรับมือถือที่ไม่ได้อยู่ Wi-Fi เดียวกัน

ถ้าผู้เล่นใช้ 4G/5G หรืออยู่คนละเครือข่าย เกมต้องมี URL สาธารณะ เช่น `https://your-quiz.onrender.com` หรือโดเมนของเราเอง ผู้เล่นจึงจะสแกน QR แล้วเข้าได้จากทุกที่

## ทางเลือกที่แนะนำ

### 1. ขึ้นโฮสต์ Node.js จริง

เหมาะที่สุดสำหรับงานจริงและรองรับคนเยอะกว่า เพราะเซิร์ฟเวอร์อยู่บนอินเทอร์เน็ตตลอดเวลา

ตัวเลือกที่ใช้ได้:

- Render Web Service
- Railway
- Fly.io
- VPS เช่น DigitalOcean, Linode, AWS Lightsail

สำหรับ Render:

1. อัปโหลดโปรเจกต์นี้ขึ้น GitHub
2. สร้าง Web Service ใหม่
3. ตั้งค่า:
   - Build Command: `npm install`
   - Start Command: `node server.js`
4. หลัง deploy เสร็จ จะได้ URL สาธารณะ
5. เปิด `/admin` เพื่อสร้างห้อง แล้ว QR จะกลายเป็นลิงก์ออนไลน์โดยอัตโนมัติ

ตัวอย่าง:

- Admin: `https://your-quiz.onrender.com/admin`
- จอใหญ่: `https://your-quiz.onrender.com/screen`
- ผู้เล่น: `https://your-quiz.onrender.com/play`

หมายเหตุ: ถ้าจะเก็บชุดคำถามและรายชื่อระยะยาว ควรเพิ่ม database หรือ persistent disk เพราะโฮสต์บางแบบอาจล้างไฟล์เมื่อ redeploy

### 2. Cloudflare Tunnel แบบมีโดเมน

เหมาะถ้าต้องการรันเกมจากคอมพิวเตอร์ที่งาน แต่ให้มือถือจากอินเทอร์เน็ตเข้ามาได้

หลักการคือ:

1. เปิดเกมในเครื่องด้วย `node server.js`
2. ใช้ Cloudflare Tunnel ยิงจากโดเมนจริงเข้ามาที่ `http://localhost:3000`
3. ผู้เล่นเข้าโดเมน เช่น `https://quiz.yourdomain.com/play`

วิธีนี้ต้องให้เครื่องที่รันเกมเปิดอยู่ตลอดงาน และอินเทอร์เน็ตของเครื่องแอดมินต้องนิ่ง

### 3. Quick Tunnel สำหรับทดสอบเท่านั้น

ไม่แนะนำกับเกมนี้สำหรับงานจริง เพราะระบบใช้ Server-Sent Events เพื่ออัปเดตสด และ Quick Tunnel ของ Cloudflare มีข้อจำกัดเรื่อง SSE

## สิ่งที่ควรเพิ่มก่อนใช้ในงานใหญ่

- ย้ายข้อมูลชุดคำถามและผู้เล่นไป database เช่น PostgreSQL หรือ SQLite บน persistent disk
- เพิ่มหน้า export รายชื่อผู้เล่นและอันดับเป็น CSV
- เพิ่มรหัสผ่านหน้า Admin
- เพิ่มระบบ reconnect สำหรับผู้เล่นที่เน็ตหลุด
- เพิ่ม load test 200-500 คนก่อนวันงาน
