#!/usr/bin/env bash
# CivicPulse — /hallazgos full-refresh pipeline (transcribe → extract →
# verify → commit → push). Keeps the claims behind /declaraciones and the
# provenance of /hallazgos fresh end-to-end. It writes no new finding: since
# 22-11-2026 a person writes and signs each one (see the note where the
# auto-curate step used to be).
#
# Chain:
#   scrape:pleno-videos          refresh the YouTube video index (cheap)
#   → for each pleno that HAS a video but NO transcript (newest first,
#     capped at MAX_PLENOS per run):
#         transcribe             Whisper mlx · $0 · ~20 min/pleno · local
#         extract:pleno-claims   claude-code · sonnet · $0 (Max plan)
#   → verify:pleno-claims        overlay-safe deterministic re-verify
#   → commit + push              deploy-vercel.yml redeploys on push-to-main
#
# Safe to run unattended:
#   · No new pleno video → the transcribe/extract loop is a no-op.
#   · MAX_PLENOS (default 2) bounds each run's wall-clock; a backlog is
#     cleared a couple plenos per run (the Mon + Thu agent chews through it).
#   · verify:pleno-claims is OVERLAY-SAFE — it writes the gitignored base
#     (pleno-claims-verified-base.json) then re-applies the committed
#     public/data/pleno-claims-overlay.json via rebuildVerified(), so it
#     can NOT wipe the LLM/NLI/curator verdicts. NEVER call
#     verify:pleno-claims:llm here — that legacy runner bypasses the overlay.
#   · One pleno failing (yt-dlp hiccup, quota) is logged + skipped; the
#     batch continues. The extract checkpoint preserves completed plenos.
#
# Host-only: the claude CLI needs an interactive login (can't containerize). (Whisper now
# defaults to the OpenAI API; the mlx/ANE path remains as an env override.)
# macOS TCC: cron needs Full Disk Access on
# /usr/sbin/cron + node + git, and origin must be SSH — same gauntlet as the
# quejas + promises crons (see project memory).
#
# Run manually:   bash scripts/hallazgos-pipeline.sh          # MAX_PLENOS=2
#                 MAX_PLENOS=1 bash scripts/hallazgos-pipeline.sh
# Install cron:   bash scripts/cron-install-hallazgos.sh
set -euo pipefail

MAX_PLENOS="${MAX_PLENOS:-2}"

# Plenos that repeatedly abort transcription are blocklisted so they stop
# burning a MAX_PLENOS slot on every run without ever succeeding.
# Space/comma-separated; override via env.
#   1l7hhu7 · 2023-02-13 — "Part I", a 22:36 clip whose audio carries no
#             intelligible speech (whisper returns all-dots; volumedetect
#             near-silence); a Part-I-only transcript would misrepresent the
#             session. The channel also has "Part II" (QF3xwnV4ycQ, 2h50m),
#             unread by the index until 2026-10-27. A two-part session is not
#             something this queue (one video per session) can transcribe
#             whole: it stays blocked until the operator decides.
TRANSCRIBE_BLOCKLIST="${TRANSCRIBE_BLOCKLIST:-1l7hhu7}"

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd -P)"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

log() { echo "[hallazgos-pipeline] [$(date '+%F %T')] $*"; }

# ---- branch guard + pathspec-limited commit (shared) ------------------
# shellcheck source=scripts/lib/cron-git.sh
. "$REPO_DIR/scripts/lib/cron-git.sh"
# shellcheck source=scripts/lib/claude-probe.sh
. "$REPO_DIR/scripts/lib/claude-probe.sh"
# Before the lock, before the pull, before Whisper and the extractor: off main
# this run would rebase the checked-out branch onto origin/main, commit there,
# and push an untouched local main — hours of transcription that can never be
# published.
cron_require_main "hallazgos-pipeline"

# ---- single-instance lock (a run can take hours) ----------------------
LOCK_DIR="$REPO_DIR/scripts/.hallazgos-pipeline.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if find "$LOCK_DIR" -maxdepth 0 -mmin +360 >/dev/null 2>&1; then
    log "stealing stale lock (>6h)"; rmdir "$LOCK_DIR" 2>/dev/null || true
    mkdir "$LOCK_DIR" 2>/dev/null || { log "lock contended — exiting"; exit 0; }
  else
    log "another run holds the lock — exiting"; exit 0
  fi
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# ---- env --------------------------------------------------------------
if [ -f "$REPO_DIR/.env" ]; then set -a; . "$REPO_DIR/.env"; set +a; fi
# Claim extraction runs on claude-code/sonnet (operator decision 2026-08-02),
# not agy/gemini-flash. Measured with `npm run eval:extractor` on a diarized
# pleno: sonnet reproduced 100% of extracted quotes verbatim against the
# transcript, haiku only 97% — one reworded councillor sentence out of 33. The
# published contract of /declaraciones is that a quote is what was SAID, so a
# model that paraphrases is unusable at any price. gemini-flash was never
# measured at all, and it produced every one of the 6,359 claims on disk.
#
# agy also fails in the worst possible way: with its daily Google quota spent it
# prints "Individual quota reached" to stdout and exits **0**, so nothing
# downstream can tell success from exhaustion by return code. Quota observed
# spent 2026-08-02 with a 62-hour reset.
export LLM_BACKEND="${LLM_BACKEND:-claude-code}"
export CLAUDE_CODE_MODEL="${CLAUDE_CODE_MODEL:-claude-sonnet-5}"
export AGY_MODEL="${AGY_MODEL:-gemini-3.8-flash-medium}"  # only read if LLM_BACKEND=agy

# Preflight, same as press-lab-pipeline: if the chosen backend cannot answer a
# one-word prompt, skip the steps that need it rather than let per-call failures
# drain the chain to a metered fallback. Cheap, and it turns a silent leak into
# a named skip.
#
# It used to `exit 0` on the whole run, and that cost real work. The speaker-map
# step does not touch this backend at all — it runs on `GEMINI_API_KEY`, a
# different key with a different quota, and that quota is 20 requests a day that
# do NOT accumulate. On 2026-08-15 claude-code did not answer at 09:30, the run
# deferred within a second, and a night of Gemini quota went unspent for want of
# a backend it never needed. A twenty-night sweep cannot afford to lose nights
# to an unrelated outage.
#
# So: TEXT_BACKEND is the gate for the steps that genuinely need it —
# extraction (and, until 22-11-2026, auto-curation). The map's own back-reference adjudication also
# goes through it and degrades safely on its own (an unadjudicated row stays
# `weak` and yields no attribution), and the post-map re-extraction already
# knows how to say «map kept, claims still unattributed» and come back tomorrow.
#
# The reason is KEPT. This used to send the probe to /dev/null and log a guess —
# «(quota or auth)» — while the CLI was saying exactly what was wrong. On
# 2026-09-18 and -19 that was «You've hit your weekly limit · resets Sep 19 at
# 8pm»: two degraded mornings whose only remedy was to wait, reported to the
# phone as «extract-pleno-claims: última hace 49h». See scripts/lib/claude-probe.sh.
TEXT_BACKEND=ok
TEXT_BACKEND_MOTIVO=""
if [ "$LLM_BACKEND" = claude-code ] &&
   ! claude_probe claude "$CLAUDE_CODE_MODEL"; then
  TEXT_BACKEND=down
  TEXT_BACKEND_MOTIVO="$CLAUDE_PROBE_MOTIVO"
  log "claude-code unavailable — $CLAUDE_PROBE_MOTIVO"
  log "  pasada DEGRADADA: se saltan extracción y auto-curación,"
  log "  se mantienen los pasos que no dependen de ese backend (mapas de hablantes, cuota Gemini aparte)"
fi

# ---- el sondeo se repite justo antes de cada extracción (paso 0.2, 22-11-2026) ----
# El de arriba corre a las 09:30, y una transcripción puede tardar media hora.
# El 19-11-2026 el sondeo pasó, la sesión OAuth de claude caducó mientras se
# transcribía 51k7yx, y sus 311 ventanas fallaron una tras otra: la sesión más
# reciente se quedó sin declaraciones y la transcripción, pagada. Ahora cada
# extracción pregunta antes; si claude ya no contesta, la pasada pasa a DEGRADADA
# desde ahí y lo transcrito espera a la recuperación de una pasada siguiente
# (`extraccion:pendiente`, más abajo).
sondea_texto() {
  [ "$TEXT_BACKEND" = ok ] || return 1
  [ "$LLM_BACKEND" = claude-code ] || return 0
  if claude_probe claude "$CLAUDE_CODE_MODEL"; then return 0; fi
  TEXT_BACKEND=down
  TEXT_BACKEND_MOTIVO="$CLAUDE_PROBE_MOTIVO"
  log "claude-code dejó de contestar a mitad de pasada — $CLAUDE_PROBE_MOTIVO"
  log "  pasada DEGRADADA desde aquí: lo transcrito queda guardado y lo extrae la recuperación de otra pasada"
  return 1
}

# Las listas de la recuperación, en .cache/ (ignorada por git), en el árbol del
# curador, donde corre esta tubería:
#   · PARCIALES: extracciones a las que les quedaron ventanas SIN RESPUESTA
#     (claude se cayó a media sesión). Tienen declaraciones, pero no todas; la
#     recuperación las vuelve a pasar, y la caché del LLM sirve las contestadas.
#   · FALLOS: «id n» — recuperaciones que fallaron con claude vivo antes y
#     después. A las FALLOS_MAX, la sesión pasa a EXTRAIDAS_VACIAS y deja de
#     reintentarse sola: si no, una sesión que nunca sale bloquearía la cola
#     entera, una pasada tras otra (~465 llamadas cada vez).
#   · EXTRAIDAS_VACIAS: lo que no se reintenta solo. La vacía una persona.
PARCIALES=".cache/extraccion-parcial.txt"
FALLOS=".cache/extraccion-fallos.txt"
EXTRAIDAS_VACIAS=".cache/extraccion-sin-declaraciones.txt"
FALLOS_MAX="${FALLOS_MAX:-3}"
lista_pon() { mkdir -p .cache; grep -qxF -- "$2" "$1" 2>/dev/null || echo "$2" >> "$1"; }
lista_quita() {
  [ -f "$1" ] || return 0
  grep -vxF -- "$2" "$1" > "$1.tmp" || true
  mv "$1.tmp" "$1"
}
fallos_de() { awk -v id="$1" '$1==id {print $2; f=1} END {if(!f) print 0}' "$FALLOS" 2>/dev/null || echo 0; }
fallos_pon() {
  mkdir -p .cache
  { [ -f "$FALLOS" ] && awk -v id="$1" '$1!=id' "$FALLOS"; echo "$1 $2"; } > "$FALLOS.tmp" || true
  mv "$FALLOS.tmp" "$FALLOS"
}
fallos_quita() {
  [ -f "$FALLOS" ] || return 0
  awk -v id="$1" '$1!=id' "$FALLOS" > "$FALLOS.tmp" || true
  mv "$FALLOS.tmp" "$FALLOS"
}

# Extrae una sesión con la política de $0 y deja en EXTRAE_RC su código de
# salida y en EXTRAE_PARCIAL 1 si le quedaron ventanas sin respuesta. Apunta o
# quita la sesión de PARCIALES según eso. Nunca sale !=0.
#
# Same $0 policy the auto-curate step enforced until 22-11-2026. The
# transcription step legitimately needs OPENAI_API_KEY, so the key is present in
# this shell — which meant the extractor's backend chain could walk agy →
# claude-code → openai and bill silently whenever the $0 backends were
# throttled. (Exactly how the press-lab pipeline leaked on 2026-08-01; there it
# was masked only by the account being out of credits.) Strip the metered keys
# for THIS command only, so a throttled $0 backend defers the extraction
# instead of paying for it.
extrae_sesion() {
  local sid="$1" salida
  salida="$(mktemp "${TMPDIR:-/tmp}/extrae.XXXXXX")"
  EXTRAE_RC=0
  env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY npm run extract:pleno-claims -- "$sid" > "$salida" 2>&1 || EXTRAE_RC=$?
  cat "$salida"
  EXTRAE_PARCIAL=0
  if grep -qE "^\[extract·claims\] $sid: .*NO ANSWER" "$salida"; then EXTRAE_PARCIAL=1; fi
  rm -f "$salida"
  if [ "$EXTRAE_RC" -eq 0 ] && [ "$EXTRAE_PARCIAL" = 1 ]; then
    lista_pon "$PARCIALES" "$sid"
    log "⚠ $sid extraída a medias (ventanas SIN RESPUESTA) — apuntada para que la recuperación la complete"
  elif [ "$EXTRAE_RC" -eq 0 ]; then
    lista_quita "$PARCIALES" "$sid"
  fi
  return 0
}

# Las sugerencias de voto de una sesión recién extraída. Libel-safe: writes ONLY
# pleno-votes-suggestions.json (every row requiresHumanApproval), stamps each
# with the authoritative regmeet.com orden-del-día outcome cross-check, and
# NEVER writes the published pleno-votes.json — a curator promotes by hand via
# `npm run promote-vote`. Non-fatal on failure.
sugiere_votos() {
  log "extracting vote suggestions for $1 (regmeet cross-check)…"
  if npm run extract:pleno-votes -- "$1" --engine llm --min-confidence 0.5 --cross-check; then
    log "✓ $1 vote suggestions refreshed"
  else
    log "warn: vote-suggestion extraction failed for $1 (non-fatal)"
  fi
}
# openai (API, metered ~$0.006/min ≈ $0.72 per 2h pleno) replaced mlx as the
# default on 2026-07-07: MLX large-v3 pinned the local GPU for ~30 min/run and
# tripped the Metal watchdog on long sessions. Requires OPENAI_API_KEY (from
# .env above). Override via env for a local run: WHISPER_ENGINE=mlx.
export WHISPER_ENGINE="${WHISPER_ENGINE:-openai}"

log "starting · MAX_PLENOS=$MAX_PLENOS · llm=$LLM_BACKEND/${CLAUDE_CODE_MODEL:-$AGY_MODEL} · whisper=$WHISPER_ENGINE · blocklist=[${TRANSCRIBE_BLOCKLIST:-none}]"

# yt-dlp caduca en el calendario de YouTube, no en el nuestro, y su versión ES su
# fecha. Avisa, nunca bloquea: un binario viejo casi siempre funciona, y un aviso
# que puede tumbar la noche es uno que alguien acaba quitando. Sale 0 pase lo que
# pase. Del 19 al 23-ago-2026 esta línea habría ahorrado cuatro noches muertas —
# los metadatos resolvían y sólo el medio devolvía 403, así que la única pasada
# que aún tocaba YouTube (`scrape-pleno-videos`, sólo metadatos) seguía en verde y
# tapaba la avería.
# `|| true` no es decorativo: bajo `set -euo pipefail` un aviso que sale !=0
# —el binario ausente, el script movido, un stub que no lo conoce— se lleva la
# noche entera por delante. Una comprobación de mantenimiento que puede tumbar
# la pasada es peor que no tenerla, y esto ya rompió 9 pruebas al escribirlo.
npx tsx scripts/check-ytdlp-age.ts 2>&1 | while IFS= read -r l; do log "$l"; done || true

# ---- always start from origin -----------------------------------------
# cron_git_pull_rebase, not a bare pull: the lock, the .env and the `claude -p`
# probe above are seconds of window since the branch guard, and on the wrong
# branch this pull would rebase THAT branch onto origin/main.
cron_git_pull_rebase "git pull inicial" || { log "git pull failed — aborting before LLM work"; exit 1; }

# ---- refresh the video index (cheap) ----------------------------------
npm run scrape:pleno-videos || log "warn: scrape:pleno-videos failed — continuing with existing index"

# ---- refresh the agenda snapshot (best-effort) ------------------------
# regmeet.com blackholes GitHub-runner IPs, so the nightly workflow's
# breaker skips scrape:pleno-agendas there — which froze the snapshot for
# 3 weeks in July 2026 (the 2026-07-06 pleno rendered with an empty orden
# del día). This residential-IP run is the snapshot's only reliable
# refresh path. Polite crawl (1.5 s/request, sequential), non-fatal.
npm run scrape:pleno-agendas || log "warn: scrape:pleno-agendas failed — continuing with existing snapshot"

# ---- transcribable backlog: missing transcript AND has a video, newest first
TARGETS=$(TRANSCRIBE_BLOCKLIST="$TRANSCRIBE_BLOCKLIST" node -e '
  const fs=require("fs");
  const block=new Set((process.env.TRANSCRIBE_BLOCKLIST||"").split(/[\s,]+/).filter(Boolean));
  const plenos=(require("./public/data/plenos.json").items)||[];
  const videos=(require("./public/data/pleno-videos.json").items)||[];
  const vdates=new Set(videos.map(v=>v.plenoDate));
  const have=new Set(fs.readdirSync("public/data/pleno-transcripts").filter(f=>f.endsWith(".txt")).map(f=>f.replace(/\.txt$/,"")));
  const t=plenos.filter(p=>!have.has(p.id)&&vdates.has(p.date)&&!block.has(p.id)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  process.stdout.write(t.map(x=>x.id).join("\n"));
')

# Un recuento por trabajo, cada uno con su nombre en la última línea y en el
# asunto del commit. Hasta el 06-10-2026 había uno solo, `NEW`, que sumaba las
# extracciones de las dos ramas —la de un pleno recién transcrito y la
# re-extracción tras un mapa de hablantes—, y esos dos renglones lo llamaban
# «transcribed»: del 28-08 al 28-09-2026, doce commits dijeron haber transcrito
# uno o dos plenos sin añadir una sola transcripción. Eran noches de mapa. Y al
# revés, por construcción aunque no conste ningún caso, una transcripción cuya
# extracción fallaba se comiteaba bajo «0».
TRANSCRIBED=0   # transcripciones que Whisper terminó
EXTRACTED=0     # extracciones de claims sobre esas transcripciones
MAPPED=0        # mapas de hablantes escritos, también los parciales
REEXTRACTED=0   # re-extracciones tras un mapa
COUNT=0
TRATADAS_HOY=" "   # sesiones que esta pasada ya transcribió (la recuperación no las repite)
RECUPERADAS=0     # extracciones recuperadas de pasadas anteriores
# Counted so the final line can say it. A map that covers part of a session is
# a useful, resumable result — but it is not a ✓, and 2026-08-11 shipped one
# under a ✓.
PARTIAL_MAPS=0
if [ "$TEXT_BACKEND" != ok ]; then
  # Transcription itself is whisper, not this backend — but its only consumer
  # is the extraction two lines down, and transcribing a pleno costs ~$0.72 of
  # metered OpenAI. Paying for a transcript nothing can read tonight is not a
  # saving of any kind; it waits for a healthy run.
  log "backlog transcribible: $(echo "${TARGETS:-}" | grep -c . || true) sesión(es) EN ESPERA — sin backend de texto no hay extracción que las consuma"
  TARGETS=""
fi
if [ -n "$TARGETS" ]; then
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$COUNT" -ge "$MAX_PLENOS" ]; then
      log "reached MAX_PLENOS=$MAX_PLENOS — remaining backlog deferred to next run"; break
    fi
    COUNT=$((COUNT+1))
    log "[$COUNT/$MAX_PLENOS] transcribing $id (whisper=$WHISPER_ENGINE)…"
    # mlx can abort on a Metal GPU command-buffer timeout on very long
    # sessions (5h+, ~140MB+ audio) — a C++ abort we can't catch in-process.
    # Retry once at batch_size=1 (shortest Metal command buffers, safest
    # against the driver watchdog) before giving up on the pleno.
    ok=0
    if bash scripts/transcribe-pleno.sh "$id"; then
      ok=1
    elif [ "$WHISPER_ENGINE" = mlx ]; then
      log "transcription failed for $id — retry at batch_size=1 (Metal GPU timeout guard)…"
      if WHISPER_BATCH_SIZE=1 bash scripts/transcribe-pleno.sh "$id"; then ok=1; fi
    fi
    if [ "$ok" = 1 ]; then
      TRANSCRIBED=$((TRANSCRIBED+1))
      TRATADAS_HOY="${TRATADAS_HOY}${id} "
      if ! sondea_texto; then
        log "· $id transcrito; extracción EN ESPERA (claude no contesta) — la recupera una pasada siguiente"
        # Lo que queda del backlog esperaría igual: no se paga otra transcripción
        # que nada puede leer hoy (ver arriba, «backlog transcribible»).
        log "backlog transcribible: el resto EN ESPERA — claude ya no contesta"
        break
      fi
      log "extracting claims from $id ($LLM_BACKEND/${CLAUDE_CODE_MODEL:-$AGY_MODEL} · \$0 backends only)…"
      extrae_sesion "$id"
      if [ "$EXTRAE_RC" -eq 0 ]; then
        EXTRACTED=$((EXTRACTED+1)); log "✓ $id claims extracted"
      else
        log "warn: claim extract failed for $id — transcript kept, claims incomplete; la recuperación la reintenta"
      fi
      sugiere_votos "$id"
    else
      log "warn: transcription failed for $id (even at batch_size=1) — skipping"
    fi
  done <<< "$TARGETS"
else
  log "no transcribable backlog"
fi

# ---- recuperación: transcritas sin extraer o extraídas a medias (paso 0.2) ----
# Una pasada cuya extracción falló dejaba la sesión transcrita y sin extraer
# para siempre: la transcripción ya no la volvía a ofrecer. `extraccion:pendiente`
# lista las de AUDIO (no las de acta), aptas, sin ninguna declaración o
# apuntadas en PARCIALES, la más reciente primero (src/scraper/extraccion-pendiente.ts),
# y por stderr cuenta las que deja fuera y por qué. Como mucho RECUPERA_MAX por
# pasada: una extracción son ~465 llamadas de claude-code.
#
# El extractor sale 1 cuando no saca nada (manifiesto «no-work»), con el
# backend caído o con una sesión que de verdad no da nada: desde fuera se leen
# igual. Así que tras un fallo se vuelve a sondear: si claude ya no contesta, el
# fallo es suyo y no cuenta; si contesta, cuenta, y a los FALLOS_MAX la sesión
# sale de la cola (EXTRAIDAS_VACIAS) para no bloquear a las demás.
RECUPERA_MAX="${RECUPERA_MAX:-1}"
case "$RECUPERA_MAX" in ''|*[!0-9]*)
  log "warn: RECUPERA_MAX=$RECUPERA_MAX no es un número — se usa 1"; RECUPERA_MAX=1 ;;
esac
declaraciones_de() {
  # «?» si el fichero no se lee o no trae items[]: un 0 de una forma que cambió
  # apuntaría la sesión como vacía para siempre.
  node -e 'try{const d=require("./public/data/pleno-claims-suggestions.json");if(!Array.isArray(d.items))throw 0;process.stdout.write(String(d.items.filter(i=>i&&i.plenoId===process.argv[1]).length))}catch(e){process.stdout.write("?")}' "$1" 2>/dev/null || echo "?"
}
if [ "$RECUPERA_MAX" -eq 0 ]; then
  log "recuperación: RECUPERA_MAX=0 — apagada en esta pasada"
elif [ "$TEXT_BACKEND" != ok ]; then
  log "recuperación EN ESPERA: sin backend de texto"
else
  if PENDIENTES_EXTRACCION=$(npm run --silent extraccion:pendiente -- --why); then
    PENDIENTES_EXTRACCION=$(printf '%s\n' "$PENDIENTES_EXTRACCION" | while IFS= read -r m; do
      [ -z "$m" ] && continue
      if [[ "$TRATADAS_HOY" != *" $m "* ]]; then echo "$m"; fi
    done)
  else
    log "warn: extraccion:pendiente falló — no se recupera nada en esta pasada"
    PENDIENTES_EXTRACCION=""
  fi
  N_PEND=$(printf '%s\n' "$PENDIENTES_EXTRACCION" | grep -c . || true)
  if [ "$N_PEND" -eq 0 ]; then
    log "recuperación: ninguna sesión transcrita espera extracción (lo que quedó fuera, arriba)"
  else
    log "recuperación: $N_PEND sesión(es) por extraer o completar ($(echo "$PENDIENTES_EXTRACCION" | tr '\n' ' ')) · tope $RECUPERA_MAX por pasada"
    INTENTADAS=0
    while IFS= read -r rid; do
      [ -z "$rid" ] && continue
      [ "$INTENTADAS" -ge "$RECUPERA_MAX" ] && { log "recuperación: tope alcanzado — el resto, en otra pasada"; break; }
      if ! sondea_texto; then
        log "· recuperación de $rid EN ESPERA (claude no contesta)"; break
      fi
      INTENTADAS=$((INTENTADAS+1))
      log "recuperando la extracción de $rid…"
      extrae_sesion "$rid"
      N_DECL=$(declaraciones_de "$rid")
      if [ "$EXTRAE_RC" -eq 0 ] && [ "$N_DECL" != "?" ] && [ "$N_DECL" -gt 0 ]; then
        EXTRACTED=$((EXTRACTED+1)); RECUPERADAS=$((RECUPERADAS+1))
        fallos_quita "$rid"
        log "✓ $rid recuperada: $N_DECL declaración(es)$([ "$EXTRAE_PARCIAL" = 1 ] && echo ' — aún a medias')"
        sugiere_votos "$rid"
      elif ! sondea_texto; then
        log "· la recuperación de $rid falló con claude caído — no cuenta como intento de la sesión"
        break
      else
        N_FALLOS=$(( $(fallos_de "$rid") + 1 ))
        if [ "$N_FALLOS" -ge "$FALLOS_MAX" ]; then
          fallos_quita "$rid"
          lista_pon "$EXTRAIDAS_VACIAS" "$rid"
          log "⚠ $rid: $N_FALLOS recuperaciones sin declaraciones con claude vivo — apuntada en $EXTRAIDAS_VACIAS, no se reintenta sola (mírala a mano)"
        else
          fallos_pon "$rid" "$N_FALLOS"
          log "warn: la recuperación de $rid no dio declaraciones (intento $N_FALLOS de $FALLOS_MAX con claude vivo; rc=$EXTRAE_RC, declaraciones=$N_DECL)"
        fi
      fi
    done <<< "$PENDIENTES_EXTRACCION"
  fi
fi

# ---- what the dependency graph says is owed ----------------------------
# The graph answers WHETHER LLM work is owed — it hashes the transcript and
# speaker-map directories against what the claims corpus was built from. It
# does NOT choose sessions: it knows nothing about quota, chunk budgets or
# which pleno is newest, and those are exactly what the backlogs below are for.
# Asking it first means a run that finds nothing to do can say so on evidence
# rather than because its own selector happened to come up empty.
GRAPH_OWED=$(npm run --silent refresh -- --list llm 2>/dev/null || true)
if [ -n "$GRAPH_OWED" ]; then
  log "grafo: trabajo LLM pendiente → $(echo "$GRAPH_OWED" | tr '\n' ' ')"
else
  log "grafo: el corpus de claims está al día respecto a transcripciones y mapas"
fi

# ---- speaker maps: who was actually speaking ---------------------------
# The claim extractor no longer guesses `speakerGroup`; it joins it from
# pleno-speaker-map/<id>.json, where every speaker is backed by a turn-grant the
# chair said out loud. A session with no map yields claims with speakerGroup
# null — honest, and better than the inversion it replaces, but not attribution.
#
# BUDGET, not MAX_PLENOS. The Gemini free tier is 20 requests/day, measured by
# exhausting it on 2026-08-10, and one 4-hour session is 25 chunks of 600s. So
# the cap here counts CHUNKS across the whole run, and a session that does not
# finish is resumed on a later day rather than abandoned: extract-speaker-map.ts
# records the untouched chunks as "never attempted", which is a different fact
# from "the model found no speakers" and must stay that way.
#
# No $0 fallback exists for this step. claude-code cannot take audio (`claude -p`
# has no attachment path), and a text model handed an audio job with no audio
# invents a plausible map. A 429 therefore stops the run; it never degrades.
# El techo se cuenta en PETICIONES, no en trozos, porque es lo que la cuota mide.
#
# Hasta el 23-ago-2026 eran 14 TROZOS, dimensionados sobre ~1,33 llamadas por
# trozo (sonda del 15-ago, n=3). La medición que faltaba llegó sola: los días 20 y
# 21 de agosto la pasada gastó **12 llamadas para 4 trozos — 3,0 por trozo**,
# porque un trozo que falla se lleva sus tres intentos. A ese ritmo 14 trozos
# piden ~42 peticiones contra una cuota de 20, así que la noche terminaba en un
# 429 en vez de en su presupuesto — y entonces una cuota que muere de verdad en el
# trozo 3, porque otro proceso se la bebió, se lee exactamente igual. Regla 3 de
# DATA_INTEGRITY: un centinela que además es el caso corriente ha dejado de decir
# nada.
#
# 16 de 20 deja margen para que el 429 siga siendo la excepción. Contando en la
# unidad correcta ya no hay que reestimar el techo cada vez que cambia la tasa de
# reintentos: una noche mala hace menos trozos, no más peticiones.
SPEAKER_MAP_CALL_BUDGET="${SPEAKER_MAP_CALL_BUDGET:-16}"

# ---- veda electoral y tope de re-atribución (decisión 4.4, 22-11-2026) ----
# En veda (LOREG, `frozenUntil` en promises.json) no se mapean voces ni se
# re-extrae con atribución: el mapa decide a qué grupo se atribuye cada cita de
# un candidato. Los plenos nuevos se siguen extrayendo arriba, con
# `speakerGroup: null` (extract-pleno-claims mira la veda por su cuenta).
# Pregunta al `isFrozen` compartido por `veda:activa`; si no contesta, se trata
# como veda: «no sé si hay veda» no es «no la hay».
if VEDA=$(npm run --silent veda:activa); then :; else
  VEDA="desconocida (veda:activa falló)"
fi
log "veda electoral: ${VEDA:-no}"
# Como mucho tantas sesiones YA PUBLICADAS re-atribuidas por pasada, haya veda o
# no: una versión mala del mapa podía volver a etiquetar 49 sesiones en una
# noche antes de que nadie mirara. Las que pasan del tope conservan su mapa y se
# re-extraen la noche siguiente. Sube cuando el conjunto de oro se vuelva a
# puntuar tras cada cambio (paso 2.3 del plan).
REATRIBUCION_MAX="${REATRIBUCION_MAX:-2}"
case "$REATRIBUCION_MAX" in
  ''|*[!0-9]*)
    log "warn: REATRIBUCION_MAX=$REATRIBUCION_MAX no es un número — se usa 0 (ninguna sesión publicada se re-atribuye)"
    REATRIBUCION_MAX=0 ;;
esac
REATRIBUIDAS=0
# 1 si la sesión ya tiene declaraciones publicadas. Ante la duda, 1: cuenta
# contra el tope.
publicada() {
  node -e 'try{const d=require("./public/data/pleno-claims-verified.json");process.stdout.write((d.items||[]).some(i=>i&&i.claim&&i.claim.plenoId===process.argv[1])?"1":"0")}catch(e){process.stdout.write("1")}' "$1" 2>/dev/null || echo 1
}

# Las sesiones con mapa cuya re-extracción quedó EN ESPERA (por el tope, sin
# backend de texto o porque falló). Un mapa completo saca la sesión de
# `speaker-map:backlog`, así que sin esta lista nadie la volvería a re-extraer:
# se quedaba con `speakerGroup: null` y un mapa válido en disco. Ignorada por git
# (.cache/), en el árbol del curador, que es donde corre esta tubería.
PENDIENTES=".cache/reatribucion-pendiente.txt"
HECHAS_EN_LA_PASADA=" "
anota_pendiente() {
  mkdir -p .cache
  grep -qxF -- "$1" "$PENDIENTES" 2>/dev/null || echo "$1" >> "$PENDIENTES"
}
quita_pendiente() {
  [ -f "$PENDIENTES" ] || return 0
  grep -vxF -- "$1" "$PENDIENTES" > "$PENDIENTES.tmp" || true
  mv "$PENDIENTES.tmp" "$PENDIENTES"
}
# Re-extrae una sesión con su mapa, o la deja EN ESPERA (y apuntada). Nunca sale
# !=0: bajo `set -e` una espera no puede tumbar la noche.
reextrae_con_mapa() {
  local mid="$1"
  HECHAS_EN_LA_PASADA="${HECHAS_EN_LA_PASADA}${mid} "
  if [ "$TEXT_BACKEND" != ok ]; then
    # The map is on disk and that is the expensive half. The claims pick
    # it up on a later healthy run; until then they carry no bloc,
    # which is honest rather than wrong.
    log "· $mid mapeado, re-extracción EN ESPERA (sin backend de texto) — el mapa queda guardado"
    anota_pendiente "$mid"
  elif [ "$(publicada "$mid")" = 1 ] && [ "$REATRIBUIDAS" -ge "$REATRIBUCION_MAX" ]; then
    log "· $mid mapeado, re-extracción EN ESPERA (tope: $REATRIBUCION_MAX sesión(es) publicada(s) re-atribuida(s) por pasada) — el mapa queda guardado y se re-extrae en otra pasada"
    anota_pendiente "$mid"
  else
    local salida
    salida="$(mktemp "${TMPDIR:-/tmp}/reextrae.XXXXXX")"
    if env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY npm run extract:pleno-claims -- "$mid" > "$salida" 2>&1; then
      cat "$salida"
      # Sale 0 también cuando una guarda del extractor conservó las declaraciones
      # viejas, sin grupo (vacío, citas huérfanas, veda). Eso no es re-atribuir:
      # ni gasta tope ni la saca de la lista.
      if grep -qE "\] $mid (PRESERVED|SKIPPED|CONSERVADA)" "$salida"; then
        log "· $mid: re-extracción SIN EFECTO (una guarda conservó las declaraciones de antes) — sigue pendiente"
        anota_pendiente "$mid"
      else
        REEXTRACTED=$((REEXTRACTED+1)); log "✓ $mid claims re-extracted with map attribution"
        if [ "$(publicada "$mid")" = 1 ]; then REATRIBUIDAS=$((REATRIBUIDAS+1)); fi
        quita_pendiente "$mid"
        # El sello NO va aquí. Ver el bloque `EXTRACTIONS -gt 0` más abajo.
      fi
    else
      cat "$salida"
      log "warn: re-extract failed for $mid — map kept, claims still unattributed"
      anota_pendiente "$mid"
    fi
    rm -f "$salida"
  fi
  return 0
}

if [ -n "$VEDA" ]; then
  log "speaker-map step skipped: veda electoral hasta $VEDA — ni mapas ni re-atribución; las declaraciones nuevas salen con speakerGroup:null"
elif [ "$SPEAKER_MAP_CALL_BUDGET" -gt 0 ] && [ -n "${GEMINI_API_KEY:-}" ]; then
  MAP_TARGETS=$(npm run --silent speaker-map:backlog 2>/dev/null || true)
  if [ -n "$MAP_TARGETS" ]; then
    REMAINING="$SPEAKER_MAP_CALL_BUDGET"
    PARTIAL=$(npm run --silent speaker-map:backlog -- --why 2>/dev/null | grep -c parcial || true)
    log "speaker-map backlog: $(echo "$MAP_TARGETS" | wc -l | tr -d ' ') session(s) unfinished ($PARTIAL of them partial, resuming) · budget ${SPEAKER_MAP_CALL_BUDGET} call(s)"
    while IFS= read -r mid; do
      [ -z "$mid" ] && continue
      if [ "$REMAINING" -le 0 ]; then
        log "speaker-map call budget spent — remaining backlog deferred to the next run"; break
      fi
      log "speaker map for $mid (up to ${REMAINING} call(s))…"
      if npm run extract:speaker-map -- "$mid" --max-calls "$REMAINING"; then
        # Lo que la pasada COSTÓ, en peticiones, que es lo que se presupuesta.
        # `?? ` y no `|| `, porque 0 llamadas es una respuesta real —una sesión
        # que se cerró con trozos arrastrados no gastó nada— y `||` la
        # convertiría en el respaldo.
        SPENT=$(node -e 'try{const m=require("./pleno-speaker-map/"+process.argv[1]+".json");process.stdout.write(String(m.stats.apiCalls ?? 0))}catch(e){process.stdout.write("0")}' "$mid" 2>/dev/null || echo 0)
        EXPECTED=$(node -e 'try{const m=require("./pleno-speaker-map/"+process.argv[1]+".json");process.stdout.write(String(m.stats.chunksExpected||0))}catch(e){process.stdout.write("0")}' "$mid" 2>/dev/null || echo 0)
        # SEPARADO de $SPENT desde que el presupuesto cuenta llamadas: comparar
        # peticiones contra trozos esperados marcaría PARCIAL una sesión completa
        # (o al revés) según la tasa de reintentos de esa noche.
        DONE=$(node -e 'try{const m=require("./pleno-speaker-map/"+process.argv[1]+".json");process.stdout.write(String(m.stats.chunksTranscribed ?? 0))}catch(e){process.stdout.write("0")}' "$mid" 2>/dev/null || echo 0)
        REMAINING=$((REMAINING - SPENT))
        MAPPED=$((MAPPED+1))
        # A ✓ beside a map covering 7 of 17 chunks is how the 2026-08-11 run
        # read as clean. `extract:speaker-map` exits 0 whenever it writes a map
        # at all — partial is a legitimate, resumable outcome, and refusing to
        # write it would throw away the chunks that did succeed — so the exit
        # code cannot carry this. The line has to read the stats itself.
        if [ "${EXPECTED:-0}" -gt 0 ] && [ "${DONE:-0}" -lt "${EXPECTED:-0}" ]; then
          PARTIAL_MAPS=$((PARTIAL_MAPS+1))
          log "⚠ $mid mapeado PARCIAL ($DONE/$EXPECTED chunk(s) · $SPENT call(s) · ver failedChunks) · $REMAINING call(s) left"
        else
          log "✓ $mid mapped ($DONE/$EXPECTED chunk(s), $SPENT call(s), $REMAINING left)"
        fi
        # Re-extract so the claims actually carry the attribution the map
        # just established. Same $0 policy as every other model call here.
        reextrae_con_mapa "$mid"
      else
        # Quota, or a session whose chunks would not transcribe. Either way the
        # map is absent rather than wrong, and absent means no attribution.
        log "warn: speaker map failed for $mid — claims stay unattributed (see the map's failedChunks)"
        break
      fi
    done <<< "$MAP_TARGETS"
    log "speaker maps built this run: $MAPPED"
  else
    log "speaker-map backlog: none — every transcript has a map"
  fi
else
  log "speaker-map step skipped ($([ -z "${GEMINI_API_KEY:-}" ] && echo "no GEMINI_API_KEY" || echo "call budget 0")) — claims will carry speakerGroup:null"
fi

# ---- re-extracciones pendientes de otras pasadas ----------------------
# Las que quedaron EN ESPERA con su mapa ya hecho (ver `reextrae_con_mapa`). Con
# el mismo tope y no en veda; las que esta pasada ya trató no se repiten.
if [ -z "$VEDA" ] && [ -s "$PENDIENTES" ]; then
  log "re-extracciones pendientes de otras pasadas: $(grep -c . "$PENDIENTES" || true)"
  for mid in $(cat "$PENDIENTES"); do
    case "$HECHAS_EN_LA_PASADA" in *" $mid "*) continue ;; esac
    if [ ! -f "pleno-speaker-map/$mid.json" ]; then
      log "· $mid apuntada como pendiente pero sin mapa en disco — se quita de la lista"
      quita_pendiente "$mid"; continue
    fi
    reextrae_con_mapa "$mid"
  done
fi

# ---- re-verify only if new claims landed (overlay-safe) ---------------
VERIFY_FALLO=""
# La puerta cuenta EXTRACCIONES, de las dos ramas, porque es lo que mueve los
# claims. Una transcripción cuya extracción falló no ha cambiado nada que
# verificar ni nada que sellar.
EXTRACTIONS=$((EXTRACTED + REEXTRACTED))
if [ "$EXTRACTIONS" -gt 0 ]; then
  log "re-verifying claims ($EXTRACTED extracted · $REEXTRACTED re-extracted) — overlay-safe…"
  # Un verify que falla NO tumba la noche. Sale con error cuando su
  # recomposición aborta, y sus guardas abortan ANTES de tocar lo publicado
  # (salvo los trozos, que lo dice él mismo). Hasta el 04-10-2026 salía 0 en
  # ese caso; con `set -e` y el código diciendo la verdad, la pasada moría aquí
  # y dejaba sin comitear las transcripciones y la extracción de la noche.
  # Seguir no publica nada nuevo: lo que no puede pasar es que la última línea
  # se lea como una noche limpia.
  if ! npm run verify:pleno-claims; then
    VERIFY_FALLO=1
    log "FALLO: verify:pleno-claims — lo publicado NO se recompuso (el motivo, arriba)." \
      "Lo extraído se comitea igual; recomponer lo decide una persona"
  fi
  # EL SELLO, y aquí porque `EXTRACTIONS` cuenta las extracciones que
  # terminaron bien vengan de donde vengan.
  #
  # Vivía dentro de la rama del mapa de voces: sólo se sellaba si aparecía un
  # mapa NUEVO **y** la re-extracción posterior iba bien. Una extracción normal
  # —la del bucle de transcripción, el caso corriente— hacía el trabajo y no
  # sellaba nada, así que un nodo que sólo necesita su PRIMER sello no lo
  # recibía nunca.
  # `pleno-claims-suggestions.json` llevaba meses en el parte de `refresh` por
  # eso, y su motivo no era «una entrada se movió» sino `no-builtFrom`.
  #
  # Sigue sin sellar cuando no hubo trabajo, que es el contrato entero: el sello
  # lo pone quien lo hizo, y una pasada sin extracciones no ha hecho nada que
  # sellar.
  npm run --silent refresh -- --stamp pleno-claims-suggestions.json \
    || log "warn: no se pudo sellar pleno-claims-suggestions.json (el nodo seguirá viejo en el parte)"
else
  log "no new extractions — skipping verify"
fi

# ---- refresh the agent semantic corpus (incremental, best-effort) -----
# Transcript chunks + press headlines → .embed-cache/agent-corpus.jsonl
# (gitignored, local to this Mac — exactly where the journalist agent
# runs). Sha-keyed incremental: a no-change night embeds nothing and
# costs nothing; a new transcript adds ~200 chunks (~fractions of a
# cent). EMBED_BACKEND is PINNED to openai to block an accidental
# ollama fallback (mixed dims = junk ranking). Since 2026-07-31 the
# embed client auto-falls openai→gemini on insufficient_quota (latch),
# and the corpus script probes the active dimensionality first and
# FULL-REBUILDS the cache on a dim change — so a quota-dead OpenAI key
# no longer strands semantic search, and dims can never mix. No key /
# API down → warn only; the agent degrades to lexical-only search.
log "embed:agent-corpus (incremental, openai-pinned)…"
EMBED_BACKEND=openai npm run embed:agent-corpus \
  || log "warn: embed:agent-corpus non-zero — semantic corpus stale; agent falls back to lexical"
# The verifier corpus rides the same Mon + Thu slot (same latch/marker/pacing
# machinery): best-effort — the verifier's hybrid shortlist degrades to
# lexical when stale, never crashes.
log "embed:verifier-corpus (incremental, openai-pinned)…"
EMBED_BACKEND=openai npm run embed:verifier-corpus \
  || log "warn: embed:verifier-corpus non-zero — verifier shortlist falls back to lexical"

# ---- sin auto-curación (retirada el 22-11-2026) ------------------------
# Aquí corría `npm run auto-curate -- --max 5`. Se quitó por la decisión 4.1 del
# plan de plenos (editorial/flujo-plenos-2026-11-20/plan.md):
#   · Desde el 02-08-2026 no podía publicar: decideAutomation exige una
#     precisión medida, y la de `publish-finding` (48 de 52, cota inferior de
#     Wilson 0,818) no llega al 0,90 de lo informativo. Esa medida, además, ya
#     pasó de los 90 días y nunca cubrió la fidelidad de la paráfrasis.
#   · Sólo dejaba borradores en editorial/auto-curation-queue-pending-measurement.json,
#     y esa cola estaba vacía desde el 18-08-2026.
# Un hallazgo nuevo lo escribe y lo firma una persona. El borrador sigue a mano:
#   npm run auto-curate -- --dry-run --max 5
# Se vuelve a enchufar sólo si una muestra juzgada por personas de al menos 150
# hallazgos, paráfrasis incluida, da 7 defectos o menos (143/150 → 0,907).

# ---- provenance of every published verbatim ---------------------------
# A newly promoted finding quotes the transcript that is current TODAY, and a
# session re-transcribed above turns yesterday's quotes into quotes of a text
# that no longer exists. Both change what /hallazgos must mark, so the derived
# snapshot is regenerated here, in the same run, before the commit — otherwise
# the page would carry a marker (or no marker) about a state of the world that
# ended thirty seconds ago. It reads four snapshots and writes a fifth; it never
# touches pleno-findings.json.
#
# It runs AFTER the verify step above on purpose: the second axis of that
# snapshot is what the editorial gate would do with each quote's claim, read
# from base ⊕ overlay. Re-judging a claim moves its mark, so deriving before the
# verifier would publish yesterday's answer about today's accusations.
npm run compute:finding-quote-provenance \
  || log "warn: compute:finding-quote-provenance non-zero — /hallazgos puede quedar con marcas viejas"

# ---- published attributions vs the speaker maps (DRY, never applies) --
# Compares every published `speakerGroup` against the map for its session and
# reports the split: agrees / contradicted / additive / unknown.
#
# DRY, and only dry. `--apply` retracts, and retraction is the one direction
# automation is allowed to move an attribution — but it is not run here, because
# the sweep has barely started and the interesting sessions have no map yet.
# Measured 2026-08-15: 134 published quotes across 11 sessions, and all 11
# report `no-map`. Nothing to decide, and the CLI says so in those words rather
# than printing an all-clear.
#
# It is wired now, at zero cost, for two reasons: a `contradicted` row is worth
# hearing about the night it appears rather than in three weeks, and this was
# otherwise another thing that had been built, tested and invoked by nobody —
# which is the failure this repo keeps re-finding.
#
# Outside the TEXT_BACKEND guard: the dry pass reads snapshots and calls no
# model. Only `--apply` shells out to `correct-pleno-finding`.
#
# Writes `editorial/attribution-queue.json` — gitignored, and NEVER under
# `public/`: Vercel serves that whole directory, and this queue pairs transcript
# passages with attributions about named councillors.
npm run reconcile:attribution --silent \
  || log "warn: reconcile:attribution non-zero — la cola de atribución no se ha regenerado"

# ---- IFCN weekly-cadence check (informational, never fatal) -----------
# The IFCN signatory track requires ≥1 published finding per ISO week.
npm run ifcn:cadence --silent -- --strict \
  || log "warn: IFCN cadence gap — no finding published this ISO week yet; promote one manually"

# ---- rederivar lo que dependa de lo raspado ---------------------------
# `scrape:pleno-agendas`, arriba, REESCRIBE plenos-agendas.json entero — y ese
# fichero lo escriben tres pasos: el raspado, `compute:dept-stats`
# (`plazosVencidosCount`, `deptCoverage`) y `refresh` (`builtFrom`). Raspar sin
# rederivar dejaba el fichero pelado y este cron lo comiteaba: cinco días
# seguidos medidos, con la nocturna de CI publicándolo completo hacia las 05:20
# y esta tubería dejándolo sin esas claves a las 11:1x. Los dos consumidores
# hacen `?? 0` y luego `> 0`, así que el aviso de compromisos vencidos
# desaparecía de la portada y del tícker sin que nada se pusiera rojo.
#
# Va aquí, después de TODO el trabajo de datos y antes del commit, para que las
# derivaciones describan el estado final y no uno intermedio. Es
# dependency-driven: no hay lista que mantener.
# `--rebuilt-paths` escribe por stdout SÓLO lo que esta pasada reconstruyó, para
# añadirlo al pathspec de abajo. Sin eso, esta tubería comitea la ENTRADA de un
# derivado y deja fuera el derivado que acaba de rederivar: `main` incumple
# entonces `tests/data-graph-frescura.test.ts` hasta la nocturna, y la CI de
# cualquier PR que construya en esa ventana sale roja por ello. Medido el
# 16-09-2026: ochenta minutos en rojo y una PR ajena caída dentro.
REDERIVADOS="$(cron_rutas_rederivadas)" \
  || log "warn: refresh falló — puede comitearse un derivado sin rederivar (lo caza tests/data-graph-frescura.test.ts)"

# ---- commit + push the regenerated data -------------------------------
# ONE pathspec stages, gates and commits. Everything the pipeline touches under
# public/data, minus the two files owned by the OTHER crons (quejas per-minute ·
# promises weekly) — carried by ':(exclude)' rather than the old `git add` +
# `git reset` pair, so those two are never even staged and a run of this cron
# can no longer unstage work an operator had staged in them.
#
# The old guard was `git diff --cached --quiet` over the WHOLE index, and the
# old `git commit` had no pathspec at all: with anything else staged the guard
# said "there is work to do" and the commit swept it in (that is how f182c61
# published a subagent's in-flight test files).
#
# `pleno-speaker-map` is in here because the maps live at the repo ROOT — never
# under `public/`, since Vercel serves that whole directory and these rows name
# living people — and so fell outside a `public/data` pathspec entirely. Every
# map in git was committed by hand; no cron had ever committed one. With a
# ~24-night sweep ahead that is two failures: a night whose only work is a map
# sees no change under public/data and exits by "nothing changed", leaving the
# map loose in the working tree for the next run's `pull --rebase --autostash`
# to shuffle; and a healthy night commits the re-extracted corpus carrying
# attribution that map established, without the map. Irreproducible either way.
# shellcheck disable=SC2086  # deliberado: REDERIVADOS es una lista de rutas
if ! cron_git_stage_and_check public/data pleno-speaker-map $REDERIVADOS \
       ':(exclude)public/data/quejas.json' \
       ':(exclude)public/data/promises.json'; then
  log "nothing changed — done (no commit)"; exit 0
fi

NEW_FINDINGS=$(git diff HEAD -- public/data/pleno-findings.json | grep -cE '^\+ +"id": "f-' || true)
cron_git_commit_pathspec "$(cat <<EOF
data: /hallazgos pipeline · ${TRANSCRIBED} pleno(s) transcribed · ${EXTRACTED} extracted · ${MAPPED} speaker map(s) · ${REEXTRACTED} re-extracted · ${NEW_FINDINGS} new finding(s)

Automated by scripts/hallazgos-pipeline.sh (launchd, Mon + Thu).
transcribe(${WHISPER_ENGINE}) → extract(${LLM_BACKEND}/${CLAUDE_CODE_MODEL:-$AGY_MODEL}) → verify(overlay-safe).
No finding is written here: a person writes and signs each one.
EOF
)"

# push with one pull-rebase retry (races the per-minute quejas cron)
if ! git push origin main; then
  log "push rejected — pull-rebase + retry"
  cron_git_pull_rebase "pull-rebase de reintento tras push rechazado"
  # El rebase trae el trabajo de OTRO cron, y ese trabajo puede haber movido la
  # entrada de un nodo derivado: publicar sin volver a derivar deja `main`
  # incumpliendo su propia `tests/data-graph-frescura.test.ts`. Le pasó a
  # `94359907` el 16-09-2026, que rebaseó sobre la instantánea de quejas y
  # publicó dos nodos rancios. La PR #46 cerró este agujero para el commit
  # normal y lo dejó abierto justo aquí.
  REDERIVADOS_REBASE="$(cron_rutas_rederivadas)"
  if [ -n "$REDERIVADOS_REBASE" ]; then
    # shellcheck disable=SC2086  # deliberado: es una lista de rutas
    if cron_git_stage_and_check $REDERIVADOS_REBASE; then
      cron_git_commit_pathspec "chore(datos): rederivado tras el rebase" || true
    fi
    log "rederivado tras el rebase:$REDERIVADOS_REBASE"
  else
    log "rederivado tras el rebase: nada que reconstruir"
  fi
  git push origin main
fi

# ── the last line anybody reads ──────────────────────────────────────────────
#
# On 2026-08-11 this said `done · 0 transcribed · 0 new finding(s) pushed`, and
# every word of it was true. Underneath: the speaker map covered 7 of 17 chunks
# before Gemini's daily quota ran out, the circuit breaker short-circuited 144
# of 363 extraction windows, and 14 calls were refused outright by a backend.
# Three truthful lines that together read as a clean night.
#
# So the summary now asks the run's own manifest. `check:runs` already knows —
# it distinguishes "never attempted" from "attempted and failed", which is the
# whole point of rule 2 in docs/DATA_INTEGRITY.md — and it was reporting all of
# this the moment the run ended. Nothing was reading it.
#
# --soft so the verdict is FETCHED, never fatal: this runs after the push, and
# a degraded run whose data landed correctly must not exit non-zero and get
# retried. The word in the log is the deliverable.
RUN_VERDICT=""
if RUN_REPORT=$(npm run --silent check:runs -- --since 6 --soft 2>&1); then
  RUN_ERRORS=$(printf '%s\n' "$RUN_REPORT" | grep -c 'ERROR \[' || true)
  RUN_WARNS=$(printf '%s\n' "$RUN_REPORT" | grep -c 'WARN \[' || true)
  if [ "${RUN_ERRORS:-0}" -gt 0 ] || [ "${RUN_WARNS:-0}" -gt 0 ]; then
    RUN_VERDICT=" · DEGRADADO: ${RUN_ERRORS} error(es), ${RUN_WARNS} aviso(s) en el manifiesto"
  fi
fi
[ "${PARTIAL_MAPS:-0}" -gt 0 ] && RUN_VERDICT="${RUN_VERDICT} · ${PARTIAL_MAPS} mapa(s) parcial(es)"
[ -n "${VERIFY_FALLO:-}" ] &&
  RUN_VERDICT="${RUN_VERDICT} · verify:pleno-claims FALLÓ: lo publicado no se recompuso (el motivo, en el log)"
# Una pasada que corrió media tubería no puede firmar la línea de una completa.
[ "$TEXT_BACKEND" != ok ] &&
  RUN_VERDICT="${RUN_VERDICT} · DEGRADADA: sin backend de texto (extracción y auto-curación en espera) — claude: ${TEXT_BACKEND_MOTIVO}"

log "done · ${TRANSCRIBED} transcribed · ${EXTRACTED} extracted (${RECUPERADAS} recuperada(s)) · ${MAPPED} speaker map(s) · ${REEXTRACTED} re-extracted · ${NEW_FINDINGS} new finding(s) pushed${RUN_VERDICT}"
if [ -n "$RUN_VERDICT" ]; then
  log "   la pasada NO fue limpia — \`npm run check:runs\` lo detalla:"
  # `|| true` no es decorativo. El veredicto también lo ponen un mapa parcial, el
  # backend de texto caído o un verify fallido, con un parte que puede no traer
  # ni un hallazgo: el grep no encuentra nada, sale 1, y con `pipefail` y `-e`
  # esta línea sacaba la pasada entera con 1, ya publicada. Medido el 04-10-2026.
  printf '%s\n' "$RUN_REPORT" | grep -E '^\s+(ERROR|WARN) \[' | sed 's/^/   /' || true
fi
