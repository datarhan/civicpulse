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
})

describe('published pleno findings — a removal does not republish what it removed', () => {
  it('there are removals to check, and exactly as many as were issued', () => {
    // The measuring assertion. Everything below is vacuously true on an empty
    // selection, which is precisely how a green suite hides a regression.
    //
    // Pinned to a count, not to `> 0`: the lote-1 review batch added eleven
    // `crossChecked.<i>` retractions to b8fea6f's four, and a run that skipped
    // rows would still satisfy `> 0` while retracting nothing.
    expect(removals.length).toBe(16)
    expect(removals.filter((c) => c.field.startsWith('quote.'))).toHaveLength(2)
    expect(removals.filter((c) => c.field.startsWith('crossChecked.'))).toHaveLength(14)
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
    expect(allCorrections.length).toBe(76)
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
    expect(parsed.items.flatMap((f) => f.corrections ?? [])).toHaveLength(76)
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
