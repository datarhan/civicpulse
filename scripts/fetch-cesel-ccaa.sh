#!/usr/bin/env bash
# Descarga el fichero CESEL de una comunidad autónoma para cada entrega.
#
# La consulta por ENTE esconde su descarga tras un <input type="image">, que no
# se deja reconstruir como POST. El mapa por COMUNIDAD, en cambio, sólo rellena
# tres campos ocultos y envía el formulario —hddIdEntrega, hddCodComunidad,
# hddAccionDescargarExcel— y eso sí se reproduce sin navegador.
#
# Cada fichero trae TODOS los municipios de la comunidad en esa entrega, así que
# de aquí salen a la vez la serie propia y los pares año por año.
#
#   bash scripts/fetch-cesel-ccaa.sh [ccaa] [destino]
#
# Por defecto: ccaa 17 (Comunitat Valenciana) → .cache/cesel/ccaa
set -uo pipefail

CCAA="${1:-17}"
DEST="${2:-.cache/cesel/ccaa}"
URL='https://serviciostelematicosext.hacienda.gob.es/SGCIEF/CESEL/Consulta/Mapa/ConsultaMapa.aspx'
UA='CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)'
P='ctl00$MainContentPlaceHolder$'

# entrega_id:año — leídos del propio ddlEntrega de la página.
ENTREGAS="1:2014 3:2015 5:2016 6:2017 7:2018 8:2019 9:2020 10:2021 11:2022 12:2023 13:2024"

mkdir -p "$DEST"
JAR="$(mktemp)"

campo() { # campo <fichero> <id>
  python3 - "$1" "$2" <<'PY'
import re, sys, io, html
h = io.open(sys.argv[1], encoding='utf-8', errors='replace').read()
m = re.search(r'id="%s"[^>]*value="([^"]*)"' % re.escape(sys.argv[2]), h)
print(html.unescape(m.group(1)) if m else '')
PY
}

for par in $ENTREGAS; do
  id="${par%%:*}"; anio="${par##*:}"
  out="$DEST/cesel-ccaa${CCAA}-${anio}.xlsx"
  if [ -s "$out" ]; then echo "  $anio · ya estaba"; continue; fi

  page="$(mktemp)"
  curl -sS -m 90 -A "$UA" -c "$JAR" -b "$JAR" "$URL" -o "$page" || { echo "  $anio · GET falló"; continue; }

  curl -sS -m 300 -A "$UA" -c "$JAR" -b "$JAR" -e "$URL" "$URL" -o "$out" \
    --data-urlencode "__EVENTTARGET=" \
    --data-urlencode "__EVENTARGUMENT=" \
    --data-urlencode "__VIEWSTATE=$(campo "$page" __VIEWSTATE)" \
    --data-urlencode "__VIEWSTATEGENERATOR=$(campo "$page" __VIEWSTATEGENERATOR)" \
    --data-urlencode "__EVENTVALIDATION=$(campo "$page" __EVENTVALIDATION)" \
    --data-urlencode "ctl00\$idControlMaster=$(campo "$page" idControlMaster)" \
    --data-urlencode "${P}ddlEntrega=$id" \
    --data-urlencode "${P}hddIdEntrega=$id" \
    --data-urlencode "${P}hddCodComunidad=$CCAA" \
    --data-urlencode "${P}hddAccionDescargarExcel=True"
  rm -f "$page"

  # Un fichero xlsx empieza por PK. Cualquier otra cosa es la página de error
  # devuelta con 200, que es como este servidor informa de que algo falló.
  if [ "$(head -c 2 "$out" 2>/dev/null)" = "PK" ]; then
    printf '  %s · %s\n' "$anio" "$(du -h "$out" | cut -f1)"
  else
    echo "  $anio · NO es xlsx ($(wc -c < "$out") bytes) — descartado"
    rm -f "$out"
  fi
  sleep 2   # cortesía con el ministerio
done
rm -f "$JAR"
echo "→ $DEST"
ls -1 "$DEST" 2>/dev/null | wc -l | xargs echo "ficheros:"
