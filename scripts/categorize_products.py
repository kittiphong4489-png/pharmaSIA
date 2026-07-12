"""
scripts/categorize_products.py
จัดหมวดหมู่สินค้าอัตโนมัติจากชื่อสินค้า
โดยใช้ keyword matching + price/stock analysis
"""
import sqlite3, re, sys
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "pharmacare.db"

# ── Category ID mappings ──
CAT_YASAMAN = 11   # ยาสามัญประจำบ้าน
CAT_YADAN = 12     # ยาอันตราย (ต้องมีใบสั่งแพทย์)
CAT_YAPLAN = 2      # ยาแผนโบราณ/สมุนไพร
CAT_SUPP = 3        # อาหารเสริม/วิตามิน
CAT_COSMO = 4       # เวชสำอาง
CAT_MEDSUP = 5      # เวชภัณฑ์/อุปกรณ์การแพทย์
CAT_BABY = 6       # แม่และเด็ก
CAT_GENERAL = 7     # ของใช้ทั่วไป
CAT_BEVERAGE = 8    # เครื่องดื่ม/อาหาร
CAT_PET = 9        # สัตว์เลี้ยง
CAT_OTHER = 10      # อื่นๆ/รอจัด
CAT_MEDICINE = 1    # ยาทั่วไป (fallback)

# ── Keyword patterns for each category ──
PATTERNS = {
    # === ยาสามัญประจำบ้าน (Household Remedies) ===
    CAT_YASAMAN: [
        r'พาราเซตามอล', r'paracetamol', r'อะเซตามิโนเฟน', r'acetaminophen',
        r'ไอบูโปรเฟน', r'ibuprofen', r'แอสไพริน', r'aspirin',
        r'ไดโคลฟีแนค', r'diclofenac', r'โซเดียมไดโคลฟีแนค',
        r'แมกนีเซียมไตรซิลิเกต', r'aluminium', r'ไฮดรอกไซด์',
        r'ยาธาตุ', r'ยาธาตุน้ำ', r'ยาธาตุขาว', r'ยาธาตุดำ',
        r'ยาแก้ปวดท้อง', r'ยาแก้ท้องอืด', r'ยาลดกรด',
        r'ไดเมนไฮดริเนท', r'dimenhydrinate', r'ยาเมาเรือ', r'ยาแก้เวียนหัว',
        r'คลอเฟนิรามีน', r'chlorpheniramine', r'ยาแก้แพ้',
        r'เดกซ์โตรเมทอร์แฟน', r'dextromethorphan', r'ยาแก้ไอ',
        r'ยาอม', r'ยาแก้เจ็บคอ', r'ยาอมแก้ไอ',
        r'ยาหม่อง', r'ยาหม่องตรา', r'น้ำมันเขียว', r'น้ำมนต์เขียว',
        r'ไทเกอร์บัล์ม', r'tiger balm', r'ยาดม', r'ยากันยุง',
        r'เป้าอุ่น', r'ยาแก้ปวดเมื่อย',
        r'ยาทาแก้ปวด', r'ยาทาเคลือบ', r'ครีมทาแก้ปวด',
        r'แผลสด', r'ยาทาแผล', r'เบตาดีน', r'povidone', r'ไอโอดีน',
        r'พลาสเตอร์', r'plaster', r'ยาใส่แผล',
        r'ยาปฏิชีวนะทา', r'ยาทาเชื้อรา', r'ยาทากลากเกลื้อน',
        r'ขี้ผึ้ง', r'ครีม', r'โลชั่นทา', r'ยาทา',
    ],

    # === ยาอันตราย (Dangerous Drugs - need prescription) ===
    CAT_YADAN: [
        r'ยาปฏิชีวนะ', r'antibiotic', r'antibotics',
        r'อะม็อกซีซิลลิน', r'amoxicillin', r'amox',
        r'เซฟาเลกซิน', r'cephalexin', r'cepha',
        r'อะซิโทรมัยซิน', r'azithromycin', r'azithro',
        r'คลอแรมเฟนิคอล', r'chloramphenicol',
        r'เตตราซัยคลิน', r'tetracycline',
        r'ไพริดอกซิ', r'pyridoxine', r'วิตามินบี1', r'วิตามินบี6',
        r'ยาเบาหวาน', r'diabetes', r'glibenclamide', r'metformin',
        r'glipizide', r'insulin',
        r'ยาความดัน', r'ลดความดัน', r'amlodipine', r'enalapril',
        r'ยาลดไขมัน', r'simvastatin', r'atorvastatin',
        r'ยาขับปัสสาวะ', r'diuretic', r'frusemide', r'furosemide',
        r'ยารักษาโรคหัวใจ',
        r'ยาต้านการแข็งตัว', r'warfarin', r'clopidogrel',
        r'ยาละลายลิ่มเลือด',
        r'ยาสเตียรอยด์', r'steroid', r'prednisolone', r'prednisone',
        r'dexamethasone', r'betamethasone',
        r'ยาลดกรดยูริก', r'colchicine', r'allopurinol',
        r'ยาชัก', r'l epilepsy', r'phenytoin', r'phenobarbital',
        r'ยาคุมฉุกเฉิน', r'emergency pill',
        r'ยานอนหลับ', r'ยาคลายเครียด', r'diazepam', r'lorazepam',
        r'ยาซึมเศร้า', r'antidepress',
        r'ยาไมเกรน', r'migraine', r'ergotamine',
        r'ยาแก้ปวดรุนแรง', r'morphine', r'codeine', r'tramadol',
        r'pethidine', r'tramadol',
        r'ยาอัลไซเมอร์', r'ยาparkinson',
        r'ยาละลายเสมหะแรง', r'bromhexine', r'ambroxol',
        r'ยารักษาต่อมลูกหมาก',
        r'ยาภูมิแพ้รุนแรง',
        r'ยาละลายนิ่ว',
    ],

    # === ยาแผนโบราณ/สมุนไพร ===
    CAT_YAPLAN: [
        r'สมุนไพร', r'herbal', r'แผนโบราณ',
        r'ฟ้าทะลายโจร', r'ขิง', r'กระชาย', r'มะขามป้อม',
        r'ตราเสือดาว', r'เสือดาว',
        r'ยาหอม', r'ยาหอมตรา', r'ยาหอมนวโกฐ',
        r'ยาธาตุตรา', r'ยาธาตุ',
        r'ยาประสะ', r'ยาจันทน์', r'ยาเหลือง',
        r'น้ำมัน110', r'น้ำมันไพล',
        r'ลูกอมสมุนไพร', r'TRAPHAPHAN', r'Trapha',
        r'ยาตรีผลา', r'ยาอภัยสาลี',
    ],

    # === อาหารเสริม/วิตามิน ===
    CAT_SUPP: [
        r'วิตามิน', r'vitamin', r'อาหารเสริม', r'supplement',
        r'แคลเซียม', r'calcium', r'แมกนีเซียม', r'magnesium',
        r'ธาตุเหล็ก', r'iron',
        r'โปรตีน', r'protein', r'whey',
        r'คอลลาเจน', r'collagen',
        r'แอลคาร์นิทีน', r'l-carnitine',
        r'กลูโคซามีน', r'glucosamine', r'chondroitin',
        r'โอเมก้า', r'omega', r'น้ำมันปลา', r'fish oil',
        r'โคเอนไซม์', r'coenzyme', r'q10',
        r'ไบโอติน', r'biotin',
        r'ซิงค์', r'zinc', r'สังกะสี',
        r'บำรุงสมอง', r'บำรุงสายตา', r'บำรุงผิว',
        r'เซ็นทรัม', r'centrum', r'แบล็คมอร์', r'blackmores',
        r'MEGA WE CARE', r'MEGA',
    ],

    # === เวชสำอาง ===
    CAT_COSMO: [
        r'เวชสำอาง', r'cosmeceutical',
        r'ครีม', r'cream', r'โลชั่น', r'lotion',
        r'แชมพู', r'shampoo', r'ครีมนวด', r'conditioner',
        r'สบู่', r'soap', r'เจลอาบน้ำ', r'body wash',
        r'กันแดด', r'sunscreen', r'sunblock', r'spf',
        r'ยาสีฟัน', r'toothpaste', r'แปรงสีฟัน',
        r'น้ำยาบ้วนปาก', r'mouthwash',
        r'ลิป', r'lip balm', r'ลิปมัน',
        r'เครื่องสำอาง', r'cosmetic',
        r'มาสก์', r'mask', r'มาสก์หน้า',
        r'ระงับกลิ่นกาย', r'deodorant',
        r'สำลี', r'cotton',
        r'ผ้าอนามัย', r'sanitary', r'pantyliner',
        r'ทิชชู่เปียก', r'wet wipe',
        r'ผลิตภัณฑ์ทำความสะอาด',
        r'Babi Mild', r'บาบิไมล์',
    ],

    # === เวชภัณฑ์/อุปกรณ์การแพทย์ ===
    CAT_MEDSUP: [
        r'เข็ม', r'needle', r'syringe', r'ไซริง', r'กระบอกฉีดยา',
        r'ผ้าพันแผล', r'gauze', r'ผ้ากอส', r'คอตตอน',
        r'ถุงมือ', r'glove', r'gloves', r'ถุงมือยาง',
        r'หน้ากาก', r'mask', r'surgical',
        r'ปรอท', r'thermometer', r'เครื่องวัด',
        r'ที่วัดความดัน', r'เครื่องวัดความดัน',
        r'แผ่นรองซับ', r'under pad', r'pad',
        r'สายยาง', r'tube', r'catheter',
        r'ไม้กดลิ้น', r'tongue depressor',
        r'พลาสเตอร์ปิดแผล', r'bandage', r'bandaid',
        r'น้ำเกลือ', r'saline',
        r'ชุดปฐมพยาบาล', r'first aid',
        r'อุปกรณ์การแพทย์', r'medical supply',
        r'ไม้เท้า', r'walker', r'wheelchair', r'รถเข็น',
        r'เตียง', r'bed', r'บันไดขึ้นเตียง',
    ],

    # === แม่และเด็ก ===
    CAT_BABY: [
        r'แม่และเด็ก', r'mother', r'baby',
        r'ผ้าอ้อม', r'diaper', r'แพมเพิส',
        r'นมผง', r'นม', r'formula', r'breast milk',
        r'กระติกน้ำนม', r'bottle',
        r'ที่ปั๊มนม', r'breast pump',
        r'แป้งเด็ก', r'baby powder',
        r'น้ำมันเด็ก', r'baby oil',
        r'ของเล่นเด็ก', r'toy',
        r'เปลเด็ก',
    ],

    # === ของใช้ทั่วไป ===
    CAT_GENERAL: [
        r'ของใช้', r'เครื่องใช้',
        r'ถ่าน', r'battery',
        r'หลอดไฟ', r'light bulb',
        r'กาว', r'glue',
        r'เทป', r'tape',
        r'ถุงพลาสติก', r'ถุงขยะ',
        r'น้ำยาล้างจาน', r'น้ำยาทำความสะอาด',
        r'น้ำยาซักผ้า', r'น้ำยาปรับผ้านุ่ม',
        r'น้ำยาถูพื้น',
        r'ไม้กวาด', r'ไม้ถูพื้น',
        r'ยาฆ่าแมลง', r'ยากันยุง',
    ],

    # === เครื่องดื่ม/อาหาร ===
    CAT_BEVERAGE: [
        r'เครื่องดื่ม', r'beverage', r'drink',
        r'น้ำ', r'น้ำดื่ม', r'น้ำแร่',
        r'กาแฟ', r'coffee',
        r'ชา', r'tea',
        r'น้ำผลไม้', r'juice',
        r'เครื่องดื่มชูกำลัง',
        r'อาหาร', r'food', r'ขนม', r'อาหารเสริม',
        r'ข้าวสาร',
    ],

    # === สัตว์เลี้ยง ===
    CAT_PET: [
        r'สัตว์เลี้ยง', r'pet', r'สุนัข', r'หมา', r'แมว', r'cat',
        r'อาหารหมา', r'อาหารแมว', r'pet food',
        r'ของเล่นหมา', r'ของเล่นแมว',
        r'ทรายแมว',
    ],
}

def categorize_product(name_th: str, name_en: str = "", price: float = 0, stock: int = 0) -> int:
    """Return category ID based on product name matching."""
    text = f"{name_th} {name_en}".lower().strip()
    
    # Try each category pattern
    for cat_id, patterns in PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return cat_id
    
    return CAT_OTHER  # Can't determine

def main():
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row
    
    # Get all products with categoryId = 1 (ยา/unknown)
    products = db.execute("""
        SELECT id, sku, nameTh, nameEn, price, stock, categoryId
        FROM products
        WHERE categoryId = 1 OR categoryId IS NULL OR categoryId = 10
        ORDER BY id
    """).fetchall()
    
    print(f"สินค้าที่ต้องจัดหมวด: {len(products)} รายการ")
    
    # Categorize
    stats = {}
    updated = 0
    for p in products:
        new_cat = categorize_product(p['nameTh'], p['nameEn'] or '', p['price'] or 0, p['stock'] or 0)
        if new_cat != CAT_OTHER and new_cat != p['categoryId']:
            db.execute("UPDATE products SET categoryId = ? WHERE id = ?", (new_cat, p['id']))
            updated += 1
            stats[new_cat] = stats.get(new_cat, 0) + 1
    
    # Summary
    cat_names = {
        2: "ยาแผนโบราณ/สมุนไพร", 3: "อาหารเสริม/วิตามิน",
        4: "เวชสำอาง", 5: "เวชภัณฑ์/อุปกรณ์การแพทย์",
        6: "แม่และเด็ก", 7: "ของใช้ทั่วไป",
        8: "เครื่องดื่ม/อาหาร", 9: "สัตว์เลี้ยง",
        10: "อื่นๆ/รอจัด",
        11: "ยาสามัญประจำบ้าน", 12: "ยาอันตราย"
    }
    
    print(f"\nอัปเดต {updated} รายการ:")
    for cat_id, cnt in sorted(stats.items(), key=lambda x: -x[1]):
        print(f"  {cat_names.get(cat_id, f'หมวด {cat_id}')}: {cnt} รายการ")
    
    # Remaining in category 1
    remaining = db.execute("SELECT COUNT(*) FROM products WHERE categoryId = 1").fetchone()[0]
    remaining_other = db.execute("SELECT COUNT(*) FROM products WHERE categoryId = 10").fetchone()[0]
    print(f"\nคงเหลือในหมวด 'ยา': {remaining} รายการ")
    print(f"คงเหลือในหมวด 'อื่นๆ/รอจัด': {remaining_other} รายการ")
    
    # Show examples of unassigned
    if remaining > 0 or remaining_other > 0:
        unassigned = db.execute("""
            SELECT id, sku, nameTh FROM products 
            WHERE categoryId = 1 OR categoryId = 10
            LIMIT 20
        """).fetchall()
        print(f"\nตัวอย่างที่ยังไม่ได้จัด (20 รายการ):")
        for u in unassigned:
            print(f"  [{u['id']}] {u['sku']} | {u['nameTh'][:50]}")
    
    db.commit()
    db.close()

if __name__ == "__main__":
    main()
