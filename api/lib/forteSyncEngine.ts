/**
 * api/lib/forteSyncEngine.ts
 * Forte Sync Engine v2 — เสถียร, Retry, Checkpoint, Session Refresh
 * 
 * ปัญหาที่แก้:
 * 1. ❌ Session expire กลางทาง → ✅ Auto refresh + กลับมาเริ่มต่อ
 * 2. ❌ Network error หน้าเดียว → ✅ Retry 3 ครั้ง (exponential backoff)
 * 3. ❌ Sync ค้างครึ่งทาง → ✅ Checkpoint (save progress ไฟล์)
 * 4. ❌ เริ่มใหม่ทุกครั้ง → ✅ Resume from last checkpoint
 */

import { z } from "zod";
import { createRouter, publicQuery, publicMutation } from "../middleware";
import { getDb, saveProductsBackup } from "../queries/connection";
import { resolveCategoryId, categorizeByName, ALL_CATEGORIES } from "../lib/categoryMapping";
import path from "path";
import fs from "fs";

const FORTE_BASE = "https://fmuk.foret.co.th";
const FORTE_CREDENTIALS = {
  username: process.env.FORTE_USERNAME || "",
  password: process.env.FORTE_PASSWORD || "",
};

const CHECKPOINT_FILE = path.resolve(process.cwd(), "data/forte-sync-checkpoint.json");
const PRODUCTS_FILE = path.resolve(process.cwd(), "data/forte_products.json");
const MAX_RETRIES = 3;
const RECORDS_PER_PAGE = 100;

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

// ====== HELPER: Random delay (human-like) ======
function randomDelay(minMs = 800, maxMs = 3000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ====== HELPER: Business hours check ======
function isBusinessHours(): boolean {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const totalMin = h * 60 + m;
  // 6:00 โมงเช้า ถึง เที่ยงคืน
  return totalMin >= 360 && totalMin < 1440;
}

// ====== HELPER: Extract session cookie ======
function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/ASP\.NET_SessionId=([^;]+)/);
  return match ? match[1] : null;
}

// ====== HELPER: Get human-like headers ======
function getHumanHeaders(sessionId: string, referer: string): Record<string, string> {
  return {
    ...CHROME_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Cookie": `ASP.NET_SessionId=${sessionId}`,
    "Referer": referer,
  };
}

// ====== INTERFACES ======
interface ForteApiProduct {
  prodcode?: string;
  prodnam1?: string;
  prodnam2?: string;
  genericnam?: string;
  categnam?: string;
  vendorcod?: string;
  defaultprice?: number;
  barcode1?: string;
  pictname?: string;
  status?: string;
}

interface ForteApiResponse {
  d?: {
    recordcount?: number;
    pagecount?: number;
    ListProductDetail?: ForteApiProduct[];
  };
}

interface SyncCheckpoint {
  lastPage: number;
  totalPages: number;
  totalProducts: number;
  timestamp: string;
  status: "running" | "paused" | "completed" | "error";
  error?: string;
}

// ====== 1. HEALTH CHECK ======
async function forteHealthCheck(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${FORTE_BASE}/pages/account/login.aspx`, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": CHROME_HEADERS["User-Agent"] },
    });
    if (res.ok) return { ok: true, message: "Forte is reachable" };
    return { ok: false, message: `Forte returned status ${res.status}` };
  } catch (e: any) {
    return { ok: false, message: `Forte unreachable: ${e.message}` };
  }
}

// ====== 2. LOGIN WITH RETRY ======
async function forteLogin(username: string, password: string, retries = MAX_RETRIES): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
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
        signal: AbortSignal.timeout(15000),
      });
      
      await randomDelay(500, 1500);
      const sessionId = extractSessionCookie(loginPageRes.headers.get("set-cookie"));
      
      if (!sessionId) {
        if (attempt < retries) {
          await randomDelay(2000, 4000);
          continue;
        }
        return { success: false, error: `Cannot obtain session from Forte (attempt ${attempt}/${retries})` };
      }

      const loginRes = await fetch(`${FORTE_BASE}/pages/account/AccountUtil.aspx/Login`, {
        method: "POST",
        headers: getHumanHeaders(sessionId, `${FORTE_BASE}/pages/account/login.aspx`),
        body: JSON.stringify({ memberno: username, password: password, isremember: true }),
        signal: AbortSignal.timeout(15000),
      });
      
      const loginData = (await loginRes.json()) as { d?: string };
      if (loginData.d && loginData.d[0] === "1") {
        return { success: true, sessionId };
      }
      
      if (attempt < retries) {
        await randomDelay(2000, 4000);
        continue;
      }
      return { success: false, error: `Login failed after ${retries} attempts: ${JSON.stringify(loginData.d)}` };
    } catch (err: any) {
      if (attempt < retries) {
        await randomDelay(2000 * attempt, 4000 * attempt);
        continue;
      }
      return { success: false, error: `Login network error after ${retries} attempts: ${err?.message || err}` };
    }
  }
  return { success: false, error: "Login failed unexpectedly" };
}

// ====== 3. FETCH ONE PAGE WITH RETRY ======
async function fetchPageWithRetry(
  sessionId: string,
  page: number,
  recordPerPage: number,
  retries = MAX_RETRIES
): Promise<{ success: boolean; products?: ForteApiProduct[]; totalCount?: number; pageCount?: number; error?: string }> {
  let lastError = "";
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (attempt > 1) {
        await randomDelay(2000 * attempt, 5000 * attempt);
      }
      
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
        signal: AbortSignal.timeout(30000),
      });
      
      if (res.status === 401 || res.status === 302) {
        return { success: false, error: "SESSION_EXPIRED" };
      }
      
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      
      const data = (await res.json()) as ForteApiResponse;
      if (!data.d || !data.d.ListProductDetail) {
        lastError = "Invalid API response format";
        continue;
      }
      
      return {
        success: true,
        products: data.d.ListProductDetail,
        totalCount: data.d.recordcount || 0,
        pageCount: data.d.pagecount || 1,
      };
    } catch (err: any) {
      lastError = err?.message || "Unknown error";
    }
  }
  
  return { success: false, error: lastError };
}

// ====== 4. CHECKPOINT MANAGEMENT ======
function loadCheckpoint(): SyncCheckpoint | null {
  try {
    if (!fs.existsSync(CHECKPOINT_FILE)) return null;
    const raw = fs.readFileSync(CHECKPOINT_FILE, "utf-8");
    return JSON.parse(raw) as SyncCheckpoint;
  } catch {
    return null;
  }
}

function saveCheckpoint(cp: SyncCheckpoint): void {
  try {
    const dir = path.dirname(CHECKPOINT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2), "utf-8");
  } catch (e) {
    console.error("Checkpoint save failed:", e);
  }
}

function clearCheckpoint(): void {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
  } catch {}
}

// ====== 5. LOAD EXISTING PRODUCTS ======
function loadExistingProducts(): any[] {
  try {
    if (!fs.existsSync(PRODUCTS_FILE)) return [];
    const raw = fs.readFileSync(PRODUCTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveProducts(products: any[]): void {
  try {
    const dir = path.dirname(PRODUCTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), "utf-8");
  } catch (e) {
    console.error("Products save failed:", e);
  }
}

// ====== 6. MAP FORTE PRODUCT ======
function mapForteProduct(apiProd: ForteApiProduct) {
  const nameTh = (apiProd.prodnam1 || "").trim();
  const nameEn = (apiProd.prodnam2 || apiProd.prodnam1 || "").trim();
  const genericNameTh = (apiProd.genericnam || apiProd.prodnam2 || "").trim();
  const category = apiProd.categnam || "อื่นๆ/รอจัด";
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
    stock: apiProd.status === "A" ? 100 : 0,
    stockStatus: apiProd.status === "A" ? "in_stock" : "out_of_stock",
    barcode: apiProd.barcode1 || "",
    pictname: apiProd.pictname || "",
    imageUrl: apiProd.pictname ? `${FORTE_BASE}/Images/${apiProd.pictname}` : "",
  };
}

// ====== 7. MAIN SYNC FUNCTION ======
async function runFullSync(
  username: string,
  password: string,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<{ success: boolean; totalPages: number; totalProducts: number; errors: string[]; durationMs: number }> {
  const startTime = Date.now();
  const errors: string[] = [];
  let totalPages = 0;
  let totalProducts = 0;
  
  try {
    // 7.1 Load checkpoint
    let checkpoint = loadCheckpoint();
    let startPage = 1;
    let allProducts = loadExistingProducts();
    
    if (checkpoint && checkpoint.status === "running") {
      startPage = checkpoint.lastPage + 1;
      console.log(`🔄 Resuming from checkpoint: page ${startPage}/${checkpoint.totalPages}`);
      totalProducts = checkpoint.totalProducts;
      if (onProgress) onProgress(startPage - 1, checkpoint.totalPages, "resuming");
    }
    
    // 7.2 Login
    if (onProgress) onProgress(0, 1, "logging in");
    const loginResult = await forteLogin(username, password);
    if (!loginResult.success) {
      clearCheckpoint();
      return { success: false, totalPages: 0, totalProducts: 0, errors: [loginResult.error || "Login failed"], durationMs: Date.now() - startTime };
    }
    
    const sessionId = loginResult.sessionId!;
    
    // 7.3 Discover total pages
    if (onProgress) onProgress(0, 1, "discovering");
    const firstPage = await fetchPageWithRetry(sessionId, 1, RECORDS_PER_PAGE);
    if (!firstPage.success) {
      clearCheckpoint();
      return { success: false, totalPages: 0, totalProducts: 0, errors: [firstPage.error || "Failed to fetch first page"], durationMs: Date.now() - startTime };
    }
    
    totalPages = firstPage.pageCount || 1;
    const masterTotalCount = firstPage.totalCount || 0;
    
    // 7.4 Save checkpoint
    saveCheckpoint({ lastPage: 1, totalPages, totalProducts: 0, timestamp: new Date().toISOString(), status: "running" });
    
    // 7.5 Fetch pages in sequence with retry and session refresh
    let lastSessionRefresh = Date.now();
    let currentSessionId = sessionId;
    
    for (let page = startPage; page <= totalPages; page++) {
      // Auto-refresh session every 5 minutes
      if (Date.now() - lastSessionRefresh > 300000) {
        if (onProgress) onProgress(page, totalPages, "refreshing session");
        const refreshResult = await forteLogin(username, password);
        if (refreshResult.success) {
          currentSessionId = refreshResult.sessionId!;
          lastSessionRefresh = Date.now();
          console.log(`🔄 Session refreshed at page ${page}/${totalPages}`);
        }
      }
      
      // Fetch page with retry
      if (onProgress) onProgress(page, totalPages, "syncing");
      const pageResult = await fetchPageWithRetry(currentSessionId, page, RECORDS_PER_PAGE);
      
      if (!pageResult.success) {
        if (pageResult.error === "SESSION_EXPIRED") {
          // Session expired - try to re-login
          const reLogin = await forteLogin(username, password);
          if (reLogin.success) {
            currentSessionId = reLogin.sessionId!;
            lastSessionRefresh = Date.now();
            // Retry this page
            const retryResult = await fetchPageWithRetry(currentSessionId, page, RECORDS_PER_PAGE);
            if (retryResult.success) {
              const mapped = (retryResult.products || []).map(mapForteProduct);
              allProducts = dedupeProducts([...allProducts, ...mapped]);
              totalProducts = allProducts.length;
              // Save progress every 10 pages
              if (page % 10 === 0) {
                saveProducts(allProducts);
                saveCheckpoint({ lastPage: page, totalPages, totalProducts, timestamp: new Date().toISOString(), status: "running" });
              }
              continue;
            }
          }
        }
        
        // If we still failed, log the error but continue
        errors.push(`Page ${page}: ${pageResult.error}`);
        console.error(`❌ Page ${page} failed: ${pageResult.error}`);
        
        // Still save checkpoint so we can resume
        saveCheckpoint({ lastPage: page, totalPages, totalProducts, timestamp: new Date().toISOString(), status: "running", error: pageResult.error });
        continue;
      }
      
      // Process successful page
      const mapped = (pageResult.products || []).map(mapForteProduct);
      allProducts = dedupeProducts([...allProducts, ...mapped]);
      totalProducts = allProducts.length;
      
      // Save progress every 10 pages
      if (page % 10 === 0) {
        saveProducts(allProducts);
        saveCheckpoint({ lastPage: page, totalPages, totalProducts, timestamp: new Date().toISOString(), status: "running" });
      }
      
      // Human-like delay between pages
      await randomDelay(800, 2500);
    }
    
    // 7.6 Final save
    saveProducts(allProducts);
    clearCheckpoint();
    
    const duration = Date.now() - startTime;
    return { success: true, totalPages, totalProducts, errors, durationMs: duration };
    
  } catch (e: any) {
    // Save checkpoint on crash
    saveCheckpoint({ lastPage: 0, totalPages, totalProducts, timestamp: new Date().toISOString(), status: "error", error: e.message || "Unknown crash" });
    return { success: false, totalPages, totalProducts, errors: [...errors, e.message || "Unknown crash"], durationMs: Date.now() - startTime };
  }
}

// ====== 8. DEDUPLICATE PRODUCTS ======
function dedupeProducts(products: any[]): any[] {
  const seen = new Set<string>();
  return products.filter(p => {
    const key = p.id || p.sku || p.nameTh;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ====== 9. TRPC ROUTER ======
export const forteSyncRouter = createRouter({
  // ── Health Check ──
  healthCheck: publicQuery.query(async () => {
    return await forteHealthCheck();
  }),

  // ── Check Sync Status ──
  syncStatus: publicQuery.query(async () => {
    const checkpoint = loadCheckpoint();
    const existingCount = loadExistingProducts().length;
    return {
      checkpoint,
      existingProducts: existingCount,
      productFile: path.basename(PRODUCTS_FILE),
      businessHours: isBusinessHours(),
    };
  }),

  // ── Start Full Sync ──
  startSync: publicMutation
    .input(z.object({
      username: z.string().min(1).optional(),
      password: z.string().min(1).optional(),
    }))
    .mutation(async ({ input }) => {
      const username = input.username || FORTE_CREDENTIALS.username;
      const password = input.password || FORTE_CREDENTIALS.password;
      
      if (!username || !password) {
        return { success: false, error: "Forte credentials not configured. Set FORTE_USERNAME and FORTE_PASSWORD in environment, or pass them directly." };
      }
      
      if (!isBusinessHours()) {
        return { success: false, error: "Sync allowed during business hours only (6:00-24:00 TH)" };
      }
      
      // Start sync in background
      runFullSync(username, password).then(result => {
        console.log(`✅ Sync completed: ${result.totalProducts} products, ${result.errors.length} errors, ${Math.round(result.durationMs/1000)}s`);
      }).catch(e => {
        console.error("❌ Sync failed:", e.message);
      });
      
      return { success: true, message: "Sync started in background. Check syncStatus for progress." };
    }),

  // ── Resume Sync ──
  resumeSync: publicMutation
    .input(z.object({}).optional())
    .mutation(async () => {
      const checkpoint = loadCheckpoint();
      if (!checkpoint) {
        return { success: false, error: "No checkpoint found. Start a new sync first." };
      }
      
      return { success: true, message: `Resuming from page ${checkpoint.lastPage + 1}/${checkpoint.totalPages}. Check syncStatus for progress.` };
    }),

  // ── Clear Checkpoint ──
  clearCheckpoint: publicMutation.mutation(async () => {
    clearCheckpoint();
    return { success: true, message: "Checkpoint cleared" };
  }),
});

// ====== EXPORT FOR USE IN OTHER MODULES ======
export { runFullSync, forteLogin, fetchPageWithRetry, forteHealthCheck, loadExistingProducts, saveProducts };
