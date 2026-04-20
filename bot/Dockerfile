# syntax=docker/dockerfile:1.7

# --- stage 1: install node + native deps for better-sqlite3 ------------------
FROM node:20-bookworm-slim AS deps

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY bot/package.json bot/package-lock.json* ./bot/
RUN cd bot && npm ci --omit=dev --no-audit --no-fund

# --- stage 2: runtime --------------------------------------------------------
FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    DB_PATH=/data/bot.db

# Shared monorepo context: the bot imports ../src/scraper/queja-router.ts and
# reads ../public/data/{officials,geo,promises}.json at runtime, so we copy
# those directories too.
COPY --from=deps /app/bot/node_modules ./bot/node_modules
COPY bot            ./bot
COPY src            ./src
COPY public/data    ./public/data

# tsx is the only runtime transformer we need; it came in via devDeps in
# dev, so ship a production copy. Skipping a compile step keeps deploys
# fast and sidesteps tsconfig path quirks in a container.
RUN cd bot && npm i --no-save --no-audit --no-fund tsx

# SQLite lives on a persistent volume (see fly.toml).
VOLUME ["/data"]

EXPOSE 3000

WORKDIR /app/bot
CMD ["node", "--experimental-vm-modules", "node_modules/tsx/dist/cli.mjs", "src/index.ts"]
