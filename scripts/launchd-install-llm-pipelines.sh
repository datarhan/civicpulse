#!/usr/bin/env bash
# Install (or remove) as launchd USER agents the jobs that need the model.
#
#   bash scripts/launchd-install-llm-pipelines.sh            # install + load
#   bash scripts/launchd-install-llm-pipelines.sh uninstall  # unload + remove
#   bash scripts/launchd-install-llm-pipelines.sh probe      # can an agent do the job?
#
# ## Why these three are agents and the rest stay in cron
#
# Only these need the `claude` credential, and it lives in the login
# keychain. A cron job cannot unlock it: `env -i … claude -p ok` exits 1 with
# "Not logged in". That is what stopped both pipelines from 2026-08-03 —
# `hallazgos` deferred every morning, `press-lab` no-opped its LLM steps — for
# nine days, while `monitor:health` reported no problems because it measured
# source freshness and the deterministic scrapers kept running.
#
# A launchd user agent runs inside the Aqua session and can open the keychain.
# What it could NOT do, until 2026-08-11, was read a checkout under
# ~/Documents: TCC denied it, WorkingDirectory silently failed to take, and the
# agent died with the exit 78 that pushed these pipelines to cron in the first
# place. Moving the repo to ~/dev removed that half. Both are now satisfied —
# `probe` below is how you re-establish that after any OS or login change,
# rather than inferring it from a pipeline log the next morning.
#
# ## Cuáles necesitan credencial, corregido dos veces
#
# Esta cabecera decía: «`auto-curate-promises`, `scrape-ci-blocked` and
# `monitor-health` stay in cron: they are deterministic, touch no credential».
# De los tres, DOS eran falsos, y los dos costaron caro:
#
#   · `auto-curate-promises` llama al modelo de frente. Falló 49 mañanas
#     seguidas con «Not logged in» —desde el 2026-07-08— y dejó /departamentos
#     anclada en el 6 de julio. Movido a su propio agente (08:30) el 2026-08-26.
#   · `scrape-ci-blocked` sí es determinista… hasta el `git push` del final. El
#     gancho de pre-push lee las rutas tocadas CON EL MODELO, así que desde cron
#     empujaba diciendo «SIN REVISAR: ningún backend respondió» de todas ellas.
#     El raspado no necesitaba credencial; publicarlo, sí. Agente desde el
#     2026-08-26.
#   · `monitor-health` sigue en cron, y esta vez de verdad: ni llama al modelo
#     ni empuja, sólo manda el parte. Cero fallos de login en su log.
#
# La regla, escrita para que no vuelva a aplicarse mal: agente para lo que
# necesita credencial, cron para lo determinista — contando que **empujar
# arrastra el gancho, y el gancho necesita credencial**. Mirar sólo lo que el
# script llama es lo que falló las dos veces.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
AGENTS="$HOME/Library/LaunchAgents"
LABELS=(com.civicpulse.hallazgos com.civicpulse.press-lab com.civicpulse.review-sweep
        com.civicpulse.scrape-ci-blocked)

mkdir -p "$AGENTS" "$REPO_DIR/scripts/logs"

case "${1:-install}" in
  uninstall)
    for label in "${LABELS[@]}"; do
      dest="$AGENTS/${label}.plist"
      if [ -f "$dest" ]; then
        launchctl unload "$dest" 2>/dev/null || true
        rm -f "$dest"
        echo "[launchd] desinstalado $label"
      else
        echo "[launchd] $label no estaba instalado"
      fi
    done
    echo
    echo "Los pipelines ya no corren solos. Para volver a cron necesitarías"
    echo "resolver el llavero de otra forma — ver la cabecera de este script."
    exit 0
    ;;

  probe)
    # The two facts an agent needs, checked from THIS shell. Not conclusive on
    # its own — an interactive shell has the keychain and cron does not, which
    # is the whole confusion — but it catches the boring failures (claude not
    # on PATH, repo moved) before you blame launchd.
    echo "[probe] repo:     $REPO_DIR"
    if [ -r "$REPO_DIR/package.json" ]; then echo "[probe] lectura:  OK"; else echo "[probe] lectura:  DENEGADA"; fi
    case "$REPO_DIR" in
      "$HOME"/Documents/*|"$HOME"/Desktop/*|"$HOME"/Downloads/*)
        echo "[probe] AVISO: el repo está bajo un directorio que protege TCC."
        echo "        Un agente launchd no podrá leerlo (exit 78). Muévelo a ~/dev."
        ;;
      *) echo "[probe] TCC:      fuera de Documents/Desktop/Downloads ✓" ;;
    esac
    if security find-generic-password -s "Claude Code-credentials" -w >/dev/null 2>&1; then
      echo "[probe] llavero:  OK"
    else
      echo "[probe] llavero:  no se encuentra la credencial de Claude Code"
    fi
    if command -v claude >/dev/null 2>&1; then
      echo "[probe] claude:   $(command -v claude)"
    else
      echo "[probe] claude:   NO está en el PATH"
    fi
    exit 0
    ;;

  install) ;;
  *) echo "uso: $0 [install|uninstall|probe]" >&2; exit 2 ;;
esac

case "$REPO_DIR" in
  "$HOME"/Documents/*|"$HOME"/Desktop/*|"$HOME"/Downloads/*)
    echo "[launchd] ABORTA: el repo está en $REPO_DIR, bajo un directorio protegido por TCC." >&2
    echo "          Un agente launchd no podrá leerlo y morirá con exit 78 cada mañana," >&2
    echo "          en silencio. Mueve el checkout fuera (p. ej. ~/dev) y reintenta." >&2
    exit 1
    ;;
esac

for label in "${LABELS[@]}"; do
  src="$REPO_DIR/scripts/${label}.plist"
  dest="$AGENTS/${label}.plist"
  [ -f "$src" ] || { echo "[launchd] falta $src" >&2; exit 1; }

  # Re-installs are routine after editing a plist.
  if [ -f "$dest" ]; then
    launchctl unload "$dest" 2>/dev/null || true
    rm -f "$dest"
  fi
  cp "$src" "$dest"
  launchctl load "$dest"
  echo "[launchd] instalado $label"
done

echo
echo "Horario: scrape-ci-blocked 06:45 · review-sweep 07:30 · hallazgos 09:30 ·"
echo "         press-lab 10:15, a diario. (auto-curate-promises 08:30 se instala"
echo "         aparte, con launchd-install-auto-curate-promises.sh.)"
echo
echo "QUITA las líneas equivalentes del crontab o correrán las dos cosas:"
echo "  crontab -e   # borrar hallazgos-pipeline.sh, press-lab-pipeline.sh,"
echo "               # review-sweep.sh y scrape-ci-blocked.sh"
echo
echo "Comprobar mañana:  npm run check:runs   (sale 1 si la nocturna no corrió)"
