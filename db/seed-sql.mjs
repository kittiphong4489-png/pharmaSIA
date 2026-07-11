import { createClient } from "@libsql/client";

const db = createClient({ url: "file:/mnt/agents/output/app/pharmacare.db" });

async function seed() {
  await db.execute("DELETE FROM products");
  await db.execute("DELETE FROM categories");
  await db.execute("DELETE FROM users");

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

  console.log(`✅ Seeded ${products.length} products with correct prices!`);
}

seed().then(() => process.exit(0)).catch((e) => { console.error("❌", e); process.exit(1); });
