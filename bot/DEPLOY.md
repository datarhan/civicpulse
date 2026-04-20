# Deploying the bot to Fly.io

The bot runs as a single Fly machine (`shared-cpu-1x`, 256MB) in Madrid
with a 1GB volume for its SQLite database. Expected cost: **~€2/month**
under 2026 Fly pricing, fully within the $5/mo included-usage bucket.

All commands below assume you're already in the repo root.

## Prerequisites

- Fly CLI installed: `curl -fsSL https://fly.io/install.sh | sh`  
  (already done in this workspace)
- Paid Fly account (credit card needed even for included usage)
- `BOT_TOKEN` from @BotFather

## One-off setup (first deploy)

### 1. Authenticate yourself

```bash
flyctl auth login
```

Opens a browser. This is the one step Claude cannot do for you.

### 2. Register the app

```bash
flyctl launch --config bot/fly.toml --name munigraph-ribarroja \
              --copy-config --no-deploy
```

This reads our existing `bot/fly.toml` (with `app = "munigraph-ribarroja"`,
`primary_region = "mad"`, `build.dockerfile = "bot/Dockerfile"`) and
creates the app on Fly's control plane without building anything yet.

If the name is taken you'll see `validation failed: name munigraph-ribarroja
is reserved or already taken`. In that case rename it in `bot/fly.toml`
to `munigraph-riba-<your-initials>` or similar, commit, retry.

### 3. Persistent volume

```bash
flyctl volumes create botdata --size 1 --region mad \
                              --app munigraph-ribarroja
```

1GB is enough for tens of thousands of quejas. Enlarge later via
`flyctl volumes extend`.

### 4. Secrets

Generate the export token once and stash it somewhere safe (you'll need
the same value for the GitHub Action that pulls nightly snapshots):

```bash
EXPORT_TOKEN=$(openssl rand -hex 16)
echo "EXPORT_TOKEN=$EXPORT_TOKEN"   # write this down

flyctl secrets set --app munigraph-ribarroja \
  BOT_TOKEN=8448334642:AAHPfeh5u_XRTYYAOMiKynfjOOt9K8ikYvw \
  EXPORT_TOKEN=$EXPORT_TOKEN \
  PUBLIC_BASE_URL=https://civicpulse-virid.vercel.app \
  WEBHOOK_URL=https://munigraph-ribarroja.fly.dev \
  MODERATOR_NAME="Tu nombre real"
```

Optional secrets you can set now or later:
- `CHANNEL_ID=-100…` — enables `[NUEVA]/[APOYADA]/[REGISTRADA]` broadcasts.
  The bot must be added as an admin of that channel.
- `ADMIN_USER_IDS=123,456` — Telegram user IDs allowed to run `/batch`,
  `/batch_register`, `/escalar`. Find yours via [@userinfobot](https://t.me/userinfobot).

### 5. Deploy

From the **repo root** (important — build context must include `src/`
and `public/data/`):

```bash
flyctl deploy --config bot/fly.toml \
              --dockerfile bot/Dockerfile \
              --remote-only .
```

First build takes ~2-3 min (native better-sqlite3 compile on Linux).
Subsequent deploys are ~30s.

### 6. Verify

```bash
curl https://munigraph-ribarroja.fly.dev/health       # → ok
curl "https://munigraph-ribarroja.fly.dev/export/quejas.json" \
     -H "Authorization: Bearer $EXPORT_TOKEN"          # → JSON payload
```

On Telegram, DM [@munigraph_bot](https://t.me/munigraph_bot) with `/start`
— should respond within 1–2 s.

### 7. Wire the nightly cron

Back on your laptop (in the repo root):

```bash
gh variable set BOT_EXPORT_URL \
  --body https://munigraph-ribarroja.fly.dev/export/quejas.json
gh secret set BOT_EXPORT_TOKEN --body "$EXPORT_TOKEN"
```

The GH Action in `.github/workflows/pull-quejas.yml` then runs daily at
04:00 UTC, curls the endpoint, and commits the fresh `quejas.json` to
the repo (which Vercel redeploys automatically).

## Day-two operations

### Redeploy after code changes

```bash
flyctl deploy --config bot/fly.toml \
              --dockerfile bot/Dockerfile \
              --remote-only .
```

### Logs

```bash
flyctl logs --app munigraph-ribarroja
```

### SSH into the machine

```bash
flyctl ssh console --app munigraph-ribarroja
# Inside: /data/bot.db is the SQLite file. Use sqlite3 if needed.
```

### Rotate the BOT_TOKEN

```bash
# In @BotFather: /revoke → pick @munigraph_bot → copy new token
flyctl secrets set BOT_TOKEN=<new-token> --app munigraph-ribarroja
```

Fly automatically restarts the machine after a secret change.

### Scale up if the queja volume spikes

```bash
flyctl scale memory 512 --app munigraph-ribarroja       # 256 → 512 MB
flyctl scale count 1    --app munigraph-ribarroja       # stay at 1 (SQLite)
```

Do **not** scale count beyond 1 — SQLite doesn't tolerate multiple
writers. If we outgrow a single machine, migrate to Postgres first.

### Tear down

```bash
flyctl apps destroy munigraph-ribarroja
```

This removes the machine AND the volume. SQLite data is lost — export
first via `/export/quejas.json` if you want a backup.
