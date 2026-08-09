/**
 * Does the press subsystem tell anyone to run a command that exists?
 *
 * `promote-press-claim` was named in eight places — six docstrings, the
 * quarantine-queue markdown, and the SUMMARY of every auto-composed finding,
 * which is a published field rendered on /laboratorio. It was never a script
 * and never a file; `git log -S` finds it only in prose, first written in
 * 0ea02da alongside the schemas it describes. Nothing caught it for three
 * months because a docstring has no test and a summary string is assembled at
 * runtime, so the phantom only becomes visible to a reader — and the file it
 * would have been published from has held 0 rows the whole time.
 *
 * Scope is the press subsystem, deliberately. A repo-wide version of this
 * check currently reports three more phantoms in other subsystems
 * (`check:freshness`, `draft:findings`, `bench:pleno-votes`); widening it
 * belongs with whoever fixes those, not here.
 *
 * The script names are READ from package.json, never restated — a test that
 * hand-copies the list is the shape DATA_INTEGRITY.md rule 1 is about.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { composeFinding, renderQuarantineMarkdown } from '../src/scraper/press-auto-curate'
import type { VerifiedPressItem } from '../src/scraper/press-auto-curate'
import type { PressClaim } from '../src/scraper/press-claim'

const ROOT = resolve(__dirname, '..')

/** Every runnable script name, from the manifests themselves. */
function knownScripts(): Set<string> {
  const names = new Set<string>()
  for (const manifest of ['package.json', 'bot/package.json']) {
    const raw = JSON.parse(readFileSync(resolve(ROOT, manifest), 'utf8')) as {
      scripts?: Record<string, string>
    }
    for (const k of Object.keys(raw.scripts ?? {})) names.add(k)
  }
  return names
}

/**
 * Text that instructs someone to run something, in the two forms this repo
 * writes: `npm run <name>`, and a bare imperative (`run …`, `ejecute …`).
 *
 * Deliberately narrow. A looser "any kebab-case token" rule would flag
 * `sin-datos`, `promesa-repetida` and `Riba-roja`, and a guard with that
 * false-positive rate is one everybody learns to skip.
 */
const COMMAND_RE = /(?:npm run|ejecut[ae]r?|\brun)\s+`?([a-z][a-z0-9]*(?:[:-][a-z0-9]+)+)`?/gi

function commandsIn(text: string): string[] {
  return [...text.matchAll(COMMAND_RE)].map((m) => m[1])
}

/** The press subsystem's own sources, from git rather than a hand-kept list. */
function pressSources(): string[] {
  return execFileSync('git', ['ls-files', 'src/scraper/press-*.ts', 'scripts/*press*.ts'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)
}

// ─── fixture: one bundle, enough to compose a finding ──────────────────────

const claim: PressClaim = {
  id: 'a-001-0-num',
  articleId: 'a-001',
  articleFingerprint: 'fp-001',
  articleSource: 'Test Outlet',
  articleSourceHost: 'example.test',
  articleUrl: 'https://example.test/articles/001',
  articleDate: '2026-05-20T10:00:00.000Z',
  segmentIndex: 0,
  segmentKind: 'title',
  type: 'afirmacion_numerica',
  attributedSource: 'municipal',
  verbatim: 'Riba-roja invierte 185.000 € en el parque del Túria',
  context: '',
  topic: 'medio-ambiente',
  entities: { amountEuros: 185000, referencedEntity: 'parque del túria' },
  confidence: 0.85,
  reasoning: 'numeric headline',
  requiresHumanApproval: true,
}

const item: VerifiedPressItem = {
  claim,
  verification: {
    claimId: claim.id,
    verdict: 'parcial',
    summary: 'resumen del verificador',
    evidence: [],
    checkedAgainst: ['tenders'],
    articleUrl: claim.articleUrl,
    articleSource: claim.articleSource,
    articleSourceHost: claim.articleSourceHost,
    articleFingerprint: claim.articleFingerprint,
  },
}

const bundle = {
  fingerprint: 'fp-001',
  articleIds: [claim.articleId],
  attributedOutlets: [claim.articleSource],
  topic: claim.topic,
  items: [item],
  verdictMix: {
    verificado: 0,
    parcial: 1,
    contradicho: 0,
    'sin-datos': 0,
    'promesa-repetida': 0,
  },
  score: 1.8,
  earliestDate: '2026-05-19',
  latestDate: '2026-05-20',
}

// ─── the matcher has to work before its silence means anything ─────────────

describe('the command matcher itself', () => {
  it('catches the exact string that was published', () => {
    // Fault injection. Without this the whole file could be green because the
    // regex matches nothing, which is how two suites here shipped measuring
    // nothing.
    expect(
      commandsIn(
        'Lote auto-curado por el laboratorio. Para una verificación editorial ' +
          'completa, ejecute promote-press-claim.',
      ),
    ).toContain('promote-press-claim')
    expect(
      commandsIn('Review each one and run `npm run promote-press-claim` to publish'),
    ).toContain('promote-press-claim')
  })

  it('does not fire on hyphenated prose that is not a command', () => {
    expect(commandsIn('El veredicto sin-datos sobre Riba-roja es una promesa-repetida')).toEqual([])
  })

  it('reads real script names off package.json', () => {
    const scripts = knownScripts()
    expect(scripts.size).toBeGreaterThan(50)
    expect(scripts.has('auto-curate-press')).toBe(true)
    expect(scripts.has('correct-press-finding')).toBe(true)
    expect(scripts.has('promote-press-claim')).toBe(false)
  })
})

describe('press subsystem: every command it names is runnable', () => {
  const scripts = knownScripts()
  const files = pressSources()

  it('scans a non-empty set of press sources', () => {
    // Coverage first: if the glob stops matching, every assertion below passes
    // over nothing.
    expect(files.length).toBeGreaterThanOrEqual(10)
  })

  it('finds command references to check', () => {
    const total = files.reduce(
      (n, f) => n + commandsIn(readFileSync(resolve(ROOT, f), 'utf8')).length,
      0,
    )
    expect(total).toBeGreaterThanOrEqual(20)
  })

  it('names no script that does not exist', () => {
    const phantom: string[] = []
    for (const f of files) {
      for (const name of commandsIn(readFileSync(resolve(ROOT, f), 'utf8'))) {
        if (!scripts.has(name)) phantom.push(`${f} → npm run ${name}`)
      }
    }
    expect(phantom).toEqual([])
  })
})

describe('press surfaces a human is told to act on', () => {
  it('the PUBLISHED finding summary instructs no command', () => {
    const finding = composeFinding({ bundle, publishedAt: '2026-08-09' })
    expect(finding.summary.length).toBeGreaterThan(40)
    for (const name of commandsIn(finding.summary)) {
      expect(knownScripts().has(name), `summary names ${name}`).toBe(true)
    }
  })

  it('the quarantine queue instructs no command that does not exist', () => {
    const md = renderQuarantineMarkdown([bundle])
    // The queue is the file a curator opens after a contradicho bundle is
    // held. It used to end "run `npm run promote-press-claim` to publish";
    // there is no such path, and saying so is the whole point of the file.
    expect(md).toContain('contradicho')
    for (const name of commandsIn(md)) {
      expect(knownScripts().has(name), `queue names ${name}`).toBe(true)
    }
  })
})
