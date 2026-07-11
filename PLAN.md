# 🎯 PharmaCare — แผนการแก้ไขอย่างละเอียด
> สถานะล่าสุด: Build ผ่าน, Server รันได้, DB เป็น In-Memory

---

## 📊 สถานะปัจจุบัน

| Layer | เสร็จ | รายละเอียด |
|-------|-------|-----------|
| Backend API (tRPC + Hono) | ✅ | 2,314 บรรทัด, 11 routers |
| Build System (esbuild + vite) | ✅ | `--packages=external` แก้แล้ว |
| Frontend Build | ✅ | Vite build 279KB |
| Frontend Components | ❌ | Kimi ไม่ได้ export React components มา |
| Database | ⚠️ | In-Memory (มี seed data 10 สินค้า) |
| Forte Sync Backend | ✅ | JSON API ทดสอบผ่าน |
| Forte Sync Storage | ❌ | เก็บแค่ localStorage |
| Auth System | ❌ | Mock user |
| Frontend UI | ❌ | มีแค่ stub |

---

## 🔴 Phase 1: Database Persistence
**เป้าหมาย:** เปลี่ยน In-Memory → better-sqlite3 (ข้อมูลไม่หาย)

### 1.1 สร้าง Database Schema (api/db/schema.ts)
```sql
-- ตาราง
- products (id, sku, nameTh, nameEn, price, stock, categoryId, isFeatured, ...)
- categories (id, nameTh, nameEn, slug, icon, color, sortOrder, ...)
- users (id, fullName, email, phone, role, tier, passwordHash, ...)
- orders (id, orderNumber, customerName, subtotal, grandTotal, status, ...)
- order_items (id, orderId, productId, quantity, unitPrice, ...)
- cart_items (id, sessionId, productId, quantity, ...)
- audit_logs (id, action, ip, userId, details, timestamp, ...)
```

### 1.2 แก้ connection.ts
- เปลี่ยนจาก `class InMemoryDb` → `better-sqlite3` database
- สร้างตาราง `CREATE TABLE IF NOT EXISTS`
- seed ข้อมูลเริ่มต้น (10 สินค้า, 4 หมวดหมู่)
- migrate ฟังก์ชันที่มีอยู่ (`getDb().products`, `getDb().categories`) ให้ทำงานกับ SQLite

### 1.3 แก้ build script
- external `better-sqlite3` ออกจาก bundle (ทำแล้วด้วย `--packages=external`)
- ตรวจสอบว่า `better-sqlite3` prebuilt binary ใช้ได้

### 1.4 ทดสอบ
- start server → ข้อมูลคงอยู่
- restart server → ข้อมูลไม่หาย
- CRUD products/categories/orders

---

## 🟡 Phase 2: Type Safety
**เป้าหมาย:** แก้ type errors ทั้ง backend + frontend

### 2.1 Backend Fixes
- `prescriptionRouter.ts` — missing properties `shippingAddressJson, customerTier, shippingFee`
- `securityRouter.ts` — missing `resolved` property ใน AuditLog
- `tsconfig.server.json` — เปลี่ยน `strict: false` → `strict: true` (target)

### 2.2 Frontend Fixes
- สร้าง `src/vite-env.d.ts` สำหรับ Vite types
- แก้ unused imports ถ้ามี

---

## 🟢 Phase 3: Frontend React Components
**เป้าหมาย:** สร้าง UI จริงให้ผู้ใช้ดู/ใช้ได้ (เพราะ Kimi ไม่ได้ export มา)

### 3.1 Core Layout
- หน้าแรก (Home) — hero, featured products, categories
- Store Front — product grid, search, filter by category
- Product Detail — image, price, description, add to cart
- Cart — list items, adjust quantity, checkout button
- Seller Dashboard — orders, products, forte sync

### 3.2 Component List (ต้องเขียนเอง)
| Component | ไฟล์ | ฟังก์ชัน |
|-----------|------|---------|
| HomePage | src/pages/HomePage.tsx | Hero + featured + categories |
| ProductGrid | src/components/ProductGrid.tsx | แสดงสินค้าเป็นกริด |
| ProductCard | src/components/ProductCard.tsx | การ์ดสินค้า |
| ProductDetail | src/pages/ProductDetail.tsx | หน้ารายละเอียดสินค้า |
| Cart | src/pages/Cart.tsx | ตะกร้าสินค้า |
| SellerDashboard | src/pages/SellerDashboard.tsx | Dashboard ร้าน |
| ForteProductManager | src/components/ForteProductManager.tsx | จัดการ Forte Sync |
| LoginForm | src/components/LoginForm.tsx | ฟอร์มล็อกอิน |
| Layout | src/components/Layout.tsx | Header + Footer + Nav |

### 3.3 Router Setup
- `/` → HomePage
- `/products` → ProductGrid
- `/products/:id` → ProductDetail
- `/cart` → Cart
- `/seller` → SellerDashboard
- `/login` → LoginForm

---

## 🔵 Phase 4: Forte Sync → Server DB
**เป้าหมาย:** ข้อมูลจาก Forte เก็บใน server database แทน localStorage

### 4.1 แก้ forteProxyRouter.ts
- เพิ่ม tRPC mutation: `forteProxy.saveToDb` — บันทึกข้อมูลที่ sync ลง SQLite
- เก็บ history การ sync (timestamp, count, status)

### 4.2 สร้าง fortSync.ts (frontend)
- แก้ `MarginManager` (หรือสร้างใหม่) ให้ส่งข้อมูลไปบันทึกที่ server

### 4.3 Product Merge Logic
- ถ้า sync ซ้ำ → update price, stock
- ถ้าเป็นสินค้าใหม่ → insert
- แยกสินค้าของตัวเอง vs สินค้าจาก Forte (source column)

---

## 🟣 Phase 5: Auth System
**เป้าหมาย:** Login จริง (OAuth + username/password)

### 5.1 Backend
- users table (มีอยู่แล้วใน schema)
- JWT token generation (ใช้ `jose` หรือ `jsonwebtoken`)
- Middleware: `protectedProcedure` สำหรับ tRPC
- API: login, register, me, refreshToken
- OAuth endpoints: Google, Line (callback + token exchange)

### 5.2 Frontend
- Login form (username/password)
- Google OAuth button
- Line OAuth button
- Auth context/provider
- Protected routes

### 5.3 Roles
| Role | สิทธิ์ |
|------|--------|
| GUEST | ดูสินค้าเท่านั้น |
| INDIVIDUAL | ซื้อสินค้าได้ |
| RETAIL | ซื้อราคาส่ง |
| CLINIC | ซื้อราคาคลินิก |
| PHARMACIST | จัดการออเดอร์ |
| ADMIN | จัดการทุกอย่าง |

---

## 🟠 Phase 6: Deploy
**เป้าหมาย:** อัปโค้ดกลับขึ้น Kimi Portal

### 6.1 Build production
```bash
npm run build
# → dist/public/ (frontend)
# → dist/boot.js (backend)
```

### 6.2 Upload กลับ Kimi
- ไปที่ Kimi Portal
- กด Deploy version ใหม่
- Activate version

### 6.3 Test production
- เปิด URL https://rixg75wlu6ovm.kimi.pro/
- ทดสอบฟีเจอร์ทั้งหมด

---

## 📋 ลำดับการทำ (Priority)

```
สัปดาห์ 1: Phase 1 (Database) + Phase 3 (Frontend พื้นฐาน)
    → ระบบใช้งานได้: ดูสินค้า, หยิบลงตะกร้า, สั่งซื้อ
    → ข้อมูลไม่หายเมื่อ restart

สัปดาห์ 2: Phase 2 (Types) + Phase 4 (Forte Sync)
    → Forte sync ไป server DB
    → type errors หมด

สัปดาห์ 3: Phase 5 (Auth) + Phase 6 (Deploy)
    → Login ได้ OAuth + password
    → Deploy ขึ้น production
```

---

## ❓ คำถามก่อนเริ่ม

1. **Frontend**: คุณโอเคให้ผมสร้าง React components ใหม่ (Home, Product, Cart, Dashboard) แทนของเดิมที่ Kimi ไม่ได้ export มาใช่ไหม?
2. **Database**: ใช้ `better-sqlite3` (ไฟล์ .db ใน project) หรืออยากให้เตรียมรองรับ MySQL (`mysql2` มีใน deps) สำหรับ production?
3. **Auth**: เริ่มจาก username/password ก่อน หรือ OAuth (Google/Line) พร้อมกันเลย?
