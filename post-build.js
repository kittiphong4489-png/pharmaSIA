/**
 * Post-build: Copy externalized native modules to dist/node_modules/
 * so boot.js can find them at runtime in the deploy environment.
 */
import { cpSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distNodeModules = join(root, "dist", "node_modules");

mkdirSync(distNodeModules, { recursive: true });

const packagesToCopy = [
  "@libsql/client",
  "@libsql/core",
  "@libsql/hrana-client",
  "@libsql/isomorphic-ws",
  "@libsql/linux-x64-gnu",
  "@libsql/linux-x64-musl",
  "@neon-rs/load",
  "libsql",
  "sqlite-error",
  "detect-libc",
  "drizzle-orm",
  "mysql2",
  "denque",
  "generate-function",
  "iconv-lite",
  "long",
  "lru-cache",
  "named-placeholders",
  "seq-queue",
  "sqlstring",
];

let copied = 0;
let skipped = 0;

for (const pkg of packagesToCopy) {
  const src = join(root, "node_modules", pkg);
  const dest = join(distNodeModules, pkg);

  if (!existsSync(src)) {
    skipped++;
    continue;
  }

  try {
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true, force: true });
    copied++;
  } catch (err) {
    console.error(`  Failed to copy ${pkg}: ${err.message}`);
    skipped++;
  }
}

console.log(`Post-build: ${copied} copied, ${skipped} skipped`);
