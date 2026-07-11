#!/usr/bin/env node
/**
 * forte-sync-v2.js — Forte Product Sync (ใช้ API แบบเดียวกับ Server)
 * 
 * วิธีใช้: node forte-sync-v2.js <username> <password> [output.json]
 */

const FORTE_BASE = "https://forte2014mukdahan.ddns.net";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function getHeaders(sessionId, referer) {
  return {
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json; charset=utf-8",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "th-TH,th;q=0.9",
    "Cookie": `ASP.NET_SessionId=${sessionId}`,
    "Referer": referer,
    "X-Requested-With": "XMLHttpRequest",
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function login(username, password) {
  console.log("[1] GET login page...");
  const pageRes = await fetch(`${FORTE_BASE}/pages/account/login.aspx`, {
    headers: { "User-Agent": USER_AGENT, "Accept": "text/html" },
  });
  const setCookie = pageRes.headers.get("set-cookie") || "";
  const sid = setCookie.match(/ASP\.NET_SessionId=([^;]+)/)?.[1];
  if (!sid) { console.error("❌ No session"); process.exit(1); }
  console.log(`✅ Session: ${sid.substring(0, 8)}...`);

  await sleep(1000);

  console.log("[2] API Login...");
  const loginRes = await fetch(`${FORTE_BASE}/pages/account/AccountUtil.aspx/Login`, {
    method: "POST",
    headers: getHeaders(sid, `${FORTE_BASE}/pages/account/login.aspx`),
    body: JSON.stringify({ memberno: username, password, isremember: true }),
  });
  const loginData = await loginRes.json();
  if (loginData.d && loginData.d[0] === "1") {
    console.log("✅ Login สำเร็จ!");
    return sid;
  }
  console.error("❌ Login ล้มเหลว:", JSON.stringify(loginData.d));
  process.exit(1);
}

async function fetchPage(sid, page, perPage) {
  const res = await fetch(`${FORTE_BASE}/pages/product/ProductUtil.aspx/GetProduct`, {
    method: "POST",
    headers: getHeaders(sid, `${FORTE_BASE}/pages/product/product_table.aspx`),
    body: JSON.stringify({ data: { recordperpage: perPage, page, prodnam: "", vendorname: "", categcod: "", ordercolumn: "ชื่อสินค้า" } }),
  });
  if (res.status === 401) { console.error("❌ Session expired"); process.exit(1); }
  return await res.json();
}

async function main() {
  const [, , username, password, outputFile = "forte-products.json"] = process.argv;
  if (!username || !password) {
    console.log("Usage: node forte-sync-v2.js <username> <password> [output.json]");
    process.exit(1);
  }

  const sid = await login(username, password);
  await sleep(1500);

  console.log("[3] Fetch page 1...");
  const first = await fetchPage(sid, 1, 100);
  const totalPages = first.d?.pagecount || 1;
  const totalCount = first.d?.recordcount || 0;
  console.log(`📊 Total: ${totalCount} products, ${totalPages} pages`);

  let allProducts = first.d?.ListProductDetail || [];

  for (let p = 2; p <= totalPages; p++) {
    console.log(`   Page ${p}/${totalPages}...`);
    await sleep(2000 + Math.random() * 2000);
    const data = await fetchPage(sid, p, 100);
    const items = data.d?.ListProductDetail || [];
    allProducts.push(...items);
  }

  // Map to our format
  const mapped = allProducts.map(p => ({
    sku: `FT-${p.prodcode || Math.random().toString(36).substring(2, 8)}`,
    nameTh: (p.prodnam1 || "").trim(),
    nameEn: (p.prodnam2 || "").trim(),
    genericNameTh: (p.genericnam || "").trim(),
    category: p.categnam || "อื่นๆ",
    costPrice: parseFloat(String(p.defaultprice || 0)),
    barcode: p.barcode1 || "",
    vendorcod: p.vendorcod || "",
    stockStatus: p.status === "A" ? "in_stock" : "out_of_stock",
  }));

  import("fs").then(({ writeFileSync }) => {
    writeFileSync(outputFile, JSON.stringify(mapped, null, 2), "utf-8");
    console.log(`\n✅ Sync สำเร็จ! ${mapped.length} รายการ → ${outputFile}`);
  });
}

main().catch(e => { console.error("❌ Error:", e.message); process.exit(1); });
