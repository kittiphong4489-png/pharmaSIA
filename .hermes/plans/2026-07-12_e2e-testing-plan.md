# PharmaCare E2E Testing Plan

> **เป้าหมาย:** ทดสอบระบบ PharmaCare ตั้งแต่ต้นจนจบ ทีละระบบ ทีละฟังก์ชั่น
> **ขอบเขต:** ระบบทั้งหมดบน Railway (production)
> **สถานะปัจจุบัน:** Deployed ที่ https://pharmacare-1783398975-production.up.railway.app

---

## ระบบที่ 1: สมัครสมาชิก & Login (Auth System)

### 1.1 สมัครสมาชิกใหม่ (Register)
- [ ] เปิดหน้า `/register`
- [ ] กรอก: ชื่อ, เบอร์โทร, อีเมล, รหัสผ่าน
- [ ] กดสมัคร → ขึ้น "สมัครสำเร็จ"
- [ ] เช็คว่า Login ได้ด้วยอีเมล + รหัสผ่านที่สมัคร
- **ไฟล์เกี่ยวข้อง:** `src/pages/RegisterPage.tsx`, `api/boot.ts` (POST /api/auth/register)

### 1.2 เข้าสู่ระบบ (Login)
- [ ] เปิดหน้า `/login`
- [ ] Login ด้วยอีเมล + รหัสผ่าน
- [ ] ตรวจสอบว่า Token ถูกเก็บใน `localStorage("pharma_token")`
- [ ] หลังจาก Login → redirect ไปหน้าเดิม
- **ไฟล์เกี่ยวข้อง:** `src/pages/LoginPage.tsx`, `api/boot.ts` (POST /api/auth/login)

### 1.3 แก้ไขโปรไฟล์
- [ ] Login → ไปหน้า `/account/profile`
- [ ] แก้ไขชื่อ, เบอร์โทร
- [ ] กดบันทึก → ข้อมูลอัปเดต
- **ไฟล์เกี่ยวข้อง:** `src/pages/AccountProfilePage.tsx`

---

## ระบบที่ 2: เรียกดูสินค้า (Product Browsing)

### 2.1 หน้าแรก (Home)
- [ ] เปิด `/` → เห็นสินค้าแนะนำ / หมวดหมู่
- [ ] คลิกสินค้า → ไปหน้า Product Detail
- **ไฟล์เกี่ยวข้อง:** `src/pages/HomePage.tsx`

### 2.2 ค้นหาสินค้า
- [ ] พิมพ์ชื่อสินค้าในช่องค้นหา
- [ ] กดค้นหา → แสดงผลลัพธ์
- [ ] ค้นหาด้วยคำที่ไม่ตรง → แสดง "ไม่พบสินค้า"
- **ไฟล์เกี่ยวข้อง:** `src/pages/SearchPage.tsx`

### 2.3 หน้ารายละเอียดสินค้า (Product Detail)
- [ ] คลิกสินค้า → ดูชื่อ, ราคา, รายละเอียด
- [ ] กด "เพิ่มลงตะกร้า"
- [ ] กด "ปรึกษา LINE" → เปิด LINE OA
- **ไฟล์เกี่ยวข้อง:** `src/pages/ProductDetailPage.tsx`

### 2.4 Cache Busting (GET requests)
- [ ] เปิด Network tab → ทุก GET request มี `?_t=...` ต่อท้าย
- **ไฟล์เกี่ยวข้อง:** `src/lib/api.ts`

---

## ระบบที่ 3: ระบบตะกร้าสินค้า (Cart System)

### 3.1 เพิ่มสินค้าลงตะกร้า
- [ ] หน้า Product Detail → กด "เพิ่มลงตะกร้า"
- [ ] ขึ้น Toast "เพิ่มสินค้าเรียบร้อย"
- [ ] จำนวนใน Badge ตะกร้าอัปเดต
- **ไฟล์เกี่ยวข้อง:** `src/pages/ProductDetailPage.tsx`, `api/boot.ts` (POST /api/cart/add)

### 3.2 หน้า Cart
- [ ] ไป `/cart`
- [ ] เห็นสินค้าที่เพิ่ม, จำนวน, ราคารวม
- [ ] ปรับจำนวน → ยอดรวมเปลี่ยน
- [ ] ลบสินค้า → หายจากตะกร้า
- [ ] กด "สั่งซื้อ"
- **ไฟล์เกี่ยวข้อง:** `src/pages/CartPage.tsx`

### 3.3 Backend Cart (no localStorage)
- [ ] ตรวจสอบว่า Cart เก็บที่ Backend (ตาราง cart_items)
- [ ] ปิด Browser → เปิดใหม่ → Cart ยังอยู่ (ถ้า sessionId เดิม)
- **ไฟล์เกี่ยวข้อง:** `api/boot.ts` (GET /api/cart/get, POST /api/cart/add)

---

## ระบบที่ 4: สั่งซื้อสินค้า + ชำระเงิน (Order + Payment)

### 4.1 สั่งซื้อ (Guest ไม่ Login)
- [ ] โดยไม่ Login → เพิ่มสินค้า → ไป Cart → สั่งซื้อ
- [ ] กรอก: ชื่อ, เบอร์, ที่อยู่
- [ ] เลือก "ชำระผ่าน PromptPay"
- [ ] กด "สั่งซื้อ" → ขึ้น QR PromptPay + ยอดเงิน
- [ ] เช็ค `X-Session-ID` ตรงกัน
- **ไฟล์เกี่ยวข้อง:** `src/pages/CartPage.tsx`, `api/boot.ts` (POST /api/orders)

### 4.2 สั่งซื้อ (Logged-in)
- [ ] Login → เพิ่มสินค้า → สั่งซื้อ
- [ ] ตรวจสอบว่า username ถูกดึงมาจาก Profile อัตโนมัติ
- **ไฟล์เกี่ยวข้อง:** `src/pages/CartPage.tsx`

### 4.3 อัปโหลดสลิป
- [ ] หลังสั่งซื้อ → กด "เลือกรูปสลิป"
- [ ] เลือกรูปภาพจากเครื่อง
- [ ] กด "ยืนยันการชำระเงิน"
- [ ] ตรวจสอบว่า รูปถูกอัปโหลดไปที่ `/api/images/slip-xxx.jpg`
- **ไฟล์เกี่ยวข้อง:** `src/lib/api.ts` (uploadSlipImage), `api/boot.ts` (POST /api/upload/slip)

### 4.4 ดาวน์โหลด Invoice
- [ ] หลังยืนยันชำระ → กด "📄 ดูรายการสั่งซื้อ"
- [ ] ได้ PDF Invoice
- [ ] ตรวจสอบ Layout: ชื่อร้าน, รายการสินค้า, QR Code
- **ไฟล์เกี่ยวข้อง:** `src/pages/CartPage.tsx` (downloadInvoice), `api/lib/invoice.ts`

### 4.5 สถานะออเดอร์หลังสั่ง
- [ ] หน้า success: แสดง "⏳ รอจ่ายเงิน"
- [ ] หลังยืนยันสลิป: เปลี่ยนเป็น "✅ สั่งซื้อสำเร็จ"
- **ไฟล์เกี่ยวข้อง:** `src/pages/CartPage.tsx`

---

## ระบบที่ 5: หน้ารวมออเดอร์ลูกค้า (Customer Orders)

### 5.1 ดูประวัติออเดอร์
- [ ] Login → ไป `/account/orders`
- [ ] เห็นรายการออเดอร์ทั้งหมด
- [ ] คลิกดูรายละเอียด
- **ไฟล์เกี่ยวข้อง:** `src/pages/AccountOrdersPage.tsx`

### 5.2 ยกเลิกออเดอร์
- [ ] ออเดอร์ที่ยังไม่ confirm → กด "ยกเลิก"
- [ ] สถานะเปลี่ยนเป็น "cancelled"
- **ไฟล์เกี่ยวข้อง:** `src/pages/AccountOrdersPage.tsx`

---

## ระบบที่ 6: Admin Dashboard (Seller)

### 6.1 Login Admin
- [ ] เปิด `/login` → Login ด้วยบัญชี Admin
- [ ] ไป `/seller/orders`

### 6.2 ดูรายการออเดอร์
- [ ] เห็นออเดอร์ทั้งหมด (สถานะ, ยอด, ลูกค้า)
- [ ] กด "📎 ดูสลิป" → Modal แสดงรูปสลิป
- **ไฟล์เกี่ยวข้อง:** `src/pages/AdminOrderPage.tsx`

### 6.3 จัดการสถานะออเดอร์ (Flow ครบ)
- [ ] `paid` → กด "✅ ยืนยันการชำระ" → `confirmed`
- [ ] `confirmed` → กด "📦 เริ่มแพ็ค" → `packing`
- [ ] `packing` → กด "📦✅ แพ็คเสร็จ" → `packed`
- [ ] `packed` → กรอก Tracking → กด "🚚 จัดส่ง" → `shipping`
- [ ] `shipping` → กด "✅ ส่งสำเร็จ" → `delivered`
- **ไฟล์เกี่ยวข้อง:** `src/pages/AdminOrderPage.tsx`, `api/boot.ts`

### 6.4 ตั้งค่าร้าน
- [ ] ไป `/seller/settings`
- [ ] แก้ไข: ชื่อร้าน, เบอร์, ที่อยู่, LINE ID
- [ ] กดบันทึก → ข้อมูลอัปเดต
- **ไฟล์เกี่ยวข้อง:** `src/pages/SellerSettingsPage.tsx`, `api/boot.ts`

### 6.5 Forte Sync
- [ ] ไป `/seller/forte`
- [ ] กด "🔄 ซิงค์ทั้งหมด"
- [ ] ระบบเริ่มดึงข้อมูลจาก Forte (64 หน้า)
- [ ] ตรวจสอบว่า connection ใช้ `http://forte2014mukdahan.ddns.net`
- **ไฟล์เกี่ยวข้อง:** `src/pages/ForteProductManager.tsx`, `api/routers/forteProxyRouter.ts`

---

## ระบบที่ 7: QR Scan + Packing (สำหรับ Admin)

### 7.1 สแกน QR จาก Invoice
- [ ] เปิด PDF Invoice → มี QR Code มุมขวาล่าง
- [ ] สแกน → เปิด `https://pharmacare.../scan/{orderId}`
- **ไฟล์เกี่ยวข้อง:** `api/lib/invoice.ts` (qrcode section)

### 7.2 หน้า Scan Order
- [ ] เปิด `/scan/{orderId}`
- [ ] เห็น: ออเดอร์# , ชื่อลูกค้า, เบอร์, ที่อยู่, รายการสินค้า
- [ ] กด "📦 เริ่มแพ็คออเดอร์นี้" → สถานะเปลี่ยน
- **ไฟล์เกี่ยวข้อง:** `api/boot.ts` (GET /scan/:id)

### 7.3 Scan → Pack → Packed
- [ ] จาก `/scan/{orderId}` → กด "เริ่มแพ็ค" → status = packing
- [ ] กลับมาที่หน้าเดิม → ปุ่มเปลี่ยนเป็น "📦✅ แพ็คเสร็จแล้ว"
- [ ] กด → status = packed
- **ไฟล์เกี่ยวข้อง:** `api/boot.ts` (GET /scan/:id/pack, /scan/:id/packed)

---

## ระบบที่ 8: Telegram Notification

### 8.1 แจ้งเตือนออเดอร์ใหม่
- [ ] มีออเดอร์ใหม่ → Bot @PharmaSIAordar_bot ส่งข้อความ
- [ ] ข้อความประกอบด้วย: ออเดอร์#, ชื่อลูกค้า, สินค้า, ยอด
- **ไฟล์เกี่ยวข้อง:** `api/lib/telegramNotify.ts`

### 8.2 ปุ่มอนุมัติใน Telegram
- [ ] ข้อความมีปุ่ม "✅ อนุมัติออเดอร์" + "❌ ปฏิเสธ"
- [ ] กด "อนุมัติ" → DB update status → ข้อความเปลี่ยน
- **ไฟล์เกี่ยวข้อง:** `api/lib/telegramNotify.ts` (handleTelegramCallback)

---

## ระบบที่ 9: Invoice PDF

### 9.1 Layout ถูกต้อง
- [ ] ข้อมูลร้านค้าอยู่ซ้าย (ชื่อ, ที่อยู่, เบอร์)
- [ ] ใบรายการสั่งซื้อ + รายละเอียด (เลขที่, วันที่, เวลา, สถานะ) อยู่ซ้าย indent 4cm
- [ ] QR Code มุมขวาล่าง
- [ ] ตารางสินค้า: ชื่อ, จำนวน (ชิดขวา), ราคา/หน่วย (ชิดขวา), รวม (ชิดขวา)
- [ ] Totals: ยอดสินค้า, ค่าจัดส่ง, ภาษี, รวมทั้งสิ้น ชิดขวาล่าง
- [ ] ตัวเลขทั้งหมดมี .00 (ex: ฿197.00)
- [ ] Footer ตรงกลาง
- [ ] **ไม่มีการตกขอบ / ซ้อนทับ**
- **ไฟล์เกี่ยวข้อง:** `api/lib/invoice.ts`

### 9.2 ฟอนต์ไทย
- [ ] ฟอนต์ Sarabun ใช้ได้ (Regular, Bold, Italic)
- [ ] ภาษาไทยแสดงผลถูกต้อง
- **ไฟล์เกี่ยวข้อง:** `api/lib/invoice.ts`, `api/fonts/`

---

## ระบบที่ 10: Debug Panel

### 10.1 แสดงผล
- [ ] เปิดเว็บ → กด 🛠 มุมซ้ายล่าง
- [ ] เห็น: Cart Items, Last Order, API Status
- **ไฟล์เกี่ยวข้อง:** `src/components/DebugPanel.tsx`

---

## ลำดับการทดสอบ (Execution Order)

| ลำดับ | ระบบ | เวลาประมาณ |
|:----:|:-----|:----------:|
| 1 | Auth (Register/Login) | 5 นาที |
| 2 | เรียกดูสินค้า + ค้นหา | 5 นาที |
| 3 | ตะกร้าสินค้า | 5 นาที |
| 4 | สั่งซื้อ + อัปโหลดสลิป + Invoice (Guest) | 10 นาที |
| 5 | สั่งซื้อ + อัปโหลดสลิป + Invoice (Logged-in) | 10 นาที |
| 6 | Admin Dashboard + จัดการออเดอร์ | 10 นาที |
| 7 | QR Scan + Packing | 5 นาที |
| 8 | Telegram Notification | 5 นาที |
| 9 | ตั้งค่าร้าน + Forte Sync | 5 นาที |
| 10 | Debug Panel | 2 นาที |
| | **รวม** | **~62 นาที** |

---

## หมายเหตุ

- ✅ = ผ่าน
- ❌ = ไม่ผ่าน (ต้องแก้)
- ⚠️ = มีปัญหาเล็กน้อย
- แต่ละระบบทดสอบบน Railway (production) URL: https://pharmacare-1783398975-production.up.railway.app

