#!/usr/bin/env node
/**
 * ============================================================
 * scripts/forte-fetch.js — Forte Product Scraper (Node.js)
 * ============================================================
 * วิธีใช้:
 *   1. ติดตั้ง Node.js (https://nodejs.org)
 *   2. รัน: node forte-fetch.js <username> <password> [output.json]
 *   3. ได้ไฟล์ JSON → นำไป Upload ใน PharmaCare
 *
 * ตัวอย่าง:
 *   node forte-fetch.js MK25-0264 mypassword
 *   node forte-fetch.js MK25-0264 mypassword products.json
 * ============================================================
 */

const FORTE_BASE = "https://forte2014mukdahan.ddns.net";

async function forteLogin(username, password) {
  console.log("[1] GET login page...");
  const getRes = await fetch(`${FORTE_BASE}/pages/account/login.aspx`);
  const html = await getRes.text();

  const vs = html.match(/id="__VIEWSTATE"[^>]*value="([^"]*)"/)?.[1] || "";
  const ev = html.match(/id="__EVENTVALIDATION"[^>]*value="([^"]*)"/)?.[1] || "";
  const vsg = html.match(/id="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/)?.[1] || "";

  const cookie = getRes.headers.get("set-cookie") || "";
  const sid = cookie.match(/ASP\.NET_SessionId=([^;]+)/)?.[1];

  if (!sid) {
    console.error("❌ ไม่ได้ Session Cookie — ตรวจสอบว่า Forte online อยู่หรือไม่");
    process.exit(1);
  }
  console.log(`✅ Session OK: ${sid.substring(0, 8)}...`);

  console.log("[2] POST login...");
  const fd = new URLSearchParams();
  fd.append("__VIEWSTATE", vs);
  fd.append("__VIEWSTATEGENERATOR", vsg);
  fd.append("__EVENTVALIDATION", ev);
  fd.append("inputUserName", username);
  fd.append("inputPassword", password);
  fd.append("chkRemember", "on");

  const postRes = await fetch(`${FORTE_BASE}/pages/account/login.aspx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": `ASP.NET_SessionId=${sid}`,
      "Referer": `${FORTE_BASE}/pages/account/login.aspx`,
    },
    body: fd.toString(),
    redirect: "manual",
  });

  console.log(`    Status: ${postRes.status}`);
  if (postRes.status === 302) {
    const loc = postRes.headers.get("location") || "";
    if (loc.includes("home") || loc.includes("Home")) {
      console.log("✅ Login สำเร็จ!");
      return sid;
    }
  }

  // Check response body
  const body = await postRes.text();
  if (body.includes("Logout") || body.includes("หน้าหลัก")) {
    console.log("✅ Login สำเร็จ!");
    return sid;
  }

  console.error("❌ Login ล้มเหลว — ตรวจสอบ username/password");
  process.exit(1);
}

async function fetchProducts(sessionId) {
  console.log("[3] Fetch หน้าสินค้า...");
  const res = await fetch(`${FORTE_BASE}/pages/product/product_table.aspx`, {
    headers: {
      "Cookie": `ASP.NET_SessionId=${sessionId}`,
      "Referer": `${FORTE_BASE}/pages/home/home.aspx`,
    },
  });

  if (res.status === 302) {
    console.error("❌ Session หมดอายุ");
    process.exit(1);
  }

  const html = await res.text();
  console.log(`    HTML: ${html.length} bytes`);

  // Parse table rows
  const products = [];
  const seen = new Set();

  // Strategy 1: Parse <tr> rows with <td> cells
  const rowMatches = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)];
  console.log(`    พบ ${rowMatches.length} แถว`);

  for (const [, rowContent] of rowMatches) {
    const cells = [...rowContent.matchAll(/<td[^>]*>(.*?)<\/td>/gi)]
      .map((m) =>
        m[1]
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .trim()
      )
      .filter(Boolean);

    if (cells.length < 2) continue;

    // First cell = name, Last cell = price
    const nameTh = cells[0];
    const priceStr = cells[cells.length - 1].replace(/,/g, "");
    const costPrice = parseFloat(priceStr) || 0;

    if (!nameTh || costPrice <= 0) continue;
    if (seen.has(nameTh)) continue;
    seen.add(nameTh);

    // Categorize
    const n = nameTh.toLowerCase();
    let category = "ยารักษาโรค";
    if (/vitamin|วิตามิน|แคลเซียม|iron/.test(n)) category = "วิตามินและอาหารเสริม";
    else if (/saline|syringe|ถุงมือ|หน้ากาก|mask|เทอร์โม|น้ำเกลือ/.test(n)) category = "อุปกรณ์การแพทย์";
    else if (/ครีม|โลชั่น|lotion|shampoo|สบู่/.test(n)) category = "ผลิตภัณฑ์ดูแลสุขภาพ";
    else if (/baby|เด็ก|นมผง/.test(n)) category = "สินค้าเด็ก";

    // Extract generic name from parentheses
    const genericMatch = nameTh.match(/\(([^)]+)\)/);
    const genericNameTh = genericMatch ? genericMatch[1] : "";
    const cleanName = nameTh.replace(/\s*\([^)]+\)/, "").trim();

    products.push({
      nameTh: cleanName,
      genericNameTh,
      company: cells.length > 2 ? cells[cells.length - 2] : "",
      category,
      costPrice,
      barcode: "",
      imageUrl: "",
      stockStatus: "in_stock",
    });
  }

  // Strategy 2: If no table rows found, try alternative patterns
  if (products.length === 0) {
    console.log("    ลอง parse แบบอื่น...");
    const pattern = /([\u0E00-\u0E7F\w\s%-]+)\s+(\d+\.?\d*)/g;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const name = match[1].trim();
      const price = parseFloat(match[2]);
      if (name.length > 2 && price > 0 && !seen.has(name)) {
        seen.add(name);
        products.push({ nameTh: name, genericNameTh: "", company: "", category: "ยารักษาโรค", costPrice: price, barcode: "", imageUrl: "", stockStatus: "in_stock" });
      }
    }
  }

  console.log(`✅ พบสินค้า ${products.length} รายการ`);
  return products;
}

async function main() {
  const [, , username, password, outputFile = "forte-products.json"] = process.argv;

  if (!username || !password) {
    console.log("Usage: node forte-fetch.js <username> <password> [output.json]");
    console.log("Example: node forte-fetch.js MK25-0264 mypassword");
    process.exit(1);
  }

  console.log(`=== Forte Product Scraper ===`);
  console.log(`Username: ${username}`);
  console.log(`Output: ${outputFile}\n`);

  const sid = await forteLogin(username, password);
  const products = await fetchProducts(sid);

  // Write JSON
  const fs = require("fs");
  fs.writeFileSync(outputFile, JSON.stringify(products, null, 2), "utf-8");

  console.log(`\n✅ บันทึก ${products.length} รายการ → ${outputFile}`);
  console.log(`\nขั้นตอนต่อไป:`);
  console.log(`  1. เปิดหน้า "จัดการสินค้า Forte" ใน PharmaCare`);
  console.log(`  2. กด "Upload JSON" → เลือกไฟล์ ${outputFile}`);
  console.log(`  3. กำหนด % กำไร → บันทึก`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
