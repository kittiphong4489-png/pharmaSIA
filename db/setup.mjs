/**
 * Setup database directly (no drizzle-kit needed)
 */
import { createClient } from "@libsql/client";

const db = createClient({ url: "file:/tmp/pharmacare.db" });

async function setup() {
  console.log("📦 Setting up database...\n");

  // Users
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'customer',
    tier TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    verification_status TEXT NOT NULL DEFAULT 'NONE',
    license_document_url TEXT,
    line_id TEXT,
    discount_rate REAL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )`);

  // Categories
  await db.execute(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_th TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description_th TEXT,
    description_en TEXT,
    slug TEXT NOT NULL UNIQUE,
    parent_id INTEGER,
    icon TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    product_count INTEGER DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch())
  )`);

  // Products
  await db.execute(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    name_th TEXT NOT NULL,
    name_en TEXT NOT NULL,
    short_description_th TEXT,
    short_description_en TEXT,
    description_th TEXT,
    description_en TEXT,
    usage_th TEXT,
    usage_en TEXT,
    ingredients_th TEXT,
    ingredients_en TEXT,
    warnings_th TEXT,
    warnings_en TEXT,
    prices_json TEXT NOT NULL DEFAULT '{"individual":0,"retail":0,"clinic":0}',
    price REAL NOT NULL DEFAULT 0,
    original_price REAL,
    stock INTEGER NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'piece',
    image TEXT,
    visible_to_json TEXT NOT NULL DEFAULT '["INDIVIDUAL","RETAIL","CLINIC"]',
    category_id INTEGER NOT NULL,
    is_featured INTEGER DEFAULT 0,
    is_new INTEGER DEFAULT 0,
    requires_prescription INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    rating REAL DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    sold_count INTEGER DEFAULT 0,
    weight_grams INTEGER DEFAULT 0,
    expiry_date INTEGER,
    batch_number TEXT,
    legal_category TEXT NOT NULL DEFAULT 'HOUSEHOLD_REMEDY',
    generic_name_th TEXT,
    generic_name_en TEXT,
    barcode TEXT,
    seller_id INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )`);

  // Orders
  await db.execute(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    shipping_address_json TEXT,
    customer_id INTEGER,
    customer_tier TEXT DEFAULT 'INDIVIDUAL',
    subtotal REAL NOT NULL DEFAULT 0,
    total_discount REAL DEFAULT 0,
    shipping_fee REAL DEFAULT 0,
    grand_total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    pharmacist_id INTEGER,
    pharmacist_name TEXT,
    prescription_ref TEXT,
    source TEXT NOT NULL DEFAULT 'web',
    notes TEXT,
    ordered_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )`);

  // Order Items
  await db.execute(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name_th TEXT NOT NULL,
    product_name_en TEXT NOT NULL,
    product_image TEXT,
    product_sku TEXT,
    product_unit TEXT,
    unit_price REAL NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    subtotal REAL NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  )`);

  // Cart Items
  await db.execute(`CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    session_id TEXT,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL DEFAULT 0,
    product_name TEXT,
    product_image TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  )`);

  console.log("✅ Tables created!");

  // Seed data
  await db.execute(`DELETE FROM products`);
  await db.execute(`DELETE FROM categories`);
  await db.execute(`DELETE FROM users`);

  await db.execute(`
    INSERT INTO users (full_name, email, phone, role, tier, verification_status, is_active)
    VALUES 
      ('เภสัชกร แอดมิน', 'admin@pharmacare.th', '081-234-5678', 'admin', 'INDIVIDUAL', 'APPROVED', 1),
      ('สมชาย ใจดี', 'somchai@email.com', '089-876-5432', 'customer', 'INDIVIDUAL', 'NONE', 1),
      ('ร้านขายยา ใจการุณย์', 'retail@pharmacy.co.th', '02-123-4567', 'customer', 'RETAIL', 'PENDING', 1),
      ('คลินิกสมุนไพร วัลย์ลิกา', 'clinic@wanlika.co.th', '02-987-6543', 'customer', 'CLINIC', 'APPROVED', 1)
  `);

  await db.execute(`
    INSERT INTO categories (name_th, name_en, slug, icon, color, sort_order, is_active)
    VALUES 
      ('ยารักษาโรค', 'Medicines', 'medicines', 'pill', '#ef4444', 1, 1),
      ('วิตามินและอาหารเสริม', 'Vitamins', 'vitamins', 'heart', '#22c55e', 2, 1),
      ('อุปกรณ์การแพทย์', 'Medical Devices', 'medical-devices', 'stethoscope', '#3b82f6', 3, 1)
  `);

  const cats = await db.execute("SELECT id FROM categories ORDER BY id");
  const [med, vit, dev] = cats.rows.map(r => r.id);

  const products = [
    { sku: "PARA-500", nameTh: "พาราเซตามอล 500 มก.", nameEn: "Paracetamol 500mg", desc: "ยาบรรเทาปวด ลดไข้", price: 45, orig: 55, stock: 500, unit: "box", img: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400", cat: med, feat: 1, rx: 0, rate: 4.8, rv: 245, sold: 1200, legal: "HOUSEHOLD_REMEDY", genTh: "พาราเซตามอล", genEn: "Paracetamol", bc: "8851938012345" },
    { sku: "VITC-1000", nameTh: "วิตามินซี 1000 มก.", nameEn: "Vitamin C 1000mg", desc: "วิตามินซีบำรุงภูมิคุ้มกัน", price: 120, orig: 150, stock: 300, unit: "bottle", img: "https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=400", cat: vit, feat: 1, rx: 0, rate: 4.6, rv: 189, sold: 850, legal: "SUPPLEMENT", genTh: "แอสคอร์บิกแอซิด", genEn: "Ascorbic Acid", bc: "8857208012345" },
    { sku: "AMOX-500", nameTh: "อะม็อกซิซิลลิน 500 มก.", nameEn: "Amoxicillin 500mg", desc: "ยาปฏิชีวนะ (ต้องใช้ใบสั่งยา)", price: 85, orig: 100, stock: 200, unit: "capsule", img: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400", cat: med, feat: 0, rx: 1, rate: 4.9, rv: 78, sold: 420, legal: "DANGEROUS_DRUG", genTh: "อะม็อกซิซิลลิน", genEn: "Amoxicillin", bc: "8850999001234" },
    { sku: "IBUP-400", nameTh: "ไอบูโพรเฟน 400 มก.", nameEn: "Ibuprofen 400mg", desc: "ยาต้านการอักเสบ บรรเทาปวด", price: 35, orig: 42, stock: 400, unit: "tablet", img: "https://images.unsplash.com/photo-1628771065518-0d82f1938462?w=400", cat: med, feat: 0, rx: 0, rate: 4.5, rv: 156, sold: 680, legal: "DANGEROUS_DRUG", genTh: "ไอบูโพรเฟน", genEn: "Ibuprofen", bc: "8850366012345" },
    { sku: "THERM-DIG", nameTh: "เทอร์โมมิเตอร์ดิจิตอล", nameEn: "Digital Thermometer", desc: "วัดอุณหภูมิร่างกาย", price: 195, orig: 250, stock: 150, unit: "piece", img: "https://images.unsplash.com/photo-1583947581924-860bda6a26df?w=400", cat: dev, feat: 1, rx: 0, rate: 4.7, rv: 203, sold: 560, legal: "HOUSEHOLD_REMEDY", genTh: "เทอร์โมมิเตอร์ดิจิตอล", genEn: "Digital Thermometer", bc: "8850999012345" },
    { sku: "MASK-3PLY", nameTh: "หน้ากากอนามัย 3 ชั้น (50 ชิ้น)", nameEn: "3-Ply Mask (50pcs)", desc: "หน้ากากอนามัย 3 ชั้น", price: 89, orig: 120, stock: 1000, unit: "pack", img: "https://images.unsplash.com/photo-1584634731339-252c581abfc5?w=400", cat: dev, feat: 0, rx: 0, rate: 4.4, rv: 312, sold: 2100, legal: "HOUSEHOLD_REMEDY", genTh: "หน้ากากอนามัย", genEn: "Surgical Mask", bc: "8850366123456" },
  ];

  for (const p of products) {
    const prices = JSON.stringify({ individual: p.price, retail: Math.round(p.price * 0.9), clinic: Math.round(p.price * 0.85) });
    await db.execute({
      sql: `INSERT INTO products (sku, name_th, name_en, short_description_th, prices_json, price, original_price, stock, unit, image, visible_to_json, category_id, is_featured, requires_prescription, status, rating, review_count, sold_count, legal_category, generic_name_th, generic_name_en, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [p.sku, p.nameTh, p.nameEn, p.desc, prices, p.price, p.orig, p.stock, p.unit, p.img, '["INDIVIDUAL","RETAIL","CLINIC"]', p.cat, p.feat, p.rx, 'active', p.rate, p.rv, p.sold, p.legal, p.genTh, p.genEn, p.bc],
    });
  }

  // Seed orders
  await db.execute(`
    INSERT INTO orders (order_number, customer_name, customer_phone, customer_tier, subtotal, grand_total, status, source)
    VALUES 
      ('ORD-20241201-001', 'สมชาย ใจดี', '089-876-5432', 'INDIVIDUAL', 285, 285, 'completed', 'web'),
      ('ORD-20241201-002', 'ร้านขายยา ใจการุณย์', '02-123-4567', 'RETAIL', 1560, 1560, 'confirmed', 'b2b'),
      ('ORD-20241202-001', 'คลินิกสมุนไพร วัลย์ลิกา', '02-987-6543', 'CLINIC', 2345, 2345, 'processing', 'b2b'),
      ('ORD-20241202-002', 'นางสาวสมหญิง รักษ์สุข', '081-111-2222', 'INDIVIDUAL', 89, 89, 'pending', 'web')
  `);

  // Seed order items
  const ord = await db.execute("SELECT id FROM orders ORDER BY id");
  const [o1, o2, o3, o4] = ord.rows.map(r => r.id);
  
  await db.execute(`
    INSERT INTO order_items (order_id, product_id, product_name_th, product_name_en, unit_price, quantity, subtotal)
    VALUES 
      (${o1}, 1, 'พาราเซตามอล 500 มก.', 'Paracetamol 500mg', 45, 3, 135),
      (${o1}, 4, 'ไอบูโพรเฟน 400 มก.', 'Ibuprofen 400mg', 35, 2, 70),
      (${o1}, 5, 'เทอร์โมมิเตอร์ดิจิตอล', 'Digital Thermometer', 195, 1, 195),
      (${o2}, 2, 'วิตามินซี 1000 มก.', 'Vitamin C 1000mg', 120, 8, 960),
      (${o2}, 6, 'หน้ากากอนามัย 3 ชั้น (50 ชิ้น)', '3-Ply Mask (50pcs)', 89, 5, 445),
      (${o3}, 3, 'อะม็อกซิซิลลิน 500 มก.', 'Amoxicillin 500mg', 85, 20, 1700),
      (${o3}, 2, 'วิตามินซี 1000 มก.', 'Vitamin C 1000mg', 120, 5, 600),
      (${o4}, 6, 'หน้ากากอนามัย 3 ชั้น (50 ชิ้น)', '3-Ply Mask (50pcs)', 89, 1, 89)
  `);

  console.log(`✅ Seeded ${products.length} products + 4 orders!`);
  
  // Verify
  const check = await db.execute("SELECT name_th, price FROM products ORDER BY id");
  console.log("\n📊 Products:");
  for (const row of check.rows) {
    console.log(`  - ${row.name_th}: ฿${row.price}`);
  }
}

setup().then(() => process.exit(0)).catch((e) => { console.error("❌", e.message); process.exit(1); });
