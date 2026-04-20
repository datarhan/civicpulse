# Running the bot locally on macOS (no cloud services)

If you want to avoid Fly.io / Railway / etc., the bot runs fine as a
macOS launchd user agent in long-polling mode:

- **No public ingress** — the bot connects outbound to Telegram. Zero
  exposure, zero Tailscale/ngrok/port-forward setup.
- **Auto-restart on crash** — `KeepAlive` in the plist re-launches the
  bot after any crash (with a 10s backoff).
- **Auto-start at login** — `RunAtLoad` brings the bot up whenever you
  sign in, so a reboot just needs login.
- **Persistent SQLite** — `bot/data/bot.db` survives restarts.

**Caveat: the Mac must be awake.** Sleep pauses the bot. Plug the laptop
in and keep it open, or use a dedicated always-on machine when you're
ready.

## One-command install

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

**Uninstall everything:**
```bash
bash bot/scripts/launchd-install.sh uninstall
bash bot/scripts/launchd-install-export.sh uninstall
```
SQLite data in `bot/data/bot.db` is kept — remove it by hand if you want.

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
