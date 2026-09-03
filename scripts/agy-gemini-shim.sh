#!/usr/bin/env bash
# Shim: lets the LLM client's "gemini" backend drive the Antigravity CLI (agy)
# instead of the (auth-dead) gemini CLI. Translates the gemini-cli invocation
#   gemini -p <prompt> -m <model> -o json --yolo
# into
#   agy -p <prompt> --model <model>
# and re-emits agy's plain-text answer inside the gemini `-o json` envelope
# ({"response": "..."}) that client.ts expects to parse.
#
# ⚠️  MUERTO: nada lo referencia. Nació en 75a3eb50 cuando GEMINI_BIN podía
#     apuntar aquí; con el CLI de gemini retirado de la cascada, nadie lo hace.
#     Se mantiene su modelo al día por consistencia, no porque se use.
#
#     SI ALGUIEN LO RE-ENCHUFA: le falta `--sandbox`, que `src/llm/client.ts`
#     (callAgy) documenta como requisito de seguridad. Reintroducirlo por aquí
#     sería una regresión, no sólo una cadena obsoleta. Lo más probable es que
#     este fichero deba borrarse.
set -euo pipefail

prompt=""
model="gemini-3.8-flash-medium"
while [ $# -gt 0 ]; do
  case "$1" in
    -p | --prompt | --print)
      prompt="$2"
      shift 2
      ;;
    -m | --model)
      model="$2"
      shift 2
      ;;
    -o)
      shift 2
      ;; # ignore output-format flag
    --yolo)
      shift
      ;; # ignore
    *)
      shift
      ;;
  esac
done

# agy answer → stdout; logs → discarded. --print-timeout guards a hung call.
answer="$(agy -p "$prompt" --model "$model" --print-timeout 4m 2>/dev/null)"

# Wrap in the gemini -o json envelope (node handles JSON escaping safely).
node -e 'process.stdout.write(JSON.stringify({ response: process.argv[1] ?? "" }))' "$answer"
