#!/usr/bin/env node
/**
 * Ejecuta un mandato con un tope de tiempo y, si lo agota, mata su árbol entero.
 *
 *   node scripts/con-tope.mjs <segundos> <mandato> [argumentos…]
 *
 * Sale con el código del mandato, o con 124 si agotó el tope (la convención de
 * `timeout`, que es la que ya lee `ci-apt-con-tope.sh`). 127 si no existe, y 2 si
 * el tope no es un número: un guardián que no vigila no ejecuta nada.
 *
 * POR QUÉ NO `timeout`. Es de coreutils: está en el runner y no en un Mac, y
 * `scrape-all.sh` corre en los dos. Con él, el tope sólo existiría de noche en
 * GitHub y su prueba no podría fallar en el portátil de quien lo toca.
 *
 * POR QUÉ UN GRUPO DE PROCESOS. `npm run x` es npm → sh → npx → node: señalar al
 * hijo deja a node raspando sin dueño. `detached` le da al mandato su propio
 * grupo, y por eso la señal va a `-pid`. La contrapartida es que un Ctrl-C o el
 * tope del paso de CI ya no le llegan solos, así que este proceso los reenvía.
 */
import { spawn } from 'node:child_process'
import { constants } from 'node:os'

const GRACIA_MS = Number(process.env.CON_TOPE_GRACIA_MS ?? 10_000)

const [segundos, mandato, ...args] = process.argv.slice(2)
const tope = Number(segundos)
if (!mandato || !Number.isFinite(tope) || tope <= 0) {
  console.error('[con-tope] uso: con-tope.mjs <segundos> <mandato> [argumentos…]')
  process.exit(2)
}

const hijo = spawn(mandato, args, { stdio: 'inherit', detached: true })

const alGrupo = (senal) => {
  try {
    process.kill(-hijo.pid, senal)
  } catch {
    // Ya no queda nadie en el grupo.
  }
}

let agotado = false
const reloj = setTimeout(() => {
  agotado = true
  console.error(`[con-tope] ${tope} s agotados: ${[mandato, ...args].join(' ')}`)
  alGrupo('SIGTERM')
  setTimeout(() => alGrupo('SIGKILL'), GRACIA_MS)
}, tope * 1000)

for (const senal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(senal, () => {
    alGrupo(senal)
    process.exit(128 + constants.signals[senal])
  })
}

hijo.on('error', (err) => {
  clearTimeout(reloj)
  console.error(`[con-tope] no se pudo ejecutar ${mandato}: ${err.message}`)
  process.exit(127)
})

hijo.on('exit', (codigo) => {
  clearTimeout(reloj)
  if (agotado) {
    // El hijo directo puede morir con SIGTERM y dejar a un nieto que lo ignora.
    alGrupo('SIGKILL')
    process.exit(124)
  }
  process.exit(codigo ?? 1)
})
