/**
 * api/lib/categoryMapping.ts — ระบบจัดหมวดหมู่สินค้า 10 หมวด
 *
 * แม็ป Forte category names → 10 categories ตามกฎใน PharmaCare_Category_Mapping.md
 */

// ── 10 หมวดหมู่หลัก ──
export interface CategoryDef {
  id: number;
  nameTh: string;
  nameEn: string;
  slug: string;
  icon: string;
  color: string;
  sortOrder: number;
}

export const ALL_CATEGORIES: CategoryDef[] = [
  { id: 1,  nameTh: 'ยา',                    nameEn: 'Medicine',                  slug: 'ยา',                    icon: '💊', color: 'blue',       sortOrder: 1 },
  { id: 2,  nameTh: 'ยาแผนโบราณ/สมุนไพร',   nameEn: 'Herbal Medicine',           slug: 'สมุนไพร',               icon: '🌿', color: 'green',      sortOrder: 2 },
  { id: 3,  nameTh: 'อาหารเสริม/วิตามิน',     nameEn: 'Supplements & Vitamins',    slug: 'อาหารเสริม',             icon: '✨', color: 'amber',      sortOrder: 3 },
  { id: 4,  nameTh: 'เวชสำอาง',              nameEn: 'Cosmeceuticals',            slug: 'เวชสำอาง',              icon: '🧴', color: 'pink',       sortOrder: 4 },
  { id: 5,  nameTh: 'เวชภัณฑ์/อุปกรณ์การแพทย์', nameEn: 'Medical Supplies',        slug: 'เวชภัณฑ์',               icon: '🩺', color: 'teal',       sortOrder: 5 },
  { id: 6,  nameTh: 'แม่และเด็ก',            nameEn: 'Mother & Baby',             slug: 'แม่และเด็ก',             icon: '👶', color: 'purple',     sortOrder: 6 },
  { id: 7,  nameTh: 'ของใช้ทั่วไป',           nameEn: 'General Products',          slug: 'ของใช้ทั่วไป',           icon: '🧹', color: 'slate',      sortOrder: 7 },
  { id: 8,  nameTh: 'เครื่องดื่ม/อาหาร',      nameEn: 'Beverages & Food',          slug: 'เครื่องดื่ม',             icon: '☕', color: 'orange',     sortOrder: 8 },
  { id: 9,  nameTh: 'สัตว์เลี้ยง',            nameEn: 'Pet Products',              slug: 'สัตว์เลี้ยง',            icon: '🐾', color: 'yellow',     sortOrder: 9 },
  { id: 10, nameTh: 'อื่นๆ/รอจัด',            nameEn: 'Other / Unclassified',      slug: 'อื่นๆ',                  icon: '📦', color: 'gray',       sortOrder: 99 },
];

// ── Forte category name → category ID mapping ──
//
// แต่ละ Forte category name map ไปหมวดใด
const FORTE_CATEGORY_MAP: Record<string, number> = {
  // 1. ยา
  'ยาแก้ปวด ลดไข้ ยาคลายกล้ามเนื้อ': 1,
  'ยาระบบทางเดินหายใจ': 1,
  'ยาระบบทางเดินอาหาร': 1,
  'ยาฆ่าเขื้อแบคทีเรีย เชื้อรา ไวรัส': 1,
  'ยาโรคเรื้อรัง หัวใจ ความดัน': 1,
  'ยาอม ทุกชนิด': 1,
  'ยาคุมกำเนิด ยาฮอร์โมน': 1,
  'ยาตา ยาหู': 1,
  'ยาองค์การเภสัชกรรม': 1,
  'ยาถ่ายพยาธิ': 1,
  'ยาฆ่าเชื้อภายนอก ยาล้างแผล': 1,

  // 2. ยาแผนโบราณ/สมุนไพร
  'Herbs (สมุนไพร)': 2,

  // 3. อาหารเสริม/วิตามิน
  'วิตามิน เกลือแร่ ผลิตภัณฑ์เสริมอาหาร': 3,
  'อาหารทางการแพทย์': 3,
  'Nutrition/Food/Vitamins': 3,

  // 4. เวชสำอาง
  'เวชสำอางค์': 4,
  'Skin (ผิว, ผม, เล็บ)': 4,

  // 5. เวชภัณฑ์/อุปกรณ์การแพทย์
  'วัสดุทางการแพทย์': 5,
  'Med supply; เครื่องมือ อุปกรณ์ เวชภัณฑ์ทางการแพทย์': 5,

  // 6. แม่และเด็ก
  'นมเด็ก นมผู้ใหญ่': 6,
  'ของใช้คุณแม่และเด็ก': 6,
  'ผ้าอ้อมเด็ก ผ้าอ้อมผู้ใหญ่': 6,
  'Baby; Child; สินค้าสำหรับเด็ก': 6,
  // Note: the mapping doc has 'ฺBaby; Child; สินค้าสำหรับเด็ก' with a leading
  // combining character (พินทุ) — matches are done via normalize+trim below

  // 7. ของใช้ทั่วไป
  'ของใช้ส่วนตัว สินค้าช่องปาก สบู่ โรลออน อื่นๆ': 7,
  'สินค้า+อุปกรณ์ซักล้าง': 7,
  'Consumers; สินค้าอุปโภค': 7,

  // 8. เครื่องดื่ม/อาหาร
  'กาแฟ ชา': 8,

  // 9. สัตว์เลี้ยง
  'ยาสัตว์': 9,

  // 10. อื่นๆ/รอจัด
  'สินค้ายังไม่จัดหมวด': 10,
  '': 10,
};

// ── Keyword-based fallback for products that don't have a Forte category ──
//
// ใช้เมื่อ product.nameTh/categnam ไม่ตรงกับ mapping ข้างบน
const KEYWORD_RULES: Array<{ keywords: RegExp[]; categoryId: number }> = [
  // 1. ยา — generic drug keywords
  { keywords: [/paracetamol/i, /พาราเซตามอล/, /ibuprofen/i, /ไอบูโพรเฟน/,
    /loratadine/i, /cetirizine/i, /chlorpheniramine/i, /omeprazole/i,
    /amoxicillin/i, /aspirin/i, /แอสไพริน/, /metformin/i,
    /ยาเม็ด/, /แคปซูล/, /น้ำเชื่อม/, /ยาน้ำ/, /แกรนูล/, /suspension/,
    /tablet/, /capsule/, /ยาหยอด/, /ยาปฏิชีวนะ/, /ยาฆ่าเชื้อ/,
    /ยาลดไข้/, /ยาแก้ปวด/, /ยาแก้/, /ยารักษา/, /ยาทา/, /ยาคุม/,
    /ยาอม/, /ยาหม่อง/, /พลาสเตอร์ยา/, /salonpas/, /ยาใส่/, /ยาสอด/,
    /ยาพ่น/, /ยาเหน็บ/, /ยาใช้ภายนอก/, /ยาฉีด/,
    /antacid/, /gaviscon/, /smecta/, /oralite/],
    categoryId: 1 },

  // 2. ยาแผนโบราณ/สมุนไพร
  { keywords: [/สมุนไพร/, /ฟ้าทะลาย/, /กระชาย/, /ขมิ้น/, /มะขาม/, /บัวบก/,
    /มังคุด/, /สมอ/, /ยาสมุนไพร/, /ยาหอม/, /ยาไทย/, /ยาจีน/,
    /herb/i, /herbal/i, /ตำรับ/, /ลูกกลอน/, /ยาลูกกลอน/,
    /น้ำมันไพล/, /ไพล/, /ประคบ/, /อบ/],
    categoryId: 2 },

  // 3. อาหารเสริม/วิตามิน
  { keywords: [/vitamin/i, /วิตามิน/, /supplement/i, /อาหารเสริม/,
    /แคลเซียม/, /calcium/i, /iron/i, /ธาตุเหล็ก/, /แมกนีเซียม/,
    /magnesium/i, /zinc/i, /สังกะสี/, /collagen/i, /คอลลาเจน/,
    /protein/i, /โปรตีน/, /โปรตีน/, /fish oil/i, /น้ำมันปลา/,
    /omega/i, /โอเมก้า/, /probiotic/i, /โพรไบโอติก/, /prebiotic/,
    /glutathione/i, /กลูต้า/, /coenzyme/i, /โคคิวเท็น/, /q10/i,
    /ใยอาหาร/, /fiber/i, /สารสกัด/, /สกัดจาก/,
    /nutrition/i, /nutri/],
    categoryId: 3 },

  // 4. เวชสำอาง
  { keywords: [/ครีม/, /โลชั่น/, /lotion/i, /shampoo/i, /แชมพู/,
    /สบู่/, /soap/i, /skin/i, /ผิว/, /ผม/, /เล็บ/,
    /sunscreen/i, /กันแดด/, /serum/i, /เซรั่ม/, /moisturizer/i,
    /โทนเนอร์/, /toner/i, /เครื่องสำอาง/, /makeup/i, /เมคอัพ/,
    /น้ำหอม/, /perfume/i, /deodorant/i, /ระงับกลิ่น/,
    /face/, /หน้า/, /anti-aging/, /retinol/, /vitamin c/,
    /สเปรย์ฉีดผม/, /เจลแต่งผม/, /ครีมนวด/, /conditioner/],
    categoryId: 4 },

  // 5. เวชภัณฑ์/อุปกรณ์การแพทย์
  { keywords: [/medical/i, /อุปกรณ์/, /เครื่องมือ/, /เวชภัณฑ์/,
    /saline/i, /น้ำเกลือ/, /syringe/i, /เข็มฉีดยา/, /กระบอกฉีด/,
    /ถุงมือ/, /glove/i, /หน้ากาก/, /mask/i, /เทอร์โม/, /thermo/i,
    /พลาสเตอร์/, /bandage/i, /ผ้าพัน/, /gauze/i, /ผ้าก๊อต/,
    /patch/i, /แผ่นแปะ/, /paraceta.../, /เข็ม/, /สาย/,
    /stethoscope/, /pressure/, /วัดความดัน/, /เครื่องวัด/,
    /pulse/, /oximeter/, /ปอดเทียม/, /oxygen/, /ออกซิเจน/,
    /wheelchair/, /walker/, /ไม้เท้า/, /เตียง/, /รถเข็น/,
    /ไม้พัน/, /สำลี/, /cotton/i, /sterile/i, /ปราศจากเชื้อ/,
    /test strip/, /ที่ตรวจ/, /ชุดตรวจ/, /lancet/, /หลอด/],
    categoryId: 5 },

  // 6. แม่และเด็ก
  { keywords: [/baby/i, /เด็ก/, /ทารก/, /นมผง/, /นมเด็ก/, /นมแม่/,
    /ผ้าอ้อม/, /diaper/i, /คุณแม่/, /mama/i, /mom/, /ครรภ์/,
    /เด็กอ่อน/, /ขวดนม/, /จุกนม/, /เบบี้/, /ที่ปั๊ม/, /breast/,
    /เป้อุ้ม/, /kindergarten/, /playpen/, /walker/],
    categoryId: 6 },

  // 7. ของใช้ทั่วไป
  { keywords: [/ยาสีฟัน/, / toothpaste/i, /แปรงสีฟัน/, /toothbrush/i,
    /น้ำยาบ้วน/, /mouthwash/i, /ไหมขัด/, /floss/i,
    /สบู่/, /soap/i, /wash/, /น้ำยาซัก/, /น้ำยาล้าง/, /detergent/i,
    /น้ำยาปรับ/, /softener/i, /น้ำหอมปรับ/, /น้ำยาทำความ/,
    /น้ำยาถู/, /floor cleaner/, /น้ำยาล้างจาน/, /dish/i,
    /กระดาษชำระ/, /toilet paper/, /tissue/i, /towel/i,
    /ถุงขยะ/, /trash bag/, /ถุงมือ/, /glove/i,
    /สเปรย์/, /spray/, /น้ำยา/, /น้ำยาทั่วไป/,
    /battery/i, /ถ่าน/, /หลอดไฟ/, /light bulb/,
    /ของใช้/, /อุปโภค/, /consumers/i],
    categoryId: 7 },

  // 8. เครื่องดื่ม/อาหาร
  { keywords: [/กาแฟ/, /coffee/i, /ชา/, /tea/i, /เครื่องดื่ม/,
    /น้ำดื่ม/, /beverage/i, /น้ำผลไม้/, /juice/i, /นม/, /milk/i,
    /อาหาร/, /food/i, /ขนม/, /snack/i, /บะหมี่/, /instant/i,
    /ซุป/, /soup/i, /เครื่องปรุง/, /调味料/],
    categoryId: 8 },

  // 9. สัตว์เลี้ยง
  { keywords: [/สัตว์/, /pet/, /หมา/, /dog/, /แมว/, /cat/, /สุนัข/,
    /แมว/, /ปลา/, /fish/, /food pet/, /อาหารสัตว์/, /อาหารแมว/,
    /อาหารหมา/, /ทรายแมว/, /cat litter/],
    categoryId: 9 },
];

/**
 * แม็ป Forte category name → ID
 */
export function mapForteCategoryToId(categnam: string | null | undefined): number {
  if (!categnam) return 10; // อื่นๆ/รอจัด

  const cleaned = categnam.trim().normalize('NFC');

  // Direct match
  if (FORTE_CATEGORY_MAP[cleaned] !== undefined) {
    return FORTE_CATEGORY_MAP[cleaned];
  }

  // Try NFC-normalized lookups (handles the 'ฺ' combining character variant)
  // Some Forte entries may have subtle Unicode differences
  for (const [key, id] of Object.entries(FORTE_CATEGORY_MAP)) {
    if (key.normalize('NFC') === cleaned) return id;
  }

  // Partial match — check if the cleaned name contains any known category
  if (cleaned.includes('Baby') || cleaned.includes('Child') || cleaned.includes('เด็ก')) return 6;
  if (cleaned.includes('Skin') || cleaned.includes('ผิว') || cleaned.includes('ผม') || cleaned.includes('เล็บ')) return 4;
  if (cleaned.includes('Med supply') || cleaned.includes('แพทย์')) return 5;
  if (cleaned.includes('Consumers') || cleaned.includes('อุปโภค')) return 7;
  if (cleaned.includes('Nutrition') || cleaned.includes('Food') || cleaned.includes('Vitamins')) return 3;
  if (cleaned.includes('Herb')) return 2;

  return 10; // fallback
}

/**
 * ค้นหาหมวดหมู่จากชื่อสินค้า (keyword-based fallback)
 * ใช้เมื่อไม่มี Forte category
 */
export function categorizeByName(name: string): number {
  const n = name.normalize('NFC');
  for (const rule of KEYWORD_RULES) {
    for (const re of rule.keywords) {
      if (re.test(n)) return rule.categoryId;
    }
  }
  return 10; // อื่นๆ/รอจัด
}

/**
 * ฟังก์ชันรวม: รับ Forte category name + product name → return category ID
 */
export function resolveCategoryId(categnam: string | null | undefined, productName: string): number {
  const fromForte = mapForteCategoryToId(categnam);
  if (fromForte !== 10) return fromForte;

  // If Forte didn't map it, try keyword-based on the name
  // But special rule: if Forte category is 'ยาใช้ภายนอก ยาครีม',
  // check if product name has keywords for category 5 (เวชภัณฑ์)
  if (categnam && categnam.includes('ยาใช้ภายนอก') || categnam?.includes('ครีม')) {
    const fromKeywords = categorizeByName(productName);
    // If keywords suggest category 5 (medical supplies), use that
    if (fromKeywords === 5) return 5;
    // If keywords suggest category 4 (cosmeceuticals), use that
    if (fromKeywords === 4) return 4;
  }

  return fromForte; // will be 10 if no match
}

/**
 * ดึง category definitions ทั้งหมด (sorted by sortOrder)
 */
export function getAllCategories(): CategoryDef[] {
  return [...ALL_CATEGORIES].sort((a, b) => a.sortOrder - b.sortOrder);
}
