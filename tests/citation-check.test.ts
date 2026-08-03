import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  blocks,
  checkCitations,
  collectSourceRefs,
  type ReportLike,
} from '../src/scraper/citation-check'
import { ssrfReason, stateForStatus } from '../scripts/lib/doc-fetch'
import { quoteAppearsIn } from '../src/scraper/quote-match'

// A REAL published row, trimmed — not an invented shape. Six tests in this repo
// once built shapes that could not exist and stayed green while production
// matched nothing (DATA_INTEGRITY.md rule 1).
const FIXTURE = resolve(__dirname, 'fixtures/journalist-report_2026-08-03.json')
const base = (): ReportLike => JSON.parse(readFileSync(FIXTURE, 'utf8'))

describe('citation-check: the clean case', () => {
  it('finds nothing wrong with a real published report', () => {
    const r = checkCitations({ reports: [base()] })
    expect(r.findings.filter((f) => f.severity !== 'info')).toEqual([])
    expect(blocks(r)).toBe(false)
  })

  // The zero above is only worth anything if the same check can produce a
  // non-zero. Every test below breaks one thing and asserts it is caught.
  it('reports coverage even when it finds nothing', () => {
    const r = checkCitations({ reports: [base()] })
    expect(r.coverage.reports).toBe(1)
    expect(r.coverage.sources).toBeGreaterThan(0)
    expect(r.coverage.sourcesWithExcerpt).toBeGreaterThan(0)
  })

  it('says how many URLs it did NOT check, rather than implying it checked all', () => {
    const rep = base()
    const r = checkCitations({ reports: [rep] })
    expect(r.coverage.urls).toBeGreaterThan(0)
    expect(r.coverage.urlsChecked).toBe(0) // no urlStates passed
  })
})

describe('citation-check: a claim with no citation', () => {
  it('catches a sourceId that resolves to nothing', () => {
    const rep = base()
    const nar = rep.sections.find((s) => (s as { kind: string }).kind === 'narrative') as {
      payload: { sourceIds: string[] }
    }
    nar.payload.sourceIds.push('src-does-not-exist')
    const r = checkCitations({ reports: [rep] })
    expect(r.findings.map((f) => f.code)).toContain('orphan-source-ref')
    expect(blocks(r)).toBe(true)
  })

  it('walks nested sections — a ref buried in a payload still counts', () => {
    const refs = collectSourceRefs({
      a: [{ b: { sourceIds: ['x'] } }, { c: { d: { sourceId: 'y' } } }],
    })
    expect(refs.sort()).toEqual(['x', 'y'])
  })
})

describe('citation-check: a quote that is not in what it cites', () => {
  it('catches a fabricated quote', () => {
    const rep = base()
    const qc = rep.sections.find((s) => (s as { kind: string }).kind === 'quote-card') as {
      payload: { verbatim: string }
    }
    qc.payload.verbatim = 'Esta frase no la pronunció nadie en ningún pleno de este municipio.'
    const r = checkCitations({ reports: [rep] })
    expect(r.findings.map((f) => f.code)).toContain('quote-not-in-excerpt')
    expect(blocks(r)).toBe(true)
  })

  it('does NOT fire on a quote trimmed differently from its excerpt', () => {
    // The false positive that matters: a curator trimming the opening words
    // must not read as a fabrication. quoteAppearsIn slides the window.
    const excerpt = 'pasar esos 50-60% que sí que se retiran de contenedores al día en el municipio'
    const quote = 'los 50-60% que sí que se retiran de contenedores al día'
    expect(quoteAppearsIn(quote, excerpt)).toBe(true)
  })

  it('matches an excerpt across PDF layout noise', () => {
    // 11 of 68 real citations failed a naive verbatim match against the acta
    // PDF they came from — bullets orphaned onto their own line by pdftotext,
    // a page number injected mid-list. Same words, different layout. A checker
    // that called those fabrications would be wrong 16% of the time.
    const fromPdf = `Proceden a formular juramento o promesa
por el siguiente orden:
-

Rafael Folgado Navarro
Jose Manuel Gallardo Martinez
2
Jose Luis Fernandez Santamaria`
    const excerpt = `por el siguiente orden:
- Rafael Folgado Navarro
- Jose Manuel Gallardo Martínez
- Jose Luis Fernández Santamaria`
    expect(quoteAppearsIn(excerpt, fromPdf)).toBe(true)
  })
})

describe('citation-check: a citation nobody can re-verify', () => {
  it('warns when a source has neither excerpt nor localPath', () => {
    const rep = base()
    delete rep.sources[0].excerpt
    delete rep.sources[0].localPath
    const r = checkCitations({ reports: [rep] })
    expect(r.findings.map((f) => f.code)).toContain('source-without-evidence')
    expect(blocks(r)).toBe(false) // a warning, not a block
  })
})

describe('citation-check: the three URL states', () => {
  const withUrl = (state: 'alive' | 'dead' | 'unverifiable', reason?: string) => {
    const rep = base()
    const url = rep.sources.find((s) => s.url)?.url as string
    return checkCitations({
      reports: [rep],
      urlStates: new Map([[url, { state, reason }]]),
    })
  }

  it('a dead URL blocks', () => {
    const r = withUrl('dead')
    expect(r.findings.map((f) => f.code)).toContain('url-dead')
    expect(blocks(r)).toBe(true)
  })

  it('an unreachable URL reports but NEVER blocks', () => {
    // regmeet.com refuses this IP; two ministries 403 a non-browser UA. On a
    // clean 48-URL corpus that is 4 findings. A gate wrong four times out of
    // forty-eight is one everybody learns to skip — and then it protects
    // nothing, exactly like the pre-push hook comment says.
    const r = withUrl('unverifiable', 'ECONNREFUSED')
    expect(r.findings.map((f) => f.code)).toContain('url-unverifiable')
    expect(blocks(r)).toBe(false)
  })

  it('an alive URL produces no finding at all', () => {
    const r = withUrl('alive')
    expect(r.findings.filter((f) => f.code.startsWith('url-'))).toEqual([])
  })

  it('counts a probed URL toward coverage', () => {
    expect(withUrl('alive').coverage.urlsChecked).toBeGreaterThan(0)
  })
})

describe('doc-fetch: status → state', () => {
  // The mapping IS the policy. 403 means "not to you", not "not there".
  it.each([
    [200, 'alive'],
    [204, 'alive'],
    [301, 'unverifiable'], // fetch follows redirects; a bare 3xx means it did not
    [401, 'unverifiable'],
    [403, 'unverifiable'],
    [404, 'dead'],
    [410, 'dead'],
    [429, 'unverifiable'],
    [500, 'unverifiable'],
    [503, 'unverifiable'],
  ])('%i → %s', (status, expected) => {
    expect(stateForStatus(status as number)).toBe(expected)
  })
})

describe('doc-fetch: SSRF guard', () => {
  // Untested in BOTH copies until the fork was removed. It is a security
  // control reached by a URL a curator pastes into the dashboard, so the
  // interesting assertion is that it refuses — a guard nobody has watched
  // refuse is the same as no guard.
  it.each([
    ['file:///etc/passwd', 'scheme'],
    ['ftp://example.org/x', 'scheme'],
    ['http://localhost:8080/x', 'localhost'],
    ['http://sub.localhost/x', 'localhost'],
    ['http://0.0.0.0/x', 'localhost'],
    ['http://127.0.0.1/x', '127'],
    ['http://10.1.2.3/x', '10'],
    ['http://192.168.1.1/x', '192.168'],
    ['http://172.16.0.1/x', '172'],
    ['http://172.31.255.1/x', '172'],
    // The cloud metadata endpoint — the reason this guard exists at all.
    ['http://169.254.169.254/latest/meta-data/', '169.254'],
    ['http://[::1]/x', 'IPv6 loopback'],
    ['http://[fe80::1]/x', 'IPv6 link-local'],
  ])('refuses %s', (url, fragment) => {
    const reason = ssrfReason(new URL(url))
    expect(reason).not.toBeNull()
    expect(reason).toContain(fragment)
  })

  it.each([
    'https://www.ribarroja.es/sites/www.ribarroja.es/files/migrate/x/filesGroup/acta.pdf',
    'http://regmeet.com/x',
    // 172.32 is public: the private block stops at 172.31, and an off-by-one
    // here would silently refuse real sources.
    'http://172.32.0.1/x',
    'http://11.0.0.1/x',
  ])('allows %s', (url) => {
    expect(ssrfReason(new URL(url))).toBeNull()
  })
})
