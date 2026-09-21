#!/usr/bin/env bash
# scripts/lib/claude-probe.sh — el preflight de claude-code, que CONSERVA el motivo.
#
#   . "$REPO_DIR/scripts/lib/claude-probe.sh"
#   if ! claude_probe "${CLAUDE_CODE_BIN:-claude}" "$CLAUDE_CODE_MODEL"; then
#     log "claude-code no responde — $CLAUDE_PROBE_MOTIVO"
#   fi
#
# Tres planificadores sondean a claude antes de trabajar (hallazgos-pipeline,
# press-lab-pipeline y review-sweep), y los tres hacían lo mismo con la
# respuesta: `>/dev/null 2>&1`. En el log quedaba una conjetura escrita a mano
# —«(quota or auth)», «(cuota o auth)» y, en press-lab, «Max login may have
# lapsed (run: claude, then /login)»—.
#
# El 18 y el 19 de septiembre de 2026 el CLI dijo exactamente qué pasaba:
#
#   You've hit your weekly limit · resets Sep 19 at 8pm (Europe/Madrid)
#
# y el sondeo lo tiró. Extracción, auto-curación y la transcripción del pleno
# del 7-sep se aplazaron dos mañanas, y lo que llegó al móvil fue
# «extract-pleno-claims: se espera cada 48h, última hace 49h»: ni causa ni
# remedio, cuando el remedio era NO HACER NADA hasta las ocho de la tarde. La
# frase sólo constaba en el log de otro agente, porque `src/llm/client.ts` la
# conserva desde el PR #22 (`describeClaudeFailure`).
#
# Es el mismo defecto por cuarta vez —el parte, el cliente LLM, el log del
# nocturno y éste—: el diagnóstico existe y se pierde por el camino. Y un aviso
# con el remedio equivocado es peor que ninguno: «then /login» manda a
# re-autenticar una sesión perfectamente autenticada, y el día que de verdad
# haya caducado dirá lo mismo.
#
# Dos decisiones, las dos medidas en producción:
#
#  · stdout Y stderr. El fallo del 22-ago vino con stderr VACÍO y el motivo en
#    stdout; «Not logged in» viene por stderr. No se prefiere ninguno.
#  · El ÚLTIMO renglón no vacío, y si hay que acortar se acorta por la CABEZA.
#    `client.ts` recortaba `slice(0, 400)` y la frase caía en el índice 1007:
#    inalcanzable por construcción. Lo informativo va al final.
#
# Sin tiempo límite propio, a propósito: es el comportamiento que había, y un
# límite nuevo aquí es un cambio aparte que merece su propia medida.

# El motivo del último sondeo fallido. Vacío si el último sondeo fue bien.
CLAUDE_PROBE_MOTIVO=""

# Cuánto motivo cabe en un renglón de log.
CLAUDE_PROBE_MAX=300

# claude_probe <binario> <modelo>
#   0   claude contestó
#   !=0 el código de claude, con el porqué en $CLAUDE_PROBE_MOTIVO
#
# Seguro bajo `set -euo pipefail`: el código se recoge con `&& … || …`, que es
# una lista condicional y no dispara `-e`.
claude_probe() {
  local bin="$1" modelo="$2"
  local salida="" rc=0 motivo=""
  CLAUDE_PROBE_MOTIVO=""

  salida="$("$bin" -p "ok" --strict-mcp-config --model "$modelo" 2>&1)" && rc=0 || rc=$?
  [ "$rc" -eq 0 ] && return 0

  # Último renglón con contenido, con los espacios colapsados.
  motivo="$(printf '%s\n' "$salida" | awk 'NF { l = $0 } END { print l }' | tr -s '[:space:]' ' ')"
  motivo="${motivo# }"
  motivo="${motivo% }"

  if [ -z "$motivo" ]; then
    # No saberlo se dice. «cuota o auth» era una suposición, y una suposición
    # impresa como diagnóstico es lo que este fichero viene a quitar.
    CLAUDE_PROBE_MOTIVO="sin salida (exit $rc)"
    return "$rc"
  fi

  # `${var: -N}` devuelve VACÍO si la cadena mide menos de N: de ahí la guarda.
  if [ "${#motivo}" -gt "$CLAUDE_PROBE_MAX" ]; then
    motivo="…${motivo: -$CLAUDE_PROBE_MAX}"
  fi
  CLAUDE_PROBE_MOTIVO="$motivo (exit $rc)"
  return "$rc"
}
