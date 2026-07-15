#!/usr/bin/env node
/**
 * server.js — Minimal PharmaSIA Local Server
 * เปิด server โดยตรง โดยใช้ source boot.ts ผ่าน tsx
 * หรือใช้ dist/boot.js ที่ build แล้ว
 */

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const DIR = path.resolve(__dirname);
const NODE = "/usr/local/bin/node";
const TSX = path.expanduser ? 
  "/Users/james/.hermes/hermes-agent/node_modules/.bin/tsx" : 
  path.join(DIR, "node_modules", ".bin", "tsx");

// Check if tsx exists
if (!fs.existsSync(TSX)) {
  console.log("❌ tsx not found. Try: npm run build && node dist/boot.js");
  process.exit(1);
}

console.log(`🚀 PharmaSIA Server (tsx ${TSX})`);
console.log(`   Node: ${execSync(NODE + " --version").toString().trim()}`);

// Ensure DB is not corrupted
const DB = path.join(DIR, "data", "PharmaSIA.db");
if (!fs.existsSync(DB)) {
  console.log("❌ Database not found at", DB);
  process.exit(1);
}

// Fix: rename cat 1 if it's "ยา" to skip boot.ts migration
try {
  const sqlite3 = require("better-sqlite3");
  const db = new sqlite3(DB);
  const cat1 = db.prepare("SELECT nameTh FROM categories WHERE id=1").get();
  if (cat1 && cat1.nameTh === "ยา") {
    db.prepare("UPDATE categories SET nameTh='ยาสามัญประจำบ้าน' WHERE id=1").run();
    console.log("✅ Skipped boot.ts category migration");
  }
  db.close();
} catch(e) {
  console.log("⚠️ Could not check categories:", e.message);
}

// Set env and start
process.env.APP_SECRET = process.env.APP_SECRET || "PharmaSIA-local-secret-2026";
process.env.PORT = process.env.PORT || "3000";

const proc = spawn(NODE, [TSX, path.join(DIR, "api/boot.ts")], {
  cwd: DIR,
  stdio: "inherit",
  env: { ...process.env }
});

proc.on("exit", (code) => {
  console.log(`\n❌ Server exited with code ${code}`);
});
