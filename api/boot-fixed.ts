/**
 * boot.ts — PharmaCare API Server (Fixed)
 *
 * 🔧 FIX: ใช้ await initDb() โดยตรง ไม่ใช่ initDb().then()
 *        ป้องกันการ hang ที่เกิดจากการเรียกใช้ initDb แบบ async
 */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
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

// ── FIX: ใช้ await แทน .then() — ป้องกัน hang ──
await initDb();
const db = getDb();
console.log(`[${new Date().toISOString()}] DB initialized`);
startDbWatchdog();

// ── Migration: non-destructive ──
try { db.exec("ALTER TABLE payments ADD COLUMN slipUrl TEXT DEFAULT ''"); } catch {}
try { db.prepare("CREATE TABLE IF NOT EXISTS promotions (...)").run(); } catch {} // truncated for brevity

// ── Copy all remaining boot.ts code below ──
// (lines 82 onwards from the original boot.ts, unchanged)
