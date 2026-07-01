# MuniGraph bot — Quejas OS (Telegram)

Telegram-native capture + social layer for Riba-roja de Túria's citizen
complaints. Full pipeline per [`docs/QUEJAS_DESIGN.md`](../docs/QUEJAS_DESIGN.md).

Live as **[@munigraph_bot](https://t.me/munigraph_bot)** (bot id
`8448334642`). Dashboard at
[civicpulse.es/quejas](https://civicpulse.es/quejas).

## Commands

Citizen-facing:

| Command | What it does |
|---|---|
| `/start`, `/help` | Onboarding + the 5-step pipeline explanation |
| `/queja` | Guided flow: categoría (17 opts) → título → detalle → ubicación → foto. Confirms with classified concejalía, named concejal, legal plazo + base, and a `Q-XXXX` id |
| `/estado Q-XXXX` | Full state + apoyos + timeline + legal basis |
| `/apoyar Q-XXXX` | Co-sign a queja (idempotent, 1 per user). At 10 apoyos it enters the next weekly batch and `[APOYADA]` broadcasts to the public channel |
| `/mis` | The user's own quejas |
| `/barrio` `/barrio <slug>` | Aggregate per neighborhood or list a specific one |
| `/ranking` | Top barrios by resolution rate (60d window) |
| `/digest [N]` | Summary of last N days (default 7) |

Admin-only (gated by `ADMIN_USER_IDS` env, comma-separated Telegram IDs):

| Command | What it does |
|---|---|
| `/batch` | Preview the top 10 verified quejas ready to file |
| `/batch_link` | URL of the auto-generated `current.md` / `current.html` solicitud |
| `/batch_register <asiento> <CSV>` | After signing at `sede.ribarroja.es`, records the entry nº + CSV on every queja in the batch. Broadcasts `[REGISTRADA]` per queja |
| `/escalar Q-XXXX` | Transitions a silencio-negativo queja to `escalada_sindic`, broadcasts `[ESCALADA]`, returns the Síndic de Greuges template URL |

## Architecture

```
Telegram  ──────→  grammy bot  ──────→  SQLite (WAL, FK)
                      │                     │
                      │                     └─→ daily launchd export →
                      │                        public/data/quejas.json → Vercel
                      │
                      ├─→ queja-router.ts   (shared with front-end CLI)
                      ├─→ channel.ts        (LOREG-gated broadcasts)
                      ├─→ batch.ts          (weekly solicitud generator)
                      ├─→ sindic.ts         (Síndic template generator)
                      ├─→ cron.ts           (hourly silencio-negativo worker)
                      └─→ freeze.ts         (reads promises.json frozenUntil)

HTTP (webhook mode only):
  GET /health
  GET /export/quejas.json    (bearer-auth via EXPORT_TOKEN)
  GET /batch/current.{md,html}
  GET /sindic/<q-id>.{md,html}
```

Runs in **long-polling** by default (`BOT_TOKEN` only) — no ingress
required. Set `WEBHOOK_URL` to flip to webhook + HTTP server mode.

## Running locally (macOS, no cloud)

See [`LOCAL.md`](LOCAL.md) for the full walk-through. TL;DR — two paths:

**Docker (recommended for local testing):**
```bash
cp .env.example .env    # fill in BOT_TOKEN
docker compose up -d --build       # bot as a container, auto-restart
docker compose logs -f             # tail output
```

**launchd user agent (alternative, native macOS):**
```bash
bash scripts/launchd-install.sh              # bot as user agent
bash scripts/launchd-install-export.sh       # daily export → git push at 04:00 local
```

Use launchd only when the repo lives outside `~/Documents/` — macOS
TCC blocks launchd-spawned shells from invoking scripts inside
`~/Documents/`. See `LOCAL.md § Troubleshooting`.

Export the SQLite to `public/data/quejas.json` (host-side, container
or not):
```bash
npm run export
```

Status:
```bash
docker compose ps                          # docker path
launchctl list | grep munigraph            # launchd path
tail -f data/logs/bot.err.log              # both paths share this log
```

## Deploying to Fly.io

See [`DEPLOY.md`](DEPLOY.md). Preview:

```bash
flyctl auth login
flyctl launch --config bot/fly.toml --name munigraph-ribarroja \
              --copy-config --no-deploy
flyctl volumes create botdata --size 1 --region mad --app munigraph-ribarroja
flyctl secrets set --app munigraph-ribarroja BOT_TOKEN=... EXPORT_TOKEN=... …
flyctl deploy --config bot/fly.toml --dockerfile bot/Dockerfile --remote-only .
```

## Development

```bash
npm install
npm test            # 37 tests (db + batch + escalation), :memory: SQLite
npm run dev         # tsx watch, long-polling (needs BOT_TOKEN)
npm run export      # dump SQLite → ../public/data/quejas.json
```

TypeScript: `npx tsc --noEmit` must be clean before shipping.

## Legal contract

Inherits the editorial guardrails from `../docs/QUEJAS_DESIGN.md`:

- Citizens pseudonymised — `telegram_user_id` + `telegram_username`
  never cross into public JSON.
- Locations truncated to neighborhood centroid before export; exact
  lat/lng never leave the DB.
- Only the elected concejal (acting in their public capacity) is named
  on public output. Technical staff are never named.
- Right-of-reply via `.github/ISSUE_TEMPLATE/queja-response.yml` +
  `npm run queja-reply` CLI.
- LOREG electoral freeze suspends all channel broadcasts and pauses
  the silencio-cron — `freeze.ts` reads the same `frozenUntil` field
  as the front-end's `/promesas` page.

## Files outside this package

Shared with the monorepo root — the bot imports them via relative path
and needs them at runtime:

- `../src/scraper/queja-router.ts` — classifier + legal routing
- `../public/data/officials.json` — corporación municipal (for the
  concejalía matcher)
- `../public/data/geo.json` — OSM neighborhoods (for `matchNeighborhood`
  via haversine)
- `../public/data/promises.json` — reads `frozenUntil` for LOREG freeze
