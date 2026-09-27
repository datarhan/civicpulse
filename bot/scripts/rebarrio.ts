/**
 * Recalcula el barrio de las quejas guardadas (src/services/rebarrio.ts).
 *
 *   npx tsx scripts/rebarrio.ts            # en seco: qué cambiaría, sin tocar nada
 *   npx tsx scripts/rebarrio.ts --aplicar  # lo cambia, con un evento por queja
 *
 * Se ejecuta donde está la base, en la máquina de Fly. La web recoge los
 * cambios en la siguiente exportación (pull-quejas.yml).
 */
import { openDb } from '../src/db/client.ts'
import { aplicarRebarrio, planearRebarrio } from '../src/services/rebarrio.ts'

const aplicar = process.argv.includes('--aplicar')
const db = openDb()
const plan = planearRebarrio(db)

for (const c of plan.cambios) {
  process.stdout.write(
    `${c.id}  ${c.antes ?? '(sin barrio)'} → ${c.despues ?? '(sin barrio)'}  [${c.situacion}]\n`,
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
