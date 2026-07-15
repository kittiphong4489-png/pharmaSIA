/**
 * api/queries/connection.ts — SQLite database
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, nameTh TEXT NOT NULL DEFAULT '', nameEn TEXT NOT NULL DEFAULT '', slug TEXT NOT NULL DEFAULT '', descriptionTh TEXT DEFAULT '', descriptionEn TEXT DEFAULT '', icon TEXT DEFAULT '📦', color TEXT DEFAULT 'blue', sortOrder INTEGER DEFAULT 0, productCount INTEGER DEFAULT 0, isActive INTEGER DEFAULT 1, createdAt TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, sku TEXT UNIQUE NOT NULL, nameTh TEXT NOT NULL DEFAULT '', nameEn TEXT NOT NULL DEFAULT '', shortDescriptionTh TEXT DEFAULT '', shortDescriptionEn TEXT DEFAULT '', descriptionTh TEXT DEFAULT '', descriptionEn TEXT DEFAULT '', usageTh TEXT DEFAULT '', usageEn TEXT DEFAULT '', ingredientsTh TEXT DEFAULT '', ingredientsEn TEXT DEFAULT '', warningsTh TEXT DEFAULT '', warningsEn TEXT DEFAULT '', pricesJson TEXT DEFAULT '{}', price REAL DEFAULT 0, originalPrice REAL, stock INTEGER DEFAULT 100, unit TEXT DEFAULT 'piece', categoryId INTEGER DEFAULT 1, isFeatured INTEGER DEFAULT 0, isNew INTEGER DEFAULT 0, requiresPrescription INTEGER DEFAULT 0, status TEXT DEFAULT 'active', rating REAL DEFAULT 5.0, reviewCount INTEGER DEFAULT 0, soldCount INTEGER DEFAULT 0, weightGrams REAL, image TEXT, legalCategory TEXT DEFAULT 'HOUSEHOLD_REMEDY', genericNameTh TEXT DEFAULT '', genericNameEn TEXT DEFAULT '', createdAt TEXT DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP, visibleToJson TEXT DEFAULT '["RETAIL","CLINIC"]', barcode TEXT, costPrice REAL DEFAULT 0, marginPercent REAL DEFAULT 0, marginType TEXT DEFAULT 'percent');
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, fullName TEXT NOT NULL DEFAULT '', phone TEXT DEFAULT '', role TEXT DEFAULT 'INDIVIDUAL', tier TEXT DEFAULT 'INDIVIDUAL', isActive INTEGER DEFAULT 1, isVerified INTEGER DEFAULT 0, verificationStatus TEXT DEFAULT 'NONE', b2bStatus TEXT DEFAULT 'NONE', b2bTaxId TEXT DEFAULT '', b2bLicense TEXT DEFAULT '', b2bNotes TEXT DEFAULT '', address TEXT DEFAULT '', preferencesJson TEXT DEFAULT '{}', createdAt TEXT DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, orderNumber TEXT UNIQUE NOT NULL, userId INTEGER, customerName TEXT NOT NULL DEFAULT '', customerPhone TEXT DEFAULT '', shippingAddressJson TEXT DEFAULT '{}', subtotal REAL DEFAULT 0, shippingFee REAL DEFAULT 0, tax REAL DEFAULT 0, grandTotal REAL DEFAULT 0, status TEXT DEFAULT 'pending', notes TEXT DEFAULT '', orderedAt TEXT DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP, trackingNumber TEXT, packedAt TEXT, carrier TEXT);
CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY, orderId INTEGER NOT NULL, productId INTEGER NOT NULL, productNameTh TEXT NOT NULL, productNameEn TEXT NOT NULL, unitPrice REAL NOT NULL, quantity INTEGER NOT NULL, subtotal REAL NOT NULL, createdAt TEXT DEFAULT CURRENT_TIMESTAMP, productImage TEXT, productSku TEXT, productUnit TEXT);
CREATE TABLE IF NOT EXISTS cart_items (id INTEGER PRIMARY KEY, sessionId TEXT NOT NULL, productId INTEGER NOT NULL, quantity INTEGER DEFAULT 1, createdAt TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS forte_sync_history (id INTEGER PRIMARY KEY AUTOINCREMENT, syncedAt TEXT NOT NULL DEFAULT (datetime('now')), productCount INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'success', errorMessage TEXT);
CREATE TABLE IF NOT EXISTS store_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS stock_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  productId INTEGER NOT NULL REFERENCES products(id),
  batchNumber TEXT NOT NULL,
  expiryDate TEXT,
  quantity INTEGER DEFAULT 0,
  initialQuantity INTEGER DEFAULT 0,
  unitCost REAL DEFAULT 0,
  supplier TEXT DEFAULT '',
  receivedDate TEXT DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active',
  notes TEXT DEFAULT '',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(productId, batchNumber)
);
CREATE TABLE IF NOT EXISTS traceability_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batchId INTEGER REFERENCES stock_batches(id),
  productId INTEGER NOT NULL REFERENCES products(id),
  orderId INTEGER REFERENCES orders(id),
  orderItemId INTEGER REFERENCES order_items(id),
  action TEXT NOT NULL DEFAULT 'adjust',
  quantity INTEGER NOT NULL DEFAULT 0,
  previousStock INTEGER DEFAULT 0,
  newStock INTEGER DEFAULT 0,
  reference TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  createdBy INTEGER REFERENCES users(id),
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS account_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transactionType TEXT NOT NULL DEFAULT 'sale',
  referenceType TEXT DEFAULT '',
  referenceId INTEGER,
  description TEXT DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  tax REAL DEFAULT 0,
  totalAmount REAL DEFAULT 0,
  paymentMethod TEXT DEFAULT 'cash',
  status TEXT DEFAULT 'completed',
  transactionDate TEXT DEFAULT CURRENT_TIMESTAMP,
  createdBy INTEGER REFERENCES users(id),
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS account_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summaryDate TEXT NOT NULL UNIQUE,
  totalSales REAL DEFAULT 0,
  totalExpenses REAL DEFAULT 0,
  totalRevenue REAL DEFAULT 0,
  netProfit REAL DEFAULT 0,
  transactionCount INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL REFERENCES orders(id),
  amount REAL NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'promptpay',
  status TEXT NOT NULL DEFAULT 'pending',
  qrPayload TEXT DEFAULT '',
  qrImageUrl TEXT DEFAULT '',
  paidAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS shipping_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  minWeight REAL NOT NULL DEFAULT 0,
  maxWeight REAL NOT NULL DEFAULT 999999,
  fee REAL NOT NULL DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL DEFAULT '',
  message TEXT DEFAULT '',
  isRead INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  entityType TEXT DEFAULT '',
  entityId INTEGER
);
CREATE TABLE IF NOT EXISTS user_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER REFERENCES users(id),
  label TEXT DEFAULT 'บ้าน',
  address TEXT NOT NULL DEFAULT '',
  district TEXT DEFAULT '',
  province TEXT DEFAULT '',
  zip TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  isDefault INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS recently_viewed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  productId INTEGER NOT NULL REFERENCES products(id),
  viewedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(userId, productId)
);
CREATE TABLE IF NOT EXISTS packing_slips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL,
  slipNumber TEXT NOT NULL,
  packedBy INTEGER,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  packedAt TEXT,
  verifiedAt TEXT,
  FOREIGN KEY (orderId) REFERENCES orders(id)
);
CREATE TABLE IF NOT EXISTS packing_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slipId INTEGER NOT NULL,
  orderItemId INTEGER NOT NULL,
  batchId INTEGER,
  lotNumber TEXT,
  expiryDate TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  verified INTEGER DEFAULT 0,
  FOREIGN KEY (slipId) REFERENCES packing_slips(id),
  FOREIGN KEY (orderItemId) REFERENCES order_items(id)
);
CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL REFERENCES orders(id),
  imageUrl TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  pharmacistName TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  reviewedBy INTEGER REFERENCES users(id),
  reviewedAt TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

let db: Database.Database | null = null;
const DB_DIR = path.resolve(typeof __dirname !== "undefined" ? __dirname : ".", 
  typeof __dirname !== "undefined" ? "../data" : "data");
const DB_PATH = path.join(DB_DIR, "PharmaSIA.db");

export function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  return db;
}

export function remapCategories(db: Database.Database): void {
  // Reset all to default (ยา) first
  db.exec("UPDATE products SET categoryId = 1");
  // Then apply specific mappings (order matters - last match wins)
  db.exec("UPDATE products SET categoryId = 9 WHERE nameTh LIKE '%สัตว์%' OR nameTh LIKE '%แมว%' OR nameTh LIKE '%หมา%' OR nameTh LIKE '%สุนัข%'");
  db.exec("UPDATE products SET categoryId = 2 WHERE nameTh LIKE '%สมุนไพร%' OR nameTh LIKE '%Herbs%' OR nameTh LIKE '%แผนโบราณ%' OR nameTh LIKE '%ยาจีน%'");
  db.exec("UPDATE products SET categoryId = 4 WHERE nameTh LIKE '%ครีมบำรุง%' OR nameTh LIKE '%โลชั่น%' OR nameTh LIKE '%กันแดด%' OR nameTh LIKE '%sunblock%' OR nameTh LIKE '%คอลลาเจน%' OR nameTh LIKE '%เซรั่ม%' OR nameTh LIKE '%สกินแคร์%' OR nameTh LIKE '%เครื่องสำอาง%' OR nameTh LIKE '%เวชสำอาง%' OR nameTh LIKE '%บำรุงผิว%'");
  db.exec("UPDATE products SET categoryId = 3 WHERE nameTh LIKE '%อาหารเสริม%' OR nameTh LIKE '%วิตามิน%' OR nameTh LIKE '%vitamin%' OR nameTh LIKE '%Vitamin%' OR nameTh LIKE '%supplement%' OR nameTh LIKE '%Nutrition%' OR nameTh LIKE '%โปรตีน%' OR nameTh LIKE '%แคลเซียม%' OR nameTh LIKE '%น้ำมันปลา%'");
  db.exec("UPDATE products SET categoryId = 5 WHERE nameTh LIKE '%แอลกอฮอล%' OR nameTh LIKE '%เจลแอลกอฮอล%' OR nameTh LIKE '%หน้ากาก%' OR nameTh LIKE '%mask%' OR nameTh LIKE '%ถุงมือ%' OR nameTh LIKE '%พลาสเตอร์%' OR nameTh LIKE '%ผ้าพัน%' OR nameTh LIKE '%อุปกรณ์%' OR nameTh LIKE '%เครื่องวัด%' OR nameTh LIKE '%สำลี%' OR nameTh LIKE '%ปรอท%' OR nameTh LIKE '%Med supply%'");
  db.exec("UPDATE products SET categoryId = 7 WHERE nameTh LIKE '%สบู่%' OR nameTh LIKE '%ยาสีฟัน%' OR nameTh LIKE '%แปรงสีฟัน%' OR nameTh LIKE '%น้ำยาล้าง%' OR nameTh LIKE '%น้ำยาซัก%' OR nameTh LIKE '%แชมพู%' OR nameTh LIKE '%ครีมนวด%' OR nameTh LIKE '%โรลออน%' OR nameTh LIKE '%น้ำหอม%'");
  db.exec("UPDATE products SET categoryId = 6 WHERE nameTh LIKE '%เด็ก%' OR nameTh LIKE '%baby%' OR nameTh LIKE '%Baby%' OR nameTh LIKE '%ทารก%' OR nameTh LIKE '%นมผง%' OR nameTh LIKE '%นมเด็ก%' OR nameTh LIKE '%ผ้าอ้อม%' OR nameTh LIKE '%ขวดนม%' OR nameTh LIKE '%แม่และเด็ก%'");
  db.exec("UPDATE products SET categoryId = 8 WHERE nameTh LIKE '%เครื่องดื่ม%' OR nameTh LIKE '%กาแฟ%' OR nameTh LIKE '%ชา%' OR nameTh LIKE '%อาหาร%' OR nameTh LIKE '%โภชนาการ%' OR nameTh LIKE '%Ensure%' OR nameTh LIKE '%ขนม%'");
  console.log("[DB] Category remapping complete");
}

export async function initDb(): Promise<void> {
  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  // Migrations for existing DBs
  // Existing table migrations
  for (const col of ["trackingNumber", "packedAt", "carrier"]) { try { db.exec(`ALTER TABLE orders ADD COLUMN ${col} TEXT`); } catch {} }
  for (const col of ["sessionId"]) { try { db.exec(`ALTER TABLE orders ADD COLUMN ${col} TEXT DEFAULT ''`); } catch {} }
  for (const col of ["tax"]) { try { db.exec(`ALTER TABLE orders ADD COLUMN ${col} REAL DEFAULT 0`); } catch {} }
  for (const col of ["barcode", "costPrice", "marginPercent", "marginType"]) { try { db.exec(`ALTER TABLE products ADD COLUMN ${col} TEXT`); } catch {} }
  for (const col of ["pricesJson", "packsize", "memo1"]) { try { db.exec(`ALTER TABLE products ADD COLUMN ${col} TEXT DEFAULT ''`); } catch {} }
  for (const col of ["isFeatured"]) { try { db.exec(`ALTER TABLE products ADD COLUMN ${col} INTEGER DEFAULT 0`); } catch {} }
  try { db.exec("ALTER TABLE products ADD COLUMN weight REAL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE payments ADD COLUMN qrImageUrl TEXT DEFAULT ''"); } catch {}
  for (const col of ["batchId", "lotNumber", "expiryDate"]) { try { db.exec(`ALTER TABLE order_items ADD COLUMN ${col} TEXT DEFAULT NULL`); } catch {} }
  for (const col of ["avatarUrl"]) { try { db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT DEFAULT NULL`); } catch {} }
  try { db.exec("ALTER TABLE users ADD COLUMN rawPassword TEXT DEFAULT ''"); } catch {}
  for (const col of ["taxId", "address"]) { try { db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT DEFAULT NULL`); } catch {} }
  try { db.exec("ALTER TABLE users ADD COLUMN passwordHash TEXT"); } catch {}
  try { db.exec("UPDATE users SET passwordHash = password WHERE passwordHash IS NULL"); } catch {}
  // Migration for Sprint 2+ tables (not in SCHEMA_SQL)
  try { db.exec("CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, orderId INTEGER, amount REAL, method TEXT DEFAULT 'promptpay', status TEXT DEFAULT 'pending', qrPayload TEXT DEFAULT '', qrImageUrl TEXT DEFAULT '', paidAt TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP)"); } catch {}
  try { db.exec("CREATE TABLE IF NOT EXISTS shipping_rates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, minWeight REAL DEFAULT 0, maxWeight REAL DEFAULT 999999, fee REAL DEFAULT 0, createdAt TEXT DEFAULT CURRENT_TIMESTAMP)"); } catch {}
  try { db.exec("INSERT OR IGNORE INTO shipping_rates (id, name, minWeight, maxWeight, fee) VALUES (1, '0-500g', 0, 500, 50), (2, '501-1000g', 501, 1000, 80), (3, '1001-2000g', 1001, 2000, 120), (4, '2001-5000g', 2001, 5000, 200), (5, '5000g+', 5001, 999999, 300)"); } catch {}
  try { db.exec("CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, type TEXT DEFAULT 'info', title TEXT DEFAULT '', message TEXT DEFAULT '', isRead INTEGER DEFAULT 0, createdAt TEXT DEFAULT CURRENT_TIMESTAMP, entityType TEXT DEFAULT '', entityId INTEGER)"); } catch {}
  for (const col of ["entityType", "entityId"]) { try { db.exec(`ALTER TABLE notifications ADD COLUMN ${col} TEXT`); } catch {} }
  for (const col of ["district", "province", "zip"]) { try { db.exec(`ALTER TABLE user_addresses ADD COLUMN ${col} TEXT DEFAULT ''`); } catch {} }
  // Category mapping is handled by auto-migration in boot.ts
  // Only fix NULL categories
  try { db.exec("UPDATE products SET categoryId = 10 WHERE categoryId IS NULL"); } catch {}
  try { db.exec("UPDATE products SET categoryId = 9 WHERE nameTh LIKE '%สัตว์%' OR nameTh LIKE '%แมว%' OR nameTh LIKE '%หมา%' OR nameTh LIKE '%สุนัข%' OR nameTh LIKE '%pet%'"); } catch {}
  try { db.exec("UPDATE products SET categoryId = 2 WHERE nameTh LIKE '%สมุนไพร%' OR nameTh LIKE '%Herbs%' OR nameTh LIKE '%herb%' OR nameTh LIKE '%แผนโบราณ%' OR nameTh LIKE '%ยาจีน%'"); } catch {}
  try { db.exec("UPDATE products SET categoryId = 6 WHERE nameTh LIKE '%เด็ก%' OR nameTh LIKE '%baby%' OR nameTh LIKE '%Baby%' OR nameTh LIKE '%ทารก%' OR nameTh LIKE '%นมผง%' OR nameTh LIKE '%นมเด็ก%' OR nameTh LIKE '%ผ้าอ้อม%' OR nameTh LIKE '%ขวดนม%' OR nameTh LIKE '%แม่และเด็ก%'"); } catch {}
  try { db.exec("UPDATE products SET categoryId = 8 WHERE nameTh LIKE '%เครื่องดื่ม%' OR nameTh LIKE '%กาแฟ%' OR nameTh LIKE '%ชา%' OR nameTh LIKE '%น้ำดื่ม%' OR nameTh LIKE '%อาหาร%' OR nameTh LIKE '%Gastro%' OR nameTh LIKE '%โภชนาการ%' OR nameTh LIKE '%Ensure%' OR nameTh LIKE '%ขนม%'"); } catch {}
  try { db.exec("UPDATE products SET categoryId = 7 WHERE nameTh LIKE '%สบู่%' OR nameTh LIKE '%ยาสีฟัน%' OR nameTh LIKE '%แปรงสีฟัน%' OR nameTh LIKE '%น้ำยาล้าง%' OR nameTh LIKE '%น้ำยาซัก%' OR nameTh LIKE '%น้ำยาทำความสะอาด%' OR nameTh LIKE '%แชมพู%' OR nameTh LIKE '%ครีมนวด%' OR nameTh LIKE '%โรลออน%' OR nameTh LIKE '%น้ำหอม%'"); } catch {}
  try { db.exec("UPDATE products SET categoryId = 5 WHERE nameTh LIKE '%แอลกอฮอล%' OR nameTh LIKE '%เจลแอลกอฮอล%' OR nameTh LIKE '%หน้ากาก%' OR nameTh LIKE '%mask%' OR nameTh LIKE '%ถุงมือ%' OR nameTh LIKE '%พลาสเตอร์%' OR nameTh LIKE '%ผ้าพัน%' OR nameTh LIKE '%อุปกรณ์%' OR nameTh LIKE '%เครื่องวัด%' OR nameTh LIKE '%ไซริง%' OR nameTh LIKE '%เข็ม%' OR nameTh LIKE '%สายน้ำเกลือ%' OR nameTh LIKE '%สำลี%' OR nameTh LIKE '%คอตตอน%' OR nameTh LIKE '%ก๊อซ%' OR nameTh LIKE '%ปรอท%' OR nameTh LIKE '%เครื่องมือ%' OR nameTh LIKE '%Med supply%'"); } catch {}
  try { db.exec("UPDATE products SET categoryId = 4 WHERE nameTh LIKE '%ครีมบำรุง%' OR nameTh LIKE '%โลชั่น%' OR nameTh LIKE '%กันแดด%' OR nameTh LIKE '%sunblock%' OR nameTh LIKE '% sunscreen%' OR nameTh LIKE '%คอลลาเจน%' OR nameTh LIKE '%เซรั่ม%' OR nameTh LIKE '%สกินแคร์%' OR nameTh LIKE '%เครื่องสำอาง%' OR nameTh LIKE '%ลิป%' OR nameTh LIKE '%แป้ง%' OR nameTh LIKE '%เวชสำอาง%' OR nameTh LIKE '%บำรุงผิว%'"); } catch {}
  try { db.exec("UPDATE products SET categoryId = 3 WHERE nameTh LIKE '%อาหารเสริม%' OR nameTh LIKE '%วิตามิน%' OR nameTh LIKE '%vitamin%' OR nameTh LIKE '%Vitamin%' OR nameTh LIKE '%supplement%' OR nameTh LIKE '%Nutrition%' OR nameTh LIKE '%nutrition%' OR nameTh LIKE '%โปรตีน%' OR nameTh LIKE '%แคลเซียม%' OR nameTh LIKE '%โสม%' OR nameTh LIKE '%น้ำมันปลา%' OR nameTh LIKE '%ไฟเบอร์%'"); } catch {}
  try { db.exec("CREATE TABLE IF NOT EXISTS recently_viewed (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, productId INTEGER, viewedAt TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(userId, productId))"); } catch {}
  try { db.exec("CREATE TABLE IF NOT EXISTS packing_slips (id INTEGER PRIMARY KEY AUTOINCREMENT, orderId INTEGER NOT NULL, slipNumber TEXT NOT NULL, packedBy INTEGER, status TEXT DEFAULT 'pending', notes TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP, packedAt TEXT, verifiedAt TEXT, FOREIGN KEY (orderId) REFERENCES orders(id))"); } catch {}
  try { db.exec("CREATE TABLE IF NOT EXISTS packing_items (id INTEGER PRIMARY KEY AUTOINCREMENT, slipId INTEGER NOT NULL, orderItemId INTEGER NOT NULL, batchId INTEGER, lotNumber TEXT, expiryDate TEXT, quantity INTEGER NOT NULL DEFAULT 0, verified INTEGER DEFAULT 0, FOREIGN KEY (slipId) REFERENCES packing_slips(id), FOREIGN KEY (orderItemId) REFERENCES order_items(id))"); } catch {}
  try { db.exec("CREATE TABLE IF NOT EXISTS prescriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, orderId INTEGER NOT NULL REFERENCES orders(id), imageUrl TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', pharmacistName TEXT DEFAULT '', notes TEXT DEFAULT '', reviewedBy INTEGER REFERENCES users(id), reviewedAt TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP)"); } catch {}
  try { db.exec("CREATE TABLE IF NOT EXISTS customer_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL UNIQUE, customerCode TEXT NOT NULL UNIQUE, createdAt TEXT DEFAULT CURRENT_TIMESTAMP)"); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    action TEXT NOT NULL,
    entityType TEXT NOT NULL,
    entityId INTEGER,
    details TEXT DEFAULT '',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_audit_log_createdAt ON audit_log(createdAt DESC)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entityType, entityId)"); } catch {}
  console.log(`[DB] SQLite ready: ${DB_PATH}`);
  seedDefaults();
}

function seedDefaults(): void {
  if (!db) return;

  // ── Auto-recovery: if DB is empty but backup exists, restore ──
  const prodCount = (db.prepare("SELECT COUNT(*) as c FROM products").get() as any)?.c || 0;
  if (prodCount === 0) {
    // Try multiple backup locations
    const volumeBackup = path.join(DB_DIR, "products_backup.json");
    const bundledBackup = path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd(), 
  typeof __dirname !== "undefined" ? "../data/products_backup.json" : "data/products_backup.json");
    const apiDirBackup = path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd(), 
  typeof __dirname !== "undefined" ? "./products_backup.json" : "api/products_backup.json");
    const rootBackup = path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd(), 
  typeof __dirname !== "undefined" ? "../products_backup.json" : "products_backup.json");
    const backupPaths = [volumeBackup, bundledBackup, apiDirBackup, rootBackup];
    
    for (const backupPath of backupPaths) {
      if (fs.existsSync(backupPath)) {
        try {
          console.log(`[DB] Found backup at: ${backupPath}`);
          const backup = JSON.parse(fs.readFileSync(backupPath, "utf-8"));
        if (backup.products && backup.products.length > 100) {
          console.log(`[DB] ⚠️  DB empty but backup found! Restoring ${backup.products.length} products...`);
          const insertStmt = db.prepare(`INSERT OR REPLACE INTO products
            (sku, nameTh, nameEn, price, costPrice, stock, categoryId, status, barcode, genericNameTh, image, createdAt, updatedAt, visibleToJson, legalCategory)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?,datetime('now')), datetime('now'), ?, ?)`);
          const tx = db.transaction(() => {
            for (const p of backup.products) {
              try {
                insertStmt.run(
                  p.sku, p.nameTh || "", p.nameEn || "",
                  p.price || 0, p.costPrice || 0, p.stock || 100, p.categoryId || 1, "active",
                  p.barcode || "", p.genericNameTh || "", p.image || null,
                  null, p.visibleToJson || '["RETAIL","CLINIC"]', p.legalCategory || "HOUSEHOLD_REMEDY"
                );
              } catch {}
            }
          });
          tx();
          console.log(`[DB] ✅ Restored ${backup.products.length} products from backup`);
          return;
        }
      } catch (e: any) {
        console.error("[DB] Backup restore failed:", e?.message);
      }
    }
  }
  }

  // ── Migration: replace old categories with 10 หมวดใหม่ ──
  migrateTo10Categories(db);

  // Migration: ล้าง qrImageUrl เก่าที่ชี้ไป promptpay.io
  try { db.prepare("UPDATE payments SET qrImageUrl = '/api/images/qr-promptpay.jpg' WHERE qrImageUrl LIKE '%promptpay.io%'").run(); } catch {}

  // Migration: Fix corrupted order statuses (trackingNo written to status field)
  const badStatuses = db.prepare("SELECT id, status FROM orders WHERE status IN ('FLTEST123', 'FL999999')").all() as any[];
  if (badStatuses.length > 0) {
    const ids = badStatuses.map((o: any) => o.id);
    console.log(`[Migration] Fixing ${badStatuses.length} corrupted order statuses: ${ids.join(", ")}`);
    db.prepare(`UPDATE orders SET status = 'shipping' WHERE id IN (${ids.join(",")})`).run();
    try { db.prepare(`INSERT INTO audit_log (userId, action, entityType, entityId, details, createdAt)
      VALUES (1, 'data_cleanup', 'order', null, ?, datetime('now'))`).run(
      `Auto-fix: ${badStatuses.length} orders had corrupted status (trackingNo→status). Set to 'shipping'. IDs: ${ids.join(", ")}`
    ); } catch {}
  }

  // Seed store_settings defaults if empty (fully dynamic, no hardcode in invoice)
  const existingSettings = db.prepare("SELECT COUNT(*) as c FROM store_settings").get() as any;
  if (!existingSettings || existingSettings.c === 0) {
    const defaultSettings = [
      ["storeNameTh", "ร้านยาคุณภาพ"],
      ["storeName", "PharmaSIA"],
      ["storePhone", ""],
      ["storeAddress", ""],
      ["taxId", ""],
      ["footer", "ขอบคุณที่ใช้บริการ"],
    ];
    const stmt = db.prepare("INSERT OR IGNORE INTO store_settings (key, value, updatedAt) VALUES (?, ?, datetime('now'))");
    for (const [k, v] of defaultSettings) { try { stmt.run(k, v); } catch {} }
  }

  // Seed categories if still empty (first run)
  const catCount = (db.prepare("SELECT COUNT(*) as c FROM categories").get() as any)?.c || 0;
  if (catCount === 0) {
    seed10Categories(db);
  }

  // Seed admin user
  const userExists = db.prepare("SELECT id FROM users WHERE email = ?").get("kittiphong4489@gmail.com");
  if (!userExists) {
    const { hashPassword } = require("../lib/auth");
    const hashed = hashPassword("44894489");
    db.prepare("INSERT INTO users (email, password, passwordHash, fullName, role, tier, createdAt) VALUES (?,?,?,?,'SELLER','RETAIL',datetime('now'))")
      .run("kittiphong4489@gmail.com", hashed, hashed, "Kittiphong Shop");
  }

  // Seed settings
  const settingsList: [string, string][] = [
    ["storeName", "PharmaSIA"], ["storeNameTh", "ร้านยาออนไลน์"],
    ["syncEnabled", "true"], ["syncHour", "2"], ["syncMarginPercent", "15"],
  ];
  for (const [k, v] of settingsList) {
    try { db.prepare("INSERT OR IGNORE INTO store_settings (key, value, updatedAt) VALUES (?,?,datetime('now'))").run(k, v); } catch {}
  }

  // Seed shipping rates
  const rateCount = (db.prepare("SELECT COUNT(*) as c FROM shipping_rates").get() as any)?.c || 0;
  if (rateCount === 0) {
    const rates = [
      ["0-500g", 0, 500, 50],
      ["501-1000g", 501, 1000, 80],
      ["1001-2000g", 1001, 2000, 120],
      ["2001-5000g", 2001, 5000, 200],
      ["5000g+", 5001, 999999, 300],
    ];
    const insRate = db.prepare("INSERT INTO shipping_rates (name, minWeight, maxWeight, fee) VALUES (?, ?, ?, ?)");
    for (const r of rates) insRate.run(...r);
  }
}

// ── Category definitions (10 หมวด) ──
const CATEGORIES_10 = [
  { id: 1,  nameTh: 'ยา',                    nameEn: 'Medicine',                  slug: 'ยา',                    icon: '💊', color: 'blue',   sortOrder: 1 },
  { id: 2,  nameTh: 'ยาแผนโบราณ/สมุนไพร',   nameEn: 'Herbal Medicine',           slug: 'สมุนไพร',               icon: '🌿', color: 'green',  sortOrder: 2 },
  { id: 3,  nameTh: 'อาหารเสริม/วิตามิน',     nameEn: 'Supplements & Vitamins',    slug: 'อาหารเสริม',             icon: '✨', color: 'amber',  sortOrder: 3 },
  { id: 4,  nameTh: 'เวชสำอาง',              nameEn: 'Cosmeceuticals',            slug: 'เวชสำอาง',              icon: '🧴', color: 'pink',   sortOrder: 4 },
  { id: 5,  nameTh: 'เวชภัณฑ์/อุปกรณ์การแพทย์', nameEn: 'Medical Supplies',        slug: 'เวชภัณฑ์',               icon: '🩺', color: 'teal',   sortOrder: 5 },
  { id: 6,  nameTh: 'แม่และเด็ก',            nameEn: 'Mother & Baby',             slug: 'แม่และเด็ก',             icon: '👶', color: 'purple', sortOrder: 6 },
  { id: 7,  nameTh: 'ของใช้ทั่วไป',           nameEn: 'General Products',          slug: 'ของใช้ทั่วไป',           icon: '🧹', color: 'slate',  sortOrder: 7 },
  { id: 8,  nameTh: 'เครื่องดื่ม/อาหาร',      nameEn: 'Beverages & Food',          slug: 'เครื่องดื่ม',             icon: '☕', color: 'orange', sortOrder: 8 },
  { id: 9,  nameTh: 'สัตว์เลี้ยง',            nameEn: 'Pet Products',              slug: 'สัตว์เลี้ยง',            icon: '🐾', color: 'yellow', sortOrder: 9 },
  { id: 10, nameTh: 'อื่นๆ/รอจัด',            nameEn: 'Other / Unclassified',      slug: 'อื่นๆ',                  icon: '📦', color: 'gray',   sortOrder: 99 },
  { id: 11, nameTh: 'ยาควบคุมพิเศษ',          nameEn: 'Controlled Medications',    slug: 'ยาควบคุมพิเศษ',         icon: '📄', color: 'red',    sortOrder: 10 },
];

function insertCategory(db: any, c: typeof CATEGORIES_10[number]): void {
  db.prepare("INSERT OR REPLACE INTO categories (id, nameTh, nameEn, slug, icon, color, sortOrder, isActive, createdAt) VALUES (?,?,?,?,?,?,?,1,datetime('now'))")
    .run(c.id, c.nameTh, c.nameEn, c.slug, c.icon, c.color, c.sortOrder);
}

/**
 * Migration: แทนที่ categories table เดิมด้วย 10 หมวดใหม่ + re-map  products
 * ทำงาน 1 ครั้งเมื่อตรวจพบว่ายังมี categories เก่าอยู่
 */
function migrateTo10Categories(db: any): void {
  // ตรวจสอบว่ายังมี category เดิม (id=1 nameTh='ยาสามัญประจำบ้าน') อยู่ไหม
  const oldCat = db.prepare("SELECT id, nameTh FROM categories WHERE id = 1").get() as any;
  if (!oldCat) return; // ไม่มี categories เลย → first run, seed จะจัดการ
  if (oldCat.nameTh === 'ยา') return; // already migrated

  console.log("[DB] 🔄 Migrating categories: old 4 → new 10 categories...");

  // Step 1: Insert the 10 new categories (REPLACE old ones with same ID)
  for (const c of CATEGORIES_10) {
    insertCategory(db, c);
  }

  // Step 2: Delete any extra categories that were dynamically created by autoSyncForte
  // (those have IDs > 11 or names not matching our categories)
  db.prepare("DELETE FROM categories WHERE id > 11").run();

  // Step 3: Re-map existing products
  // Old ID 1 (ยาสามัญประจำบ้าน) → New ID 1 (ยา) — same concept, keep
  // Old ID 2 (วิตามินและอาหารเสริม) → New ID 3 (อาหารเสริม/วิตามิน)
  // Old ID 3 (อุปกรณ์การแพทย์) → New ID 5 (เวชภัณฑ์/อุปกรณ์การแพทย์)
  // Old ID 4 (ผลิตภัณฑ์ดูแลสุขภาพ) → New ID 4 (เวชสำอาง)
  // Products from old Forte sync (had categoryId >= 5) + rest → 10 (อื่นๆ/รอจัด)
  const OLD_TO_NEW: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 4 };
  const allProds = db.prepare("SELECT id, categoryId FROM products").all() as any[];
  let remapped = 0;
  for (const p of allProds) {
    const oldId = p.categoryId;
    if (oldId && OLD_TO_NEW[oldId] !== undefined) {
      if (OLD_TO_NEW[oldId] !== oldId) {
        db.prepare("UPDATE products SET categoryId = ? WHERE id = ?").run(OLD_TO_NEW[oldId], p.id);
        remapped++;
      }
    } else if (oldId < 1 || oldId > 10) {
      // Was pointing to a deleted Forte-created category → reset to 10
      db.prepare("UPDATE products SET categoryId = 10 WHERE id = ?").run(p.id);
      remapped++;
    }
  }
  console.log(`[DB] ✅ Migrated ${remapped} products to new categories`);
}

/**
 * Seed: ใส่ 10 หมวดหมู่ + sample products สำหรับ first run
 */
function seed10Categories(db: any): void {
  for (const c of CATEGORIES_10) {
    insertCategory(db, c);
  }

  const prods = [
    ["P001", "พาราเซตามอล 500 มก.", "Paracetamol 500mg", 35, 1, "ยาแก้ปวดลดไข้ สำหรับผู้ใหญ่และเด็กอายุ 12 ปีขึ้นไป"],
    ["P002", "วิตามินซี 1000 มก.", "Vitamin C 1000mg", 150, 3, "วิตามินซีเสริมภูมิคุ้มกัน ขนาด 1000 มก."],
    ["P003", "หน้ากากอนามัย 3 ชั้น", "Surgical Mask 3-Ply", 89, 5, "หน้ากากอนามัย 3 ชั้น มาตรฐานการแพทย์"],
    ["P004", "แอลกอฮอล์เจล 70%", "Alcohol Gel 70%", 59, 7, "เจลแอลกอฮอล์ฆ่าเชื้อ 70% ขนาดพกพา"],
  ];
  const insP = db.prepare("INSERT OR IGNORE INTO products (sku, nameTh, nameEn, price, categoryId, descriptionTh, status, createdAt, updatedAt) VALUES (?,?,?,?,?,?,'active',datetime('now'),datetime('now'))");
  for (const p of prods) insP.run(...p);
}

// ── Save product backup to JSON file ──
export function saveProductsBackup(): void {
  if (!db) return;
  try {
    const products = db.prepare(`
      SELECT sku, nameTh, nameEn, price, costPrice, stock, categoryId, barcode,
             genericNameTh, image, status, visibleToJson, legalCategory
      FROM products
    `).all();
    if (products.length > 0) {
      const backupPath = path.join(DB_DIR, "products_backup.json");
      fs.writeFileSync(backupPath, JSON.stringify({ products, backedAt: new Date().toISOString() }, null, 2));
      console.log(`[DB] 💾 Backup saved: ${products.length} products → ${backupPath}`);
    }
  } catch (e: any) {
    console.error("[DB] Backup save error:", e?.message);
  }
}

export function startDbWatchdog(): void {
  setInterval(() => {
    try { if (db) db.prepare("SELECT 1").get(); } catch {}
  }, 30000);
}

export async function ensureCustomerCode(userId: number): Promise<string> {
  if (!db) throw new Error("Database not initialized");
  let existing = db.prepare("SELECT customerCode FROM customer_codes WHERE userId = ?").get(userId) as any;
  if (existing) return existing.customerCode;
  const count = (db.prepare("SELECT COUNT(*) as c FROM customer_codes").get() as any)?.c || 0;
  const code = `CUS-${String(count + 1).padStart(5, "0")}`;
  db.prepare("INSERT INTO customer_codes (userId, customerCode) VALUES (?, ?)").run(userId, code);
  return code;
}
