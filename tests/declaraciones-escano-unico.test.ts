/**
 * Lo que la bitácora de /hallazgos corrige con firma llega a la declaración de
 * la que sale la cita, y ninguna declaración publica sola el grupo de un
 * concejal único.
 *
 * Medido el 30-09-2026 sobre main c9a02b87. De las 29 correcciones de
 * atribución que firma la bitácora de /hallazgos (#172, #179, #198 y #203),
 * ninguna había llegado a su declaración: 20 se seguían sirviendo con la
 * etiqueta retirada en /plenos/:id, /declaraciones y /departamentos/:slug. Y
 * 116 declaraciones servidas —306 en el monolito— llevaban VOX, EU-Podem o
 * Compromís sin la firma de nadie. CLAUDE.md: «a one-seat bloc is not
 * bloc-level»; la etiqueta nombra a ese concejal por eliminación, y eso es
 * nivel C (`decideAutomation({ namesIndividual: true })`).
 *
 * El registro de declaraciones no tiene vía para FIRMAR una atribución: la
 * única CLI que toca el campo, `retract-attribution`, sólo sabe retirarla. Por
 * eso aquí no cabe excepción y la cuenta es cero. El día que exista la firma,
 * esta prueba tendrá que leerla en vez de ensancharse a mano.
 *
 * Tres ficheros, porque los tres se publican: los trozos los sirve el sitio;
 * el monolito y las sugerencias, el repositorio, que es público desde el 8-09.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { seatsFromOfficials, singleSeatBlocs } from '../src/scraper/corporation-seats'
import {
  ATTRIBUTION_RETRACTED_LABEL,
  CORRECTION_REMOVAL_FIELD_RE,
  isSpeakerGroupField,
} from '../src/scraper/pleno-finding'

const DATA = 'public/data'
const leer = (p: string) => JSON.parse(readFileSync(join(DATA, p), 'utf8'))

interface Declaracion {
  id: string
  speakerGroup?: string | null
}
interface Fila {
  field: string
  original: string
  corrected: string
  correctedAt: string
}
interface Ficha {
  id: string
  quotes: Array<{ sourceClaimId?: string | null }>
  corrections?: Fila[]
}

/**
 * El índice que tiene HOY la cita a la que se refería una fila de la bitácora.
 *
 * Una retirada de cita (`quote.<k>`) renumera las que van detrás, así que el
 * índice escrito en una fila vale el día de la fila, no hoy: sólo cuentan las
 * retiradas POSTERIORES —por fecha, y en la misma fecha, por su orden en la
 * bitácora—. `null` si la propia cita se retiró después.
 */
function indiceDeHoy(filas: readonly Fila[], posicion: number, indice: number): number | null {
  const fila = filas[posicion]
  let i: number | null = indice
  filas.forEach((otra, k) => {
    if (i === null || k === posicion) return
    const posterior =
      otra.correctedAt > fila.correctedAt || (otra.correctedAt === fila.correctedAt && k > posicion)
    const m = CORRECTION_REMOVAL_FIELD_RE.exec(otra.field)
    if (!posterior || !m || m[1] !== 'quote') return
    const retirada = Number(m[2])
    if (retirada === i) i = null
    else if (retirada < i) i -= 1
  })
  return i
}

describe('indiceDeHoy — la cita de una fila, después de las retiradas', () => {
  const fila = (field: string, correctedAt: string): Fila => ({
    field,
    original: 'x',
    corrected: 'y',
    correctedAt,
  })
  const T1 = '2026-09-29T05:00:00.000Z'
  const T2 = '2026-09-30T05:00:00.000Z'

  it('una retirada anterior no mueve nada: el índice ya la descontaba', () => {
    expect(indiceDeHoy([fila('quote.0', T1), fila('quote.2.speakerGroup', T2)], 1, 2)).toBe(2)
  })
  it('una retirada posterior de una cita de delante la corre un puesto', () => {
    expect(indiceDeHoy([fila('quote.2.speakerGroup', T1), fila('quote.0', T2)], 0, 2)).toBe(1)
  })
  it('una retirada posterior de una cita de detrás no la toca', () => {
    expect(indiceDeHoy([fila('quote.2.speakerGroup', T1), fila('quote.3', T2)], 0, 2)).toBe(2)
  })
  it('si se retiró la propia cita, ya no hay cita', () => {
    expect(indiceDeHoy([fila('quote.2.speakerGroup', T1), fila('quote.2', T2)], 0, 2)).toBeNull()
  })
  it('en la misma fecha manda el orden de la bitácora', () => {
    expect(indiceDeHoy([fila('quote.2.speakerGroup', T1), fila('quote.1', T1)], 0, 2)).toBe(1)
    expect(indiceDeHoy([fila('quote.1', T1), fila('quote.2.speakerGroup', T1)], 1, 2)).toBe(2)
  })
  it('retirar un documento cotejado no mueve las citas', () => {
    expect(indiceDeHoy([fila('quote.2.speakerGroup', T1), fila('crossChecked.0', T2)], 0, 2)).toBe(
      2,
    )
  })
})

const UN_ESCANO = singleSeatBlocs(seatsFromOfficials(leer('officials.json')))

const monolito: Declaracion[] = leer('pleno-claims-verified.json').items.map(
  (it: { claim: Declaracion }) => it.claim,
)
const sugerencias: Declaracion[] = leer('pleno-claims-suggestions.json').items
const trozos = readdirSync(join(DATA, 'pleno-claims')).filter(
  (f) => f.endsWith('.json') && f !== 'index.json',
)
const servidas: Declaracion[] = trozos.flatMap((f) =>
  leer(`pleno-claims/${f}`).items.map((it: { claim: Declaracion }) => it.claim),
)

const conEscanoUnico = (ds: Declaracion[]) =>
  ds
    .filter((d) => d.speakerGroup && UN_ESCANO.includes(d.speakerGroup))
    .map((d) => `${d.id} · ${d.speakerGroup}`)

describe('ninguna declaración publica sola el grupo de un concejal único', () => {
  it('los grupos de un escaño se derivan de officials.json, y hay alguno', () => {
    // Si la derivación devolviera [], las tres de abajo pasarían sin mirar nada.
    expect(UN_ESCANO.length).toBeGreaterThan(0)
  })

  it('en los trozos que sirve el sitio', () => {
    expect(trozos.length).toBeGreaterThan(0)
    expect(servidas.length).toBeGreaterThan(0)
    expect(conEscanoUnico(servidas)).toEqual([])
  })

  it('en el monolito (pleno-claims-verified.json)', () => {
    expect(monolito.length).toBeGreaterThan(0)
    expect(conEscanoUnico(monolito)).toEqual([])
  })

  it('en las sugerencias (pleno-claims-suggestions.json)', () => {
    expect(sugerencias.length).toBeGreaterThan(0)
    expect(conEscanoUnico(sugerencias)).toEqual([])
  })
})

describe('lo que /hallazgos corrige con firma llega a la declaración de la cita', () => {
  const fichas: Ficha[] = leer('pleno-findings.json').items
  const grupoEnMonolito = new Map(monolito.map((d) => [d.id, d.speakerGroup ?? null]))
  const grupoServido = new Map(servidas.map((d) => [d.id, d.speakerGroup ?? null]))

  const filas: Array<{ ficha: string; fila: Fila; declaracion: string | null }> = []
  for (const f of fichas) {
    const cs = f.corrections ?? []
    cs.forEach((fila, posicion) => {
      if (!isSpeakerGroupField(fila.field)) return
      const indice = Number(fila.field.split('.')[1])
      const hoy = indiceDeHoy(cs, posicion, indice)
      const declaracion = hoy === null ? null : (f.quotes[hoy]?.sourceClaimId ?? null)
      filas.push({ ficha: f.id, fila, declaracion })
    })
  }

  it('hay filas de atribución que mirar, y todas encuentran su cita', () => {
    expect(filas.length).toBeGreaterThan(0)
    expect(filas.filter((x) => x.declaracion === null).map((x) => x.ficha)).toEqual([])
  })

  it('la declaración ya no dice lo que la ficha retiró o corrigió', () => {
    const malas: string[] = []
    for (const { ficha, fila, declaracion } of filas) {
      if (declaracion === null) continue
      // Retirada: sólo cabe null. Re-etiquetada con prueba: null o el grupo
      // nuevo, nunca el que la ficha dejó de sostener.
      const admitidos =
        fila.corrected === ATTRIBUTION_RETRACTED_LABEL ? [null] : [null, fila.corrected]
      if (!grupoEnMonolito.has(declaracion)) {
        malas.push(`${declaracion} (${ficha} ${fila.field}): no está en el monolito`)
        continue
      }
      for (const [donde, grupos] of [
        ['monolito', grupoEnMonolito],
        ['servida', grupoServido],
      ] as const) {
        if (!grupos.has(declaracion)) continue
        const g = grupos.get(declaracion) ?? null
        if (!admitidos.includes(g)) {
          malas.push(
            `${declaracion} (${donde}) dice ${g}; ${ficha} ${fila.field} ${fila.original}→${fila.corrected}`,
          )
        }
      }
    }
    expect(malas).toEqual([])
  })
})
