#!/usr/bin/env bash
#
# Ejecuta una instalación que pasa por apt con un tope de tiempo y, si lo agota,
# lo dice con su nombre.
#
# EL FALLO, medido el 2026-10-26 en la ejecución 40305149332 (#431): el espejo
# de Ubuntu del runner sirvió los paquetes a 13,6 kB/s de media: 3 de los 17 se
# atascaron 3 min 1 s, 5 min 7 s y 3 min 5 s antes de reintentarse. El paso que
# instala las dependencias de Chromium tardó 1.044 s en vez de ~20 (1.035 de
# ellos, `npx playwright install-deps chromium`; el saneador de fuentes, 9). Se
# comió el presupuesto entero del trabajo: a las pruebas de unidad les quedaron
# 96 s, el trabajo se canceló a los 20 min y el PR quedó en rojo con el código
# bien. Al relanzarlo pasó.
#
# POR QUÉ UN GUION Y NO SÓLO `timeout-minutes` EN EL PASO. El tope del paso
# corta igual, pero sale como «The action has timed out», que no dice qué
# esperar ni qué hacer. Aquí el corte deja una anotación que lo nombra: es el
# espejo de apt, no el código, y basta con relanzar el trabajo. El
# `timeout-minutes` del paso se queda de respaldo por si apt no muere con la
# señal.
#
# Los desenlaces se dicen por separado: terminó (el código del mandato, sea
# cual sea) / agotó el tope (124, o 137 si hubo que matarlo). Un fallo de
# verdad de apt NO se disfraza de lentitud: sale con su propio código y su
# propio mensaje.
#
#   bash scripts/ci-apt-con-tope.sh npx playwright install-deps chromium
#
# CI_APT_TOPE cambia el tope (sintaxis de `timeout`: 300, 5m…); sólo lo usan
# las pruebas.
set -uo pipefail

TOPE="${CI_APT_TOPE:-5m}"

if [ "$#" -eq 0 ]; then
  echo "[ci-apt] uso: $0 <mandato> [argumentos…]" >&2
  exit 2
fi

# `timeout` es de coreutils: está en el runner de Ubuntu, no en un Mac. Sin él
# no hay tope, y ejecutar el mandato sin tope sería mentir sobre lo que hace
# este guion.
if ! command -v timeout >/dev/null 2>&1; then
  echo "[ci-apt] falta \`timeout\` (coreutils): este guion es para el runner de CI" >&2
  exit 2
fi

# -k: si apt no sale con SIGTERM, SIGKILL a los 30 s. `timeout` señala a todo
# su grupo de procesos, así que llega también a node y a sudo, que la reenvía.
timeout -k 30s "$TOPE" "$@"
rc=$?

if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
  echo "::error title=apt no terminó en ${TOPE}::«$*» no terminó en ${TOPE} (lo sano son ~20 s). Es el espejo de apt del runner, no el código: relanza el trabajo con «Re-run failed jobs»."
  echo "[ci-apt] tope de ${TOPE} agotado (código ${rc})" >&2
fi

exit "$rc"
