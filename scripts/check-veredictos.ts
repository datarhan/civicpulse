#!/usr/bin/env tsx
/**
 * check:veredictos — ¿sigue sosteniéndose lo que los veredictos publicados
 * afirman?
 *
 *   npm run check:veredictos
 *   npm run check:veredictos -- --json
 *
 * El nodo que faltaba. Las citas tienen `check:citations`; las cifras de las
 * fichas tienen `check:eficiencia-findings` con sus cuatro desenlaces. Los
 * VEREDICTOS —que son la afirmación más fuerte que hace este sitio sobre lo
 * que alguien dijo— no tenían nada que volviera a preguntar si siguen
 * fundados.
 *
 * Un veredicto por encima de `sin-datos` afirma que algo respalda la
 * afirmación. Desde el suelo de evidencia (fase 2) eso ya no se puede
 * ESCRIBIR sin corpus; esto mira lo que YA está escrito, que es otra pregunta.
 *
 * Cuatro desenlaces, y el reparto de códigos de salida es el punto:
 *
 *   fundado               nombra corpus y trae evidencia
 *   curado                lo decidió una persona · sale 0 — es la vía
 *                         sancionada en todo este repositorio, y bajar un
 *                         veredicto nunca refuerza una afirmación
 *   procedencia-retirada  se apoya en una pasada que ya no está en la tubería
 *                         · AVISO, sale 0 — es la cola de la fase 6, no una
 *                           avería, y una guarda siempre roja acaba apagada
 *   sin-corpus            veredicto fuerte sin corpus, de una pasada VIVA
 *                         · sale 1 — eso lo ha roto alguien hoy
 *   sin-publicar          no hay trozos que leer · SALTADO, jamás «ok»
 *
 * La distinción entre los dos del medio es lo que hace la guarda usable: con
 * las 87 filas viejas y una rotura nueva en el mismo saco, esto saldría rojo
 * todas las noches hasta la fase 6 y nadie miraría el día que importara.
 *
 * Anti-hueco: imprime cuántos veredictos evaluó. Uno que no miró nada y uno
 * que no encontró nada no pueden imprimir el mismo «✓».
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  corpusReales,
  clasificarProcedencia,
  esPasadaRetirada,
} from '../src/scraper/claim-verdicts'

const DIR = resolve('public/data/pleno-claims')

export const ESTADOS_VEREDICTO = [
  'fundado',
  'curado',
  'procedencia-retirada',
  'sin-corpus',
  'sin-publicar',
] as const
export type EstadoVeredicto = (typeof ESTADOS_VEREDICTO)[number]

interface Fila {
  id: string
  verdict: string
  estado: EstadoVeredicto
  detalle: string
}

interface Item {
  claim?: { id?: string; type?: string }
  verification?: { verdict?: string; checkedAgainst?: unknown[]; evidence?: unknown[] }
}

/** Puro: el desenlace de UN veredicto ya publicado. */
export function cotejarVeredicto(it: Item): Fila {
  const id = it.claim?.id ?? '(sin id)'
  const v = it.verification ?? {}
  const verdict = String(v.verdict ?? '')
  const fuerte = verdict === 'verificado' || verdict === 'parcial'
  if (!fuerte) return { id, verdict, estado: 'fundado', detalle: '' }

  const corpus = corpusReales(v.checkedAgainst)
  const conEvidencia = (v.evidence?.length ?? 0) > 0
  if (corpus.length > 0 && conEvidencia) return { id, verdict, estado: 'fundado', detalle: '' }

  // ¿De dónde viene? Tres respuestas distintas, y meterlas en el mismo saco
  // haría inútil la guarda.
  const { pasadas } = clasificarProcedencia(v.checkedAgainst)

  // Una persona. Es la vía sancionada en todo este repositorio —la misma que
  // `isCuratorPromoted` deja pasar por la puerta editorial— y el suelo de
  // evidencia la exime por lo mismo: bajar un veredicto nunca refuerza una
  // afirmación. Que su `checkedAgainst` se quedara sólo con la marca es el
  // campo con dos significados otra vez, y lo arregla la fase 1b.
  if (pasadas.includes('curator-downgrade')) {
    return {
      id,
      verdict,
      estado: 'curado',
      detalle: 'lo bajó una persona; su corpus original lo pisó la marca de la pasada',
    }
  }

  const retirada = pasadas.find((p) => esPasadaRetirada(p))
  if (retirada) {
    return {
      id,
      verdict,
      estado: 'procedencia-retirada',
      detalle: `se apoya en «${retirada}», que ya no está en la tubería`,
    }
  }
  return {
    id,
    verdict,
    estado: 'sin-corpus',
    detalle: corpus.length === 0 ? 'no nombra ningún corpus real' : 'no trae ninguna evidencia',
  }
}

function main(): void {
  const asJson = process.argv.includes('--json')

  if (!existsSync(DIR)) {
    process.stdout.write(
      `[check-veredictos] 0 veredicto(s) · SALTADO: no existe ${DIR}. No se ha comprobado nada, ` +
        'que no es lo mismo que estar todo bien.\n',
    )
    return
  }
  const items: Item[] = readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .flatMap((f) => (JSON.parse(readFileSync(join(DIR, f), 'utf8')) as { items: Item[] }).items)

  if (items.length === 0) {
    process.stdout.write(
      '[check-veredictos] 0 veredicto(s) · SALTADO: los trozos no traen ni una fila. No se ha ' +
        'comprobado nada, que no es lo mismo que estar todo bien.\n',
    )
    return
  }

  const filas = items.map(cotejarVeredicto)
  const fuertes = filas.filter((f) => f.verdict === 'verificado' || f.verdict === 'parcial')
  const retiradas = filas.filter((f) => f.estado === 'procedencia-retirada')
  const curados = filas.filter((f) => f.estado === 'curado')
  const rotos = filas.filter((f) => f.estado === 'sin-corpus')

  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        { evaluados: filas.length, fuertes: fuertes.length, curados, retiradas, rotos },
        null,
        2,
      ) + '\n',
    )
    process.exit(rotos.length ? 1 : 0)
  }

  process.stdout.write(
    `[check-veredictos] ${filas.length} veredicto(s) evaluado(s) · ${fuertes.length} fuerte(s) · ` +
      `${curados.length} curado(s) · ${retiradas.length} de procedencia retirada · ` +
      `${rotos.length} sin corpus\n`,
  )

  // Que la comprobación haya mirado algo de verdad: si NINGÚN veredicto fuera
  // fuerte, todo saldría `fundado` por la puerta de arriba y esto imprimiría
  // un visto bueno sin haber juzgado nada.
  if (fuertes.length === 0) {
    process.stderr.write(
      '[check-veredictos] ningún veredicto fuerte en lo publicado: no estoy juzgando nada, que ' +
        'no es lo mismo que estar todo bien\n',
    )
    process.exit(1)
  }

  if (retiradas.length > 0) {
    process.stdout.write(
      `  · ${retiradas.length} veredicto(s) fuertes se apoyan en una pasada retirada. Es la cola ` +
        'de la fase 6: re-fundamentar con `npm run verify:pleno-claims:nli` lo que se pueda y ' +
        'bajar el resto a sin-datos.\n',
    )
  }
  for (const r of rotos.slice(0, 10)) {
    process.stderr.write(`  ✗ ${r.id}: ${r.verdict} — ${r.detalle}\n`)
  }
  if (rotos.length) {
    process.stderr.write(
      `[check-veredictos] ${rotos.length} veredicto(s) fuertes sin nada que los sostenga, y NO ` +
        'vienen de una pasada retirada: esto es de hoy. El suelo de evidencia impide escribirlos ' +
        'por el overlay, así que mira quién los ha metido por otra vía.\n',
    )
    process.exit(1)
  }
}

main()
