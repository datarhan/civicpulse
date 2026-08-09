/**
 * Invariants over `public/data/pleno-findings.json` as it is published.
 *
 * The unit tests next door pin the CLI and the schema. These pin the file —
 * the artifact Vercel serves and /hallazgos renders — because every defect
 * repaired here reached a reader through the file and not through a function.
 *
 * Each block asserts that it EVALUATED SOMETHING before asserting that it
 * found nothing. Two suites in this repo were green while measuring nothing
 * (docs/DATA_INTEGRITY.md); a "no bad rows" test over an empty selection is
 * the same shape.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  CORRECTION_REMOVAL_FIELD_RE,
  validateFindingsSnapshot,
  type PlenoFinding,
  type PlenoFindingsSnapshot,
} from '../src/scraper/pleno-finding'
import {
  buildRecordDateIndex,
  emptyRecordDateGateReport,
  recordKnowableAt,
} from '../src/scraper/record-dates'

/**
 * Parsed RAW, deliberately — not through `validateFindingsSnapshot`.
 *
 * The validator strips the similarity annotation on the way through, so a
 * suite that reads the file through it asserts the strip works and says
 * nothing about the bytes Vercel serves. Ablation caught exactly that: with
 * `· sim=0.50` written back into the file by hand, the first version of this
 * suite stayed green. The browser has no validator — `useJsonFetch` hands the
 * parsed JSON straight to the page — so the file is what the reader gets, and
 * the file is what these tests must read.
 */
const snapshot = JSON.parse(
  readFileSync(resolve('public/data/pleno-findings.json'), 'utf8'),
) as PlenoFindingsSnapshot
const items = snapshot.items
const byId = (id: string): PlenoFinding => {
  const f = items.find((x) => x.id === id)
  if (!f) throw new Error(`fixture drift: ${id} is no longer in pleno-findings.json`)
  return f
}
const allRefs = items.flatMap((f) => [...f.crossChecked, ...f.contradiction])
const allCorrections = items.flatMap((f) => f.corrections ?? [])
const removals = allCorrections.filter((c) => CORRECTION_REMOVAL_FIELD_RE.test(c.field))

/**
 * Running totals over the whole published ledger. Pinned, not `> 0`: a batch
 * that silently skipped rows still satisfies a lower bound while retracting
 * nothing. Each review batch moves these two numbers and says so in its commit
 * message; every other assertion in this file is local to one finding.
 */
const TOTAL_CORRECTIONS = 116
const TOTAL_REMOVALS = 33

describe('published pleno findings — no matcher internals in reader-facing text', () => {
  it('no snippet carries the similarity annotation', () => {
    // One did: «Aplicativo área de policía local · … · unknown · sim=0.50»
    // rendered under «Documentos cotejados», presenting a cosine score as
    // part of the record it cites.
    expect(allRefs.length).toBeGreaterThan(0)
    const leaking = allRefs.filter((r) => r.snippet.includes('sim='))
    expect(leaking.map((r) => r.snippet)).toEqual([])
  })

  it('no summary, title or quote carries it either', () => {
    const prose = items.flatMap((f) => [f.title, f.summary, ...f.quotes.map((q) => q.text)])
    expect(prose.length).toBeGreaterThan(0)
    expect(prose.filter((s) => s.includes('sim='))).toEqual([])
  })

  it('every snippet fits the label the reader is shown', () => {
    expect(allRefs.every((r) => r.snippet.length > 0 && r.snippet.length <= 240)).toBe(true)
  })

  it('no summary or title publishes the `unknown` status sentinel as prose', () => {
    // Same class as `sim=`, one layer further in: `f-2026-01-19-cit-c80e68`
    // pasted a raw cotejo excerpt inside the quotation marks of a contract
    // TITLE — «… complejo deportivo La Malla. · Ayuntamiento de Riba-roja de
    // Túria · estado: unknown» — so a reader saw the sentinel as part of the
    // expediente's name. `unknown` is the "could not determine" marker, and a
    // sentinel is never a value (docs/DATA_INTEGRITY.md, rule 3). Here it was
    // not even accurate: that contract is `formalized` in tenders.json.
    //
    // Scoped to PROSE on purpose. Cotejo snippets still carry the sentinel on
    // several findings; that is the snippet builder's text, one string the
    // curator CLI has no path to edit, and pretending otherwise by widening
    // this assertion would make it fail for a reason nobody in this batch
    // could act on. What it catches is a summary or title quoting an excerpt
    // raw instead of naming the record.
    const prose = items.map((f) => `${f.title}\n${f.summary}`)
    expect(prose.length).toBe(items.length)
    expect(prose.filter((s) => /estado:\s*unknown/i.test(s))).toEqual([])
  })
})

describe('published pleno findings — a removal does not republish what it removed', () => {
  it('there are removals to check, and exactly as many as were issued', () => {
    // The measuring assertion. Everything below is vacuously true on an empty
    // selection, which is precisely how a green suite hides a regression.
    //
    // Pinned to a count, not to `> 0`: the lote-1 review batch added eleven
    // `crossChecked.<i>` retractions to b8fea6f's four, lote-2 another seven
    // and lote-3 nine more plus a quote, and a run that skipped rows would
    // still satisfy `> 0` while retracting nothing.
    expect(removals.length).toBe(TOTAL_REMOVALS)
    expect(removals.filter((c) => c.field.startsWith('quote.'))).toHaveLength(3)
    expect(removals.filter((c) => c.field.startsWith('crossChecked.'))).toHaveLength(30)
  })

  it('records a digest and a marker, never the removed row', () => {
    for (const c of removals) {
      const noun = c.field.startsWith('quote.') ? 'cita' : 'documento cotejado'
      expect(c.original).toMatch(new RegExp(`^${noun} · sha256:[0-9a-f]{12}$`))
      expect(c.corrected).toMatch(/^retirad[ao] del hallazgo$/)
    }
  })

  it('no removal reason names anything — Paso 2 over the published file', () => {
    // `revisar-borrador` Paso 2: the note describes the CRITERION, never the
    // material. Three biographies had to be corrected twice on 2026-07-31
    // because their notes named exactly what the exclusion protected.
    //
    // Expressed WITHOUT a denylist of the removed names, which would put them
    // back in the repository under a different filename: a removal reason
    // must contain no proper noun at all. That is strictly stronger than "no
    // proper noun from the removed row", and it needs nothing but this file.
    const offences: string[] = []
    for (const c of removals) {
      for (const m of c.reason.matchAll(/\p{Lu}[\p{L}\p{M}’'-]*/gu)) {
        const before = c.reason.slice(0, m.index).trimEnd()
        if (before.length === 0 || /[.!?:;]$/.test(before)) continue
        offences.push(`${c.field}: «${m[0]}»`)
      }
    }
    expect(offences).toEqual([])
  })

  it('every reason still explains itself at IFCN length', () => {
    expect(removals.every((c) => c.reason.trim().length >= 20)).toBe(true)
    expect(removals.every((c) => c.editor.length > 1)).toBe(true)
  })
})

describe('published pleno findings — the three retracted in b8fea6f', () => {
  /**
   * Each block asserts BOTH halves: the item is gone, AND the neighbours it
   * sat between are exactly as they were. A correction that also perturbs
   * adjacent content has to go red — that is the whole reason the surviving
   * rows are pinned by value here rather than by count.
   */

  it('f-2025-12-01-acu-51aaa3 stands on its two salvoconductos quotes', () => {
    const f = byId('f-2025-12-01-acu-51aaa3')
    expect(f.quotes).toHaveLength(2)
    expect(f.quotes.map((q) => q.sourceClaimId)).toEqual([
      'qz6weg-192-acu-975308',
      'qz6weg-193-acu-7589c9',
    ])
    expect(f.quotes.map((q) => q.speakerGroup)).toEqual([null, 'PSOE'])
    expect(f.quotes.every((q) => q.text.includes('salvoconductos'))).toBe(true)
    // The summary is about salvoconductos and never used the removed quote,
    // so it must not have moved.
    expect(f.summary).toContain('salvoconductos')
    expect(f.crossChecked).toHaveLength(3)
    expect(f.corrections?.map((c) => c.field)).toEqual(['summary', 'quote.0'])
  })

  it('f-2025-10-06-acu-bba0e9 keeps all four quotes and the refs that name nobody', () => {
    const f = byId('f-2025-10-06-acu-bba0e9')
    // Untouched: this finding's quotes were never in scope.
    expect(f.quotes).toHaveLength(4)
    expect(f.quotes.map((q) => q.speakerGroup)).toEqual(['PSOE', 'VOX', 'PP', 'PP'])
    // The bloc-attributed VOX quote and the summary sentence it supports stay:
    // whether to publish them at all is a curator's call, not a cleanup's.
    expect(f.summary).toContain('Itziar Moreno')
    // Three refs left, and not one of them carries a person's name.
    expect(f.crossChecked).toHaveLength(4)
    expect(f.crossChecked.filter((r) => r.kind === 'tender')).toHaveLength(3)
    expect(f.crossChecked.some((r) => r.kind === 'pleno-video')).toBe(true)
    expect(f.corrections?.map((c) => c.field)).toEqual(['summary', 'crossChecked.1'])
  })

  it('f-2025-10-06-cit-591d40 no longer anchors the debate to an unrelated expediente', () => {
    const f = byId('f-2025-10-06-cit-591d40')
    // The sentence that presented a contract as the debate's context is gone…
    expect(f.summary).not.toContain('El debate coincide')
    // …and the two sentences that carried the finding are verbatim intact.
    expect(f.summary).toContain('unidad de policía local que asiste a mujeres vulnerables')
    expect(f.summary).toContain('pulseras telemáticas de control de agresores')
    // Three quotes: the two PSOE ones the summary uses, and the PP one.
    expect(f.quotes).toHaveLength(3)
    expect(f.quotes.map((q) => q.speakerGroup)).toEqual(['PSOE', 'PSOE', 'PP'])
    expect(f.quotes.every((q) => q.speakerGroup !== null)).toBe(true)
    expect(f.crossChecked).toHaveLength(3)
    expect(f.corrections?.map((c) => c.field)).toEqual([
      'summary',
      'quote.2',
      'crossChecked.2',
      'crossChecked.0',
    ])
  })

  it('every quote still keys a claim the finding declares, on every finding', () => {
    // Removing a quote must not orphan the citation trail. Checked across the
    // whole file, not just the three: the invariant is not local to them.
    let checked = 0
    for (const f of items) {
      const declared = new Set(f.sourceClaimIds)
      for (const q of f.quotes) {
        checked += 1
        expect(declared.has(q.sourceClaimId)).toBe(true)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})

// ─── Lote 1 · filas 0–17 de la cola de revisión ──────────────────────────────

/**
 * The fifteen findings corrected from the row 0–17 review of
 * `editorial/finding-support-queue.json`.
 *
 * Almost all of them share one defect and one remedy. Until 04761aa the
 * generator carried a standing instruction to «cite at least one corroborating
 * record» in every finding, so it manufactured a documentary link whenever the
 * cotejo found nothing — «esta discusión se enmarca en…», «coinciden con…»,
 * «se corrobora con…» over a contract that shared a word with the debate and
 * nothing else. Stripping that clause and letting the finding stand on what the
 * groups actually said is what the fixed generator now produces; it is not a
 * softening, and no replacement link was invented for any of them.
 *
 * Four rows needed something else, and they are the ones worth reading:
 *
 *   · ea9d47 — `omision-material`. The speaker hedged twice («por lo que
 *     entiendo», «al parecer») and the summary published a factive verb over a
 *     movement of public funds. The hedge is the speaker's, so it goes back.
 *   · 528973 — a false statement of ABSENCE. «Un único contrato relevante» and
 *     «no inversión en mejora» are both contradicted by `tenders.json`, and the
 *     summary then used that invented absence to endorse a group's thesis.
 *   · 2c074a — «el mismo grupo» fused two quotes that BOTH carry
 *     `speakerGroup: null`, manufacturing a shared speaker out of two unknowns.
 *   · d2b7bb — the summary inverted the quote: the speaker says they received
 *     no email, the summary said they sent none.
 *
 * `drops` / `keeps` are the halves that make each assertion measure something:
 * without `keeps`, a `not.toContain` over a mangled or emptied summary would
 * pass for the wrong reason.
 */
interface Lote1Case {
  id: string
  /** Corrections appended by this batch, in issue order. */
  added: string[]
  /** Corrections the finding already carried before it. */
  priorCorrections: number
  /** Fragments of the defect, which must be gone from title+summary. */
  drops: string[]
  /** Fragments the finding still stands on, which must be intact. */
  keeps: string[]
  /** Surviving crossChecked rows, in order: `kind` + the snippet's first 40 chars. */
  refs: string[]
  /** Surviving quotes, in order. Untouched by this batch — any change is a defect. */
  claims: string[]
  groups: (string | null)[]
}

const LOTE_1: Lote1Case[] = [
  {
    id: 'f-2026-05-11-acu-1adbf3',
    added: ['summary', 'crossChecked.3'],
    priorCorrections: 0,
    drops: ['se enmarca en el contexto de varios contratos', 'vivienda tutelada'],
    keeps: ['un mercado de vivienda tensionado', 'la constitucionalidad de la ley estatal'],
    refs: [
      'tender|El objeto del contrato es la prestación ',
      'tender|Contrato derivado del sistema dinámico d',
      'tender|Contratación servicio técnico redacción ',
      'pleno-video|Vídeo del pleno 2026-05-11 · YouTube',
    ],
    claims: [
      '10yl550-062-acu-1adbf3',
      '10yl550-170-acu-0a31a6',
      '10yl550-191-cit-9aa672',
      '10yl550-220-acu-0101aa',
    ],
    groups: ['PSOE', 'PP', 'PSOE', 'PSOE'],
  },
  {
    id: 'f-2026-05-11-acu-1e1bfa',
    added: ['summary', 'crossChecked.2'],
    priorCorrections: 2,
    // Two defects in one sentence: the invented link, and a judgement about a
    // named bloc's INTENT published as if it were an observed fact.
    drops: ['en referencia al registro', 'desviando parte del debate'],
    keeps: ['la valoración técnica de este Plan no es positiva', 'en materia de transportes'],
    refs: [
      'tender|Servicio de limpieza de caminos y viales',
      'tender|Contrato de suministro por renting de ve',
      'pleno-video|Vídeo del pleno 2026-05-11 · YouTube',
    ],
    claims: ['10yl550-096-acu-1e1bfa', '10yl550-253-acu-39e059', '10yl550-257-acu-666f3a'],
    groups: ['VOX', null, null],
  },
  {
    id: 'f-2026-05-11-acu-a870a4',
    added: ['summary', 'crossChecked.0'],
    priorCorrections: 1,
    drops: ['según el registro del tender correspondiente', 'Barranco Mandor'],
    keeps: ['la barrera está funcionando muy bien', 'nadie había solicitado nada'],
    refs: [
      'tender|Contrato de obras para la ejecución del ',
      'pleno-video|Vídeo del pleno 2026-05-11 · YouTube',
    ],
    claims: [
      '10yl550-045-acu-a870a4',
      '10yl550-054-acu-a487ce',
      '10yl550-346-cit-6ee502',
      '10yl550-046-acu-5c6faa',
    ],
    groups: ['PP', 'PP', null, 'PP'],
  },
  {
    id: 'f-2026-05-11-acu-da7902',
    added: ['summary', 'crossChecked.1'],
    priorCorrections: 0,
    drops: ['alumbrado ornamental navideño'],
    keeps: ['rectificar y pedir disculpas', 'sobre la fira de 2025'],
    refs: [
      'tender|contrato de servicios Biblioteca Aprenem',
      'pleno-video|Vídeo del pleno 2026-05-11 · YouTube',
    ],
    claims: ['10yl550-274-acu-da7902', '10yl550-274-acu-4cb575', '10yl550-294-acu-c8a5f4'],
    groups: ['PSOE', 'PSOE', 'PP'],
  },
  {
    id: 'f-2026-05-11-acu-ea9d47',
    added: ['summary'],
    priorCorrections: 1,
    // The factive verb is what went; nothing was retracted, so all four refs
    // and all four quotes must survive untouched.
    drops: ['señala el desvío de partidas'],
    keeps: ['«por lo que entiendo»', '«al parecer»', 'Un vehículo protección civil.'],
    refs: [
      'tender|Un vehículo protección civil. · Ayuntami',
      'tender|Contrato Menor de Suministro de dos perr',
      'tender|El estudio de criterios a  adoptar  en  ',
      'pleno-video|Vídeo del pleno 2026-05-11 · YouTube',
    ],
    claims: [
      '10yl550-092-acu-ea9d47',
      '10yl550-101-acu-701882',
      '10yl550-320-cit-a652c5',
      '10yl550-099-cit-423e57',
    ],
    groups: ['PSOE', 'PSOE', 'PP', null],
  },
  {
    id: 'f-2026-05-11-cit-73d3cf',
    added: ['summary', 'crossChecked.1'],
    priorCorrections: 2,
    drops: ['El consistorio cuenta con', 'vivienda tutelada'],
    keeps: ['zonas de mercado residencial tensionado', 'es para uso particular'],
    refs: [
      'tender|Contrato Menor de Obras de Sustitución d',
      'tender|Contrato servicio alquiler de vallas de ',
      'pleno-video|Vídeo del pleno 2026-05-11 · YouTube',
    ],
    claims: [
      '10yl550-158-cit-73d3cf',
      '10yl550-165-cit-3bf9ea',
      '10yl550-174-acu-bc807e',
      '10yl550-176-acu-e7dc83',
    ],
    groups: ['PSOE', null, 'PSOE', 'PSOE'],
  },
  {
    id: 'f-2026-05-11-cit-7f7619',
    added: ['summary', 'crossChecked.2'],
    priorCorrections: 1,
    drops: ['coinciden con el registro', '2 ascensores'],
    keeps: ['la competencia sobre esta infraestructura es de la Generalitat Valenciana'],
    refs: [
      'tender|Contrato de suministro e instalación de ',
      'tender|Contrato Menor:Realización de pruebas de',
      'tender|Amplicación parque Generalitat · Ayuntam',
      'pleno-video|Vídeo del pleno 2026-05-11 · YouTube',
    ],
    claims: [
      '10yl550-032-cit-7f7619',
      '10yl550-035-cit-d99202',
      '10yl550-037-cit-b6051b',
      '10yl550-038-acu-10a7a2',
    ],
    groups: ['PP', 'PP', null, 'PSOE'],
  },
  {
    id: 'f-2026-05-11-cit-a0a379',
    added: ['summary', 'crossChecked.1'],
    priorCorrections: 1,
    // The retracted expediente is `void` with a final amount of zero, and the
    // fact in dispute here is whether an edition of the fira happened at all.
    drops: ['alquiler de vallas de seguridad'],
    keeps: ['el impacto positivo de la campaña de 2024', 'la edición de 2025'],
    refs: [
      'tender|Contrato de servicio de puesta a disposi',
      'tender|Contrato de servicio alumbrado ornamenta',
      'pleno-video|Vídeo del pleno 2026-05-11 · YouTube',
    ],
    claims: [
      '10yl550-263-cit-a0a379',
      '10yl550-278-acu-ac00a4',
      '10yl550-280-cit-ab3a68',
      '10yl550-293-acu-8785eb',
    ],
    groups: [null, 'PP', null, 'PSOE'],
  },
  {
    id: 'f-2026-05-11-cit-bb5f00',
    added: ['summary', 'crossChecked.0'],
    priorCorrections: 1,
    // `corroborates` left `EvidenceStance` in 339fc58 because nothing upstream
    // establishes that a document supports a sentence. The word had survived
    // in the prose.
    drops: ['se corrobora', 'montaje y desmontaje de las carpas'],
    keeps: ['por mandato expreso de los comercios', 'los días 8, 9 y 10 de mayo'],
    refs: ['pleno-video|Vídeo del pleno 2026-05-11 · YouTube'],
    claims: [
      '10yl550-270-cit-bb5f00',
      '10yl550-268-cit-7f1b26',
      '10yl550-299-cit-ca1541',
      '10yl550-298-cit-400cf0',
    ],
    groups: [null, 'PSOE', null, null],
  },
  {
    id: 'f-2026-04-20-acu-93c1e8',
    added: ['summary', 'crossChecked.3'],
    priorCorrections: 0,
    drops: ['En relación con el ámbito escolar', 'comedor social'],
    keeps: ['la falta de personal y recursos en los centros educativos'],
    refs: [
      'tender|Contrato verbal de servicio de oficiales',
      'tender|El objeto del contrato es la elaboración',
      'tender|DESINFECCIÓN, DESINSECTACIÓN Y DESRATIZA',
      'pleno-video|Vídeo del pleno 2026-04-20 · YouTube',
    ],
    claims: [
      'k4olcs-064-acu-93c1e8',
      'k4olcs-049-acu-d8609a',
      'k4olcs-060-acu-897268',
      'k4olcs-048-acu-3746d4',
    ],
    groups: ['PSOE', 'PP', 'PSOE', 'VOX'],
  },
  {
    id: 'f-2026-04-20-cit-25e6ea',
    added: ['crossChecked.2'],
    priorCorrections: 0,
    // The one row of this batch whose summary was sound and stays byte for
    // byte: only a cotejo row went, and it was not a contract at all but a CPV
    // classification stub with no object and no award of its own.
    drops: ['80000000'],
    keeps: ['contratos relacionados con mejoras en centros educativos y servicios de formación'],
    refs: [
      'tender|contrato de obras de mejora de la eficie',
      'tender|Impartición clases de educación ambienta',
      'pleno-video|Vídeo del pleno 2026-04-20 · YouTube',
    ],
    claims: ['k4olcs-063-cit-25e6ea', 'k4olcs-032-cit-98a5be', 'k4olcs-077-pro-02ea8a'],
    groups: ['PSOE', 'PSOE', 'VOX'],
  },
  {
    id: 'f-2026-03-16-cit-528973',
    added: ['title', 'summary'],
    priorCorrections: 0,
    drops: ['un único contrato relevante', 'no inversión en mejora', 'compatible con la tesis'],
    keeps: ['una parte de las instalaciones deportivas', 'sin adjudicar su veracidad'],
    // The cotejo stays: the document is real and genuinely on-topic. What was
    // false was calling it the only one, so the prose is what had to change.
    refs: ['tender|Control microbiológico y físico-químico '],
    claims: ['ma87e0-104-cit-528973'],
    groups: ['PSOE'],
  },
  {
    id: 'f-2026-01-19-acu-2c074a',
    added: ['summary'],
    priorCorrections: 1,
    drops: ['el mismo grupo'],
    keeps: ['sin atribución determinada', 'contratos reiterados entre 2024 y 2026'],
    refs: [
      'tender|Contratación servicio dirección obra y d',
      'tender|El objeto del contrato es la prestación ',
      'tender|Contrato verbal de servicio de oficiales',
      'tender|El objeto contratación es la adquisición',
      'pleno-video|Vídeo del pleno 2026-01-19 · YouTube',
    ],
    claims: [
      '19gax3o-008-acu-2c074a',
      '19gax3o-090-acu-73f537',
      '19gax3o-176-acu-e24507',
      '19gax3o-021-acu-20b3ec',
    ],
    groups: [null, 'PSOE', null, null],
  },
  {
    id: 'f-2026-01-19-acu-d2b7bb',
    added: ['title', 'summary', 'crossChecked.0'],
    priorCorrections: 2,
    drops: ['no haber enviado', 'niega correos', 'Microsoft 365', 'corrobora'],
    keeps: ['no haber recibido correos electrónicos', 'no haber recibido correos,'],
    refs: [
      'tender|Caminos Rurales (4 rurales) · Ayuntamien',
      'tender|Contrato mixto suministro y servicio imp',
      'pleno-video|Vídeo del pleno 2026-01-19 · YouTube',
    ],
    claims: ['19gax3o-157-acu-d2b7bb', '19gax3o-173-acu-e3d549', '19gax3o-154-acu-3fbc54'],
    groups: ['PP', null, 'PSOE'],
  },
  {
    id: 'f-2026-01-19-afi-5b06c8',
    added: ['summary'],
    priorCorrections: 1,
    drops: ['del plan estratégico participado'],
    keeps: [
      'el grado de cumplimiento de lo planificado',
      'El registro municipal incluye varios contratos relacionados con seguimiento y control',
    ],
    refs: [
      'tender|Contrato de servicio de seguimiento y co',
      'tender|servicio de asesoramiento jurídico en ma',
      'tender|Mantenimiento SW Deepfreeze. · Ayuntamie',
      'tender|Servicio mantenimiento instalaciones tér',
      'tender|Mantenimiento de ascensores y elevadores',
      'pleno-video|Vídeo del pleno 2026-01-19 · YouTube',
    ],
    claims: ['19gax3o-025-afi-5b06c8', '19gax3o-017-cit-1a1dad', '19gax3o-120-acu-c9acb2'],
    groups: [null, 'PSOE', null],
  },
]

describe('published pleno findings — lote 1 of the row 0–17 review', () => {
  it('corrected exactly the fifteen findings the review made actionable', () => {
    // The count assertion the batch itself is measured by: a run that silently
    // skipped rows would leave every per-row block below still green, because
    // each of those only looks at rows it was handed.
    expect(LOTE_1).toHaveLength(15)
    const expected = LOTE_1.reduce((n, c) => n + c.added.length, 0)
    expect(expected).toBe(27)
    expect(allCorrections.length).toBe(TOTAL_CORRECTIONS)
    // …and the ids are real. `byId` throws on drift, so this also pins that
    // none of the fifteen was retracted wholesale instead of corrected.
    expect(LOTE_1.map((c) => byId(c.id).id)).toEqual(LOTE_1.map((c) => c.id))
  })

  it('the whole file still validates through the published schema', () => {
    // Read raw everywhere else in this suite on purpose; here the point is the
    // opposite — that the bytes Vercel serves also pass the validator every CLI
    // re-runs before writing.
    const parsed = validateFindingsSnapshot(
      readFileSync(resolve('public/data/pleno-findings.json'), 'utf8'),
    )
    expect(parsed.items).toHaveLength(items.length)
    expect(parsed.items.flatMap((f) => f.corrections ?? [])).toHaveLength(TOTAL_CORRECTIONS)
  })

  it.each(LOTE_1)('$id logs exactly the corrections that were issued', (c) => {
    const f = byId(c.id)
    const log = f.corrections ?? []
    expect(log).toHaveLength(c.priorCorrections + c.added.length)
    expect(log.slice(c.priorCorrections).map((x) => x.field)).toEqual(c.added)
    expect(log.slice(c.priorCorrections).every((x) => x.editor.length > 1)).toBe(true)
    // The corrections that were already there are untouched — a new entry must
    // append, never rewrite the trail.
    expect(log.slice(0, c.priorCorrections).every((x) => x.reason.trim().length >= 20)).toBe(true)
  })

  it.each(LOTE_1)('$id reads as a finished paragraph, not a truncated one', (c) => {
    const f = byId(c.id)
    // Schema floor, restated at the file level: a summary cut back to nothing
    // is the way a "strip the clause" fix fails.
    expect(f.summary.trim().length).toBeGreaterThanOrEqual(40)
    expect(f.title.trim().length).toBeGreaterThanOrEqual(10)
    // Removing a trailing clause must not leave the sentence hanging.
    expect(f.summary.trim()).toMatch(/[.!?»"']$/)
    expect(f.summary).not.toMatch(/[,;:]\s*$/)
    expect(f.summary).not.toMatch(/\s{2,}|\s+[.,;]/)
    expect(f.summary).not.toContain('«»')
  })

  it.each(LOTE_1)('$id no longer carries the defect, and still carries the finding', (c) => {
    const f = byId(c.id)
    const prose = `${f.title}\n${f.summary}`
    for (const d of c.drops) expect(prose, `«${d}» sigue en la prosa`).not.toContain(d)
    // The measuring half. Without it a summary emptied to «.» would satisfy
    // every `drops` assertion above and read as a pass.
    for (const k of c.keeps) expect(prose, `«${k}» debería seguir`).toContain(k)
  })

  it.each(LOTE_1)('$id keeps every neighbour the correction did not address', (c) => {
    const f = byId(c.id)
    // crossChecked, in order, by kind and the head of the published snippet:
    // a retraction that took the wrong row, or that perturbed a survivor's
    // text, changes this list.
    expect(f.crossChecked.map((r) => `${r.kind}|${r.snippet.slice(0, 40)}`)).toEqual(c.refs)
    expect(f.crossChecked.every((r) => /^https?:\/\//.test(r.ref))).toBe(true)
    // No quote was in scope for this batch, so every one of them, in order,
    // must be exactly where it was.
    expect(f.quotes.map((q) => q.sourceClaimId)).toEqual(c.claims)
    expect(f.quotes.map((q) => q.speakerGroup)).toEqual(c.groups)
    // contradiction[] gates severity=critical and is unreachable from the
    // removal path; all fifteen are informational and must stay that way.
    expect(f.contradiction).toEqual([])
    expect(f.severity).toBe('informational')
  })

  it('no reason written for this batch echoes what its removal took out', () => {
    // Paso 2 of `revisar-borrador`, applied to the eleven retractions this
    // batch issued rather than to the file as a whole: the note states the
    // CRITERION, never the material. The guard in the CLI reads capitalisation,
    // so it catches names and misses paraphrase — this restates the machine-
    // checkable half over the published bytes, where a hand-edit could land.
    const batchRemovals = LOTE_1.flatMap((c) =>
      (byId(c.id).corrections ?? [])
        .slice(c.priorCorrections)
        .filter((x) => CORRECTION_REMOVAL_FIELD_RE.test(x.field)),
    )
    expect(batchRemovals).toHaveLength(11)
    const offences: string[] = []
    for (const r of batchRemovals) {
      expect(r.original).toMatch(/^documento cotejado · sha256:[0-9a-f]{12}$/)
      expect(r.corrected).toBe('retirado del hallazgo')
      for (const m of r.reason.matchAll(/\p{Lu}[\p{L}\p{M}’'-]*/gu)) {
        const before = r.reason.slice(0, m.index).trimEnd()
        if (before.length === 0 || /[.!?:;]$/.test(before)) continue
        offences.push(`${r.field}: «${m[0]}»`)
      }
    }
    expect(offences).toEqual([])
  })

  it('no reason written for this batch pastes a URL, retraction or not', () => {
    // A retraction reason must not republish the document's address either —
    // and neither should the summary corrections beside them, which is why
    // this looks at all 27 and not only at the eleven removals.
    const batch = LOTE_1.flatMap((c) => (byId(c.id).corrections ?? []).slice(c.priorCorrections))
    expect(batch).toHaveLength(27)
    expect(batch.filter((r) => /https?:\/\//.test(r.reason))).toEqual([])
    expect(batch.every((r) => r.reason.trim().length >= 20)).toBe(true)
  })

  it('f-2026-03-16-cit-528973 no longer publishes an absence the corpus refutes', () => {
    // The one row of the batch whose defect was a false factual STATEMENT and
    // not a manufactured link. Both halves of it — «un único contrato
    // relevante» and «no inversión en mejora» — are contradicted by
    // public/data/tenders.json, and the summary then leaned on that invented
    // absence to endorse a group's position. Cross-checked here against the
    // same corpus the site publishes, so the assertion cannot drift from it.
    const t = JSON.parse(readFileSync(resolve('public/data/tenders.json'), 'utf8')) as {
      tenders: { title: string }[]
      contracts: { title: string; finalAmount?: number | null }[]
    }
    const rows = [...t.tenders, ...t.contracts]
    const deportivas = rows.filter((r) => /instalaciones deportivas/i.test(r.title))
    const polideportivo = rows.filter((r) => /polideportivo/i.test(r.title))
    // «Un único contrato» is false on the narrowest possible reading…
    expect(deportivas.length).toBeGreaterThan(1)
    expect(polideportivo.length).toBeGreaterThan(1)
    // …and «no inversión en mejora» is false too: these are works contracts.
    const mejora = rows.filter(
      (r) =>
        /polideportivo|pista deportiva/i.test(r.title) && /mejora|renovaci|obras/i.test(r.title),
    )
    expect(mejora.length).toBeGreaterThan(0)

    const f = byId('f-2026-03-16-cit-528973')
    expect(f.summary).not.toMatch(/único contrato/i)
    expect(f.summary).not.toMatch(/no inversión en mejora/i)
    expect(f.title).not.toMatch(/sólo contrato/i)
    // What is left is the quote's own content, and nothing more.
    expect(f.summary).toContain('una parte de las instalaciones deportivas')
  })
})

// ─── Lote 2 · filas 18–35 de la cola de revisión ─────────────────────────────

/**
 * The eleven findings corrected from the row 18–35 review of
 * `editorial/finding-support-queue.json`.
 *
 * Six are lote 1's defect again — the manufactured documentary link the
 * generator was required to produce until 04761aa — and take lote 1's remedy:
 * strip the clause, let the finding stand on what the groups said, retract the
 * expediente that clause named and nothing else. `crossChecked[]` is by
 * contract the record of what was cross-checked, not a filtered list of what
 * agrees, so a weak pairing no sentence named stays.
 *
 * The five that are not that are the ones worth reading:
 *
 *   · cd77e9 — MISATTRIBUTION. «El grupo PP manifiesta su negativa» came from
 *     «Yo, no el resto del PP. Yo, no.» The speaker was expressly separating
 *     their vote from their group's, and the summary published the opposite.
 *   · 7c65c5 — MISATTRIBUTION. «El PP señala que votaron en contra» came from
 *     «el día 16 de marzo USTEDES votaron en contra»: the PP was accusing
 *     another bench, and the summary's syntax turned the reproach back on the
 *     one making it. A second-person pronoun in a transcript does not identify
 *     who it addressed, so the deixis stays and the quote is verbatim.
 *   · 1e90e0 — MISATTRIBUTION, surviving a correction that was itself sound.
 *     August fixed the framing but left «en servicios relacionados con
 *     derrumbes y muro de contención» in place — words neither speaker says,
 *     imported from a NOVEMBER 2022 contract, inside a sentence that states
 *     they come from the intervention.
 *   · c905c3 — MISATTRIBUTION, against its own `priorReview`, which called it
 *     exemplary. The speaker describes a contract backed BY a pre-existing
 *     waste plan; the summary published a contract TO DRAFT the plan, which is
 *     exactly the expediente it cited. A plan cannot approve the contract that
 *     creates it. The earlier audit compared the contract's title with the
 *     summary, never the summary with the intervención.
 *   · 56214f — `omision-material`. «La ausencia de obras mayores en el
 *     registro corrobora parcialmente la queja» is corroboration from silence,
 *     and a health centre is not a municipal competence, so its absence from a
 *     MUNICIPAL contracting register is expected either way.
 *
 * Plus c80e68, whose prose was sound and leaked `· estado: unknown` into a
 * quoted contract title. That one needed no CLI extension: the sentinel was in
 * the summary, which `--field summary` already owns.
 */
interface Lote2Case {
  id: string
  /** Corrections appended by this batch, in issue order. */
  added: string[]
  /** Corrections the finding already carried before it. */
  priorCorrections: number
  /** Fragments of the defect, which must be gone from title+summary. */
  drops: string[]
  /** Fragments the finding still stands on, which must be intact. */
  keeps: string[]
  /** Surviving crossChecked rows, in order: `kind` + the snippet's first 40 chars. */
  refs: string[]
  /** Surviving quotes, in order. Untouched by this batch — any change is a defect. */
  claims: string[]
  groups: (string | null)[]
}

const LOTE_2: Lote2Case[] = [
  {
    id: 'f-2026-01-19-cit-3fd230',
    added: ['summary', 'crossChecked.0'],
    priorCorrections: 1,
    // A CLEANING contract for the pool cannot date the works, the opening or a
    // vote from 1989. The shared word was «piscina».
    drops: ['Este debate coincide con registros oficiales', 'Servicio de limpieza de piscina'],
    keeps: ['se inauguró en diciembre de 2012', 'se emitieron votos en contra en años anteriores'],
    refs: [
      'tender|Contrato basado en el SDA de obras para ',
      'pleno-video|Vídeo del pleno 2026-01-19 · YouTube',
    ],
    claims: [
      '19gax3o-149-cit-3fd230',
      '19gax3o-132-acu-a3b10d',
      '19gax3o-146-cit-288e9a',
      '19gax3o-147-acu-01da0f',
    ],
    groups: ['PSOE', null, 'PSOE', null],
  },
  {
    id: 'f-2026-01-19-cit-543cc1',
    added: ['summary', 'crossChecked.1'],
    priorCorrections: 1,
    // Two defects. The invented link was street lighting in the industrial
    // estate after the DANA — neither heating, nor sport, nor the complex. And
    // the summary read «la malla» BOTH ways at once, as the sports complex and
    // as a wire fence, publishing both as if each were established; the
    // transcript settles neither, so the speaker is quoted verbatim instead.
    drops: [
      'Estos puntos se reflejan en registros',
      'alumbrado público en zona industrial',
      'reparar la malla exterior debido a su deterioro',
    ],
    keeps: [
      'hay que ver toda la parte externa de la malla, está cayendo',
      'no permite determinar si se refiere al propio complejo o a un cerramiento',
    ],
    // The heating cotejo STAYS. The debate's own first quote is «El tema de la
    // instalación de térmicas», so it is a record genuinely on the subject;
    // what was false was the prose claiming it reflected the points.
    refs: [
      'tender|Servicio mantenimiento instalaciones tér',
      'tender|Contrato basado en el SDA de obras para ',
      'pleno-video|Vídeo del pleno 2026-01-19 · YouTube',
    ],
    claims: [
      '19gax3o-119-cit-543cc1',
      '19gax3o-114-acu-961675',
      '19gax3o-139-cit-be1832',
      '19gax3o-126-acu-d49e67',
    ],
    groups: [null, null, 'PP', 'PP'],
  },
  {
    id: 'f-2026-01-19-cit-c80e68',
    added: ['summary'],
    priorCorrections: 1,
    // The one row of this batch the review upheld. Nothing was retracted and
    // the claim it makes is unchanged — only the pasted sentinel went.
    drops: ['estado: unknown', '· Ayuntamiento de Riba-roja de Túria ·'],
    keeps: [
      "el registro municipal incluye el contrato 'Servicio mantenimiento instalaciones en complejo deportivo La Malla'",
      'la ausencia de una agenda de reconstrucción local',
    ],
    refs: [
      'tender|Contratación servicio dirección de obra ',
      'tender|Servicio mantenimiento instalaciones en ',
      'tender|Servicio de limpieza de piscina cubierta',
      'pleno-video|Vídeo del pleno 2026-01-19 · YouTube',
    ],
    claims: [
      '19gax3o-051-cit-c80e68',
      '19gax3o-055-cit-a80e52',
      '19gax3o-132-cit-35c4f5',
      '19gax3o-143-cit-a3a7a1',
    ],
    groups: ['VOX', 'VOX', null, null],
  },
  {
    id: 'f-2025-12-23-acu-cd77e9',
    added: ['summary', 'crossChecked.2'],
    priorCorrections: 1,
    drops: [
      'El grupo PP manifiesta su negativa',
      'El debate se enmarca en la documentación',
      'sistema de debate, voto electrónico',
    ],
    keeps: [
      'voto en contra a título individual',
      '«Yo, no el resto del PP»',
      'ninguna empresa competidora impugnó la adjudicación',
    ],
    refs: [
      'tender|LOTE 3 : Enlace camino c/ Dolçaina – c/ ',
      'tender|El objeto del contrato es la prestación ',
      'tender|Contrato por tramitación anticipada de s',
      'pleno-video|Vídeo del pleno 2025-12-23 · YouTube',
    ],
    claims: [
      '1qi8axv-060-acu-cd77e9',
      '1qi8axv-113-acu-192a53',
      '1qi8axv-071-acu-8906e2',
      '1qi8axv-045-acu-e5dbbb',
    ],
    groups: ['PSOE', 'PP', null, null],
  },
  {
    id: 'f-2025-12-23-cit-c905c3',
    added: ['summary', 'crossChecked.0'],
    priorCorrections: 1,
    // «grupo no identificado grupo», a duplicated word and a sentence opening
    // in lower case, was live prose too — mechanical residue of the `Otro`
    // fix of 2026-08-01.
    drops: [
      'un contrato para la elaboración del plan local de residuos',
      'El registro municipal incluye',
      'grupo no identificado grupo',
    ],
    keeps: [
      '«aprobado por un plan local de residuos» ya existente',
      'Un grupo no identificado menciona la necesidad de mejorar la recogida',
    ],
    refs: [
      'tender|Servicio limpieza · Ayuntamiento de Riba',
      'tender|Contrato administrativo para la contrata',
      'pleno-video|Vídeo del pleno 2025-12-23 · YouTube',
    ],
    claims: [
      '1qi8axv-052-cit-c905c3',
      '1qi8axv-052-cit-977367',
      '1qi8axv-057-afi-c1ba98',
      '1qi8axv-057-afi-e76c4d',
    ],
    groups: ['PSOE', 'PSOE', null, null],
  },
  {
    id: 'f-2025-09-08-acu-70a34f',
    added: ['summary', 'crossChecked.0'],
    priorCorrections: 0,
    drops: ['La actividad contractual del consistorio incluye', 'limpieza C.D. La Mallá'],
    keeps: ['el personal docente tuvo que limpiar las aulas', 'se solventó en pocos días'],
    refs: [
      'tender|Contrato de patrocinio entre el Ayuntami',
      'tender|Servicio mantenimiento instalaciones tér',
      'tender|Mantenimiento de las instalaciones contr',
      'pleno-video|Vídeo del pleno 2025-09-08 · YouTube',
    ],
    claims: [
      'c8kr44-231-acu-70a34f',
      'c8kr44-119-cit-e9c4b9',
      'c8kr44-242-cit-671430',
      'c8kr44-243-cit-be89b4',
    ],
    groups: ['PP', 'Compromís', 'PSOE', 'PSOE'],
  },
  {
    id: 'f-2025-07-31-acu-144947',
    added: ['summary', 'crossChecked.0'],
    priorCorrections: 0,
    // «al Conso.» was the excerpt cut mid-word, published as if it were the
    // end of the sentence.
    drops: ['gestiones provinciales reflejadas en', 'servicios Postales de Carta', 'al Conso.'],
    keeps: [
      'recurrido a entidades provinciales para reclamar fondos de 2024',
      'sus propuestas presupuestarias para dicho ejercicio no fueron atendidas',
    ],
    refs: [
      'tender|Contrato de servicio alumbrado ornamenta',
      'tender|Contrato verbal de servicio de oficiales',
      'pleno-video|Vídeo del pleno 2025-07-31 · YouTube',
    ],
    claims: ['rmtyr-141-acu-144947', 'rmtyr-021-acu-e0e848', 'rmtyr-189-acu-61aa87'],
    groups: ['PP', 'PP', 'Compromís'],
  },
  {
    id: 'f-2026-07-03-cit-1e90e0',
    added: ['summary', 'crossChecked.0'],
    priorCorrections: 3,
    drops: ['derrumbes y muro de contención', 'en servicios relacionados con'],
    keeps: [
      'suplantaba a Garbialdi.',
      'no recoge ningún contrato adjudicado a FCC',
      'sin corroboración documental',
    ],
    refs: [
      'tender|LOTE 3 : Enlace camino c/ Dolçaina – c/ ',
      'tender|Contrato de servicios para la realizació',
      'pleno-video|Vídeo del pleno 2026-07-03 · YouTube',
    ],
    claims: [
      '1237hbp-006-cit-1e90e0',
      '1237hbp-046-cit-df61b1',
      '1237hbp-029-cit-0d2047',
      '1237hbp-103-cit-4bf2c1',
    ],
    groups: [null, null, 'Compromís', null],
  },
  {
    id: 'f-2026-05-11-acu-7c65c5',
    added: ['summary'],
    priorCorrections: 1,
    // The second half went too: «el PSOE afirma no recoger al votar en contra
    // de los presupuestos» came from a broken fragment that means nothing in
    // Castilian and still left the PSOE voting against. With the first
    // sentence it published BOTH groups voting against the same budget.
    drops: ['El PP señala que votaron en contra', 'el PSOE afirma no recoger al votar'],
    keeps: [
      '«el día 16 de marzo ustedes votaron en contra',
      'sin que la transcripción registre a quién se dirigía',
      'no recoge ningún expediente de ese seguimiento',
    ],
    refs: [
      'tender|Suministro módulos elaboración de presup',
      'tender|Contrato Menor 01m/2022 de Servicio de E',
      'tender|Contrato de obras de escollera de piedra',
      'pleno-video|Vídeo del pleno 2026-05-11 · YouTube',
    ],
    claims: [
      '10yl550-330-acu-7c65c5',
      '10yl550-106-acu-dd1a86',
      '10yl550-254-cit-cb6e5f',
      '10yl550-300-acu-ae5a28',
    ],
    groups: ['PSOE', 'PP', 'PP', 'PP'],
  },
  {
    id: 'f-2026-03-16-cit-377216',
    added: ['title', 'summary'],
    priorCorrections: 0,
    // The hedge exculpated what was not in dispute (execution status) and took
    // as settled what the excerpt cannot support (that this is the same
    // building). The cotejo stays — it is real and well described; what was
    // wrong was calling it identified. The title asserted the link first.
    drops: [
      'del mismo edificio polivalente',
      'el vínculo documental existe',
      'el proyecto está activo',
      'con contrato en BD',
    ],
    keeps: ['no cita la Chemmachor ni permite confirmar', 'cubierta de un Edificio Polivalente'],
    refs: ['tender|Obras de impermeabilización cubierta Edi'],
    claims: ['ma87e0-104-cit-377216', 'ma87e0-162-cit-092d3e'],
    groups: ['PSOE', 'PSOE'],
  },
  {
    id: 'f-2026-03-16-cit-56214f',
    added: ['summary'],
    priorCorrections: 0,
    drops: ['corrobora', 'La ausencia de obras mayores'],
    keeps: [
      'carpa de triaje en la zona exterior del Centro de Salud',
      'no equivale a la inversión que el orador echa en falta',
    ],
    refs: ['tender|Contrato menor, suministro para la adqui'],
    claims: ['ma87e0-195-cit-56214f'],
    groups: [null],
  },
]

/**
 * The four rows where the defect was not a manufactured link but words or a
 * position put into a named bloc's mouth. Each pins the invented assertion as
 * a REGEX over the corrected title+summary — a substring would pass on a
 * reworded restatement of the same claim — beside the fragment of the source
 * the correction now rests on.
 */
const MISATRIBUCIONES = [
  {
    id: 'f-2025-12-23-acu-cd77e9',
    /** The bloc position the summary invented. */
    inventado: /(?:el )?grupo PP[^.]{0,60}(?:negativa|vot[óo] en contra|se opone)/i,
    /** …and what the source actually says, which the correction now carries. */
    verbatim: '«Yo, no el resto del PP»',
    quoteIndex: 1,
  },
  {
    id: 'f-2026-05-11-acu-7c65c5',
    inventado: /el PP (?:señala|afirma|indica)[^.]{0,40}vot(?:aron|ó|amos) en contra/i,
    verbatim: '«el día 16 de marzo ustedes votaron en contra',
    quoteIndex: 3,
  },
  {
    id: 'f-2026-07-03-cit-1e90e0',
    inventado: /derrumbes|muro de contenci[óo]n/i,
    // Unlike the other three, the remedy here was a deletion, not a re-quote:
    // what was invented was the SCOPE of the substitution. The positive half
    // is therefore that what the finding still says about the contract is the
    // speaker's own noun phrase.
    verbatim: 'contrato de emergencia',
    quoteIndex: 1,
  },
  {
    id: 'f-2025-12-23-cit-c905c3',
    inventado: /contrato (?:menor )?(?:de servicio )?para la elaboraci[óo]n del plan/i,
    verbatim: '«aprobado por un plan local de residuos»',
    quoteIndex: 0,
  },
]

describe('published pleno findings — lote 2 of the row 18–35 review', () => {
  it('corrected exactly the eleven findings the review made actionable', () => {
    // Same measuring assertion as lote 1: every per-row block below only looks
    // at rows it was handed, so a pass that skipped some stays green without
    // this. Ten rows came from the review's actionable list; the eleventh is
    // c80e68, whose sentinel turned out to be reachable with the CLI as it is.
    expect(LOTE_2).toHaveLength(11)
    const expected = LOTE_2.reduce((n, c) => n + c.added.length, 0)
    expect(expected).toBe(19)
    expect(LOTE_2.filter((c) => c.added.some((f) => f.startsWith('crossChecked.')))).toHaveLength(7)
    // No id overlaps lote 1: these are two disjoint passes over one file, and
    // a row corrected twice would need its `priorCorrections` re-read.
    const lote1 = new Set(LOTE_1.map((c) => c.id))
    expect(LOTE_2.filter((c) => lote1.has(c.id))).toEqual([])
    expect(LOTE_2.map((c) => byId(c.id).id)).toEqual(LOTE_2.map((c) => c.id))
  })

  it.each(LOTE_2)('$id logs exactly the corrections that were issued', (c) => {
    const f = byId(c.id)
    const log = f.corrections ?? []
    expect(log).toHaveLength(c.priorCorrections + c.added.length)
    expect(log.slice(c.priorCorrections).map((x) => x.field)).toEqual(c.added)
    expect(log.slice(c.priorCorrections).every((x) => x.editor.length > 1)).toBe(true)
    // The trail before this batch is untouched — a new entry appends.
    expect(log.slice(0, c.priorCorrections).every((x) => x.reason.trim().length >= 20)).toBe(true)
  })

  it.each(LOTE_2)('$id reads as a finished paragraph, not a truncated one', (c) => {
    const f = byId(c.id)
    expect(f.summary.trim().length).toBeGreaterThanOrEqual(40)
    expect(f.title.trim().length).toBeGreaterThanOrEqual(10)
    expect(f.summary.trim()).toMatch(/[.!?»"']$/)
    expect(f.summary).not.toMatch(/[,;:]\s*$/)
    expect(f.summary).not.toMatch(/\s{2,}|\s+[.,;]/)
    expect(f.summary).not.toContain('«»')
    // Every sentence starts with a capital. `c905c3` shipped «… establecidas.
    // un grupo no identificado grupo menciona …» for eight days: a lower-case
    // opening is the visible end of a mechanical edit that did not re-read the
    // paragraph, and the duplicated word came with it.
    for (const sentence of f.summary.split(/(?<=\.)\s+/)) {
      if (sentence.trim().length === 0) continue
      expect(sentence.trim(), `${c.id}: «${sentence.slice(0, 40)}…»`).toMatch(/^[«"'(\p{Lu}\d]/u)
    }
  })

  it.each(LOTE_2)('$id no longer carries the defect, and still carries the finding', (c) => {
    const f = byId(c.id)
    const prose = `${f.title}\n${f.summary}`
    for (const d of c.drops) expect(prose, `«${d}» sigue en la prosa`).not.toContain(d)
    // The measuring half: without it, a summary emptied to «.» would satisfy
    // every `drops` assertion above and read as a pass.
    for (const k of c.keeps) expect(prose, `«${k}» debería seguir`).toContain(k)
  })

  it.each(LOTE_2)('$id keeps every neighbour the correction did not address', (c) => {
    const f = byId(c.id)
    expect(f.crossChecked.map((r) => `${r.kind}|${r.snippet.slice(0, 40)}`)).toEqual(c.refs)
    expect(f.crossChecked.every((r) => /^https?:\/\//.test(r.ref))).toBe(true)
    // No quote was in scope for this batch either, so every one of them, in
    // order, must be exactly where it was.
    expect(f.quotes.map((q) => q.sourceClaimId)).toEqual(c.claims)
    expect(f.quotes.map((q) => q.speakerGroup)).toEqual(c.groups)
    expect(f.contradiction).toEqual([])
    expect(f.severity).toBe('informational')
  })

  it('every phrase this batch put in guillemets is verbatim in a quote it publishes', () => {
    // Six of the eleven now quote the speaker instead of paraphrasing them,
    // which is the remedy for a deictic or an ambiguity the transcript does
    // not settle. That remedy is only honest if the quoted words are the
    // speaker's, so each «…» span is matched against the finding's own quotes.
    let spans = 0
    for (const c of LOTE_2) {
      const f = byId(c.id)
      for (const m of f.summary.matchAll(/«([^»]+)»/g)) {
        spans += 1
        const needle = m[1].replace(/[.,;:]$/, '')
        expect(
          f.quotes.some((q) => q.text.includes(needle)),
          `${c.id}: «${needle}» no está en ninguna cita del hallazgo`,
        ).toBe(true)
      }
    }
    // The measuring assertion: zero spans would satisfy the loop silently.
    expect(spans).toBeGreaterThanOrEqual(4)
  })

  it.each(MISATRIBUCIONES)(
    '$id no longer asserts the bloc position it invented',
    ({ id, inventado, verbatim, quoteIndex }) => {
      const f = byId(id)
      const prose = `${f.title}\n${f.summary}`
      // A regex, not a substring: the point is that the CLAIM is gone, not
      // that one wording of it is.
      expect(prose, `${id} sigue atribuyendo la posición inventada`).not.toMatch(inventado)
      // …and the correction rests on the source, not on nothing: the fragment
      // it now carries is verbatim in the quote it came from.
      expect(prose).toContain(verbatim)
      const source = f.quotes[quoteIndex]
      expect(source, `${id}: la cita de origen ya no está`).toBeDefined()
      expect(source.text).toContain(verbatim.replace(/^«/, '').replace(/»$/, ''))
    },
  )

  it('c905c3: the anchored expediente is gone, and the corpus shows why it was wrong', () => {
    // The row that contradicts its own `priorReview` («ejemplar: cita
    // exactamente el expediente del que se hablaba»). The intervention
    // describes a contract backed BY an existing waste plan; the cited
    // expediente is the commission to WRITE that plan. Two different records,
    // and the logical order forbids the identification — a plan cannot approve
    // the contract that creates it. Verified against the published corpus so
    // the assertion cannot drift from it.
    const t = JSON.parse(readFileSync(resolve('public/data/tenders.json'), 'utf8')) as {
      tenders: { title: string }[]
      contracts: { title: string }[]
    }
    const rows = [...t.tenders, ...t.contracts]
    // Both records exist and are distinct: drafting the plan, and collecting.
    const redaccion = rows.filter((r) =>
      /elaboraci[óo]n del plan\s+local de residuos/i.test(r.title),
    )
    const recogida = rows.filter((r) => /recogida de residuos s[óo]lidos urbanos/i.test(r.title))
    expect(redaccion.length).toBeGreaterThan(0)
    expect(recogida.length).toBeGreaterThan(0)
    expect(redaccion.map((r) => r.title)).not.toEqual(recogida.map((r) => r.title))

    const f = byId('f-2025-12-23-cit-c905c3')
    // The drafting contract no longer hangs off the finding at all…
    expect(f.crossChecked.filter((r) => /elaboraci[óo]n del plan/i.test(r.snippet))).toEqual([])
    // …and no softer link was substituted for it: the collection expediente
    // was NOT quietly promoted into the prose to keep a documentary anchor.
    expect(f.summary).not.toMatch(/registro municipal|base de contrataci[óo]n|expediente/i)
  })

  it('1e90e0: no vocabulary of the retracted 2022 expediente survives in the prose', () => {
    // The sharpest form of this row's defect: the summary named an OBJECT for
    // the alleged substitution — «derrumbes y muro de contención» — that
    // neither speaker uttered, inside a sentence stating that both assertions
    // come from the intervention. The words came from the cotejo. Checked
    // against the corpus rather than against a hand-copied string, so it
    // cannot drift from the document it is about.
    const t = JSON.parse(readFileSync(resolve('public/data/tenders.json'), 'utf8')) as {
      tenders: { title: string }[]
      contracts: { title: string }[]
    }
    const doc = [...t.tenders, ...t.contracts].find((r) =>
      /contrato emergencia acondicionamiento de caminos/i.test(r.title),
    )
    expect(doc, 'el expediente de 2022 ya no está en el corpus').toBeDefined()
    expect(doc!.title).toMatch(/noviembre de 2022/)

    const f = byId('f-2026-07-03-cit-1e90e0')
    const prose = `${f.title}\n${f.summary}`
    // Every distinctive term of that 2022 title is absent from the prose…
    for (const term of ['derrumbe', 'muro de contención', 'mallazo', 'caminos', '2022']) {
      expect(doc!.title.toLowerCase(), `«${term}» ya no está en el documento`).toContain(
        term.toLowerCase(),
      )
      expect(prose.toLowerCase(), `«${term}» sigue en la prosa`).not.toContain(term.toLowerCase())
    }
    // …and the document itself no longer hangs off the finding.
    expect(f.crossChecked.filter((r) => /muro de contenci[óo]n/i.test(r.snippet))).toEqual([])
    // The disclaimer the previous correction added is intact: this row's fix
    // was additive to that one, not a replacement for it.
    expect(f.summary).toContain('no recoge ningún contrato adjudicado a FCC')
  })

  it('no reason written for this batch echoes what its removal took out', () => {
    // Paso 2 of `revisar-borrador` over lote 2's own seven retractions. The
    // CLI guard reads capitalisation, so it catches names and misses
    // paraphrase; this restates the machine-checkable half over the published
    // bytes, where a hand-edit could land.
    const batchRemovals = LOTE_2.flatMap((c) =>
      (byId(c.id).corrections ?? [])
        .slice(c.priorCorrections)
        .filter((x) => CORRECTION_REMOVAL_FIELD_RE.test(x.field)),
    )
    expect(batchRemovals).toHaveLength(7)
    const offences: string[] = []
    for (const r of batchRemovals) {
      expect(r.original).toMatch(/^documento cotejado · sha256:[0-9a-f]{12}$/)
      expect(r.corrected).toBe('retirado del hallazgo')
      for (const m of r.reason.matchAll(/\p{Lu}[\p{L}\p{M}’'-]*/gu)) {
        const before = r.reason.slice(0, m.index).trimEnd()
        if (before.length === 0 || /[.!?:;]$/.test(before)) continue
        offences.push(`${r.field}: «${m[0]}»`)
      }
    }
    expect(offences).toEqual([])
  })

  it('no reason written for this batch pastes a URL, retraction or not', () => {
    const batch = LOTE_2.flatMap((c) => (byId(c.id).corrections ?? []).slice(c.priorCorrections))
    expect(batch).toHaveLength(19)
    expect(batch.filter((r) => /https?:\/\//.test(r.reason))).toEqual([])
    expect(batch.every((r) => r.reason.trim().length >= 20)).toBe(true)
    // Three of the four misattribution reasons say so in as many words. The
    // correction trail is what a reader of /hallazgos sees beside the struck
    // text, and «se reescribe la atribución» is the part that matters to them.
    const attribution = batch.filter((r) => /atribuci[óo]n|atribu(?:ía|ían|ir)/i.test(r.reason))
    expect(attribution.length).toBeGreaterThanOrEqual(3)
  })
})

// ─── Lote 3 · filas 36–51 de la cola de revisión ─────────────────────────────

/**
 * The thirteen findings corrected from the row 36–51 review of
 * `editorial/finding-support-queue.json`, the last of the three passes.
 *
 * This batch is where the REMOVAL CRITERION had to be stated out loud, because
 * eight of its sixteen rows were tagged `ref-injustificada` — the prose is
 * sound, a cotejo arguably does not belong. Lotes 1 and 2 already held that
 * `crossChecked[]` is by contract the record of what was cross-checked and not
 * a filtered list of what agrees, so a merely WEAK pairing is not grounds for
 * retraction. A row comes out only when one of three things is true, and each
 * removal reason says which:
 *
 *   1. the deleted sentence NAMED it — the lote 1–2 rule (947479, d89862,
 *      6c4d24);
 *   2. it names an identifiable private individual with no role in the session
 *      — the b8fea6f precedent (8b29a9, cc8758, 34560f);
 *   3. it POST-DATES the session, so the council cannot have been discussing
 *      it (5238db ×3, and 2 and 3 together on the three above).
 *
 * Criterion 3 is not judgement: it is `recordKnowableAt` from
 * `src/scraper/record-dates.ts`, the gate 04761aa put in front of new runs,
 * applied here for consistency. It keys on the EARLIEST attested date of the
 * expediente, not the award — a procurement is debatable from the day it is
 * published — which is why the review's own reading of two rows did not
 * survive contact with it: `cc8758`'s vallados contract, «adjudicado 51 días
 * después», was already out to bid on 2025-12-18, a month BEFORE the session,
 * and stays; while `5238db` turned out to carry three post-dated refs, not the
 * one the review saw.
 *
 * Five rows needed prose, and three of those are the batch's real finding:
 *
 *   · 947479 — the worst row of the three passes. An apposition welded a
 *     contract's full title into a sentence about a different agenda item, and
 *     then published a VOTING OUTCOME that is checkably false: that contract
 *     was formalised two years before the session, and the only adjudicación
 *     voted that day passed unanimously with zero abstentions.
 *   · d89862 — «Ambos grupos hacen referencia al contrato menor … de una
 *     carpa»: none of the four quotes mentions a carpa, and the document is a
 *     COVID triage tent. Its third quote was the chair giving the floor,
 *     published as a PP quote.
 *   · 6c4d24 — «Ambos grupos mencionan contratos menores … de asesoramiento
 *     jurídico»: no quote mentions any contract; the bridge was the word
 *     «jurídico» inside «apoyo psicológico, social, jurídico».
 *   · a9546e — `tiempo-verbal`, against its own `priorReview`: «convalidó»
 *     over «proponemos al pleno convalidar», with no vote record either way.
 *   · a1ba00 — «La oposición atribuye…» over a quote whose `speakerGroup` is
 *     null, the invented-bloc shape lote 2 corrected four times.
 *
 * Three more rows carried smaller versions of the same thing and take the same
 * remedy — quote the speaker, delete the link nobody checked: b00839 published
 * a proposed point of agreement as a denuncia already filed; 34560f fused two
 * unattributed quotes into one subject and aimed an art. 198 breach at an
 * institution the quote does not name; 431140 tied an ILP to the DANA debate
 * on a quote that never says what the ILP is about. 66cd62 was a broken
 * sentence shipped by an automated sweep («un grupo no identificado grupo
 * señala») plus a euro figure glossed out of a degraded transcript. 3eebaf
 * supplied a noun («condiciones») the extract does not.
 */
interface Lote3Case {
  id: string
  /** Corrections appended by this batch, in issue order. */
  added: string[]
  /** Corrections the finding already carried before it. */
  priorCorrections: number
  /** Fragments of the defect, which must be gone from title+summary. */
  drops: string[]
  /** Fragments the finding still stands on, which must be intact. */
  keeps: string[]
  /** Surviving crossChecked rows, in order: `kind` + the snippet's first 40 chars. */
  refs: string[]
  /** Surviving quotes, in order. */
  claims: string[]
  groups: (string | null)[]
}

const LOTE_3: Lote3Case[] = [
  {
    id: 'f-2026-03-09-afi-a9546e',
    added: ['summary'],
    priorCorrections: 3,
    drops: ['convalidó un reconocimiento extrajudicial'],
    keeps: [
      'debatió la convalidación de un reconocimiento extrajudicial',
      'no consta aquí si llegó a aprobarse',
      // The sentence a previous audit called exemplary. It was never the
      // problem and must survive the verb fix untouched.
      'Sin contraste automático: la traza queda en el acta y el expediente interno',
    ],
    refs: [],
    claims: ['1sqj7is-001-afi-a1e446'],
    groups: [null],
  },
  {
    id: 'f-2026-01-19-afi-5238db',
    added: ['summary', 'crossChecked.2', 'crossChecked.1', 'crossChecked.0'],
    priorCorrections: 3,
    // The August correction fixed the framing and left the clause that named
    // the expediente. «adjudicado en 2026» is literally true and editorially
    // misleading: the year is exactly what hides the 79-day gap.
    drops: [
      'entre los documentos cotejados con esta sesión figura',
      'adjudicado en 2026',
      'mezcladores para duchas',
    ],
    keeps: [
      'arranca en 2017, así que no recoge ningún expediente de aquel periodo',
      'una auditoría realizada entre 2006 y 2012',
    ],
    refs: [
      'tender|Contrato de servicio alumbrado ornamenta',
      'tender|Contrato de obras de modificación de núc',
      'tender|Contrato de suministro e instalación de ',
      'pleno-video|Vídeo del pleno 2026-01-19 · YouTube',
    ],
    claims: [
      '19gax3o-114-afi-5238db',
      '19gax3o-010-cit-c48425',
      '19gax3o-186-acu-71dffe',
      '19gax3o-138-acu-9f3da3',
    ],
    groups: ['PP', 'Compromís', null, null],
  },
  {
    id: 'f-2026-01-19-cit-8b29a9',
    added: ['crossChecked.1'],
    priorCorrections: 1,
    // Prose untouched: the August correction already made it honest. Only the
    // ref that names a private individual and post-dates the session goes.
    drops: [],
    keeps: [
      'corresponde a la pavimentación del paseo Pacadar',
      'no consta en la contratación publicada ningún expediente que documente esa obra concreta',
    ],
    refs: [
      // The Pacadar cotejo STAYS: the prose cites it to deny it, which is what
      // earns a ref its place. And the €50,60 hornillo stays too — a weak
      // pairing no sentence names is not grounds for retraction.
      'tender|Contrato basado en el SDA de obras para ',
      'tender|Contrato verbal de suministro compra hor',
      'pleno-video|Vídeo del pleno 2026-01-19 · YouTube',
    ],
    claims: [
      '19gax3o-146-cit-8b29a9',
      '19gax3o-053-cit-3fa2de',
      '19gax3o-067-cit-dcdcf6',
      '19gax3o-139-cit-989b94',
    ],
    groups: ['PSOE', 'VOX', null, 'PP'],
  },
  {
    id: 'f-2025-12-23-acu-a1ba00',
    added: ['summary'],
    priorCorrections: 1,
    drops: [
      'La oposición atribuye',
      '(grupo no mayoritario)',
      // English word in published Spanish prose, from the generator.
      'la finding queda pendiente',
    ],
    keeps: [
      '«también tiene una responsabilidad política el equipo de gobierno»',
      'PSOE replica que la responsabilidad recae exclusivamente en la empresa',
      'el hallazgo queda pendiente del informe técnico municipal',
    ],
    refs: [],
    claims: [
      '1qi8axv-068-acu-a1ba00',
      '1qi8axv-020-acu-75c8b8',
      '1qi8axv-023-acu-3aa6fd',
      '1qi8axv-024-acu-2778ad',
    ],
    groups: [null, null, 'Compromís', 'PSOE'],
  },
  {
    id: 'f-2025-10-06-acu-b00839',
    added: ['summary'],
    priorCorrections: 1,
    drops: ['señala que denuncia ante la Consejería'],
    keeps: [
      '«Denunciar públicamente a la Consejería esas ampliaciones que nos han hecho»',
      'no documenta el sistema COMETA ni las demás cuestiones debatidas',
    ],
    // Nothing removed. Three of these four are lexical collisions — a FEMP
    // fleet policy matched to a prize received at the FEMP, a tow-truck
    // contract matched to «seguridad», a pest-control contract with no bridge
    // at all — and not one of them meets any of the three criteria: no
    // sentence names them, none names a person, none post-dates. They stay,
    // and the prose already says the register does not document the debate.
    refs: [
      'tender|Contrato mixto de suministro y servicio ',
      'tender|El objeto del presente contrato es la pr',
      'tender|Contrato privado de seguro flota vehícul',
      'tender|DESINFECCIÓN, DESINSECTACIÓN Y DESRATIZA',
      'pleno-video|Vídeo del pleno 2025-10-06 · YouTube',
    ],
    claims: [
      'otxq2c-078-acu-b00839',
      'otxq2c-088-acu-248640',
      'otxq2c-082-cit-915a1d',
      'otxq2c-048-cit-11d99a',
    ],
    groups: ['PSOE', 'PP', 'PSOE', 'VOX'],
  },
  {
    id: 'f-2026-04-20-cit-947479',
    added: ['summary', 'crossChecked.0'],
    priorCorrections: 1,
    drops: [
      'en el debate sobre la cartelería digital',
      'del ayuntam',
      'El debate sobre la adjudicación del sistema concluyó con la abstención',
    ],
    keeps: [
      'los informes técnicos de la intervención son desfavorables',
      'la alcaldía no estaba obligada a dar cuenta de dicho informe',
    ],
    refs: [
      'tender|El objeto del contrato es la prestación ',
      'tender|Aprobación expediente contrato administr',
      'tender|Mantenimiento control de acceso corporat',
      'pleno-video|Vídeo del pleno 2026-04-20 · YouTube',
    ],
    claims: [
      'k4olcs-019-cit-947479',
      'k4olcs-019-acu-940acd',
      'k4olcs-133-acu-e1bac8',
      'k4olcs-146-acu-8c6db4',
    ],
    groups: [null, null, 'PP', null],
  },
  {
    id: 'f-2026-01-19-cit-cc8758',
    added: ['crossChecked.0'],
    priorCorrections: 1,
    drops: [],
    keeps: [
      'el PP mencionó la necesidad de subsanar problemas en el pabellón y el complejo esportivo',
      'VOX, en cambio, denunció la falta de una agenda de reconstrucción',
    ],
    // The Pacadar cotejo STAYS here too, and this is the row where that costs
    // something to say. What a curator retired from its twin `8b29a9` on
    // 02-08 was the SENTENCE claiming the works were documented in that
    // expediente — the ref itself is still on the twin. Retracting it here
    // would be the inconsistency, not the fix.
    refs: [
      'tender|Obras Reconstrucción vallados de parcela',
      'tender|Contrato basado en el SDA de obras para ',
      'pleno-video|Vídeo del pleno 2026-01-19 · YouTube',
    ],
    claims: [
      '19gax3o-016-cit-cc8758',
      '19gax3o-067-cit-0c2099',
      '19gax3o-114-cit-b7641b',
      '19gax3o-050-acu-8d210f',
    ],
    groups: ['PSOE', null, 'PP', 'VOX'],
  },
  {
    id: 'f-2025-12-23-afi-3eebaf',
    added: ['summary'],
    priorCorrections: 1,
    drops: ['señala la inclusión de nuevas condiciones'],
    keeps: ['«no existía en el contrato anterior y en este sí»', 'sin precisar a qué se refiere'],
    // Two innovation contracts share nothing with the debate but the string
    // «asistencia técnica». No sentence names them, so they stay.
    refs: [
      'tender|Actualización y mantenimiento de la plat',
      'tender|Mantenimiento plataforma de administraci',
      'tender|Servicio de asistencia técnica para el i',
      'tender|Asistencia técnica creación espacio RIV,',
      'pleno-video|Vídeo del pleno 2025-12-23 · YouTube',
    ],
    claims: ['1qi8axv-122-afi-3eebaf', '1qi8axv-023-cit-3e6224', '1qi8axv-059-afi-3e1e17'],
    groups: ['VOX', 'Compromís', null],
  },
  {
    id: 'f-2025-12-01-acu-34560f',
    added: ['summary', 'crossChecked.2'],
    priorCorrections: 1,
    drops: ['Un grupo no identificado afirma que la Generalitat no está cumpliendo con sus pagos'],
    keeps: [
      '«El PP de la Generalitat no paga»',
      'la transcripción no identifica a quién se dirige ese «ustedes»',
    ],
    // «Amplicación parque Generalitat» stays. The bridge really is a park's
    // name read as a regional government, and it really does sit under a
    // finding about unpaid invoices — but the criterion is not "weak", and a
    // company is not the private individual the b8fea6f precedent is about.
    refs: [
      'tender|Amplicación parque Generalitat · Ayuntam',
      'tender|Contrato de servicio de puesta a disposi',
      'tender|Contrato de servicio de vigilancia y seg',
      'pleno-video|Vídeo del pleno 2025-12-01 · YouTube',
    ],
    claims: [
      'qz6weg-220-acu-34560f',
      'qz6weg-276-cit-5b837f',
      'qz6weg-216-acu-c41b8d',
      'qz6weg-163-acu-3a8bb0',
    ],
    groups: [null, 'Compromís', null, null],
  },
  {
    id: 'f-2025-12-01-cit-66cd62',
    added: ['summary'],
    priorCorrections: 1,
    drops: [
      // Shipped in production: the 01-08 sweep replaced «Otro» inside «Otro
      // grupo señala» and left a broken, lower-case-after-a-full-stop clause.
      'un grupo no identificado grupo señala',
      'un plan de rehabilitación por más de 900.000 euros',
    ],
    keeps: [
      '«El plan rehabilita más de 900.000 euros»',
      'no permite determinar de qué plan se trata',
      'Un grupo no identificado señala que esta iniciativa se extiende',
    ],
    // A 2019 music performance matched on the word «comercio». Weak, unnamed,
    // pre-dates the session: it stays.
    refs: [
      'tender|servicio de asesoramiento jurídico en ma',
      'tender|Actuación musical feria del comercio 201',
      'pleno-video|Vídeo del pleno 2025-12-01 · YouTube',
    ],
    claims: ['qz6weg-185-cit-66cd62', 'qz6weg-185-afi-eeb37d', 'qz6weg-278-cit-1e696b'],
    groups: ['PSOE', 'PSOE', null],
  },
  {
    id: 'f-2025-12-01-cit-d89862',
    added: ['summary', 'quote.2', 'crossChecked.0'],
    priorCorrections: 0,
    drops: ['Ambos grupos hacen referencia al contrato menor', 'carpa'],
    keeps: [
      'las obras en el Centro de Salud están en curso',
      'volver a la consellería en enero para revisar el avance del proyecto',
    ],
    refs: ['pleno-video|Vídeo del pleno 2025-12-01 · YouTube'],
    // Three quotes now: the chair's floor-giving line, published as a PP
    // quote, is gone. `sourceClaimIds` keeps its entry — the claim still
    // exists in the verified corpus and the finding's id derives from it.
    claims: ['qz6weg-239-cit-d89862', 'qz6weg-237-cit-7bff59', 'qz6weg-249-cit-3e02ef'],
    groups: ['PP', 'PP', 'PSOE'],
  },
  {
    id: 'f-2025-11-03-acu-431140',
    added: ['summary'],
    priorCorrections: 0,
    drops: ['una Iniciativa Legislativa Popular (ILP) sobre este tema'],
    keeps: [
      'que diferencia de mociones presentadas en legislaturas anteriores',
      'la intervención citada no dice sobre qué versa',
      'no recae exclusivamente en la Generalitat Valenciana',
    ],
    // The two civil-liability policies stay. Reading «responsabilidad civil»
    // as «responsabilidad política» is the most gratuitous pairing in the
    // three passes, and it is still only a pairing: no sentence names them.
    refs: [
      'tender|Seguro de responsabilidad civil/patrimon',
      'tender|Seguro de Responsabilidad Civil/patrimon',
      'tender|Contrato menor de renovación del actual ',
      'tender|Contrato de obra en la Pedanía El Oliver',
      'tender|Contrato de servicio reposición alumbrad',
      'tender|Contrato de suministro de adquisición de',
      'pleno-video|Vídeo del pleno 2025-11-03 · YouTube',
    ],
    claims: ['1du4rf5-115-acu-431140', '1du4rf5-237-cit-e34df3', '1du4rf5-111-acu-4f6c40'],
    groups: ['PP', 'PSOE', 'Compromís'],
  },
  {
    id: 'f-2025-10-06-cit-6c4d24',
    added: ['summary', 'crossChecked.1'],
    priorCorrections: 0,
    drops: [
      'Ambos grupos mencionan contratos menores',
      'asesoramiento jurídico y defensa procesal del Ayuntamiento.',
    ],
    keeps: [
      'trasladará puntos de acuerdo a varias instituciones',
      'destacando el compromiso con la protección infantil y adolescente',
    ],
    // Eight of the nine tender refs stay, several of them pure noise («obras
    // de reparación goteras», «Prevención ajeno»). Only the one the deleted
    // sentence named by its title comes out.
    refs: [
      'tender|Contrato menor, servicio para la elabora',
      'tender|Habilitación de locales de ctra. villama',
      'tender|Amplicación parque Generalitat · Ayuntam',
      'tender|Prevención ajeno: especialidades · Ayunt',
      'tender|obras de reparación goteras en edificios',
      'tender|Servicio Ayuda a Domicilio personas sin ',
      'tender|Programa municipal personas con diversid',
      'tender|Servicio para la ejecución del Plan de F',
      'pleno-video|Vídeo del pleno 2025-10-06 · YouTube',
    ],
    claims: [
      'otxq2c-037-cit-6c4d24',
      'otxq2c-072-cit-d5c436',
      'otxq2c-031-cit-8ffc2f',
      'otxq2c-024-cit-f56122',
    ],
    groups: ['PP', 'PSOE', 'PSOE', 'PSOE'],
  },
]

/**
 * The three rows the classifier filed as `sin-afirmacion-documental` and that
 * DID assert a documentary link — by apposition, or with a speech verb whose
 * object is a specific named document. Each pins the assertion as a REGEX over
 * the corrected prose, because what has to be gone is the CLAIM and not one
 * wording of it, and each names the document it welded on so a "fix" that only
 * reworded the sentence cannot pass.
 */
const AFIRMACIONES_DOCUMENTALES_FALSAS = [
  {
    id: 'f-2026-04-20-cit-947479',
    // Apposition: «… en el debate sobre la cartelería digital y el «Contrato
    // mixto suministro y servicio implantación de un sistema de debate …»».
    // No connector verb, and the whole claim carried by punctuation.
    inventado:
      /(?:en el )?debate sobre[^.]{0,80}(?:contrato|cartelería)|adjudicaci[óo]n del sistema[^.]{0,60}abstenci/i,
    /** Distinctive words of the welded-on expediente's title. */
    documento: /voto electr[óo]nico|salón de plenos del ayuntam/i,
    keeps: 'los informes técnicos de la intervención son desfavorables',
  },
  {
    id: 'f-2025-12-01-cit-d89862',
    // «hacen referencia a» is a documentary connector in everything but name,
    // and stronger than several that ARE in the list.
    inventado:
      /(?:ambos )?grupos[^.]{0,40}(?:hacen referencia|se refieren|mencionan)[^.]{0,40}contrato/i,
    documento: /carpa|triaje/i,
    keeps: 'las obras en el Centro de Salud están en curso',
  },
  {
    id: 'f-2025-10-06-cit-6c4d24',
    inventado:
      /(?:ambos )?grupos[^.]{0,40}(?:mencionan|citan|hacen referencia)[^.]{0,40}contratos?/i,
    documento: /asesoramiento jur[íi]dico|defensa procesal/i,
    keeps: 'El PSOE señala su colaboración en programas de prevención y atención',
  },
]

describe('published pleno findings — lote 3 of the row 36–51 review', () => {
  it('corrected exactly the thirteen findings this pass made actionable', () => {
    // Same measuring assertion as lotes 1 and 2: every per-row block below
    // only looks at rows it was handed, so a pass that skipped some stays
    // green without this.
    expect(LOTE_3).toHaveLength(13)
    const expected = LOTE_3.reduce((n, c) => n + c.added.length, 0)
    expect(expected).toBe(21)
    expect(LOTE_3.filter((c) => c.added.some((f) => f.startsWith('crossChecked.')))).toHaveLength(7)
    expect(allCorrections.length).toBe(TOTAL_CORRECTIONS)
    // Three disjoint passes over one file. A row corrected twice would need
    // its `priorCorrections` re-read, so an overlap is a defect, not a detail.
    const earlier = new Set([...LOTE_1.map((c) => c.id), ...LOTE_2.map((c) => c.id)])
    expect(LOTE_3.filter((c) => earlier.has(c.id))).toEqual([])
    expect(LOTE_3.map((c) => byId(c.id).id)).toEqual(LOTE_3.map((c) => c.id))
  })

  it('the two rows the review upheld were not touched at all', () => {
    // The other half of "corrected exactly thirteen". `b9b013` and `d94904`
    // were read against their extracts and held; a pass that improved them
    // anyway would be editing prose no review asked for.
    for (const id of ['f-2026-04-20-cit-b9b013', 'f-2026-03-09-acu-d94904']) {
      const f = byId(id)
      const log = f.corrections ?? []
      expect(
        log.filter((c) => c.correctedAt >= '2026-08-09T20:30:00.000Z'),
        `${id} recibió una corrección de este lote`,
      ).toEqual([])
    }
    // And the row b8fea6f already handled — `bba0e9`, whose surname-matched
    // architect ref came out there — gets nothing here either.
    expect(LOTE_3.map((c) => c.id)).not.toContain('f-2025-10-06-acu-bba0e9')
  })

  it.each(LOTE_3)('$id logs exactly the corrections that were issued', (c) => {
    const f = byId(c.id)
    const log = f.corrections ?? []
    expect(log).toHaveLength(c.priorCorrections + c.added.length)
    expect(log.slice(c.priorCorrections).map((x) => x.field)).toEqual(c.added)
    expect(log.slice(c.priorCorrections).every((x) => x.editor.length > 1)).toBe(true)
    // The trail before this batch is untouched — a new entry appends.
    expect(log.slice(0, c.priorCorrections).every((x) => x.reason.trim().length >= 20)).toBe(true)
  })

  it.each(LOTE_3)('$id reads as a finished paragraph, not a truncated one', (c) => {
    const f = byId(c.id)
    expect(f.summary.trim().length).toBeGreaterThanOrEqual(40)
    expect(f.title.trim().length).toBeGreaterThanOrEqual(10)
    expect(f.summary.trim()).toMatch(/[.!?»"']$/)
    expect(f.summary).not.toMatch(/[,;:]\s*$/)
    expect(f.summary).not.toMatch(/\s{2,}|\s+[.,;]/)
    expect(f.summary).not.toContain('«»')
    // `66cd62` shipped «… locales. un grupo no identificado grupo señala …»
    // for eight days — the visible end of a mechanical edit that never
    // re-read the paragraph, duplicated word and all. This batch is the one
    // that repairs it, so the assertion is not inherited decoration.
    for (const sentence of f.summary.split(/(?<=\.)\s+/)) {
      if (sentence.trim().length === 0) continue
      expect(sentence.trim(), `${c.id}: «${sentence.slice(0, 40)}…»`).toMatch(/^[«"'(\p{Lu}\d]/u)
    }
  })

  it.each(LOTE_3)('$id no longer carries the defect, and still carries the finding', (c) => {
    const f = byId(c.id)
    const prose = `${f.title}\n${f.summary}`
    for (const d of c.drops) expect(prose, `«${d}» sigue en la prosa`).not.toContain(d)
    // The measuring half: without it, a summary emptied to «.» would satisfy
    // every `drops` assertion above and read as a pass. Two rows of this batch
    // have an empty `drops` on purpose — their prose was already sound and
    // only a ref came out — so `keeps` is the ONLY thing measuring them.
    expect(c.keeps.length).toBeGreaterThan(0)
    for (const k of c.keeps) expect(prose, `«${k}» debería seguir`).toContain(k)
  })

  it.each(LOTE_3)('$id keeps every neighbour the correction did not address', (c) => {
    const f = byId(c.id)
    expect(f.crossChecked.map((r) => `${r.kind}|${r.snippet.slice(0, 40)}`)).toEqual(c.refs)
    expect(f.crossChecked.every((r) => /^https?:\/\//.test(r.ref))).toBe(true)
    expect(f.quotes.map((q) => q.sourceClaimId)).toEqual(c.claims)
    expect(f.quotes.map((q) => q.speakerGroup)).toEqual(c.groups)
    expect(f.contradiction).toEqual([])
    expect(f.severity).toBe('informational')
  })

  it('every phrase this batch put in guillemets comes from a source it publishes', () => {
    // Six of the thirteen now quote the speaker instead of paraphrasing them,
    // which is the remedy for a deixis, a mood or a noun the extract does not
    // supply. That is only honest if the words are the speaker's — or, for a
    // contract title, the document's. So each «…» span must be verbatim in one
    // of the finding's own quotes or in one of its own cotejo snippets.
    let spans = 0
    let fromQuote = 0
    for (const c of LOTE_3) {
      const f = byId(c.id)
      for (const m of f.summary.matchAll(/«([^»]+)»/g)) {
        spans += 1
        const needle = m[1].replace(/[.,;:]$/, '')
        const inQuote = f.quotes.some((q) => q.text.includes(needle))
        if (inQuote) fromQuote += 1
        expect(
          inQuote || f.crossChecked.some((r) => r.snippet.includes(needle)),
          `${c.id}: «${needle}» no está ni en una cita ni en un cotejo del hallazgo`,
        ).toBe(true)
      }
    }
    // Both measuring assertions: zero spans would satisfy the loop silently,
    // and a batch whose every span came from a contract title would mean the
    // re-quoting remedy was never applied.
    expect(spans).toBeGreaterThanOrEqual(8)
    expect(fromQuote).toBeGreaterThanOrEqual(6)
  })

  it.each(AFIRMACIONES_DOCUMENTALES_FALSAS)(
    '$id no longer asserts the documentary link the classifier could not see',
    ({ id, inventado, documento, keeps }) => {
      const f = byId(id)
      const prose = `${f.title}\n${f.summary}`
      expect(prose, `${id} sigue afirmando el vínculo documental`).not.toMatch(inventado)
      // The document it welded on is gone from the prose too — a reworded
      // sentence that still names it would be the same claim.
      expect(prose, `${id} sigue nombrando el expediente`).not.toMatch(documento)
      // The measuring half.
      expect(prose).toContain(keeps)
      // And the pre-correction text is on the record, so the assertion is
      // provably about a claim that WAS published and not about one nobody
      // ever wrote: the struck original must match what we say was there.
      const original = (f.corrections ?? []).find(
        (c) => c.field === 'summary' && inventado.test(c.original),
      )
      expect(original, `${id}: la bitácora no conserva el sumario defectuoso`).toBeDefined()
    },
  )

  it('947479: the dates and the vote record that make its removed sentence false', () => {
    // «El debate sobre la adjudicación del sistema concluyó con la abstención
    // de varios grupos municipales.» Checked against the two published
    // snapshots rather than against a hand-copied string, so it cannot drift.
    const t = JSON.parse(readFileSync(resolve('public/data/tenders.json'), 'utf8')) as {
      contracts: { title: string; status: string; awardDate: string | null }[]
    }
    const sistema = t.contracts.find((r) =>
      /implantación de un sistema de debate, voto electrónico/i.test(r.title),
    )
    expect(sistema, 'el expediente del salón de plenos ya no está en el corpus').toBeDefined()
    // Formalised two years BEFORE the session: it cannot have been adjudicated
    // on 2026-04-20.
    expect(sistema!.status).toBe('formalized')
    expect(sistema!.awardDate).toBe('2024-04-19')

    const v = JSON.parse(readFileSync(resolve('public/data/pleno-votes.json'), 'utf8')) as {
      items: {
        plenoId: string
        itemNumber: number
        title: string
        outcome: string
        votes: { direction: string }[]
      }[]
    }
    const sesion = v.items.filter((x) => x.plenoId === 'k4olcs')
    // The gate: two curated votes for that session, and exactly one of them is
    // an adjudicación. Zero would make everything below vacuous.
    expect(sesion.length).toBeGreaterThan(0)
    const adjudicaciones = sesion.filter((x) => /adjudicaci|adjudicació/i.test(x.title))
    expect(adjudicaciones).toHaveLength(1)
    // …and it is the water concession, carried unanimously with no abstention.
    expect(adjudicaciones[0].title).toMatch(/aigua potable|proveïment/i)
    expect(adjudicaciones[0].outcome).toBe('aprobado')
    expect(adjudicaciones[0].votes.filter((b) => b.direction === 'abstencion')).toEqual([])
    expect(adjudicaciones[0].votes.every((b) => b.direction === 'a_favor')).toBe(true)

    const f = byId('f-2026-04-20-cit-947479')
    expect(f.summary).not.toMatch(/abstenci[óo]n|adjudicaci[óo]n/i)
  })

  it('a9546e: the pleno-vote record does not carry the item its verb claimed', () => {
    // «convalidó» asserted an institutional outcome. `pleno-votes.json` holds
    // four curated votes for that session and none is the reconocimiento
    // extrajudicial, so nothing published here says it passed.
    const v = JSON.parse(readFileSync(resolve('public/data/pleno-votes.json'), 'utf8')) as {
      items: { plenoId: string; title: string }[]
    }
    const sesion = v.items.filter((x) => x.plenoId === '1sqj7is')
    expect(sesion.length).toBeGreaterThan(0)
    expect(sesion.filter((x) => /reconocimiento extrajudicial/i.test(x.title))).toEqual([])

    const f = byId('f-2026-03-09-afi-a9546e')
    expect(f.summary).not.toMatch(/\bconvalid[óo]\b/)
    expect(f.summary).toContain('no consta aquí si llegó a aprobarse')
  })

  it('no cotejo left on this batch post-dates its own session', () => {
    // Criterion 3 of the removal rule, re-run over what SURVIVED — the same
    // gate 04761aa put in front of new runs, so "consistency, not a new rule"
    // is a claim this file can check rather than assert.
    const index = buildRecordDateIndex([
      JSON.parse(readFileSync(resolve('public/data/tenders.json'), 'utf8')),
    ])
    const report = emptyRecordDateGateReport()
    for (const c of LOTE_3) {
      const f = byId(c.id)
      for (const r of f.crossChecked) recordKnowableAt(r.ref, f.plenoDate, index, report)
    }
    expect(report.postDated).toEqual([])
    // Measuring halves. Without the first, a batch that deleted every cotejo
    // would pass; without the second, an empty or broken index reports every
    // ref as "not in any procurement snapshot" and reads like a clean sweep.
    expect(report.kept).toBeGreaterThan(25)
    expect(index.size).toBeGreaterThan(500)
    // And the control positive: the gate can still say no. Any surviving
    // dated ref, asked about a session before it existed, must be excluded —
    // otherwise the block above proves nothing about the gate's discrimination.
    const dated = byId('f-2025-11-03-acu-431140').crossChecked.find((r) => r.kind === 'tender')!
    expect(recordKnowableAt(dated.ref, '2000-01-01', index)).toBe(false)
  })

  it('no reason written for this batch echoes what its removal took out', () => {
    // Paso 2 of `revisar-borrador` over lote 3's own ten retractions, nine
    // cotejos and one quote. The CLI guard reads capitalisation, so it catches
    // names and misses paraphrase; this restates the machine-checkable half
    // over the published bytes, where a hand-edit could land.
    const batchRemovals = LOTE_3.flatMap((c) =>
      (byId(c.id).corrections ?? [])
        .slice(c.priorCorrections)
        .filter((x) => CORRECTION_REMOVAL_FIELD_RE.test(x.field)),
    )
    expect(batchRemovals).toHaveLength(10)
    expect(batchRemovals.filter((r) => r.field.startsWith('quote.'))).toHaveLength(1)
    const offences: string[] = []
    for (const r of batchRemovals) {
      const noun = r.field.startsWith('quote.') ? 'cita' : 'documento cotejado'
      expect(r.original).toMatch(new RegExp(`^${noun} · sha256:[0-9a-f]{12}$`))
      expect(r.corrected).toMatch(/^retirad[ao] del hallazgo$/)
      for (const m of r.reason.matchAll(/\p{Lu}[\p{L}\p{M}’'-]*/gu)) {
        const before = r.reason.slice(0, m.index).trimEnd()
        if (before.length === 0 || /[.!?:;]$/.test(before)) continue
        offences.push(`${r.field}: «${m[0]}»`)
      }
    }
    expect(offences).toEqual([])
  })

  it('every removal reason states which of the three criteria it applied', () => {
    // The batch's own discipline, published: a retraction whose reason does
    // not name a criterion is indistinguishable from a purge, and a purge is
    // what `crossChecked[]` must not become.
    const CRITERIOS = [
      /nombraba la frase suprimida|que nombraba la frase/i, // 1 · named by the deleted sentence
      /identifica por su nombre a un particular/i, // 2 · a private individual
      /fecha más temprana conocida es(?:, además,)? posterior/i, // 3 · post-dates the session
    ]
    const batchRemovals = LOTE_3.flatMap((c) =>
      (byId(c.id).corrections ?? [])
        .slice(c.priorCorrections)
        .filter((x) => x.field.startsWith('crossChecked.')),
    )
    expect(batchRemovals).toHaveLength(9)
    for (const r of batchRemovals) {
      expect(
        CRITERIOS.some((re) => re.test(r.reason)),
        `${r.field}: la razón no nombra ningún criterio`,
      ).toBe(true)
    }
    // All three criteria were actually exercised — a batch that only ever
    // reached for one would mean the other two were never tested.
    for (const re of CRITERIOS) {
      expect(batchRemovals.filter((r) => re.test(r.reason)).length).toBeGreaterThan(0)
    }
  })

  it('no reason written for this batch pastes a URL, retraction or not', () => {
    const batch = LOTE_3.flatMap((c) => (byId(c.id).corrections ?? []).slice(c.priorCorrections))
    expect(batch).toHaveLength(21)
    expect(batch.filter((r) => /https?:\/\//.test(r.reason))).toEqual([])
    expect(batch.every((r) => r.reason.trim().length >= 20)).toBe(true)
  })
})
