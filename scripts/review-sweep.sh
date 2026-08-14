#!/usr/bin/env bash
# Leer TODAS las páginas públicas como las leería un vecino, cada mañana.
#
# La revisión de superficies es el único control de este repositorio que
# responde «¿la página dice algo verdadero?» en lugar de «¿el dato cuadra?».
# Las dos preguntas divergen: los cuatro defectos corregidos el 2026-08-12
# —«la mayoría» sobre 40 de 41 fichas, «alguien promovió la ficha» sobre 19
# firmadas por una máquina, «obra registrada» sobre un contrato de suministro,
# «cinco años» sobre un congelado de seis— tenían TODOS su dato bien y su frase
# mal, y ninguna comprobación determinista podía verlos.
#
# Hasta ahora sólo corría en el gancho de pre-push, y ahí faltaban dos cosas:
# los ganchos de git NO corren en GitHub Actions —así que el nightly commitea
# datos frescos cada madrugada y nadie lee esas páginas, que es justo donde las
# cifras se mueven— y el gancho, por diseño, sólo mira las rutas que toca el
# push.
#
# Vive aquí y no en un workflow por el mismo motivo que scrape-ci-blocked.sh:
# hace lo que CI NO PUEDE. Allí porque la WAF del ayuntamiento blackholea los
# rangos de GitHub; aquí porque en Actions no hay backend LLM y el único de $0
# es el claude-code de este portátil.
#
# REPORT-ONLY: no commitea, no escribe prosa, no bloquea nada. Un señalamiento
# es una pista para una persona, como todo lo que toca un modelo en este repo.
# Quien lo entrega es `check:surfaces` a través del digest de monitor:health.
#
# Instalación (DESDE Terminal.app — escribir el crontab está bloqueado por TCC
# en shells no interactivos y CUELGA sin decir nada):
#   bash scripts/cron-install-review-sweep.sh
#
# A mano:
#   bash scripts/review-sweep.sh
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
REPO_DIR="$(pwd -P)"
mkdir -p scripts/logs
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

log() { echo "[review-sweep] $(date '+%F %T') $*"; }

# shellcheck source=scripts/lib/cron-git.sh
. "$REPO_DIR/scripts/lib/cron-git.sh"
# No commitea nada, pero SÍ construye y lee el sitio: en otra rama estaría
# leyendo unas páginas y dando el parte como si fueran las publicadas.
cron_require_main "review-sweep"

if [ -f .env ]; then set -a; . ./.env; set +a; fi

# ── El backend, y la regla de no gastar ────────────────────────────────────
# claude-code sobre el plan Max = $0. Si no responde —cuota o auth—, se DIFIERE
# la pasada. Nunca se cae a un backend de pago: es la misma regla que
# hallazgos-pipeline.sh, y el motivo por el que `agy` salió de esta cadena (su
# cuota diaria se agota, `agy -p` sale 0 con stdout VACÍO y el envoltorio
# terminaba facturando en openai sin que nadie lo pidiera).
export LLM_BACKEND=claude-code
CLAUDE_MODEL="${CLAUDE_CODE_MODEL:-claude-sonnet-5}"
if ! command -v claude >/dev/null 2>&1; then
  log "claude CLI ausente — barrido DIFERIDO (diferido ≠ limpio)"
  exit 0
fi
if ! claude -p "ok" --strict-mcp-config --model "$CLAUDE_MODEL" >/dev/null 2>&1; then
  log "claude-code no responde (cuota o auth) — barrido DIFERIDO en vez de gastar en un backend de pago"
  exit 0
fi

# ── La build, CON las banderas de lanzamiento ──────────────────────────────
# Sin ellas /eficiencia y /gestion no se montan, App.jsx manda cualquier ruta
# desconocida a `/`, y la revisión leería la PORTADA creyendo leer la ruta
# pedida. El gancho de pre-push llevaba desde su primer commit haciendo eso
# (arreglado en ff65bad). `review-surfaces` además compara dónde aterriza con
# lo que pidió y lo canta como NO MONTADA, así que son dos capas.
log "construyendo con las banderas de lanzamiento…"
if ! VITE_ENABLE_PERIODISTAS=true VITE_ENABLE_EFICIENCIA=true npm run build >/dev/null 2>&1; then
  log "la build falló — barrido OMITIDO (omitido ≠ limpio)"
  exit 0
fi

# ── Preview en SU puerto ───────────────────────────────────────────────────
# Nunca el 4173 donde un desarrollador tiene el suyo: con --strictPort este
# moriría al nacer y la revisión leería la build ajena sin que nadie lo dijera.
PORT=4189
while [ "$PORT" -lt 4210 ] && curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/"; do
  PORT=$((PORT + 1))
done
# ── El preview, y un vigilante que lo resucita ─────────────────────────────
# El 2026-08-14 este preview se murió (SIGTERM; sigo sin saber de quién) a los
# diecinueve minutos de lectura. El lector se encontró la sexta ruta con la
# conexión rechazada y la pasada terminó ahí: veintiséis páginas sin leer.
#
# El lector ya sabe sobrevivir a eso y contarlo —ése es el arreglo de fondo, en
# review-surfaces.ts—, pero contarlo bien sigue siendo una mañana perdida. Con
# un vigilante que lo relance, una muerte cuesta UNA ruta en vez de la pasada.
#
# El PID vive en un fichero y no en una variable porque el vigilante corre en
# un subshell: un `PREVIEW=$!` suyo no vuelve al padre, así que el `cleanup` de
# aquí mataría un PID viejo y dejaría suelto el preview resucitado.
PIDFILE="$(mktemp -t review-sweep-preview)"
RELANZFILE="$(mktemp -t review-sweep-relanz)"
# La salida del lector se guarda además de imprimirse, para poder decir al final
# QUÉ pasó en vez de repetir el mismo renglón pase lo que pase.
SALIDA="$(mktemp -t review-sweep-salida)"
echo 0 > "$RELANZFILE"

arrancar_preview() {
  npx vite preview --host 127.0.0.1 --port "$PORT" --strictPort >/dev/null 2>&1 &
  echo $! > "$PIDFILE"
}
arrancar_preview

vigilar_preview() {
  while :; do
    sleep 10
    local pid
    pid="$(cat "$PIDFILE" 2>/dev/null)"
    # `kill -0` pregunta «¿sigue vivo?» sin mandarle nada.
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      local n
      n=$(( $(cat "$RELANZFILE" 2>/dev/null || echo 0) + 1 ))
      echo "$n" > "$RELANZFILE"
      # Se registra cada vez. Un preview que resucita cuatro veces por noche es
      # un dato sobre esta máquina que hoy no tengo, y sólo aparece si alguien
      # lo escribe.
      log "el preview de :$PORT ha muerto — relanzando (nº $n)"
      arrancar_preview
    fi
  done
}
vigilar_preview &
VIGILANTE=$!

cleanup() {
  [ -n "${VIGILANTE:-}" ] && kill "$VIGILANTE" 2>/dev/null
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null)"
  [ -n "$pid" ] && kill "$pid" 2>/dev/null
  rm -f "$PIDFILE" "$RELANZFILE" "$SALIDA"
  :
}
trap 'cleanup' EXIT

# Sondear, no dormir: un preview que no levanta renderiza todas las páginas
# vacías, y eso es una pasada que no revisó nada, no un sitio limpio.
READY=""
TRIES=0
while [ "$TRIES" -lt 60 ]; do
  curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/" && { READY=1; break; }
  sleep 0.25
  TRIES=$((TRIES + 1))
done
if [ -z "$READY" ]; then
  log "el preview no levantó en :$PORT — barrido OMITIDO (omitido ≠ limpio)"
  exit 0
fi

# ── La lectura ─────────────────────────────────────────────────────────────
# Sin presupuesto: es la pasada completa y tiene toda la madrugada. La caché por
# contenido hace que a partir de la primera sólo se paguen las páginas que
# cambiaron, que casi siempre son dos o tres.
log "leyendo todas las rutas públicas (--all, sin presupuesto)…"
env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY \
    GEMINI_BIN=/nonexistent-disabled AGY_BIN=/nonexistent-disabled \
    LLM_CONCURRENCY=1 \
    REVIEW_BASE_URL="http://127.0.0.1:$PORT" \
    npm run --silent review:surfaces -- --all 2>&1 | tee "$SALIDA"
RESULTADO=${PIPESTATUS[0]}

# El código de salida de review:surfaces es ≠ 0 cuando HAY señalamientos, y eso
# aquí no es un fallo del barrido: es su producto. Se registra y se sale 0 —
# nada de esto puede tumbar un cron ni una máquina.
#
# Pero «salió 1» a secas era indistinguible de lo que pasó el 2026-08-14, que
# fue morirse en la ruta 6 de 27. Un renglón final que dice lo mismo en los dos
# casos es el mismo defecto que docs/DATA_INTEGRITY.md llama nº2: una pasada
# tiene que demostrar qué hizo. Así que el desenlace se dice, y se dice a partir
# de lo que el lector imprimió, no de una suposición.
RELANZ="$(cat "$RELANZFILE" 2>/dev/null || echo 0)"
NOTA_RELANZ=""
[ "${RELANZ:-0}" -gt 0 ] && NOTA_RELANZ=" · el preview hubo que relanzarlo $RELANZ vez/veces"
if grep -q 'NO ALCANZADA(S): EL SERVIDOR' "$SALIDA" 2>/dev/null; then
  SIN_LEER="$(grep -c '^   NO ALCANZADA' "$SALIDA" 2>/dev/null || echo '?')"
  log "terminado INCOMPLETO: el servidor de preview dejó de responder y quedaron rutas sin leer" \
      "(review:surfaces salió $RESULTADO$NOTA_RELANZ) · la lista de rutas está más arriba en este log" \
      "· al menos $SIN_LEER intento(s) de navegación fallaron"
else
  log "terminado (review:surfaces salió $RESULTADO$NOTA_RELANZ) · el parte para el digest lo da: npm run check:surfaces"
fi
exit 0
