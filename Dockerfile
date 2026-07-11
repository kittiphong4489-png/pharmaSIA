FROM node:22-slim

RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install && npm rebuild better-sqlite3

COPY data/ ./data/
COPY . .

RUN NODE_OPTIONS="--max-old-space-size=1024" npm run build

# Copy bundled data after build
RUN mkdir -p /app/dist/data
COPY data/pharmacare.db /app/dist/data/pharmacare.db
COPY start.sh /app/dist/start.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "require('http').get('http://localhost:3000/', r => {process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["bash", "dist/start.sh"]
