import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();
app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));
const port = parseInt(process.env.PORT || "3000");
console.log(`[Boot] Starting server on 0.0.0.0:${port}`);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
