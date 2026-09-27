/**
 * Recalcula el barrio de las quejas guardadas (src/services/rebarrio.ts).
 *
 *   npx tsx scripts/rebarrio.ts --db /data/bot.db            # en seco: qué cambiaría
 *   npx tsx scripts/rebarrio.ts --db /data/bot.db --aplicar  # lo cambia, con un evento por queja
 *
 * Se ejecuta donde está la base, en la máquina de Fly (bot/DEPLOY.md). La web
 * recoge los cambios en la siguiente exportación (pull-quejas.yml).
 *
 * Se niega a abrir una base que no existe: `openDb` la crearía vacía, y el
 * plan de una base vacía —«0 revisadas, nada que cambiar»— se leería como el de
 * la de verdad. Por eso también dice qué base ha abierto y cuántas quejas vivas
 * tiene, y de cada cambio, en qué estado está la queja y si ya tiene asiento en
 * el Registro: cambiar el barrio de una queja ya presentada no es lo mismo.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { openDb } from '../src/db/client.ts'
import { aplicarRebarrio, planearRebarrio } from '../src/services/rebarrio.ts'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const i = args.indexOf('--db')
const ruta = i >= 0 ? args[i + 1] : (process.env.DB_PATH ?? './data/bot.db')
if (!ruta || !existsSync(ruta)) {
  process.stderr.write(
    `[rebarrio] no existe la base ${ruta ?? '(sin ruta)'}: no se crea una vacía.\n`,
  )
  process.exit(2)
}

const db = openDb(ruta)
const { n: vivas } = db
  .prepare('SELECT COUNT(*) AS n FROM quejas WHERE deleted_at IS NULL')
  .get() as { n: number }
process.stdout.write(`[rebarrio] base: ${resolve(ruta)} · ${vivas} queja(s) viva(s)\n`)

const plan = planearRebarrio(db)
for (const c of plan.cambios) {
  process.stdout.write(
    `${c.id}  ${c.antes ?? '(sin barrio)'} → ${c.despues ?? '(sin barrio)'}  [${c.situacion}]` +
      `  estado ${c.state}${c.asiento ? ` · asiento ${c.asiento}` : ''}\n`,
  )
}
process.stdout.write(
  `[rebarrio] ${plan.revisadas} con ubicación revisada(s) · ${plan.sinUbicacion} sin ubicación, saltada(s) · ` +
    `${plan.cambios.length} cambiaría(n)\n`,
)

if (!aplicar) {
  process.stdout.write('[rebarrio] en seco: no se ha cambiado nada. Con --aplicar, se cambia.\n')
} else {
  const r = aplicarRebarrio(db, plan.cambios)
  process.stdout.write(
    `[rebarrio] aplicados ${r.aplicados} de ${r.intentados}` +
      (r.yaCambiados ? ` · ${r.yaCambiados} habían cambiado entre medias y no se tocaron` : '') +
      '\n',
  )
}
