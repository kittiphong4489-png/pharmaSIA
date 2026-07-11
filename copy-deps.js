import { cpSync, mkdirSync, existsSync, readFileSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distNm = join(root, "dist", "node_modules");

// Clean
if (existsSync(distNm)) {
  rmSync(distNm, { recursive: true, force: true });
}

// Read externals from boot.js
const bootJs = readFileSync(join(root, "dist", "boot.js"), "utf8");
const importMatches = [...bootJs.matchAll(/from\s+['"]([^'"]+)['"]/g)];
const externals = new Set();
for (const m of importMatches) {
  const mod = m[1];
  if (!mod.startsWith(".") && !mod.startsWith("node:") && !mod.startsWith("file:") && !mod.startsWith("http")) {
    const pkgName = mod.startsWith("@") ? mod.split("/").slice(0, 2).join("/") : mod.split("/")[0];
    externals.add(pkgName);
  }
}

// Also extract require() calls
const requireMatches = [...bootJs.matchAll(/require\(['"]([^'"]+)['"]\)/g)];
for (const m of requireMatches) {
  const mod = m[1];
  if (!mod.startsWith(".") && !mod.startsWith("node:")) {
    const pkgName = mod.startsWith("@") ? mod.split("/").slice(0, 2).join("/") : mod.split("/")[0];
    externals.add(pkgName);
  }
}

console.log("Externals:", [...externals].sort().join(", "));

let copied = 0;
let skipped = 0;

for (const pkg of externals) {
  const src = join(root, "node_modules", pkg);
  const dest = join(distNm, pkg);
  if (!existsSync(src)) { skipped++; continue; }
  if (existsSync(dest)) continue;
  try {
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true, force: true, dereference: true });
    copied++;
  } catch (e) {
    console.error("Fail:", pkg, e.message);
    skipped++;
  }
}

// Recursively copy dependencies of each copied package
function getPackageJson(pkgPath) {
  try {
    return JSON.parse(readFileSync(join(pkgPath, "package.json"), "utf8"));
  } catch { return null; }
}

function collectAllDeps(pkgName, visited = new Set()) {
  if (visited.has(pkgName)) return;
  visited.add(pkgName);

  const pkgPath = join(distNm, pkgName);
  if (!existsSync(pkgPath)) {
    // Try to copy from root node_modules
    const src = join(root, "node_modules", pkgName);
    if (existsSync(src)) {
      try {
        mkdirSync(dirname(pkgPath), { recursive: true });
        cpSync(src, pkgPath, { recursive: true, force: true, dereference: true });
        copied++;
      } catch { return; }
    } else {
      return;
    }
  }

  const pkgJson = getPackageJson(pkgPath);
  if (!pkgJson) return;

  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.peerDependencies,
  };

  for (const dep of Object.keys(allDeps || {})) {
    collectAllDeps(dep, visited);
  }
}

// Collect all transitive deps
const visited = new Set();
for (const pkg of externals) {
  collectAllDeps(pkg, visited);
}

console.log(`Post-build: ${copied} copied, ${skipped} skipped, ${visited.size} total packages`);
