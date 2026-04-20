# CivicPulse bot — Quejas OS (Telegram)

Telegram-native capture + social layer for Riba-roja de Túria's citizen
complaints. This is **Sprint A** of the Telegram-first path defined in
[`docs/QUEJAS_DESIGN.md`](../docs/QUEJAS_DESIGN.md).

## What's shipped (v0.1)

- `/queja` — guided flow: categoría → título → detalle → ubicación → foto.
  On submit, the queja is classified with `src/scraper/queja-router.ts`,
  the responsible concejal is named in the confirmation, legal deadlines
  are cited, and the row is persisted in SQLite.
- `/estado Q-XXXX` — full state + apoyos + timeline + legal basis.
- `/apoyar Q-XXXX` — co-sign (1 per user, idempotent). At 10 apoyos the
  queja is tagged `apoyada_verificada` and enters the weekly batch queue.
- `/mis` — quejas filed by the current user.
- `/start`, `/help` — onboarding.

Not yet wired (future sprints): public channel broadcasts, weekly batch
registrar, Síndic de Greuges escalation, `/barrio`, `/ranking`, `/digest`,
front-end `quejas.json` hook.

## Architecture

```
Telegram    →  grammy bot (Node 20)  →  SQLite (better-sqlite3)
                   │
                   └──→ queja-router.ts (src/scraper/)
                           classification + legal routing

Nightly:   SQLite  →  tsx src/services/export.ts  →  public/data/quejas.json
                                                     (read by /quejas page)
```

Data lives in `data/bot.db` (gitignored). The front-end never reads SQLite
directly — the nightly export produces a static JSON in the main
`public/data/` tree.

## Development

```bash
# First time
cp .env.example .env
# → paste BOT_TOKEN from @BotFather into .env

npm install
npm test              # DB tests against :memory: SQLite
npm run dev           # watch mode, long-polling
```

Then DM the bot on Telegram.

## Deploy (Fly.io example)

```bash
fly launch --name civicpulse-bot-ribarroja
fly secrets set BOT_TOKEN=... WEBHOOK_URL=https://civicpulse-bot-ribarroja.fly.dev
fly volumes create botdata --size 1 --region mad
fly deploy
```

A `fly.toml` + `Dockerfile` ship when sprint A is promoted to prod.

## Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `BOT_TOKEN` | yes | — | from @BotFather |
| `CHANNEL_ID` | no | — | public channel for broadcasts (sprint B) |
| `DB_PATH` | no | `./data/bot.db` | SQLite file path |
| `WEBHOOK_URL` | no | long-polling | full https URL → webhook mode |
| `PORT` | no | `3000` | HTTP port when WEBHOOK_URL is set |
| `OFFICIALS_JSON` | no | `../public/data/officials.json` | concejalía data |
| `QUEJAS_JSON_OUT` | no | `../public/data/quejas.json` | nightly export target |

## Tests

```bash
npm test
```

DB tests use `:memory:` SQLite — fast, no filesystem. Coverage target per
the project TDD contract: 80%+ on `src/db/` + `src/commands/` business
logic. Command handlers are tested against the grammy `RawApi` mock.

## Legal contract

Inherits the editorial guardrails from `docs/QUEJAS_DESIGN.md`:

- Citizens are pseudonymised — the public JSON never contains
  `telegram_user_id` or `telegram_username`.
- Locations are truncated to neighborhood centroid before export — exact
  lat/lng never leave the DB.
- Only the elected concejal (acting in their public capacity) is named
  on public output. Technical staff are never named.
- Right-of-reply will land in sprint E as
  `.github/ISSUE_TEMPLATE/queja-response.yml` with the curator CLI.
- LOREG electoral freeze is honoured (reuses `isPromiseFrozen` logic in
  sprint D — pauses broadcasts to the public channel).

## Related files in the monorepo

- `src/scraper/queja-router.ts` — pure classifier + legal router.
- `scripts/route-queja.ts` — CLI to test the router standalone.
- `public/data/officials.json` — real corporación municipal.
- `public/data/geo.json` — OSM boundary + neighborhoods for location
  matching.
- `docs/QUEJAS_DESIGN.md` — the 7-stage design + Sprint plan.
