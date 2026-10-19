import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseRibalicitaTenders,
  estadoDeLicitacion,
  ESTADO_DE_PLACSP,
  PLACSP_DE_LICITACION_GOBIERTO,
  TENDER_STATUS,
} from '../src/scraper/tenders'
import { procurementStatusKind } from '../src/lib/contract-status.js'
import { verifyClaim, TENDER_NOT_DONE_STATUSES } from '../src/scraper/claim-verifier'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

/**
 * Las palabras de Gobierto para el estado de una LICITACIÓN no dicen lo que
 * dicen.
 *
 * El 2026-10-19 se cotejaron 51 licitaciones de `tenders.json`, de todos los
 * estados y de 2017 a 2026, con el «Estado de la licitación» de su ficha en la
 * Plataforma de Contratación (tests/fixtures/placsp_estado-licitacion_2026-10-19.json):
 *
 *   revoked                → Adjudicada (13 de 14)
 *   formalized             → Anulada (2 de 2)
 *   void                   → Evaluación (7 de 7)
 *   provisionally_awarded  → Evaluación (9 de 10)
 *   awarded                → Resuelta (9 de 9)
 *   abandoned              → mezcla: Evaluación Previa, Parcialmente adjudicada
 *
 * No es el retraso de Gobierto: las de 2018–2024 dan los mismos pares. La tabla
 * de CONTRATOS sí dice lo que dice (55V/2024: contrato `awarded`, Adjudicada).
 *
 * Leído al pie de la letra, `tenders.json` publicaba «revocada» sobre 114
 * licitaciones adjudicadas, el verificador podía desmentir una obra con una
 * licitación adjudicada y tomaba por firmada una anulada, y /hallazgos ponía
 * «Provisional» junto a la 41/2018, que la Plataforma tiene en evaluación.
 */

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/placsp_estado-licitacion_2026-10-19.json'), 'utf8'),
) as {
  filas: { id: string; expediente: string | null; gobierto: string; placsp: string | null }[]
}

const CABECERA =
  'id,title,document_number,permalink,status,minor_contract,contract_type,submission_date,' +
  'open_proposals_date,number_of_batches,contractor,contractor_id,contractor_type,' +
  'contract_value,initial_amount,initial_amount_no_taxes,cpvs,process_type,category_id,category_title'

function csvDe(filas: { id: string; status: string; title?: string; permalink?: string }[]) {
  return [
    CABECERA,
    ...filas.map(
      (f) =>
        `"${f.id}","${f.title ?? 'Obra ' + f.id}","${f.id}/2024","${f.permalink ?? 'https://x/' + f.id}",` +
        `"${f.status}","f","works","2024-10-30","2024-10-30",,"Ayuntamiento","1","Ayuntamiento",` +
        `"100","121","100","45000000","open","1","construction"`,
    ),
  ].join('\n')
}

describe('la medida: cada palabra de Gobierto contra lo que dice la Plataforma', () => {
  const medidas = FIXTURE.filas.filter((f) => f.placsp !== null)

  it('mide algo', () => {
    expect(medidas.length).toBeGreaterThanOrEqual(45)
  })

  it('todo estado que la Plataforma mostró tiene traducción', () => {
    const sin = [...new Set(medidas.map((f) => f.placsp as string))].filter(
      (p) => !(p in ESTADO_DE_PLACSP),
    )
    expect(sin, `estados de PLACSP sin traducir: ${sin.join(', ')}`).toEqual([])
  })

  it('la traducción coincide en su clase con la Plataforma en ≥ 95 % de lo medido', () => {
    let comparadas = 0
    const discrepan: string[] = []
    for (const f of medidas) {
      const traducido = estadoDeLicitacion(f.gobierto)
      // El centinela no afirma nada, así que no puede discrepar.
      if (procurementStatusKind(traducido) === null) continue
      comparadas += 1
      const verdad = ESTADO_DE_PLACSP[f.placsp as string]
      if (procurementStatusKind(traducido) !== procurementStatusKind(verdad))
        discrepan.push(`${f.expediente}: ${f.gobierto}→${traducido}, PLACSP ${f.placsp}`)
    }
    expect(comparadas).toBeGreaterThanOrEqual(40)
    expect(discrepan.length / comparadas, discrepan.join('\n')).toBeLessThanOrEqual(0.05)
  })

  it('una palabra va al centinela sólo si lo medido detrás de ella es una mezcla', () => {
    // Regla 3: «no se puede decir» se dice con el centinela, nunca con un valor.
    // Pero el centinela tampoco es un escondite: si todo lo que hay detrás de
    // una palabra es de una clase, esa clase es su traducción.
    const porPalabra = new Map<string, Set<string | null>>()
    for (const f of medidas) {
      if (f.gobierto === 'unknown') continue // el blanco de Gobierto, ya centinela
      const clases = porPalabra.get(f.gobierto) ?? new Set()
      clases.add(procurementStatusKind(ESTADO_DE_PLACSP[f.placsp as string]))
      porPalabra.set(f.gobierto, clases)
    }
    for (const [palabra, clases] of porPalabra) {
      if (PLACSP_DE_LICITACION_GOBIERTO[palabra] === null)
        expect(clases.size, `«${palabra}» va al centinela sin ser una mezcla`).toBeGreaterThan(1)
    }
    expect(PLACSP_DE_LICITACION_GOBIERTO.abandoned).toBeNull()
  })

  it('una palabra que nadie ha medido no se cree: va al centinela', () => {
    // El vocabulario está corrido; una palabra nueva de Gobierto puede significar
    // cualquier cosa hasta que alguien la coteje con la Plataforma.
    expect(estadoDeLicitacion('withdrawn')).toBe('unknown')
    expect(estadoDeLicitacion('open')).toBe('unknown')
    expect(estadoDeLicitacion(undefined)).toBe('unknown')
  })
})

describe('el parser traduce y guarda la palabra de Gobierto', () => {
  const filas = parseRibalicitaTenders(
    csvDe([
      { id: '4584172', status: 'revoked' }, // 55V/2024: Adjudicada
      { id: '1488067', status: 'formalized' }, // 1SDA/2021: Anulada
      { id: '76284', status: 'provisionally_awarded' }, // 41/2018: Evaluación
      { id: '5210154', status: 'void' }, // 37/2026: Evaluación
      { id: '5190772', status: 'abandoned' }, // 80/2025: Parcialmente adjudicada
    ]),
  )
  const de = (id: string) => filas.find((f) => f.id === id)!

  it('una licitación adjudicada no sale revocada', () => {
    expect(procurementStatusKind(de('4584172').status)).toBe('committed')
  })

  it('una licitación anulada no sale firmada', () => {
    expect(procurementStatusKind(de('1488067').status)).toBe('cancelled')
  })

  it('las que la Plataforma tiene en evaluación salen en evaluación', () => {
    expect(de('76284').status).toBe(de('5210154').status)
    expect(procurementStatusKind(de('76284').status)).toBe('in-flight')
  })

  it('la mezcla sale como centinela', () => {
    expect(procurementStatusKind(de('5190772').status)).toBeNull()
  })

  it('cada fila conserva la palabra de Gobierto, para cotejarla', () => {
    expect(de('4584172').sourceStatus).toBe('revoked')
    expect(de('1488067').sourceStatus).toBe('formalized')
  })

  it('todo estado traducido está en el vocabulario de licitaciones', () => {
    for (const f of filas) expect(TENDER_STATUS.has(f.status), f.status).toBe(true)
  })

  it('el fixture real no se vacía en el centinela (regla 1: techo de unknown)', () => {
    const csv = readFileSync(
      resolve('tests/fixtures/ribalicita_licitaciones_2026-04-19.csv'),
      'utf8',
    )
    const todas = parseRibalicitaTenders(csv)
    expect(todas.length).toBeGreaterThan(100)
    const centinela = todas.filter((t) => t.status === 'unknown').length
    expect(centinela / todas.length).toBeLessThan(0.1)
  })
})

function obraTerminada(entidad: string): PlenoClaim {
  return {
    id: 'lic-001-cit-abc123',
    plenoId: 'lic',
    plenoDate: '2026-03-09',
    segmentIndex: 0,
    type: 'cita_obra',
    speakerGroup: 'PSOE',
    verbatim: 'la obra ya está terminada',
    context: 'contexto contexto contexto contexto contexto',
    topic: 'urbanismo',
    entities: { referencedEntity: entidad },
    confidence: 0.8,
    reasoning: 'cita de obra',
    requiresHumanApproval: true,
  }
}

describe('lo que el verificador deduce de una licitación traducida', () => {
  const titulo = 'Reurbanización y mejora de la calle Joan Martorell'
  const con = (status: string) => ({
    contracts: [],
    tenders: parseRibalicitaTenders(csvDe([{ id: '1', status, title: titulo }])),
  })

  it('una licitación adjudicada (Gobierto «revoked») no desmiente una obra terminada', () => {
    const v = verifyClaim({ claim: obraTerminada('calle Joan Martorell'), tenders: con('revoked') })
    expect(v.verdict).not.toBe('contradicho')
  })

  it('una licitación anulada (Gobierto «formalized») sí la desmiente', () => {
    const v = verifyClaim({
      claim: obraTerminada('calle Joan Martorell'),
      tenders: con('formalized'),
    })
    expect(v.verdict).toBe('contradicho')
  })

  it('una licitación todavía en evaluación también: no hay contrato bajo el que hacerla', () => {
    // Decisión del 2026-10-19: la evaluación cuenta como contratación que no
    // llegó a término, como ya contaba la adjudicación provisional.
    expect(TENDER_NOT_DONE_STATUSES.has(estadoDeLicitacion('void'))).toBe(true)
    const v = verifyClaim({ claim: obraTerminada('calle Joan Martorell'), tenders: con('void') })
    expect(v.verdict).toBe('contradicho')
  })
})
