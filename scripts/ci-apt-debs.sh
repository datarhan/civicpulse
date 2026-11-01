#!/usr/bin/env bash
#
# Repone antes y guarda después los .deb que baja `playwright install-deps`,
# para que los sirva la caché de Actions y no el espejo de apt.
#
# EL FALLO, medido el 2026-10-26: el espejo de Ubuntu de los runners
# (azure.archive.ubuntu.com) sirvió los paquetes a entre 13,6 y ~45 kB/s todo
# el día e hizo caer cinco trabajos. En #431, todavía sin tope, la instalación
# tardó 1.044 s y el trabajo entero se agotó; después el tope de
# `scripts/ci-apt-con-tope.sh` la cortó tres veces en `unidad` de #435 y una
# en `playwright` de #436 (ejecución 40331307200). Lo que había que bajar era
# siempre lo mismo: 25,9 MB, el 81 % fuentes y el resto actualizaciones de
# paquetes ya instalados. `unidad` dejó de necesitarlo (#436); `playwright` lo
# necesita, porque la e2e pinta páginas con esas fuentes.
#
# Con los .deb repuestos en /var/cache/apt/archives, `apt-get install` los da
# por bajados si su versión y su hash casan con el índice, y sólo pide al
# espejo lo que haya cambiado. `apt-get update` sigue yendo al espejo, pero
# eso son los índices: 9 s el día del espejo lento.
#
#   bash scripts/ci-apt-debs.sh reponer   # antes de install-deps
#   bash scripts/ci-apt-debs.sh guardar   # después, para la caché
#
# Los desenlaces se dicen por separado: repuso N / no había caché / guardó N.
# Guardar CERO .deb tras una instalación es un aviso, no un silencio: querría
# decir que el runner ya no los deja en /var/cache/apt/archives y que la caché
# no está sirviendo de nada.
#
# CI_APT_DEBS y CI_APT_ARCHIVOS cambian los dos directorios y CI_APT_SUDO la
# orden de privilegio; sólo los usan las pruebas.
set -euo pipefail

DIR="${CI_APT_DEBS:-$HOME/.cache/apt-chromium}"
ARCHIVOS="${CI_APT_ARCHIVOS:-/var/cache/apt/archives}"
SUDO="${CI_APT_SUDO-sudo}"

contar() { find "$1" -maxdepth 1 -name '*.deb' | wc -l | tr -d ' '; }

case "${1:-}" in
  reponer)
    mkdir -p "$DIR"
    n=$(contar "$DIR")
    if [ "$n" -eq 0 ]; then
      echo "[ci-apt-debs] no había .deb en la caché: install-deps los baja del espejo"
      exit 0
    fi
    $SUDO find "$DIR" -maxdepth 1 -name '*.deb' -exec cp {} "$ARCHIVOS/" \;
    echo "[ci-apt-debs] repuestos $n .deb desde la caché ($(du -sh "$DIR" | cut -f1))"
    ;;
  guardar)
    # Fuera lo que ya no se puede instalar (versiones viejas), para que la
    # caché no crezca con cada actualización. No toca la red, y sólo sobre el
    # directorio de verdad: el de una prueba no es de apt.
    if [ "$ARCHIVOS" = /var/cache/apt/archives ]; then
      $SUDO apt-get autoclean -qq >/dev/null 2>&1 || true
    fi
    mkdir -p "$DIR"
    find "$DIR" -maxdepth 1 -name '*.deb' -delete
    find "$ARCHIVOS" -maxdepth 1 -name '*.deb' -exec cp {} "$DIR/" \;
    n=$(contar "$DIR")
    if [ "$n" -eq 0 ]; then
      echo "::warning title=caché de apt vacía::No quedó ningún .deb en $ARCHIVOS tras instalar: la caché de apt no sirve de nada y el espejo vuelve a mandarlo todo."
      exit 0
    fi
    echo "[ci-apt-debs] guardados $n .deb para la caché ($(du -sh "$DIR" | cut -f1))"
    ;;
  *)
    echo "[ci-apt-debs] uso: $0 reponer|guardar" >&2
    exit 2
    ;;
esac
