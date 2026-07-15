#!/usr/bin/env node
/**
 * forte-sync-v3.js — Forte → PharmaSIA Sync Engine v3
 *
 * 🔑 จับคู่สินค้าโดย SKU
 * ✅ ไม่เปลี่ยน categoryId ของเรา
 * 📊 รายงาน: ราคาเปลี่ยน, ต้นทุนเปลี่ยน, สินค้าใหม่
 * 🚀 Push ข้อมูลขึ้น Railway หลัง Sync
 *
 * การใช้งาน: node forte-sync-v3.js [--push]
 *   --push : Push ขึ้น Railway อัตโนมัติหลัง Sync
 */

const FORTE_BASE = "http://forte2014mukdahan.ddns.net";
const FORTE_USER = "MK25-0264";
const FORTE_PASS = "MK25-0264";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

const fs = require("fs");
const path = require("path");
const https = require("https");

// ── SQLite setup ──
const DB_PATH = path.join(__dirname, "data", "PharmaSIA.db");
let db;
try {
  db = require("better-sqlite3")(DB_PATH);
} catch {
  console.error("❌ Cannot open DB at:", DB_PATH);
  process.exit(1);
}

// ── Report data ──
const report = {
  startTime: new Date().toISOString(),
  total: 0,
  matched: 0,
  newProducts: [],
  priceChanges: [],
  costChanges: [],
  stockChanges: [],
  nameChanges: [],
  missingProducts: [],
  skipped: 0,
  errors: [],
};

// ── Helpers ──
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getHeaders(sessionId, referer) {
  return {
    "User-Agent": USER_AGENT,
    "Accept-Language": "th-TH,th;q=0.9",
    "Cookie": `ASP.NET_SessionId=${sessionId}`,
    "Referer": referer || `${FORTE_BASE}/pages/account/login.aspx`,
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function fmt(n) { return typeof n === "number" ? n.toFixed(2) : n; }

// ── Step 1: Login to Forte ──
async function login() {
  console.log("[1/5] 🔑 Login Forte...");
  const pageRes = await fetch(`${FORTE_BASE}/pages/account/login.aspx`, {
    headers: { "User-Agent": USER_AGENT, "Accept": "text/html" },
  });
  const setCookie = pageRes.headers.get("set-cookie") || "";
  const match = setCookie.match(/ASP\.NET_SessionId=([^;]+)/);
  if (!match) throw new Error("No session cookie");
  const sessionId = match[1];

  await sleep(1000);

  const loginRes = await fetch(`${FORTE_BASE}/ws/srv.php?fp=login&f_user=${FORTE_USER}&f_pass=${FORTE_PASS}`, {
    headers: getHeaders(sessionId),
  });
  const loginText = await loginRes.text();
  if (!loginText.includes("true") && !loginText.trim()) throw new Error("Login failed: " + loginText.slice(0, 100));

  console.log("   ✅ Logged in (Session: " + sessionId.slice(0, 10) + "...)");
  return sessionId;
}

// ── Step 2: Fetch all products from Forte ──
async function fetchProducts(sessionId) {
  console.log("[2/5] 📦 ดึงสินค้าจาก Forte...");
  
  const allProducts = [];
  const PAGE_SIZE = 100;
  
  // Get total count first
  const countRes = await fetch(`${FORTE_BASE}/pages/product/ProductUtil.aspx/GetProduct`, {
    method: "POST",
    headers: getHeaders(sessionId, `${FORTE_BASE}/pages/product/product_table.aspx`),
    body: JSON.stringify({ data: { recordperpage: 1, page: 1, prodnam: "", vendorname: "", categcod: "", ordercolumn: "ชื่อสินค้า" } }),
  });
  const countText = await countRes.text();
  let totalCount = 0;
  try {
    const parsed = JSON.parse(countText);
    // V2 format: d.recordsFiltered
    totalCount = parsed.d?.recordsFiltered || parsed.d?.recordsTotal || parsed.recordsTotal || parsed.recordsFiltered || 0;
  } catch {
    totalCount = 6400;
  }
  console.log(`   พบทั้งหมด ~${totalCount} รายการ`);
  
  // Fetch all pages
  let page = 1;
  while (true) {
    const res = await fetch(`${FORTE_BASE}/pages/product/ProductUtil.aspx/GetProduct`, {
      method: "POST",
      headers: getHeaders(sessionId, `${FORTE_BASE}/pages/product/product_table.aspx`),
      body: JSON.stringify({ data: { recordperpage: PAGE_SIZE, page, prodnam: "", vendorname: "", categcod: "", ordercolumn: "ชื่อสินค้า" } }),
    });
    if (res.status === 401) { console.error("❌ Session expired"); break; }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`   ❌ Page ${page}: JSON parse error:`, text.slice(0, 100));
      report.errors.push(`Page ${page}: JSON parse error`);
      break;
    }

    // V2 format: data.d === array of products
    const items = data.d || data.data || data.items || data.rows || data || [];
    if (!Array.isArray(items)) {
      console.log(`   ✅ ดึงครบแล้ว (page ${page})`);
      break;
    }

    allProducts.push(...items);
    console.log(`   หน้า ${page}: +${items.length} (รวม ${allProducts.length})`);

    if (items.length < PAGE_SIZE) break;
    page++;
    await sleep(500);
  }

  return allProducts;
}

// ── Step 3: Parse Forte product ──
function parseForteProduct(fp) {
  // Forte product structure varies — try common fields
  const sku = fp.sku || fp.SKU || fp.ItemCode || fp.item_code || fp.code || fp.ProductCode || "";
  const nameTh = fp.nameTh || fp.NameTH || fp.name_th || fp.nameTh || fp.name || fp.ItemName || fp.description || "";
  const nameEn = fp.nameEn || fp.NameEN || fp.name_en || fp.nameEn || "";
  const price = parseFloat(fp.price || fp.Price || fp.unit_price || fp.UnitPrice || fp.selling_price || fp.sellingPrice || 0);
  const costPrice = parseFloat(fp.cost || fp.Cost || fp.cost_price || fp.CostPrice || fp.costPrice || fp.unit_cost || 0);
  const stock = parseInt(fp.stock || fp.Stock || fp.qty || fp.Qty || fp.quantity || fp.Quantity || fp.stock_qty || 0);
  const barcode = fp.barcode || fp.Barcode || fp.bar_code || "";
  const company = fp.company || fp.Company || fp.brand || fp.Brand || "";
  const category = fp.category || fp.Category || fp.category_name || "";
  
  return { sku: String(sku).trim(), nameTh, nameEn, price, costPrice, stock, barcode, company, category };
}

// ── Step 4: Compare & Sync ──
function syncProducts(products) {
  console.log("[3/5] 🔄 เปรียบเทียบข้อมูล...");
  
  const dbSkuMap = new Map();
  const dbRows = db.prepare("SELECT id, sku, nameTh, price, costPrice, stock, categoryId FROM products").all();
  for (const row of dbRows) {
    dbSkuMap.set(row.sku.trim().toUpperCase(), row);
  }

  const forteSkuSet = new Set();
  const updateStmt = db.prepare("UPDATE products SET price = ?, costPrice = ?, stock = ?, nameTh = ?, nameEn = ?, barcode = ?, updatedAt = datetime('now') WHERE id = ?");
  const insertStmt = db.prepare("INSERT OR IGNORE INTO products (sku, nameTh, nameEn, price, costPrice, stock, barcode, categoryId, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 10, 'active', datetime('now'), datetime('now'))");
  
  let txCount = 0;
  const batchSize = 100;

  const doBatch = db.transaction(() => {
    for (const fp of products) {
      const item = parseForteProduct(fp);
      if (!item.sku) {
        report.skipped++;
        continue;
      }

      const key = item.sku.toUpperCase();
      forteSkuSet.add(key);
      report.total++;

      const existing = dbSkuMap.get(key);
      if (existing) {
        // Product exists — compare
        report.matched++;
        const changes = [];

        // Price change
        if (Math.abs((existing.price || 0) - item.price) > 0.01) {
          report.priceChanges.push({
            sku: item.sku,
            name: item.nameTh,
            oldPrice: existing.price,
            newPrice: item.price,
          });
          changes.push(`price: ${fmt(existing.price)} → ${fmt(item.price)}`);
        }

        // Cost change
        if (Math.abs((existing.costPrice || 0) - item.costPrice) > 0.01) {
          report.costChanges.push({
            sku: item.sku,
            name: item.nameTh,
            oldCost: existing.costPrice,
            newCost: item.costPrice,
          });
          changes.push(`cost: ${fmt(existing.costPrice)} → ${fmt(item.costPrice)}`);
        }

        // Stock change
        if ((existing.stock || 0) !== item.stock) {
          report.stockChanges.push({
            sku: item.sku,
            name: item.nameTh,
            oldStock: existing.stock,
            newStock: item.stock,
          });
          changes.push(`stock: ${existing.stock} → ${item.stock}`);
        }

        // Name change
        if (existing.nameTh !== item.nameTh && item.nameTh) {
          report.nameChanges.push({
            sku: item.sku,
            oldName: existing.nameTh,
            newName: item.nameTh,
          });
        }

        // Always update (even if no change — to update updatedAt)
        if (changes.length > 0 || true) {
          updateStmt.run(item.price, item.costPrice, item.stock, item.nameTh || existing.nameTh, item.nameEn || "", item.barcode || "", existing.id);
        }
      } else {
        // New product
        report.newProducts.push({
          sku: item.sku,
          name: item.nameTh || item.nameEn,
          price: item.price,
          costPrice: item.costPrice,
        });
        insertStmt.run(item.sku, item.nameTh, item.nameEn, item.price, item.costPrice, item.stock, item.barcode || "");
      }

      txCount++;
      if (txCount % batchSize === 0) process.stdout.write(".");
    }
  });

  doBatch();
  console.log(`\n   ✅ Sync ${report.total} รายการ (เปลี่ยนแปลง ${report.priceChanges.length + report.costChanges.length + report.stockChanges.length} รายการ)`);

  // Find missing products
  for (const [sku, row] of dbSkuMap) {
    if (!forteSkuSet.has(sku)) {
      report.missingProducts.push({
        id: row.id,
        sku: row.sku,
        name: row.nameTh,
      });
    }
  }
}

// ── Step 5: Print report ──
function printReport() {
  console.log("\n═══════════════════════════════════════");
  console.log("📊  SYNC REPORT");
  console.log("═══════════════════════════════════════");
  console.log(`🕐 เริ่ม: ${report.startTime}`);
  console.log(`🕐 เสร็จ: ${new Date().toISOString()}`);
  console.log(`📦 สินค้าทั้งหมด: ${report.total} รายการ`);
  console.log(`✅ จับคู่สำเร็จ: ${report.matched} รายการ`);
  console.log(`🆕 สินค้าใหม่: ${report.newProducts.length} รายการ`);
  console.log(`📈 ราคาเปลี่ยน: ${report.priceChanges.length} รายการ`);
  console.log(`💰 ต้นทุนเปลี่ยน: ${report.costChanges.length} รายการ`);
  console.log(`📦 สต็อกเปลี่ยน: ${report.stockChanges.length} รายการ`);
  console.log(`⚠️ สินค้าที่อาจหายไป: ${report.missingProducts.length} รายการ`);
  
  if (report.priceChanges.length > 0) {
    console.log("\n📈 ราคาที่เปลี่ยน:");
    for (const c of report.priceChanges.slice(0, 20)) {
      console.log(`   ${c.sku} | ${(c.name || "").slice(0, 40)} | ${fmt(c.oldPrice)} → ${fmt(c.newPrice)}`);
    }
    if (report.priceChanges.length > 20) console.log(`   ... และอีก ${report.priceChanges.length - 20} รายการ`);
  }
  
  if (report.newProducts.length > 0) {
    console.log("\n🆕 สินค้าใหม่ (รอจัดหมวดหมู่):");
    for (const n of report.newProducts) {
      console.log(`   ${n.sku} | ${(n.name || "").slice(0, 50)} | ฿${fmt(n.price)}`);
    }
  }
  
  if (report.missingProducts.length > 0) {
    console.log("\n⚠️ สินค้าที่ไม่มีใน Forte (อาจเลิกผลิต):");
    for (const m of report.missingProducts) {
      console.log(`   ${m.sku} | ${(m.name || "").slice(0, 50)}`);
    }
  }

  if (report.errors.length > 0) {
    console.log("\n❌ ข้อผิดพลาด:");
    for (const e of report.errors) console.log(`   ${e}`);
  }

  // Save report to file
  const reportPath = path.join(__dirname, "data", `sync_report_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 รายงานบันทึกที่: ${reportPath}`);

  // Save summary report
  const summaryPath = path.join(__dirname, "data", "sync_latest_report.json");
  fs.writeFileSync(summaryPath, JSON.stringify({
    timestamp: report.startTime,
    total: report.total,
    newProducts: report.newProducts.length,
    priceChanges: report.priceChanges.length,
    costChanges: report.costChanges.length,
    stockChanges: report.stockChanges.length,
    missingProducts: report.missingProducts.length,
  }, null, 2));
}

// ── Main ──
async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║    Forte → PharmaSIA Sync v3       ║");
  console.log("╚══════════════════════════════════════╝\n");

  try {
    const sessionId = await login();
    const products = await fetchProducts(sessionId);
    syncProducts(products);
    printReport();

    // Push to Railway if --push flag
    if (process.argv.includes("--push")) {
      console.log("\n[4/5] 🚀 Push ขึ้น Railway...");
      try {
        const adminEmail = "kittiphong4489@gmail.com";
        const adminPass = "44894489";
        
        // Login to Railway API
        const loginRes = await fetch("https://PharmaSIA-1783398975-production.up.railway.app/api/trpc/auth.login?batch=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ "0": { email: adminEmail, password: adminPass } }),
        });
        const loginData = await loginRes.json();
        const token = loginData[0]?.result?.data?.token;
        if (!token) throw new Error("Cannot login to Railway");
        
        // Build product diff
        const changes = [];
        for (const c of report.priceChanges) {
          const dbRow = db.prepare("SELECT nameTh, nameEn, price, costPrice, stock, barcode FROM products WHERE sku=?").get(c.sku);
          if (dbRow) changes.push({ sku: c.sku, ...dbRow });
        }
        for (const c of report.costChanges) {
          if (!changes.find(x => x.sku === c.sku)) {
            const dbRow = db.prepare("SELECT nameTh, nameEn, price, costPrice, stock, barcode FROM products WHERE sku=?").get(c.sku);
            if (dbRow) changes.push({ sku: c.sku, ...dbRow });
          }
        }
        for (const n of report.newProducts) {
          const dbRow = db.prepare("SELECT nameTh, nameEn, price, costPrice, stock, barcode FROM products WHERE sku=?").get(n.sku);
          if (dbRow) changes.push({ sku: n.sku, ...dbRow });
        }
        
        if (changes.length > 0) {
          const pushRes = await fetch("https://PharmaSIA-1783398975-production.up.railway.app/api/products/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ products: changes }),
          });
          const pushData = await pushRes.json();
          if (pushData.success) {
            console.log(`   ✅ Push สำเร็จ: อัปเดต ${pushData.updated} เพิ่ม ${pushData.inserted}`);
          } else {
            console.log(`   ⚠️ Push มีปัญหา:`, pushData.error);
          }
        } else {
          console.log(`   ✅ ไม่มีข้อมูลเปลี่ยนแปลง — ข้าม Push`);
        }
      } catch (e) {
        console.log(`   ⚠️ Push ล้มเหลว: ${e.message}`);
        console.log(`   💡 แนะนำ: ใช้ git push แทน`);
      }
    }

    console.log("\n✅ Sync เสร็จสมบูรณ์!");
  } catch (e) {
    console.error("\n❌ Sync ล้มเหลว:", e.message);
    process.exit(1);
  }
}

main();
