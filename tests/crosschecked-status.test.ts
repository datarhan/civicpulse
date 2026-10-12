/**
 * A cross-checked document a reader cannot tell from a signed contract.
 *
 * Five `crossChecked` refs on `/hallazgos` point at four PLACSP expedientes
 * annulled before award — `finalAmount: 0`, no assignee, no award,
 * formalisation or start date at all. `RefList` published the date and never
 * the state, so an abandoned procurement appeared under «Documentos cotejados»
 * looking like a thing the council did.
 *
 * Five and four, not four and three: expediente 68/2025 is `void` in the
 * licitaciones table while its contract row publishes no status, so a scan for
 * «every row is void» walks past it.
 *
 * THREE states, not two, and the third is the sentinel one: `status: 'unknown'`
 * is Gobierto's blank after normalisation, not a state a document is in
 * (`docs/DATA_INTEGRITY.md` rule 3). It leaked into published text anyway —
 * 16 finding snippets end with the literal «· estado: unknown».
 *
 * Every scan below asserts it EVALUATED something. An index that silently
 * resolved nothing would satisfy "no ref is wrongly marked annulled" perfectly.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  buildRefStatusIndex,
  refStatus,
  snippetWithoutStatus,
  snippetParaLeer,
  snippetDeEvidencia,
  REF_STATUS_KINDS,
} from '../src/lib/crosschecked-status.js'
import {
  procurementStatusKind,
  COMMITTED_STATUSES,
  CANCELLED_STATUSES,
  IN_FLIGHT_STATUSES,
} from '../src/lib/contract-status.js'
import { CATEGORIAS_DE_CONTRATO, CONTRACT_STATUS, TENDER_STATUS } from '../src/scraper/tenders'
import { CATALOGUE } from '../src/i18n'

const DATA = resolve(__dirname, '..', 'public', 'data')
const tenders = JSON.parse(readFileSync(join(DATA, 'tenders.json'), 'utf8'))
const findings = JSON.parse(readFileSync(join(DATA, 'pleno-findings.json'), 'utf8'))

type Ref = { kind: string; ref: string; snippet: string }
type Finding = { id: string; crossChecked?: Ref[] }
const items: Finding[] = findings.items

const row = (permalink: string, status: string, table: 'contracts' | 'tenders' = 'contracts') => ({
  [table]: [{ permalink, status }],
})

describe('procurementStatusKind — the vocabulary is not restated', () => {
  it('covers every status the parser can emit, or says nothing', () => {
    // Rule 1: the enum is IMPORTED from the parser, never hand-copied. A new
    // Gobierto status must land in a bucket or fall to `null` — which renders
    // as «sin estado», an honest miss, never a guess.
    const all = [...new Set([...CONTRACT_STATUS, ...TENDER_STATUS])]
    expect(all.length).toBeGreaterThan(10)
    const bucketed = all.filter((s) => procurementStatusKind(s) !== null)
    const unbucketed = all.filter((s) => procurementStatusKind(s) === null)
    // Everything except the sentinel has a bucket.
    expect(unbucketed).toEqual(['unknown'])
    expect(bucketed.length).toBe(all.length - 1)
  })

  it('never calls the sentinel a state', () => {
    for (const nothing of ['unknown', '', '   ', 'en_tramite', null, undefined, 7]) {
      expect(procurementStatusKind(nothing as string)).toBeNull()
    }
  })

  it('sorts the three buckets, so a multi-lot expediente picks deterministically', () => {
    expect(COMMITTED_STATUSES[0]).toBe('formalized')
    expect(CANCELLED_STATUSES[0]).toBe('void')
    expect(IN_FLIGHT_STATUSES[0]).toBe('provisionally_awarded')
    // No status may sit in two buckets: the pick would depend on table order.
    const seen = [...COMMITTED_STATUSES, ...CANCELLED_STATUSES, ...IN_FLIGHT_STATUSES]
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('exports exactly the kinds a resolved ref can carry', () => {
    expect([...REF_STATUS_KINDS].sort()).toEqual(['cancelled', 'committed', 'in-flight'])
  })

  it('cannot publish a status that is in none of the three ordered lists', () => {
    // The structural property, driven over the WHOLE parser enum rather than
    // asserted about `unknown` alone: the only way out of `pickStatus` is to
    // match inside an ordered list, so putting the sentinel into one is the
    // single edit that could make it reach a reader. This goes red if anyone
    // does. (It is also why deleting the defensive filter inside `pickStatus`
    // changes no answer — the guard is belt-and-braces over this.)
    const orderable = new Set([...COMMITTED_STATUSES, ...CANCELLED_STATUSES, ...IN_FLIGHT_STATUSES])
    expect(orderable.has('unknown')).toBe(false)
    let resolved = 0
    let refused = 0
    for (const s of new Set([...CONTRACT_STATUS, ...TENDER_STATUS])) {
      const got = buildRefStatusIndex({ contracts: [{ permalink: 'p', status: s }] }).get('p')
      if (got == null) {
        refused += 1
        expect(orderable.has(s)).toBe(false)
        continue
      }
      resolved += 1
      expect(orderable.has(got.status)).toBe(true)
      expect(procurementStatusKind(got.status)).toBe(got.kind)
    }
    // The drive EVALUATED both branches — otherwise this passes vacuously.
    expect(resolved).toBeGreaterThan(5)
    expect(refused).toBe(1)
  })
})

describe('buildRefStatusIndex — three outcomes, kept apart', () => {
  it('a void expediente resolves to cancelled', () => {
    const i = buildRefStatusIndex(row('p', 'void'))
    expect(i.get('p')).toEqual({ kind: 'cancelled', status: 'void' })
  })

  it('an awarded expediente resolves to committed', () => {
    expect(buildRefStatusIndex(row('p', 'awarded')).get('p')).toEqual({
      kind: 'committed',
      status: 'awarded',
    })
  })

  it('an expediente whose only status is the sentinel resolves to null, not to a state', () => {
    // `null` means «the document publishes no usable state», which the page
    // renders in words. It is NOT `undefined`, which means «not resolved yet».
    const i = buildRefStatusIndex(row('p', 'unknown'))
    expect(i.has('p')).toBe(true)
    expect(i.get('p')).toBeNull()
  })

  it('a permalink absent from the snapshot is undefined, never null', () => {
    // Collapsing the two is how «still loading» starts reading as «annulled».
    const i = buildRefStatusIndex(row('p', 'void'))
    expect(refStatus({ kind: 'tender', ref: 'otro' }, i)).toBeUndefined()
    expect(refStatus({ kind: 'tender', ref: 'p' }, i)).toEqual({
      kind: 'cancelled',
      status: 'void',
    })
  })

  it('a pleno recording is never asked about: it is not a procurement', () => {
    const i = buildRefStatusIndex(row('p', 'void'))
    expect(refStatus({ kind: 'pleno-video', ref: 'p' }, i)).toBeUndefined()
  })

  it('survives a missing snapshot and a missing ref', () => {
    expect(buildRefStatusIndex(null).size).toBe(0)
    expect(buildRefStatusIndex(undefined).size).toBe(0)
    expect(refStatus(null as unknown as Ref, new Map())).toBeUndefined()
  })
})

describe('buildRefStatusIndex — one expediente, several lots', () => {
  it('a contract that exists outranks a lot that fell through', () => {
    // 9 of the 119 refs are `awarded+…+void`: those expedientes DID produce a
    // contract, and calling them annulled is the same error mirrored.
    const i = buildRefStatusIndex({
      contracts: [
        { permalink: 'p', status: 'void' },
        { permalink: 'p', status: 'awarded' },
      ],
    })
    expect(i.get('p')).toEqual({ kind: 'committed', status: 'awarded' })
  })

  it('«anulado» needs every lot to have failed', () => {
    const i = buildRefStatusIndex({
      contracts: [
        { permalink: 'p', status: 'void' },
        { permalink: 'p', status: 'revoked' },
      ],
    })
    expect(i.get('p')).toEqual({ kind: 'cancelled', status: 'void' })
  })

  it('a lot with no state cannot outvote a lot that has one', () => {
    // The real `unknown+void` ref: `unknown` carries no information, so it does
    // not dilute the one row that does. Same treatment a row with no date gets.
    const i = buildRefStatusIndex({
      contracts: [{ permalink: 'p', status: 'unknown' }],
      tenders: [{ permalink: 'p', status: 'void' }],
    })
    expect(i.get('p')).toEqual({ kind: 'cancelled', status: 'void' })
  })

  it('prefers the later state when one expediente is awarded and formalised', () => {
    const i = buildRefStatusIndex({
      contracts: [
        { permalink: 'p', status: 'awarded' },
        { permalink: 'p', status: 'formalized' },
      ],
    })
    expect(i.get('p')).toEqual({ kind: 'committed', status: 'formalized' })
  })

  it('does not depend on which order the lots arrive in', () => {
    const a = buildRefStatusIndex({
      contracts: [
        { permalink: 'p', status: 'void' },
        { permalink: 'p', status: 'provisionally_awarded' },
      ],
    })
    const b = buildRefStatusIndex({
      contracts: [
        { permalink: 'p', status: 'provisionally_awarded' },
        { permalink: 'p', status: 'void' },
      ],
    })
    expect(a.get('p')).toEqual(b.get('p'))
    expect(a.get('p')).toEqual({ kind: 'in-flight', status: 'provisionally_awarded' })
  })
})

describe('the real snapshot', () => {
  const index = buildRefStatusIndex(tenders)
  const refs = items.flatMap((f) => (f.crossChecked ?? []).map((r) => ({ finding: f.id, ...r })))
  const tenderRefs = refs.filter((r) => r.kind === 'tender')

  it('indexes the whole procurement register', () => {
    // Positive control. Without it every assertion below is vacuous.
    expect(index.size).toBeGreaterThan(400)
    expect(tenderRefs.length).toBeGreaterThan(80)
  })

  it('resolves every published tender ref to one of the three answers', () => {
    const resolved = tenderRefs.map((r) => refStatus(r, index))
    // No ref of a published finding is unresolvable: they all cite the register.
    expect(resolved.filter((s) => s === undefined)).toEqual([])
    const kinds = new Set(resolved.map((s) => s?.kind ?? 'sin-estado'))
    // All three reachable states occur in the live data, so the page renders
    // all three and none of these branches is dead.
    expect(kinds.has('committed')).toBe(true)
    expect(kinds.has('cancelled')).toBe(true)
    expect(kinds.has('in-flight')).toBe(true)
  })

  it('marks the annulled refs and nothing else', () => {
    // FIVE refs, four expedientes — one more than a scan for «every row is
    // void» finds. Expediente 68/2025 (Dirección Facultativa del Centro
    // Polivalente) is `void` in the licitaciones table while its contract row
    // publishes no status at all, so the strict scan skipped it; the register
    // still says the procedure ended with nobody hired.
    const cancelled = tenderRefs.filter((r) => refStatus(r, index)?.kind === 'cancelled')
    expect(cancelled).toHaveLength(5)
    expect(new Set(cancelled.map((r) => r.ref)).size).toBe(4)
    for (const c of cancelled) expect(refStatus(c, index)?.status).toBe('void')
    const titles = cancelled.map((c) => c.snippet).join(' ')
    expect(titles).toContain('vallas de seguridad')
    expect(titles).toContain('puesta a disposición de personal')
    expect(titles).toContain('vigilancia y seguridad privada')
    expect(titles).toContain('Dirección Facultativa')
  })

  it('the annulled refs really are annulled in the register', () => {
    // Read the rows back, so this asserts the DATA and not just the mapping:
    // nothing awarded, nothing formalised, no money out.
    const cancelled = tenderRefs.filter((r) => refStatus(r, index)?.kind === 'cancelled')
    const rows = [...(tenders.contracts ?? []), ...(tenders.tenders ?? [])]
    for (const c of cancelled) {
      const own = rows.filter((x: { permalink?: string }) => x.permalink === c.ref)
      expect(own.length).toBeGreaterThan(0)
      // At least one row says so outright, and none contradicts it.
      expect(own.some((r: { status?: string }) => r.status === 'void')).toBe(true)
      for (const r of own) {
        expect(['void', 'unknown']).toContain(r.status)
        expect(r.finalAmount ?? 0).toBe(0)
        expect(r.awardDate ?? null).toBeNull()
        expect(r.formalizedDate ?? null).toBeNull()
        expect(r.assignee ?? null).toBeNull()
      }
    }
  })
})

describe('snippetWithoutStatus — a sentinel is never a value', () => {
  it('takes the tail off, whatever the token', () => {
    expect(snippetWithoutStatus('Contrato de vallas · estado: unknown')).toBe('Contrato de vallas')
    expect(snippetWithoutStatus('Contrato de vallas · estado: awarded')).toBe('Contrato de vallas')
    // Snippets are truncated at a fixed length upstream; one lands mid-word.
    expect(snippetWithoutStatus('Contrato de vallas · estado: awarde…')).toBe('Contrato de vallas')
  })

  it('leaves a snippet that merely mentions the word alone', () => {
    const s = 'Acuerdo sobre el estado: pendiente de informe y su tramitación'
    expect(snippetWithoutStatus(s)).toBe(s)
    const mid = 'Contrato · estado: void · Ayuntamiento de Riba-roja'
    expect(snippetWithoutStatus(mid)).toBe(mid)
  })

  it('survives a missing snippet', () => {
    expect(snippetWithoutStatus(null)).toBe('')
    expect(snippetWithoutStatus(undefined)).toBe('')
  })

  it('clears the sentinel from every published snippet — and there were some', () => {
    const withSentinel = items.flatMap((f) =>
      (f.crossChecked ?? []).filter((r) => /estado:\s*unknown/i.test(r.snippet ?? '')),
    )
    // Positive control: the defect is real in the committed data, so the
    // assertion below is not passing over an empty set.
    expect(withSentinel.length).toBeGreaterThan(10)
    for (const r of withSentinel) {
      expect(snippetWithoutStatus(r.snippet)).not.toMatch(/estado:/i)
      // And it removes ONLY the tail: the title survives intact.
      expect(r.snippet.startsWith(snippetWithoutStatus(r.snippet))).toBe(true)
      expect(snippetWithoutStatus(r.snippet).length).toBeGreaterThan(20)
    }
  })

  it('leaves the 91 snippets that never carried a tail untouched', () => {
    const untailed = items
      .flatMap((f) => f.crossChecked ?? [])
      .filter((r) => r.kind === 'tender' && !/·\s*estado:/i.test(r.snippet ?? ''))
    expect(untailed.length).toBeGreaterThan(50)
    for (const r of untailed) expect(snippetWithoutStatus(r.snippet)).toBe(r.snippet.trim())
  })
})

/**
 * Los snippets viejos llevaban, además de la cola «estado:», el estado sin rótulo
 * al final y la categoría del contrato entre « · »: en /plenos/qz6weg, ficha
 * bef239, «… · awarded» y «… · INSDAGAR S.L. · construction».
 */
describe('snippetParaLeer — ningún token del verificador llega al lector', () => {
  const categoria = (c: string) => CATALOGUE.es[`contrato.categoria.${c}`] ?? null

  it('cambia la categoría por su rótulo y quita el estado del final, con o sin «estado:»', () => {
    expect(
      snippetParaLeer(
        'Obras · Ayuntamiento · INSDAGAR S.L. · construction · estado: awarded',
        categoria,
      ),
    ).toBe('Obras · Ayuntamiento · INSDAGAR S.L. · Construcción')
    expect(snippetParaLeer('Obras de restauración · Ayuntamiento · awarded', categoria)).toBe(
      'Obras de restauración · Ayuntamiento',
    )
    expect(snippetParaLeer('Arrendamiento · Ayuntamiento · Bodí · real_estate', categoria)).toBe(
      'Arrendamiento · Ayuntamiento · Bodí · Inmobiliario',
    )
    expect(snippetParaLeer('Vallas · Ayuntamiento · unknown', categoria)).toBe(
      'Vallas · Ayuntamiento',
    )
  })

  it('no toca el título, ni un trozo que no es token, ni un token que no conoce', () => {
    // El título es el primer trozo, aunque sea una sola palabra con forma de token.
    expect(snippetParaLeer('other · Ayuntamiento', categoria)).toBe('other · Ayuntamiento')
    expect(snippetParaLeer('Obras · Ayuntamiento · Adjudicado', categoria)).toBe(
      'Obras · Ayuntamiento · Adjudicado',
    )
    expect(snippetParaLeer('Obras · zzz_desconocido', categoria)).toBe('Obras · zzz_desconocido')
    // Un estado en medio no es la cola: no se quita.
    expect(snippetParaLeer('Obras · awarded · Ayuntamiento', categoria)).toBe(
      'Obras · awarded · Ayuntamiento',
    )
    expect(snippetParaLeer(null, categoria)).toBe('')
  })

  it('deja sin token cada contrato cotejado de las fichas publicadas — y había alguno', () => {
    const contratos = items.flatMap((f) =>
      (f.crossChecked ?? []).filter((r) => r.kind === 'tender'),
    )
    const conToken = (s: string) =>
      s
        .split(' · ')
        .slice(1)
        .some((t) => /^[a-z][a-z_]*$/.test(t))
    // Control positivo: el defecto está en el dato publicado.
    expect(
      contratos.filter((r) => conToken(snippetWithoutStatus(r.snippet))).length,
    ).toBeGreaterThan(5)
    for (const r of contratos)
      expect(conToken(snippetParaLeer(r.snippet, categoria)), r.snippet).toBe(false)
  })
})

/**
 * Lo mismo en cada superficie que pinta un snippet de evidencia: /hallazgos, el
 * registro de declaraciones (/plenos/:id, /departamentos/:slug), /declaraciones y
 * el laboratorio de prensa. Antes, sólo /hallazgos cambiaba la categoría por su
 * rótulo; las otras imprimían «· construction ·», «· architecture ·».
 */
describe('snippetDeEvidencia — un solo helper para todas las superficies', () => {
  const t = (idioma: 'es' | 'ca') => (clave: string) =>
    (CATALOGUE as unknown as Record<string, Record<string, string>>)[idioma][clave] ?? clave

  it('un contrato: categoría por su rótulo en el idioma de quien lee, sin la cola de estado', () => {
    const ref = {
      kind: 'tender',
      snippet: 'Obras · Ayuntamiento · INSDAGAR S.L. · construction · estado: awarded',
    }
    expect(snippetDeEvidencia(ref, t('es'))).toBe(
      'Obras · Ayuntamiento · INSDAGAR S.L. · Construcción',
    )
    expect(snippetDeEvidencia(ref, t('ca'))).toBe(
      'Obras · Ayuntamiento · INSDAGAR S.L. · Construcció',
    )
    // Sin idioma, castellano.
    expect(snippetDeEvidencia(ref)).toBe('Obras · Ayuntamiento · INSDAGAR S.L. · Construcción')
    // En medio también: el importe va detrás.
    expect(
      snippetDeEvidencia(
        { kind: 'tender', snippet: 'Proyecto · Ayto · architecture · 1742 €' },
        t('ca'),
      ),
    ).toBe('Proyecto · Ayto · Arquitectura · 1742 €')
  })

  it('una categoría sin rótulo se queda cruda y visible; el centinela «unknown» se va', () => {
    expect(snippetDeEvidencia({ kind: 'tender', snippet: 'Obras · Ayto · zzz_nueva · 10 €' })).toBe(
      'Obras · Ayto · zzz_nueva · 10 €',
    )
    expect(snippetDeEvidencia({ kind: 'tender', snippet: 'Obras · Ayto · unknown · 10 €' })).toBe(
      'Obras · Ayto · 10 €',
    )
  })

  it('lo que no es un contrato sólo pierde la cola: su texto es prosa, no claves', () => {
    const promesa = { kind: 'promise', snippet: 'PSOE «arreglar la plaza» · 2023-05-01 · other' }
    expect(snippetDeEvidencia(promesa)).toBe(promesa.snippet)
    expect(snippetDeEvidencia(null)).toBe('')
  })

  /** Cada fila de evidencia o documento cotejado que una superficie pinta, de lo servido. */
  const lee = (f: string) => JSON.parse(readFileSync(join(DATA, f), 'utf8'))
  const filas: { kind?: string; snippet?: string }[] = []
  const recoge = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(recoge)
    if (!o || typeof o !== 'object') return
    const r = o as { kind?: unknown; snippet?: unknown }
    if (typeof r.snippet === 'string' && typeof r.kind === 'string')
      filas.push({ kind: r.kind, snippet: r.snippet })
    Object.values(o).forEach(recoge)
  }
  const manifiesto = lee('pleno-claims/index.json') as { plenos: { chunkPath: string }[] }
  for (const p of manifiesto.plenos) recoge(lee(p.chunkPath))
  recoge(findings)
  recoge(lee('press-claims-verified.json'))
  recoge(lee('press-findings.json'))

  const CATEGORIAS = new Set<string>(CATEGORIAS_DE_CONTRATO)
  const categorias = (s: string) =>
    s
      .split(' · ')
      .slice(1)
      .filter((trozo) => CATEGORIAS.has(trozo))

  it.each(['es', 'ca'] as const)(
    'ninguna fila servida conserva la categoría inglesa (%s) — y había',
    (idioma) => {
      const conCategoria = filas.filter(
        (f) => f.kind === 'tender' && categorias(snippetWithoutStatus(f.snippet)).length > 0,
      )
      // Control positivo: el defecto está en el dato servido.
      expect(conCategoria.length).toBeGreaterThan(20)
      const crudas = conCategoria.filter(
        (f) => categorias(snippetDeEvidencia(f, t(idioma))).length > 0,
      )
      // Techo de la reserva cruda, y el detalle si se pasa.
      expect(crudas.length / conCategoria.length).toBeLessThan(0.1)
      expect(crudas.map((f) => f.snippet)).toEqual([])
    },
  )
})
