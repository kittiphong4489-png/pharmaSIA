import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { stream } from "hono/streaming";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { getDb, initDb, startDbWatchdog } from "./queries/connection";
import { autoSyncForte } from "./routers/forteProxyRouter";
import { eventBus, EventType, createEvent } from "./lib/eventBus";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// ── Global security headers ──
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  // CSP — allow same-origin, inline scripts for Vite dev, images from data: and self
  c.header("Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https:; " +
    "font-src 'self' data:; " +
    "frame-ancestors 'none'");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  await next();
});

// ── Simple in-memory rate limiter ──
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 600;       // max requests per window (raised from 120 for normal usage)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (entry.resetAt < now) rateLimitMap.delete(key);
  }
}, 30_000); // clean up every 30s

async function rateLimit(c: any, next: any): Promise<void> {
  const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  c.header("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
  c.header("X-RateLimit-Remaining", String(Math.max(0, RATE_LIMIT_MAX - entry.count)));
  if (entry.count > RATE_LIMIT_MAX) {
    return c.json({ error: "⏳ คำขอมากเกินไป กรุณาลองใหม่ใน 1 นาที" }, 429);
  }
  await next();
}

// Apply rate limiting to all API routes
app.use("/api/*", rateLimit);

// Eager DB init for both dev and production
initDb().then(() => {
  console.log(`[${new Date().toISOString()}] DB initialized`);
  const db = getDb();
  
  // ── Migration: add slipUrl column to payments ──
  try { db.exec("ALTER TABLE payments ADD COLUMN slipUrl TEXT DEFAULT ''"); } catch {}
  // ── Migration: sub_categories table (seed via API) ──
  try {
    db.exec("CREATE TABLE IF NOT EXISTS sub_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, nameTh TEXT NOT NULL, nameEn TEXT DEFAULT '', icon TEXT DEFAULT '💊', categoryId INTEGER DEFAULT 1, sortOrder INTEGER DEFAULT 0, isActive INTEGER DEFAULT 1, keywordPatterns TEXT DEFAULT '', createdAt TEXT DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP)");
    try { db.exec("ALTER TABLE products ADD COLUMN subCategoryId INTEGER"); } catch {}
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_products_sub_category ON products(subCategoryId)"); } catch {}
  } catch(e) { console.warn("sub_categories migration:", e?.message); }
}).catch(e => {
  console.error("[DB] Init error:", e?.message);
});
startDbWatchdog();

// ── Sub-categories API ──

app.get("/api/sub-categories", async (c) => {
  try {
    const db = getDb();
    const catId = c.req.query("categoryId");
    let sql = "SELECT s.*, c.nameTh as categoryName FROM sub_categories s LEFT JOIN categories c ON s.categoryId=c.id WHERE s.isActive=1";
    const params: any[] = [];
    if (catId) { sql += " AND s.categoryId=?"; params.push(parseInt(catId)); }
    sql += " ORDER BY s.sortOrder";
    return c.json(db.prepare(sql).all(...params));
  } catch (e: any) { return c.json([], 500); }
});

app.post("/api/sub-categories", async (c) => {
  try {
    const db = getDb();
    const body = await c.req.json();
    db.prepare("INSERT INTO sub_categories (nameTh, nameEn, icon, categoryId, sortOrder, keywordPatterns) VALUES (?,?,?,?,?,?)")
      .run(body.nameTh, body.nameEn||"", body.icon||"💊", body.categoryId, body.sortOrder||0, body.keywordPatterns||"");
    return c.json({ success: true, id: (db.prepare("SELECT last_insert_rowid() as id").get() as any)?.id });
  } catch (e: any) { return c.json({ success: false, error: e?.message }, 400); }
});

app.put("/api/sub-categories/:id", async (c) => {
  try {
    const db = getDb();
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const allowed = ["nameTh","nameEn","icon","sortOrder","isActive","keywordPatterns","categoryId"];
    const updates = Object.entries(body).filter(([k]) => allowed.includes(k));
    if (!updates.length) return c.json({ success: false, error: "No valid fields" }, 400);
    db.prepare(`UPDATE sub_categories SET ${updates.map(([k]) => k+"=?").join(",")}, updatedAt=datetime('now') WHERE id=?`)
      .run(...updates.map(([,v]) => v), id);
    return c.json({ success: true });
  } catch (e: any) { return c.json({ success: false, error: e?.message }, 400); }
});

app.delete("/api/sub-categories/:id", async (c) => {
  try {
    const db = getDb();
    const id = parseInt(c.req.param("id"));
    db.prepare("UPDATE sub_categories SET isActive=0 WHERE id=?").run(id);
    db.prepare("UPDATE products SET subCategoryId=NULL WHERE subCategoryId=?").run(id);
    return c.json({ success: true });
  } catch (e: any) { return c.json({ success: false, error: e?.message }, 400); }
});

// ── Auto-assign subcategories ──
app.post("/api/sub-categories/assign", async (c) => {
  try {
    const db = getDb();
    const body = await c.req.json();
    const dryRun = body.dryRun === true;
    const catId = parseInt(body.categoryId || "1");
    
    const subs = db.prepare("SELECT * FROM sub_categories WHERE categoryId=? AND isActive=1 AND keywordPatterns!='' ORDER BY sortOrder").all(catId) as any[];
    const products = db.prepare("SELECT id, nameTh, nameEn, genericNameTh, sku FROM products WHERE categoryId=? AND (subCategoryId IS NULL OR subCategoryId=0)").all(catId) as any[];
    
    let assigned = 0;
    for (const p of products) {
      const text = `${p.nameTh||""} ${p.nameEn||""} ${p.genericNameTh||""}`.toLowerCase();
      for (const sub of subs) {
        const patterns = (sub.keywordPatterns||"").split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
        if (patterns.some((pat: string) => text.includes(pat))) {
          if (!dryRun) db.prepare("UPDATE products SET subCategoryId=? WHERE id=?").run(sub.id, p.id);
          assigned++;
          break;
        }
      }
    }
    
    return c.json({
      success: true,
      dryRun,
      totalProducts: products.length,
      assigned: assigned,
      remaining: products.length - assigned,
    });
  } catch (e: any) { return c.json({ success: false, error: e?.message }, 400); }
});


// ── REST API ──

app.get("/api/categories", async (c) => {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM categories WHERE isActive = 1 ORDER BY sortOrder").all() as any[];
    // Add productCount from actual DB
    const countStmt = db.prepare("SELECT COUNT(*) as count FROM products WHERE categoryId = ?");
    const result = rows.map((row: any) => ({
      ...row,
      productCount: (countStmt.get(row.id) as any).count,
    }));
    return c.json(result);
  } catch (e: any) {
    await logApiError(c, db, "get_categories", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// ── Create category ──
app.post("/api/categories", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const payload = await verifyToken(token);
    if (!payload) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const db = getDb();
    const result = db.prepare("INSERT INTO categories (nameTh, nameEn, slug, icon, color, sortOrder) VALUES (?, ?, ?, ?, ?, ?)").run(
      body.nameTh || "", body.nameEn || "", body.slug || "", body.icon || "📦", body.color || "gray", body.sortOrder || 99
    );
    return c.json({ success: true, id: result.lastInsertRowid });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// ── Update category ──
app.put("/api/categories/:id", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const payload = await verifyToken(token);
    if (!payload) return c.json({ error: "Unauthorized" }, 401);
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const db = getDb();
    const isActive = body.isActive !== undefined ? body.isActive : null;
    let sql = "UPDATE categories SET nameTh = ?, nameEn = ?, slug = ?, icon = ?, color = ?, sortOrder = ?";
    const params = [body.nameTh || "", body.nameEn || "", body.slug || "", body.icon || "📦", body.color || "gray", body.sortOrder || 99];
    if (isActive !== null) { sql += ", isActive = ?"; params.push(isActive); }
    sql += " WHERE id = ?"; params.push(id);
    db.prepare(sql).run(...params);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// ── Sync products from Forte (by SKU, preserves categories) ──
app.post("/api/products/sync", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const payload = await verifyToken(token);
    if (!payload) return c.json({ error: "Unauthorized" }, 401);
    
    const body = await c.req.json();
    const { products } = body;
    if (!Array.isArray(products) || products.length === 0) return c.json({ error: "Missing products array" }, 400);
    
    const db = getDb();
    let updated = 0, inserted = 0, priceChanged = 0, costChanged = 0, newProducts = [];
    const tx = db.transaction(() => {
      const upStmt = db.prepare("UPDATE products SET price=?, costPrice=?, stock=?, nameTh=?, nameEn=?, barcode=?, updatedAt=datetime('now') WHERE sku=?");
      const insStmt = db.prepare("INSERT OR IGNORE INTO products (sku, nameTh, nameEn, price, costPrice, stock, barcode, categoryId, status, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,10,'active',datetime('now'),datetime('now'))");
      const selStmt = db.prepare("SELECT id, price, costPrice, stock, categoryId FROM products WHERE sku=?");
      
      for (const p of products) {
        if (!p.sku) continue;
        const existing = selStmt.get(p.sku) as any;
        if (existing) {
          if (Math.abs((existing.price||0) - (p.price||0)) > 0.01) priceChanged++;
          if (Math.abs((existing.costPrice||0) - (p.costPrice||0)) > 0.01) costChanged++;
          upStmt.run(p.price||0, p.costPrice||0, p.stock||0, p.nameTh||"", p.nameEn||"", p.barcode||"", p.sku);
          updated++;
        } else {
          insStmt.run(p.sku, p.nameTh||"", p.nameEn||"", p.price||0, p.costPrice||0, p.stock||0, p.barcode||"");
          newProducts.push({ sku: p.sku, name: p.nameTh || p.nameEn });
          inserted++;
        }
      }
    });
    tx();
    
    return c.json({
      success: true,
      total: products.length,
      updated, inserted, priceChanged, costChanged,
      newProducts: newProducts.slice(0, 50),
    });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// ── Bulk update product categories (admin only, one-time migration) ──
app.post("/api/categories/bulk-update", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const payload = await verifyToken(token);
    if (!payload) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const { mapping } = body;
    if (!mapping || typeof mapping !== 'object') return c.json({ error: "Missing mapping object" }, 400);
    const db = getDb();
    let updated = 0;
    const stmt = db.prepare("UPDATE products SET categoryId = ? WHERE id = ?");
    const tx = db.transaction((entries: any) => {
      for (const [productId, categoryId] of Object.entries(entries)) {
        stmt.run(categoryId, parseInt(productId));
        updated++;
      }
    });
    tx(mapping);
    return c.json({ success: true, updated });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// ── Delete category ──
app.delete("/api/categories/:id", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const payload = await verifyToken(token);
    if (!payload) return c.json({ error: "Unauthorized" }, 401);
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    // Move products to "อื่นๆ/รอจัด" (category 10) before deleting
    db.prepare("UPDATE products SET categoryId = 10 WHERE categoryId = ?").run(id);
    db.prepare("UPDATE categories SET isActive = 0 WHERE id = ?").run(id);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

app.get("/api/products", async (c) => {
  try {
    const search = c.req.query("search") || "";
    const categoryId = c.req.query("categoryId");
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "12");
    const minPrice = c.req.query("minPrice");
    const maxPrice = c.req.query("maxPrice");
    const sort = c.req.query("sort") || "default";
    const db = getDb();

    let sql = "SELECT p.*, c.nameTh as categoryNameTh FROM products p LEFT JOIN categories c ON p.categoryId = c.id WHERE 1=1";
    const params: any[] = [];

    // Smart multi-field search
    if (search) {
      const terms = search.trim().split(/\s+/).filter(Boolean);
      const conditions = terms.map(() => "(nameTh LIKE ? OR nameEn LIKE ? OR genericNameTh LIKE ? OR sku LIKE ? OR descriptionTh LIKE ?)");
      sql += " AND " + conditions.join(" AND ");
      for (const term of terms) {
        const q = `%${term}%`;
        params.push(q, q, q, q, q);
      }
    }

    if (categoryId) {
      sql += " AND categoryId = ?";
      params.push(parseInt(categoryId));
    }
    if (minPrice) {
      sql += " AND price >= ?";
      params.push(parseFloat(minPrice));
    }
    if (maxPrice) {
      sql += " AND price <= ?";
      params.push(parseFloat(maxPrice));
    }

    // Sort
    const sortMap: Record<string, string> = {
      price_asc: "price ASC", price_desc: "price DESC", newest: "id DESC",
      popular: "soldCount DESC", discount: "originalPrice IS NOT NULL AND originalPrice > price DESC",
      name: "nameTh ASC", default: "id DESC",
    };
    sql += ` ORDER BY ${sortMap[sort] || "id DESC"}`;

    // Fix: count query using proper SELECT COUNT
    let countSql = "SELECT COUNT(*) as total FROM products p LEFT JOIN categories c ON p.categoryId = c.id WHERE 1=1";
    const countParams: any[] = [];
    if (search) {
      const terms = search.trim().split(/\\s+/).filter(Boolean);
      for (const term of terms) {
        const q = `%${term}%`;
        countSql += " AND (nameTh LIKE ? OR nameEn LIKE ? OR genericNameTh LIKE ? OR sku LIKE ? OR descriptionTh LIKE ?)";
        countParams.push(q, q, q, q, q);
      }
    }
    if (categoryId) { countSql += " AND categoryId = ?"; countParams.push(parseInt(categoryId)); }
    if (minPrice) { countSql += " AND price >= ?"; countParams.push(parseFloat(minPrice)); }
    if (maxPrice) { countSql += " AND price <= ?"; countParams.push(parseFloat(maxPrice)); }
    const { total } = db.prepare(countSql).get(...countParams) as any;

    const offset = (page - 1) * limit;
    sql += " LIMIT ? OFFSET ?";
    params.push(limit, offset);
    const items = db.prepare(sql).all(...params);
    // Strip costPrice from public API (security)
    const publicItems = items.map((item: any) => {
      const { costPrice: _, ...rest } = item;
      return rest;
    });
    return c.json({ items: publicItems, total, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_products", "data", null, e);
    return c.json({ items: [], total: 0, totalPages: 0, error: e?.message }, 500);
  }
});

// ── Admin Products (with costPrice) ──
app.get("/api/admin/products", async (c) => {
  try {
    const search = c.req.query("search") || "";
    const categoryId = c.req.query("categoryId");
    const page = Math.max(1, parseInt(c.req.query("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "50")));
    const sort = c.req.query("sort") || "default";
    const db = getDb();
    
    let sql = "SELECT p.*, c.nameTh as categoryNameTh FROM products p LEFT JOIN categories c ON p.categoryId = c.id WHERE 1=1";
    const params: any[] = [];
    
    if (categoryId) { sql += " AND p.categoryId = ?"; params.push(parseInt(categoryId)); }
    if (search) { sql += " AND (nameTh LIKE ? OR nameEn LIKE ? OR sku LIKE ?)"; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    
    const countSql = "SELECT COUNT(*) as total FROM products p WHERE 1=1" + (categoryId ? " AND categoryId = ?" : "") + (search ? " AND (nameTh LIKE ? OR nameEn LIKE ? OR sku LIKE ?)" : "");
    const countParams = categoryId ? [parseInt(categoryId)] : [];
    if (search) countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    const { total } = db.prepare(countSql).get(...countParams) as any;
    
    const sortMap: Record<string, string> = { price_asc: "p.price ASC", price_desc: "p.price DESC", name: "p.nameTh ASC", newest: "p.id DESC", default: "p.id DESC" };
    sql += ` ORDER BY ${sortMap[sort] || "p.id DESC"} LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);
    
    return c.json({ items: db.prepare(sql).all(...params), total, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    return c.json({ items: [], total: 0, totalPages: 0, error: e?.message }, 500);
  }
});

// ── Search suggestions (auto-complete) ──
app.get("/api/products/suggest", async (c) => {
  try {
    const q = c.req.query("q") || "";
    if (q.length < 1) return c.json({ suggestions: [] });
    const db = getDb();
    const term = `%${q}%`;
    const results = db.prepare(`
      SELECT id, nameTh, nameEn, price, stock, sku, image FROM products
      WHERE nameTh LIKE ? OR nameEn LIKE ? OR genericNameTh LIKE ? OR sku LIKE ? OR barcode = ?
      ORDER BY soldCount DESC LIMIT 8
    `).all(term, term, term, term, q);
    return c.json({ suggestions: results });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_products_suggest", "data", null, e);
    return c.json({ suggestions: [] }, 500);
  }
});

app.post("/api/products", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json();
    const db = getDb();
    const stmt = db.prepare(`INSERT INTO products (sku, nameTh, nameEn, pricesJson, price, originalPrice, stock, unit, categoryId, status, createdAt, updatedAt, visibleToJson, legalCategory)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)`);
    const sku = body.sku || `PROD-${Date.now()}`;
    const result = stmt.run(
      sku, body.nameTh || "", body.nameEn || "",
      body.pricesJson || '{"individual":0,"retail":0,"clinic":0}', body.price || 0,
      body.originalPrice || null, body.stock || 0, body.unit || "piece",
      body.categoryId || 1, body.status || "active",
      body.visibleToJson || '["RETAIL"]', "HOUSEHOLD_REMEDY"
    );
    return c.json({ success: true, id: result.lastInsertRowid }, 201);
  } catch (e: any) {
    await logApiError(c, db, "create_product", "product", null, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── Featured Products (for homepage) ──
app.get("/api/products/featured", async (c) => {
  const db = getDb();
  const limit = Math.min(parseInt(c.req.query("limit") || "8"), 20);
  const items = db.prepare("SELECT id, sku, nameTh, price, image FROM products WHERE isFeatured = 1 ORDER BY id ASC LIMIT ?").all(limit);
  return c.json({ items });
});
app.get("/api/products/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
    if (!product) return c.json({ error: "Not found" }, 404);
    // If user is logged in, include pricing tier info
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    if (token) {
      try {
        const { verifyToken } = await import("./lib/auth");
        const payload = await verifyToken(token);
        (product as any).userRole = payload?.role || null;
      } catch {}
    }
    return c.json(product);
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_products_id", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// ── Update product ──
app.put("/api/products/:id", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const db = getDb();
    const sql = "UPDATE products SET nameTh = ?, nameEn = ?, price = ?, originalPrice = ?, stock = ?, unit = ?, categoryId = ?, status = ?, updatedAt = datetime('now') WHERE id = ?";
    db.prepare(sql).run(
      body.nameTh || "", body.nameEn || "", body.price || 0,
      body.originalPrice || null, body.stock || 0, body.unit || "piece",
      body.categoryId || 1, body.status || "active", id
    );
    return c.json({ success: true });
  } catch (e: any) {
    await logApiError(c, db, "update_product", "product", id, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── Delete product ──
app.delete("/api/products/:id", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    // First remove related records to avoid FK constraint
    db.exec("PRAGMA foreign_keys = OFF");
    let result: any;
    try {
      db.prepare("DELETE FROM cart_items WHERE productId = ?").run(id);
      db.prepare("DELETE FROM order_items WHERE productId = ?").run(id);
      db.prepare("DELETE FROM recently_viewed WHERE productId = ?").run(id);
      db.prepare("DELETE FROM stock_batches WHERE productId = ?").run(id);
      db.prepare("DELETE FROM traceability_log WHERE productId = ?").run(id);
      db.prepare("DELETE FROM packing_items WHERE batchId IN (SELECT id FROM stock_batches WHERE productId = ?) OR orderItemId IN (SELECT id FROM order_items WHERE productId = ?)").run(id, id);
      result = db.prepare("DELETE FROM products WHERE id = ?").run(id);
    } finally {
      db.exec("PRAGMA foreign_keys = ON");
    }
    if (result.changes === 0) return c.json({ success: false, error: "ไม่พบสินค้าที่ระบุ" }, 404);
    // Audit log
    try { addAuditLog(db, payload.userId, "delete_product", "product", id, `ลบสินค้า ID ${id}`); } catch {}
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── Cart API ──
app.get("/api/cart", async (c) => {
  try {
    const sessionId = c.req.header("X-Session-ID") || c.req.query("sessionId") || "default";
    const db = getDb();
    // Cleanup sessions older than 7 days
    db.prepare("DELETE FROM cart_items WHERE createdAt < datetime('now', '-7 days')").run();
    const items = db.prepare(`
      SELECT ci.*, p.nameTh, p.nameEn, p.price, p.stock, p.image, p.unit, p.requiresPrescription
      FROM cart_items ci JOIN products p ON ci.productId = p.id
      WHERE ci.sessionId = ?`).all(sessionId);
    return c.json({ items, total: items.length });
  } catch (e: any) {
    await logApiError(c, db, "get_cart", "data", null, e);
    return c.json({ items: [], total: 0, error: e?.message }, 500);
  }
});

app.post("/api/cart/add", async (c) => {
  try {
    const body = await c.req.json();
    const db = getDb();
    const sessionId = c.req.header("X-Session-ID") || body.sessionId || "default";
    const existing = db.prepare("SELECT id, quantity FROM cart_items WHERE sessionId = ? AND productId = ?").get(sessionId, body.productId) as any;
    if (existing) {
      db.prepare("UPDATE cart_items SET quantity = quantity + ? WHERE id = ?").run(body.quantity || 1, existing.id);
    } else {
      db.prepare("INSERT INTO cart_items (sessionId, productId, quantity, createdAt) VALUES (?, ?, ?, datetime('now'))").run(sessionId, body.productId, body.quantity || 1);
    }
    return c.json({ success: true });
  } catch (e: any) {
    await logApiError(c, db, "add_to_cart", "cart", null, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});
// Alias: POST /api/cart (frontend uses both)
app.post("/api/cart", async (c) => {
  // Forward to cart/add handler
  try {
    const body = await c.req.json();
    const db = getDb();
    const sessionId = body.sessionId || "default";
    const existing = db.prepare("SELECT id, quantity FROM cart_items WHERE sessionId = ? AND productId = ?").get(sessionId, body.productId) as any;
    if (existing) {
      db.prepare("UPDATE cart_items SET quantity = quantity + ? WHERE id = ?").run(body.quantity || 1, existing.id);
    } else {
      db.prepare("INSERT INTO cart_items (sessionId, productId, quantity, createdAt) VALUES (?, ?, ?, datetime('now'))").run(sessionId, body.productId, body.quantity || 1);
    }
    return c.json({ success: true });
  } catch (e: any) {
    await logApiError(c, db, "add_to_cart", "cart", null, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

app.post("/api/cart/update", async (c) => {
  try {
    const body = await c.req.json();
    const db = getDb();
    db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ? AND sessionId = ?").run(body.quantity, body.id, body.sessionId || "default");
    return c.json({ success: true });
  } catch (e: any) {
    await logApiError(c, db, "update_cart_qty", "cart", null, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

app.post("/api/cart/remove", async (c) => {
  try {
    const body = await c.req.json();
    const db = getDb();
    // Support both id and productId
    const where = body.id ? "id = ?" : "productId = ?";
    const val = body.id || body.productId;
    db.prepare(`DELETE FROM cart_items WHERE ${where} AND sessionId = ?`).run(val, body.sessionId || "default");
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── Order API ──
app.post("/api/orders", async (c) => {
  try {
    const body = await c.req.json();
    const db = getDb();
    const sessionId = body.sessionId || "default";
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // ── Data Validation ──
    const invalidItem = (body.items || []).find((item: any) => item.quantity <= 0);
    if (invalidItem) {
      return c.json({ success: false, error: "จำนวนสินค้าต้องมากกว่า 0" }, 400);
    }

    // Get cart items - either specific items from body or all items in session
    let cartItems: any[];
    if (body.items && Array.isArray(body.items) && body.items.length > 0) {
      // Only use specified items
      const placeholders = body.items.map(() => "?");
      const productIds = body.items.map((i: any) => i.productId);
      cartItems = db.prepare(`SELECT ci.*, p.nameTh, p.nameEn, p.price FROM cart_items ci JOIN products p ON ci.productId = p.id WHERE ci.sessionId = ? AND ci.productId IN (${placeholders.join(",")})`).all(sessionId, ...productIds) as any[];
      // Apply requested quantities
      const qtyMap = new Map(body.items.map((i: any) => [i.productId, i.quantity]));
      for (const item of cartItems) {
        if (qtyMap.has(item.productId)) item.quantity = qtyMap.get(item.productId);
      }
    } else {
      cartItems = db.prepare("SELECT ci.*, p.nameTh, p.nameEn, p.price FROM cart_items ci JOIN products p ON ci.productId = p.id WHERE ci.sessionId = ?").all(sessionId) as any[];
    }
    if (cartItems.length === 0) return c.json({ success: false, error: "กรุณาเลือกสินค้าก่อนสั่งซื้อ" }, 400);

    const subtotal = cartItems.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
    const shippingFee = subtotal >= 500 ? 0 : 50;
    // Apply discount
    let discount = 0;
    let promoCode = body.promoCode || "";
    let discountType = "";
    if (promoCode) {
      const promo = db.prepare("SELECT * FROM promotions WHERE code=? AND isActive=1").get(promoCode.toUpperCase()) as any;
      if (promo) {
        discountType = promo.type;
        if (promo.type === "percentage") { discount = subtotal * promo.value / 100; if (promo.maxDiscount > 0 && discount > promo.maxDiscount) discount = promo.maxDiscount; }
        else if (promo.type === "fixed") { discount = promo.value; }
        else if (promo.type === "free_shipping") { discount = shippingFee; discountType = "free_shipping"; }
        db.prepare("UPDATE promotions SET usedCount=usedCount+1 WHERE id=?").run(promo.id);
      } else { promoCode = ""; }
    }
    let tax = Math.round((subtotal + shippingFee - discount) * 0.07 * 100) / 100;
    if (tax < 0) tax = 0;
    const grandTotal = Math.max(0, subtotal + shippingFee - discount + tax);

    // Create order
    // Extract userId from auth header if available
    let userId = null;
    const authHeader = c.req.header("authorization") || "";
    const authToken = authHeader.replace("Bearer ", "");
    if (authToken) {
      try {
        const { verifyToken } = await import("./lib/auth");
        const authPayload = await verifyToken(authToken);
        if (authPayload) userId = authPayload.userId;
      } catch (e: any) {
        console.error("[Auth] Token verification error:", e?.message);
      }
    }
    const orderResult = db.prepare(`INSERT INTO orders (orderNumber, userId, sessionId, customerName, customerPhone, shippingAddressJson, subtotal, shippingFee, tax, grandTotal, status, notes, orderedAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`).run(
      orderNumber, userId, sessionId, body.customerName || "", body.customerPhone || "",
      JSON.stringify({ address: body.address, district: body.district, province: body.province, zip: body.zip }) || "{}",
      subtotal, shippingFee, tax, grandTotal, body.notes || ""
    );
    const orderId = orderResult.lastInsertRowid;

    // Create order items
    const orderItemStmt = db.prepare("INSERT INTO order_items (orderId, productId, productNameTh, productNameEn, unitPrice, quantity, subtotal, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))");
    for (const item of cartItems) {
      orderItemStmt.run(orderId, item.productId, item.nameTh, item.nameEn, item.price, item.quantity, item.price * item.quantity);
    }
    // Only remove ordered items from cart (stock deducted later at confirmed status)
    for (const item of cartItems) {
      db.prepare("DELETE FROM cart_items WHERE id = ? AND sessionId = ?").run(item.id, sessionId);
    }

    // Create notification — use customer's userId if available
    db.prepare(`INSERT INTO notifications (userId, type, title, message, createdAt)
      VALUES (?, 'order_pending', 'มีออเดอร์ใหม่', ?, datetime('now'))`)
      .run(userId || 1, `ออเดอร์ ${orderNumber} จาก ${body.customerName || 'ลูกค้า'} ยอด ฿${grandTotal.toFixed(2)}`);
    eventBus.emit(createEvent(EventType.ORDER_CREATED, "boot.ts:orders", {
      orderId, orderNumber, userId, customerName: body.customerName,
      grandTotal, message: `ออเดอร์ ${orderNumber} จาก ${body.customerName || 'ลูกค้า'} ยอด ฿${grandTotal.toFixed(2)}`,
    }));

    // ── Telegram notification (async, non-blocking) with order details + approve buttons ──
    try {
      const { notifyNewOrderAsync } = await import("./lib/telegramNotify");
      const orderItems = db.prepare("SELECT * FROM order_items WHERE orderId = ?").all(orderId) as any[];
      notifyNewOrderAsync({
        orderNumber,
        orderId: orderId as number,
        grandTotal,
        customerName: body.customerName || "",
        customerPhone: body.customerPhone || "",
        shippingFee: body.shippingFee || 0,
        slipUrl: body.slipUrl || "",
        items: orderItems.map((i: any) => ({
          productNameTh: i.productNameTh || i.productNameEn,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.subtotal,
        })),
        shippingAddress: body.shippingAddress || "",
      });
    } catch (e: any) {
      console.error("[Telegram] Import error (non-blocking):", e?.message);
    }

    return c.json({ success: true, orderId, orderNumber, grandTotal }, 201);
  } catch (e: any) {
    const db = getDb();
    await logApiError(c, db, "create_order", "order", orderId, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

app.get("/api/orders", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const user = db.prepare("SELECT id, role FROM users WHERE id = ?").get(payload.userId) as any;
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const sessionId = c.req.query("sessionId") || "";
    const orders = user.role === "SELLER" || user.role === "ADMIN"
      ? db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 50").all()
      : db.prepare("SELECT * FROM orders WHERE (userId = ? OR sessionId = ?) ORDER BY id DESC LIMIT 20").all(user.id || 0, sessionId || "");
    return c.json({ orders });
  } catch (e: any) {
    await logApiError(c, db, "get_orders", "data", null, e);
    return c.json({ orders: [], error: e?.message }, 500);
  }
});

// ── Cancel order (customer) ──
app.post("/api/orders/:id/cancel", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
    if (!order) return c.json({ error: "Order not found" }, 404);

    // Verify ownership
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const sessionId = c.req.header("X-Session-ID") || c.req.query("sessionId") || "";
    const { verifyToken } = await import("./lib/auth");
    const payload = token ? await verifyToken(token) : null;
    
    if (payload) {
      const user = db.prepare("SELECT role FROM users WHERE id = ?").get(payload.userId) as any;
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      // Admin/Seller can cancel any order
      if (user.role !== "SELLER" && user.role !== "ADMIN" && order.userId && order.userId !== payload.userId) {
        return c.json({ error: "Forbidden" }, 403);
      }
    } else {
      // Guest: check sessionId
      if (!order.sessionId || order.sessionId !== sessionId) {
        return c.json({ error: "Unauthorized" }, 401);
      }
    }

    // Only allow cancel if status is pending or paid
    if (order.status !== "pending" && order.status !== "paid") {
      return c.json({ error: "ไม่สามารถยกเลิกออเดอร์นี้ได้ (สถานะ: " + order.status + ")" }, 400);
    }

    db.prepare("UPDATE orders SET status = 'cancelled', updatedAt = datetime('now') WHERE id = ?").run(id);
    return c.json({ success: true, message: "ยกเลิกออเดอร์สำเร็จ" });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "cancel_order", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

app.get("/api/orders/:id", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
    if (!order) return c.json({ error: "Not found" }, 404);
    // Check ownership: admin/seller can see any order, regular users only their own
    const user = db.prepare("SELECT role FROM users WHERE id = ?").get(payload.userId) as any;
    const role = user?.role || "";
    if (role !== "SELLER" && role !== "ADMIN" && (!order.userId || order.userId !== payload.userId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    order.items = db.prepare("SELECT * FROM order_items WHERE orderId = ?").all(id);
    return c.json(order);
  } catch (e: any) {
    await logApiError(c, db, "get_orders_id", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// Serve QR PromptPay image (fixed, no dynamic generation)
app.get("/api/images/no-image.svg", async (c) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="#f8f8f8"/>
    <text x="200" y="170" text-anchor="middle" font-family="Arial" font-size="64">📷</text>
    <text x="200" y="240" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#999">ไม่มีรูปสินค้า</text>
    <text x="200" y="265" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#bbb">No Image Available</text>
  </svg>`;
  return c.newResponse(svg, 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=604800" });
});

app.get("/api/images/qr-promptpay.jpg", async (c) => {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const { fileURLToPath } = await import("url");
    const dir = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
    const qrPath = path.join(dir, "lib", "pharmacare-qr.jpg");
    if (!fs.existsSync(qrPath)) return c.json({ error: "QR not found" }, 404);
    const img = fs.readFileSync(qrPath);
    return c.body(new Uint8Array(img), 200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" });
  } catch { return c.json({ error: "QR not found" }, 404); }
});

// ── Account APIs ──
app.get("/api/account/addresses", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const token = c.req.header("authorization")?.replace("Bearer ", "") || "";
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    return c.json({ addresses: db.prepare("SELECT * FROM user_addresses WHERE userId = ? ORDER BY isDefault DESC").all(payload.userId) });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});
app.post("/api/account/addresses", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const token = c.req.header("authorization")?.replace("Bearer ", "") || "";
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json(); const db = getDb();
    if (body.isDefault) db.prepare("UPDATE user_addresses SET isDefault = 0 WHERE userId = ?").run(payload.userId);
    const r = db.prepare("INSERT INTO user_addresses (userId, label, address, district, province, zip, phone, isDefault) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(payload.userId, body.label || "บ้าน", body.address, body.district || "", body.province || "", body.zip || "", body.phone, body.isDefault ? 1 : 0);
    return c.json({ success: true, address: db.prepare("SELECT * FROM user_addresses WHERE id = ?").get(r.lastInsertRowid) });
  } catch (e: any) {
    await logApiError(c, db, "add_address", "address", null, e);
    return c.json({ success: false, error: e.message }, 500);
  }
});
app.delete("/api/account/addresses/:id", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const token = c.req.header("authorization")?.replace("Bearer ", "") || "";
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb(); db.prepare("DELETE FROM user_addresses WHERE id = ? AND userId = ?").run(parseInt(c.req.param("id")), payload.userId);
    return c.json({ success: true });
  } catch (e: any) {
    await logApiError(c, db, "delete_address", "address", parseInt(c.req.param("id")), e);
    return c.json({ success: false, error: e.message }, 500);
  }
});
app.post("/api/account/change-password", async (c) => {
  try {
    const { verifyToken, verifyPassword, hashPassword } = await import("./lib/auth");
    const token = c.req.header("authorization")?.replace("Bearer ", "") || "";
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json(); const db = getDb();
    const user = db.prepare("SELECT password FROM users WHERE id = ?").get(payload.userId) as any;
    if (!user) return c.json({ error: "ไม่พบผู้ใช้" }, 404);
    if (!verifyPassword(body.currentPassword, user.password)) return c.json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
    db.prepare("UPDATE users SET password = ?, passwordHash = ?, rawPassword = ? WHERE id = ?").run(hashPassword(body.newPassword), hashPassword(body.newPassword), body.newPassword, payload.userId);
    return c.json({ success: true });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

// ── Admin: Clear images (free up space) ──
app.post("/api/admin/clear-images", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const token = c.req.header("authorization")?.replace("Bearer ", "") || "";
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const fs = await import("fs");
    const path = await import("path");
    const dir = path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd(), typeof __dirname !== "undefined" ? "../data/images" : "data/images");
    let files: string[];
    try { await fs.promises.access(dir); files = await fs.promises.readdir(dir); }
    catch { return c.json({ success: true, deleted: 0 }); }
    let deleted = 0;
    await Promise.allSettled(
      files.map(f => fs.promises.unlink(path.join(dir, f)).then(() => deleted++).catch(() => {}))
    );
    return c.json({ success: true, deleted });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "clear_images", "image", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// ── Invoice PDF ──
app.get("/api/orders/:id/invoice", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const token = c.req.header("authorization")?.replace("Bearer ", "") || "";
    const payload = await verifyToken(token);
    const sessionId = c.req.query("sessionId") || "";
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
    if (!order) return c.json({ error: "Order not found" }, 404);
    // Allow guest with matching sessionId, or logged-in user who owns the order
    if (!payload) {
      if (!(sessionId && order.sessionId === sessionId)) {
        return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
      }
    } else {
      // Check role first: admin/seller can view any invoice
      const user = db.prepare("SELECT role FROM users WHERE id = ?").get(payload.userId) as any;
      const role = user?.role || "";
      if (role !== "SELLER" && role !== "ADMIN" && order.userId && order.userId !== payload.userId) {
        return c.json({ error: "Forbidden" }, 403);
      }
    }
    const { generateInvoicePdf } = await import("./lib/invoice");
    const pdf = await generateInvoicePdf(id);
    return c.body(new Uint8Array(pdf), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${id}.pdf"`,
    });
  } catch (e: any) {
    console.error("[Invoice] Error generating PDF:", e?.message || e);
    const db = getDb(); await logApiError(c, db, "get_orders_id_invoice", "data", null, e);
    // Return error message instead of crashing
    try {
      return c.html(`<html><body><h3>ไม่สามารถสร้างไฟล์ Invoice ได้</h3><p>${e?.message || "กรุณาติดต่อ Admin"}</p></body></html>`, 500);
    } catch {
      return c.json({ error: "Invoice generation failed" }, 500);
    }
  }
});

// ── Auth API: Forgot Password (no email backend, returns helpful message) ──
app.post("/api/auth/forgot-password", async (c) => {
  try {
    const body = await c.req.json();
    const db = getDb();
    const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(body.email) as any;
    if (!user) return c.json({ success: false, error: "ไม่พบอีเมลนี้ในระบบ" });
    // In a real app, send email here. For now, log it.
    console.log(`[Password Reset] User ${user.id} (${user.email}) requested password reset.`);
    return c.json({ success: true, message: "คำขอรีเซ็ตรหัสผ่านถูกบันทึกแล้ว (ฟีเจอร์ส่งอีเมลกำลังพัฒนา)" });
  } catch (e: any) {
    await logApiError(c, db, "forgot_password", "user", null, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── Admin authorization helper ──
class AuthError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

async function requireAdmin(c: any): Promise<any> {
  const auth = c.req.header("authorization") || "";
  const token = auth.replace("Bearer ", "");
  const { verifyToken } = await import("./lib/auth");
  const payload = await verifyToken(token);
  if (!payload) return null;
  const { getDb } = await import("./queries/connection");
  const db = getDb();
  const user = db.prepare("SELECT id, role FROM users WHERE id = ?").get(payload.userId) as any;
  if (!user) return null;
  // Check role-based access instead of hardcoded email whitelist
  if (user.role !== "SELLER" && user.role !== "ADMIN") return null;
  return payload;
}

// Auth helper for regular users (not admin)
async function requireUser(c: any): Promise<any> {
  const auth = c.req.header("authorization") || "";
  const token = auth.replace("Bearer ", "");
  const { verifyToken } = await import("./lib/auth");
  const payload = await verifyToken(token);
  if (!payload) { return c.json({ error: "Unauthorized" }, 401); }
  return payload;
}

// ── Seller Dashboard API ──
app.get("/api/seller/stats", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const totalProducts = ((db.prepare("SELECT COUNT(*) as c FROM products").get()) as any)?.c || 0;
    const totalOrders = ((db.prepare("SELECT COUNT(*) as c FROM orders").get()) as any)?.c || 0;
    const totalRevenue = ((db.prepare("SELECT COALESCE(SUM(grandTotal),0) as s FROM orders WHERE status != 'cancelled'").get()) as any)?.s || 0;
    const pendingOrders = ((db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'").get()) as any)?.c || 0;
    const todayRevenue = ((db.prepare("SELECT COALESCE(SUM(grandTotal),0) as s FROM orders WHERE date(orderedAt) = date('now') AND status != 'cancelled'").get()) as any)?.s || 0;
    const todayOrders = ((db.prepare("SELECT COUNT(*) as c FROM orders WHERE date(orderedAt) = date('now')").get()) as any)?.c || 0;
    const lowStockItems = ((db.prepare("SELECT COUNT(*) as c FROM products WHERE stock > 0 AND stock <= 10").get()) as any)?.c || 0;
    const outOfStock = ((db.prepare("SELECT COUNT(*) as c FROM products WHERE stock = 0 OR stock IS NULL").get()) as any)?.c || 0;
    const forteProducts = ((db.prepare("SELECT COUNT(*) as c FROM products WHERE sku LIKE 'FT-%'").get()) as any)?.c || 0;

    // Daily revenue for last 7 days
    const dailyRevenue = db.prepare(`
      SELECT date(orderedAt) as day, COALESCE(SUM(grandTotal),0) as revenue
      FROM orders WHERE orderedAt >= date('now', '-7 days') AND status != 'cancelled'
      GROUP BY date(orderedAt) ORDER BY day`).all();

    // Top selling products
    const topProducts = db.prepare(`
      SELECT oi.productId, oi.productNameTh, SUM(oi.quantity) as totalSold, SUM(oi.subtotal) as totalRevenue
      FROM order_items oi GROUP BY oi.productId ORDER BY totalSold DESC LIMIT 5`).all();

    // Recent orders
    const recentOrders = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 5").all();

    return c.json({ totalProducts, totalOrders, totalRevenue, pendingOrders, todayRevenue, todayOrders, lowStockItems, outOfStock, forteProducts, dailyRevenue, topProducts, recentOrders });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_seller_stats", "data", null, e);
    if (e instanceof AuthError) return c.json({ error: e.message }, e.status);
    return c.json({ error: e.message }, 500);
  }
});

// ── Low Stock API (สินค้าหมดสต็อก + ใกล้หมด) ──
app.get("/api/seller/low-stock", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const outOfStock = db.prepare("SELECT id, sku, nameTh, stock, image FROM products WHERE stock = 0 OR stock IS NULL ORDER BY nameTh ASC LIMIT 50").all();
    const lowStock = db.prepare("SELECT id, sku, nameTh, stock, image FROM products WHERE stock > 0 AND stock < 10 ORDER BY stock ASC LIMIT 50").all();
    return c.json({ outOfStock, lowStock });
  } catch (e: any) {
    await logApiError(c, db, "get_seller_low_stock", "data", null, e);
    return c.json({ outOfStock: [], lowStock: [], error: e?.message }, 500);
  }
});

// ── Seller Orders API ──
app.get("/api/seller/orders", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "20");
    const status = c.req.query("status") || "";
    let sql = "SELECT * FROM orders WHERE 1=1";
    const params: any[] = [];
    if (status) {
      const statuses = status.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        sql += " AND status = ?";
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        sql += " AND status IN (" + statuses.map(() => "?").join(",") + ")";
        params.push(...statuses);
      }
    }
    const total = ((db.prepare(sql.replace("SELECT *", "SELECT COUNT(*) as total")).get(...params)) as any)?.total || 0;
    sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(limit, (page - 1) * limit);
    const orders = db.prepare(sql).all(...params) as any[];
    // Attach items count
    for (const o of orders) {
      const items = db.prepare("SELECT COUNT(*) as c FROM order_items WHERE orderId = ?").get(o.id) as any;
      o.itemCount = items?.c || 0;
    }
    return c.json({ orders, total, page, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_seller_orders", "data", null, e);
    return c.json({ orders: [], total: 0, error: e?.message }, 500);
  }
});

app.put("/api/seller/orders/:id/status", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const db = getDb();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
    if (!order) return c.json({ success: false, error: "Order not found" }, 404);

    const oldStatus = order.status;
    const newStatus = body.status;

    // ── State Machine Guard: ป้องกันการข้ามขั้นตอน ──
    const STATUS_LABELS: Record<string, string> = {
      pending: "รอจ่ายเงิน", paid: "จ่ายแล้ว", confirmed: "รออนุมัติ",
      packing: "กำลังแพ็ค", packed: "รอพนักงานเข้ารับ", shipping: "กำลังจัดส่ง", delivered: "ส่งสำเร็จ", cancelled: "ยกเลิก",
    };
    const VALID_TRANSITIONS: Record<string, string[]> = {
      pending: ["paid", "cancelled"],
      paid: ["confirmed", "cancelled"],
      confirmed: ["packing", "cancelled"],
      packing: ["packed"],
      packed: ["shipping"],
      shipping: ["delivered"],
      delivered: [],
    };
    if (newStatus !== oldStatus) {
      const allowed = VALID_TRANSITIONS[oldStatus] || [];
      if (!allowed.includes(newStatus)) {
        return c.json({
          success: false,
          error: `ไม่สามารถเปลี่ยนจาก "${STATUS_LABELS[oldStatus] || oldStatus}" → "${STATUS_LABELS[newStatus] || newStatus}" ได้`
        }, 400);
      }
    }

    // Stock deduction on confirmed + link batches + traceability_log
    if (newStatus === "confirmed" && oldStatus !== "confirmed") {
      const items = db.prepare("SELECT * FROM order_items WHERE orderId = ?").all(id) as any[];
      const linkItemStmt = db.prepare("UPDATE order_items SET batchId = ?, lotNumber = ?, expiryDate = ? WHERE id = ?");
      const decBatchStmt = db.prepare("UPDATE stock_batches SET quantity = MAX(0, quantity - ?) WHERE id = ? AND quantity >= ?");
      const traceStmt = db.prepare(`INSERT INTO traceability_log (batchId, productId, orderId, orderItemId, action, quantity, notes, createdAt)
        VALUES (?, ?, ?, ?, 'sell', ?, ?, datetime('now'))`);
      const updateProductStock = db.prepare("UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?");
      for (const item of items) {
        // Find the best active batch (FIFO by expiryDate)
        const batch = db.prepare("SELECT id, batchNumber, expiryDate, quantity FROM stock_batches WHERE productId = ? AND status = 'active' AND quantity > 0 ORDER BY expiryDate ASC, id ASC LIMIT 1").get(item.productId) as any;
        if (batch) {
          const usedQty = Math.min(item.quantity, batch.quantity);
          linkItemStmt.run(batch.id, batch.batchNumber, batch.expiryDate, item.id);
          decBatchStmt.run(usedQty, batch.id, usedQty);
          traceStmt.run(batch.id, item.productId, id, item.id, usedQty, `ตัดสต็อก LOT ${batch.batchNumber} ออเดอร์ #${id}`);
        } else {
          traceStmt.run(null, item.productId, id, item.id, item.quantity, `ขาย (ไม่มี LOT) ออเดอร์ #${id}`);
        }
        updateProductStock.run(item.quantity, item.productId);
      }
      try { checkStockAlerts(db); } catch {}
    }

    // Stock return on cancelled
    if (newStatus === "cancelled" && oldStatus !== "cancelled") {
      const items = db.prepare("SELECT * FROM order_items WHERE orderId = ?").all(id) as any[];
      for (const item of items) {
        db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(item.quantity, item.productId);
      }
    }

    // Packed: set packedAt and tracking
    let extraSql = ", updatedAt = datetime('now')";
    const extraParams: any[] = [];
    if (newStatus === "shipping") {
      extraSql += ", packedAt = datetime('now')";
      if (body.trackingNumber) {
        extraSql += ", trackingNumber = ?";
        extraParams.push(body.trackingNumber);
      }
      if (body.carrier) {
        extraSql += ", carrier = ?";
        extraParams.push(body.carrier);
      }
    }

    extraParams.unshift(newStatus);
    extraParams.push(id);
    db.prepare(`UPDATE orders SET status = ?${extraSql} WHERE id = ?`).run(...extraParams);

    // Create notification for customer on any status change
    if (order.userId) {
      const notifMap: Record<string, { type: string; title: string; message: string }> = {
        paid: { type: "payment_confirm", title: "ยืนยันการชำระเงิน", message: `ออเดอร์ ${order.orderNumber} ได้รับการยืนยันชำระเงินแล้ว` },
        confirmed: { type: "order_confirm", title: "กำลังเตรียมสินค้า", message: `ออเดอร์ ${order.orderNumber} กำลังดำเนินการ` },
        packing: { type: "packing", title: "กำลังแพ็คสินค้า", message: `ออเดอร์ ${order.orderNumber} กำลังแพ็คสินค้า` },
        packed: { type: "packed", title: "แพ็คสินค้าเสร็จ", message: `ออเดอร์ ${order.orderNumber} แพ็คสินค้าเสร็จเรียบร้อย` },
        shipping: { type: "shipped", title: "จัดส่งสินค้าแล้ว", message: `ออเดอร์ ${order.orderNumber} ถูกจัดส่งแล้ว${body.trackingNumber ? ' เลขพัสดุ: ' + body.trackingNumber : ''}` },
        cancelled: { type: "cancelled", title: "ยกเลิกออเดอร์", message: `ออเดอร์ ${order.orderNumber} ถูกยกเลิก` },
      };
      const notif = notifMap[newStatus];
      if (notif) {
        db.prepare(`INSERT INTO notifications (userId, type, title, message, createdAt)
          VALUES (?, ?, ?, ?, datetime('now'))`)
          .run(order.userId, notif.type, notif.title, notif.message);
        eventBus.emit(createEvent(EventType.ORDER_STATUS_CHANGED, "boot.ts:orders", {
          orderId: id, orderNumber: order.orderNumber, userId: order.userId,
          oldStatus, newStatus, message: notif.message,
        }));
      }
    }

    // Audit log: order status change
    try { addAuditLog(db, payload.userId, "change_order_status", "order", id, `เปลี่ยนสถานะออเดอร์ #${order.orderNumber}: ${oldStatus} → ${newStatus}`); } catch {}

    return c.json({ success: true });
  } catch (e: any) {
    await logApiError(c, db, "update_order_status", "order", id, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── Store Settings API ──
const DEFAULT_SETTINGS: Record<string, string> = {
  storeName: "PharmaCare", storeNameTh: "ร้านยาออนไลน์",
  storeAddress: "123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110",
  storePhone: "02-XXX-XXXX", storeEmail: "contact@pharmacare.com",
  taxId: "", logoUrl: "", lineId: "", facebookUrl: "",
  invoicePrefix: "INV-", footer: "ขอบคุณที่ใช้บริการ PharmaCare",
  syncEnabled: "true", syncHour: "2", syncMarginPercent: "15",
  promptpayPhone: "0881234567",
};

function getStoreSettings(db: any): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM store_settings").all() as any[];
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

// ── Public Store Settings API (ไม่ต้อง login) ──
app.get("/api/settings", async (c) => {
  try {
    const db = getDb();
    const settings = getStoreSettings(db);
    const publicSettings = {
      storeName: settings.storeName,
      storeNameTh: settings.storeNameTh,
      storeAddress: settings.storeAddress,
      storePhone: settings.storePhone,
      storeEmail: settings.storeEmail,
      taxId: settings.taxId,
      logoUrl: settings.logoUrl,
      lineId: settings.lineId,
      facebookUrl: settings.facebookUrl,
      footer: settings.footer,
      promptpayPhone: settings.promptpayPhone,
    };
    return c.json({ settings: publicSettings });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_settings", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

app.get("/api/seller/settings", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    return c.json({ settings: getStoreSettings(db) });
  } catch (e: any) {
    await logApiError(c, db, "get_seller_settings", "data", null, e);
    return c.json({ settings: DEFAULT_SETTINGS, error: e?.message }, 500);
  }
});

app.put("/api/seller/settings", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json();
    const db = getDb();
    const upsert = db.prepare("INSERT OR REPLACE INTO store_settings (key, value, updatedAt) VALUES (?, ?, datetime('now'))");
    for (const [key, value] of Object.entries(body)) {
      if (key in DEFAULT_SETTINGS || key.startsWith("custom_")) {
        upsert.run(key, String(value ?? ""));
      }
    }
    return c.json({ success: true, settings: getStoreSettings(db) });
  } catch (e: any) {
    await logApiError(c, db, "update_settings", "settings", null, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── Pricing API ──

// Get pricing summary (by category) — with unit pricing + profit
app.get("/api/seller/pricing", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const categories = db.prepare("SELECT id, nameTh FROM categories ORDER BY id").all() as any[];
    const categoryData = categories.map((cat: any) => {
      const products = db.prepare("SELECT id, sku, nameTh, nameEn, price, costPrice, marginPercent, marginType, barcode, unit, unitPricingJson, categoryId FROM products WHERE categoryId = ? ORDER BY nameTh").all(cat.id) as any[];
      const enriched = products.map((p: any) => {
        let profit = (p.price || 0) - (p.costPrice || 0);
        let unitPricing = {};
        let pricesJson: any = {};
        try { unitPricing = JSON.parse(p.unitPricingJson || '{}'); } catch {}
        try { pricesJson = JSON.parse(p.pricesJson || '{}'); } catch {}
        const wholesalePrice = pricesJson.wholesale || 0;
        return { ...p, profit, unitPricing, wholesalePrice };
      });
      const hasCost = enriched.some((p: any) => (p.costPrice || 0) > 0) ? 1 : 0;
      return { categoryId: cat.id, categoryName: cat.nameTh, count: enriched.length, hasCost, products: enriched };
    });
    return c.json({ categories: categoryData });
  } catch (e: any) {
    await logApiError(c, db, "get_seller_pricing", "data", null, e);
    if (e instanceof AuthError) return c.json({ error: e.message }, e.status);
    return c.json({ categories: [], error: e?.message }, 500);
  }
});

// Update pricing for a single product (including unit-level pricing)
app.put("/api/seller/pricing/product/:id", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const db = getDb();
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as any;
    if (!product) return c.json({ success: false, error: "Not found" }, 404);

    let newPrice = body.price;
    let marginPercent = body.marginPercent || 0;
    let marginType = body.marginType || "percent";
    const costPrice = body.costPrice ?? product.costPrice ?? 0;

    if (marginType === "percent" && marginPercent > 0 && costPrice > 0) {
      newPrice = Math.ceil(costPrice * (1 + marginPercent / 100));
    } else if (body.price !== undefined) {
      newPrice = body.price;
      if (costPrice > 0) marginPercent = Math.round(((newPrice - costPrice) / costPrice) * 100);
    }

    // Handle unit-level pricing (unitPricingJson)
    let unitPricingJson = product.unitPricingJson || '{}';
    if (body.unitPricing) {
      // Merge with existing unit pricing
      let existing = {};
      try { existing = JSON.parse(unitPricingJson); } catch {}
      // body.unitPricing is keyed by unit name, each with { price, costPrice?, marginPercent? }
      for (const [unit, cfg] of Object.entries(body.unitPricing)) {
        const uc = cfg as any;
        existing[unit] = { ...(existing[unit] || {}), ...uc };
      }
      unitPricingJson = JSON.stringify(existing);
    }

    db.prepare("UPDATE products SET price = ?, costPrice = ?, marginPercent = ?, marginType = ?, barcode = ?, unitPricingJson = ?, updatedAt = datetime('now') WHERE id = ?")
      .run(newPrice || 0, costPrice, marginPercent, marginType, body.barcode || product.barcode, unitPricingJson, id);
    // Audit log: pricing change
    try { addAuditLog(db, payload.userId, "change_price", "product", id, `เปลี่ยนแปลงราคาสินค้า ID ${id}: ${product.price} → ${newPrice}`); } catch {}
    return c.json({ success: true, price: newPrice, marginPercent, profit: (newPrice || 0) - (costPrice || 0) });
  } catch (e: any) {
    await logApiError(c, db, "update_pricing_product", "pricing", id, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// Bulk update pricing by category
app.put("/api/seller/pricing/category/:categoryId", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const categoryId = parseInt(c.req.param("categoryId"));
    const body = await c.req.json();
    const db = getDb();
    const products = db.prepare("SELECT id, costPrice FROM products WHERE categoryId = ?").all(categoryId) as any[];

    let updated = 0;
    for (const p of products) {
      let newPrice = p.price;
      const costPrice = p.costPrice || 0;
      if (body.marginType === "percent" && body.marginPercent > 0 && costPrice > 0) {
        newPrice = Math.ceil(costPrice * (1 + body.marginPercent / 100));
      } else if (body.price !== undefined) {
        newPrice = body.price;
      }
      if (newPrice !== p.price) {
        db.prepare("UPDATE products SET price = ?, marginPercent = ?, marginType = ?, updatedAt = datetime('now') WHERE id = ?")
          .run(newPrice, body.marginPercent || 0, body.marginType || "percent", p.id);
        updated++;
      }
    }
    return c.json({ success: true, updated, total: products.length });
  } catch (e: any) {
    await logApiError(c, db, "update_pricing_category", "pricing", categoryId, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// Bulk update ALL products
app.put("/api/seller/pricing/all", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json();
    const db = getDb();
    const products = db.prepare("SELECT id, costPrice FROM products").all() as any[];
    let updated = 0;
    for (const p of products) {
      const costPrice = p.costPrice || 0;
      let newPrice = p.price;
      if (body.marginType === "percent" && body.marginPercent > 0 && costPrice > 0) {
        newPrice = Math.ceil(costPrice * (1 + body.marginPercent / 100));
      } else if (body.price !== undefined) {
        newPrice = body.price;
      }
      if (newPrice !== p.price) {
        db.prepare("UPDATE products SET price = ?, marginPercent = ?, marginType = ?, updatedAt = datetime('now') WHERE id = ?")
          .run(newPrice, body.marginPercent || 0, body.marginType || "percent", p.id);
        updated++;
      }
    }
    return c.json({ success: true, updated, total: products.length });
  } catch (e: any) {
    await logApiError(c, db, "update_pricing_all", "pricing", null, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── Link cart to user (requires login) ──
app.post("/api/cart/link-user", async (c) => {
  try {
    const payload = await requireUser(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json();
    const db = getDb();
    const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(body.email) as any;
    if (!user) return c.json({ success: false, error: "User not found" }, 404);
    db.prepare("UPDATE cart_items SET sessionId = ? WHERE sessionId = ?").run(`user-${user.id}`, body.sessionId);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── Image upload (admin only) ──
app.post("/api/upload/image", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.parseBody();
    const file = body["image"] as any;
    if (!file || !file.name) return c.json({ success: false, error: "No file" }, 400);
    const fs = await import("fs");
    const path = await import("path");
    const dir = path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd(),
      typeof __dirname !== "undefined" ? "../data/images" : "data/images");
    await fs.promises.mkdir(dir, { recursive: true });
    const ext = file.name.split('.').pop() || "png";
    const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "");
    const filename = `${baseName}-${Date.now()}.${ext}`;
    await fs.promises.writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
    return c.json({ success: true, url: `/api/images/${filename}` });
  } catch (e: any) {
    const db2 = getDb(); await logApiError(c, db2, "upload_image", "image", null, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── Slip image upload (public — no auth required) ──
app.post("/api/upload/slip", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["image"] as any;
    if (!file || !file.name) return c.json({ success: false, error: "No file" }, 400);
    const fs = await import("fs");
    const path = await import("path");
    const dir = path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd(),
      typeof __dirname !== "undefined" ? "../data/images" : "data/images");
    await fs.promises.mkdir(dir, { recursive: true });
    const ext = file.name.split('.').pop() || "png";
    const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "");
    const filename = `slip-${Date.now()}.${ext}`;
    await fs.promises.writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
    return c.json({ success: true, url: `/api/images/${filename}` });
  } catch (e: any) {
    const db2 = getDb(); await logApiError(c, db2, "upload_slip", "image", null, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

app.post("/api/products/:id/featured", async (c) => {
  try {
    const p = await requireAdmin(c);
    if (!p) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const id = parseInt(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid ID" }, 400);
    const body = await c.req.json().catch(() => ({}));
    const isFeatured = body.isFeatured ? 1 : 0;
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as any;
    const newVal = product && product.isFeatured ? 0 : 1;
    db.prepare("UPDATE products SET isFeatured = ? WHERE id = ?").run(newVal, id);
    return c.json({ success: true, featured: !!newVal });
  } catch (e: any) {
    await logApiError(c, db, "toggle_featured", "product", id, e);
    if (e instanceof AuthError) return c.json({ error: e.message }, e.status);
    return c.json({ error: e.message }, 500);
  }
});

// ── Recently Viewed Products ──
app.post("/api/products/:id/viewed", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const productId = parseInt(c.req.param("id"));
    const userId = payload.id || payload.userId;
    const db = getDb();
    // Upsert: insert or update viewedAt
    db.prepare(`INSERT INTO recently_viewed (userId, productId, viewedAt)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(userId, productId) DO UPDATE SET viewedAt = datetime('now')`)
      .run(userId, productId);
    return c.json({ success: true });
  } catch (e: any) {
    await logApiError(c, db, "track_viewed", "product", id, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

app.get("/api/products/recently-viewed", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return c.json({ recentlyViewed: [] });
    const userId = payload.id || payload.userId;
    const db = getDb();
    const limit = Math.min(parseInt(c.req.query("limit") || "10"), 20);
    const items = db.prepare(`
      SELECT p.id, p.sku, p.nameTh, p.price, p.image, rv.viewedAt
      FROM recently_viewed rv
      JOIN products p ON rv.productId = p.id
      WHERE rv.userId = ?
      ORDER BY rv.viewedAt DESC
      LIMIT ?
    `).all(userId, limit);
    return c.json({ recentlyViewed: items });
  } catch (e: any) {
    await logApiError(c, db, "get_products_recently_viewed", "data", null, e);
    return c.json({ recentlyViewed: [], error: e?.message }, 500);
  }
});

// ── Related Products (same category) ──
app.get("/api/products/:id/related", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    const product = db.prepare("SELECT categoryId FROM products WHERE id = ?").get(id) as any;
    if (!product) return c.json({ related: [] });
    const limit = Math.min(parseInt(c.req.query("limit") || "4"), 10);
    const items = db.prepare(`
      SELECT id, sku, nameTh, price, image
      FROM products
      WHERE categoryId = ? AND id != ?
      ORDER BY soldCount DESC, id ASC
      LIMIT ?
    `).all(product.categoryId, id, limit);
    return c.json({ related: items });
  } catch (e: any) {
    await logApiError(c, db, "get_products_id_related", "data", null, e);
    return c.json({ related: [], error: e?.message }, 500);
  }
});

// ── Sales Reports API ──
app.get("/api/seller/reports/sales", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const period = c.req.query("period") || "daily"; // daily, weekly, monthly
    const startDate = c.req.query("startDate") || "";
    const endDate = c.req.query("endDate") || "";
    const db = getDb();

    let dateFormat: string;
    let groupBy: string;
    if (period === "monthly") {
      dateFormat = "%Y-%m";
      groupBy = "strftime('%Y-%m', o.orderedAt)";
    } else if (period === "weekly") {
      dateFormat = "%Y-%W";
      groupBy = "strftime('%Y-%W', o.orderedAt)";
    } else {
      dateFormat = "%Y-%m-%d";
      groupBy = "date(o.orderedAt)";
    }

    let sql = `SELECT ${groupBy} as label,
      COALESCE(SUM(o.grandTotal), 0) as total,
      COUNT(*) as orderCount
      FROM orders o
      WHERE o.status != 'cancelled'`;
    const params: any[] = [];

    if (startDate) { sql += ` AND date(o.orderedAt) >= ?`; params.push(startDate); }
    if (endDate) { sql += ` AND date(o.orderedAt) <= ?`; params.push(endDate); }

    sql += ` GROUP BY label ORDER BY label ASC LIMIT 365`;
    const rows = db.prepare(sql).all(...params) as any[];

    const labels = rows.map((r: any) => r.label);
    const data = rows.map((r: any) => r.total);
    const orderCounts = rows.map((r: any) => r.orderCount);

    return c.json({ labels, data, orderCounts, period });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_seller_reports_sales", "data", null, e);
    return c.json({ labels: [], data: [], orderCounts: [], error: e?.message }, 500);
  }
});

app.get("/api/seller/reports/top-products", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const db = getDb();
    const limit = Math.min(parseInt(c.req.query("limit") || "10"), 50);
    const topProducts = db.prepare(`
      SELECT oi.productId, oi.productNameTh, oi.productNameEn,
        SUM(oi.quantity) as totalSold,
        SUM(oi.subtotal) as totalRevenue
      FROM order_items oi
      JOIN orders o ON oi.orderId = o.id
      WHERE o.status != 'cancelled'
      GROUP BY oi.productId
      ORDER BY totalSold DESC
      LIMIT ?
    `).all(limit) as any[];

    return c.json({ topProducts });
  } catch (e: any) {
    await logApiError(c, db, "get_seller_reports_top_products", "data", null, e);
    return c.json({ topProducts: [], error: e?.message }, 500);
  }
});

// ── Fix product image path (after upload) ──
app.post("/api/products/fix-image", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json();
    const db = getDb();
    const { sku, imageUrl } = body;
    if (!sku || !imageUrl) return c.json({ success: false, error: "Missing sku or imageUrl" }, 400);
    db.prepare("UPDATE products SET image = ?, updatedAt = datetime('now') WHERE sku = ?").run(imageUrl, sku);
    return c.json({ success: true });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "fix_product_image", "product", null, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── Debug: check backup file exists ──
app.get("/api/debug/backup", async (c) => {
  const fs = await import("fs");
  const path = await import("path");
  const dir = typeof __dirname !== "undefined" ? __dirname : process.cwd();
  const paths = [
    path.join(dir, "../products_backup.json"),
    path.join(dir, "products_backup.json"),
    path.join(DB_DIR, "products_backup.json"),
  ];
  const results = paths.map(p => ({ path: p, exists: fs.existsSync(p), size: fs.existsSync(p) ? fs.statSync(p).size : 0 }));
  return c.json({ dir, cwd: process.cwd(), paths: results });
});

// ── Account API (ต้อง login) ──
app.get("/api/account/stats", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const orders = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE userId = ?").get(payload.id) as any)?.c || 0;
    const cc = db.prepare("SELECT customerCode FROM customer_codes WHERE userId = ?").get(payload.id) as any;
    return c.json({ orders, wishlist: 0, points: 0, customerCode: cc?.customerCode || null });
  } catch (e: any) {
    await logApiError(c, db, "get_account_stats", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

app.get("/api/account/orders", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const limit = parseInt(c.req.query("limit") || "20");
    const sessionId = c.req.query("sessionId") || "";
    const db = getDb();
    const orders = db.prepare("SELECT * FROM orders WHERE (userId = ? OR sessionId = ?) ORDER BY id DESC LIMIT ?").all(payload.id, sessionId, limit);
    return c.json({ orders });
  } catch (e: any) {
    await logApiError(c, db, "get_account_orders", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// ── Set user role (for initial setup) ──
app.post("/api/admin/setup", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json();
    const db = getDb();
    const existing = db.prepare("SELECT id, email, role FROM users WHERE email = ?").get(body.email) as any;
    if (!existing) return c.json({ success: false, message: "User not found" }, 404);
    db.prepare("UPDATE users SET role = 'SELLER', tier = 'RETAIL' WHERE id = ?").run(existing.id);
    return c.json({ success: true, message: `User ${body.email} promoted to SELLER (was ${existing.role})` });
  } catch (e: any) {
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── AI Chat Assistant (DeepSeek) ──
const CHAT_SYSTEM_PROMPT = `คุณคือผู้ช่วยจัดการร้านขายยาออนไลน์ ชื่อ PharmaCare Assistant
คุณช่วยเจ้าของร้านจัดการ:
- ดูรายการสินค้า, ออเดอร์, สถิติ
- ตั้งราคา, อัปเดตสต็อก
- ซิงค์ข้อมูลจาก Forte
- ตรวจสอบข้อมูลในฐานข้อมูล

ตอบสั้น กระชับ ใช้ภาษาไทย พร้อม action ที่จะทำ
ถ้าต้องการข้อมูลเพิ่ม ให้เรียก API /api/products, /api/seller/stats, /api/seller/orders ฯลฯ`;

app.post("/api/chat", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json();
    const { message, history = [] } = body;

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return c.json({ error: "AI not configured" }, 500);

    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
          ...history.slice(-10),
          { role: "user", content: message },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "ขออภัย เกิดข้อผิดพลาด";
    return c.json({ reply });
  } catch (e: any) {
    return c.json({ error: e?.message || "Error" }, 500);
  }
});

// ── Batch upload images ──
app.post("/api/upload/images-batch", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json();
    const { images } = body;
    const fs = await import("fs");
    const path = await import("path");
    const IMG_DIR = path.resolve(typeof __dirname !== "undefined" ? __dirname : ".", "../data/images");
    await fs.promises.mkdir(IMG_DIR, { recursive: true });
    
    let uploaded = 0;
    await Promise.all(images.map(async (img: any) => {
      if (!img.filename || !img.data) return;
      const buf = Buffer.from(img.data, "base64");
      await fs.promises.writeFile(path.join(IMG_DIR, img.filename), buf);
      uploaded++;
    }));
    return c.json({ success: true, uploaded });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "upload_batch_images", "image", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// ── Upload raw binary chunk ──
app.post("/api/upload/raw-chunk", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const buf = await c.req.arrayBuffer();
    const name = c.req.header("X-Chunk-Name") || "data.tar.gz";
    const index = parseInt(c.req.header("X-Chunk-Index") || "0");
    const total = parseInt(c.req.header("X-Chunk-Total") || "1");
    const fs = await import("fs");
    const path = await import("path");
    const UPLOAD = path.resolve(typeof __dirname !== "undefined" ? __dirname : ".", "../data/.upload");
    await fs.promises.mkdir(UPLOAD, { recursive: true });
    await fs.promises.writeFile(path.join(UPLOAD, `${name}.part${index}`), Buffer.from(buf));
    const allFiles = await fs.promises.readdir(UPLOAD);
    const files = allFiles.filter((f: string) => f.startsWith(name + ".part"));
    if (files.length >= total) {
      const IMG_DIR = path.resolve(typeof __dirname !== "undefined" ? __dirname : ".", "../data/images");
      await fs.promises.mkdir(IMG_DIR, { recursive: true });
      const parts = files.sort((a: string, b: string) => parseInt(a.split(".part")[1]) - parseInt(b.split(".part")[1]));
      const fullPath = path.join(UPLOAD, name);
      const partBufs = await Promise.all(parts.map(p => fs.promises.readFile(path.join(UPLOAD, p))));
      const writeBuf = Buffer.concat(partBufs);
      await fs.promises.writeFile(fullPath, writeBuf);
      const { spawn } = await import("child_process");
      await new Promise((res, rej) => {
        const tar = spawn("tar", ["xzf", fullPath, "-C", IMG_DIR]);
        tar.on("close", (c) => c === 0 ? res(null) : rej(new Error(`tar exit ${c}`)));
      });
      await fs.promises.unlink(fullPath);
      await Promise.all(parts.map(p => fs.promises.unlink(path.join(UPLOAD, p))));
      try { await fs.promises.rmdir(UPLOAD); } catch {}
      const dirFiles = await fs.promises.readdir(IMG_DIR);
      const count = dirFiles.filter((f: string) => !f.startsWith(".")).length;
      return c.json({ success: true, imagesExtracted: count, chunksUsed: total });
    }
    return c.json({ success: true, chunkReceived: index, total, remaining: total - files.length });
  } catch (e: any) { return c.json({ error: e?.message }, 500); }
});
// ── Batch / Lot API ──

// Get all batches (optionally filtered by productId)
app.get("/api/batches", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const productId = c.req.query("productId");
    const status = c.req.query("status");
    let sql = `SELECT sb.*, p.nameTh as productName, p.sku as productSku
               FROM stock_batches sb LEFT JOIN products p ON sb.productId = p.id WHERE 1=1`;
    const params: any[] = [];
    if (productId) { sql += " AND sb.productId = ?"; params.push(parseInt(productId)); }
    if (status) { sql += " AND sb.status = ?"; params.push(status); }
    sql += " ORDER BY sb.createdAt DESC";
    const batches = db.prepare(sql).all(...params);
    return c.json({ batches });
  } catch (e: any) {
    await logApiError(c, db, "get_batches", "data", null, e);
    return c.json({ batches: [], error: e?.message }, 500);
  }
});

// Get single batch by ID
app.get("/api/batches/:id", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    const batch = db.prepare(`SELECT sb.*, p.nameTh as productName, p.sku as productSku
      FROM stock_batches sb LEFT JOIN products p ON sb.productId = p.id WHERE sb.id = ?`).get(id);
    if (!batch) return c.json({ error: "Batch not found" }, 404);
    return c.json(batch);
  } catch (e: any) {
    await logApiError(c, db, "get_batches_id", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// Create a new batch
app.post("/api/batches", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json();
    const db = getDb();

    // Verify product exists
    const product = db.prepare("SELECT id FROM products WHERE id = ?").get(body.productId);
    if (!product) return c.json({ success: false, error: "Product not found" }, 404);

    // Check for duplicate batch
    const existing = db.prepare("SELECT id FROM stock_batches WHERE productId = ? AND batchNumber = ?").get(body.productId, body.batchNumber);
    if (existing) return c.json({ success: false, error: "Batch number already exists for this product" }, 409);

    const stmt = db.prepare(`INSERT INTO stock_batches
      (productId, batchNumber, expiryDate, quantity, initialQuantity, unitCost, supplier, receivedDate, status, notes, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`);
    const result = stmt.run(
      body.productId, body.batchNumber, body.expiryDate || null,
      body.quantity || 0, body.quantity || 0, body.unitCost || 0,
      body.supplier || "", body.receivedDate || new Date().toISOString().split("T")[0],
      "active", body.notes || ""
    );

    // Log traceability event
    db.prepare(`INSERT INTO traceability_log (batchId, productId, action, quantity, previousStock, newStock, reference, notes, createdBy, createdAt)
      VALUES (?, ?, 'receive', ?, 0, ?, ?, ?, ?, datetime('now'))`).run(
      result.lastInsertRowid, body.productId, body.quantity || 0, body.quantity || 0,
      `BATCH-${result.lastInsertRowid}`, body.notes || "", body.createdBy || 1
    );

    return c.json({ success: true, id: result.lastInsertRowid }, 201);
  } catch (e: any) {
    await logApiError(c, db, "create_batch", "batch", null, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// Update batch
app.put("/api/batches/:id", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const db = getDb();
    const existing = db.prepare("SELECT * FROM stock_batches WHERE id = ?").get(id) as any;
    if (!existing) return c.json({ success: false, error: "Batch not found" }, 404);

    db.prepare(`UPDATE stock_batches SET
      expiryDate = ?, quantity = ?, unitCost = ?, supplier = ?, status = ?, notes = ?,
      updatedAt = datetime('now') WHERE id = ?`).run(
      body.expiryDate ?? existing.expiryDate, body.quantity ?? existing.quantity,
      body.unitCost ?? existing.unitCost, body.supplier ?? existing.supplier,
      body.status ?? existing.status, body.notes ?? existing.notes, id
    );
    return c.json({ success: true });
  } catch (e: any) {
    await logApiError(c, db, "update_batch", "batch", id, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// Delete batch (soft — only if zero quantity or status = 'depleted')
app.delete("/api/batches/:id", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    const batch = db.prepare("SELECT * FROM stock_batches WHERE id = ?").get(id) as any;
    if (!batch) return c.json({ success: false, error: "Batch not found" }, 404);
    if (batch.quantity > 0 && batch.status !== 'depleted') {
      return c.json({ success: false, error: "Cannot delete batch with remaining stock. Set status to 'depleted' first." }, 400);
    }
    db.prepare("DELETE FROM stock_batches WHERE id = ?").run(id);
    return c.json({ success: true });
  } catch (e: any) {
    await logApiError(c, db, "delete_batch", "batch", id, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── Traceability API ──

// Trace a product: get all batch movements
app.get("/api/trace/product/:productId", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const productId = parseInt(c.req.param("productId"));
    const db = getDb();
    const product = db.prepare("SELECT id, sku, nameTh, nameEn FROM products WHERE id = ?").get(productId);
    if (!product) return c.json({ error: "Product not found" }, 404);
    const batches = db.prepare(`SELECT sb.* FROM stock_batches sb WHERE sb.productId = ? ORDER BY sb.createdAt DESC`).all(productId);
    const movements = db.prepare(`SELECT tl.*, sb.batchNumber, o.orderNumber
      FROM traceability_log tl
      LEFT JOIN stock_batches sb ON tl.batchId = sb.id
      LEFT JOIN orders o ON tl.orderId = o.id
      WHERE tl.productId = ? ORDER BY tl.createdAt DESC LIMIT 50`).all(productId);
    return c.json({ product, batches, movements });
  } catch (e: any) {
    await logApiError(c, db, "get_trace_product_productId", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// Trace a batch: get full history of one batch
app.get("/api/trace/batch/:batchId", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const batchId = parseInt(c.req.param("batchId"));
    const db = getDb();
    const batch = db.prepare(`SELECT sb.*, p.nameTh as productName, p.sku as productSku
      FROM stock_batches sb LEFT JOIN products p ON sb.productId = p.id WHERE sb.id = ?`).get(batchId);
    if (!batch) return c.json({ error: "Batch not found" }, 404);
    const movements = db.prepare(`SELECT tl.*, o.orderNumber, oi.productNameTh, u.fullName as userName
      FROM traceability_log tl
      LEFT JOIN orders o ON tl.orderId = o.id
      LEFT JOIN order_items oi ON tl.orderItemId = oi.id
      LEFT JOIN users u ON tl.createdBy = u.id
      WHERE tl.batchId = ? ORDER BY tl.createdAt DESC`).all(batchId);
    return c.json({ batch, movements });
  } catch (e: any) {
    await logApiError(c, db, "get_trace_batch_batchId", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// Export batch trace as CSV
app.get("/api/trace/batch/:id/export", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const batchId = parseInt(c.req.param("id"));
    const db = getDb();

    const batch = db.prepare("SELECT sb.*, p.nameTh as productName FROM stock_batches sb LEFT JOIN products p ON sb.productId = p.id WHERE sb.id = ?").get(batchId) as any;
    if (!batch) return c.json({ error: "Batch not found" }, 404);

    // Get all sell trace entries for this batch with customer info
    const rows = db.prepare(`
      SELECT
        sb.id AS batchId,
        sb.batchNumber AS lotNumber,
        p.nameTh AS productName,
        o.customerName,
        cc.customerCode,
        o.orderNumber,
        tl.quantity,
        tl.createdAt AS soldAt
      FROM traceability_log tl
      JOIN stock_batches sb ON tl.batchId = sb.id
      LEFT JOIN products p ON tl.productId = p.id
      LEFT JOIN orders o ON tl.orderId = o.id
      LEFT JOIN customer_codes cc ON o.userId = cc.userId
      WHERE tl.batchId = ? AND tl.action = 'sell'
      ORDER BY tl.createdAt DESC
    `).all(batchId);

    // Build CSV
    const headers = ["batchId", "lotNumber", "productName", "customerName", "customerCode", "orderNumber", "quantity", "soldAt"];
    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    let csv = headers.join(",") + "\n";
    for (const row of rows as any[]) {
      csv += headers.map(h => escapeCSV(row[h])).join(",") + "\n";
    }

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="batch-${batchId}-${batch.batchNumber || "export"}.csv"`,
      },
    });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_trace_batch_id_export", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// Trace an order: show what batch/lot went to which customer
app.get("/api/trace/order/:orderId", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const orderId = parseInt(c.req.param("orderId"));
    const db = getDb();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
    if (!order) return c.json({ error: "Order not found" }, 404);
    const items = db.prepare(`SELECT oi.*, tl.batchId, sb.batchNumber, sb.expiryDate
      FROM order_items oi
      LEFT JOIN traceability_log tl ON tl.orderItemId = oi.id
      LEFT JOIN stock_batches sb ON tl.batchId = sb.id
      WHERE oi.orderId = ?`).all(orderId);
    return c.json({ order, items });
  } catch (e: any) {
    await logApiError(c, db, "get_trace_order_orderId", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// ── Batch → Customer lookup ──
// GET /api/trace/batch/:id/customers → ดูรายชื่อลูกค้าที่ได้ batch นี้
app.get("/api/trace/batch/:id/customers", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const batchId = parseInt(c.req.param("id"));
    const db = getDb();
    const customers = db.prepare(`
      SELECT DISTINCT
        u.id as userId,
        u.fullName as customerName,
        cc.customerCode,
        u.phone,
        o.orderNumber,
        tl.quantity,
        o.orderedAt as soldAt
      FROM traceability_log tl
      JOIN orders o ON tl.orderId = o.id
      JOIN users u ON o.userId = u.id
      LEFT JOIN customer_codes cc ON cc.userId = u.id
      WHERE tl.batchId = ? AND tl.action = 'sell' AND o.userId IS NOT NULL
      ORDER BY o.orderedAt DESC
    `).all(batchId);
    return c.json({ customers });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_trace_batch_id_customers", "data", null, e);
    return c.json({ customers: [], error: e?.message }, 500);
  }
});

// ── Customer Search API ──
// GET /api/customers/search?q= → ค้นหาลูกค้า
app.get("/api/customers/search", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const q = c.req.query("q") || "";
    if (!q.trim()) return c.json({ customers: [] });
    const db = getDb();
    const term = `%${q}%`;
    const customers = db.prepare(`
      SELECT u.id, cc.customerCode, u.fullName, u.email, u.phone,
        (SELECT COUNT(*) FROM orders WHERE userId = u.id) as orderCount
      FROM users u
      LEFT JOIN customer_codes cc ON cc.userId = u.id
      WHERE u.fullName LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR (cc.customerCode IS NOT NULL AND cc.customerCode LIKE ?)
      ORDER BY u.fullName ASC
      LIMIT 20
    `).all(term, term, term, term);
    return c.json({ customers });
  } catch (e: any) {
    await logApiError(c, db, "get_customers_search", "data", null, e);
    return c.json({ customers: [], error: e?.message }, 500);
  }
});

// GET /api/customers/:id/orders → ประวัติการสั่งซื้อของลูกค้า
app.get("/api/customers/:id/orders", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const userId = parseInt(c.req.param("id"));
    const db = getDb();
    const user = db.prepare("SELECT id, fullName, email, phone FROM users WHERE id = ?").get(userId) as any;
    if (!user) return c.json({ error: "User not found" }, 404);
    const cc = db.prepare("SELECT customerCode FROM customer_codes WHERE userId = ?").get(userId) as any;
    const orders = db.prepare(`
      SELECT o.*,
        (SELECT COUNT(*) FROM order_items WHERE orderId = o.id) as itemCount,
        (SELECT COALESCE(SUM(subtotal),0) FROM order_items WHERE orderId = o.id) as itemsTotal
      FROM orders o
      WHERE o.userId = ?
      ORDER BY o.id DESC
      LIMIT 50
    `).all(userId);
    return c.json({ user: { ...user, customerCode: cc?.customerCode || null }, orders });
  } catch (e: any) {
    await logApiError(c, db, "get_customers_id_orders", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// ── Customer List API (paginated, searchable) ──
// GET /api/customers → รายการลูกค้าทั้งหมด (paginated, searchable)
app.get("/api/customers", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const db = getDb();
    const search = c.req.query("search") || "";
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "20");
    const fromDate = c.req.query("fromDate") || "";
    const toDate = c.req.query("toDate") || "";
    const sort = c.req.query("sort") || "newest";

    // Base: customers = users with role INDIVIDUAL/RETAIL/CLINIC (not SELLER/ADMIN)
    let sql = "SELECT u.id, u.fullName, u.email, u.phone, u.role, u.tier, u.isActive, u.createdAt, u.updatedAt, cc.customerCode";
    let countSql = "SELECT COUNT(*) as total";
    let fromSql = " FROM users u LEFT JOIN customer_codes cc ON cc.userId = u.id WHERE u.role IN ('INDIVIDUAL','RETAIL','CLINIC')";
    const params: any[] = [];

    if (search) {
      const terms = search.trim().split(/\s+/).filter(Boolean);
      const conditions = terms.map(() => "(u.fullName LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR (cc.customerCode IS NOT NULL AND cc.customerCode LIKE ?))");
      fromSql += " AND " + conditions.join(" AND ");
      for (const term of terms) {
        const q = `%${term}%`;
        params.push(q, q, q, q);
      }
    }
    if (fromDate) { fromSql += " AND u.createdAt >= ?"; params.push(fromDate); }
    if (toDate) { fromSql += " AND u.createdAt <= ?"; params.push(toDate); }

    const { total } = db.prepare(countSql + fromSql).get(...params) as any;

    // Sort
    const sortMap: Record<string, string> = {
      newest: "u.id DESC",
      oldest: "u.id ASC",
      name: "u.fullName ASC",
      orders_desc: "orderCount DESC",
      orders_asc: "orderCount ASC",
      spent_desc: "totalSpent DESC",
      spent_asc: "totalSpent ASC",
    };

    // Build list query with order stats
    sql += ", (SELECT COUNT(*) FROM orders WHERE userId = u.id) as orderCount";
    sql += ", (SELECT COALESCE(SUM(grandTotal),0) FROM orders WHERE userId = u.id AND status != 'cancelled') as totalSpent";
    sql += fromSql;
    sql += ` ORDER BY ${sortMap[sort] || "u.id DESC"}`;
    sql += " LIMIT ? OFFSET ?";
    params.push(limit, (page - 1) * limit);

    const items = db.prepare(sql).all(...params);

    return c.json({ items, total, page, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_customers", "data", null, e);
    return c.json({ items: [], total: 0, error: e?.message }, 500);
  }
});

// GET /api/customers/:id → รายละเอียดลูกค้า
app.get("/api/customers/:id", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const userId = parseInt(c.req.param("id"));
    const db = getDb();

    const customer = db.prepare(`
      SELECT u.*, cc.customerCode,
        (SELECT COUNT(*) FROM orders WHERE userId = u.id) as orderCount,
        (SELECT COALESCE(SUM(grandTotal),0) FROM orders WHERE userId = u.id AND status != 'cancelled') as totalSpent
      FROM users u
      LEFT JOIN customer_codes cc ON cc.userId = u.id
      WHERE u.id = ?
    `).get(userId) as any;

    if (!customer) return c.json({ error: "ไม่พบลูกค้า" }, 404);

    return c.json({ customer });
  } catch (e: any) {
    await logApiError(c, db, "get_customers_id", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// ── Admin: GET /api/admin/customers/:id → รายละเอียดลูกค้าแบบเต็ม รวม rawPassword ──
app.get("/api/admin/customers/:id", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const userId = parseInt(c.req.param("id"));
    const db = getDb();

    const customer = db.prepare(`
      SELECT u.*, cc.customerCode,
        (SELECT COUNT(*) FROM orders WHERE userId = u.id) as orderCount,
        (SELECT COALESCE(SUM(grandTotal),0) FROM orders WHERE userId = u.id AND status != 'cancelled') as totalSpent
      FROM users u
      LEFT JOIN customer_codes cc ON cc.userId = u.id
      WHERE u.id = ?
    `).get(userId) as any;

    if (!customer) return c.json({ error: "ไม่พบลูกค้า" }, 404);

    // Fetch customer orders too
    const orders = db.prepare(`
      SELECT o.*,
        (SELECT COUNT(*) FROM order_items WHERE orderId = o.id) as itemCount,
        (SELECT COALESCE(SUM(subtotal),0) FROM order_items WHERE orderId = o.id) as itemsTotal
      FROM orders o
      WHERE o.userId = ?
      ORDER BY o.id DESC LIMIT 50
    `).all(userId);

    return c.json({ customer, orders });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_admin_customers_id", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// ── Admin: PUT /api/admin/customers/:id/password → เปลี่ยนรหัสผ่านลูกค้า ──
app.put("/api/admin/customers/:id/password", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const userId = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const { hashPassword } = await import("./lib/auth");

    if (!body.newPassword || body.newPassword.length < 6) {
      return c.json({ error: "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร" }, 400);
    }

    const db = getDb();
    const hashed = hashPassword(body.newPassword);
    db.prepare("UPDATE users SET password = ?, passwordHash = ?, rawPassword = ? WHERE id = ?")
      .run(hashed, hashed, body.newPassword, userId);

    // Audit log: customer password change
    try { addAuditLog(db, payload.userId, "change_customer_password", "user", userId, `เปลี่ยนรหัสผ่านลูกค้า ID ${userId}`); } catch {}

    return c.json({ success: true, message: "เปลี่ยนรหัสผ่านเรียบร้อย" });
  } catch (e: any) {
    await logApiError(c, db, "change_password", "user", id, e);
    return c.json({ error: e?.message }, 500);
  }
});

// ── Accounting API ──

// Get all transactions (with optional filters)
app.get("/api/accounting/transactions", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "50");
    const type = c.req.query("type") || "";
    const fromDate = c.req.query("fromDate") || "";
    const toDate = c.req.query("toDate") || "";

    let sql = "SELECT * FROM account_transactions WHERE 1=1";
    const params: any[] = [];
    if (type) { sql += " AND transactionType = ?"; params.push(type); }
    if (fromDate) { sql += " AND date(transactionDate) >= ?"; params.push(fromDate); }
    if (toDate) { sql += " AND date(transactionDate) <= ?"; params.push(toDate); }

    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as total");
    const { total } = db.prepare(countSql).get(...params) as any;

    sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(limit, (page - 1) * limit);
    const transactions = db.prepare(sql).all(...params);

    return c.json({ transactions, total, page, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_accounting_transactions", "data", null, e);
    return c.json({ transactions: [], total: 0, error: e?.message }, 500);
  }
});

// Create a manual transaction
app.post("/api/accounting/transactions", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json();
    const db = getDb();
    const totalAmount = (body.amount || 0) + (body.tax || 0);
    const result = db.prepare(`INSERT INTO account_transactions
      (transactionType, referenceType, referenceId, description, amount, tax, totalAmount, paymentMethod, status, transactionDate, createdBy, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`).run(
      body.transactionType || "adjustment", body.referenceType || "", body.referenceId || null,
      body.description || "", body.amount || 0, body.tax || 0, totalAmount,
      body.paymentMethod || "cash", body.status || "completed",
      body.transactionDate || new Date().toISOString().split("T")[0], body.createdBy || 1
    );
    return c.json({ success: true, id: result.lastInsertRowid }, 201);
  } catch (e: any) {
    await logApiError(c, db, "add_transaction", "transaction", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// Delete a transaction
app.delete("/api/accounting/transactions/:id", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    const tx = db.prepare("SELECT * FROM account_transactions WHERE id = ?").get(id) as any;
    if (!tx) return c.json({ success: false, error: "Transaction not found" }, 404);
    db.prepare("DELETE FROM account_transactions WHERE id = ?").run(id);
    return c.json({ success: true });
  } catch (e: any) {
    await logApiError(c, db, "delete_transaction", "transaction", id, e);
    return c.json({ error: e?.message }, 500);
  }
});

// Get accounting summary (daily summaries + totals)
app.get("/api/accounting/summary", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const fromDate = c.req.query("fromDate") || "";
    const toDate = c.req.query("toDate") || "";
    const period = c.req.query("period") || "daily"; // daily, monthly, yearly

    let dateFormat = "%Y-%m-%d";
    if (period === "monthly") dateFormat = "%Y-%m";
    if (period === "yearly") dateFormat = "%Y";

    let sql = `SELECT
      strftime(? , transactionDate) as period,
      SUM(CASE WHEN transactionType IN ('sale','income') THEN totalAmount ELSE 0 END) as totalRevenue,
      SUM(CASE WHEN transactionType IN ('purchase','expense') THEN totalAmount ELSE 0 END) as totalExpenses,
      SUM(CASE WHEN transactionType IN ('sale','income') THEN totalAmount ELSE -totalAmount END) as netProfit,
      COUNT(*) as transactionCount
    FROM account_transactions WHERE status = 'completed'`;
    const params: any[] = [dateFormat];

    if (fromDate) { sql += " AND date(transactionDate) >= ?"; params.push(fromDate); }
    if (toDate) { sql += " AND date(transactionDate) <= ?"; params.push(toDate); }

    sql += " GROUP BY period ORDER BY period DESC LIMIT 365";

    const summary = db.prepare(sql).all(...params);

    // Grand totals
    const totals = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN transactionType IN ('sale','income') THEN totalAmount ELSE 0 END),0) as totalRevenue,
      COALESCE(SUM(CASE WHEN transactionType IN ('purchase','expense') THEN totalAmount ELSE 0 END),0) as totalExpenses,
      COUNT(*) as totalTransactions
    FROM account_transactions WHERE status = 'completed'`).get();

    return c.json({ summary, totals, period });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_accounting_summary", "data", null, e);
    return c.json({ summary: [], totals: null, error: e?.message }, 500);
  }
});

// Auto-generate accounting transaction from completed order (admin-only)
app.post("/api/accounting/from-order/:orderId", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const orderId = parseInt(c.req.param("orderId"));
    const db = getDb();
    const order = db.prepare("SELECT * FROM orders WHERE id = ? AND status IN ('completed','delivered','shipping')").get(orderId) as any;
    if (!order) return c.json({ success: false, error: "Order not found or not completed" }, 404);

    // Check if already recorded
    const existing = db.prepare("SELECT id FROM account_transactions WHERE referenceType = 'order' AND referenceId = ?").get(orderId);
    if (existing) return c.json({ success: false, error: "Transaction already exists for this order" }, 409);

    // Create sale transaction
    const result = db.prepare(`INSERT INTO account_transactions
      (transactionType, referenceType, referenceId, description, amount, tax, totalAmount, paymentMethod, status, transactionDate, createdBy, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`).run(
      "sale", "order", orderId,
      `ขายสินค้า #${order.orderNumber} - ${order.customerName}`,
      order.subtotal || 0, 0, order.grandTotal || order.subtotal || 0,
      "cash", "completed", order.orderedAt?.split(" ")[0], 1
    );

    return c.json({ success: true, id: result.lastInsertRowid }, 201);
  } catch (e: any) {
    await logApiError(c, db, "add_transaction_order", "transaction", orderId, e);
    return c.json({ error: e?.message }, 500);
  }
});

// ── Payments API (PromptPay) ──

function generatePromptPayPayload(phone: string, amount: number): string {
  function crc16(data: string): string {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
        else crc <<= 1;
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }
  const guid = "A000000677010111";
  const pLen = String(phone.length).padStart(2, "0");
  const md = `00${String(guid.length).padStart(2, "0")}${guid}01${pLen}${phone}`;
  const cat = "5999";
  const amt = amount.toFixed(2);
  let tlv = `00020101021229${String(md.length).padStart(2, "0")}${md}5204${cat}530376454${String(amt.length).padStart(2, "0")}${amt}5802TH5910PharmaCare6007Bangkok6304`;
  return tlv + crc16(tlv);
}

// Serve QR code image dynamically
app.get("/api/payments/qr/:paymentId", async (c) => {
  try {
    const id = parseInt(c.req.param("paymentId"));
    const db = getDb();
    const pay = db.prepare("SELECT * FROM payments WHERE id = ?").get(id) as any;
    if (!pay || !pay.qrEmvcoData) return c.json({ error: "Payment or QR not found" }, 404);
    const QRCode = (await import("qrcode")).default;
    const buf = await QRCode.toBuffer(pay.qrEmvcoData, { type: "png", width: 400, margin: 2, color: { dark: "#000", light: "#fff" } });
    return c.body(new Uint8Array(buf), 200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" });
  } catch (e: any) { return c.json({ error: e?.message }, 500); }
});

// Create payment for an order
app.post("/api/payments/create", async (c) => {
  try {
    const body = await c.req.json();
    const { orderId } = body;
    if (!orderId || orderId <= 0) return c.json({ error: "หมายเลขออเดอร์ไม่ถูกต้อง" }, 400);
    const db = getDb();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
    if (!order) return c.json({ error: "Order not found" }, 404);

    // Verify ownership: logged-in user or matching sessionId
    const auth = c.req.header("authorization") || "";
    const sessionId = c.req.header("X-Session-ID") || c.req.query("sessionId") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = token ? await verifyToken(token) : null;
    if (!payload) {
      // Guest: check sessionId
      if (!sessionId || !order.sessionId || order.sessionId !== sessionId) {
        return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
      }
    } else if (order.userId && order.userId !== payload.userId) {
      // Logged-in: check role
      const user = db.prepare("SELECT role FROM users WHERE id = ?").get(payload.userId) as any;
      if (user?.role !== "SELLER" && user?.role !== "ADMIN") {
        return c.json({ error: "Forbidden" }, 403);
      }
    }

    // เช็คป้องกันการกดจ่ายซ้ำ
    const confirmedPayment = db.prepare("SELECT id FROM payments WHERE orderId = ? AND status = 'confirmed'").get(orderId) as any;
    if (confirmedPayment) {
      return c.json({ error: "ออเดอร์นี้ทำรายการชำระเงินไปแล้ว" }, 400);
    }

    // Check existing pending payment
    const existing = db.prepare("SELECT * FROM payments WHERE orderId = ? AND status = 'pending'").get(orderId) as any;
    if (existing) {
      return c.json({ payment: existing, qrImageUrl: existing.qrImageUrl });
    }

    // Get promptpay phone from settings
    const settings = getStoreSettings(db);
    const phone = settings.promptpayPhone || "0049990819992515";
    const amount = order.grandTotal || order.subtotal || 0;
    // Tax ID (tag 03) from working K-Shop QR
    const qrEmvcoData = generatePromptPayPayload(phone, amount, "03");
    const qrImageUrl = `https://promptpay.io/${phone}/${amount}.png`;
    const result = db.prepare(`INSERT INTO payments (orderId, amount, method, status, qrPayload, qrImageUrl, createdAt, updatedAt)
      VALUES (?, ?, 'promptpay', 'pending', ?, ?, datetime('now'), datetime('now'))`)
      .run(orderId, amount, qrEmvcoData, qrImageUrl);
    const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(result.lastInsertRowid);

    return c.json({ success: true, payment, qrImageUrl: payment?.qrImageUrl || "" }, 201);
  } catch (e: any) {
    await logApiError(c, db, "create_payment", "payment", orderId, e);
    return c.json({ error: e?.message }, 500);
  }
});

// Confirm payment (admin)
app.post("/api/payments/:id/confirm", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const id = parseInt(c.req.param("id"));
    const db = getDb();
    const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(id) as any;
    if (!payment) return c.json({ error: "Payment not found" }, 404);
    if (payment.status !== "pending") return c.json({ error: "Payment already confirmed or cancelled" }, 400);

    db.prepare("UPDATE payments SET status = 'confirmed', paidAt = datetime('now'), updatedAt = datetime('now') WHERE id = ?").run(id);

    // Create notification for user
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(payment.orderId) as any;
    if (order && order.userId) {
      db.prepare(`INSERT INTO notifications (userId, type, title, message, createdAt)
        VALUES (?, 'payment_confirm', 'ชำระเงินสำเร็จ', ?, datetime('now'))`)
        .run(order.userId, `ชำระเงินออเดอร์ ${order.orderNumber} เรียบร้อยแล้ว จำนวน ฿${payment.amount.toFixed(2)}`);
      eventBus.emit(createEvent(EventType.PAYMENT_CONFIRMED, "boot.ts:payments", {
        orderId: payment.orderId, orderNumber: order.orderNumber,
        userId: order.userId, amount: payment.amount,
        method: payment.method,
      }));
    }

    // Auto-log revenue to accounting
    try {
      const existingTx = db.prepare("SELECT id FROM account_transactions WHERE referenceType = 'order' AND referenceId = ?").get(payment.orderId);
      if (!existingTx && order) {
        db.prepare(`INSERT INTO account_transactions
          (transactionType, referenceType, referenceId, description, amount, tax, totalAmount, paymentMethod, status, transactionDate, createdBy, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`).run(
          "sale", "order", payment.orderId,
          `รายได้จากการขาย #${order.orderNumber} - ${order.customerName || ''}`,
          order.subtotal || 0, order.tax || 0, payment.amount || order.grandTotal || 0,
          payment.method || "promptpay", "completed", new Date().toISOString().split("T")[0], 1
        );
      }
      } catch (e: any) {
        const db = getDb(); await logApiError(c, db, "confirm_payment", "payment", id, e);
        return c.json({ error: e?.message }, 500);
      }

    return c.json({ success: true, payment });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// Get payment for an order
app.get("/api/payments/order/:orderId", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const token = c.req.header("authorization")?.replace("Bearer ", "") || "";
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const orderId = parseInt(c.req.param("orderId"));
    const db = getDb();
    const order = db.prepare("SELECT userId FROM orders WHERE id = ?").get(orderId) as any;
    if (order && order.userId && order.userId !== payload.userId) {
      // Check if user is admin/seller
      const user = db.prepare("SELECT role FROM users WHERE id = ?").get(payload.userId) as any;
      const role = user?.role || "";
      if (role !== "SELLER" && role !== "ADMIN") return c.json({ error: "Forbidden" }, 403);
    }
    const payment = db.prepare("SELECT * FROM payments WHERE orderId = ? ORDER BY id DESC LIMIT 1").get(orderId);
    return c.json({ payment });
  } catch (e: any) {
    await logApiError(c, db, "get_payments_order_orderId", "data", null, e);
    return c.json({ payment: null, error: e?.message }, 500);
  }
});

// ── Shipping API ──

// Calculate shipping fee
app.post("/api/shipping/calculate", async (c) => {
  try {
    const body = await c.req.json();
    const { productIds, quantities } = body;
    if (!productIds || !Array.isArray(productIds)) return c.json({ error: "Missing productIds" }, 400);

    const db = getDb();
    let totalWeight = 0;
    let subtotal = 0;

    for (let i = 0; i < productIds.length; i++) {
      const pid = productIds[i];
      const qty = (quantities && quantities[i]) || 1;
      const product = db.prepare("SELECT id, weight, price FROM products WHERE id = ?").get(pid) as any;
      if (product) {
        totalWeight += (product.weight || 0) * qty;
        subtotal += (product.price || 0) * qty;
      }
    }

    // Find applicable rate
    const rate = db.prepare("SELECT * FROM shipping_rates WHERE minWeight <= ? AND maxWeight >= ? ORDER BY fee ASC LIMIT 1").get(totalWeight, totalWeight) as any;
    let fee = rate ? rate.fee : 50;

    // Get shipping settings from DB
    const settingsRows = db.prepare("SELECT key, value FROM store_settings WHERE key LIKE 'shipping_%'").all() as any[];
    const ss: Record<string, string> = {};
    for (const row of settingsRows) ss[row.key] = row.value;
    
    const promoThreshold = parseFloat(ss.shipping_promo_threshold || "500");
    const promoDiscount = parseFloat(ss.shipping_promo_discount || "50");
    const freeThreshold = parseFloat(ss.shipping_free_threshold || "999999");

    // Promotion: discount when subtotal >= threshold
    if (subtotal >= promoThreshold && subtotal < freeThreshold) {
      fee = Math.max(0, fee - (fee * promoDiscount / 100));
    }
    
    // Free shipping on big orders
    if (subtotal >= freeThreshold) {
      fee = 0;
    }

    return c.json({
      success: true,
      totalWeight,
      subtotal,
      shippingFee: fee,
      rateName: rate?.name || "default",
      promotion: subtotal >= 500 ? "ลด 50% เมื่อสั่งครบ 500฿" : null,
    });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// ── Get all shipping rates ──
app.get("/api/shipping/rates", async (c) => {
  try {
    const db = getDb();
    const rates = db.prepare("SELECT * FROM shipping_rates ORDER BY minWeight").all();
    return c.json({ success: true, rates });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// ── Update shipping rate ──
app.put("/api/shipping/rates/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const db = getDb();
    db.prepare("UPDATE shipping_rates SET name = ?, minWeight = ?, maxWeight = ?, fee = ? WHERE id = ?").run(
      body.name || "", body.minWeight || 0, body.maxWeight || 999999, body.fee || 0, id
    );
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// ── Add shipping rate ──
app.post("/api/shipping/rates", async (c) => {
  try {
    const body = await c.req.json();
    const db = getDb();
    const r = db.prepare("INSERT INTO shipping_rates (name, minWeight, maxWeight, fee) VALUES (?, ?, ?, ?)").run(
      body.name || "", body.minWeight || 0, body.maxWeight || 999999, body.fee || 0
    );
    return c.json({ success: true, id: r.lastInsertRowid });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// ── Delete shipping rate ──
app.delete("/api/shipping/rates/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    db.prepare("DELETE FROM shipping_rates WHERE id = ?").run(id);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// ── Save shipping settings (free threshold, promo) ──
app.put("/api/shipping/settings", async (c) => {
  try {
    const body = await c.req.json();
    const db = getDb();
    const settings = [
      ["shipping_free_threshold", String(body.freeThreshold || 0)],
      ["shipping_promo_threshold", String(body.promoThreshold || 0)],
      ["shipping_promo_discount", String(body.promoDiscount || 0)],
    ];
    for (const [key, value] of settings) {
      const existing = db.prepare("SELECT id FROM store_settings WHERE key = ?").get(key);
      if (existing) {
        db.prepare("UPDATE store_settings SET value = ?, updatedAt = datetime('now') WHERE key = ?").run(value, key);
      } else {
        db.prepare("INSERT INTO store_settings (key, value) VALUES (?, ?)").run(key, value);
      }
    }
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// ── SSE — uses eventBus-based /api/events/stream ──
// (duplicate /api/sse endpoint removed — consolidated to /api/events/stream)

// Helper: notify all admin/seller users
function notifyAdmins(db: any, type: string, title: string, message: string, entityType?: string, entityId?: number): void {
  try {
    const admins = db.prepare("SELECT id FROM users WHERE role IN ('ADMIN','SELLER')").all() as any[];
    for (const admin of admins) {
      db.prepare("INSERT INTO notifications (userId, type, title, message, createdAt, entityType, entityId) VALUES (?, ?, ?, ?, datetime('now'), ?, ?)")
        .run(admin.id, type, title, message, entityType || '', entityId || null);
      // Emit to eventBus SSE clients
      try {
        const { eventBus, createEvent, EventType } = require("./lib/eventBus");
        eventBus.emit(createEvent(EventType as any, "system", { userId: admin.id, notification: { type, title, message, entityType, entityId } }));
      } catch (e: any) {
        console.error("[EventBus] Emit error in notifyAdmins:", e?.message);
      }
    }
  } catch (e: any) {
    console.error("[notifyAdmins] Error:", e?.message);
  }
}

// Helper: check low stock + expiring batches and notify admins
function checkStockAlerts(db: any): void {
  try {
    // Low stock items (stock < 10)
    const lowStockProducts = db.prepare("SELECT id, nameTh, stock FROM products WHERE stock > 0 AND stock < 10 ORDER BY stock ASC LIMIT 20").all() as any[];
    for (const p of lowStockProducts) {
      const alreadyNotified = db.prepare("SELECT id FROM notifications WHERE type = 'low_stock' AND entityType = 'product' AND entityId = ? AND createdAt > datetime('now', '-1 day')").get(p.id);
      if (!alreadyNotified) {
        notifyAdmins(db, 'low_stock', 'สินค้าใกล้หมด', `สินค้า "${p.nameTh}" คงเหลือ ${p.stock} ชิ้น`, 'product', p.id);
      }
    }

    // Batches expiring within 30 days
    const expiringBatches = db.prepare(`SELECT sb.id, sb.batchNumber, sb.expiryDate, p.nameTh as productName
      FROM stock_batches sb JOIN products p ON sb.productId = p.id
      WHERE sb.status = 'active' AND sb.expiryDate IS NOT NULL AND sb.expiryDate <= date('now', '+30 days') AND sb.expiryDate >= date('now')
      ORDER BY sb.expiryDate ASC LIMIT 20`).all() as any[];
    for (const b of expiringBatches) {
      const alreadyNotified = db.prepare("SELECT id FROM notifications WHERE type = 'batch_expiring' AND entityType = 'batch' AND entityId = ? AND createdAt > datetime('now', '-1 day'").get(b.id);
      if (!alreadyNotified) {
        notifyAdmins(db, 'batch_expiring', 'Batch ใกล้หมดอายุ', `Batch ${b.batchNumber} ของ "${b.productName}" หมดอายุ ${b.expiryDate}`, 'batch', b.id);
      }
    }
  } catch (e: any) {
    console.error("[checkStockAlerts] Error:", e?.message);
  }
}

// Run stock alerts check periodically (every 10 minutes)
setInterval(() => {
  try { checkStockAlerts(getDb()); } catch {}
}, 600000);

// ── Notification API ──

function createNotification(db: any, userId: number, type: string, title: string, message: string): void {
  try {
    db.prepare("INSERT INTO notifications (userId, type, title, message, createdAt) VALUES (?, ?, ?, ?, datetime('now'))")
      .run(userId, type, title, message);
    eventBus.emit(createEvent(type as EventType, "boot.ts:createNotification", {
      userId, title, message,
    }));
  } catch {}
}

// Get notifications for current user
app.get("/api/notifications", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const userId = payload.id || payload.userId;
    const db = getDb();
    const notifications = db.prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 50").all(userId);
    return c.json({ notifications });
  } catch (e: any) {
    await logApiError(c, db, "get_notifications", "data", null, e);
    return c.json({ notifications: [], error: e?.message }, 500);
  }
});

// Get all notifications (admin notification center)
app.get("/api/admin/notifications", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const userId = payload.id || payload.userId;
    const db = getDb();

    const type = c.req.query("type") || "";
    const fromDate = c.req.query("fromDate") || "";
    const toDate = c.req.query("toDate") || "";
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "50");

    let sql = "SELECT * FROM notifications WHERE userId = ?";
    const params: any[] = [userId];

    if (type) { sql += " AND type = ?"; params.push(type); }
    if (fromDate) { sql += " AND date(createdAt) >= ?"; params.push(fromDate); }
    if (toDate) { sql += " AND date(createdAt) <= ?"; params.push(toDate); }

    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as total");
    const { total } = db.prepare(countSql).get(...params) as any;

    sql += " ORDER BY createdAt DESC LIMIT ? OFFSET ?";
    params.push(limit, (page - 1) * limit);
    const notifications = db.prepare(sql).all(...params);

    return c.json({ notifications, total, page, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_admin_notifications", "data", null, e);
    return c.json({ notifications: [], total: 0, error: e?.message }, 500);
  }
});

// Mark all notifications as read
app.post("/api/notifications/read-all", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const userId = payload.id || payload.userId;
    const db = getDb();
    db.prepare("UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0").run(userId);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// Delete a notification
app.delete("/api/notifications/:id", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const id = parseInt(c.req.param("id"));
    const userId = payload.id || payload.userId;
    const db = getDb();
    db.prepare("DELETE FROM notifications WHERE id = ? AND userId = ?").run(id, userId);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// Clear all notifications for user
app.post("/api/notifications/clear-all", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const userId = payload.id || payload.userId;
    const db = getDb();
    db.prepare("DELETE FROM notifications WHERE userId = ?").run(userId);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// Trigger stock alerts check (run after stock deductions)
function triggerStockAlertsCheck(): void {
  try { checkStockAlerts(getDb()); } catch {}
}

// ── Mark notification as read
app.post("/api/notifications/:id/read", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const id = parseInt(c.req.param("id"));
    const userId = payload.id || payload.userId;
    const db = getDb();
    db.prepare("UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?").run(id, userId);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// Get unread notification count
app.get("/api/notifications/unread-count", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return c.json({ unread: 0 });

    const userId = payload.id || payload.userId;
    const db = getDb();
    const result = db.prepare("SELECT COUNT(*) as unread FROM notifications WHERE userId = ? AND isRead = 0").get(userId) as any;
    return c.json({ unread: result?.unread || 0 });
  } catch (e: any) {
    return c.json({ unread: 0 });

// ── Packing / Packing Slip API ──

// List orders pending packing (orders with 'paid' status or ready for packing)
app.get("/api/packing/pending", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const orders = db.prepare("SELECT * FROM orders WHERE status IN ('paid','confirmed','packing') ORDER BY id DESC LIMIT 50").all() as any[];
    for (const o of orders) {
      const items = db.prepare("SELECT COUNT(*) as c FROM order_items WHERE orderId = ?").get(o.id) as any;
      o.itemCount = items?.c || 0;
    }
    return c.json({ orders });
  } catch (e: any) {
    await logApiError(c, db, "get_packing_pending", "data", null, e);
    return c.json({ orders: [], error: e?.message }, 500);
  }
});

// Start packing: create packing slip + set order to 'packing'
app.post("/api/packing/start/:orderId", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const orderId = parseInt(c.req.param("orderId"));
    const db = getDb();

    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
    if (!order) return c.json({ success: false, error: "Order not found" }, 404);
    if (order.status !== 'paid' && order.status !== 'confirmed' && order.status !== 'packing') {
      return c.json({ success: false, error: "Order must be in paid/confirmed/packing status" }, 400);
    }

    // Check if slip already exists
    const existingSlip = db.prepare("SELECT * FROM packing_slips WHERE orderId = ? AND status = 'pending'").get(orderId) as any;
    if (existingSlip) {
      return c.json({ success: true, slip: existingSlip, id: existingSlip.id });
    }

    // Create slip
    const slipNumber = `PK-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const result = db.prepare("INSERT INTO packing_slips (orderId, slipNumber, packedBy, status, createdAt) VALUES (?, ?, ?, 'pending', datetime('now'))")
      .run(orderId, slipNumber, payload.userId);

    const slipId = result.lastInsertRowid;
    const slip = db.prepare("SELECT * FROM packing_slips WHERE id = ?").get(slipId);

    // Create packing_items from order_items
    const orderItems = db.prepare("SELECT * FROM order_items WHERE orderId = ?").all(orderId) as any[];
    const insertPackingItem = db.prepare("INSERT INTO packing_items (slipId, orderItemId, quantity) VALUES (?, ?, ?)");
    for (const oi of orderItems) {
      insertPackingItem.run(slipId, oi.id, oi.quantity);
    }

    // Set order to packing status
    db.prepare("UPDATE orders SET status = 'packing', updatedAt = datetime('now') WHERE id = ?").run(orderId);

    // Notify customer that packing has started
    if (order.userId) {
      db.prepare(`INSERT INTO notifications (userId, type, title, message, createdAt)
        VALUES (?, 'packing', 'กำลังแพ็คสินค้า', ?, datetime('now'))`)
        .run(order.userId, `ออเดอร์ ${order.orderNumber} กำลังแพ็คสินค้า`);
      eventBus.emit(createEvent(EventType.PACKING_STARTED, "boot.ts:packing", {
        orderId: slip.orderId, orderNumber: order.orderNumber,
        userId: order.userId,
      }));
    }

    return c.json({ success: true, slip, id: slipId }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// Get packing slip detail
app.get("/api/packing/slip/:slipId", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const slipId = parseInt(c.req.param("slipId"));
    const db = getDb();

    const slip = db.prepare(`SELECT ps.*, o.orderNumber, o.customerName, o.customerPhone, o.shippingAddressJson,
      o.subtotal, o.shippingFee, o.grandTotal, o.orderedAt, o.status as orderStatus
      FROM packing_slips ps JOIN orders o ON ps.orderId = o.id WHERE ps.id = ?`).get(slipId) as any;
    if (!slip) return c.json({ error: "Slip not found" }, 404);

    const items = db.prepare(`SELECT pi.*, oi.productNameTh, oi.productNameEn, oi.unitPrice, oi.quantity as orderedQty,
      oi.productSku, oi.productImage
      FROM packing_items pi JOIN order_items oi ON pi.orderItemId = oi.id WHERE pi.slipId = ?`).all(slipId);

    return c.json({ slip, items });
  } catch (e: any) {
    await logApiError(c, db, "get_packing_slip_slipId", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// Verify a packing item
app.post("/api/packing/verify/:slipItemId", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const slipItemId = parseInt(c.req.param("slipItemId"));
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();

    const item = db.prepare("SELECT * FROM packing_items WHERE id = ?").get(slipItemId) as any;
    if (!item) return c.json({ success: false, error: "Packing item not found" }, 404);

    const verified = body.verified !== undefined ? (body.verified ? 1 : 0) : 1;
    db.prepare("UPDATE packing_items SET verified = ?, batchId = ?, lotNumber = ?, expiryDate = ? WHERE id = ?")
      .run(verified, body.batchId || item.batchId, body.lotNumber || item.lotNumber, body.expiryDate || item.expiryDate, slipItemId);

    return c.json({ success: true, verified: !!verified });
  } catch (e: any) {
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// Complete packing
app.post("/api/packing/complete/:slipId", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const slipId = parseInt(c.req.param("slipId"));
    const db = getDb();

    const slip = db.prepare("SELECT * FROM packing_slips WHERE id = ?").get(slipId) as any;
    if (!slip) return c.json({ success: false, error: "Slip not found" }, 404);
    if (slip.status !== 'pending') return c.json({ success: false, error: "Slip already completed" }, 400);

    db.prepare("UPDATE packing_slips SET status = 'completed', packedAt = datetime('now'), verifiedAt = datetime('now') WHERE id = ?").run(slipId);
    db.prepare("UPDATE orders SET status = 'packed', packedAt = datetime('now'), updatedAt = datetime('now') WHERE id = ?").run(slip.orderId);

    // Notify customer that packing is complete
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(slip.orderId) as any;
    if (order && order.userId) {
      db.prepare(`INSERT INTO notifications (userId, type, title, message, createdAt)\n        VALUES (?, 'packed', 'แพ็คสินค้าเสร็จ', ?, datetime('now'))`)
        .run(order.userId, `ออเดอร์ ${order.orderNumber} แพ็คสินค้าเสร็จเรียบร้อย`);
      eventBus.emit(createEvent(EventType.PACKING_COMPLETED, "boot.ts:packing", {
        orderId: slip.orderId, orderNumber: order.orderNumber,
        userId: order.userId, slipId,
      }));
    }

    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// Get packing slip by order ID
app.get("/api/packing/slip-by-order/:orderId", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const orderId = parseInt(c.req.param("orderId"));
    const db = getDb();
    const slip = db.prepare("SELECT * FROM packing_slips WHERE orderId = ? ORDER BY id DESC LIMIT 1").get(orderId) as any;
    if (!slip) return c.json({ slip: null });
    return c.json({ slip });
  } catch (e: any) {
    await logApiError(c, db, "get_packing_slip_by_order_orderId", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});

// ── 📄 Prescription (ใบสั่งยา) API ──

// Upload prescription image for an order
app.post("/api/orders/prescription", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["image"] as any;
    const orderId = parseInt(body["orderId"] as string);
    const pharmacistName = (body["pharmacistName"] as string) || "";
    if (!file || !orderId) return c.json({ success: false, error: "ต้องระบุรูปใบสั่งยาและออเดอร์" }, 400);

    // Verify order exists
    const db = getDb();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
    if (!order) return c.json({ success: false, error: "ไม่พบออเดอร์" }, 404);

    // Save image to prescriptions directory
    const path = await import("path");
    const fs = await import("fs");
    const presDir = path.resolve(typeof __dirname !== "undefined" ? __dirname : ".", "../data/images/prescriptions");
    await fs.promises.mkdir(presDir, { recursive: true });
    const ext = file.name?.split(".").pop()?.toLowerCase() || "jpg";
    const filename = `rx-${orderId}-${Date.now()}.${ext}`;
    const imageUrl = `/api/images/prescriptions/${filename}`;
    await fs.promises.writeFile(path.join(presDir, filename), Buffer.from(await file.arrayBuffer()));

    // Save prescription record
    const result = db.prepare(`INSERT INTO prescriptions (orderId, imageUrl, status, pharmacistName, notes, createdAt, updatedAt)
      VALUES (?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))`).run(orderId, imageUrl, pharmacistName, body["notes"] || "");

    // Update order status to indicate prescription attached
    db.prepare("UPDATE orders SET notes = COALESCE(notes || ' | ', '') || '📄 แนบใบสั่งยา', updatedAt = datetime('now') WHERE id = ?").run(orderId);

    // Notify admins
    notifyAdmins(db, 'prescription_upload', '📄 ใบสั่งยาใหม่', `ออเดอร์ ${order.orderNumber} แนบใบสั่งยาแล้ว`, 'order', orderId);

    return c.json({ success: true, id: result.lastInsertRowid, imageUrl }, 201);
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "upload_prescription", "order", orderId, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// Admin: List all prescriptions (with filtering)
app.get("/api/admin/prescriptions", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const status = c.req.query("status") || "";
    let sql = `SELECT p.*, o.orderNumber, o.customerName, o.customerPhone, o.status as orderStatus
               FROM prescriptions p JOIN orders o ON p.orderId = o.id WHERE 1=1`;
    const params: any[] = [];
    if (status) { sql += " AND p.status = ?"; params.push(status); }
    sql += " ORDER BY p.id DESC";
    const prescriptions = db.prepare(sql).all(...params);
    return c.json({ prescriptions });
  } catch (e: any) {
    await logApiError(c, db, "get_admin_prescriptions", "data", null, e);
    return c.json({ prescriptions: [], error: e?.message }, 500);
  }
});

// Admin: Approve prescription
app.put("/api/admin/prescriptions/:id/approve", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    const pres = db.prepare("SELECT * FROM prescriptions WHERE id = ?").get(id) as any;
    if (!pres) return c.json({ success: false, error: "ไม่พบใบสั่งยา" }, 404);
    if (pres.status !== "pending") return c.json({ success: false, error: "ใบสั่งยานี้ถูกดำเนินการไปแล้ว" }, 400);

    db.prepare("UPDATE prescriptions SET status = 'approved', reviewedBy = ?, reviewedAt = datetime('now'), updatedAt = datetime('now') WHERE id = ?").run(payload.userId, id);
    // Notify customer
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(pres.orderId) as any;
    if (order && order.userId) {
      createNotification(db, order.userId, 'prescription_approved', '✅ อนุมัติใบสั่งยา', `ใบสั่งยาสำหรับออเดอร์ ${order.orderNumber} ได้รับอนุมัติแล้ว`);
    }
    return c.json({ success: true, status: 'approved' });
  } catch (e: any) {
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// Admin: Reject prescription
app.put("/api/admin/prescriptions/:id/reject", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();
    const pres = db.prepare("SELECT * FROM prescriptions WHERE id = ?").get(id) as any;
    if (!pres) return c.json({ success: false, error: "ไม่พบใบสั่งยา" }, 404);
    if (pres.status !== "pending") return c.json({ success: false, error: "ใบสั่งยานี้ถูกดำเนินการไปแล้ว" }, 400);

    db.prepare("UPDATE prescriptions SET status = 'rejected', reviewedBy = ?, reviewedAt = datetime('now'), notes = ?, updatedAt = datetime('now') WHERE id = ?")
      .run(payload.userId, body.reason || "ใบสั่งยาไม่ถูกต้อง", id);

    // Cancel the order and notify customer
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(pres.orderId) as any;
    if (order) {
      db.prepare("UPDATE orders SET status = 'cancelled', notes = COALESCE(notes || ' | ', '') || '❌ ถูกยกเลิกเพราะใบสั่งยาไม่ผ่านอนุมัติ', updatedAt = datetime('now') WHERE id = ?").run(pres.orderId);
      if (order.userId) {
        createNotification(db, order.userId, 'prescription_rejected', '❌ ใบสั่งยาไม่ผ่านอนุมัติ', `ออเดอร์ ${order.orderNumber} ถูกยกเลิกเนื่องจากใบสั่งยาไม่ผ่านอนุมัติ: ${body.reason || "ใบสั่งยาไม่ถูกต้อง"}`);
      }
    }
    return c.json({ success: true, status: 'rejected' });
  } catch (e: any) {
    return c.json({ success: false, error: e?.message }, 500);
  }
});

// ── FEFO (First Expiry First Out) ──
// POST /api/packing/:slipId/verify-fefo — แนะนำ Batch ที่หมดอายุใกล้ที่สุด
app.post("/api/packing/:slipId/verify-fefo", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const slipId = parseInt(c.req.param("slipId"));
    const db = getDb();

    const slip = db.prepare("SELECT * FROM packing_slips WHERE id = ?").get(slipId) as any;
    if (!slip) return c.json({ error: "ไม่พบใบ Packing Slip" }, 404);

    // Get packing items for this slip
    const items = db.prepare(`SELECT pi.*, oi.productId, oi.productNameTh, oi.quantity as orderedQty
      FROM packing_items pi JOIN order_items oi ON pi.orderItemId = oi.id WHERE pi.slipId = ?`).all(slipId) as any[];

    const suggested: any[] = [];
    for (const item of items) {
      // Find active batches for this product, sorted by expiryDate ASC (FEFO)
      const batches = db.prepare(`SELECT id, batchNumber, expiryDate, quantity FROM stock_batches
        WHERE productId = ? AND status = 'active' AND quantity > 0
        ORDER BY expiryDate ASC, id ASC`).all(item.productId) as any[];

      let remaining = item.orderedQty;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const takeQty = Math.min(remaining, batch.quantity);
        suggested.push({
          packingItemId: item.id,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          quantity: takeQty,
          productName: item.productNameTh,
        });
        remaining -= takeQty;
      }
    }

    return c.json({ suggested });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// ── Telegram Notification ──
// POST /api/telegram/notify — ส่ง Telegram notification
app.post("/api/telegram/notify", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const { message, chatId } = body;
    if (!message) return c.json({ success: false, error: "ต้องระบุข้อความ" }, 400);

    const token = process.env.TELEGRAM_BOT_TOKEN || "";
    if (!token) return c.json({ success: false, error: "ไม่ได้ตั้งค่า Telegram Bot Token" }, 400);
    const targetChat = chatId || process.env.TELEGRAM_CHAT_ID || "";
    if (!targetChat) return c.json({ success: false, error: "ไม่ได้ตั้งค่า Telegram Chat ID" }, 400);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: targetChat, text: message, parse_mode: "Markdown" }),
    });
    const data = await res.json();
    if (!res.ok) return c.json({ success: false, error: data?.description || "ส่งล้มเหลว" }, 502);
    return c.json({ success: true });
  } catch (e: any) { return c.json({ success: false, error: e?.message }, 500); }
});
  }
});

// ── Promotions API ──
app.get("/api/promotions", async (c) => {
  try {
    const db = getDb();
    const items = db.prepare("SELECT * FROM promotions ORDER BY id DESC").all();
    return c.json({ items });
  } catch (e: any) { return c.json({ items: [], error: e?.message }, 500); }
});

app.post("/api/promotions", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const auth = c.req.header("authorization") || "";
    const payload = await verifyToken(auth.replace("Bearer ", ""));
    if (!payload) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    if (!body.code || !body.type) return c.json({ error: "Missing code or type" }, 400);
    const db = getDb();
    db.prepare("INSERT INTO promotions (code, nameTh, description, type, value, minOrder, maxDiscount, usageLimit, isActive) VALUES (?,?,?,?,?,?,?,?,1)").run(
      body.code.toUpperCase(), body.nameTh||"", body.description||"", body.type, body.value||0, body.minOrder||0, body.maxDiscount||0, body.usageLimit||0
    );
    return c.json({ success: true });
  } catch (e: any) { return c.json({ error: e?.message }, 500); }
});

app.put("/api/promotions/:id", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const auth = c.req.header("authorization") || "";
    const payload = await verifyToken(auth.replace("Bearer ", ""));
    if (!payload) return c.json({ error: "Unauthorized" }, 401);
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const db = getDb();
    db.prepare("UPDATE promotions SET code=?, nameTh=?, description=?, type=?, value=?, minOrder=?, maxDiscount=?, usageLimit=?, isActive=?, updatedAt=datetime('now') WHERE id=?").run(
      body.code?.toUpperCase()||"", body.nameTh||"", body.description||"", body.type||"percentage", body.value||0, body.minOrder||0, body.maxDiscount||0, body.usageLimit||0, body.isActive??1, id
    );
    return c.json({ success: true });
  } catch (e: any) { return c.json({ error: e?.message }, 500); }
});

app.delete("/api/promotions/:id", async (c) => {
  try {
    const { verifyToken } = await import("./lib/auth");
    const auth = c.req.header("authorization") || "";
    const payload = await verifyToken(auth.replace("Bearer ", ""));
    if (!payload) return c.json({ error: "Unauthorized" }, 401);
    const db = getDb();
    db.prepare("DELETE FROM promotions WHERE id=?").run(parseInt(c.req.param("id")));
    return c.json({ success: true });
  } catch (e: any) { return c.json({ error: e?.message }, 500); }
});

app.post("/api/promotions/validate", async (c) => {
  try {
    const body = await c.req.json();
    const { code, subtotal } = body;
    if (!code) return c.json({ valid: false, error: "กรุณาระบุโค้ด" });
    const db = getDb();
    const promo = db.prepare("SELECT * FROM promotions WHERE code=? AND isActive=1").get(code.toUpperCase()) as any;
    if (!promo) return c.json({ valid: false, error: "โค้ดส่วนลดไม่ถูกต้อง" });
    if (promo.usageLimit > 0 && promo.usedCount >= promo.usageLimit) return c.json({ valid: false, error: "โค้ดหมดอายุการใช้งาน" });
    if (promo.minOrder > 0 && (subtotal||0) < promo.minOrder) return c.json({ valid: false, error: `ยอดขั้นต่ำ ${promo.minOrder} บาท` });
    let discount = promo.type === "percentage" ? (subtotal||0) * promo.value / 100 : promo.value;
    if (promo.maxDiscount > 0 && discount > promo.maxDiscount) discount = promo.maxDiscount;
    return c.json({ valid: true, promo: { ...promo, discount } });
  } catch (e: any) { return c.json({ valid: false, error: e?.message }); }
});

// ── Supplier API ──
// GET /api/suppliers — รายชื่อผู้จัดจำหน่าย (ดึงจาก stock_batches)
app.get("/api/suppliers", async (c) => {
  try {
    const db = getDb();
    const suppliers = db.prepare("SELECT DISTINCT supplier FROM stock_batches WHERE supplier != '' AND supplier IS NOT NULL ORDER BY supplier ASC").all() as any[];
    const supplierNames = suppliers.map((s: any) => s.supplier);
    return c.json({ suppliers: supplierNames });
  } catch (e: any) {
    await logApiError(c, db, "get_suppliers", "data", null, e);
    return c.json({ suppliers: [], error: e?.message }, 500);
  }
});

// GET /api/suppliers/:name/batches — รายการ Batch ของผู้จัดจำหน่าย
app.get("/api/suppliers/:name/batches", async (c) => {
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    const { verifyToken } = await import("./lib/auth");
    const payload = await verifyToken(token);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });

    const name = c.req.param("name");
    const db = getDb();
    const batches = db.prepare(`SELECT sb.*, p.nameTh as productName, p.sku as productSku
      FROM stock_batches sb LEFT JOIN products p ON sb.productId = p.id
      WHERE sb.supplier = ? ORDER BY sb.receivedDate DESC`).all(name);
    return c.json({ batches });
  } catch (e: any) {
    await logApiError(c, db, "get_suppliers_name_batches", "data", null, e);
    return c.json({ batches: [], error: e?.message }, 500);
  }
});

// ── Health check (public — no auth) ──
app.get("/health", async (c) => {
  const result = { ok: true, ts: Date.now(), v: "pharmacare-v3-refactored", checks: {} as Record<string, string> };
  
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    result.checks.db = "ok";
  } catch {
    result.checks.db = "fail";
    result.ok = false;
  }

  try {
    const fs = await import("fs");
    const path = await import("path");
    const dir = path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd(), typeof __dirname !== "undefined" ? "../data/images" : "data/images");
    if (fs.existsSync(dir)) {
      result.checks.storage = "ok";
    } else {
      result.checks.storage = "missing";
      result.ok = false;
    }
  } catch {
    result.checks.storage = "error";
    result.ok = false;
  }

  try {
    const forteCount = db.prepare("SELECT COUNT(*) as c FROM products WHERE sku LIKE 'FT-%'").get() as any;
    result.checks.forteSync = `ok (${forteCount?.c || 0} products)`;
  } catch {
    result.checks.forteSync = "fail";
    result.ok = false;
  }

  return c.json(result);
});

// ── Railway healthcheck alias ──
app.get("/api/health", async (c) => {
  return c.json({ ok: true, ts: Date.now(), v: "pharmacare-v3-refactored" });
});

// ── Find order by phone + order number (public) ──
app.post("/api/orders/find", async (c) => {
  try {
    const body = await c.req.json();
    const { orderNumber, phone } = body;
    if (!orderNumber || !phone) return c.json({ error: "กรุณากรอกเลขที่ออเดอร์และเบอร์โทร" }, 400);
    const db = getDb();
    const order = db.prepare("SELECT id, orderNumber, customerName, grandTotal, status, sessionId, paymentMethod FROM orders WHERE orderNumber = ? AND customerPhone = ?").get(orderNumber, phone) as any;
    if (!order) return c.json({ error: "ไม่พบออเดอร์นี้ กรุณาตรวจสอบเลขที่ออเดอร์และเบอร์โทร" }, 404);
    return c.json({ success: true, order });
  } catch (e: any) {
    return c.json({ error: e?.message }, 500);
  }
});

// ── QR Scan page — สแกน QR จาก Invoice เพื่อดูออเดอร์ทันที ──
app.get("/scan/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
    if (!order) return c.html("<html><body style='font-family:sans-serif;text-align:center;padding:40px'><h2>⛔ ไม่พบออเดอร์นี้</h2><a href='/' style='color:#1565c0'>กลับหน้าแรก</a></body></html>");
    
    const items = db.prepare("SELECT * FROM order_items WHERE orderId = ?").all(id) as any[];
    const statusLabels: Record<string, string> = {
      pending: "รอจ่ายเงิน", paid: "จ่ายแล้ว", confirmed: "รออนุมัติ",
      packing: "กำลังแพ็ค", packed: "รอเข้ารับ", shipping: "กำลังจัดส่ง",
      cancelled: "ยกเลิก", delivered: "ส่งสำเร็จ",
    };
    
    let itemRows = items.map((it: any) =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${it.productNameTh || it.productNameEn || "สินค้า"}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${it.quantity}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">฿${Number(it.unitPrice).toFixed(2)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">฿${(it.subtotal || 0).toFixed(2)}</td></tr>`
    ).join("");
    
    const statusClass = order.status === "confirmed" || order.status === "packing" ? "highlight" : order.status;
    
    return c.html(`<!DOCTYPE html>
<html lang="th">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>สแกนออเดอร์ #${order.orderNumber}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f0;padding:16px}
.card{background:white;border-radius:14px;padding:20px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,0.06)}
h1{font-size:22px;color:#2E7D32}
h2{font-size:15px;color:#666;margin-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:6px 8px;background:#f5f5f5;font-size:12px;color:#666}
td{padding:6px 8px;border-bottom:1px solid #f0f0f0}
.l{color:#888;font-size:12px;margin-top:8px}
.v{font-size:16px;font-weight:600;color:#222}
.b{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;background:#e8f5e9;color:#2E7D32}
.tot{text-align:right;font-size:18px;font-weight:700;color:#1b5e20;margin-top:10px}
.btn{display:block;width:100%;padding:14px;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;text-align:center;text-decoration:none;margin-top:10px}
.g{background:#2E7D32;color:white}
.b{background:#1565c0;color:white}
.gr{background:#e0e0e0;color:#333}
.highlight{background:#fff8e1;border:2px solid #ffd54f}
</style></head>
<body>
<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center">
    <div><h1>📦 #${order.orderNumber || "#" + id}</h1><h2>${order.customerName || "-"}</h2></div>
    <div class="b">${statusLabels[order.status] || order.status}</div>
  </div>
  <div class="l">โทร</div><div class="v">${order.customerPhone || "-"}</div>
  <div class="l">ที่อยู่</div><div class="v" style="font-size:13px;font-weight:400">${(()=>{try{return JSON.parse(order.shippingAddressJson||'{}').address||"-"}catch{return "-"}})()}</div>
</div>
<div class="card">
  <table><tr><th>สินค้า</th><th style="text-align:center;width:50px">จำนวน</th><th style="text-align:right;width:70px">ราคา</th><th style="text-align:right;width:70px">รวม</th></tr>
  ${itemRows || ""}</table>
  <div class="tot">฿${Number(order.grandTotal || 0).toFixed(2)}</div>
</div>
${order.status === "confirmed" ? `<a href="/scan/${id}/pack" class="btn g">📦 เริ่มแพ็คออเดอร์นี้</a>` : ""}
${order.status === "packing" ? `<a href="/scan/${id}/packed" class="btn b">📦✅ แพ็คเสร็จแล้ว</a>` : ""}
<a href="/seller/orders" class="btn gr">ดูออเดอร์ทั้งหมด</a>
</body></html>`);
  } catch (e: any) {
    return c.html("<html><body style='font-family:sans-serif;text-align:center;padding:40px'><h2>⛔ Error</h2><p>"+e.message+"</p></body></html>");
  }
});

app.get("/scan/:id/pack", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    db.prepare("UPDATE orders SET status = 'packing', updatedAt = datetime('now') WHERE id = ? AND status = 'confirmed'").run(id);
    return c.redirect(`/scan/${id}`);
  } catch { return c.redirect(`/scan/${id}`); }
});

app.get("/scan/:id/packed", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const db = getDb();
    db.prepare("UPDATE orders SET status = 'packed', packedAt = datetime('now'), updatedAt = datetime('now') WHERE id = ? AND status = 'packing'").run(id);
    return c.redirect(`/scan/${id}`);
  } catch { return c.redirect(`/scan/${id}`); }
});

// ── POS (Point of Sale)// ── POS (Point of Sale) — quick order without address ──
app.post("/api/pos/order", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const body = await c.req.json();
    const db = getDb();
    const total = body.total || 0;
    const paymentMethod = body.paymentMethod || "cash";

    const orderNumber = "ORD-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
    const result = db.prepare(`INSERT INTO orders (orderNumber, userId, customerName, grandTotal, status, paymentMethod, sessionId, orderedAt, updatedAt)
      VALUES (?, ?, ?, ?, 'paid', ?, ?, datetime('now'), datetime('now'))`).run(
      orderNumber, payload.userId, "POS Counter", total, paymentMethod, body.sessionId || ""
    );
    const orderId = result.lastInsertRowid;

    // Insert order_items
    const insertItem = db.prepare("INSERT INTO order_items (orderId, productId, quantity, price, createdAt) VALUES (?, ?, ?, ?, datetime('now'))");
    const updateStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?");
    for (const item of body.items || []) {
      insertItem.run(orderId, item.productId, item.quantity, item.price);
      const upd = updateStock.run(item.quantity, item.productId, item.quantity);
      if (upd.changes === 0) throw new Error(`สินค้า ID ${item.productId} มีสต็อกไม่เพียงพอ`);
    }

    // Create payment record
    db.prepare(`INSERT INTO payments (orderId, amount, status, slipUrl, paymentMethod, createdAt, updatedAt)
      VALUES (?, ?, 'confirmed', '', ?, datetime('now'), datetime('now'))`).run(orderId, total, paymentMethod);

    // Audit log
    try { db.prepare(`INSERT INTO audit_log (userId, action, entityType, entityId, details, createdAt)
      VALUES (?, 'pos_order', 'order', ?, ?, datetime('now'))`).run(payload.userId, orderId, `POS: ${paymentMethod} ฿${total}`); } catch {}

    return c.json({ success: true, orderId, orderNumber });
  } catch (e: any) {
    await logApiError(c, db, "pos_order", "order", null, e);
    return c.json({ success: false, error: e?.message }, 500);
  }
});

app.post("/api/admin/health-check", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const { runHealthCheck } = await import("./lib/health-check");
    const result = runHealthCheck();
    return c.json(result);
  } catch (e: any) {
    return c.json({ status: "error", summary: e?.message, timestamp: new Date().toISOString() }, 500);
  }
});

// ── Export CSV ──
app.get("/api/export/products.csv", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const rows = db.prepare("SELECT p.id, p.sku, p.nameTh, p.price, p.stock, c.nameTh as category FROM products p LEFT JOIN categories c ON p.categoryId = c.id ORDER BY p.id ASC").all() as any[];
    const headers = ["id", "sku", "name", "price", "stock", "category"];
    const esc = (v: any) => { if (v===null||v===undefined) return ""; const s=String(v); return s.includes(",")||s.includes('"')||s.includes("\\n") ? `"${s.replace(/"/g,'""')}"` : s; };
    let csv = "\uFEFF" + headers.join(",") + "\\n";
    for (const r of rows) csv += headers.map(h => esc(r[h])).join(",") + "\\n";
    return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"products.csv\"" } });
  } catch (e: any) { return c.json({ error: e?.message }, 500); }
});

app.get("/api/export/orders.csv", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const rows = db.prepare("SELECT id, orderNumber, status, customerName, orderedAt, grandTotal FROM orders ORDER BY id DESC LIMIT 500").all() as any[];
    const headers = ["id", "orderNumber", "status", "customer", "date", "total"];
    const esc = (v: any) => { if (v===null||v===undefined) return ""; const s=String(v); return s.includes(",")||s.includes('"')||s.includes("\\n") ? `"${s.replace(/"/g,'""')}"` : s; };
    let csv = "\uFEFF" + headers.join(",") + "\\n";
    for (const r of rows) csv += headers.map(h => esc(r[h])).join(",") + "\\n";
    return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"orders.csv\"" } });
  } catch (e: any) { return c.json({ error: e?.message }, 500); }
});

app.get("/api/export/customers.csv", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const rows = db.prepare("SELECT u.id, cc.customerCode, u.fullName, u.email, u.phone, u.createdAt FROM users u LEFT JOIN customer_codes cc ON cc.userId = u.id WHERE u.role IN ('INDIVIDUAL','RETAIL','CLINIC') ORDER BY u.id DESC LIMIT 500").all() as any[];
    const headers = ["id", "customerCode", "name", "email", "phone", "registeredAt"];
    const esc = (v: any) => { if (v===null||v===undefined) return ""; const s=String(v); return s.includes(",")||s.includes('"')||s.includes("\\n") ? `"${s.replace(/"/g,'""')}"` : s; };
    let csv = "\uFEFF" + headers.join(",") + "\\n";
    for (const r of rows) csv += headers.map(h => esc(r[h])).join(",") + "\\n";
    return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"customers.csv\"" } });
  } catch (e: any) { return c.json({ error: e?.message }, 500); }
});

// ── Audit Log API ──
function addAuditLog(db: any, userId: number, action: string, entityType: string, entityId: number | null, details: string): void {
  try {
    db.prepare("INSERT INTO audit_log (userId, action, entityType, entityId, details, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))")
      .run(userId, action, entityType, entityId, details);
  } catch (e: any) { console.error("[AuditLog] Error:", e?.message); }
}

// ── Auto error logging สำหรับทุก try-catch ──
async function logApiError(c: any, db: any, action: string, entityType: string, entityId: number | null, error: any): Promise<void> {
  let userId = 0;
  try {
    const auth = c.req.header("authorization") || "";
    const token = auth.replace("Bearer ", "");
    if (token) {
      const { verifyToken } = await import("./lib/auth");
      const payload = await verifyToken(token);
      if (payload) userId = payload.userId || payload.id || 0;
    }
  } catch (err) {
    console.error("[AuditLog] Failed to get userId:", err);
  }
  const details = `❌ ${error?.message || "Unknown error"}`;
  addAuditLog(db, userId || 0, `error_${action}`, entityType, entityId, details);
}

app.get("/api/admin/audit-log", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "50");
    const action = c.req.query("action") || "";
    const entityType = c.req.query("entityType") || "";
    const fromDate = c.req.query("fromDate") || "";
    const toDate = c.req.query("toDate") || "";
    let sql = "SELECT al.*, u.fullName as adminName, u.role as adminRole FROM audit_log al LEFT JOIN users u ON al.userId = u.id WHERE 1=1";
    const params: any[] = [];
    if (action) { sql += " AND al.action = ?"; params.push(action); }
    if (entityType) { sql += " AND al.entityType = ?"; params.push(entityType); }
    if (fromDate) { sql += " AND date(al.createdAt) >= ?"; params.push(fromDate); }
    if (toDate) { sql += " AND date(al.createdAt) <= ?"; params.push(toDate); }
    const countSql = sql.replace("SELECT al.*, u.fullName as adminName", "SELECT COUNT(*) as total");
    const { total } = db.prepare(countSql).get(...params) as any;
    sql += " ORDER BY al.id DESC LIMIT ? OFFSET ?";
    params.push(limit, (page - 1) * limit);
    const logs = db.prepare(sql).all(...params);
    return c.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
  } catch (e: any) { return c.json({ logs: [], total: 0, error: e?.message }, 500); }
});

// ── Admin user management ──
app.get("/api/admin/users", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const db = getDb();
    const users = db.prepare("SELECT id, fullName, email, role, phone, isActive, createdAt FROM users WHERE role IN ('SUPER_ADMIN','SELLER','ADMIN') ORDER BY role, fullName").all();
    return c.json({ users });
  } catch (e: any) { return c.json({ users: [], error: e?.message }, 500); }
});

// ── Create new admin user ──
app.post("/api/admin/users", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    if (!body.email || !body.password || !body.fullName) return c.json({ error: "กรุณากรอกชื่อ อีเมล และรหัสผ่าน" }, 400);
    const { hashPassword } = await import("./lib/auth");
    const hashed = hashPassword(body.password);
    const db = getDb();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(body.email);
    if (existing) return c.json({ error: "อีเมลนี้ถูกใช้แล้ว" }, 400);
    const r = db.prepare("INSERT INTO users (fullName, email, phone, passwordHash, role, isActive) VALUES (?, ?, ?, ?, ?, 1)").run(
      body.fullName, body.email, body.phone || "", hashed, body.role || "SELLER"
    );
    return c.json({ success: true, id: r.lastInsertRowid });
  } catch (e: any) { return c.json({ error: e?.message }, 500); }
});

// ── Delete / disable admin user ──
app.delete("/api/admin/users/:id", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return c.json({ error: "Unauthorized" }, 401);
    const id = parseInt(c.req.param("id"));
    if (payload.userId === id) return c.json({ error: "ไม่สามารถลบบัญชีตัวเองได้" }, 400);
    const db = getDb();
    db.prepare("UPDATE users SET isActive = 0, role = 'INDIVIDUAL' WHERE id = ? AND role IN ('SUPER_ADMIN','SELLER','ADMIN')").run(id);
    return c.json({ success: true, message: "ลบผู้ดูแลระบบแล้ว" });
  } catch (e: any) { return c.json({ error: e?.message }, 500); }
});

app.put("/api/admin/users/:id/role", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    if (!["SUPER_ADMIN", "SELLER", "ADMIN"].includes(body.role)) return c.json({ error: "Invalid role" }, 400);
    const db = getDb();
    const user = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id) as any;
    if (!user) return c.json({ error: "User not found" }, 404);
    // Only SUPER_ADMIN can change roles
    if (payload.role !== "SUPER_ADMIN") return c.json({ error: "Forbidden" }, 403);
    db.prepare("UPDATE users SET role = ?, roleUpdatedAt = datetime('now') WHERE id = ?").run(body.role, id);
    try { db.prepare(`INSERT INTO audit_log (userId, action, entityType, entityId, details, createdAt) VALUES (?, 'change_role', 'user', ?, ?, datetime('now'))`).run(payload.userId, id, `เปลี่ยน Role จาก ${user.role} → ${body.role}`); } catch {}
    return c.json({ success: true });
  } catch (e: any) { return c.json({ error: e?.message }, 500); }
});

// ── tRPC API ──
app.use("/api/trpc/*", async (c) => {
  try {
    return await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext,
      onError: (opts) => {
        console.error(`[tRPC Error] ${opts.path}:`, opts.error.message);
      },
    });
  } catch (e: any) {
    console.error("[tRPC Handler Crash]:", e?.message);
    return c.json(
      {
        error: {
          json: {
            message: `Handler crash: ${e?.message}`,
            code: -32603,
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
          },
        },
      },
      500
    );
  }
});

// ── SSE Events Stream ──

if (env.isProduction) {
  // ── Admin password reset (one-time use for Railway) ──
  app.post("/api/reset-admin-pw", async (c) => {
    try {
      const { getDb } = await import("./queries/connection");
      const { hashPassword } = await import("./lib/auth");
      const { newPassword, secret } = await c.req.json();
      if (secret !== "pharmacia-reset-2026") return c.json({ error: "Invalid secret" }, 403);
      const hashed = hashPassword(newPassword);
      const db = getDb();
      db.prepare("UPDATE users SET passwordHash = ? WHERE role = 'SELLER' OR role = 'ADMIN'").run(hashed);
      const users = db.prepare("SELECT id, email, role FROM users WHERE role = 'SELLER' OR role = 'ADMIN'").all();
      return c.json({ success: true, updated: users.length, users: users.map((u: any) => ({ email: u.email, role: u.role })) });
    } catch (e: any) {
      return c.json({ error: e?.message }, 500);
    }
  });

  const { serve } = await import("@hono/node-server");
  // ── Auto-category migration: ป้องกันหมวดหมู่ถูกรีเซ็ต ──
  try {
    const db = getDb();
    const cat1 = db.prepare("SELECT id, nameTh FROM categories WHERE id = 1").get() as any;
    if (cat1 && cat1.nameTh === "ยา") {
      console.log("[Migration] จัดการหมวดหมู่...");
      const cats = [
        [1,"ยาสามัญประจำบ้าน","💊","blue",1],[2,"ยาแผนโบราณ/สมุนไพร","🌿","green",2],
        [3,"อาหารเสริม/วิตามิน","✨","amber",3],[4,"เวชสำอาง+แม่และเด็ก","🧴","pink",4],
        [5,"เวชภัณฑ์/อุปกรณ์การแพทย์","🩺","teal",5],[7,"ของใช้ทั่วไป","🧹","slate",6],
        [8,"เครื่องดื่ม/อาหาร","☕","orange",7],[11,"ยาอันตราย","💊","red",8],
        [9,"สัตว์เลี้ยง","🐾","yellow",9],
      ];
      for (const [id, name, icon, color, sort] of cats) {
        db.prepare("UPDATE categories SET nameTh=?, icon=?, color=?, sortOrder=?, isActive=1 WHERE id=?").run(name, icon, color, sort, id);
      }
      db.prepare("UPDATE categories SET isActive=0 WHERE id=6").run();
      db.prepare("UPDATE products SET categoryId=4 WHERE categoryId=6").run();
      // Re-categorize: check if cat 1 still has too many (dangerous drugs not yet separated)
      const count1 = (db.prepare("SELECT COUNT(*) as c FROM products WHERE categoryId=1").get() as any).c;
      if (count1 > 4000) {
        console.log(`[Migration] จัดหมวดสินค้า ${count1} รายการ...`);
        // Move dangerous drugs to cat 11
        const drugs = [
          'amoxicillin','amoxi','cloxacillin','cephalexin','cepha','ceftriaxone','cefminox','cefixime',
          'azithromycin','clindamycin','gentamicin','neomycin','chloramphenicol','tetracycline','doxycycline',
          'metronidazole','norfloxacin','ciprofloxacin','ofloxacin','levofloxacin',
          'glibenclamide','metformin','glipizide','insulin','lantus','novorapid',
          'amlodipine','enalapril','losartan','irbesartan','valsartan','telmisartan','hydrochlorothiazide',
          'simvastatin','atorvastatin','rosuvastatin','pravastatin',
          'warfarin','clopidogrel','ticagrelor','furosemide','spironolactone',
          'prednisolone','prednisone','dexamethasone','betamethasone','methylprednisolone',
          'levothyroxine','eltroxin','methotrexate','azathioprine',
          'salbutamol','ventolin','pulmicort','budesonide','salmeterol','formoterol',
          'omeprazole','pantoprazole','lansoprazole','esomeprazole','rabeprazole',
          'tramadol','codeine','morphine','fentanyl','oxycodone',
          'gabapentin','pregabalin','diazepam','lorazepam','clonazepam','alprazolam',
          'haloperidol','risperidone','olanzapine','quetiapine','chlorpromazine',
          'phenytoin','phenobarbital','carbamazepine','valproate','levetiracetam','lamotrigine',
          'sildenafil','tadalafil','vardenafil','finasteride','tamsulosin','dutasteride',
          'ketoconazole','fluconazole','itraconazole','terbinafine','griseofulvin',
          'acyclovir','valacyclovir','famciclovir','oseltamivir',
          'diclofenac','piroxicam','meloxicam','etoricoxib','celecoxib','indomethacin',
          'colchicine','allopurinol','febuxostat',
          'betahistine','cinnarizine','meclizine',
          'pilocarpine','timolol','latanoprost','brimonidine','dorzolamide',
          'levodopa','carbidopa','donepezil','memantine',
          'bisoprolol','metoprolol','carvedilol','atenolol','propranolol',
          'digoxin','amiodarone','nitrofurantoin',
          'diphenhydramine','chlorpheniramine',  // these stay in cat 1 - OTC
          'albendazole','mebendazole','praziquantel',
          'miconazole','clotrimazole',
          'benzoyl','adapalene','isotretinoin',
          'calcium carbonate','calcium lactate',
          'ferrous fumarate','ferrous sulfate',
        ];
        for (const drug of drugs) {
          db.prepare("UPDATE products SET categoryId=11 WHERE categoryId=1 AND (LOWER(nameTh) LIKE ? OR LOWER(nameEn) LIKE ? OR LOWER(genericNameTh) LIKE ?)")
            .run(`%${drug}%`,`%${drug}%`,`%${drug}%`);
        }
        // Move medical supplies to cat 5
        const supplies = ['เข็ม','needle','syringe','ไซริง','gauze','ผ้ากอส','glove','ถุงมือ',
          'thermometer','accu-chek','test strip','strips','bandage','stethoscope','wheelchair',
          'walking','cane','walker','catheter','foley','oxygen','cannula','nebulizer',
          'pill planner','pill pocket','ตลับใส่ยา','spacer']; // etc
        for (const s of supplies) {
          db.prepare("UPDATE products SET categoryId=5 WHERE categoryId=1 AND (LOWER(nameTh) LIKE ? OR LOWER(nameEn) LIKE ?)")
            .run(`%${s}%`,`%${s}%`);
        }
        // Move supplements to cat 3  
        const supps = ['วิตามิน','vitamin','อาหารเสริม','supplement','calcium','magnesium',
          'collagen','glucosamine','omega','fish oil','โปรตีน','protein','probiotic',
          'lutein','coenzyme','q10'];
        for (const sp of supps) {
          db.prepare("UPDATE products SET categoryId=3 WHERE categoryId=1 AND (LOWER(nameTh) LIKE ? OR LOWER(nameEn) LIKE ?)")
            .run(`%${sp}%`,`%${sp}%`);
        }
        // Move cosmetics to cat 4
        const cosmo = ['shampoo','แชมพู','soap','สบู่','lotion','cream','ครีม','sunscreen',
          'deodorant','toothpaste','ยาสีฟัน','makeup','lip'];
        for (const cm of cosmo) {
          db.prepare("UPDATE products SET categoryId=4 WHERE categoryId=1 AND (LOWER(nameTh) LIKE ? OR LOWER(nameEn) LIKE ?)")
            .run(`%${cm}%`,`%${cm}%`);
        }
        console.log(`[Migration] ✅ จัดหมวดหมู่สินค้าเสร็จ`);
      }
      // Re-categorize products: ยาอันตราย
      const dangerous = [
        'amoxicillin','amoxi','cloxacillin','cephalexin','cepha','cef-','ceftriaxone',
        'azithromycin','clindamycin','gentamicin','chloramphenicol','tetracycline','doxycycline',
        'metronidazole','norfloxacin','ciprofloxacin','ofloxacin',
        'glibenclamide','metformin','glipizide','insulin',
        'amlodipine','enalapril','losartan','simvastatin','atorvastatin',
        'warfarin','clopidogrel','furosemide','spironolactone',
        'prednisolone','dexamethasone','levothyroxine',
        'salbutamol','ventolin','pulmicort',
        'omeprazole','pantoprazole','tramadol','codeine',
        'gabapentin','pregabalin','diazepam','lorazepam',
        'haloperidol','risperidone','phenytoin','phenobarbital',
        'sildenafil','tadalafil','finasteride',
        'ketoconazole','fluconazole','acyclovir',
        'diclofenac','piroxicam','meloxicam','colchicine','allopurinol',
        'methotrexate','azathioprine',
      ];
      for (const drug of dangerous) {
        db.prepare("UPDATE products SET categoryId=11 WHERE categoryId=1 AND (LOWER(nameTh) LIKE ? OR LOWER(nameEn) LIKE ? OR LOWER(genericNameTh) LIKE ?)")
          .run(`%${drug}%`,`%${drug}%`,`%${drug}%`);
      }
      // Ensure promotions table exists
      db.prepare("CREATE TABLE IF NOT EXISTS promotions (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, nameTh TEXT DEFAULT '', description TEXT DEFAULT '', type TEXT NOT NULL DEFAULT 'percentage', value REAL DEFAULT 0, minOrder REAL DEFAULT 0, maxDiscount REAL DEFAULT 0, usageLimit INTEGER DEFAULT 0, usedCount INTEGER DEFAULT 0, isActive INTEGER DEFAULT 1, startDate TEXT, endDate TEXT, createdAt TEXT DEFAULT (datetime('now')), updatedAt TEXT DEFAULT (datetime('now')))").run();
      // Add discount columns to orders if missing
      try { db.prepare("ALTER TABLE orders ADD COLUMN discount REAL DEFAULT 0").run(); } catch {}
      try { db.prepare("ALTER TABLE orders ADD COLUMN promoCode TEXT DEFAULT ''").run(); } catch {}
      try { db.prepare("ALTER TABLE orders ADD COLUMN discountType TEXT DEFAULT ''").run(); } catch {}
      console.log("[Migration] ✅ หมวดหมู่พร้อม");
    }
  } catch (e: any) { console.error("[Migration]", e?.message); }

  const { serveStaticFiles } = await import("./lib/vite");

  // ── Telegram callback webhook ──
  app.post("/telegram/callback", async (c) => {
    try {
      const body = await c.req.json();
      const { handleTelegramCallback } = await import("./lib/telegramNotify");
      const result = await handleTelegramCallback(body);
      console.log("[Telegram] Callback processed:", result);
      return c.json({ ok: true });
    } catch (e: any) {
      console.error("[Telegram] Callback error:", e?.message);
      return c.json({ ok: false, error: e?.message }, 500);
    }
  });

  // Set Telegram webhook (on startup)
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      const webhookUrl = `https://pharmacare-1783398975-production.up.railway.app/telegram/callback`;
      fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${webhookUrl}`, {
        signal: AbortSignal.timeout(5000),
      }).then(r => r.json()).then(d => {
        console.log("[Telegram] Webhook set:", d?.description || d?.ok);
      }).catch(e => {
        console.log("[Telegram] Webhook setup skipped:", e?.message);
      });
    }
  } catch {}
  const { handleSSE } = await import("./routes/events");
  app.get("/api/events/stream", handleSSE);

  // Image proxy
  app.get("/forte-img", async (c) => {
    const imageUrl = c.req.query("url");
    if (!imageUrl) return c.json({ error: "Missing url" }, 400);
    if (!imageUrl.includes("forte2014mukdahan.ddns.net")) {
      return c.json({ error: "Invalid URL" }, 400);
    }
    try {
      const res = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Referer": "https://forte2014mukdahan.ddns.net/pages/product/product_table.aspx",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });
      if (!res.ok) return c.json({ error: `Forte returned ${res.status}` }, 502);
      const buf = await res.arrayBuffer();
      const contentType = res.headers.get("content-type") || "image/jpeg";
      return c.body(new Uint8Array(buf), 200, { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" });
    } catch (e: any) {
      return c.json({ error: e?.message }, 502);
    }
  });

  app.get("/trpc/*", async (c) => {
    try {
      return await fetchRequestHandler({
        endpoint: "/trpc",
        req: c.req.raw,
        router: appRouter,
        createContext,
      });
    } catch (e: any) {
      const db = getDb(); await logApiError(c, db, "get__trpc_*", "data", null, e);
      return c.json({ error: e?.message }, 500);
    }
  });

  // ── Image cache (MUST be before serveStaticFiles) ──
  app.get("/api/images/:subpath/:filename", async (c) => {
    const subpath = c.req.param("subpath");
    const filename = c.req.param("filename");
    const path = await import("path");
    const fs = await import("fs");
    // Prescriptions in subdirectory, other images in root
    const subDir = subpath === "prescriptions" ? "prescriptions" : "";
    const imgPath = path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd(),
      typeof __dirname !== "undefined" ? "../data/images" : "data/images", subDir, filename);
    if (!fs.existsSync(imgPath)) return c.json({ error: "Not found" }, 404);
    const ext = filename.split(".").pop()?.toLowerCase();
    const mime: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
    const buf = fs.readFileSync(imgPath);
    return c.body(new Uint8Array(buf), 200, { "Content-Type": mime[ext || ""] || "image/jpeg", "Cache-Control": "public, max-age=86400" });
  });
  // Also keep the flat /api/images/:filename route for backward compatibility
  app.get("/api/images/:filename", async (c) => {
    const filename = c.req.param("filename");
    const path = await import("path");
    const fs = await import("fs");
    const imgPath = path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd(),
      typeof __dirname !== "undefined" ? "../data/images" : "data/images", filename);
    if (!fs.existsSync(imgPath)) return c.json({ error: "Not found" }, 404);
    const ext = filename.split(".").pop()?.toLowerCase();
    const mime: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
    const buf = fs.readFileSync(imgPath);
    return c.body(new Uint8Array(buf), 200, { "Content-Type": mime[ext || ""] || "image/jpeg", "Cache-Control": "public, max-age=86400" });
  });

  serveStaticFiles(app);

  // ── Debug: check file paths ──
app.get("/api/debug/paths", async (c) => {
  try {
    const payload = await requireAdmin(c);
    if (!payload) return new Response('{"error":"Unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    const path = await import("path");
    const fs = await import("fs");
    const dir1 = path.resolve(typeof __dirname !== "undefined" ? __dirname : ".", "../data/images");
    const dir2 = path.resolve(process.cwd(), "data/images");
    const dir3 = path.resolve("/app", "data/images");
    const exists1 = fs.existsSync(dir1);
    const exists2 = fs.existsSync(dir2);
    const exists3 = fs.existsSync(dir3);
    const files1 = exists1 ? fs.readdirSync(dir1).length : 0;
    const files2 = exists2 ? fs.readdirSync(dir2).length : 0;
    const files3 = exists3 ? fs.readdirSync(dir3).length : 0;
    return c.json({ cwd: process.cwd(), __dirname: typeof __dirname !== "undefined" ? __dirname : "undefined",
      dir1, exists1, files1, dir2, exists2, files2, dir3, exists3, files3 });
  } catch (e: any) {
    const db = getDb(); await logApiError(c, db, "get_debug_paths", "data", null, e);
    return c.json({ error: e?.message }, 500);
  }
});
  let autoSyncing = false;
  const startDailySync = async () => {
    if (autoSyncing) return;
    autoSyncing = true;
    console.log(`[${new Date().toISOString()}] Starting daily Forte sync...`);
    try {
      // Check if Forte is reachable (local network only)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      try {
        await fetch("http://forte2014mukdahan.ddns.net", { method: "HEAD", signal: controller.signal });
      } catch {
        console.log(`[${new Date().toISOString()}] ⏭️ Forte ไม่สามารถเข้าถึงได้ (Cloud → Local) — ข้าม Sync`);
        autoSyncing = false;
        return;
      }
      clearTimeout(timeoutId);
      const result = await autoSyncForte();
      console.log(`[${new Date().toISOString()}] Daily sync result:`, JSON.stringify(result));
    } catch (e: any) {
      console.error(`[${new Date().toISOString()}] Daily sync error:`, e?.message);
    }
    autoSyncing = false;
  };

  const checkAndSync = () => {
    try {
      const settings = getStoreSettings(getDb());
      if (settings.syncEnabled !== "true") return;
      const syncHour = parseInt(settings.syncHour || "2");
      const h = new Date().getHours();
      const m = new Date().getMinutes();
      if (h === syncHour && m < 5) {
        startDailySync();
      }
    } catch (e: any) {
      console.error("[Sync check error]", e?.message);
    }
  };
  checkAndSync(); // Run once on startup (if it's 2 AM)
  setInterval(checkAndSync, 60000); // Check every minute

  const port = parseInt(process.env.PORT || "3000");
  console.log(`[Boot] Starting server on 0.0.0.0:${port}`);
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
}

// Railway cache bust: 1783401299
