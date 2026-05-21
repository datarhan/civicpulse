# Running the bot locally on macOS (no cloud services)

If you want to avoid Fly.io / Railway / etc., the bot runs fine on
your Mac in long-polling mode. There are two paths:

- **Docker (recommended for local testing).** A single
  `docker compose up -d` from `bot/`. Auto-restarts on crash. Survives
  reboot. Mirrors the same image you'd push to a VPS. Sidesteps the
  macOS TCC trap that blocks launchd from invoking scripts under
  `~/Documents/`.
- **launchd user agent.** Native macOS, no Docker Desktop overhead.
  Documented further down as the "alternative" path. Works fine when
  the repo lives outside `~/Documents/`; broken when inside it (the
  current location).

Either way:

- **No public ingress** — the bot connects outbound to Telegram. Zero
  exposure, zero Tailscale/ngrok/port-forward setup.
- **Persistent SQLite** — `bot/data/bot.db` survives restarts.

**Caveat: the Mac must be awake.** Sleep pauses the bot. Plug the laptop
in and keep it open, or use a dedicated always-on machine when you're
ready.

## Docker (recommended)

From `bot/`:

```bash
docker compose up -d --build      # first run / after Dockerfile change
docker compose logs -f            # tail bot output (Ctrl+C to detach)
docker compose down               # stop (SQLite + WAL persist in ./data)
docker compose restart            # pick up a new bot/.env value
```

The container:
- runs in long-polling mode (no `WEBHOOK_URL` in `.env` ⇒ no inbound),
- bind-mounts `bot/data/` so SQLite + logs survive `down`,
- restarts on crash via `restart: unless-stopped`,
- auto-starts when Docker Desktop boots (the typical Mac flow on login).

Export the SQLite to `public/data/quejas.json` (refreshes the SPA) —
run on the HOST, not in the container. SQLite WAL is happy with the
shared bind mount:

```bash
cd bot && npm run export
```

When you want a daily auto-export, add a `cron` line (or a host-side
launchd agent) that wraps that command. Container itself stays
focused on Telegram ingestion only.

When going to production, the same `bot/Dockerfile` ships to Fly.io
or your VPS — see `bot/DEPLOY.md`. No image rebuild needed.

## launchd (alternative) — one-command install

From the repo root:

```bash
bash bot/scripts/launchd-install.sh
```

That script:
1. Verifies `bot/.env` has a `BOT_TOKEN`.
2. Clears any pre-existing Telegram webhook (so long-polling is allowed).
3. Writes `~/Library/LaunchAgents/com.civicpulse.munigraph.bot.plist`.
4. Loads it via `launchctl`.

Logs land in `bot/data/logs/bot.out.log` + `bot.err.log`. Watch them:

```bash
tail -f bot/data/logs/bot.err.log
```

## Daily export → git push

To keep the public dashboard in sync without running anything on a
schedule in the cloud, install a second launchd agent that runs daily
at 04:00 local time:

```bash
bash bot/scripts/launchd-install-export.sh
```

It runs `bot/scripts/local-export.sh` which:
1. Dumps SQLite → `public/data/quejas.json`.
2. Only commits + pushes if the JSON changed semantically.
3. Vercel picks up the push and redeploys the dashboard.

If your Mac is asleep at 04:00, macOS coalesces the job and runs it as
soon as you wake the laptop. No missed runs.

## Ops

**Check both agents:**
```bash
launchctl list | grep munigraph
```
Expect to see `.bot` (with a PID) and `.export` (no PID — it's scheduled,
not resident).

**Manually run the export once:**
```bash
bash bot/scripts/local-export.sh
```

**Restart the bot** (e.g. after a code change):
```bash
launchctl kickstart -k "gui/$(id -u)/com.civicpulse.munigraph.bot"
```

**Rotate the BOT_TOKEN:**
1. `@BotFather → /revoke → pick @munigraph_bot` → copy the new token.
2. Edit `bot/.env` with the new value.
3. `launchctl kickstart -k "gui/$(id -u)/com.civicpulse.munigraph.bot"` — picks up the new env.

**Troubleshooting · `Operation not permitted`:**

Symptom: `launchctl list | grep munigraph` shows the export agent
last-status as `126` and `bot/data/logs/export.err.log` contains
`/bin/bash: …/local-export.sh: Operation not permitted`. macOS's TCC
(Privacy & Security) blocks launchd-spawned shells from touching
files under `~/Documents/` by default. Fix once per Mac:

1. System Settings → Privacy & Security → Full Disk Access.
2. Click `+`, navigate to `/bin/bash` (or `/usr/local/bin/bash` if you
   use Homebrew bash). Press Cmd+Shift+. inside the file picker to
   reveal hidden files.
3. Toggle it ON.
4. Kick the agent: `launchctl kickstart -k "gui/$(id -u)/com.civicpulse.munigraph.export"`.

The bot agent itself (`com.civicpulse.munigraph.bot`) runs fine because
it invokes `node` directly via an absolute path — only the bash-wrapped
scripts (`local-export.sh`, `auto-curate-weekly.sh`) hit the TCC wall.
The semantic-diff guard inside `local-export.sh` means a stuck export
doesn't fabricate a fresh timestamp — `public/data/quejas.json` keeps
its real last-successful-run date until the script actually runs.

**Uninstall everything:**
```bash
bash bot/scripts/launchd-install.sh uninstall
bash bot/scripts/launchd-install-export.sh uninstall
```
SQLite data in `bot/data/bot.db` is kept — remove it by hand if you want.

## RGPD / right-to-be-forgotten verification

Every citizen can delete their own queja with `/olvidar Q-XXXXXXXX`. The
mechanic is soft-delete: the row stays in SQLite for the 5-year retention
window (Art. 55 LOPD-GDD), but every public surface filters it out. To
verify the flow end-to-end after deployment:

```bash
# Pick a test queja id you've submitted yourself
TEST_ID=Q-ABC12301

# 1. From a test Telegram account, send: /olvidar Q-ABC12301
#    You should see: ✅ Queja Q-ABC12301 eliminada.

# 2. Confirm soft-delete marker in SQLite
sqlite3 bot/data/bot.db "SELECT id, state, deleted_at FROM quejas WHERE id = '$TEST_ID';"
# deleted_at should be a recent UTC timestamp

# 3. Run an export manually and confirm the row is NOT in the public snapshot
bash bot/scripts/local-export.sh
jq '.items[] | select(.service_request_id == "'"$TEST_ID"'")' public/data/quejas.json
# Expected: empty output

# 4. The user can still see their own deleted queja (marked with 🗑 eliminada)
#    via /mis — this is by design so they can confirm the deletion worked.
```

If any of these steps fail, the `/olvidar` pipeline is broken and citizen
rights are being violated — treat as P0.

## When to graduate to always-on hosting

Cases where this setup is no longer enough:
- You need the bot up while the laptop is closed.
- Multiple moderators use `/batch_register` and need predictable
  availability.
- The `CHANNEL_ID` public channel's followers grow past a few hundred
  and missed broadcasts are a problem.

When that happens, options in order of friction:
1. **Cheapest DIY:** a Raspberry Pi or old laptop running Ubuntu,
   Tailscale installed. Copy the monorepo, run the systemd equivalent
   of these launchd plists. No external services, no cards.
2. **Cheapest cloud:** Fly.io — the `bot/DEPLOY.md` + `bot/fly.toml` are
   already prepared. Costs ~€2/mo inside Fly's $5 included-usage bucket.
3. **Managed:** Railway, Render, or a VPS. `bot/Dockerfile` works on
   any of them.

None of these require a rewrite — just pointing the `BOT_TOKEN` +
`WEBHOOK_URL` secrets at the new host.
