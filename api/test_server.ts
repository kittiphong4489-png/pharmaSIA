import { serve } from "@hono/node-server";
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

console.log("[Test] Calling initDb (with full imports)...");
await initDb();
console.log("[Test] initDb completed");

app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));
const port = parseInt(process.env.PORT || "3000");
console.log(`[Boot] Starting server on 0.0.0.0:${port}`);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
