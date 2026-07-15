/**
 * server-fixed.ts — PharmaCare Local Server (Fixed)
 * ใช้โครงสร้างเหมือน boot.ts แต่ทำงานได้ไม่ hang
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { getDb, initDb, startDbWatchdog } from "./queries/connection";
import { autoSyncForte } from "./routers/forteProxyRouter";
import { eventBus, EventType, createEvent } from "./lib/eventBus";

const app = new Hono<{ Bindings: HttpBindings }>();

// ── Init DB first (synchronous after await) ──
await initDb();
const db = getDb();
console.log(`[${new Date().toISOString()}] DB initialized`);
startDbWatchdog();

// ── Migration: non-destructive ──
try { db.exec("ALTER TABLE payments ADD COLUMN slipUrl TEXT DEFAULT ''"); } catch {}

// ── Health ──
app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

// ── Categories ──
app.get("/api/categories", async (c) => {
  const rows = db.prepare("SELECT * FROM categories WHERE isActive = 1 ORDER BY sortOrder").all() as any[];
  const countStmt = db.prepare("SELECT COUNT(*) as count FROM products WHERE categoryId = ?");
  return c.json(rows.map((row: any) => ({ ...row, productCount: (countStmt.get(row.id) as any)?.count || 0 })));
});

// ── Products ──
app.get("/api/products", async (c) => {
  const { search, categoryId, sort, page: p, limit: l } = c.req.query();
  const page = Math.max(1, parseInt(p || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(l || "50")));
  const offset = (page - 1) * limit;
  
  let sql = "SELECT p.*, c.nameTh as categoryNameTh FROM products p LEFT JOIN categories c ON p.categoryId = c.id WHERE p.status = 'active'";
  const params: any[] = [];
  
  if (categoryId) { sql += " AND p.categoryId = ?"; params.push(parseInt(categoryId)); }
  if (search) { sql += ` AND (p.nameTh LIKE ? OR p.nameEn LIKE ? OR p.genericNameTh LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  
  const total = (db.prepare(sql.replace(/SELECT p\.\*.*?FROM/, "SELECT COUNT(*) as count FROM")).get(...params) as any)?.count || 0;
  const sortMap: Record<string, string> = { price_asc: "p.price ASC", price_desc: "p.price DESC", name: "p.nameTh ASC", newest: "p.id DESC" };
  sql += ` ORDER BY ${sortMap[sort] || "p.id DESC"} LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  return c.json({ items: db.prepare(sql).all(...params), total, totalPages: Math.ceil(total / limit) });
});

// ── Auth (trpc) ──
app.all("/api/trpc/*", async (c) => {
  const response = await fetchRequestHandler({ endpoint: "/api/trpc", req: c.req.raw, router: appRouter, createContext });
  return response;
});

// ── Serve static files ──
import { serveStatic } from "@hono/node-server/serve-static";
app.use("/*", serveStatic({ root: "./dist/public", rewriteRequestPath: (path) => {
  if (path.startsWith("/api/") || path.startsWith("/trpc") || path.startsWith("/health")) return path;
  if (path === "/" || !path.startsWith("/assets")) return "/index.html";
  return path;
}}));

// ── Start ──
const port = parseInt(process.env.PORT || "3000");
console.log(`[Boot] Starting server on 0.0.0.0:${port}`);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
