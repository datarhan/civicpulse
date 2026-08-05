/**
 * The `Otro` speakerGroup sentinel is retired and must not come back.
 *
 * `Otro` never meant "another party" — it was the extractor's "cannot tell".
 * Riba-roja's corporación is PSOE 11 · PP 7 · VOX 1 · Compromís 1 · EU-Podem 1,
 * so a consumer of the published JSON who reads `"speakerGroup": "Otro"` as
 * "the party that is not one of the four large ones" identifies one specific
 * councillor by elimination. `null` already means "not determined". See
 * docs/DATA_INTEGRITY.md, «un centinela nunca es un valor».
 *
 * Every assertion here also asserts that it EVALUATED SOMETHING. Two suites in
 * this repo were green while measuring nothing; a scan that finds no `Otro`
 * because its walker never reached a `speakerGroup` is the same failure. So
 * each scan carries a positive control: real group codes must be found too.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import { ALLOWED_BLOCS, SPEAKER_GROUPS, validateSnapshot } from '../src/scraper/pleno-votes'
import { PlenoClaimSuggestionSchema } from '../src/llm/schemas'
import { REAL_BLOCS } from '../src/lib/party-label.js'

const DATA = resolve(__dirname, '..', 'public', 'data')

/** Every `speakerGroup` value in a document, wherever it is nested. */
function collectSpeakerGroups(node: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    for (const n of node) collectSpeakerGroups(n, out)
    return out
  }
  if (node === null || typeof node !== 'object') return out
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === 'speakerGroup') out.push(v)
    else collectSpeakerGroups(v, out)
  }
  return out
}

/** Published snapshots that carry a speakerGroup somewhere in their tree. */
function snapshotPaths(): string[] {
  const fixed = [
    'pleno-findings.json',
    'pleno-claims-verified.json',
    'pleno-claims-verified-base.json',
    'pleno-claims-overlay.json',
    'pleno-claims-suggestions.json',
    'auto-curation-bundles.json',
  ]
    .map((n) => join(DATA, n))
    .filter((p) => existsSync(p))

  const chunkDir = join(DATA, 'pleno-claims')
  const chunks = existsSync(chunkDir)
    ? readdirSync(chunkDir)
        .filter((n) => n.endsWith('.json') && n !== 'index.json')
        .map((n) => join(chunkDir, n))
    : []

  return [...fixed, ...chunks]
}

describe('Otro sentinel — published data', () => {
  const paths = snapshotPaths()

  it('scans a non-empty set of published snapshots', () => {
    // Guards every test below: if the glob silently matched nothing, the
    // "no Otro anywhere" assertions would pass over an empty set.
    expect(paths.length).toBeGreaterThan(5)
    expect(paths.some((p) => p.endsWith('pleno-findings.json'))).toBe(true)
    expect(paths.some((p) => p.endsWith('pleno-claims-verified.json'))).toBe(true)
    expect(paths.some((p) => p.includes('pleno-claims/'))).toBe(true)
  })

  it('carries no speakerGroup sentinel, having actually inspected speakerGroups', () => {
    const values: unknown[] = []
    for (const p of paths) collectSpeakerGroups(JSON.parse(readFileSync(p, 'utf8')), values)

    // Positive control — the walker reached real data. Without this the test
    // passes just as happily against a broken walker or empty snapshots.
    expect(values.length).toBeGreaterThan(1000)
    const named = values.filter((v) => typeof v === 'string')
    expect(named.length).toBeGreaterThan(100)
    expect(new Set(named).size).toBeGreaterThan(1)

    // The claim under test.
    expect(values.filter((v) => v === 'Otro')).toEqual([])

    // Nothing else crept in either: every non-null value is a real group.
    expect([...new Set(values.filter((v) => v !== null))].sort()).toEqual(
      [...new Set(named)].sort(),
    )
    for (const v of new Set(named)) expect(SPEAKER_GROUPS).toContain(v)
  })

  it('leaves no bundle attributing itself to the sentinel via blocs[]', () => {
    const p = join(DATA, 'auto-curation-bundles.json')
    if (!existsSync(p)) return
    const doc = JSON.parse(readFileSync(p, 'utf8'))
    const bundles = [...(doc.bundles ?? []), ...(doc.archived ?? [])]
    const withBlocs = bundles.filter((b: { blocs?: unknown }) => Array.isArray(b.blocs))
    // Positive control: there is something to check.
    expect(withBlocs.length).toBeGreaterThan(0)
    for (const b of withBlocs) {
      expect(b.blocs).not.toContain('Otro')
      expect(b.blocs.length).toBeGreaterThan(0)
      for (const code of b.blocs) expect(SPEAKER_GROUPS).toContain(code)
    }
  })

  it('the published findings snapshot still passes its own validator', () => {
    const raw = readFileSync(join(DATA, 'pleno-findings.json'), 'utf8')
    const snapshot = validateFindingsSnapshot(raw)
    expect(snapshot.items.length).toBeGreaterThan(0)
    // And it really does contain quotes — otherwise "no Otro" is vacuous.
    expect(snapshot.items.flatMap((i) => i.quotes).length).toBeGreaterThan(0)
  })
})

describe('Otro sentinel — the validator refuses to let it back in', () => {
  /**
   * Take the REAL published snapshot and change one quote's speakerGroup.
   * Deriving the fixture from live data rather than hand-writing one is the
   * point: a restated shape is what let six tests in this repo pass while
   * production matched nothing (docs/DATA_INTEGRITY.md, rule 1). If the
   * schema gains a required field tomorrow, this fixture gains it too.
   */
  function publishedSnapshotWithFirstQuote(speakerGroup: string | null): string {
    const doc = JSON.parse(readFileSync(join(DATA, 'pleno-findings.json'), 'utf8'))
    const target = doc.items.find((i: { quotes?: unknown[] }) => (i.quotes ?? []).length > 0)
    if (!target) throw new Error('no finding with quotes — fixture cannot be built')
    target.quotes[0].speakerGroup = speakerGroup
    return JSON.stringify(doc)
  }

  it('accepts a real group (positive control — the fixture is otherwise valid)', () => {
    // Without this, "throws on Otro" could be throwing for an unrelated reason.
    expect(() => validateFindingsSnapshot(publishedSnapshotWithFirstQuote('PSOE'))).not.toThrow()
    expect(() => validateFindingsSnapshot(publishedSnapshotWithFirstQuote(null))).not.toThrow()
  })

  it('throws on a speakerGroup of "Otro"', () => {
    expect(() => validateFindingsSnapshot(publishedSnapshotWithFirstQuote('Otro'))).toThrow(
      /speakerGroup/,
    )
  })

  it('the extractor schema rejects "Otro" and accepts null', () => {
    // Same trick: a real extracted claim, not a hand-copied shape.
    const suggestions = JSON.parse(
      readFileSync(join(DATA, 'pleno-claims-suggestions.json'), 'utf8'),
    )
    const sample = suggestions.items.find((i: { speakerGroup?: unknown }) => i.speakerGroup)
    expect(sample).toBeTruthy()

    const parse = (speakerGroup: string | null) =>
      PlenoClaimSuggestionSchema.safeParse({ ...sample, speakerGroup })

    // Positive controls first: the fixture is valid but for speakerGroup.
    expect(parse('PSOE').success).toBe(true)
    expect(parse(null).success).toBe(true)
    // The claim under test.
    expect(parse('Otro').success).toBe(false)
    expect(parse('Otro').error?.issues.some((i) => i.path.includes('speakerGroup'))).toBe(true)
  })
})

describe('Otro sentinel — the enums that define the boundary', () => {
  it('SPEAKER_GROUPS names only real groups', () => {
    expect(SPEAKER_GROUPS.length).toBeGreaterThan(0)
    expect(SPEAKER_GROUPS).not.toContain('Otro')
    expect(SPEAKER_GROUPS).toContain('EU-Podem')
  })

  it('cannot drift from the UI layer’s REAL_BLOCS', () => {
    // Two layers, one list. Neither is restated here — both are imported, so
    // this fails if either side is edited alone.
    expect([...SPEAKER_GROUPS]).toEqual([...REAL_BLOCS])
  })

  it('the vote bloc list no longer carries Otro either', () => {
    // The scope boundary this file used to pin — "votes[].bloc answers a
    // different question, in a curated file with no null" — did not hold. All
    // 12 rows carrying it had seats:1, so it named the same councillor by
    // elimination in the one place the site says how a group *voted*; and the
    // value was copied in from the seat table handed to the extractor, never
    // read off an acta. `bloc: null` now carries "not identified".
    expect(ALLOWED_BLOCS).not.toContain('Otro')
    expect([...ALLOWED_BLOCS]).toEqual([...SPEAKER_GROUPS])
  })
})

describe('Otro sentinel — votes[].bloc', () => {
  const VOTES = join(DATA, 'pleno-votes.json')

  /** The published snapshot, with one tuple's bloc swapped. Derived from live
   *  data, never hand-written: a restated shape is what let six tests in this
   *  repo pass while production matched nothing. */
  function publishedVotesWithFirstBloc(bloc: string | null): string {
    const doc = JSON.parse(readFileSync(VOTES, 'utf8'))
    const target = doc.items.find((i: { votes?: unknown[] }) => (i.votes ?? []).length > 0)
    if (!target) throw new Error('no vote with tuples — fixture cannot be built')
    target.votes[0].bloc = bloc
    return JSON.stringify(doc)
  }

  it('no published vote is attributed to the sentinel, having read real tuples', () => {
    const doc = JSON.parse(readFileSync(VOTES, 'utf8'))
    const blocs = (doc.items as { votes: { bloc: unknown }[] }[]).flatMap((i) =>
      i.votes.map((v) => v.bloc),
    )
    // Positive control: the walker reached real tuples of more than one group.
    expect(blocs.length).toBeGreaterThan(50)
    const named = blocs.filter((b): b is string => typeof b === 'string')
    expect(new Set(named).size).toBeGreaterThan(1)

    expect(blocs.filter((b) => b === 'Otro')).toEqual([])
    for (const b of new Set(named)) expect(SPEAKER_GROUPS).toContain(b)
    // Everything that is not a named group is null — no third state crept in.
    expect(blocs.filter((b) => b !== null && typeof b !== 'string')).toEqual([])
  })

  it('the validator accepts null and refuses "Otro"', () => {
    // Positive controls first: the fixture is valid but for this one field.
    expect(() => validateSnapshot(JSON.parse(publishedVotesWithFirstBloc('PSOE')))).not.toThrow()
    expect(() => validateSnapshot(JSON.parse(publishedVotesWithFirstBloc(null)))).not.toThrow()
    // The claim under test — and the message has to name the sentinel, or a
    // curator reading it learns only that some enum was missed.
    expect(() => validateSnapshot(JSON.parse(publishedVotesWithFirstBloc('Otro')))).toThrow(/Otro/)
  })

  it('rejects two unattributed tuples in the same vote', () => {
    // Two nulls are indistinguishable, so the second is a duplicate exactly as
    // a second PSOE row would be. Without this the dedupe key silently allows
    // an unbounded number of anonymous seats.
    const doc = JSON.parse(readFileSync(VOTES, 'utf8'))
    const target = doc.items.find((i: { votes?: unknown[] }) => (i.votes ?? []).length > 1)
    expect(target).toBeTruthy()
    target.votes[0].bloc = null
    target.votes[1].bloc = null
    expect(() => validateSnapshot(doc)).toThrow(/more than once/)
  })
})

describe('Otro sentinel — why null is not merely cosmetic', () => {
  it('exactly one councillor sits outside the four largest groups', () => {
    const officials = JSON.parse(readFileSync(join(DATA, 'officials.json'), 'utf8'))
    const rows: { party?: string }[] = officials.officials ?? []
    expect(rows.length).toBeGreaterThan(0)
    const big = new Set(['PSOE', 'PP', 'VOX', 'Compromís'])
    const outside = rows.filter((o) => !big.has(o.party ?? ''))
    // If this ever becomes >1, the by-elimination exposure weakens — but the
    // sentinel is still not a value, so the rule does not relax.
    expect(outside.length).toBe(1)
  })
})
