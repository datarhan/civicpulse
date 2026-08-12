#!/usr/bin/env tsx
/**
 * check:eficiencia-findings — ¿sigue diciendo el panel lo que las fichas afirman?
 *
 *   npm run check:eficiencia-findings
 *   npm run check:eficiencia-findings -- --json
 *
 * Los hallazgos de pleno se anclan en una cita verbatim: la frase que dijo
 * alguien en marzo de 2026 dirá lo mismo dentro de diez años, y por eso
 * `check:citations` comprueba que la cita siga estando donde dice. Una cifra no
 * se queda quieta. «62,68 días» puede dejar de ser cierto sin que nadie toque
 * la página: el ministerio revisa una entrega y la ficha se queda afirmando la
 * de antes.
 *
 * Así que esto compara cada ficha publicada contra el panel vivo, y distingue
 * cuatro desenlaces en vez de dos, porque colapsar «no lo encontré» dentro de
 * «coincide» es el defecto que este repositorio ya pagó con `r?.findings ?? []`
 * — una comprobación que imprime su propio visto bueno cuando no ha
 * comprobado nada:
 *
 *   coincide      la fuente sigue diciendo lo publicado
 *   movido        el panel avanzó de periodo. Aviso, no fallo: la ficha dice
 *                 de qué periodo habla
 *   contradice    el MISMO periodo vale otra cosa → sale 1
 *   sin-indicador el indicador se fue del panel → sale 1
 *
 * Y comprueba que cada celda citada (`cesel:2024:CE2:a1621:Econ14`) resuelve de
 * verdad contra `coste-efectivo.json`, igual que `check:indicadores` hace con
 * las del panel.
 *
 * Anti-hueco: imprime cuántas comprobaciones corrió. Un «todo en orden» de un
 * gate que no evaluó nada es la suite verde que no medía nada.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateEficienciaFindingsSnapshot,
  cotejarMedicion,
  type CotejoMedicion,
} from '../src/scraper/eficiencia-finding'

const PUBLICADOS = resolve('public/data/eficiencia-findings.json')
const PANEL = resolve('public/data/indicadores.json')
const FUENTE = resolve('public/data/coste-efectivo.json')

interface CeldaRef {
  fuente: string
  resuelve: boolean
}

/** Las celdas que el volcado CESEL contiene de verdad, como claves de `Magnitud.fuente`. */
function celdasDisponibles(): Set<string> {
  const out = new Set<string>()
  if (!existsSync(FUENTE)) return out
  const d = JSON.parse(readFileSync(FUENTE, 'utf8')) as {
    municipio?: {
      filas?: Array<{
        anio: number
        programa: string
        unidades?: Array<{ atributo: string }>
      }>
    }
  }
  for (const f of d.municipio?.filas ?? []) {
    out.add(`cesel:${f.anio}:CE2:${f.programa}:Econ14`)
    for (const u of f.unidades ?? []) out.add(`cesel:${f.anio}:CE3:${f.programa}:${u.atributo}`)
  }
  return out
}

function main(): void {
  const asJson = process.argv.includes('--json')
  if (!existsSync(PUBLICADOS)) {
    process.stderr.write(`[check-eficiencia] falta ${PUBLICADOS}\n`)
    process.exit(1)
  }
  const snap = validateEficienciaFindingsSnapshot(readFileSync(PUBLICADOS, 'utf8'))
  const panel = JSON.parse(readFileSync(PANEL, 'utf8'))
  const celdas = celdasDisponibles()

  const cotejos: CotejoMedicion[] = snap.items.map((f) => cotejarMedicion(f, panel))
  const refs: Array<{ findingId: string; celdas: CeldaRef[] }> = snap.items.map((f) => ({
    findingId: f.id,
    celdas: f.medicion.fuentes.map((fuente) => ({
      fuente,
      // Sólo las celdas CESEL son resolubles contra el volcado. Las de los
      // indicadores municipales salen de otros snapshots y las comprueba
      // `check:indicadores`; decir aquí que «no resuelven» sería un gate
      // equivocado, y un gate equivocado es uno que todo el mundo se salta.
      resuelve: !fuente.startsWith('cesel:') || celdas.has(fuente),
    })),
  }))

  const comprobaciones =
    cotejos.length + refs.reduce((a, r) => a + r.celdas.length, 0) + (celdas.size > 0 ? 1 : 0)
  const contradicen = cotejos.filter((c) => c.estado === 'contradice')
  const huerfanas = cotejos.filter((c) => c.estado === 'sin-indicador')
  const movidas = cotejos.filter((c) => c.estado === 'movido')
  const celdasRotas = refs.flatMap((r) =>
    r.celdas.filter((c) => !c.resuelve).map((c) => `${r.findingId} → ${c.fuente}`),
  )

  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        { comprobaciones, cotejos, celdasRotas, publicadas: snap.items.length },
        null,
        2,
      ) + '\n',
    )
  }

  // Que el volcado no cargue no puede leerse como «ninguna celda está rota».
  if (snap.items.length > 0 && celdas.size === 0) {
    process.stderr.write(
      '[check-eficiencia] no pude leer una sola celda de coste-efectivo.json: no estoy ' +
        'comprobando nada, que no es lo mismo que estar todo bien\n',
    )
    process.exit(1)
  }

  if (!asJson) {
    process.stdout.write(
      `[check-eficiencia] ${comprobaciones} comprobación(es) sobre ${snap.items.length} ficha(s) ` +
        `publicada(s) y ${(snap.retractions ?? []).length} retirada(s)\n`,
    )
    for (const m of movidas) {
      process.stdout.write(`  · ${m.findingId}: ${m.detalle}\n`)
    }
    for (const c of contradicen) {
      process.stderr.write(`  ✗ ${c.findingId}: ${c.detalle}\n`)
    }
    for (const h of huerfanas) {
      process.stderr.write(`  ✗ ${h.findingId}: ${h.detalle}\n`)
    }
    for (const r of celdasRotas) {
      process.stderr.write(`  ✗ celda que no resuelve: ${r}\n`)
    }
  }

  if (contradicen.length || huerfanas.length || celdasRotas.length) {
    process.stderr.write(
      `[check-eficiencia] ${contradicen.length + huerfanas.length + celdasRotas.length} problema(s). ` +
        `Refresca la cifra con \`npm run correct-indicador -- <id> --field medicion --refrescar\` ` +
        `o retira la ficha.\n`,
    )
    process.exit(1)
  }
  if (!asJson) {
    if (snap.items.length === 0) {
      // Cero fichas es el estado normal antes de la primera firma, y decir
      // «✓ todo en orden» sobre una lista vacía es exactamente la frase que
      // este repositorio ya se ha creído dos veces.
      process.stdout.write(
        '[check-eficiencia] no hay ninguna ficha publicada todavía — nada que comprobar, ' +
          'que NO es lo mismo que estar todo bien. La cola vive en ' +
          'editorial/indicador-candidates.md (`npm run draft:indicadores`).\n',
      )
      return
    }
    process.stdout.write(
      `[check-eficiencia] ✓ toda cifra publicada sigue coincidiendo con su fuente` +
        `${movidas.length ? ` (${movidas.length} con el panel ya en otro periodo — revisar)` : ''}\n`,
    )
  }
}

main()
