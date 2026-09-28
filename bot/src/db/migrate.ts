/**
 * Ensaya las migraciones pendientes sobre una copia de la base, sin tocarla.
 *
 *   npm run migrate -- --dry-run                 # la base de DB_PATH
 *   npm run migrate -- --dry-run --db <ruta>
 *
 * En Fly, contra el volumen de verdad (la copia temporal se hace y se borra en
 * el propio volumen, así que los datos no salen de él):
 *
 *   flyctl ssh console --app munigraph-ribarroja -C "node_modules/.bin/tsx src/db/migrate.ts --dry-run"
 *
 * Sólo ensaya, y por eso exige `--dry-run`: migrar de verdad una base que está
 * sirviendo un bot con el código de antes lo dejaría leyendo columnas que ya no
 * existen. La migración de verdad la hace el bot al arrancar, con el código que
 * la espera.
 */
import { existsSync } from 'node:fs'
import { ensayarMigracion, MIGRACIONES_DEL_ENSAYO, MIGRACIONES_EN_ENSAYO } from './migraciones.ts'

const args = process.argv.slice(2)
const i = args.indexOf('--db')
const ruta = i >= 0 ? args[i + 1] : (process.env.DB_PATH ?? './data/bot.db')

if (!args.includes('--dry-run')) {
  process.stderr.write(
    '[migrate] sólo ensaya: añade --dry-run. La migración de verdad la hace el bot al arrancar.\n',
  )
  process.exit(2)
}
if (!ruta || !existsSync(ruta)) {
  process.stderr.write(`[migrate] no existe la base ${ruta ?? '(sin ruta)'}\n`)
  process.exit(2)
}

// Con las que están en ensayo: lo que se ensaya es lo que hará el despliegue que las active.
const e = ensayarMigracion(ruta, { migraciones: MIGRACIONES_DEL_ENSAYO })
if (MIGRACIONES_EN_ENSAYO.length > 0) {
  process.stdout.write(
    `[migrate] en ensayo, aún sin aplicar en el bot: ${MIGRACIONES_EN_ENSAYO.map((m) => `${m.version} ${m.nombre}`).join(', ')}\n`,
  )
}
const tablas = [...new Set([...Object.keys(e.antes), ...Object.keys(e.despues ?? {})])].sort()
for (const t of tablas) {
  const antes = e.antes[t] ?? '—'
  const despues = e.despues ? (e.despues[t] ?? '—') : '?'
  process.stdout.write(`  ${t.padEnd(24)} ${String(antes).padStart(7)} → ${despues}\n`)
}
if (e.ok) {
  process.stdout.write(
    `[migrate] ENSAYO correcto: de la versión ${e.desde} a la ${e.hasta}` +
      (e.aplicadas.length ? ` (${e.aplicadas.join(', ')})` : ', nada pendiente') +
      `. ${ruta} no se ha tocado; la copia temporal, borrada.\n`,
  )
} else {
  process.stdout.write(
    `[migrate] ENSAYO FALLIDO: ${e.error}\n` +
      `[migrate] ${ruta} no se ha tocado; la copia temporal, borrada.\n`,
  )
}
process.exit(e.ok ? 0 : 1)
