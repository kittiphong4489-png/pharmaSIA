#!/bin/bash
# ============================================================
# scripts/copy-deps.sh — Copy only production deps to dist/
# ============================================================
set -e

echo "[copy-deps] Copying production dependencies..."

# Copy node_modules to dist/
if [ ! -d "dist/node_modules" ]; then
  cp -r node_modules dist/node_modules
fi

# Copy package.json to dist/ for npm prune
cp package.json dist/package.json

# Prune devDependencies in dist/
cd dist
npm prune --production 2>/dev/null || true

# Remove unnecessary files to reduce size
rm -rf node_modules/.cache 2>/dev/null || true
rm -rf node_modules/.bin 2>/dev/null || true
rm -rf node_modules/.package-lock.json 2>/dev/null || true

# Remove native module build artifacts that may cause issues
find node_modules -name "*.node" -path "*/prebuilds/*" -exec rm -f {} \; 2>/dev/null || true
find node_modules -name "build" -type d -path "*/better-sqlite3/*" -exec rm -rf {} \; 2>/dev/null || true

# Clean up package.json from dist
rm -f package.json package-lock.json

echo "[copy-deps] Done. Dist size:"
du -sh . 2>/dev/null || echo "Unknown"
