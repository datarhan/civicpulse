#!/usr/bin/env bash
# Refresh the adapters GitHub runners CANNOT reach.
#
# ribarroja.es (WAF), regmeet.com and SEPE blackhole GitHub's IP ranges, so the
# adapters below fail every night on CI. They are marked best-effort there, which
# keeps the nightly green — and that is the trap: the run goes green, nobody
# looks, and the data quietly ages with NO working refresh path anywhere. They
# all pass from a residential IP. (Sin cifra a propósito: este párrafo decía
# «seven» y «six» de la MISMA lista, que ya tenía ocho entradas.)
#
# Instalar:  bash scripts/launchd-install-llm-pipelines.sh   (agente, 06:45)
#
# Agente launchd y NO cron desde el 2026-08-26, aunque los adaptadores de
# abajo sean deterministas y no toquen credencial ninguna. Lo que la necesita es
# el `git push origin main` del final: el gancho de pre-push lee con el modelo
# las rutas que el push toca, y desde cron eso salía «Not logged in» siempre. La
# puerta avisaba —«SIN REVISAR: ningún backend respondió»— y empujaba igual, así
# que los datos que este script publica llevaban desde su instalación sin que
# nadie los leyera; una de las rutas que se quedaba fuera era /departamentos.
set -uo pipefail
# `|| exit`: this is the one of the four cron scripts without `set -e`, so a
# failed cd used to leave it committing from whatever directory cron started in.
cd "$(dirname "$0")/.." || exit 1
REPO_DIR="$(pwd -P)"
mkdir -p scripts/logs

# ---- branch guard + pathspec-limited commit (shared) ------------------
# shellcheck source=scripts/lib/cron-git.sh
. "$REPO_DIR/scripts/lib/cron-git.sh"
# Before the seven adapters hit the council's WAF: off main this run would
# rebase the checked-out branch onto origin/main, commit there and then push an
# untouched local main, so the refreshed snapshots would never reach the site.
cron_require_main "scrape-ci-blocked"

# Lo que este cron publica: el pathspec del commit de abajo y, a la vez, lo que
# puede tomar de origin cuando un rebase choca, porque lo vuelve a raspar. Una
# sola lista, y sin curados: lo comprueba tests/scripts/cron-git-safety.test.ts.
SNAPSHOTS=(
  public/data/paro.json
  public/data/plenos-agendas.json
  public/data/consell-cv.json
  public/data/procesos-selectivos.json
  public/data/asociaciones.json
  public/data/obras.json
  public/data/sindicatura.json
  public/data/sindic-expedientes.json
  public/data/transparency-docs.json
  public/data/pleno-actas.json
  public/data/agua.json
  public/data/agua-pares.json
  public/data/pleno-videos-regmeet.json
)
CRON_GIT_RASPADOS_PROPIOS="$(printf '%s\n' "${SNAPSHOTS[@]}")"

# Y AHORA el pull, ANTES de raspar. Era el único cron de datos que no lo hacía
# —hallazgos, press-lab y los dos auto-curate abren con «git pull inicial»— y
# fue el único que se atascó.
#
# El orden lo era todo. Raspando primero, este cron generaba once instantáneas
# sobre la main que tuviera el portátil, comiteaba, y SÓLO ENTONCES se
# encontraba con la nocturna, que había reescrito los mismos ficheros la tarde
# anterior. El 2026-08-29 chocaron en nueve, y cada conflicto era la misma
# línea: un `generatedAt` que las dos partes habían regenerado.
#
# Pullando primero no hay nada con lo que chocar: los adaptadores son
# idempotentes y reescriben el fichero ENTERO, así que generar encima de la
# main recién traída produce exactamente lo mismo que generar y fusionar, sin
# fusionar. El pull de después del commit se queda como reintento para la
# ventana de carrera de verdad (que alguien empuje mientras raspamos), y con la
# guarda nueva de `cron_git_pull_rebase` ya no puede dejar el árbol a medias.
#
# Este pull es también lo que desatasca un commit que una pasada anterior no pudo
# publicar: si choca con la nocturna en lo que este cron raspa o en un derivado,
# toma origin y la pasada lo vuelve a raspar encima. Si choca en otra ruta no hay
# reintento posible, y el mensaje de abajo no puede prometerlo: decía «el próximo
# run reintenta» y el 2026-10-27 lo repitió cinco mañanas seguidas.
if ! cron_git_pull_rebase "git pull inicial"; then
  echo "[ci-blocked] ERROR: el pull inicial falló — no se raspa nada. Si fue la red, la pasada siguiente lo reintenta; si arriba pone «en conflicto:», esa ruta no se repone sola y chocará igual cada mañana hasta que lo resuelva una persona (check:cron lo da en rojo)."
  exit 1
fi

ADAPTERS=(
  scrape:paro
  scrape:pleno-agendas
  scrape:consell-cv
  scrape:procesos-selectivos
  scrape:asociaciones
  scrape:obras
  scrape:sindicatura
  scrape:sindic-expedientes
  # ribarroja.es responde 502 a TODO desde los runners de GitHub — medido el
  # 6-09-2026 en la nocturna: 502 en las tres URL del portal, la del padrón de
  # cargos incluida. Desde el portátil la misma RPT responde 200. Es el caso
  # exacto para el que existe esta lista, y sin ella `transparency-docs.json`
  # se quedó congelado cinco días: el adaptador se niega —bien— a machacar el
  # catálogo bueno cuando fallan todas sus fuentes, así que en CI no escribía y
  # nadie más lo corría.
  #
  # Su salida, `transparency-docs.json`, va en el pathspec del commit de abajo.
  # Hasta el 2026-09-25 no iba: el cron la raspaba y la dejaba en el árbol, y la
  # publicaba por accidente el siguiente commit ancho de `hallazgos`.
  #
  # `scrape:officials` NO entra aquí, y no es un olvido: su única fuente
  # —/es/ayuntamiento/corporacion_municipal— da 403 también desde el portátil y
  # ya no aparece en el menú de esa sección del portal. Correrlo aquí fallaría
  # igual. Eso necesita una fuente nueva o declararla retirada, no un cron.
  scrape:transparency
  # Las actas firmadas de pleno, de la pestaña «Documentos» de cada sesión de
  # regmeet. regmeet bloquea a los runners de GitHub igual que con el orden del
  # día, así que la nocturna no puede ni intentarlo: éste es el ÚNICO camino de
  # refresco de `pleno-actas.json`. Sin él, un acta nueva no entraría nunca en
  # el cotejo de `check:votos-acta` de más abajo.
  scrape:pleno-actas
  # El vídeo que incrusta cada página de sesión de regmeet, la segunda fuente de
  # vídeo de /plenos/:id. No pide nada: lee las páginas que la pasada de actas
  # acaba de guardar en .cache/regmeet-sesiones/, así que va DETRÁS de ella. Una
  # pasada propia por las mismas páginas encontraba la conexión cerrada
  # (cabecera de src/scraper/pleno-videos-regmeet-pasada.ts).
  scrape:pleno-videos-regmeet
  # SINAC, la calidad del agua red a red. Que un runner de GitHub llegue a
  # sinac.sanidad.gob.es está sin medir, así que en la nocturna entra en blando
  # y éste es su refresco garantizado. Importa más que en otros: la página sólo
  # enseña los últimos boletines y `agua.json` es el archivo de los que rotan
  # fuera; una pasada perdida no se recupera mañana.
  scrape:agua
  # La banda de SINAC (los municipios parecidos). Semanal por su cuenta: dentro
  # de los 7 días sale 0 sin pedir nada. Éste es su ÚNICO refresco: una pasada
  # son unos 36 min desde cualquier IP y en la nocturna no cabe (SOLO_LOCAL en
  # scrape-all.sh). Va la última porque cuando le toca es, con mucho, la más larga.
  scrape:agua-pares
)

failed=()
for a in "${ADAPTERS[@]}"; do
  echo "[ci-blocked] $(date '+%F %T') running $a"
  if ! npm run "$a"; then failed+=("$a"); fi
done

if [ ${#failed[@]} -gt 0 ]; then
  echo "[ci-blocked] FAILED: ${failed[*]}"
fi

# Rederivar antes de comitear, y no es opcional.
#
# `scrape:pleno-agendas` REESCRIBE plenos-agendas.json entero, y ese fichero lo
# escriben tres pasos: el raspado, `compute:dept-stats` —que le mete
# `plazosVencidosCount` y `deptCoverage`— y `refresh`, que le pone el
# `builtFrom`. Al raspar sin rederivar, los dos últimos se perdían y este cron
# comiteaba el fichero pelado. Medido sobre cinco días seguidos: la nocturna de
# CI publicaba el fichero completo hacia las 05:20 y este cron lo dejaba sin
# esas claves a las 06:5x. Como los consumidores hacen `?? 0` y luego `> 0`, el
# aviso de compromisos vencidos desaparecía de la portada sin ponerse nada rojo.
#
# `refresh` es dependency-driven: reconstruye lo que sus entradas hayan movido y
# nada más, así que no hay lista que mantener aquí.
echo "[ci-blocked] $(date '+%F %T') running refresh (derivaciones dependientes)"
REDERIVADOS="$(cron_rutas_rederivadas_o_falla)" || echo "[ci-blocked] WARN: refresh falló — puede comitearse un derivado sin rederivar (lo caza tests/data-graph-frescura.test.ts)"

# Can a reader still FOLLOW the citations under published claims about named
# councillors? This is the half of check:citations that needs the network, and
# it belongs here for the same reason the adapters above do: the WAF and the
# blackholed ranges mean a GitHub runner would find every URL "unreachable",
# report nothing, and look healthy.
#
# It found the first one the day it was written: the council restructured its
# transparency portal and two acta PDFs backing 68 citations across 12 of 21
# biographies started returning 404, with nothing in this repo changing.
# Report-only — link rot is upstream's doing and must not fail a data refresh.
# ¿Sigue el PDF del Síndic diciendo lo que nuestra ficha entrecomilla? Misma
# familia que check:citations y aquí por el mismo motivo: desde un runner todos
# los PDFs saldrían «inalcanzables», no informaría de nada y tendría buen
# aspecto. Sólo una cita ROTA hace fallar; un servidor caído se informa y ya.
echo "[ci-blocked] $(date '+%F %T') running check:sindic-fichas (network probe)"
npm run check:sindic-fichas || echo "[ci-blocked] check:sindic-fichas reportó discrepancias — ver arriba"

echo "[ci-blocked] $(date '+%F %T') running check:citations (network probe)"
npm run check:citations || echo "[ci-blocked] check:citations reported findings — see above"

# ¿Dice el acta lo mismo que el desglose por grupos que publicamos? Aquí y no en
# la nocturna porque lee el texto que `scrape:pleno-actas` deja en .cache/, y ese
# raspado sólo corre desde esta IP. Sólo informa: una contradicción la corrige
# una persona con `corregir-voto`, que firma; nada automático reescribe un
# desglose publicado. Y no debe tumbar el refresco de los datos.
echo "[ci-blocked] $(date '+%F %T') running check:votos-acta"
npm run check:votos-acta || echo "[ci-blocked] check:votos-acta: desgloses que el acta contradice — ver arriba"

# Commit only these snapshots — never `git add -A`, so an in-progress working
# tree is not swept into an unattended commit. The `git add` alone never
# achieved that: `git commit` with no pathspec takes the WHOLE index, so
# anything anyone else had staged went in too. Now the same pathspec stages,
# gates and commits.
# Lo derivado ya no se escribe a mano aquí: `$REDERIVADOS` lo trae el propio
# refresh (`--rebuilt-paths`), que sabe qué reconstruyó. Antes iban las tres de
# `press-*` en una lista sacada del cierre transitivo del grafo, con el aviso de
# que «si el grafo crece y esta lista no, lo caza data-graph-frescura»: una lista
# a mano dentro de un control contra el desfase se desfasa ella sola, que es el
# chiste que este repositorio ya ha contado dos veces. Sin esto, el commit
# publicaría una agenda nueva junto a unos análisis que ya no salen de ella.
# shellcheck disable=SC2086  # deliberado: REDERIVADOS es una lista de rutas
if cron_git_stage_and_check "${SNAPSHOTS[@]}" $REDERIVADOS; then
  # The commit used to end in `|| true`. An adapter failing is upstream's doing
  # and stays non-fatal; the commit failing is OURS — seven adapters' worth of
  # fresh data that nothing will retry until tomorrow — and swallowing it let the
  # script go on to print "pushed".
  if ! cron_git_commit_pathspec "chore(data): refresh CI-unreachable adapters (ribarroja.es / regmeet)"; then
    echo "[ci-blocked] ERROR: los datos se refrescaron pero el commit FALLÓ — nada publicado, quedan en el working tree"
    exit 1
  fi
else
  # «Sin cambios» no es «nada que publicar». Un commit que otra pasada no pudo
  # empujar sigue en local, y salir aquí lo dejaba esperando a una mañana en la
  # que algún adaptador moviera algo, aunque nada impidiera publicarlo hoy.
  PENDIENTES="$(git rev-list --count origin/main..main 2>/dev/null || echo 0)"
  if [ "${PENDIENTES:-0}" -eq 0 ]; then
    echo "[ci-blocked] no changes"
    exit ${#failed[@]}
  fi
  echo "[ci-blocked] sin cambios nuevos, pero quedan $PENDIENTES commit(s) de una pasada anterior sin publicar — se publican"
fi

# Lo único que se puede decir de un commit que se queda en local. Eran dos
# mensajes y los dos acababan en «el próximo run reintenta»: desde el 2026-10-27
# eso fue falso cinco días, y lo seguiría siendo con un choque en una ruta ajena.
_sin_publicar() {
  echo "[ci-blocked] ERROR: $1 — el commit sigue en local, SIN publicar. La pasada siguiente lo recoge en su pull inicial si lo que choca es lo que este cron raspa o un derivado; un choque en cualquier otra ruta la deja parada hasta que lo resuelva una persona, y check:cron lo da en rojo."
  exit 1
}

# Was `git pull --rebase … && git push …` on one line: a failed pull skipped the
# push silently and the script still echoed "pushed" and exited on the ADAPTER
# count, so a repo that could not reach origin for days looked healthy. Each
# step now reports itself. Exit 1 on a publish failure (adapter-only failures
# keep exiting on their own count, as before).
# Through cron_git_pull_rebase: this one runs AFTER the commit, so by now the
# seven adapters and check:citations have had minutes to be interrupted by a
# branch switch — and on the wrong branch this pull rebases THAT branch onto
# origin/main.
#
# El rebase trae el trabajo de OTRO cron, y ese trabajo puede haber movido la
# entrada de un nodo derivado: publicar sin volver a derivar deja `main`
# incumpliendo su propia `tests/data-graph-frescura.test.ts`. Le pasó a
# `94359907` el 16-09-2026, que rebaseó sobre la instantánea de quejas y
# publicó dos nodos rancios. La PR #46 cerró este agujero para el commit
# normal y lo dejó abierto justo aquí. Van juntos en una función para que el
# reintento de abajo no pueda hacer lo primero sin lo segundo.
_pull_y_rederivar() {
  local ctx="$1" antes rutas
  antes="$(git rev-parse HEAD)"
  cron_git_pull_rebase "$ctx" || _sin_publicar "git pull --rebase falló"
  if ! rutas="$(cron_rutas_rederivadas_o_falla)"; then
    # Si el pull no trajo nada, esto es el mismo refresh caído de antes del
    # commit, que no para la publicación. Si trajo algo, nadie ha derivado esa
    # entrada: publicar sería el 94359907 otra vez, y esperar cuesta poco, porque
    # la pasada siguiente recoge el commit por sí sola.
    [ "$(git rev-parse HEAD)" = "$antes" ] && return 0
    _sin_publicar "el rebase trajo trabajo de otro y refresh falló, así que lo derivado puede estar rancio"
  fi
  if [ -z "$rutas" ]; then
    echo "[ci-blocked] rederivado tras el rebase: nada que reconstruir"
    return 0
  fi
  # shellcheck disable=SC2086  # deliberado: es una lista de rutas
  if cron_git_stage_and_check $rutas; then
    cron_git_commit_pathspec "chore(datos): rederivado tras el rebase" ||
      _sin_publicar "no se pudo comitear lo rederivado tras el rebase"
  fi
  echo "[ci-blocked] rederivado tras el rebase:$rutas"
}

_pull_y_rederivar "pull-rebase previo al push"

# La revisión lectora corre AQUÍ, ANTES del push, y el push va con --no-verify.
#
# No es por saltarse el control: es que el control no cabe dentro de un push.
# Git abre la conexión SSH y DESPUÉS corre el gancho, así que una revisión de
# minutos la deja inactiva hasta que GitHub la tira. Medido dos veces seguidas
# el 2026-08-26, con el mismo commit:
#
#   intento 1: «Connection to github.com closed by remote host» a mitad del
#              gancho · revisión 474s · push FALLIDO
#   intento 2: /datos ya cacheada, y aun así 367s · push FALLIDO otra vez
#
# El coste no son las lecturas —ésas sí cachean— sino UNA ruta cuya llamada al
# modelo se cuelga sin devolver nada y se mata a los 180s; con el reintento son
# 360s de tiempo muerto en cada push, caliente o frío. Eso ya se come el
# presupuesto de 180s del gancho y la paciencia de GitHub.
#
# Corriéndolo antes se conserva TODO lo que el gancho aporta —lee las mismas
# rutas, con el mismo rango, y escribe el mismo parte en este log— y la conexión
# sólo se abre para transferir. `PREPUSH_RANGE` existe justo para esto: lo dice
# la cabecera del propio gancho, que quería poder ejercerse sin empujar nada.
#
# `|| true` porque el gancho es ASESOR: hoy todos sus caminos salen 0 y su
# trabajo es imprimir. Si algún día se le añade algo que deba BLOQUEAR un
# push, este --no-verify hay que volver a mirarlo.
PREPUSH_RANGE="origin/main...HEAD" sh .husky/pre-push || true

# Esos minutos de revisión son la ventana en la que main se mueve: el 2026-10-27
# y el 2026-11-01 un push único se encontró «fetch first». Se reintenta como en
# el paso Commit de la nocturna, con dos diferencias a propósito. Cada vuelta
# rederiva, porque el rebase puede traer la entrada de un derivado. Y la espera
# va ANTES del rebase, no después: esperar entre el rebase y el push reabre la
# misma carrera. La revisión NO se repite: lo que trae el rebase lo revisa quien
# lo publicó, y otros tres minutos serían otra ventana.
#
# Nunca --force: un rechazo significa que origin tiene algo que no tenemos.
INTENTOS_PUSH="${CRON_GIT_PUSH_INTENTOS:-5}"
ESPERA_PUSH="${CRON_GIT_PUSH_ESPERA:-5}"
intento=1
until git push --no-verify origin main; do
  if [ "$intento" -ge "$INTENTOS_PUSH" ]; then
    _sin_publicar "git push rechazado en $intento intento(s)"
  fi
  echo "[ci-blocked] $(date '+%F %T') push rechazado (intento $intento de $INTENTOS_PUSH) — se rebasa, se rederiva y se reintenta"
  sleep $((intento * ESPERA_PUSH))
  _pull_y_rederivar "pull-rebase de reintento tras push rechazado"
  intento=$((intento + 1))
done
echo "[ci-blocked] pushed"
exit ${#failed[@]}
