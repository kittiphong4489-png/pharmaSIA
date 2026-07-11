/**
 * ============================================================
 * api/routers/forteProxyRouter.ts — Forte Human-Like Sync + Image
 * ============================================================
 * - Headers สมบูรณ์เหมือน Chrome
 * - Delay สุ่ม 1-4 วินาทีระหว่างหน้า
 * - Sync ทีละ 10 หน้า (batch)
 * - ไม่จำกัดเวลา — ดึงได้ตลอด 24 ชั่วโมง
 * - ดึงทั้งหมด หรือ กรองยาสามัญ
 * - Proxy รูปภาพผ่าน backend
 * ============================================================
 */

import { z } from "zod";
import { createRouter, publicQuery, publicMutation } from "../middleware";
import { getDb, saveProductsBackup } from "../queries/connection";
import { resolveCategoryId, categorizeByName, ALL_CATEGORIES } from "../lib/categoryMapping";
import path from "path";
import fs from "fs";

const FORTE_BASE = "http://forte2014mukdahan.ddns.net";
const FORTE_CREDENTIALS = {
  username: process.env.FORTE_USERNAME || "",
  password: process.env.FORTE_PASSWORD || "",
};

const CHROME_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "X-Requested-With": "XMLHttpRequest",
  "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

function getHumanHeaders(sessionId: string, referer: string): Record<string, string> {
  return {
    ...CHROME_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Cookie": `ASP.NET_SessionId=${sessionId}`,
    "Referer": referer,
  };
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function randomDelay(minMs = 1000, maxMs = 4000) {
  return sleep(minMs + Math.floor(Math.random() * (maxMs - minMs + 1)));
}

function isBusinessHours(): boolean {
  // Convert server UTC to Thailand time (UTC+7)
  const d = new Date();
  const thHour = (d.getUTCHours() + 7) % 24;
  return thHour >= 6 && thHour < 23;
}

function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/ASP\.NET_SessionId=([^;]+)/);
  return match ? match[1] : null;
}

// ── ยาสามัญประจำบ้าน keywords ──
const HOUSEHOLD_DRUGS = [
  "paracetamol", "ไข้", "ปวดหัว", "ท้องเสีย", "ท้องร่วง",
  "ยาดม", "ยาหม่อง", "ฟ้าทะลายโจร", "วิตามิน", "ซี",
  "แก้ไอ", "แก้ท้อง", "แก้ปวด", "แก้ไข้", "แก้แพ้",
  "povidone", "เบตาดีน", "พลาสเตอร์", "salonpas",
  "ยาฆ่าเชื้อ", "น้ำเกลือ", "น้ำยาล้างแผล",
  "aspirin", "แอสไพริน", "ibuprofen", "ไอบูโพรเฟน",
  "loratadine", "chlorpheniramine", "cetirizine",
  "antacid", "gaviscon", "smecta", "oral rehydration",
  "เม็ดกลม", "สามัญ", "ประจำบ้าน", "ถุงยาง",
];

function isHouseholdDrug(name: string): boolean {
  const n = name.toLowerCase();
  return HOUSEHOLD_DRUGS.some((kw) => n.includes(kw.toLowerCase()));
}

// ── Interfaces ──
interface ForteApiProduct {
  prodcode: string;
  prodnam1: string;
  prodnam2: string;
  barcode1: string;
  categnam: string;
  catName?: string;
  vendorcod: string;
  defaultprice: number;
  genericnam: string;
  pictname: string;
  status: string;
}

interface ForteApiResponse {
  d?: {
    recordcount?: number;
    pagecount?: number;
    ListProductDetail?: ForteApiProduct[];
  };
}

// ── Login ──
export async function forteLogin(
  username: string,
  password: string,
  retries = 3
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  try {
    if (!isBusinessHours()) {
      return { success: false, error: "Sync allowed during business hours only (6:00-24:00 TH)" };
    }
    const loginPageRes = await fetch(`${FORTE_BASE}/pages/account/login.aspx`, {
      method: "GET",
      headers: {
        "User-Agent": CHROME_HEADERS["User-Agent"],
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": CHROME_HEADERS["Accept-Language"],
      },
    });
    await randomDelay(500, 1500);
    const sessionId = extractSessionCookie(loginPageRes.headers.get("set-cookie"));
    if (!sessionId) return { success: false, error: "Cannot obtain session from Forte" };

    const loginRes = await fetch(`${FORTE_BASE}/pages/account/AccountUtil.aspx/Login`, {
      method: "POST",
      headers: getHumanHeaders(sessionId, `${FORTE_BASE}/pages/account/login.aspx`),
      body: JSON.stringify({ memberno: username, password: password, isremember: true }),
    });
    const loginData = (await loginRes.json()) as { d?: string };
    if (loginData.d && loginData.d[0] === "1") {
      return { success: true, sessionId };
    }
    return { success: false, error: `Login failed: ${JSON.stringify(loginData.d)}` };
  } catch (err: any) {
    return { success: false, error: `Network error: ${err?.message || err}` };
  }
}

// ── Fetch one page ──
async function serverForteFetchPage(sessionId: string, page: number, recordPerPage: number) {
  try {
    await randomDelay(1000, 4000);
    const res = await fetch(`${FORTE_BASE}/pages/product/ProductUtil.aspx/GetProduct`, {
      method: "POST",
      headers: getHumanHeaders(sessionId, `${FORTE_BASE}/pages/product/product_table.aspx`),
      body: JSON.stringify({
        data: {
          recordperpage: recordPerPage,
          page: page,
          prodnam: "",
          vendorname: "",
          categcod: "",
          ordercolumn: "ชื่อสินค้า",
        },
      }),
    });
    if (res.status === 401 || res.status === 302) {
      return { success: false, error: "Session expired or unauthorized" };
    }
    const data = (await res.json()) as ForteApiResponse;
    if (!data.d || !data.d.ListProductDetail) {
      return { success: false, error: "Invalid API response format" };
    }
    return {
      success: true,
      products: data.d.ListProductDetail,
      totalCount: data.d.recordcount || 0,
      pageCount: data.d.pagecount || 1,
    };
  } catch (err: any) {
    return { success: false, error: `Fetch error: ${err?.message || err}` };
  }
}

// ── Map API → our format ──
function mapForteProduct(apiProd: ForteApiProduct) {
  const nameTh = (apiProd.prodnam1 || "").trim();
  const nameEn = (apiProd.prodnam2 || apiProd.prodnam1 || "").trim();
  const genericNameTh = (apiProd.genericnam || apiProd.prodnam2 || "").trim();
  const category = apiProd.categnam || categorize(nameTh);
  const costPrice = parseFloat(String(apiProd.defaultprice || 0));
  const prodcode = apiProd.prodcode || Math.random().toString(36).substring(2, 10);

  return {
    id: `ft-${prodcode}`,
    sku: `FT-${prodcode}`,
    nameTh,
    nameEn,
    genericNameTh,
    company: apiProd.vendorcod || "",
    category,
    costPrice,
    barcode: apiProd.barcode1 || "",
    pictname: apiProd.pictname || "",
    imageUrl: apiProd.pictname ? `${FORTE_BASE}/Images/${apiProd.pictname}` : "",
    stockStatus: apiProd.status === "A" ? "in_stock" : "out_of_stock",
  };
}

function categorize(name: string): string {
  // Fallback — returns Forte category name for downstream getCatId lookup
  // The actual mapping is now handled by resolveCategoryId() from categoryMapping
  const catId = categorizeByName(name);
  const cat = ALL_CATEGORIES.find(c => c.id === catId);
  return cat?.nameTh || "อื่นๆ/รอจัด";
}

// ── Price calculation ──
function calculatePrices(
  products: any[],
  defaultMargin: number,
  categoryMargins: Record<string, number>,
  productMargins: Record<string, number>,
  roundTo: "0.5" | "1" | "5" | "10" = "0.5"
) {
  return products.map((p) => {
    const margin = productMargins[p.id] ?? categoryMargins[p.category] ?? defaultMargin;
    let sellingPrice = p.costPrice * (1 + margin / 100);
    switch (roundTo) {
      case "0.5": sellingPrice = Math.ceil(sellingPrice * 2) / 2; break;
      case "1": sellingPrice = Math.ceil(sellingPrice); break;
      case "5": sellingPrice = Math.ceil(sellingPrice / 5) * 5; break;
      case "10": sellingPrice = Math.ceil(sellingPrice / 10) * 10; break;
    }
    return { ...p, marginPercent: margin, sellingPrice };
  });
}

// ── tRPC Router ──
export const forteProxyRouter = createRouter({
  // ── Login ──
  login: publicQuery
    .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return await serverForteLogin(input.username, input.password);
    }),

  // ── Fetch single page (human-like) ──
  fetchPage: publicQuery
    .input(
      z.object({
        sessionId: z.string().min(1),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(100),
        marginSettings: z.object({
          defaultMargin: z.number().min(0).max(100).default(15),
          categoryMargins: z.record(z.string(), z.number()).default({}),
          productMargins: z.record(z.string(), z.number()).default({}),
          roundTo: z.enum(["0.5", "1", "5", "10"]).default("0.5"),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const startTime = Date.now();
      if (!isBusinessHours()) {
        return { success: false as const, products: [], page: input.page, totalCount: 0, durationMs: Date.now() - startTime, error: "Sync allowed during business hours only (6:00-24:00 TH)" };
      }
      const result = await serverForteFetchPage(input.sessionId, input.page, input.pageSize);
      if (!result.success) {
        return { success: false as const, products: [], page: input.page, totalCount: 0, durationMs: Date.now() - startTime, error: result.error };
      }
      const mapped = (result.products || []).map(mapForteProduct);
      const withPrices = calculatePrices(mapped, input.marginSettings.defaultMargin, input.marginSettings.categoryMargins, input.marginSettings.productMargins, input.marginSettings.roundTo);
      return { success: true as const, products: withPrices, page: input.page, totalCount: result.totalCount || 0, pageCount: result.pageCount || 1, durationMs: Date.now() - startTime };
    }),

  // ── Image proxy + cache + update product ──
  getImage: publicQuery
    .input(z.object({ imageUrl: z.string().min(1), pictname: z.string().optional(), sku: z.string().optional() }))
    .mutation(async ({ input }) => {
      try {
        const res = await fetch(input.imageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://forte2014mukdahan.ddns.net/pages/product/product_table.aspx",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          },
        });

        if (!res.ok) {
          return { success: false as const, data: null, contentType: "image/gif" };
        }

        const arrayBuffer = await res.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const contentType = res.headers.get("content-type") || "image/jpeg";

        // ── Save to disk cache + update product image field ──
        if (input.pictname) {
          try {
            const path = await import("path");
            const fs = await import("fs");
            const IMG_DIR = path.resolve(typeof __dirname !== "undefined" ? __dirname : ".", "../data/images");
            fs.mkdirSync(IMG_DIR, { recursive: true });
            const localPath = path.join(IMG_DIR, input.pictname);
            if (!fs.existsSync(localPath)) {
              fs.writeFileSync(localPath, Buffer.from(arrayBuffer));
            }
            // Update product image field in DB
            const { getDb } = await import("../queries/connection");
            const db = getDb();
            const imgUrl = `/api/images/${input.pictname}`;
            if (input.sku) {
              db.prepare("UPDATE products SET image = ? WHERE sku = ?").run(imgUrl, input.sku);
            } else {
              const skuPrefix = input.pictname.replace(/\.\w+$/, "");
              db.prepare("UPDATE products SET image = ? WHERE sku = ?").run(imgUrl, `FT-${skuPrefix}`);
            }
          } catch (e: any) {
            console.error("[getImage] Cache error:", e?.message);
          }
        }

        return {
          success: true as const,
          data: base64,
          contentType,
        };
      } catch {
        return { success: false as const, data: null, contentType: "image/gif" };
      }
    }),

  // ── Batch sync: 10 pages at a time (human-like) ──
  batchSync: publicQuery
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(1),
        startPage: z.number().min(1).default(1),
        batchSize: z.number().min(1).max(10).default(10),
        filterHousehold: z.boolean().default(false),
        marginSettings: z.object({
          defaultMargin: z.number().min(0).max(100).default(15),
          categoryMargins: z.record(z.string(), z.number()).default({}),
          productMargins: z.record(z.string(), z.number()).default({}),
          roundTo: z.enum(["0.5", "1", "5", "10"]).default("0.5"),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const startTime = Date.now();
      if (!isBusinessHours()) {
        return { success: false as const, products: [], totalCount: 0, syncTime: new Date().toISOString(), durationMs: Date.now() - startTime, error: "Sync allowed during business hours only (6:00-24:00 TH)" };
      }

      const loginResult = await serverForteLogin(input.username, input.password);
      if (!loginResult.success) {
        return { success: false as const, products: [], totalCount: 0, syncTime: new Date().toISOString(), durationMs: Date.now() - startTime, error: loginResult.error };
      }

      const firstPage = await serverForteFetchPage(loginResult.sessionId!, 1, 100);
      if (!firstPage.success) {
        return { success: false as const, products: [], totalCount: 0, syncTime: new Date().toISOString(), durationMs: Date.now() - startTime, error: firstPage.error };
      }

      const totalPages = firstPage.pageCount || Math.ceil((firstPage.totalCount || 6314) / 100);
      const endPage = Math.min(input.startPage + input.batchSize - 1, totalPages);
      const allApiProducts: ForteApiProduct[] = input.startPage === 1 ? [...(firstPage.products || [])] : [];

      const actualStart = input.startPage === 1 ? 2 : input.startPage;
      for (let page = actualStart; page <= endPage; page++) {
        await randomDelay(1500, 4000);
        const pageResult = await serverForteFetchPage(loginResult.sessionId!, page, 100);
        if (pageResult.success && pageResult.products) {
          allApiProducts.push(...pageResult.products);
        }
      }

      const mapped = allApiProducts.map(mapForteProduct);
      const withPrices = calculatePrices(mapped, input.marginSettings.defaultMargin, input.marginSettings.categoryMargins, input.marginSettings.productMargins, input.marginSettings.roundTo);

      // Filter household drugs if requested
      const finalProducts = input.filterHousehold
        ? withPrices.filter((p) => isHouseholdDrug(p.nameTh) || isHouseholdDrug(p.genericNameTh) || p.category === "ยาสามัญประจำบ้าน")
        : withPrices;

      return {
        success: true as const,
        products: finalProducts,
        totalCount: finalProducts.length,
        syncTime: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        totalPages,
        fetchedPages: endPage,
        hasMore: endPage < totalPages,
        nextStartPage: endPage + 1,
        householdOnly: input.filterHousehold,
      };
    }),
  // ── Save Forte products to server DB ──
  saveToDb: publicQuery
    .input(z.object({
      mode: z.enum(["full", "prices_only"]).default("full"),
      products: z.array(z.object({
        sku: z.string(),
        nameTh: z.string(),
        nameEn: z.string().optional(),
        genericNameTh: z.string().optional(),
        category: z.string(),
        costPrice: z.number(),
        barcode: z.string().optional(),
        sellingPrice: z.number().optional(),
        stockStatus: z.string().optional(),
        pictname: z.string().optional(),
        imageUrl: z.string().optional(),
        pricesJson: z.string().optional(),
        packsize: z.string().optional(),
        memo1: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      let inserted = 0, updated = 0;
      const insertStmt = db.prepare(`INSERT OR REPLACE INTO products
        (sku, nameTh, nameEn, price, costPrice, stock, categoryId, status, barcode, genericNameTh, image, createdAt, updatedAt, visibleToJson, legalCategory, pricesJson, packsize, memo1)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?)`);

      const getCatId = (name: string): number => {
        // ใช้ categoryMapping module — map จาก Forte category name → 10 หมวด
        return resolveCategoryId(name, '');
      };

      let priceSkipped = 0;

      const tx = db.transaction(() => {
        for (const p of input.products) {
          const categoryId = getCatId(p.category);
          const existing = db.prepare("SELECT id, nameTh FROM products WHERE sku = ?").get(p.sku) as any;
          if (input.mode === "prices_only") {
            // Smart price sync: verify product names match before updating
            if (existing) {
              const dbNameTh = (existing.nameTh || "").trim().toLowerCase();
              const incomingNameTh = (p.nameTh || "").trim().toLowerCase();
              if (dbNameTh === incomingNameTh) {
                // Names match → safe to update prices
                db.prepare("UPDATE products SET price = ?, costPrice = ?, updatedAt = datetime('now') WHERE sku = ?")
                  .run(p.sellingPrice || p.costPrice, p.costPrice, p.sku);
                updated++;
              } else {
                // Names don't match → skip this product, warn
                priceSkipped++;
              }
            }
            // Skip INSERT for new products when prices_only
          } else {
            // Full sync mode
            const imgUrl = p.imageUrl || (p.pictname ? `/api/images/${p.pictname}` : null);
            if (existing) {
              db.prepare("UPDATE products SET price = ?, costPrice = ?, nameTh = ?, nameEn = ?, barcode = ?, genericNameTh = ?, image = COALESCE(?, image), updatedAt = datetime('now') WHERE sku = ?")
                .run(p.sellingPrice || p.costPrice, p.costPrice, p.nameTh, p.nameEn || p.nameTh, p.barcode, p.genericNameTh, imgUrl, p.sku);
              updated++;
            } else {
              insertStmt.run(
                p.sku, p.nameTh, p.nameEn || p.nameTh,
              p.sellingPrice || p.costPrice, p.costPrice, 100, categoryId, "active",
              p.barcode, p.genericNameTh, imgUrl,
              '["RETAIL","CLINIC"]', "HOUSEHOLD_REMEDY",
              p.pricesJson || '{}', p.packsize || '', p.memo1 || ''
            );
            inserted++;
          }
          }
        }
        db.prepare("INSERT INTO forte_sync_history (productCount, status) VALUES (?, 'success')").run(input.products.length);
      });
      tx();
      // Auto-backup after successful save
      try { saveProductsBackup(); } catch {}

      // ── Server-side image download (skip for prices_only) ──
      let imgDownloaded = 0;
      if (input.mode !== "prices_only") {
      const uniqueImages = [...new Set(input.products.filter((p: any) => p.pictname).map((p: any) => p.pictname))];
      const BATCH = 5;
      for (let i = 0; i < uniqueImages.length; i += BATCH) {
        const batch = uniqueImages.slice(i, i + BATCH);
        await Promise.allSettled(batch.map(async (pictname: string) => {
          try {
            const localUrl = await downloadImage(pictname);
            if (localUrl) {
              // Update product image field
              const skuPrefix = pictname.replace(/\.\w+$/, "");
              db.prepare("UPDATE products SET image = ? WHERE sku = ?").run(localUrl, `FT-${skuPrefix}`);
              imgDownloaded++;
            }
          } catch {}
        }));
      }
      }

      return { success: true, inserted, updated, priceSkipped, total: input.products.length, imagesDownloaded: imgDownloaded };
    }),

  // ── Smart Price Sync: fetch from Forte → compare names → update prices only ──
  syncPricesOnly: publicQuery
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(1),
        startPage: z.number().min(1).default(1),
        batchSize: z.number().min(1).max(50).default(10),
        marginSettings: z.object({
          defaultMargin: z.number().min(0).max(100).default(15),
          categoryMargins: z.record(z.string(), z.number()).default({}),
          productMargins: z.record(z.string(), z.number()).default({}),
          roundTo: z.enum(["0.5", "1", "5", "10"]).default("0.5"),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const startTime = Date.now();
      const db = getDb();

      // Login to Forte
      const loginResult = await serverForteLogin(input.username, input.password);
      if (!loginResult.success) {
        return { success: false as const, error: loginResult.error, durationMs: Date.now() - startTime };
      }

      // Fetch first page to get total pages / count
      const firstPage = await serverForteFetchPage(loginResult.sessionId!, 1, 100);
      if (!firstPage.success) {
        return { success: false as const, error: firstPage.error, durationMs: Date.now() - startTime };
      }

      const totalPages = firstPage.pageCount || Math.ceil((firstPage.totalCount || 6314) / 100);
      const endPage = Math.min(input.startPage + input.batchSize - 1, totalPages);
      const allApiProducts: ForteApiProduct[] = input.startPage === 1 ? [...(firstPage.products || [])] : [];

      const actualStart = input.startPage === 1 ? 2 : input.startPage;
      for (let page = actualStart; page <= endPage; page++) {
        await randomDelay(1500, 4000);
        const pageResult = await serverForteFetchPage(loginResult.sessionId!, page, 100);
        if (pageResult.success && pageResult.products) {
          allApiProducts.push(...pageResult.products);
        }
      }

      // Now compare & update prices only
      let updated = 0;
      let skippedNoSku = 0;     // product not found in DB by sku
      let skippedNameMismatch = 0; // sku found but nameTh doesn't match
      const skippedProducts: Array<{ sku: string; forteName: string; dbName: string; prodcode: string }> = [];

      for (const apiProd of allApiProducts) {
        const prodcode = apiProd.prodcode;
        if (!prodcode) {
          skippedNoSku++;
          continue;
        }

        const sku = `FT-${prodcode}`;
        const forteNameTh = (apiProd.prodnam1 || "").trim();
        const costPrice = parseFloat(String(apiProd.defaultprice || 0));

        // Look up by sku in DB
        const existing = db.prepare("SELECT id, nameTh, price, costPrice FROM products WHERE sku = ?").get(sku) as any;
        if (!existing) {
          skippedNoSku++;
          continue;
        }

        // Check name matches
        const dbNameTh = (existing.nameTh || "").trim().toLowerCase();
        const incomingNameTh = forteNameTh.toLowerCase();
        if (dbNameTh !== incomingNameTh) {
          skippedNameMismatch++;
          skippedProducts.push({
            sku,
            forteName: forteNameTh,
            dbName: existing.nameTh || "",
            prodcode,
          });
          continue;
        }

        // Names match → safe to update price and costPrice
        const category = apiProd.categnam || "อื่นๆ";
        const margin = input.marginSettings.productMargins?.[sku] ??
          input.marginSettings.categoryMargins?.[category] ??
          input.marginSettings.defaultMargin ?? 15;
        let sellingPrice = costPrice * (1 + margin / 100);
        switch (input.marginSettings.roundTo) {
          case "0.5": sellingPrice = Math.ceil(sellingPrice * 2) / 2; break;
          case "1": sellingPrice = Math.ceil(sellingPrice); break;
          case "5": sellingPrice = Math.ceil(sellingPrice / 5) * 5; break;
          case "10": sellingPrice = Math.ceil(sellingPrice / 10) * 10; break;
        }

        db.prepare("UPDATE products SET price = ?, costPrice = ?, updatedAt = datetime('now') WHERE sku = ?")
          .run(sellingPrice, costPrice, sku);
        updated++;
      }

      // Log sync history
      db.prepare("INSERT INTO forte_sync_history (productCount, status) VALUES (?, 'success')").run(updated);

      return {
        success: true as const,
        productsFound: allApiProducts.length,
        updated,
        skippedNoSku,
        skippedNameMismatch,
        skippedProducts: skippedProducts.slice(0, 50), // send first 50 warnings
        totalPages,
        fetchedPages: endPage,
        hasMore: endPage < totalPages,
        nextStartPage: endPage + 1,
        durationMs: Date.now() - startTime,
      };
    }),

  // ── Get synced product count ──
  getSyncedCount: publicQuery
    .input(z.object({}).optional())
    .mutation(async () => {
    const db = getDb();
    const forteProducts = db.prepare("SELECT COUNT(*) as count FROM products WHERE sku LIKE 'FT-%'").get() as any;
    const totalProducts = db.prepare("SELECT COUNT(*) as count FROM products").get() as any;
    const lastSync = db.prepare("SELECT syncedAt, productCount FROM forte_sync_history ORDER BY id DESC LIMIT 1").get() as any;
    return {
      totalProducts: totalProducts?.count || 0,
      syncedProducts: forteProducts?.count || 0,
      lastSync: lastSync?.syncedAt || "",
      totalPages: 0,
      currentPage: 0,
      categories: [],
    };
  }),

  // ── Get sync history ──
  getHistory: publicQuery.query(() => {
    const db = getDb();
    return db.prepare("SELECT * FROM forte_sync_history ORDER BY id DESC LIMIT 20").all();
  }),

  // ── Fix missing data in small batches ──
  fixMissingData: publicMutation
    .input(z.object({
      username: z.string(), password: z.string(),
      startPage: z.number().default(1), batchSize: z.number().default(20),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const loginResult = await serverForteLogin(input.username, input.password);
      if (!loginResult.success) return { success: false, error: loginResult.error };

      const sessionId = loginResult.sessionId!;
      const firstPage = await serverForteFetchPage(sessionId, 1, 100);
      if (!firstPage.success) return { success: false, error: firstPage.error };

      const totalPages = firstPage.pageCount || 1;
      const endPage = Math.min(input.startPage + input.batchSize - 1, totalPages);
      let fixed = 0, imagesFixed = 0;

      for (let page = input.startPage; page <= endPage; page++) {
        const pageData = page === 1 ? firstPage : await serverForteFetchPage(sessionId, page, 100);
        if (!pageData.success || !pageData.products) continue;

        for (const apiProd of pageData.products) {
          const sku = `FT-${apiProd.prodcode}`;
          const existing = db.prepare("SELECT id, image, barcode, costPrice FROM products WHERE sku = ?").get(sku) as any;
          if (!existing) continue;

          const nameEn = (apiProd.prodnam2 || apiProd.prodnam1 || "").trim();
          const genericNameTh = (apiProd.genericnam || apiProd.prodnam2 || "").trim();
          const barcode = apiProd.barcode1 || existing.barcode;
          const costPrice = parseFloat(String(apiProd.defaultprice || 0));
          const pictname = apiProd.pictname || "";
          const hasMissing = !(existing as any).image || !(existing as any).barcode || !(existing as any).costPrice;

          if (hasMissing || nameEn || genericNameTh) {
            db.prepare(`UPDATE products SET
              nameEn = CASE WHEN ? != '' THEN ? ELSE nameEn END,
              genericNameTh = CASE WHEN ? != '' THEN ? ELSE genericNameTh END,
              barcode = CASE WHEN ? != '' THEN ? ELSE barcode END,
              costPrice = CASE WHEN ? > 0 THEN ? ELSE costPrice END,
              updatedAt = datetime('now')
              WHERE sku = ?`)
              .run(nameEn, nameEn, genericNameTh, genericNameTh, barcode, barcode, costPrice, costPrice, sku);
            fixed++;
          }

          if (pictname) {
            try {
              const localUrl = await downloadImage(pictname);
              if (localUrl) {
                db.prepare("UPDATE products SET image = ? WHERE sku = ?").run(localUrl, sku);
                imagesFixed++;
              }
            } catch {}
          }
        }
        if (page % 10 === 0) await randomDelay(200, 500);
      }

      const hasMore = endPage < totalPages;
      return {
        success: true, fixed, imagesFixed,
        processedPages: endPage - input.startPage + 1,
        currentPage: endPage, totalPages,
        hasMore, nextPage: hasMore ? endPage + 1 : null,
        progress: `${Math.round((endPage / totalPages) * 100)}%`,
      };
    }),

  // ── Get Forte categories with product counts ──
  getForteCategories: publicMutation
    .input(z.object({ username: z.string(), password: z.string(), sessionId: z.string().optional() }))
    .mutation(async ({ input }) => {
      const u = input.username || FORTE_CREDENTIALS.username;
      const p = input.password || FORTE_CREDENTIALS.password;
      let sessionId = input.sessionId;
      if (!sessionId) {
        const loginResult = await serverForteLogin(u, p);
        if (!loginResult.success) {
          return { success: false, error: loginResult.error || "Login failed", categories: [], totalProducts: 0 };
        }
        sessionId = loginResult.sessionId!;
      }
      
      const page1 = await serverForteFetchPage(sessionId!, 1, 100);
      if (!page1.success) {
        return { success: false, error: page1.error || "Failed to fetch first page", categories: [], totalProducts: 0 };
      }
      const totalPages = page1.pageCount || Math.ceil((page1.totalCount || 6314) / 100);
      const total = page1.totalCount || 0;
      
      // Collect all category names with counts
      const catMap = new Map<string, number>();
      const seenProdCodes = new Set<string>();
      
      const addProducts = (apiProds: any[]) => {
        for (const p of apiProds) {
          const code = p.prodcode || p.prodCode;
          if (code && seenProdCodes.has(String(code))) continue;
          if (code) seenProdCodes.add(String(code));
          const cat = p.categnam || p.catName || "อื่นๆ";
          catMap.set(cat, (catMap.get(cat) || 0) + 1);
        }
      };
      
      addProducts(page1.products || []);
      
      // Fetch a few more pages to get better category coverage
      const extraPages = Math.min(totalPages, 20);
      const batchSize = 5;
      for (let i = 2; i <= extraPages; i += batchSize) {
        const batch = Array.from({ length: Math.min(batchSize, extraPages - i + 1) }, (_, j) => i + j);
        const results = await Promise.allSettled(batch.map(p => serverForteFetchPage(sessionId!, p, 100)));
        for (const r of results) {
          if (r.status === "fulfilled" && r.value && r.value.success) {
            addProducts(r.value.products || []);
          }
        }
        await randomDelay(500, 1500);
      }
      
      const categories = Array.from(catMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      
      return { success: true, categories, totalProducts: total };
    }),

  // ── Sync products by category name ──
  syncByCategory: publicMutation
    .input(z.object({
      username: z.string(), password: z.string(),
      sessionId: z.string(), categoryName: z.string(),
      marginPercent: z.number().default(15),
      maxPages: z.number().default(50),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      let page = 1, synced = 0, totalToSync = 0;
      const categoryName = input.categoryName;

      const firstPage = await serverForteFetchPage(input.sessionId, 1, 100);
      if (!firstPage.success || !firstPage.products?.length) {
        return { success: false, error: "No data from Forte" };
      }
      const allFirst = firstPage.products;
      const totalPages = firstPage.pageCount || Math.ceil((firstPage.totalCount || 6314) / 100);
      totalToSync = allFirst.filter((p) => (p.categnam || p.catName) === categoryName).length;

      // Process all pages, filtering by category
      const matchedProducts: any[] = [];
      for (let p = 1; p <= Math.min(totalPages, input.maxPages); p++) {
        const pageData = p === 1 ? firstPage : await serverForteFetchPage(input.sessionId, p, 100);
        if (!pageData.success || !pageData.products) continue;
        const apiProds = pageData.products;
        for (const apiProd of apiProds) {
          if ((apiProd.categnam || apiProd.catName) === categoryName) {
            matchedProducts.push(apiProd);
          }
        }
        if (p % 10 === 0) await randomDelay(300, 800);
      }

      // Map and save
      const withPrices = matchedProducts.map((apiProd: any) => {
        const cost = parseFloat(apiProd.defaultprice || apiProd.price || 0);
        const selling = Math.ceil(cost * (1 + input.marginPercent / 100));
        const catName = apiProd.categnam || apiProd.catName || "อื่นๆ";
        return {
          sku: `FT-${apiProd.prodcode || apiProd.prodCode}`,
          nameTh: (apiProd.prodnam1 || "").trim(),
          nameEn: (apiProd.prodnam2 || apiProd.prodnam1 || "").trim(),
          genericNameTh: (apiProd.genericnam || apiProd.prodnam2 || "").trim(),
          category: catName,
          costPrice: cost,
          sellingPrice: selling,
          barcode: apiProd.barcode1 || "",
          stockStatus: apiProd.status || "A",
          pictname: apiProd.pictname || "",
        };
      });

      // Save to DB
      const forteCategories = new Map<string, number>();
      for (const p of withPrices) {
        if (p.category) forteCategories.set(p.category, (forteCategories.get(p.category) || 0) + 1);
      }

      // Create categories in DB
      for (const [name] of forteCategories) {
        const existing = db.prepare("SELECT id FROM categories WHERE nameTh = ?").get(name);
        if (!existing) {
          const slug = name.replace(/[^a-zA-Z0-9\u0E00-\u0E7F]/g, "-").toLowerCase();
          db.prepare("INSERT INTO categories (nameTh, nameEn, slug, icon, color, sortOrder, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))")
            .run(name, name, slug, "📦", "blue", 99);
        }
      }

      const catIdMap = new Map<string, number>();
      const allCats = db.prepare("SELECT id, nameTh FROM categories").all() as any[];
      for (const c of allCats) catIdMap.set(c.nameTh, c.id);

      const insertStmt = db.prepare("INSERT OR REPLACE INTO products (sku, nameTh, nameEn, price, stock, categoryId, status, visibleToJson, legalCategory, genericNameTh, image) VALUES (?, ?, ?, ?, 100, ?, 'active', '[\"RETAIL\",\"CLINIC\"]', 'HOUSEHOLD_REMEDY', ?, ?)");
      let inserted = 0, updated = 0;
      for (const p of withPrices) {
        const catId = catIdMap.get(p.category) || 1;
        const existing = db.prepare("SELECT id FROM products WHERE sku = ?").get(p.sku);
        if (existing) {
          db.prepare("UPDATE products SET price = ?, nameTh = ?, genericNameTh = ?, categoryId = ?, updatedAt = datetime('now') WHERE sku = ?")
            .run(p.sellingPrice, p.nameTh, p.genericNameTh, catId, p.sku);
          updated++;
        } else {
          insertStmt.run(p.sku, p.nameTh, p.nameEn, p.sellingPrice, catId, p.genericNameTh, p.pictname ? `/api/images/${p.pictname}` : null);
          inserted++;
        }
        synced++;
      }

      // Try downloading images for this batch
      let imagesDownloaded = 0;
      for (const p of withPrices) {
        if (p.pictname) {
          try {
            const localUrl = await downloadImage(p.pictname);
            if (localUrl && localUrl.startsWith("/api/images/")) {
              db.prepare("UPDATE products SET image = ? WHERE sku = ?").run(localUrl, p.sku);
              imagesDownloaded++;
            }
          } catch {}
        }
      }

      return {
        success: true, synced, inserted, updated, imagesDownloaded,
        categoryName, totalInCategory: matchedProducts.length,
        pictnames: matchedProducts.filter(p => p.pictname).map(p => p.pictname),
      };
    }),

  // ── Download images in batches (20 per call) ──
  downloadImagesBatch: publicMutation
    .input(z.object({
      pictnames: z.array(z.string()),
      offset: z.number().default(0),
      batchSize: z.number().default(20),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const batch = input.pictnames.slice(input.offset, input.offset + input.batchSize);
      let downloaded = 0, skipped = 0;

      for (const pictname of batch) {
        try {
          const localUrl = await downloadImage(pictname);
          if (localUrl) {
            const skuPrefix = pictname.replace(/\.\w+$/, "");
            db.prepare("UPDATE products SET image = ? WHERE sku = ?").run(localUrl, `FT-${skuPrefix}`);
            downloaded++;
          } else {
            skipped++;
          }
        } catch { skipped++; }
      }

      const hasMore = input.offset + input.batchSize < input.pictnames.length;
      return {
        success: true,
        downloaded, skipped,
        offset: input.offset + batch.length,
        total: input.pictnames.length,
        hasMore,
        pictnames: input.pictnames, // return full list for continued calls
        progress: `${input.offset + batch.length}/${input.pictnames.length}`,
      };
    }),

  // ── Full sync all pages (async background on server) ──
  syncAllFull: publicMutation
    .input(z.object({ username: z.string(), password: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = db.prepare("SELECT value FROM store_settings WHERE key = 'sync_running'").get() as any;
      if (existing?.value === "true") return { success: false, error: "Sync already in progress" };

      db.prepare("INSERT OR REPLACE INTO store_settings (key, value, updatedAt) VALUES ('sync_running','true',datetime('now'))").run();
      db.prepare("INSERT OR REPLACE INTO store_settings (key, value, updatedAt) VALUES ('sync_progress','starting...',datetime('now'))").run();

      setImmediate(async () => {
        try {
          await runFullSync(input.username, input.password);
        } catch (e: any) {
          const d = getDb();
          d.prepare("INSERT OR REPLACE INTO store_settings (key, value, updatedAt) VALUES ('sync_running','false',datetime('now'))").run();
          d.prepare("INSERT OR REPLACE INTO store_settings (key, value, updatedAt) VALUES ('sync_progress',?,datetime('now'))").run(`Error: ${e.message}`);
        }
      });

      return { success: true, message: "Sync started in background" };
    }),

  getSyncProgress: publicQuery.query(() => {
    const db = getDb();
    const running = (db.prepare("SELECT value FROM store_settings WHERE key = 'sync_running'").get() as any)?.value;
    const progress = (db.prepare("SELECT value FROM store_settings WHERE key = 'sync_progress'").get() as any)?.value;
    const stats = db.prepare("SELECT COUNT(*) as c FROM products WHERE sku LIKE 'FT-%'").get() as any;
    return {
      running: running === "true",
      progress: progress || "",
      forteProducts: stats?.c || 0,
    };
  }),
});
async function downloadImage(pictname: string): Promise<string | null> {
  if (!pictname) return null;
  const localPath = path.join(process.cwd(), "data/images", pictname);
  try {
    if (fs.existsSync(localPath)) return `/api/images/${pictname}`; // already cached

    const res = await fetch(`${FORTE_BASE}/Images/${pictname}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Referer": `${FORTE_BASE}/pages/product/product_table.aspx`,
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(localPath, buf);
    return `/api/images/${pictname}`;
  } catch { return null; }
}

export async function runFullSync(username: string, password: string) {
  const db = getDb();
  let pc = 0;
  const updateProgress = (msg: string) => {
    try { db.prepare("INSERT OR REPLACE INTO store_settings (key, value, updatedAt) VALUES ('sync_progress',?,datetime('now'))").run(msg); } catch {}
  };

  const login = await serverForteLogin(username, password);
  if (!login.success) throw new Error(login.error || "Login failed");
  const sid = login.sessionId;

  // Fast fetch without delay (with 15s timeout)
  const fetchFast = async (page: number) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${FORTE_BASE}/pages/product/ProductUtil.aspx/GetProduct`, {
        method: "POST",
        headers: getHumanHeaders(sid, `${FORTE_BASE}/pages/product/product_table.aspx`),
        body: JSON.stringify({ data: { recordperpage: 100, page, prodnam: "", vendorname: "", categcod: "", ordercolumn: "ชื่อสินค้า" } }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.status === 401) return { success: false, error: "Session expired", products: [] };
      const data = (await res.json()) as ForteApiResponse;
      if (!data.d || !data.d.ListProductDetail) return { success: false, products: [], totalCount: 0, pageCount: 1 };
      return { success: true, products: data.d.ListProductDetail, totalCount: data.d.recordcount, pageCount: data.d.pagecount };
    } catch (e: any) {
      clearTimeout(timeout);
      return { success: false, error: e.message, products: [] };
    }
  };

  updateProgress("fetching page 1...");
  const first = await fetchFast(1);
  if (!first.success || !first.products?.length) throw new Error("No data from Forte");
  const totalPages = first.pageCount || Math.ceil((first.totalCount || 6314) / 100);
  let allProds = [...first.products];

  // Fetch remaining pages in parallel batches of 5
  const BATCH = 5;
  for (let start = 2; start <= totalPages; start += BATCH) {
    const end = Math.min(start + BATCH - 1, totalPages);
    const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const results = await Promise.allSettled(pages.map(p => fetchFast(p)));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success && r.value.products) {
        allProds.push(...r.value.products);
      }
    }
    if (start % 200 === 2 || start === 2) {
      pc = Math.round((start / totalPages) * 100);
      updateProgress(`fetching: ${start}-${end}/${totalPages} (${pc}%) - ${allProds.length} products`);
    }
  }

  updateProgress(`saving ${allProds.length} products...`);
  const mapped = allProds.map(mapForteProduct);
  let inserted = 0, updated = 0;
  for (const p of mapped) {
    const exist = db.prepare("SELECT id FROM products WHERE sku = ?").get(p.sku);
    if (exist) {
      db.prepare("UPDATE products SET price = ?, nameTh = ?, genericNameTh = ?, barcode = ?, costPrice = ?, updatedAt = datetime('now') WHERE sku = ?")
        .run(p.sellingPrice || p.costPrice, p.nameTh, p.genericNameTh, p.barcode, p.costPrice, p.sku);
      updated++;
    } else {
      const catId = resolveCategoryId(p.category, p.nameTh);
      db.prepare("INSERT INTO products (sku, nameTh, nameEn, price, stock, categoryId, status, barcode, genericNameTh, costPrice, image, createdAt, updatedAt) VALUES (?,?,?,?,100,?,'active',?,?,?,?,datetime('now'),datetime('now'))")
        .run(p.sku, p.nameTh, p.nameEn || p.nameTh, p.sellingPrice || p.costPrice, catId, p.barcode, p.genericNameTh, p.costPrice, p.pictname ? `/api/images/${p.pictname}` : null);
      inserted++;
    }
  }

  updateProgress(`complete: ${mapped.length} products (${inserted} new, ${updated} updated)`);
  db.prepare("INSERT OR REPLACE INTO store_settings (key, value, updatedAt) VALUES ('sync_running','false',datetime('now'))").run();
  console.log(`[runFullSync] Done: ${mapped.length} products`);
}

export async function autoSyncForte(username?: string, password?: string) {
  const u = username || FORTE_CREDENTIALS.username;
  const p = password || FORTE_CREDENTIALS.password;
  const db = getDb();
  const startTime = Date.now();

  try {
    const loginResult = await serverForteLogin(u, p);
    if (!loginResult.success) {
      db.prepare("INSERT INTO forte_sync_history (productCount, status, errorMessage) VALUES (0, 'error', ?)").run(loginResult.error || "Login failed");
      return { success: false, error: loginResult.error, durationMs: Date.now() - startTime };
    }

    const firstPage = await serverForteFetchPage(loginResult.sessionId!, 1, 100);
    if (!firstPage.success) {
      db.prepare("INSERT INTO forte_sync_history (productCount, status, errorMessage) VALUES (0, 'error', ?)").run(firstPage.error || "Fetch failed");
      return { success: false, error: firstPage.error, durationMs: Date.now() - startTime };
    }

    const totalPages = firstPage.pageCount || 1;
    let allProducts: ForteApiProduct[] = [...(firstPage.products || [])];
    let inserted = 0, updated = 0;

    // Fetch remaining pages
    for (let page = 2; page <= totalPages; page++) {
      await randomDelay(2000, 6000);
      const pageResult = await serverForteFetchPage(loginResult.sessionId!, page, 100);
      if (pageResult.success && pageResult.products) {
        allProducts.push(...pageResult.products);
      }
      if (page % 50 === 0) {
        console.log(`Forte sync: ${page}/${totalPages} pages (${allProducts.length} products)`);
      }
    }

    // ── Step 1: Map products + calculate prices ──
    // ใช้ categoryMapping แม็ป Forte category names → 10 หมวดโดยตรง
    const mapped = allProducts.map(mapForteProduct);
    const withPrices = calculatePrices(mapped, 15, {}, {}, "0.5");

    // ── Step 2: Save all products with correct category ──
    // ใช้รหัสหมวดหมู่จาก categoryMapping แทนการสร้าง category ใหม่
    const insertStmt = db.prepare(`INSERT OR REPLACE INTO products
      (sku, nameTh, nameEn, price, stock, categoryId, status, createdAt, updatedAt, visibleToJson, legalCategory, image, genericNameTh)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?, ?)`);

    const tx = db.transaction(() => {
      for (const p of withPrices) {
        // Use categoryMapping to resolve category ID directly
        const catId = resolveCategoryId(p.category, p.nameTh);
        const existing = db.prepare("SELECT id FROM products WHERE sku = ?").get(p.sku) as any;
        if (existing) {
          db.prepare("UPDATE products SET price = ?, nameTh = ?, nameEn = ?, genericNameTh = ?, stock = COALESCE((SELECT stock FROM products WHERE sku = ?), 100), categoryId = ?, updatedAt = datetime('now') WHERE sku = ?")
            .run(p.sellingPrice || p.costPrice, p.nameTh, p.nameEn || p.nameTh, p.genericNameTh || null, p.sku, catId, p.sku);
          updated++;
        } else {
          insertStmt.run(p.sku, p.nameTh, p.nameTh || p.nameTh,
            p.sellingPrice || p.costPrice, 100, catId, "active",
            '["RETAIL","CLINIC"]', "HOUSEHOLD_REMEDY", null, p.genericNameTh || null);
          inserted++;
        }
      }
      db.prepare("INSERT INTO forte_sync_history (productCount, status) VALUES (?, 'success')").run(withPrices.length);
    });
    tx();
    // Auto-backup
    try { saveProductsBackup(); } catch {}

    // ── Step 5: Download ALL images with batching ──
    console.log(`Starting image download for all ${allProducts.length} products...`);
    let imgDownloaded = 0, imgSkipped = 0;
    const fsMod = await import("fs");
    const pathMod = await import("path");
    const IMG_DIR = pathMod.resolve(typeof __dirname !== "undefined" ? __dirname : ".", "../data/images");
    fsMod.mkdirSync(IMG_DIR, { recursive: true });

    // Collect unique pictnames
    const uniqueImages = [...new Set(allProducts.filter(p => p.pictname).map(p => p.pictname))];
    console.log(`Unique Forte images to process: ${uniqueImages.length}`);

    // Download in batches of 5 (to avoid overloading Forte)
    const BATCH_SIZE = 5;
    for (let i = 0; i < uniqueImages.length; i += BATCH_SIZE) {
      const batch = uniqueImages.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (pictname) => {
          const localUrl = await downloadImage(pictname);
          if (localUrl) {
            if (localUrl.startsWith("/api/images/")) {
              // Update product image field in DB
              const skuPrefix = pictname.replace(/\.\w+$/, "");
              db.prepare("UPDATE products SET image = ? WHERE sku = ?").run(localUrl, `FT-${skuPrefix}`);
              imgDownloaded++;
            } else {
              imgSkipped++;
            }
          }
        })
      );
      if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= uniqueImages.length) {
        console.log(`Images: ${Math.min(i + BATCH_SIZE, uniqueImages.length)}/${uniqueImages.length} (${imgDownloaded} downloaded, ${imgSkipped} skipped)`);
      }
      await randomDelay(500, 1500); // Small delay between batches
    }
    console.log(`Image download complete: ${imgDownloaded} downloaded, ${imgSkipped} skipped`);

    console.log(`Forte auto-sync complete: ${withPrices.length} products, ${inserted} new, ${updated} updated, ${imgDownloaded} images, ${Date.now() - startTime}ms`);
    return {
      success: true,
      total: withPrices.length,
      inserted, updated,
      categories: 10, // our 10 fixed categories
      images: imgDownloaded,
      durationMs: Date.now() - startTime
    };
  } catch (e: any) {
    console.error("Forte auto-sync error:", e);
    return { success: false, error: e?.message || "Unknown error", durationMs: Date.now() - startTime };
  }
}
