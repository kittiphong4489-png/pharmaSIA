#!/bin/bash
# start.sh — PharmaSIA Local Server (Fixed)
# ใช้ server-fixed.ts ที่ทำงานได้ไม่ hang

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

NODE="/usr/local/bin/node"
TSX="/Users/james/.hermes/hermes-agent/node_modules/.bin/tsx"

export APP_SECRET="${APP_SECRET:-PharmaSIA-local-secret-2026}"
export PORT="${PORT:-3000}"

echo "🚀 PharmaSIA Local Server"
echo "   Node: $($NODE --version)"
echo "   URL:  http://localhost:$PORT"
echo ""

exec "$NODE" "$TSX" "$DIR/api/server-fixed.ts"
