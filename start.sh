#!/bin/bash
cd /app
echo "🚀 Starting PharmaCare Server..."
echo "DB: $(ls -la data/pharmacare.db 2>/dev/null | awk '{print $5}')"
node boot.js
