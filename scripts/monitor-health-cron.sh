#!/usr/bin/env bash
# Daily health digest → Telegram admin.
#
# Replaces the transcription-only alerter: one notification for one bad night,
# not one per subsystem. `check:transcription-health` stays as a standalone
# diagnostic you can run by hand; the CRON runs this.
#
# Covers: bot reachability, public site, stalled pipelines (transcription +
# extraction, with the cause diagnosed), sources that stopped publishing,
# nightly red streaks, integrity failures, and guards that exit 0 without
# measuring («sin comprobar»: a weekly warning after seven days in a row).
#
# Install: a mano en el crontab (0 11 * * *), y el agente
#          com.civicpulse.parte-tras-plenos (launchd-install-llm-pipelines.sh)
# Manual:  npm run monitor:health -- --dry-run --explain
set -uo pipefail

cd "$(dirname "$0")/.."
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

# OPENAI_API_KEY lets it tell "no credit" from "some other failure";
# BOT_TOKEN / ADMIN_USER_IDS (read from bot/.env) deliver the alert.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

echo "[monitor-health-cron] $(date '+%F %T')${PARTE_ORIGEN:+ · lanzado por ${PARTE_ORIGEN}}"

# Lo llaman dos: el cron de las 11:00 y, desde el 22-11-2026 (paso 0.4), el
# agente com.civicpulse.parte-tras-plenos cuando la tubería de plenos termina.
# Una pasada de lunes o jueves acaba hacia las 11, así que los dos pueden caer
# a la vez: los dos leerían el mismo estado del parte, mandarían el mismo
# Telegram dos veces y rehacerían las colas a la vez. Un cerrojo los pone en
# fila; el segundo se va. El cerrojo lleva el pid de quien lo tiene: si ese
# proceso ya no es un parte vivo, el cerrojo es de uno que murió y se toma en el
# acto (con la hora, el parte de tras la tubería se habría saltado justo el día
# en que el anterior murió). Sin pid, uno de más de una hora.
LOCK_DIR="scripts/.monitor-health.lock"
parte_vivo() {
  local pid
  pid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [ -n "$pid" ]; then
    ps -p "$pid" -o command= 2>/dev/null | grep -q 'monitor-health-cron\.sh'
    return
  fi
  # `find` sale 0 lo encuentre o no: lo que cuenta es lo que imprime.
  [ -z "$(find "$LOCK_DIR" -maxdepth 0 -mmin +60 2>/dev/null)" ]
}
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if parte_vivo; then
    echo "[monitor-health-cron] ya hay un parte en curso — salgo"
    exit 0
  fi
  echo "[monitor-health-cron] el cerrojo es de un parte que ya no corre: lo tomo"
  rm -f "$LOCK_DIR/pid"; rmdir "$LOCK_DIR" 2>/dev/null || true
  mkdir "$LOCK_DIR" 2>/dev/null || { echo "[monitor-health-cron] ya hay un parte en curso — salgo"; exit 0; }
fi
echo "$$" > "$LOCK_DIR/pid" 2>/dev/null || true
trap 'rm -f "$LOCK_DIR/pid"; rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# Si la tubería de plenos está corriendo, el parte de las 11:00 hablaría de una
# pasada a medias; el suyo saldrá cuando termine. Hace falta un proceso VIVO con
# el pid que la tubería dejó en su cerrojo: un cerrojo solo es el de una pasada
# que murió de golpe (apagón, SIGKILL), y ése es justo el día en que el parte no
# puede faltar. Y que ese proceso sea la tubería: un pid reciclado por otro
# programa no la tiene en marcha.
PIPE_PID="$(cat scripts/.hallazgos-pipeline.lock/pid 2>/dev/null || true)"
if [ -z "${PARTE_ORIGEN:-}" ] && [ -n "$PIPE_PID" ] \
   && ps -p "$PIPE_PID" -o command= 2>/dev/null | grep -q 'hallazgos-pipeline\.sh'; then
  echo "[monitor-health-cron] la tubería de plenos está corriendo (pid $PIPE_PID): el parte saldrá cuando termine"
  exit 0
fi

# Before the digest: rebuild the curator worklists that only went stale because
# findings were retracted (`colas:rehacer`, src/scraper/queue-repair.ts). It
# refuses a queue holding a choice its builder would wipe, and puts the backup
# back when a rebuild fails or drops a verdict — either way `check:queues`,
# run inside the digest below, still reports it, so what needs a person still
# reaches one. Its exit code is not the cron's: a refusal is the step working.
npm run --silent colas:rehacer || echo "[monitor-health-cron] colas:rehacer dejó algo para una persona (arriba)"
npm run --silent monitor:health -- --explain
rc=$?
# Exit 1 means "alerts found and reported" — the monitor working, not the cron
# failing. Only a crash (2) deserves a non-zero exit.
[ "$rc" -le 1 ] && exit 0
exit "$rc"
