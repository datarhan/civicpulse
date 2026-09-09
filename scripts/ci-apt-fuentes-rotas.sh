#!/usr/bin/env bash
#
# Quita del runner la fuente apt de Google Chrome, que no usamos, antes de que
# `playwright install` intente instalar las dependencias de chromium.
#
# EL FALLO, medido el 2026-09-09: cuatro ejecuciones seguidas en rojo sin que
# ninguna prueba llegara a correr.
#
#   Run npx playwright install-deps chromium
#   E: Failed to fetch https://dl.google.com/linux/chrome-stable/deb/…/Packages.gz
#      Hash Sum mismatch
#   Failed to install browser dependencies · exit code 100
#
# `playwright install-deps` hace `apt-get update`, y apt sale en error EN BLOQUE
# si una sola fuente configurada sirve un índice cuyo hash no cuadra. La imagen
# del runner trae configurada la fuente de Google Chrome; las bibliotecas que
# chromium necesita salen de los repositorios de Ubuntu y no de ahí. Es decir:
# un proveedor al que no le pedimos nada dejaba el sitio sin poder desplegar.
#
# POR QUÉ QUITARLA Y NO TRAGARSE EL ERROR. `apt-get update || true` seguido de
# la instalación dejaría pasar también un fallo REAL de índice y lo convertiría
# en un error posterior e ilegible al arrancar el navegador. Aquí se retira la
# fuente que sobra y se comprueba que apt vuelve a funcionar; si no vuelve, esto
# falla en su propio paso y con su propio mensaje.
#
# Los tres desenlaces se dicen por separado, que es la regla de la casa: retirada
# / no había ninguna / apt sigue roto. «No había ninguna» es información —
# significa que la imagen del runner cambió y este script sobra—, no un fallo.
set -euo pipefail

PATRON='dl\.google\.com/linux/chrome'
DIR=/etc/apt/sources.list.d
retiradas=0

# Vale tanto para el formato clásico `.list` como para el `.sources` de deb822:
# se busca por la URL, no por el nombre del fichero, porque el nombre ha
# cambiado ya una vez entre imágenes y volvería a cambiar sin avisar.
if [ -d "$DIR" ]; then
  ficheros=$(grep -rlE "$PATRON" "$DIR" 2>/dev/null || true)
  if [ -n "$ficheros" ]; then
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      sudo rm -f "$f"
      echo "[ci-apt] retirada la fuente $f"
      retiradas=$((retiradas + 1))
    done <<<"$ficheros"
  fi
fi

# Y la misma línea puede estar suelta en el fichero principal.
if grep -qE "$PATRON" /etc/apt/sources.list 2>/dev/null; then
  sudo sed -i -E "\\#$PATRON#d" /etc/apt/sources.list
  echo "[ci-apt] retirada la línea de /etc/apt/sources.list"
  retiradas=$((retiradas + 1))
fi

if [ "$retiradas" -eq 0 ]; then
  echo "[ci-apt] no había ninguna fuente de Google Chrome configurada (imagen distinta: este paso ya no hace falta)"
else
  echo "[ci-apt] $retiradas fuente(s) de Google Chrome retirada(s)"
fi

# La prueba de que ha servido. Si apt sigue roto, que falle AQUÍ y con el
# motivo a la vista, en vez de salir más tarde como un «exit code: 100» dentro
# del envoltorio de playwright, que es lo que costó cuatro reintentos entender.
echo "[ci-apt] comprobando que apt-get update vuelve a funcionar…"
sudo apt-get update -qq
echo "[ci-apt] apt-get update correcto"
