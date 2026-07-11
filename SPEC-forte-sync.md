# PharmaCare <> Forte Data Sync — Technical Specification
## แผนการดึงข้อมูลสินค้าจาก Forte Mukdahan + Margin Manager

---

## 1. Executive Summary

### 1.1 สถานการณ์
- ผู้ใช้เป็นลูกค้า B2B (ร้านขายยา RETAIL) ของ Forte Mukdahan 2014
- ใช้ Username/Password MK25-0264 สั่งซื้อยาจาก Forte อยู่แล้วเป็นประจำ
- ต้องการดึงข้อมูลสินค้าจาก Forte มาแสดงใน PharmaCare โดยอัตโนมัติ

### 1.2 เป้าหมาย
- ดึงข้อมูลยา, ราคาทุน, สต็อก จาก Forte ทุก 1 ชั่วโมง
- คำนวณราคาขาย (ราคาทุน + % กำไรที่กำหนด) อัตโนมัติ
- แสดงสินค้าใน PharmaCare แบบ real-time
- ผู้ใช้สามารถกำหนด % กำไรได้ทีเดียวหลายรายการ (bulk margin setting)

### 1.3 ข้อจำกัดทางกฎหมาย (ที่ต้องระวัง)
- Forte ใช้ระบบ ASP.NET WebForms + Session Cookie Authentication
- ไม่มี Public API เปิดเผย
- การดึงข้อมูลอัตโนมัติ (scraping) อาจผิด **Terms of Service** ของ BlueNoteSoftware
- แม้เป็นลูกค้าอยู่แล้ว แต่การใช้ bot อาจถูกบล็อก IP

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PHARMACARE (React)                      │
│                                                             │
│  ┌─────────────────┐    ┌──────────────────────┐           │
│  │  MarginManager  │◄───│  ForteProductTable   │           │
│  │  (UI กำหนด %)  │    │  (แสดงสินค้า+ราคา) │           │
│  └─────────────────┘    └──────────────────────┘           │
│           │                        ▲                        │
│           │                        │                        │
│           ▼                        │                        │
│  ┌──────────────────────────────────────┐                  │
│  │      ForteSyncService (Background)   │                  │
│  │  - Login with credentials            │                  │
│  │  - Fetch product pages               │                  │
│  │  - Parse HTML → structured data      │                  │
│  │  - Store in localStorage/SQLite      │                  │
│  └──────────────┬───────────────────────┘                  │
│                 │                                           │
└─────────────────┼───────────────────────────────────────────┘
                  │ HTTP Requests (with session cookie)
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              FORTE MUKDAHAN (ASP.NET/IIS)                   │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │  /account/   │   │  /product/   │   │  /product_   │  │
│  │  login.aspx  │   │  product.    │   │  table.aspx  │  │
│  └──────────────┘   │  aspx        │   └──────────────┘  │
│                     └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Data Extraction Flow (ขั้นตอนการดึงข้อมูล)

### Phase A: Authentication (Login)
```
1. GET https://forte2014mukdahan.ddns.net/pages/account/login.aspx
   → ดึง __VIEWSTATE, __EVENTVALIDATION (ถ้ามี)

2. POST https://forte2014mukdahan.ddns.net/pages/account/login.aspx
   Content-Type: application/x-www-form-urlencoded
   Body:
     - txtUsername=MK25-0264
     - txtPassword=MK25-0264
     - __VIEWSTATE={viewstate}
     - __EVENTVALIDATION={eventvalidation}
     - btnLogin=Login

3. เก็บ ASP.NET_SessionId Cookie ไว้ใช้ตลอด session
```

### Phase B: Product Listing Fetch
```
4. GET https://forte2014mukdahan.ddns.net/pages/product/product.aspx
   Headers: Cookie: ASP.NET_SessionId={sessionId}
   → HTML หน้าสินค้า (Card View)

5. GET https://forte2014mukdahan.ddns.net/pages/product/product_table.aspx
   Headers: Cookie: ASP.NET_SessionId={sessionId}
   → HTML หน้าสินค้า (Table View - เร็วกว่า)

6. ถ้ามี pagination (page 2, 3, ...):
   GET .../product.aspx?page=2
   GET .../product.aspx?page=3
```

### Phase C: HTML Parsing
```
7. Parse HTML ด้วย DOMParser หรือ Regex:
   - ชื่อสินค้า (TH)
   - Generic name (ในวงเล็บ)
   - ราคา (cost price)
   - บริษัท/ผู้ผลิต
   - หมวดหมู่
   - Barcode (ถ้ามี)
   - รูปภาพ URL (ถ้ามี)

8. แปลงเป็น JSON structure:
   {
     "forteProductId": "F-12345",
     "nameTh": "พาราเซตามอล 500 มก.",
     "genericNameTh": "พาราเซตามอล",
     "company": "Siam Pharma",
     "costPrice": 7.25,
     "category": "ยาสามัญ",
     "barcode": "8851234567890",
     "imageUrl": "...",
     "stockStatus": "in_stock"
   }
```

### Phase D: Margin Calculation
```
9. อ่าน marginSettings จาก localStorage:
   {
     "defaultMargin": 15,        // % ทั่วไป
     "categoryMargins": {
       "ยาสามัญ": 10,
       "ยาอันตราย": 12,
       "วิตามิน": 20
     },
     "productMargins": {
       "F-12345": 18            // override เฉพาะรายการ
     }
   }

10. คำนวณราคาขาย:
    sellingPrice = costPrice × (1 + marginPercent / 100)
    
    ตัวอย่าง:
    - costPrice = 7.25
    - margin = 15%
    - sellingPrice = 7.25 × 1.15 = 8.3375 → ปัดเป็น 8.50 หรือ 9.00
```

### Phase E: Data Storage
```
11. บันทึกลง localStorage key: "pharmacare_forte_products"
    {
      "lastSync": "2025-06-28T14:30:00Z",
      "syncIntervalMinutes": 60,
      "totalProducts": 1250,
      "products": [...]
    }

12. อัปเดต ProductContext ให้ใช้ข้อมูลจาก Forte แทน mock data
```

---

## 4. Evasion Techniques (วิธีหลบหลีกการตรวจจับ)

### 4.1 Request Behavior
| มาตรการ | รายละเอียด |
|---------|------------|
| **Rate Limiting** | ดีเลย์ 2-5 วินาทีระหว่าง request ไม่ติดต่อกัน |
| **Random Delay** | ใช้ jitter ±30% เพื่อไม่ให้ pattern ตายตัว |
| **Session Reuse** | เก็บ session cookie ไว้นานที่สุด ไม่ login บ่อย |
| **Single Session** | ไม่เปิดหลาย session พร้อมกัน |

### 4.2 HTTP Headers
```typescript
const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "th,en-US;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Referer": "https://forte2014mukdahan.ddns.net/pages/home/home.aspx",
  // ไม่ส่ง headers ที่บอกว่าเป็น bot (เช่น X-Requested-With)
};
```

### 4.3 Error Handling & Recovery
```typescript
// ถ้า session หมดอายุ (redirect ไปหน้า login)
if (response.url.includes("login.aspx")) {
  // 1. Re-login อัตโนมัติ
  // 2. Retry request เดิม 1 ครั้ง
  // 3. ถ้ายัง fail → แจ้งเตือนผู้ใช้
}

// ถ้าได้ 403 Forbidden
if (response.status === 403) {
  // 1. หยุด sync ทันที
  // 2. รอ 1 ชั่วโมงก่อนลองใหม่
  // 3. แจ้งเตือนว่าอาจถูกบล็อก
}

// ถ้าได้ 500 Server Error
if (response.status === 500) {
  // 1. ใช้ข้อมูลเก่าจาก localStorage
  // 2. ลองใหม่ในรอบถัดไป
}
```

### 4.4 Timing Pattern
```
รอบที่ 1: 08:00 (sync)
รอบที่ 2: 09:05 (+5 นาที jitter)
รอบที่ 3: 10:02 (+2 นาที jitter)
รอบที่ 4: 11:08 (+8 นาที jitter)
รอบที่ 5: 12:01 (+1 นาที jitter)

→ ไม่ตายตัวทุกๆ 60 นาทีพอดี ป้องกัน pattern recognition
```

---

## 5. Margin Manager Specification

### 5.1 UI Layout
```
┌──────────────────────────────────────────────────┐
│  Margin Manager — จัดการราคากำไร                 │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │  [ดึงข้อมูลจาก Forte]  [Sync ล่าสุด: ...]  │  │
│  │  สถานะ: ✅ ออนไลน์  | สินค้า: 1,250 รายการ │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ กำไรทั่ว │  │ กำไรตาม │  │ กำไรตาม │       │
│  │ ไป (15%) │  │ หมวดหมู่│  │ รายการ  │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │ หมวดหมู่        ราคาทุนเฉลี่ย   % กำไร    │  │
│  │ ─────────────────────────────────────────   │  │
│  │ ยาสามัญ        ฿12.50        [  10 ]%    │  │
│  │ ยาอันตราย      ฿45.00        [  12 ]%    │  │
│  │ วิตามิน         ฿85.00        [  20 ]%    │  │
│  │ อุปกรณ์การแพทย์ ฿350.00       [  15 ]%    │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  [เลือกทั้งหมด]  [กำหนดกำไร ___%]  [บันทึก]    │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │ รายการสินค้า (ตาราง)                       │  │
│  │ ชื่อยา | Generic | ราคาทุน | % กำไร | ราคาขาย│  │
│  │ ...                                         │  │
│  └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 5.2 Data Model
```typescript
interface MarginSettings {
  defaultMargin: number;           // % ทั่วไป (default 15%)
  categoryMargins: {               // % ตามหมวดหมู่
    [categoryName: string]: number;
  };
  productMargins: {                // % override ตามรายการ
    [productId: string]: number;
  };
  roundTo: "0.5" | "1" | "5" | "10"; // ปัดเศษราคา
}

interface ForteProduct {
  id: string;
  nameTh: string;
  genericNameTh?: string;
  company: string;
  category: string;
  costPrice: number;    // ราคาทุนจาก Forte
  barcode?: string;
  imageUrl?: string;
  stockStatus: string;
  // calculated
  marginPercent: number;
  sellingPrice: number;
}
```

### 5.3 Bulk Operations
```typescript
// กำหนดกำไรทีเดียวหลายรายการ
function setBulkMargin(productIds: string[], margin: number): void;

// กำหนดกำไรตามหมวดหมู่
function setCategoryMargin(category: string, margin: number): void;

// คำนวณราคาขายทั้งหมดใหม่
function recalculateAllPrices(settings: MarginSettings): void;
```

---

## 6. Auto-Sync Scheduler

### 6.1 การทำงาน
```typescript
class ForteSyncScheduler {
  private intervalMs: number = 60 * 60 * 1000; // 1 ชั่วโมง
  private jitterPercent: number = 10; // ±10%
  private timer: number | null = null;

  start() {
    this.scheduleNext();
  }

  private scheduleNext() {
    const jitter = this.intervalMs * (this.jitterPercent / 100);
    const delay = this.intervalMs + (Math.random() * 2 - 1) * jitter;
    this.timer = window.setTimeout(() => {
      this.sync();
      this.scheduleNext();
    }, delay);
  }

  private async sync() {
    // 1. ตรวจสอบ session ยังใช้ได้ไหม
    // 2. ถ้าไม่ได้ → re-login
    // 3. ดึงข้อมูลสินค้า
    // 4. Parse + คำนวณราคา
    // 5. บันทึกลง localStorage
    // 6. อัปเดต ProductContext
    // 7. แจ้งเตือนผู้ใช้ (ถ้ามีสินค้าใหม่หรือราคาเปลี่ยน)
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
  }
}
```

### 6.2 Manual Sync
- ปุ่ม "ดึงข้อมูลทันที" ใน Margin Manager
- ใช้ได้ตลอดเวลา (ไม่ต้องรอ scheduler)

---

## 7. Data Mapping Table

| Forte Field | PharmaCare Field | หมายเหตุ |
|-------------|------------------|----------|
| ชื่อสินค้า (TH) | `nameTh` | Parse จาก HTML |
| ชื่อ Generic (ในวงเล็บ) | `genericNameTh` | Parse จาก HTML |
| ราคา | `costPrice` | ใช้เป็นราคาทุน |
| บริษัท/ผู้ผลิต | `company` | Map ไป category |
| บาร์โค้ด | `barcode` | ถ้ามี |
| รูปภาพ | `imageUrl` | ถ้ามี |
| หมวดหมู่ | `category` | Map ตาม rules |

---

## 8. Risk Assessment

| ความเสี่ยง | ระดับ | มาตรการรองรับ |
|------------|-------|--------------|
| Forte บล็อก IP | ปานกลาง | Rate limiting + random delay + ใช้ข้อมูล localStorage fallback |
| Session หมดอายุเร็ว | ต่ำ | Auto re-login mechanism |
| โครงสร้าง HTML เปลี่ยน | ปานกลาง | แจ้งเตือนเมื่อ parse ไม่ได้ + ใช้ข้อมูลเก่า |
| ผิด Terms of Service | สูง | มีระบบ pause/stop ได้ตลอด + fallback ใช้ข้อมูล manual |
| ข้อมูลไม่ตรง | ต่ำ | แสดง "ข้อมูลล่าสุด: HH:MM" ให้ผู้ใช้รู้ว่า sync ตอนไหน |

---

## 9. Fallback Plan (แผนสำรอง)

### ถ้า Forte บล็อกหรือปิดระบบ:
1. **ใช้ข้อมูลล่าสุด** จาก localStorage (อาจเก่าแต่ยังใช้ได้)
2. **ระบบ Import CSV** คุณ download จาก Forte แล้ว import เอง
3. **ระบบกรอกสินค้าด้วยมือ** (ที่มีอยู่แล้วใน ProductFormModal)

---

## 10. Implementation Timeline

| ขั้นตอน | ระยะเวลา | ลำดับ |
|---------|----------|-------|
| 10.1 สร้าง `ForteSyncService.ts` | 2 ชั่วโมง | 1 |
| 10.2 สร้าง `MarginManager.tsx` (UI) | 3 ชั่วโมง | 2 |
| 10.3 สร้าง `AutoSyncScheduler.ts` | 1 ชั่วโมง | 3 |
| 10.4 ผสานเข้า SellerDashboard | 1 ชั่วโมง | 4 |
| 10.5 ทดสอบ + Debug | 2 ชั่วโมง | 5 |
| 10.6 Build + Deploy | 30 นาที | 6 |
| **รวม** | **~10 ชั่วโมง** | |

---

## 11. คำถามก่อนเริ่ม implement

1. **คุณยืนยันว่าเข้าใจความเสี่ยงและยังต้องการทำต่อ?**
2. **% กำไรเริ่มต้นคุณอยากให้เป็นเท่าไหร่?** (15%?)
3. **คุณต้องการให้ปัดเศษราคาอย่างไร?** (เช่น 8.33 → 8.50 หรือ 9.00?)
4. **ถ้า Forte มีสินค้าใหม่ที่ไม่มีใน PharmaCare ต้องการให้เพิ่มเข้าระบบอัตโนมัติ หรือต้องรอคุณอนุมัติก่อน?**

ตอบมาแล้วผมเริ่ม implement ทันทีครับ
