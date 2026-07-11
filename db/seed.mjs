/**
 * Seed script (ESM)
 */
import { getDb } from "../api/queries/connection.js";
import { users, categories, products } from "./schema.ts";

async function seed() {
  console.log("🌱 Seeding...\n");
  const db = getDb();

  try {
    await db.delete(products);
    await db.delete(categories);
    await db.delete(users);
  } catch { /* ignore */ }

  await db.insert(users).values([
    { fullName: "เภสัชกร แอดมิน", email: "admin@pharmacare.th", phone: "081-234-5678", role: "admin", tier: "INDIVIDUAL", verificationStatus: "APPROVED" },
    { fullName: "สมชาย ใจดี", email: "somchai@email.com", phone: "089-876-5432", role: "customer", tier: "INDIVIDUAL", verificationStatus: "NONE" },
  ]);

  await db.insert(categories).values([
    { nameTh: "ยารักษาโรค", nameEn: "Medicines", slug: "medicines", icon: "pill", color: "#ef4444", sortOrder: 1 },
    { nameTh: "วิตามินและอาหารเสริม", nameEn: "Vitamins", slug: "vitamins", icon: "heart", color: "#22c55e", sortOrder: 2 },
    { nameTh: "อุปกรณ์การแพทย์", nameEn: "Medical Devices", slug: "medical-devices", icon: "stethoscope", color: "#3b82f6", sortOrder: 3 },
  ]);

  const cats = await db.select().from(categories);
  const medId = cats[0].id;
  const vitId = cats[1].id;
  const devId = cats[2].id;

  await db.insert(products).values([
    { sku: "PARA-500", nameTh: "พาราเซตามอล 500 มก.", nameEn: "Paracetamol 500mg", shortDescriptionTh: "ยาบรรเทาปวด ลดไข้", price: 45, originalPrice: 55, stock: 500, unit: "box", image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400", visibleToJson: '["INDIVIDUAL","RETAIL","CLINIC"]', categoryId: medId, isFeatured: true, status: "active", rating: 4.8, reviewCount: 245, soldCount: 1200, legalCategory: "HOUSEHOLD_REMEDY", genericNameTh: "พาราเซตามอล", genericNameEn: "Paracetamol", barcode: "8851938012345" },
    { sku: "VITC-1000", nameTh: "วิตามินซี 1000 มก.", nameEn: "Vitamin C 1000mg", shortDescriptionTh: "วิตามินซีบำรุงภูมิคุ้มกัน", price: 120, originalPrice: 150, stock: 300, unit: "bottle", image: "https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=400", visibleToJson: '["INDIVIDUAL","RETAIL","CLINIC"]', categoryId: vitId, isFeatured: true, isNew: true, status: "active", rating: 4.6, reviewCount: 189, soldCount: 850, legalCategory: "SUPPLEMENT", genericNameTh: "แอสคอร์บิกแอซิด", genericNameEn: "Ascorbic Acid", barcode: "8857208012345" },
    { sku: "AMOX-500", nameTh: "อะม็อกซิซิลลิน 500 มก.", nameEn: "Amoxicillin 500mg", shortDescriptionTh: "ยาปฏิชีวนะ (ต้องใช้ใบสั่งยา)", price: 85, originalPrice: 100, stock: 200, unit: "capsule", image: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400", visibleToJson: '["INDIVIDUAL","CLINIC"]', categoryId: medId, requiresPrescription: true, status: "active", rating: 4.9, reviewCount: 78, soldCount: 420, legalCategory: "DANGEROUS_DRUG", genericNameTh: "อะม็อกซิซิลลิน", genericNameEn: "Amoxicillin", barcode: "8850999001234" },
    { sku: "IBUP-400", nameTh: "ไอบูโพรเฟน 400 มก.", nameEn: "Ibuprofen 400mg", shortDescriptionTh: "ยาต้านการอักเสบ บรรเทาปวด", price: 35, originalPrice: 42, stock: 400, unit: "tablet", image: "https://images.unsplash.com/photo-1628771065518-0d82f1938462?w=400", visibleToJson: '["INDIVIDUAL","RETAIL","CLINIC"]', categoryId: medId, isNew: true, status: "active", rating: 4.5, reviewCount: 156, soldCount: 680, legalCategory: "DANGEROUS_DRUG", genericNameTh: "ไอบูโพรเฟน", genericNameEn: "Ibuprofen", barcode: "8850366012345" },
    { sku: "THERM-DIG", nameTh: "เทอร์โมมิเตอร์ดิจิตอล", nameEn: "Digital Thermometer", shortDescriptionTh: "วัดอุณหภูมิร่างกาย", price: 195, originalPrice: 250, stock: 150, unit: "piece", image: "https://images.unsplash.com/photo-1583947581924-860bda6a26df?w=400", visibleToJson: '["INDIVIDUAL","RETAIL","CLINIC"]', categoryId: devId, isFeatured: true, status: "active", rating: 4.7, reviewCount: 203, soldCount: 560, legalCategory: "HOUSEHOLD_REMEDY", genericNameTh: "เทอร์โมมิเตอร์ดิจิตอล", genericNameEn: "Digital Thermometer", barcode: "8850999012345" },
    { sku: "MASK-3PLY", nameTh: "หน้ากากอนามัย 3 ชั้น (50 ชิ้น)", nameEn: "3-Ply Mask (50pcs)", shortDescriptionTh: "หน้ากากอนามัย 3 ชั้น", price: 89, originalPrice: 120, stock: 1000, unit: "pack", image: "https://images.unsplash.com/photo-1584634731339-252c581abfc5?w=400", visibleToJson: '["INDIVIDUAL","RETAIL","CLINIC"]', categoryId: devId, isNew: true, status: "active", rating: 4.4, reviewCount: 312, soldCount: 2100, legalCategory: "HOUSEHOLD_REMEDY", genericNameTh: "หน้ากากอนามัย", genericNameEn: "Surgical Mask", barcode: "8850366123456" },
  ]);

  console.log("✅ Seeded!");
  process.exit(0);
}

seed().catch((e) => { console.error("❌", e); process.exit(1); });
