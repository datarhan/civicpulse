# MuniGraph bot — Quejas OS (Telegram)

Telegram-native capture + social layer for Riba-roja de Túria's citizen
complaints. Full pipeline per [`docs/QUEJAS_DESIGN.md`](../docs/QUEJAS_DESIGN.md).

Live as **[@munigraph_bot](https://t.me/munigraph_bot)** (bot id
`8448334642`). Dashboard at
[civicpulse.es/quejas](https://civicpulse.es/quejas).

## Commands

Citizen-facing:

| Command                    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/start`, `/help`          | Onboarding + the 6-step pipeline explanation (the review before publication is step 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/queja`                   | Guided flow: categoría (17 opts) → título → detalle → ubicación → foto. Confirms with classified concejalía, named concejal, legal plazo + base, and a `Q-XXXX` id. The queja is **not public** until an admin publishes it (below); its author gets a DM with each decision. Title and detail are stored **without** the personal data the bot recognizes — Spanish phones, emails, DNI/NIE and IBAN (checksums verified), number plates — replaced by «[dato personal retirado]» (`src/services/pii.ts`); only the counts are kept, and the receipt says what was removed |
| `/estado Q-XXXX`           | Full state + apoyos + timeline + legal basis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/apoyar Q-XXXX`           | Co-sign a queja (idempotent, 1 per user). At 10 apoyos it enters the next weekly batch and the admins are told by DM (`avisos-hitos.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/mis`                     | The user's own quejas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/barrio` `/barrio <slug>` | Aggregate per neighborhood or list a specific one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/ranking`                 | Top barrios by resolution rate (60d window)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `/digest [N]`              | Summary of last N days (default 7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Admin-only (gated by `ADMIN_USER_IDS` env, comma-separated Telegram IDs):

| Command                                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/batch`                                         | Preview the top 10 verified quejas ready to file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/batch_link`                                    | URL of the auto-generated `current.md` / `current.html` solicitud                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/batch_register <asiento> <CSV> <fecha> <hora>` | After signing at `sede.ribarroja.es`, records the entry nº, the CSV (spaces and all) and the receipt's «Fecha de Registro» (`28/09/2026 0:00:01`, Madrid time) on every queja in the batch; the legal plazo runs from that date. Tells the other admins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/escalar Q-XXXX`                                | Transitions a silencio-negativo queja to `escalada_sindic`, tells the other admins, returns the Síndic de Greuges template URL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/revisar Q-XXXX`                                | Sends you one more copy of the review card of any live queja — also one published before the review existed, so it can be withdrawn. Every copy stays tracked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/pendientes`                                    | The review queue, oldest first: ids and how long each has waited, never the text (that message is not stripped if the queja is withdrawn), split to fit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Review cards (buttons)                           | Every new queja reaches each admin as a card with **Publicar** / **Descartar**; a published one shows **Retirar**, and a discarded or withdrawn one **Publicar** again. The card says whether the queja carries a photo (it does not show it) and which área and cargo the router attributed it to. A decision is compare-and-set (`decidirModeracion`), edits every copy of the card, tells the author the outcome (the notice row keeps no identity) and asks the site to republish; if that request does not go out, the admin who decided is told. When a queja is withdrawn (`/olvidar`, `/borrar_mis_datos`) or destroyed by the retention purge, the same transaction moves its card copies to `tarjetas_por_vaciar` and erases the rest of its trail in `avisos`; the copies lose their text at once, or at an hourly retry if Telegram fails, except in a chat Telegram no longer lets the bot edit. Everything that touches a queja's cards runs one at a time (an in-memory lock: one process). An hourly pass (`pasadaHoraria` in `src/services/avisos-admin.ts`) resends the cards no current admin holds, drains the strip queue, and sends the author notices still missing. The public channel announces nothing about a queja, neither on arrival nor on publication: an announcement could not be withdrawn with the queja |

Outside a private chat the bot only answers the public commands (`COMANDOS_PUBLICOS`
in `src/services/solo-en-privado.ts`, which only show what the site already publishes).
Every other command, admin ones included, gets a one-line «escríbeme en privado», and
anything that is not a command is ignored. The guard runs before every handler
(`src/commands/registrar.ts`), so a new command is private until someone adds it to the
list. Group joining is also disabled in BotFather.

## Architecture

```
Telegram  ──────→  grammy bot  ──────→  SQLite (WAL, FK)
                      │                     │
                      │                     └─→ daily launchd export →
                      │                        public/data/quejas.json → Vercel
                      │
                      ├─→ queja-router.ts   (shared with front-end CLI)
                      ├─→ avisos-hitos.ts   (milestones → admin DMs)
                      ├─→ batch.ts          (weekly solicitud generator)
                      ├─→ sindic.ts         (Síndic template generator)
                      ├─→ cron.ts           (hourly silencio-negativo worker)
                      ├─→ moderacion.ts     (automatic review, every minute; Gemini)
                      └─→ freeze.ts         (reads promises.json frozenUntil)

HTTP (webhook mode only):
  POST <path of WEBHOOK_URL>  (Telegram only: X-Telegram-Bot-Api-Secret-Token, else 401)
  GET /health                (degraded when the review queue is stuck: no admins,
                              a queja whose card no current admin holds, a wait > 48 h,
                              a card waiting > 24 h to lose a withdrawn queja's text,
                              or an automatic review failing 3 times or for 2 h)
  GET /export/quejas.json    (bearer-auth via EXPORT_TOKEN)
  GET /batch/current.{md,html}
  GET /sindic/<q-id>.{md,html}
```

Runs in **long-polling** by default (`BOT_TOKEN` only) — no ingress
required. Set `WEBHOOK_URL` to flip to webhook + HTTP server mode.

**The review before publishing.** A new queja is born `pendiente` and reaches
every admin as a Telegram card. With `GEMINI_API_KEY` and `GEMINI_NIVEL=pago`
(the operator's statement that the key's project is on Google's paid terms,
which do not use what is sent to improve their products), a pass every minute
(`src/services/moderacion.ts`) sends each pending queja's scrubbed title and
detail to Gemini (`GEMINI_MODERACION_MODEL`, default `gemini-2.5-flash`). The
model may only name exact fragments that identify a private person — they are
cut from the stored text — and give reasons, from a closed list
(`src/services/moderacion-criterios.ts`), why a person must see it. An answer
that does not hold up, or a failed call, is retried (5, 15, 60, 180, 360 min);
after 3 failures or 2 h each admin is told once. A queja with no reasons is
published without a person only when `decideAutomation` allows the class
`queja.publicacion-automatica` with a measurement in
`../.automation-measurements.json`; until then, and always during a LOREG
freeze, a person decides every one. Every review is logged in
`revisiones_automaticas` (migration 3), never the removed text.

In webhook mode Telegram resends an update that took over ten seconds, while the first
delivery is still running. The first middleware (`src/services/una-vez-y-en-orden.ts`)
handles each `update_id` once, the updates of one chat one at a time — the session and
the conversations keep per-chat state in memory and cannot take two at once — and logs
a failing update instead of rejecting it. It lives in memory: one process.

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

- Citizens pseudonymised — a queja points at `ciudadanos` (channel +
  Telegram id), which never crosses into public JSON; the Telegram
  username is not stored.
- Locations truncated to neighborhood centroid before export; exact
  lat/lng never leave the DB.
- Only the elected concejal (acting in their public capacity) is named
  on public output. Technical staff are never named.
- Right-of-reply via `.github/ISSUE_TEMPLATE/queja-response.yml` +
  `npm run queja-reply` CLI.
- LOREG electoral freeze pauses the silencio-cron — `freeze.ts` reads
  the same `frozenUntil` field as the front-end's `/promesas` page. Since
  2026-09-29 the bot publishes to no channel: each queja's milestones (10
  apoyos, registered, silence, escalated) go to the admins by DM, without
  the queja's text (`src/services/avisos-hitos.ts`).

## Files outside this package

Shared with the monorepo root — the bot imports them via relative path
and needs them at runtime:

- `../src/scraper/queja-router.ts` — classifier + legal routing
- `../src/scraper/situar-barrio.ts` — where a location falls: a barrio, the
  town but none, or outside the municipality
- `../public/data/officials.json` — corporación municipal (for the
  concejalía matcher)
- `../public/data/geo.json` — the municipal boundary and OSM neighbourhood
  centroids (for `situar`)
- `../public/data/promises.json` — reads `frozenUntil` for LOREG freeze
- `../src/scraper/automation-policy.ts` + `../.automation-measurements.json` —
  whether a queja the automatic review did not hold may publish without a person
