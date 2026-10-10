import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildTenderRows, CLAVE_DE_LICITACION } from '../../scripts/embed-verifier-corpus'
import { shortlistCandidates } from '../../src/scraper/claim-verifier'
import { looselyContains } from '../../src/scraper/claim-verifier-llm'
import { procurementStatusKind } from '../../src/lib/contract-status.js'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'

/**
 * Lo que un contrato le enseña al modelo que coteja una declaración: su
 * snippet en la lista corta, que es lo único del registro que el modelo lee.
 *
 * La lectura de las 52 «ya no la retractaría» del 04-10-2026
 * (editorial/rederivacion-0410-52/INFORME.md, §4 b) encontró que el motor no
 * vio los 35.252,87 € de la cartelería digital (k4olcs-018-afi-1077bc) ni los
 * 325.662,55 € del carril bici (c8kr44-142-cit-b8c30e), y que no podía saber
 * que Hidraqua era la adjudicataria de la concesión del agua
 * (k4olcs-101-cit-ddd6c4). El corpus semántico componía `título · €importe ·
 * estado` y lo cortaba a 230 caracteres: en un contrato de título largo, el
 * corte se comía el importe y el estado. La adjudicataria no iba nunca. Y la
 * lista corta léxica componía el suyo por su cuenta, con otro importe y otro
 * orden, así que el mismo registro llegaba al modelo de dos maneras según qué
 * mitad del shortlist lo trajera.
 *
 * «Llega» se mide como mide el motor una cita: `looselyContains` sobre el
 * snippet. Un valor que no pasa por ahí no se puede citar.
 */
const F = JSON.parse(
  readFileSync(resolve('tests/fixtures/snippet-de-contrato_2026-10-06.json'), 'utf8'),
)
const FIXTURE = { contracts: F.contracts, tenders: F.tenders }
const declaracion = (id: string) =>
  (F.declaraciones as PlenoClaim[]).find((d) => d.id === id) as PlenoClaim
const fila = (id: string) =>
  (F.contracts as Record<string, unknown>[]).find((r) => r.id === id) as Record<string, unknown>

/** Los tres registros de la lectura y lo que su snippet tiene que llevar, copiado a mano de la fila. */
const LOS_TRES = [
  {
    declaracion: 'k4olcs-018-afi-1077bc',
    contrato: '4415701',
    hechos: [
      'awarded',
      '35.252,87', // adjudicación con IVA: la cifra citada, al céntimo
      '29.134,60', // adjudicación sin IVA
      '51.098,30', // licitación con IVA
      'VODAFONE ESPANA SA',
      '29-05-2024',
    ],
  },
  {
    declaracion: 'c8kr44-142-cit-b8c30e',
    contrato: '5054473',
    hechos: [
      'formalized',
      '296.195,90', // adjudicación con IVA
      '325.662,55', // licitación con IVA: la más cercana a «algo más de 330.000»
      'OBRA CIVIL Y EDIFICACION ESCRIMAR S.L.L.',
      '29-05-2026',
    ],
  },
  {
    declaracion: 'k4olcs-101-cit-ddd6c4',
    contrato: '46717',
    hechos: [
      'awarded',
      '55.685.178,79',
      'HIDRAQUA GESTIÓN INTEGRAL DE AGUAS DE LEVANTE, S.A.',
      '06-08-2026', // la adjudicación es de 2026; la licitación, de 2018-19
    ],
  },
]

const faltan = (snippet: string, hechos: string[]) =>
  hechos.filter((h) => !looselyContains(snippet, h))

describe('el snippet de un contrato de título largo', () => {
  it('lleva en el corpus semántico su importe, su estado y su adjudicataria', () => {
    const filas = buildTenderRows(FIXTURE)
    for (const t of LOS_TRES) {
      const r = filas.find((f) => f.sourceId === t.contrato)
      expect(r, t.contrato).toBeDefined()
      expect(faltan(r!.snippet, t.hechos), `${t.contrato}: «${r!.snippet}»`).toEqual([])
    }
  })

  it('lleva en la lista corta léxica lo mismo, para la declaración que lo citó', () => {
    // Sólo los dos que el suelo léxico (0,20 de solapamiento) deja pasar: el
    // carril bici no comparte bastantes palabras con «algo más de 330.000 euros
    // para toda una actuación del carril bici», y le llega al motor por la mitad
    // semántica, cuyo snippet es el de la prueba de arriba.
    for (const t of LOS_TRES.filter((x) => x.contrato !== '5054473')) {
      const lista = shortlistCandidates(
        { claim: declaracion(t.declaracion), tenders: { contracts: [fila(t.contrato)] } },
        8,
      )
      expect(lista, `${t.declaracion}: el contrato no entra en su lista corta`).toHaveLength(1)
      expect(faltan(lista[0].snippet, t.hechos), `${t.contrato}: «${lista[0].snippet}»`).toEqual([])
    }
  })
})

describe('un registro llega al modelo de una sola manera', () => {
  it('el corpus y la lista corta léxica componen el mismo snippet de cada fila', () => {
    type Fila = Record<string, unknown>
    const filas: { datos: { contracts?: Fila[]; tenders?: Fila[] }; r: Fila }[] = [
      ...(F.contracts as Fila[]).map((r) => ({ datos: { contracts: [r] }, r })),
      ...(F.tenders as Fila[]).map((r) => ({ datos: { tenders: [r] }, r })),
    ]
    expect(filas).toHaveLength(14)
    for (const { datos, r } of filas) {
      const corpus = buildTenderRows(datos)
      expect(corpus).toHaveLength(1)
      // Una declaración que es el propio título pasa siempre el suelo léxico, y
      // sin cifra no hay nada de la declaración que pueda colarse en el snippet.
      const claim = {
        ...declaracion('k4olcs-018-afi-1077bc'),
        verbatim: String(r.title),
        context: '',
        entities: {},
      } as PlenoClaim
      const lista = shortlistCandidates({ claim, tenders: datos }, 8)
      expect(lista).toHaveLength(1)
      expect(lista[0].snippet, String(r.id)).toBe(corpus[0].snippet)
    }
  })
})

/** `2024-05-29` → `29-05-2024`, sin pasar por `Date`. */
const dia = (iso: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}
const positivo = (v: unknown) => {
  const n = Number(v)
  return v != null && Number.isFinite(n) && n > 0 ? n : null
}
/** Un importe tal y como lo compara `looselyContains`: sus céntimos, en cifras. */
const centimos = (v: number) => String(Math.round(v * 100))

/**
 * Los hechos de una fila de tenders.json que su snippet tiene que llevar
 * enteros, derivados de la fila y no del constructor.
 */
function hechosDeLaFila(r: Record<string, unknown>): string[] {
  const h: string[] = []
  if (procurementStatusKind(r.status as string) !== null) h.push(String(r.status))
  if (r.documentNumber) h.push(String(r.documentNumber))
  const lote = positivo(r.batchNumber)
  if (lote) h.push(`lote ${lote}`)
  for (const campo of [
    'finalAmount',
    'finalAmountNoTaxes',
    'initialAmount',
    'initialAmountNoTaxes',
  ]) {
    const v = positivo(r[campo])
    if (v) h.push(centimos(v))
  }
  if (r.assignee) h.push(String(r.assignee))
  for (const fecha of [dia(r.awardDate), dia(r.formalizedDate)]) if (fecha) h.push(fecha)
  return h
}

describe('sobre el snapshot publicado', () => {
  const T = JSON.parse(readFileSync(resolve('public/data/tenders.json'), 'utf8'))

  it('ningún contrato pierde un hecho: estado, importes, adjudicataria y fechas llegan enteros', () => {
    const filas = buildTenderRows(T)
    // Una fila del corpus por fila de la fuente: los contratos por su id, las
    // licitaciones con su clave, que es la del corpus y no una copia.
    const fuente = new Map<string, Record<string, unknown>>()
    for (const r of T.contracts as Record<string, unknown>[]) fuente.set(String(r.id), r)
    for (const r of T.tenders as Record<string, unknown>[])
      fuente.set(CLAVE_DE_LICITACION + String(r.id), r)
    const conHechosPerdidos: string[] = []
    for (const f of filas) {
      const r = fuente.get(f.sourceId)
      expect(r, `${f.sourceId} sin fila en tenders.json`).toBeDefined()
      if (!r) continue
      if (faltan(f.snippet, hechosDeLaFila(r)).length) conHechosPerdidos.push(f.sourceId)
      // `unknown` es el centinela de Gobierto: «no consta», nunca un estado.
      expect(f.snippet, f.sourceId).not.toMatch(/\bunknown\b/)
    }
    // Que la comprobación miró algo: el corpus de contratos no es pequeño.
    expect(filas.length).toBeGreaterThan(800)
    expect(conHechosPerdidos).toEqual([])
  })
})
