# syntax=docker/dockerfile:1.7
# Build context: MONOREPO ROOT (not bot/). Run fly deploy with:
#   flyctl deploy --config bot/fly.toml --dockerfile bot/Dockerfile --remote-only .

# --- stage 1: install deps (native build tools for better-sqlite3) ----------
FROM node:20-bookworm-slim AS deps

WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY bot/package.json bot/package-lock.json ./bot/
RUN cd bot && npm ci --omit=dev --no-audit --no-fund

# --- stage 2: runtime --------------------------------------------------------
FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    DB_PATH=/data/bot.db

# Shared monorepo context: the bot imports ../src/scraper/queja-router.ts
# and reads ../public/data/{officials,geo,promises}.json at runtime.
COPY --from=deps /app/bot/node_modules ./bot/node_modules
COPY bot         ./bot
COPY src         ./src
COPY public/data ./public/data

# SQLite lives on a persistent volume (see fly.toml).
VOLUME ["/data"]
EXPOSE 3000

WORKDIR /app/bot
CMD ["node_modules/.bin/tsx", "src/index.ts"]
