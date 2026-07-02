# Promise Auto-Curator — Engine (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless generation engine for the `/promesas` auto-curator — a daily LLM discovery pass + deterministic grounding + confidence-gated decision tiering that writes new-promise drafts to a local review queue and auto-publishes the high-confidence, grounded ones into `promises.json`.

**Architecture:** Pure, unit-tested modules (`promise-draft`, `promise-grounding`, `promise-auto-curate`, `promise-apply`) under `src/scraper/`, an LLM discovery caller under `src/llm/` mirroring the existing `auto-curate-llm.ts` dependency-injection pattern, and two `tsx` CLIs under `scripts/` (`apply-promise-draft`, `auto-curate-promises`) that glue them together. The queue lives in the gitignored `editorial/` dir; only the apply path writes the legally-material `promises.json`, always via read→validate→mutate→re-validate→write.

**Tech Stack:** TypeScript (ESM, `npx tsx`), Zod (LLM schemas), Vitest + happy-dom (tests), Node `node:crypto`/`node:fs`. LLM via the repo's `src/llm/client.ts` (`callLLM`, Gemini/claude-code backends, `$0` subscription).

## Global Constraints

- **Two-file separation:** the queue is `editorial/promise-review-queue.json` (gitignored). The ONLY writer of `public/data/promises.json` is the apply path, via `validatePromisesSnapshot(raw)` → mutate → `validatePromisesSnapshot(serialized)` → write. Never write on top of a broken snapshot.
- **V1 evidence gate stays:** `validatePromisesSnapshot` rejects any non-`documentada`/`en-verificacion` status without ≥1 evidence entry. Do not loosen it. Discovery only ever produces `documentada`.
- **LOREG freeze fail-closed:** if `promises.json` is missing/unreadable → exit 1 (refuse). If `isFrozen(snap)` → exit 0, write nothing.
- **Auto-publish gate:** `confidence ≥ 0.70` AND `grounding.grounded === true`. Confidence alone never publishes. `no-ejecutada` → `fast-track` (never silent). `inviable` → never machine-published.
- **Provenance:** every auto-published promise carries `autoPublished: { by: 'auto-curation-v1', ... }`.
- **No dotenv in this repo.** LLM env comes from the ambient shell via `loadConfigFromEnv()` reading `process.env`. Pure apply CLIs that don't call the LLM need no env.
- **npm script pattern:** `"<name>": "npx tsx scripts/<file>.ts"`. User args after `--`.
- **Vitest `globals: false`** — every test file must `import { describe, it, expect } from 'vitest'`. Test files live under `tests/**/*.test.ts` (they are NOT type-checked by `tsc`; `tsc --noEmit` covers `src/**` + `scripts/**`).
- **Determinism:** pure functions take an injected `now`/clock where they'd otherwise call `new Date()`, so tests can snapshot output (mirror `inferPromiseSuggestions`'s `nowIso` param).
- **Commit trailer** on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW
  ```
- Work on branch `feat/promise-auto-curator` (already created). Husky pre-commit runs `npm run lint` (fails on errors) + Prettier check — keep code Prettier-clean.

---

## Task 1: Queue schema + validators (`promise-draft.ts`)

**Files:**
- Create: `src/scraper/promise-draft.ts`
- Test: `tests/parse-promise-draft.test.ts`

**Interfaces:**
- Consumes: `fnv32` from `src/scraper/hash.ts`; `slugify` from `src/scraper/normalize.ts`; `ALLOWED_PARTIES`, `ALLOWED_TOPICS`, `ALLOWED_KINDS`, `type Party`, `type Topic`, `type Kind` from `src/scraper/promises.ts`.
- Produces: `type DraftDecision`, `interface Grounding`, `interface DraftNewPromise`, `interface PromiseReviewQueue`, `QUEUE_VERSION`, `makeDraftId(party, title, sourceUrl): string`, `validateReviewQueue(json: string): PromiseReviewQueue`, `emptyQueue(now: string): PromiseReviewQueue`, `removeDraftFromQueue(queue, draftId): PromiseReviewQueue`.

- [ ] **Step 1: Write the failing test**

Create `tests/parse-promise-draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  makeDraftId,
  validateReviewQueue,
  emptyQueue,
  removeDraftFromQueue,
  type DraftNewPromise,
  type PromiseReviewQueue,
} from '../src/scraper/promise-draft'

function draft(overrides: Partial<DraftNewPromise> = {}): DraftNewPromise {
  return {
    draftId: 'dnp-psoe-abc123',
    kind: 'new-promise',
    requiresHumanApproval: true,
    confidence: 0.82,
    grounding: { grounded: true, urlResolved: true, quoteFound: true, checkedAt: '2026-07-02T00:00:00.000Z' },
    decision: 'auto-publish',
    proposed: {
      party: 'PSOE',
      title: 'Nuevo carril bici en la Avenida del Camp de Túria',
      quote: 'El gobierno municipal construirá un carril bici en la Avenida del Camp de Túria antes de 2027.',
      source: { url: 'https://example.com/noticia', publisher: 'Levante-EMV' },
      madeAt: '2026-06-20',
      topic: 'movilidad',
      kind: 'anuncio-gobierno',
      status: 'documentada',
    },
    reasoning: [{ url: 'https://example.com/noticia', date: '2026-06-20', quote: 'carril bici', matchedKeywords: ['carril', 'bici'] }],
    generatedAt: '2026-07-02T00:00:00.000Z',
    ...overrides,
  }
}

function queue(drafts: DraftNewPromise[]): string {
  const q: PromiseReviewQueue = { version: '1.0', generatedAt: '2026-07-02T00:00:00.000Z', drafts }
  return JSON.stringify(q)
}

describe('promise-draft', () => {
  it('makeDraftId is deterministic and namespaced', () => {
    const a = makeDraftId('PSOE', 'Título largo de prueba', 'https://x.test/n')
    const b = makeDraftId('PSOE', 'Título largo de prueba', 'https://x.test/n')
    expect(a).toBe(b)
    expect(a.startsWith('dnp-psoe-')).toBe(true)
  })

  it('validates a well-formed queue', () => {
    const q = validateReviewQueue(queue([draft()]))
    expect(q.drafts).toHaveLength(1)
    expect(q.drafts[0].proposed.party).toBe('PSOE')
  })

  it('rejects a quote shorter than 20 chars', () => {
    const q = JSON.parse(queue([draft()]))
    q.drafts[0].proposed.quote = 'muy corto'
    expect(() => validateReviewQueue(JSON.stringify(q))).toThrow(/quote/)
  })

  it('rejects a status other than documentada', () => {
    const q = JSON.parse(queue([draft()]))
    q.drafts[0].proposed.status = 'cumplida'
    expect(() => validateReviewQueue(JSON.stringify(q))).toThrow(/status/)
  })

  it('rejects an unknown party', () => {
    const q = JSON.parse(queue([draft()]))
    q.drafts[0].proposed.party = 'PODEMOS'
    expect(() => validateReviewQueue(JSON.stringify(q))).toThrow(/party/)
  })

  it('rejects requiresHumanApproval !== true', () => {
    const q = JSON.parse(queue([draft()]))
    q.drafts[0].requiresHumanApproval = false
    expect(() => validateReviewQueue(JSON.stringify(q))).toThrow(/requiresHumanApproval/)
  })

  it('emptyQueue + removeDraftFromQueue behave', () => {
    const e = emptyQueue('2026-07-02T00:00:00.000Z')
    expect(e.drafts).toHaveLength(0)
    const withOne = validateReviewQueue(queue([draft()]))
    const removed = removeDraftFromQueue(withOne, 'dnp-psoe-abc123')
    expect(removed.drafts).toHaveLength(0)
    const untouched = removeDraftFromQueue(withOne, 'nope')
    expect(untouched.drafts).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse-promise-draft.test.ts`
Expected: FAIL — `Cannot find module '../src/scraper/promise-draft'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scraper/promise-draft.ts`:

```ts
/**
 * Schema + validators for the promise auto-curator review queue.
 *
 * The queue lives at editorial/promise-review-queue.json (gitignored,
 * local-only — unreviewed party attributions never leave the laptop).
 * Every record carries requiresHumanApproval:true. This module NEVER
 * writes promises.json; the apply path (promise-apply.ts) does.
 */
import { fnv32 } from './hash'
import { slugify } from './normalize'
import {
  ALLOWED_PARTIES,
  ALLOWED_TOPICS,
  ALLOWED_KINDS,
  type Party,
  type Topic,
  type Kind,
} from './promises'

export const QUEUE_VERSION = '1.0'

export type DraftDecision = 'auto-publish' | 'fast-track' | 'queue'
const DECISIONS: readonly DraftDecision[] = ['auto-publish', 'fast-track', 'queue']

export interface Grounding {
  grounded: boolean
  urlResolved: boolean
  quoteFound: boolean
  resolvedUrl?: string
  checkedAt: string
}

export interface DraftReasoning {
  url: string
  date: string
  quote: string
  publisher?: string
  matchedKeywords: string[]
}

export interface DraftNewPromise {
  draftId: string
  kind: 'new-promise'
  requiresHumanApproval: true
  confidence: number
  grounding: Grounding
  decision: DraftDecision
  proposed: {
    party: Party
    title: string
    quote: string
    source: { url: string; publisher: string }
    madeAt: string
    topic: Topic
    kind: Kind
    status: 'documentada'
  }
  reasoning: DraftReasoning[]
  generatedAt: string
}

export interface PromiseReviewQueue {
  version: string
  generatedAt: string
  drafts: DraftNewPromise[]
}

class QueueValidationError extends Error {
  constructor(msg: string) {
    super(`promise-review-queue: ${msg}`)
  }
}

function str(v: unknown, name: string, min = 1, max = Infinity): string {
  if (typeof v !== 'string') throw new QueueValidationError(`${name} must be string`)
  if (v.length < min) throw new QueueValidationError(`${name} too short (${v.length} < ${min})`)
  if (v.length > max) throw new QueueValidationError(`${name} too long (${v.length} > ${max})`)
  return v
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], name: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new QueueValidationError(`${name} must be one of [${allowed.join(', ')}] (got ${JSON.stringify(v)})`)
  }
  return v as T
}

function iso(v: unknown, name: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) {
    throw new QueueValidationError(`${name} must be ISO date (got ${JSON.stringify(v)})`)
  }
  return v
}

function url(v: unknown, name: string): string {
  if (typeof v !== 'string' || !/^https?:\/\//.test(v)) {
    throw new QueueValidationError(`${name} must be http(s) URL (got ${JSON.stringify(v)})`)
  }
  return v
}

export function makeDraftId(party: string, title: string, sourceUrl: string): string {
  return `dnp-${slugify(party)}-${fnv32(`${party}|${title}|${sourceUrl}`)}`
}

function validateDraft(d: unknown, i: number): DraftNewPromise {
  if (!d || typeof d !== 'object') throw new QueueValidationError(`drafts[${i}] must be object`)
  const r = d as Record<string, unknown>
  str(r.draftId, `drafts[${i}].draftId`, 3, 120)
  if (r.kind !== 'new-promise') throw new QueueValidationError(`drafts[${i}].kind must be 'new-promise'`)
  if (r.requiresHumanApproval !== true)
    throw new QueueValidationError(`drafts[${i}].requiresHumanApproval must be true`)
  if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1)
    throw new QueueValidationError(`drafts[${i}].confidence must be 0..1`)
  oneOf(r.decision, DECISIONS, `drafts[${i}].decision`)
  const g = r.grounding as Record<string, unknown>
  if (!g || typeof g !== 'object') throw new QueueValidationError(`drafts[${i}].grounding missing`)
  if (typeof g.grounded !== 'boolean') throw new QueueValidationError(`drafts[${i}].grounding.grounded must be bool`)
  const p = r.proposed as Record<string, unknown>
  if (!p || typeof p !== 'object') throw new QueueValidationError(`drafts[${i}].proposed missing`)
  oneOf(p.party, ALLOWED_PARTIES, `drafts[${i}].proposed.party`)
  str(p.title, `drafts[${i}].proposed.title`, 4, 200)
  str(p.quote, `drafts[${i}].proposed.quote`, 20, 1500)
  const src = p.source as Record<string, unknown>
  if (!src || typeof src !== 'object') throw new QueueValidationError(`drafts[${i}].proposed.source missing`)
  url(src.url, `drafts[${i}].proposed.source.url`)
  str(src.publisher, `drafts[${i}].proposed.source.publisher`, 1, 100)
  iso(p.madeAt, `drafts[${i}].proposed.madeAt`)
  oneOf(p.topic, ALLOWED_TOPICS, `drafts[${i}].proposed.topic`)
  oneOf(p.kind, ALLOWED_KINDS, `drafts[${i}].proposed.kind`)
  if (p.status !== 'documentada')
    throw new QueueValidationError(`drafts[${i}].proposed.status must be 'documentada' (discovery is V1-only)`)
  if (!Array.isArray(r.reasoning)) throw new QueueValidationError(`drafts[${i}].reasoning must be array`)
  str(r.generatedAt, `drafts[${i}].generatedAt`)
  return r as unknown as DraftNewPromise
}

export function validateReviewQueue(json: string): PromiseReviewQueue {
  const raw = JSON.parse(json) as Record<string, unknown>
  str(raw.version, 'version')
  str(raw.generatedAt, 'generatedAt')
  if (!Array.isArray(raw.drafts)) throw new QueueValidationError('drafts must be array')
  const drafts = (raw.drafts as unknown[]).map((d, i) => validateDraft(d, i))
  const seen = new Set<string>()
  for (const d of drafts) {
    if (seen.has(d.draftId)) throw new QueueValidationError(`duplicate draftId "${d.draftId}"`)
    seen.add(d.draftId)
  }
  return { version: raw.version as string, generatedAt: raw.generatedAt as string, drafts }
}

export function emptyQueue(now: string): PromiseReviewQueue {
  return { version: QUEUE_VERSION, generatedAt: now, drafts: [] }
}

export function removeDraftFromQueue(queue: PromiseReviewQueue, draftId: string): PromiseReviewQueue {
  return { ...queue, drafts: queue.drafts.filter((d) => d.draftId !== draftId) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parse-promise-draft.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scraper/promise-draft.ts tests/parse-promise-draft.test.ts
git commit -m "feat(promesas): review-queue schema + validators (promise-draft)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW"
```

---

## Task 2: Deterministic grounding (`promise-grounding.ts`)

**Files:**
- Create: `src/scraper/promise-grounding.ts`
- Test: `tests/parse-promise-grounding.test.ts`

**Interfaces:**
- Consumes: `stripDiacritics` from `src/scraper/normalize.ts`; `ALLOWED_PARTIES` from `src/scraper/promises.ts`; `type DraftNewPromise`, `type Grounding` from `src/scraper/promise-draft.ts`.
- Produces: `normalizeForMatch(s): string`, `stripHtml(html): string`, `quoteFoundInText(quote, pageText): boolean`, `partyDateOk(party, madeAt, now?): boolean`, `type FetchLike`, `groundDraft(draft, fetchImpl?, now?): Promise<Grounding>`.

- [ ] **Step 1: Write the failing test**

Create `tests/parse-promise-grounding.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  quoteFoundInText,
  partyDateOk,
  stripHtml,
  groundDraft,
  type FetchLike,
} from '../src/scraper/promise-grounding'
import type { DraftNewPromise } from '../src/scraper/promise-draft'

const NOW = new Date('2026-07-02T00:00:00.000Z')

function draft(overrides: Partial<DraftNewPromise['proposed']> = {}): DraftNewPromise {
  return {
    draftId: 'dnp-psoe-abc',
    kind: 'new-promise',
    requiresHumanApproval: true,
    confidence: 0.9,
    grounding: { grounded: false, urlResolved: false, quoteFound: false, checkedAt: '' },
    decision: 'queue',
    proposed: {
      party: 'PSOE',
      title: 'Carril bici',
      quote: 'Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027',
      source: { url: 'https://example.com/n', publisher: 'Levante-EMV' },
      madeAt: '2026-06-20',
      topic: 'movilidad',
      kind: 'anuncio-gobierno',
      status: 'documentada',
      ...overrides,
    },
    reasoning: [],
    generatedAt: '2026-07-02T00:00:00.000Z',
  }
}

describe('promise-grounding', () => {
  it('stripHtml removes tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hola   <b>mundo</b></p>')).toBe('Hola mundo')
  })

  it('quoteFoundInText matches ignoring case/diacritics', () => {
    expect(quoteFoundInText('Construiremos un CARRIL bici', 'nota: construiremos un carril bici pronto')).toBe(true)
  })

  it('quoteFoundInText rejects an absent quote', () => {
    expect(quoteFoundInText('Bajaremos el IBI un 10%', 'la noticia habla de otra cosa distinta')).toBe(false)
  })

  it('partyDateOk rejects future dates and bad party', () => {
    expect(partyDateOk('PSOE', '2026-06-20', NOW)).toBe(true)
    expect(partyDateOk('PSOE', '2099-01-01', NOW)).toBe(false)
    expect(partyDateOk('PODEMOS', '2026-06-20', NOW)).toBe(false)
  })

  it('groundDraft returns grounded when URL resolves and quote is present', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      url: 'https://real-publisher.example/n',
      text: async () => '<article>Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027, dijo el alcalde.</article>',
    })
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(true)
    expect(g.urlResolved).toBe(true)
    expect(g.quoteFound).toBe(true)
    expect(g.resolvedUrl).toBe('https://real-publisher.example/n')
  })

  it('groundDraft fails safe when quote is absent', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: true, url: 'https://x/n', text: async () => '<p>texto sin la cita</p>' })
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(false)
    expect(g.quoteFound).toBe(false)
  })

  it('groundDraft fails safe on network error', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('ECONNREFUSED')
    }
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(false)
    expect(g.urlResolved).toBe(false)
  })

  it('groundDraft fails safe on non-200', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, url: 'https://x/404', text: async () => '' })
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(false)
    expect(g.urlResolved).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse-promise-grounding.test.ts`
Expected: FAIL — `Cannot find module '../src/scraper/promise-grounding'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scraper/promise-grounding.ts`:

```ts
/**
 * Deterministic grounding for auto-curator drafts. LLM self-confidence is
 * uncalibrated, so grounding is the real gate before anything auto-publishes:
 * the source URL must resolve (200), the verbatim quote must actually appear
 * in the fetched page, and the party/date must be sane. Any failure returns
 * grounded:false, which forces the draft to the human queue (fail-safe).
 *
 * NOTE: grounding proves the SOURCE exists, not that an accusatory inference
 * is sound. That is why 'no-ejecutada' verdicts never auto-publish even when
 * grounded (see promise-auto-curate.ts STATUS_TIER).
 */
import { stripDiacritics } from './normalize'
import { ALLOWED_PARTIES } from './promises'
import type { DraftNewPromise, Grounding } from './promise-draft'

export function normalizeForMatch(s: string): string {
  return stripDiacritics(s.toLowerCase()).replace(/\s+/g, ' ').trim()
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&laquo;|&raquo;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Substring match after normalization; token-coverage ≥0.9 fallback for
 *  minor punctuation drift. Strict on purpose — a miss costs only a queue
 *  fallback, a false match could auto-publish a wrong attribution. */
export function quoteFoundInText(quote: string, pageText: string): boolean {
  const q = normalizeForMatch(quote)
  const t = normalizeForMatch(pageText)
  if (q.length < 12) return false
  if (t.includes(q)) return true
  const qTokens = q.split(' ').filter((w) => w.length > 2)
  if (qTokens.length < 4) return false
  const tSet = new Set(t.split(' '))
  const hit = qTokens.filter((w) => tSet.has(w)).length
  return hit / qTokens.length >= 0.9
}

export function partyDateOk(party: string, madeAt: string, now: Date = new Date()): boolean {
  if (!(ALLOWED_PARTIES as readonly string[]).includes(party)) return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(madeAt)) return false
  const d = new Date(madeAt + 'T00:00:00Z')
  if (!Number.isFinite(d.getTime())) return false
  return d.getTime() <= now.getTime()
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; url: string; text: () => Promise<string> }>

export async function groundDraft(
  draft: DraftNewPromise,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  now: Date = new Date(),
): Promise<Grounding> {
  const checkedAt = now.toISOString()
  const fail: Grounding = { grounded: false, urlResolved: false, quoteFound: false, checkedAt }
  if (!partyDateOk(draft.proposed.party, draft.proposed.madeAt, now)) return fail
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await fetchImpl(draft.proposed.source.url)
  } catch {
    return fail
  }
  if (!res.ok) return { ...fail, resolvedUrl: res.url }
  let html = ''
  try {
    html = await res.text()
  } catch {
    return { ...fail, urlResolved: true, resolvedUrl: res.url }
  }
  const quoteFound = quoteFoundInText(draft.proposed.quote, stripHtml(html))
  return { grounded: quoteFound, urlResolved: true, quoteFound, resolvedUrl: res.url, checkedAt }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parse-promise-grounding.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scraper/promise-grounding.ts tests/parse-promise-grounding.test.ts
git commit -m "feat(promesas): deterministic grounding gate (promise-grounding)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW"
```

---

## Task 3: Decision tiering + selection core (`promise-auto-curate.ts`)

**Files:**
- Create: `src/scraper/promise-auto-curate.ts`
- Test: `tests/parse-promise-auto-curate.test.ts`

**Interfaces:**
- Consumes: `type Status` from `src/scraper/promises.ts`; `stripDiacritics` from `src/scraper/normalize.ts`; `type DraftNewPromise`, `type DraftDecision`, `type Grounding` from `src/scraper/promise-draft.ts`.
- Produces: `AUTO_PUBLISH_MIN_CONFIDENCE` (0.7), `STATUS_TIER` (Record<Status,'auto'|'fast-track'|'human-only'>), `decideDraft(status, confidence, grounding, minConfidence?): DraftDecision`, `interface SelectInput`, `interface SelectOutput`, `normKey(party, title): string`, `selectPromiseDrafts(input): SelectOutput`.

- [ ] **Step 1: Write the failing test**

Create `tests/parse-promise-auto-curate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  STATUS_TIER,
  decideDraft,
  selectPromiseDrafts,
  AUTO_PUBLISH_MIN_CONFIDENCE,
} from '../src/scraper/promise-auto-curate'
import type { DraftNewPromise, Grounding } from '../src/scraper/promise-draft'

const GROUNDED: Grounding = { grounded: true, urlResolved: true, quoteFound: true, checkedAt: 'x' }
const UNGROUNDED: Grounding = { grounded: false, urlResolved: true, quoteFound: false, checkedAt: 'x' }

function draft(id: string, over: Partial<DraftNewPromise> = {}): DraftNewPromise {
  return {
    draftId: id,
    kind: 'new-promise',
    requiresHumanApproval: true,
    confidence: 0.9,
    grounding: GROUNDED,
    decision: 'queue',
    proposed: {
      party: 'PSOE',
      title: `Título ${id}`,
      quote: 'Una promesa verbatim con longitud suficiente para pasar el validador de citas.',
      source: { url: `https://x.test/${id}`, publisher: 'Levante-EMV' },
      madeAt: '2026-06-20',
      topic: 'movilidad',
      kind: 'anuncio-gobierno',
      status: 'documentada',
    },
    reasoning: [],
    generatedAt: 'x',
    ...over,
  }
}

describe('promise-auto-curate — decideDraft', () => {
  it('documentada grounded + confident → auto-publish', () => {
    expect(decideDraft('documentada', 0.7, GROUNDED)).toBe('auto-publish')
  })
  it('below threshold → queue', () => {
    expect(decideDraft('documentada', 0.69, GROUNDED)).toBe('queue')
  })
  it('ungrounded → queue even if confident', () => {
    expect(decideDraft('documentada', 0.99, UNGROUNDED)).toBe('queue')
  })
  it('no-ejecutada grounded + confident → fast-track (never auto)', () => {
    expect(decideDraft('no-ejecutada', 0.99, GROUNDED)).toBe('fast-track')
  })
  it('inviable → always queue', () => {
    expect(decideDraft('inviable', 0.99, GROUNDED)).toBe('queue')
  })
  it('positive escalations map to auto', () => {
    for (const s of ['en-verificacion', 'en-progreso', 'parcial', 'cumplida'] as const) {
      expect(STATUS_TIER[s]).toBe('auto')
      expect(decideDraft(s, 0.8, GROUNDED)).toBe('auto-publish')
    }
  })
  it('threshold constant is 0.70', () => {
    expect(AUTO_PUBLISH_MIN_CONFIDENCE).toBe(0.7)
  })
})

describe('promise-auto-curate — selectPromiseDrafts', () => {
  it('frozen → everything skipped, nothing published', () => {
    const out = selectPromiseDrafts({
      candidates: [draft('a')],
      existingPromises: [],
      seenDraftIds: new Set(),
      frozen: true,
    })
    expect(out.autoPublish).toHaveLength(0)
    expect(out.queue).toHaveLength(0)
    expect(out.skipped[0].reason).toBe('frozen')
  })

  it('splits auto-publish vs queue and dedups', () => {
    const out = selectPromiseDrafts({
      candidates: [
        draft('a', { confidence: 0.9, grounding: GROUNDED }), // auto
        draft('b', { confidence: 0.5, grounding: GROUNDED }), // queue (low conf)
        draft('c', { confidence: 0.9, grounding: UNGROUNDED }), // queue (ungrounded)
      ],
      existingPromises: [],
      seenDraftIds: new Set(),
      frozen: false,
    })
    expect(out.autoPublish.map((d) => d.draftId)).toEqual(['a'])
    expect(out.queue.map((d) => d.draftId).sort()).toEqual(['b', 'c'])
  })

  it('skips drafts already seen or already tracked by title/url', () => {
    const out = selectPromiseDrafts({
      candidates: [
        draft('seen'),
        draft('dupurl', { proposed: { ...draft('x').proposed, source: { url: 'https://tracked.test/n', publisher: 'X' } } }),
      ],
      existingPromises: [{ id: 'p1', party: 'PP', title: 'otra cosa', source: { url: 'https://tracked.test/n' } }],
      seenDraftIds: new Set(['seen']),
      frozen: false,
    })
    expect(out.autoPublish).toHaveLength(0)
    expect(out.queue).toHaveLength(0)
    expect(out.skipped.map((s) => s.reason).sort()).toEqual(['already-tracked', 'duplicate'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse-promise-auto-curate.test.ts`
Expected: FAIL — `Cannot find module '../src/scraper/promise-auto-curate'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scraper/promise-auto-curate.ts`:

```ts
/**
 * Pure decision core for the promise auto-curator. Maps each grounded
 * candidate to {auto-publish | fast-track | queue} by status tier +
 * confidence + grounding, and splits a candidate batch accordingly.
 *
 * No I/O, no LLM, no network — fully unit-tested. The orchestrator CLI
 * (scripts/auto-curate-promises.ts) supplies grounded candidates and
 * persists the result.
 */
import type { Status } from './promises'
import { stripDiacritics } from './normalize'
import type { DraftNewPromise, DraftDecision, Grounding } from './promise-draft'

export const AUTO_PUBLISH_MIN_CONFIDENCE = 0.7

/**
 * Risk tier per status. Positive/neutral verdicts auto-publish above the
 * gate; the accusatory 'no-ejecutada' is fast-track (one human click);
 * 'inviable' is never machine-published. Edit this map to retune posture.
 */
export const STATUS_TIER: Record<Status, 'auto' | 'fast-track' | 'human-only'> = {
  documentada: 'auto',
  'en-verificacion': 'auto',
  'en-progreso': 'auto',
  parcial: 'auto',
  cumplida: 'auto',
  'no-ejecutada': 'fast-track',
  inviable: 'human-only',
}

export function decideDraft(
  status: Status,
  confidence: number,
  grounding: Grounding,
  minConfidence: number = AUTO_PUBLISH_MIN_CONFIDENCE,
): DraftDecision {
  const tier = STATUS_TIER[status]
  if (tier === 'human-only') return 'queue'
  const clears = confidence >= minConfidence && grounding.grounded
  if (!clears) return 'queue'
  return tier === 'auto' ? 'auto-publish' : 'fast-track'
}

export function normKey(party: string, title: string): string {
  return `${stripDiacritics(party.toLowerCase())}::${stripDiacritics(title.toLowerCase()).replace(/\s+/g, ' ').trim()}`
}

export interface SelectInput {
  candidates: DraftNewPromise[]
  existingPromises: Array<{ id: string; party: string; title: string; source?: { url?: string } }>
  seenDraftIds: Set<string>
  frozen: boolean
  minConfidence?: number
  max?: number
}

export interface SelectOutput {
  autoPublish: DraftNewPromise[]
  queue: DraftNewPromise[]
  skipped: Array<{ draftId: string; reason: string }>
}

export function selectPromiseDrafts(inp: SelectInput): SelectOutput {
  const out: SelectOutput = { autoPublish: [], queue: [], skipped: [] }
  if (inp.frozen) {
    for (const c of inp.candidates) out.skipped.push({ draftId: c.draftId, reason: 'frozen' })
    return out
  }
  const existingKeys = new Set(inp.existingPromises.map((p) => normKey(p.party, p.title)))
  const existingUrls = new Set(
    inp.existingPromises.map((p) => p.source?.url).filter((u): u is string => Boolean(u)),
  )
  const min = inp.minConfidence ?? AUTO_PUBLISH_MIN_CONFIDENCE
  let taken = 0
  for (const c of inp.candidates) {
    if (inp.max !== undefined && taken >= inp.max) {
      out.skipped.push({ draftId: c.draftId, reason: 'max-reached' })
      continue
    }
    if (inp.seenDraftIds.has(c.draftId)) {
      out.skipped.push({ draftId: c.draftId, reason: 'duplicate' })
      continue
    }
    if (existingKeys.has(normKey(c.proposed.party, c.proposed.title)) || existingUrls.has(c.proposed.source.url)) {
      out.skipped.push({ draftId: c.draftId, reason: 'already-tracked' })
      continue
    }
    const decision = decideDraft(c.proposed.status, c.confidence, c.grounding, min)
    const draft = { ...c, decision }
    if (decision === 'auto-publish') out.autoPublish.push(draft)
    else out.queue.push(draft)
    taken++
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parse-promise-auto-curate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/promise-auto-curate.ts tests/parse-promise-auto-curate.test.ts
git commit -m "feat(promesas): decision tiering + selection core (promise-auto-curate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW"
```

---

## Task 4: LLM discovery schema + prompt

**Files:**
- Modify: `src/llm/schemas.ts` (add discovery schemas; add import from `../scraper/promises`)
- Modify: `src/llm/prompts.ts` (add discovery prompt + version + input type)
- Test: `tests/promise-discovery-schema.test.ts`

**Interfaces:**
- Produces (schemas.ts): `PromiseDiscoveryItemSchema`, `PromiseDiscoveryBatchSchema`, `type PromiseDiscoveryItem`, `type PromiseDiscoveryBatch`.
- Produces (prompts.ts): `PROMISE_DISCOVERY_PROMPT_VERSION` (`'promise-discovery-v1'`), `interface PromiseDiscoveryInput`, `buildPromiseDiscoverySystemPrompt(): string`, `buildPromiseDiscoveryUserPrompt(input): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/promise-discovery-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PromiseDiscoveryBatchSchema } from '../src/llm/schemas'
import { buildPromiseDiscoverySystemPrompt, buildPromiseDiscoveryUserPrompt, PROMISE_DISCOVERY_PROMPT_VERSION } from '../src/llm/prompts'

describe('promise discovery schema + prompt', () => {
  it('accepts a valid discovery batch', () => {
    const parsed = PromiseDiscoveryBatchSchema.safeParse({
      promises: [
        {
          party: 'PSOE',
          title: 'Carril bici en la Avenida del Camp de Túria',
          quote: 'Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027.',
          sourceUrl: 'https://example.com/n',
          publisher: 'Levante-EMV',
          madeAt: '2026-06-20',
          topic: 'movilidad',
          kind: 'anuncio-gobierno',
          confidence: 0.82,
          reasoning: 'El alcalde anuncia el proyecto en rueda de prensa.',
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an out-of-enum topic', () => {
    const parsed = PromiseDiscoveryBatchSchema.safeParse({
      promises: [{ party: 'PSOE', title: 'x'.repeat(5), quote: 'y'.repeat(25), sourceUrl: 'https://x/n', publisher: 'X', madeAt: '2026-01-01', topic: 'NOPE', kind: 'anuncio-gobierno', confidence: 0.5, reasoning: 'z'.repeat(15) }],
    })
    expect(parsed.success).toBe(false)
  })

  it('version + prompts are present', () => {
    expect(PROMISE_DISCOVERY_PROMPT_VERSION).toBe('promise-discovery-v1')
    expect(buildPromiseDiscoverySystemPrompt().length).toBeGreaterThan(100)
    const u = buildPromiseDiscoveryUserPrompt({
      existingTitles: ['Ya seguida'],
      sources: [{ kind: 'press', items: [{ title: 'Nueva promesa', url: 'https://x/n', date: '2026-06-20', publisher: 'X', snippet: 's' }] }],
    })
    expect(u).toContain('Ya seguida')
    expect(u).toContain('Nueva promesa')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/promise-discovery-schema.test.ts`
Expected: FAIL — `PromiseDiscoveryBatchSchema` / prompt exports not defined.

- [ ] **Step 3a: Add schemas to `src/llm/schemas.ts`**

At the top of `src/llm/schemas.ts`, add this import beneath the existing `import { ... } from '../scraper/pleno-claim'` block (types included so the schema infers `Party`/`Topic`/`Kind`, not plain `string`):

```ts
import { ALLOWED_PARTIES, ALLOWED_TOPICS, ALLOWED_KINDS, type Party, type Topic, type Kind } from '../scraper/promises'
```

At the end of `src/llm/schemas.ts` (before any final exports, order doesn't matter — these are top-level `export const`s), add:

```ts
// ─── Promise discovery (auto-curator Phase 1) ──────────────────────────────
// The LLM proposes NEW public commitments not yet tracked. status is ALWAYS
// 'documentada' downstream (this schema omits it); the deterministic grounder
// + curator gate decide what publishes. Enums mirror src/scraper/promises.ts.
export const PromiseDiscoveryItemSchema = z.object({
  party: z.enum(ALLOWED_PARTIES as unknown as [Party, ...Party[]]),
  title: z.string().min(4).max(200),
  quote: z.string().min(20).max(1500),
  sourceUrl: z.string().url(),
  publisher: z.string().min(1).max(100),
  madeAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topic: z.enum(ALLOWED_TOPICS as unknown as [Topic, ...Topic[]]),
  kind: z.enum(ALLOWED_KINDS as unknown as [Kind, ...Kind[]]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10).max(500),
})
export type PromiseDiscoveryItem = z.infer<typeof PromiseDiscoveryItemSchema>

export const PromiseDiscoveryBatchSchema = z.object({
  promises: z.array(PromiseDiscoveryItemSchema).max(12),
})
export type PromiseDiscoveryBatch = z.infer<typeof PromiseDiscoveryBatchSchema>
```

- [ ] **Step 3b: Add prompt to `src/llm/prompts.ts`**

At the end of `src/llm/prompts.ts`, add:

```ts
// ─── Promise discovery (auto-curator Phase 1) ──────────────────────────────
export const PROMISE_DISCOVERY_PROMPT_VERSION = 'promise-discovery-v1'

export interface PromiseDiscoveryInput {
  existingTitles: string[]
  sources: Array<{
    kind: string
    items: Array<{ title: string; url: string; date: string; publisher?: string; snippet?: string }>
  }>
}

export function buildPromiseDiscoverySystemPrompt(): string {
  return `
Eres un periodista verificador para CivicPulse, plataforma de rendición de
cuentas del Ayuntamiento de Riba-roja de Túria (España). Tu tarea: detectar
PROMESAS o COMPROMISOS PÚBLICOS NUEVOS hechos por un partido o el gobierno
municipal en las fuentes que te doy, que AÚN NO estén en la lista de promesas
ya seguidas.

Para cada promesa nueva y clara, emite:
- party: uno de [${ALLOWED_PARTIES.join(', ')}] (nunca inventes otro)
- title: título breve y neutral (4-200 chars)
- quote: cita VERBATIM del compromiso (20-1500 chars, sin resumir ni reescribir)
- sourceUrl: URL EXACTA de la lista que te doy (NUNCA inventes URLs)
- publisher: fuente (p.ej. "Levante-EMV", "Ayuntamiento Riba-roja")
- madeAt: fecha ISO YYYY-MM-DD (la de la fuente; nunca futura)
- topic: uno de [${ALLOWED_TOPICS.join(', ')}]
- kind: uno de [${ALLOWED_KINDS.join(', ')}]
- confidence: 0..1 (≥0.7 = compromiso explícito y atribuible; <0.5 no emitir)
- reasoning: una frase explicando por qué es una promesa atribuible

REGLAS DURAS (riesgo de difamación real):
- SÓLO compromisos NUEVOS. Si el título coincide con uno ya seguido, NO lo emitas.
- NUNCA inventes URLs ni citas. La cita debe ser literal de la fuente.
- Atribuye SÓLO a nivel de PARTIDO, nunca a un concejal concreto por su nombre.
- No propongas estados de cumplimiento; sólo registras que la promesa se hizo.
- Si la fuente es una acusación de la oposición, NO la conviertas en promesa del gobierno.
- Ante la duda, baja la confianza o no emitas. La pérdida de recall es aceptable;
  los falsos positivos no.

Responde \`{"promises": []}\` si no hay ninguna promesa nueva clara.
Salida: un único objeto JSON {promises:[...]}. Sin texto adicional, sin fences.
`.trim()
}

export function buildPromiseDiscoveryUserPrompt(input: PromiseDiscoveryInput): string {
  const existing =
    input.existingTitles.length === 0
      ? '  (ninguna)'
      : input.existingTitles.map((t) => `  - ${t}`).join('\n')
  const sourceBlocks = input.sources
    .map((s) => {
      const lines = s.items
        .map(
          (it, i) =>
            `  [${s.kind}#${i + 1}] ${it.date} · ${it.publisher ?? ''} · ${it.title}\n    URL: ${it.url}\n    ${it.snippet ? `…${it.snippet.slice(0, 240)}…` : ''}`,
        )
        .join('\n')
      return `### ${s.kind.toUpperCase()} (${s.items.length})\n${lines}`
    })
    .join('\n\n')
  return `
PROMESAS YA SEGUIDAS (no las repitas):
${existing}

FUENTES A ANALIZAR:

${sourceBlocks}

Emite el JSON {promises:[...]} sólo con promesas NUEVAS y claras.
`.trim()
}
```

Note: `ALLOWED_PARTIES`, `ALLOWED_TOPICS`, `ALLOWED_KINDS` must be imported into `prompts.ts`. If not already present, add near the top:

```ts
import { ALLOWED_PARTIES, ALLOWED_TOPICS, ALLOWED_KINDS } from '../scraper/promises'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/promise-discovery-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/llm/schemas.ts src/llm/prompts.ts tests/promise-discovery-schema.test.ts
git commit -m "feat(promesas): LLM discovery schema + prompt (promise-discovery-v1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW"
```

---

## Task 5: LLM discovery caller (`promise-discovery.ts`)

**Files:**
- Create: `src/llm/promise-discovery.ts`
- Test: `tests/promise-discovery-caller.test.ts`

**Interfaces:**
- Consumes: `callLLM`, `type CallLlmOptions` from `src/llm/client.ts`; the Task-4 schema + prompt exports; `type ZodTypeAny, z` from `zod`.
- Produces: `type LlmCaller`, `discoverPromises(input, caller?): Promise<PromiseDiscoveryBatch | null>`.

- [ ] **Step 1: Write the failing test**

Create `tests/promise-discovery-caller.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { discoverPromises } from '../src/llm/promise-discovery'
import { PROMISE_DISCOVERY_PROMPT_VERSION } from '../src/llm/prompts'

describe('discoverPromises', () => {
  it('passes the discovery prompt version + schema and returns the parsed batch', async () => {
    const seen: { promptVersion?: string } = {}
    const stub = async (opts: { promptVersion: string; schema: { parse: (x: unknown) => unknown } }) => {
      seen.promptVersion = opts.promptVersion
      return { promises: [] }
    }
    const out = await discoverPromises(
      { existingTitles: [], sources: [{ kind: 'press', items: [] }] },
      stub as never,
    )
    expect(seen.promptVersion).toBe(PROMISE_DISCOVERY_PROMPT_VERSION)
    expect(out).toEqual({ promises: [] })
  })

  it('propagates a null (backend failure) result', async () => {
    const out = await discoverPromises({ existingTitles: [], sources: [] }, (async () => null) as never)
    expect(out).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/promise-discovery-caller.test.ts`
Expected: FAIL — `Cannot find module '../src/llm/promise-discovery'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/llm/promise-discovery.ts`:

```ts
/**
 * LLM caller for promise discovery. Mirrors auto-curate-llm.ts: single-shot,
 * dependency-injected caller so tests pass a stub. Returns the parsed batch
 * or null (backend failure / budget / circuit).
 */
import { callLLM } from './client'
import type { CallLlmOptions } from './client'
import {
  PROMISE_DISCOVERY_PROMPT_VERSION,
  buildPromiseDiscoverySystemPrompt,
  buildPromiseDiscoveryUserPrompt,
  type PromiseDiscoveryInput,
} from './prompts'
import { PromiseDiscoveryBatchSchema, type PromiseDiscoveryBatch } from './schemas'
import type { ZodTypeAny, z } from 'zod'

export type LlmCaller = <TSchema extends ZodTypeAny>(
  opts: CallLlmOptions<TSchema>,
) => Promise<z.infer<TSchema> | null>

export async function discoverPromises(
  input: PromiseDiscoveryInput,
  caller: LlmCaller = callLLM,
): Promise<PromiseDiscoveryBatch | null> {
  return caller({
    systemPrompt: buildPromiseDiscoverySystemPrompt(),
    userPrompt: buildPromiseDiscoveryUserPrompt(input),
    promptVersion: PROMISE_DISCOVERY_PROMPT_VERSION,
    schema: PromiseDiscoveryBatchSchema,
    input: {
      existingTitles: input.existingTitles,
      sourceCount: input.sources.reduce((n, s) => n + s.items.length, 0),
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/promise-discovery-caller.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`

```bash
git add src/llm/promise-discovery.ts tests/promise-discovery-caller.test.ts
git commit -m "feat(promesas): LLM discovery caller (discoverPromises)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW"
```

---

## Task 6: Add `autoPublished` field to the curated schema + relax the V1-live test

**Files:**
- Modify: `src/scraper/promises.ts` (add `AutoPublishedMeta` + `Promise.autoPublished` + validation)
- Modify: `tests/parse-promises.test.ts` (relax the "V1-only live data" assertion)

**Interfaces:**
- Produces: `interface AutoPublishedMeta` exported from `promises.ts`; `Promise.autoPublished?: AutoPublishedMeta | null`.

- [ ] **Step 1: Write the failing test**

Append to `tests/parse-promises.test.ts` (inside the top-level `describe`, after the existing tests):

```ts
  it('accepts an item carrying a valid autoPublished block', () => {
    const base = {
      version: '1.0',
      generatedAt: '2026-07-02',
      frozenUntil: null,
      legalNotice: 'x'.repeat(100),
      contactUrl: 'https://x.test/issues',
      methodologyUrl: '/metodologia',
    }
    const ok = {
      ...base,
      items: [
        {
          id: 'ac-psoe-carrilbici',
          party: 'PSOE',
          title: 'Carril bici en la Avenida del Camp de Túria',
          quote: 'Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027.',
          source: { url: 'https://x.test/n', publisher: 'Levante-EMV' },
          madeAt: '2026-06-20',
          topic: 'movilidad',
          kind: 'anuncio-gobierno',
          status: 'documentada',
          evidence: [],
          createdAt: '2026-07-02',
          autoPublished: { at: '2026-07-02T06:00:00.000Z', by: 'auto-curation-v1', confidence: 0.83, reviewState: 'pending-review' },
        },
      ],
    }
    const snap = validatePromisesSnapshot(JSON.stringify(ok))
    expect(snap.items[0].autoPublished?.reviewState).toBe('pending-review')
  })

  it('rejects an autoPublished block with a bad reviewState', () => {
    const base = {
      version: '1.0',
      generatedAt: '2026-07-02',
      frozenUntil: null,
      legalNotice: 'x'.repeat(100),
      contactUrl: 'https://x.test/issues',
      methodologyUrl: '/metodologia',
    }
    const bad = {
      ...base,
      items: [
        {
          id: 'ac-bad',
          party: 'PP',
          title: 'Algo',
          quote: 'Una cita verbatim con longitud suficiente para el validador.',
          source: { url: 'https://x.test/n', publisher: 'X' },
          madeAt: '2026-06-20',
          topic: 'fiscal',
          kind: 'anuncio-gobierno',
          status: 'documentada',
          evidence: [],
          createdAt: '2026-07-02',
          autoPublished: { at: '2026-07-02T06:00:00.000Z', by: 'auto-curation-v1', confidence: 0.83, reviewState: 'live' },
        },
      ],
    }
    expect(() => validatePromisesSnapshot(JSON.stringify(bad))).toThrow(/reviewState/)
  })
```

Then **relax** the existing "statuses are constrained to the conservative V1 set only" test (lines 41-58). Replace its body so it no longer forbids non-V1 live statuses, but keeps the enum-widening guard:

```ts
  it('any published status is a known enum value (V1 gate now governed by the evidence invariant below)', () => {
    for (const p of snap.items) {
      expect(ALLOWED_STATUSES).toContain(p.status)
    }
    // Guard the enum itself from accidental widening.
    expect(ALLOWED_STATUSES).toEqual(
      expect.arrayContaining([
        'documentada',
        'en-verificacion',
        'en-progreso',
        'cumplida',
        'parcial',
        'no-ejecutada',
        'inviable',
      ]),
    )
  })
```

(The adjacent "every status beyond the V1 safe set carries evidence" test at lines 60-74 stays unchanged — it is now the governing invariant. The negative-case test at lines 116-144 also stays.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse-promises.test.ts`
Expected: FAIL — the two new tests fail (`autoPublished` not validated / not accepted).

- [ ] **Step 3: Implement the schema change**

In `src/scraper/promises.ts`, add the `AutoPublishedMeta` interface immediately before the `Promise` interface (before line 86):

```ts
export interface AutoPublishedMeta {
  at: string // ISO
  by: 'auto-curation-v1'
  confidence: number // 0..1
  reviewState: 'pending-review' | 'reviewed' | 'retracted'
  reviewedAt?: string
}
```

Add the field to the `Promise` interface — inside the interface body, after the `dueBy?: string` line (line 121, just before the closing `}`):

```ts
  autoPublished?: AutoPublishedMeta | null
```

In `validatePromise`, insert this block after the `departmentSlug` validation block (after line 225, immediately before `return {`):

```ts
  if (r.autoPublished !== undefined && r.autoPublished !== null) {
    const ap = r.autoPublished as Record<string, unknown>
    assertIsoDate(ap.at, `items[${idx}].autoPublished.at`)
    if (ap.by !== 'auto-curation-v1')
      throw new ValidationError(`items[${idx}].autoPublished.by must be 'auto-curation-v1'`)
    if (typeof ap.confidence !== 'number' || ap.confidence < 0 || ap.confidence > 1)
      throw new ValidationError(`items[${idx}].autoPublished.confidence must be 0..1`)
    assertEnum(
      ap.reviewState,
      ['pending-review', 'reviewed', 'retracted'] as const,
      `items[${idx}].autoPublished.reviewState`,
    )
    if (ap.reviewedAt !== undefined && ap.reviewedAt !== null)
      assertIsoDate(ap.reviewedAt, `items[${idx}].autoPublished.reviewedAt`)
  }
```

Add `autoPublished` to the returned object — inside the `return { ... }` (after the `response:` line, line 245):

```ts
    autoPublished: (r.autoPublished as Promise['autoPublished']) ?? null,
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run tests/parse-promises.test.ts`
Expected: PASS (including the two new tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/promises.ts tests/parse-promises.test.ts
git commit -m "feat(promesas): autoPublished field on curated schema; relax V1-only-live policy to evidence-gated

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW"
```

---

## Task 7: Pure apply helpers (`promise-apply.ts`)

**Files:**
- Create: `src/scraper/promise-apply.ts`
- Test: `tests/parse-promise-apply.test.ts`

**Interfaces:**
- Consumes: `type PromisesSnapshot`, `type Promise` from `src/scraper/promises.ts`; `type DraftNewPromise` from `src/scraper/promise-draft.ts`.
- Produces: `interface AutoPublishMeta`, `ensureUniqueId(id, existing): string`, `newPromiseFromDraft(draft, now, autoPublish?): Promise`, `insertPromise(snap, promise): PromisesSnapshot`, `removeAutoPublished(snap, promiseId): PromisesSnapshot`, `setReviewState(snap, promiseId, state, now): PromisesSnapshot`.

- [ ] **Step 1: Write the failing test**

Create `tests/parse-promise-apply.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  newPromiseFromDraft,
  insertPromise,
  ensureUniqueId,
  removeAutoPublished,
  setReviewState,
} from '../src/scraper/promise-apply'
import { validatePromisesSnapshot, type PromisesSnapshot } from '../src/scraper/promises'
import type { DraftNewPromise } from '../src/scraper/promise-draft'

const NOW = '2026-07-02T06:00:00.000Z'

function baseSnap(): PromisesSnapshot {
  return {
    version: '1.0',
    generatedAt: NOW,
    frozenUntil: null,
    legalNotice: 'x'.repeat(100),
    contactUrl: 'https://x.test/issues',
    methodologyUrl: '/metodologia',
    items: [],
  }
}

function draft(): DraftNewPromise {
  return {
    draftId: 'dnp-psoe-abc123',
    kind: 'new-promise',
    requiresHumanApproval: true,
    confidence: 0.83,
    grounding: { grounded: true, urlResolved: true, quoteFound: true, checkedAt: NOW },
    decision: 'auto-publish',
    proposed: {
      party: 'PSOE',
      title: 'Carril bici en la Avenida del Camp de Túria',
      quote: 'Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027.',
      source: { url: 'https://x.test/n', publisher: 'Levante-EMV' },
      madeAt: '2026-06-20',
      topic: 'movilidad',
      kind: 'anuncio-gobierno',
      status: 'documentada',
    },
    reasoning: [],
    generatedAt: NOW,
  }
}

describe('promise-apply', () => {
  it('newPromiseFromDraft stamps autoPublished when auto', () => {
    const p = newPromiseFromDraft(draft(), NOW, { confidence: 0.83, at: NOW })
    expect(p.status).toBe('documentada')
    expect(p.autoPublished?.by).toBe('auto-curation-v1')
    expect(p.autoPublished?.reviewState).toBe('pending-review')
    expect(p.id.startsWith('ac-')).toBe(true)
  })

  it('newPromiseFromDraft omits autoPublished when human-approved', () => {
    const p = newPromiseFromDraft(draft(), NOW)
    expect(p.autoPublished == null).toBe(true)
  })

  it('ensureUniqueId disambiguates collisions', () => {
    const s = new Set(['ac-x', 'ac-x-2'])
    expect(ensureUniqueId('ac-x', s)).toBe('ac-x-3')
    expect(ensureUniqueId('ac-y', s)).toBe('ac-y')
  })

  it('insertPromise produces a snapshot that re-validates', () => {
    const p = newPromiseFromDraft(draft(), NOW, { confidence: 0.83, at: NOW })
    const next = insertPromise(baseSnap(), p)
    expect(next.items).toHaveLength(1)
    // whole-snapshot re-validation must pass
    validatePromisesSnapshot(JSON.stringify(next))
  })

  it('setReviewState + removeAutoPublished operate by id', () => {
    const p = newPromiseFromDraft(draft(), NOW, { confidence: 0.83, at: NOW })
    const snap = insertPromise(baseSnap(), p)
    const id = snap.items[0].id
    const reviewed = setReviewState(snap, id, 'reviewed', NOW)
    expect(reviewed.items[0].autoPublished?.reviewState).toBe('reviewed')
    expect(reviewed.items[0].autoPublished?.reviewedAt).toBe(NOW)
    const retracted = removeAutoPublished(snap, id)
    expect(retracted.items).toHaveLength(0)
  })

  it('removeAutoPublished refuses to remove a non-auto-published promise', () => {
    const snap = baseSnap()
    snap.items.push({
      id: 'human-1',
      party: 'PP',
      title: 'Promesa humana',
      quote: 'Una cita verbatim con longitud suficiente para el validador.',
      source: { url: 'https://x.test/h', publisher: 'X' },
      madeAt: '2026-01-01',
      topic: 'fiscal',
      kind: 'programa-electoral',
      status: 'documentada',
      evidence: [],
      createdAt: '2026-01-01',
    })
    expect(() => removeAutoPublished(snap, 'human-1')).toThrow(/not auto-published/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parse-promise-apply.test.ts`
Expected: FAIL — `Cannot find module '../src/scraper/promise-apply'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/scraper/promise-apply.ts`:

```ts
/**
 * Pure snapshot mutations for the apply path. The CLIs read+validate
 * promises.json, call these, then re-validate + write. No I/O here so the
 * round-trip (including validatePromisesSnapshot) is unit-tested.
 */
import type { PromisesSnapshot, Promise } from './promises'
import type { DraftNewPromise } from './promise-draft'

export interface AutoPublishMeta {
  confidence: number
  at: string // ISO
}

export function ensureUniqueId(id: string, existing: Set<string>): string {
  if (!existing.has(id)) return id
  let i = 2
  while (existing.has(`${id}-${i}`)) i++
  return `${id}-${i}`
}

export function newPromiseFromDraft(
  draft: DraftNewPromise,
  now: string,
  autoPublish?: AutoPublishMeta,
): Promise {
  const p: Promise = {
    id: draft.draftId.replace(/^dnp-/, 'ac-'),
    party: draft.proposed.party,
    title: draft.proposed.title,
    quote: draft.proposed.quote,
    source: { url: draft.proposed.source.url, publisher: draft.proposed.source.publisher },
    madeAt: draft.proposed.madeAt,
    topic: draft.proposed.topic,
    kind: draft.proposed.kind,
    status: 'documentada',
    evidence: [],
    createdAt: now.slice(0, 10),
    autoPublished: autoPublish
      ? { at: autoPublish.at, by: 'auto-curation-v1', confidence: autoPublish.confidence, reviewState: 'pending-review' }
      : null,
  }
  return p
}

export function insertPromise(snap: PromisesSnapshot, promise: Promise): PromisesSnapshot {
  const ids = new Set(snap.items.map((p) => p.id))
  const withId: Promise = { ...promise, id: ensureUniqueId(promise.id, ids) }
  return { ...snap, items: [...snap.items, withId] }
}

export function setReviewState(
  snap: PromisesSnapshot,
  promiseId: string,
  state: 'pending-review' | 'reviewed' | 'retracted',
  now: string,
): PromisesSnapshot {
  return {
    ...snap,
    items: snap.items.map((p) => {
      if (p.id !== promiseId || !p.autoPublished) return p
      return { ...p, autoPublished: { ...p.autoPublished, reviewState: state, reviewedAt: now }, updatedAt: now.slice(0, 10) }
    }),
  }
}

export function removeAutoPublished(snap: PromisesSnapshot, promiseId: string): PromisesSnapshot {
  const target = snap.items.find((p) => p.id === promiseId)
  if (!target) throw new Error(`promise "${promiseId}" not found`)
  if (!target.autoPublished) throw new Error(`promise "${promiseId}" is not auto-published — refusing to retract a human-curated promise`)
  return { ...snap, items: snap.items.filter((p) => p.id !== promiseId) }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run tests/parse-promise-apply.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/scraper/promise-apply.ts tests/parse-promise-apply.test.ts
git commit -m "feat(promesas): pure apply helpers (promise-apply)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW"
```

---

## Task 8: Apply CLI (`scripts/apply-promise-draft.ts`)

**Files:**
- Create: `scripts/apply-promise-draft.ts`
- Modify: `package.json` (add `apply-promise-draft` script)

**Interfaces:**
- Consumes: everything from Tasks 1, 6, 7. Reads/writes `public/data/promises.json` + `editorial/promise-review-queue.json` + `editorial/promise-review-archive.json`.
- Produces: CLI `npm run apply-promise-draft -- <apply|--reject|--retract|--mark-reviewed> <id> [reason]`.

- [ ] **Step 1: Add the npm script**

In `package.json` `"scripts"`, after the `"reply"` line, add:

```json
    "apply-promise-draft": "npx tsx scripts/apply-promise-draft.ts",
```

- [ ] **Step 2: Write the CLI**

Create `scripts/apply-promise-draft.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Apply / reject / retract / mark-reviewed a promise auto-curator draft.
 * The ONLY curator-facing writer of promises.json besides reply/freeze.
 *
 * read → validatePromisesSnapshot → mutate (pure helpers) → re-validate → write.
 * Refuses during LOREG freeze. Removes applied/rejected drafts from the queue.
 *
 * Usage:
 *   npm run apply-promise-draft -- <draftId>                  # approve → publish (no autoPublished stamp; human-approved)
 *   npm run apply-promise-draft -- --reject <draftId> [reason]
 *   npm run apply-promise-draft -- --retract <promiseId>      # remove an auto-published promise
 *   npm run apply-promise-draft -- --mark-reviewed <promiseId>
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePromisesSnapshot, isFrozen } from '../src/scraper/promises'
import {
  validateReviewQueue,
  emptyQueue,
  removeDraftFromQueue,
  type PromiseReviewQueue,
} from '../src/scraper/promise-draft'
import { newPromiseFromDraft, insertPromise, removeAutoPublished, setReviewState } from '../src/scraper/promise-apply'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PROMISES = join(ROOT, 'public/data/promises.json')
const QUEUE = join(ROOT, 'editorial/promise-review-queue.json')
const ARCHIVE = join(ROOT, 'editorial/promise-review-archive.json')

function usage(): never {
  console.error(`Usage:
  npm run apply-promise-draft -- <draftId>                  approve → publish
  npm run apply-promise-draft -- --reject <draftId> [reason]
  npm run apply-promise-draft -- --retract <promiseId>
  npm run apply-promise-draft -- --mark-reviewed <promiseId>`)
  process.exit(2)
}

async function loadQueue(path: string): Promise<PromiseReviewQueue> {
  if (!existsSync(path)) return emptyQueue(new Date().toISOString())
  return validateReviewQueue(await readFile(path, 'utf8'))
}

async function writeQueue(path: string, q: PromiseReviewQueue): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify({ ...q, generatedAt: new Date().toISOString() }, null, 2) + '\n')
}

async function readSnap() {
  const raw = await readFile(PROMISES, 'utf8')
  const snap = validatePromisesSnapshot(raw) // never write on top of a broken snapshot
  if (isFrozen(snap)) {
    console.error('[apply-promise-draft] LOREG freeze active — refusing to mutate promises.json')
    process.exit(0)
  }
  return snap
}

async function writeSnap(snap: unknown) {
  const serialized = JSON.stringify({ ...(snap as object), generatedAt: new Date().toISOString() }, null, 2) + '\n'
  validatePromisesSnapshot(serialized) // defence-in-depth
  await writeFile(PROMISES, serialized)
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0) usage()
  const now = new Date().toISOString()

  if (argv[0] === '--reject') {
    const draftId = argv[1]
    if (!draftId) usage()
    const queue = await loadQueue(QUEUE)
    const draft = queue.drafts.find((d) => d.draftId === draftId)
    if (!draft) {
      console.error(`[apply-promise-draft] draft "${draftId}" not in queue`)
      process.exit(1)
    }
    const archive = await loadQueue(ARCHIVE)
    await writeQueue(ARCHIVE, { ...archive, drafts: [...archive.drafts, draft] })
    await writeQueue(QUEUE, removeDraftFromQueue(queue, draftId))
    console.log(`[apply-promise-draft] rejected "${draftId}" → archive${argv[2] ? ` (${argv[2]})` : ''}`)
    return
  }

  if (argv[0] === '--retract') {
    const promiseId = argv[1]
    if (!promiseId) usage()
    const snap = await readSnap()
    await writeSnap(removeAutoPublished(snap, promiseId))
    console.log(`[apply-promise-draft] retracted auto-published promise "${promiseId}"`)
    return
  }

  if (argv[0] === '--mark-reviewed') {
    const promiseId = argv[1]
    if (!promiseId) usage()
    const snap = await readSnap()
    await writeSnap(setReviewState(snap, promiseId, 'reviewed', now))
    console.log(`[apply-promise-draft] marked "${promiseId}" reviewed`)
    return
  }

  // Default: approve a draft → publish it (human-approved, no autoPublished stamp)
  const draftId = argv[0]
  const queue = await loadQueue(QUEUE)
  const draft = queue.drafts.find((d) => d.draftId === draftId)
  if (!draft) {
    console.error(`[apply-promise-draft] draft "${draftId}" not in queue`)
    process.exit(1)
  }
  const snap = await readSnap()
  const promise = newPromiseFromDraft(draft, now) // no autoPublish meta → human-approved
  await writeSnap(insertPromise(snap, promise))
  await writeQueue(QUEUE, removeDraftFromQueue(queue, draftId))
  console.log(`[apply-promise-draft] published "${draftId}" as promise (human-approved)`)
}

main().catch((err) => {
  console.error('[apply-promise-draft] failed:', err)
  process.exit(1)
})
```

- [ ] **Step 3: Manual verification (round-trip on a temp draft)**

Create a throwaway queue with one draft and dry-run the apply against a **copy** of promises.json so you don't dirty the real file:

```bash
mkdir -p editorial
cat > editorial/promise-review-queue.json <<'JSON'
{"version":"1.0","generatedAt":"2026-07-02T00:00:00.000Z","drafts":[{"draftId":"dnp-psoe-testmanual","kind":"new-promise","requiresHumanApproval":true,"confidence":0.9,"grounding":{"grounded":true,"urlResolved":true,"quoteFound":true,"checkedAt":"2026-07-02T00:00:00.000Z"},"decision":"queue","proposed":{"party":"PSOE","title":"Promesa de prueba manual del carril bici","quote":"Construiremos un carril bici de prueba manual antes de 2027 en la localidad.","source":{"url":"https://example.com/manual","publisher":"Test"},"madeAt":"2026-06-20","topic":"movilidad","kind":"anuncio-gobierno","status":"documentada"},"reasoning":[],"generatedAt":"2026-07-02T00:00:00.000Z"}]}
JSON
cp public/data/promises.json /tmp/promises.backup.json
npm run apply-promise-draft -- dnp-psoe-testmanual
```

Expected stdout: `published "dnp-psoe-testmanual" as promise (human-approved)`. Then verify + restore:

```bash
node -e "const p=require('./public/data/promises.json'); console.log('has test promise:', p.items.some(x=>x.id==='ac-psoe-testmanual'))"
# → has test promise: true
git checkout public/data/promises.json          # restore the real file
rm -f editorial/promise-review-queue.json editorial/promise-review-archive.json
```

Expected: prints `true`, then the working tree is clean of the test mutation.

- [ ] **Step 4: Commit**

```bash
git add scripts/apply-promise-draft.ts package.json
git commit -m "feat(promesas): apply-promise-draft CLI (approve/reject/retract/mark-reviewed)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW"
```

---

## Task 9: Orchestrator CLI (`scripts/auto-curate-promises.ts`)

**Files:**
- Create: `scripts/auto-curate-promises.ts`
- Modify: `package.json` (add `auto-curate-promises` script)

**Interfaces:**
- Consumes: Tasks 1-7 modules + `resetBudget`, `loadConfigFromEnv` from `src/llm/client.ts`. Reads `public/data/{promises,press,plenos-agendas}.json`; writes `editorial/promise-review-queue.json`, `public/data/promises.json` (auto-publish), and a digest to `scripts/logs/`.
- Produces: CLI `npm run auto-curate-promises -- [--max N] [--min-confidence F] [--phase discovery] [--dry-run] [--no-auto-publish]`.

- [ ] **Step 1: Add the npm script**

In `package.json` `"scripts"`, after the `"auto-curate-press"` line, add:

```json
    "auto-curate-promises": "npx tsx scripts/auto-curate-promises.ts",
```

- [ ] **Step 2: Write the orchestrator**

Create `scripts/auto-curate-promises.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Promise auto-curator — daily orchestrator (Plan A / Phase 1: discovery).
 *
 * LLM discovery over fresh press + pleno agendas → deterministic grounding →
 * decision tiering → writes new-promise drafts to editorial/promise-review-
 * queue.json (local-only) and auto-publishes the grounded, high-confidence
 * documentada drafts into promises.json.
 *
 * LOREG freeze fail-closed: missing promises.json → exit 1; frozen → exit 0.
 *
 * Usage:
 *   npm run auto-curate-promises -- [--max 10] [--min-confidence 0.7] \
 *       [--phase discovery] [--dry-run] [--no-auto-publish]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { validatePromisesSnapshot, isFrozen, type PromisesSnapshot } from '../src/scraper/promises'
import {
  makeDraftId,
  validateReviewQueue,
  emptyQueue,
  type DraftNewPromise,
  type PromiseReviewQueue,
} from '../src/scraper/promise-draft'
import { groundDraft } from '../src/scraper/promise-grounding'
import { selectPromiseDrafts } from '../src/scraper/promise-auto-curate'
import { newPromiseFromDraft, insertPromise } from '../src/scraper/promise-apply'
import { discoverPromises } from '../src/llm/promise-discovery'
import type { PromiseDiscoveryInput } from '../src/llm/prompts'
import { resetBudget, loadConfigFromEnv } from '../src/llm/client'

const PROMISES = resolve('public/data/promises.json')
const PRESS = resolve('public/data/press.json')
const AGENDAS = resolve('public/data/plenos-agendas.json')
const QUEUE = resolve('editorial/promise-review-queue.json')
const ARCHIVE = resolve('editorial/promise-review-archive.json')
const LOGDIR = resolve('scripts/logs')

interface CliArgs {
  max: number
  minConfidence: number
  phase: 'discovery'
  dryRun: boolean
  noAutoPublish: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { max: 10, minConfidence: 0.7, phase: 'discovery', dryRun: false, noAutoPublish: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--max') out.max = Number(argv[++i])
    else if (a === '--min-confidence') out.minConfidence = Number(argv[++i])
    else if (a === '--phase') {
      const p = argv[++i]
      if (p !== 'discovery') {
        process.stderr.write(`[auto-curate-promises] --phase ${p} not supported in Plan A (discovery only)\n`)
        process.exit(2)
      }
    } else if (a === '--dry-run') out.dryRun = true
    else if (a === '--no-auto-publish') out.noAutoPublish = true
    else {
      process.stderr.write(`[auto-curate-promises] unknown flag ${a}\n`)
      process.exit(2)
    }
  }
  if (!Number.isFinite(out.max) || out.max < 1 || out.max > 50) {
    process.stderr.write('--max must be 1..50\n')
    process.exit(2)
  }
  if (!Number.isFinite(out.minConfidence) || out.minConfidence < 0 || out.minConfidence > 1) {
    process.stderr.write('--min-confidence must be 0..1\n')
    process.exit(2)
  }
  return out
}

function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

function loadQueue(path: string): PromiseReviewQueue {
  if (!existsSync(path)) return emptyQueue(new Date().toISOString())
  return validateReviewQueue(readFileSync(path, 'utf8'))
}

function buildDiscoveryInput(
  snap: PromisesSnapshot,
  press: { items?: Array<{ title: string; link: string; date: string; source?: string }> } | null,
  agendas: { items?: Array<{ title: string; url?: string; date?: string }> } | null,
): PromiseDiscoveryInput {
  const existingTitles = snap.items.map((p) => p.title)
  const pressItems = (press?.items ?? []).slice(0, 60).map((n) => ({
    title: n.title,
    url: n.link,
    date: (n.date || '').slice(0, 10),
    publisher: n.source,
  }))
  const agendaItems = (agendas?.items ?? [])
    .filter((a) => a.url && a.date)
    .slice(0, 60)
    .map((a) => ({ title: a.title, url: a.url as string, date: (a.date as string).slice(0, 10), publisher: 'Ayuntamiento Riba-roja' }))
  return {
    existingTitles,
    sources: [
      { kind: 'press', items: pressItems },
      { kind: 'pleno_agenda', items: agendaItems },
    ],
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  resetBudget()
  const config = loadConfigFromEnv()
  process.stdout.write(
    `[auto-curate-promises] backend=${config.backend} · max=${opts.max} · min-conf=${opts.minConfidence} · dry-run=${opts.dryRun} · no-auto-publish=${opts.noAutoPublish}\n`,
  )

  // Fail CLOSED: unknowable freeze state must not publish.
  const rawPromises = existsSync(PROMISES) ? readFileSync(PROMISES, 'utf8') : null
  if (!rawPromises) {
    process.stderr.write(`[auto-curate-promises] ${PROMISES} missing — cannot determine LOREG freeze, refusing\n`)
    process.exit(1)
  }
  const snap = validatePromisesSnapshot(rawPromises)
  if (isFrozen(snap)) {
    process.stderr.write(`[auto-curate-promises] LOREG freeze active until ${snap.frozenUntil} — exiting\n`)
    process.exit(0)
  }

  const press = loadJson<{ items?: Array<{ title: string; link: string; date: string; source?: string }> }>(PRESS)
  const agendas = loadJson<{ items?: Array<{ title: string; url?: string; date?: string }> }>(AGENDAS)

  const input = buildDiscoveryInput(snap, press, agendas)
  const batch = await discoverPromises(input)
  if (!batch) {
    process.stderr.write('[auto-curate-promises] LLM returned null (backend/budget) — nothing to do\n')
    return
  }
  process.stdout.write(`[auto-curate-promises] LLM proposed ${batch.promises.length} candidate(s)\n`)

  // Project LLM items → drafts, then ground each.
  const now = new Date()
  const nowIso = now.toISOString()
  const candidates: DraftNewPromise[] = []
  for (const it of batch.promises) {
    const draftId = makeDraftId(it.party, it.title, it.sourceUrl)
    const draft: DraftNewPromise = {
      draftId,
      kind: 'new-promise',
      requiresHumanApproval: true,
      confidence: it.confidence,
      grounding: { grounded: false, urlResolved: false, quoteFound: false, checkedAt: nowIso },
      decision: 'queue',
      proposed: {
        party: it.party,
        title: it.title,
        quote: it.quote,
        source: { url: it.sourceUrl, publisher: it.publisher },
        madeAt: it.madeAt,
        topic: it.topic,
        kind: it.kind,
        status: 'documentada',
      },
      reasoning: [{ url: it.sourceUrl, date: it.madeAt, quote: it.reasoning, publisher: it.publisher, matchedKeywords: [] }],
      generatedAt: nowIso,
    }
    draft.grounding = await groundDraft(draft, undefined, now)
    candidates.push(draft)
  }

  const existingQueue = loadQueue(QUEUE)
  const archive = loadQueue(ARCHIVE)
  const seen = new Set<string>([...existingQueue.drafts, ...archive.drafts].map((d) => d.draftId))

  const sel = selectPromiseDrafts({
    candidates,
    existingPromises: snap.items,
    seenDraftIds: seen,
    frozen: false,
    minConfidence: opts.minConfidence,
    max: opts.max,
  })

  // With --no-auto-publish, force everything to the queue for review.
  const autoPublish = opts.noAutoPublish ? [] : sel.autoPublish
  const toQueue = opts.noAutoPublish
    ? [...sel.queue, ...sel.autoPublish.map((d) => ({ ...d, decision: 'queue' as const }))]
    : sel.queue

  process.stdout.write(
    `[auto-curate-promises] auto-publish=${autoPublish.length} · queue=${toQueue.length} · skipped=${sel.skipped.length}\n`,
  )

  if (opts.dryRun) {
    const preview = `/tmp/auto-curate-promises-preview-${now.getTime()}.json`
    writeFileSync(preview, JSON.stringify({ autoPublish, toQueue, skipped: sel.skipped }, null, 2) + '\n')
    process.stdout.write(`[auto-curate-promises] DRY RUN — wrote preview to ${preview} (no persistence)\n`)
    return
  }

  // Persist queue (merge new queue/fast-track drafts onto the existing queue).
  mkdirSync(resolve('editorial'), { recursive: true })
  const mergedQueue: PromiseReviewQueue = {
    version: existingQueue.version,
    generatedAt: nowIso,
    drafts: [...existingQueue.drafts, ...toQueue],
  }
  writeFileSync(QUEUE, JSON.stringify(mergedQueue, null, 2) + '\n')

  // Apply auto-publish drafts to promises.json (single validated write).
  if (autoPublish.length > 0) {
    let next: PromisesSnapshot = snap
    for (const d of autoPublish) {
      next = insertPromise(next, newPromiseFromDraft(d, nowIso, { confidence: d.confidence, at: nowIso }))
    }
    const serialized = JSON.stringify({ ...next, generatedAt: nowIso }, null, 2) + '\n'
    validatePromisesSnapshot(serialized) // defence-in-depth
    writeFileSync(PROMISES, serialized)
    process.stdout.write(`[auto-curate-promises] ✅ auto-published ${autoPublish.length} promise(s) to promises.json\n`)
  }

  // Digest.
  mkdirSync(LOGDIR, { recursive: true })
  const digest = [
    `# Promise auto-curator digest — ${nowIso}`,
    ``,
    `- auto-published: ${autoPublish.length}`,
    ...autoPublish.map((d) => `  - ${d.proposed.party} · ${d.proposed.title} (conf ${d.confidence.toFixed(2)})`),
    `- queued for review: ${toQueue.length}`,
    ...toQueue.map((d) => `  - [${d.decision}] ${d.proposed.party} · ${d.proposed.title} (conf ${d.confidence.toFixed(2)}, grounded=${d.grounding.grounded})`),
    `- skipped: ${sel.skipped.length}`,
    ...sel.skipped.map((s) => `  - ${s.draftId}: ${s.reason}`),
    ``,
  ].join('\n')
  writeFileSync(resolve(LOGDIR, `auto-curate-promises-${nowIso.slice(0, 10)}.md`), digest)
  process.stdout.write(`[auto-curate-promises] digest → scripts/logs/auto-curate-promises-${nowIso.slice(0, 10)}.md\n`)
}

main().catch((err) => {
  process.stderr.write(`[auto-curate-promises] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
```

- [ ] **Step 3: Manual verification (dry-run, no writes)**

Requires a working LLM backend. With Gemini configured (`GEMINI_BIN`/OAuth) or `LLM_BACKEND=claude-code`:

```bash
LLM_BACKEND=gemini npm run auto-curate-promises -- --dry-run --max 5
```

Expected: prints `backend=gemini … LLM proposed N candidate(s) … auto-publish=… queue=… skipped=…` then `DRY RUN — wrote preview to /tmp/auto-curate-promises-preview-*.json`. Inspect the preview:

```bash
ls -t /tmp/auto-curate-promises-preview-*.json | head -1 | xargs cat | head -40
```

Confirm `promises.json` and `editorial/` are untouched:

```bash
git status --short public/data/promises.json   # → no output (unchanged)
```

Expected: no output (dry-run persisted nothing).

- [ ] **Step 4: Full suite + typecheck + lint**

Run: `npm test`
Expected: all vitest suites pass (including the 6 new promise test files).

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-curate-promises.ts package.json
git commit -m "feat(promesas): auto-curate-promises orchestrator CLI (discovery + grounding + auto-publish)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW"
```

---

## Done criteria (Plan A)

- `npm test` green (6 new test files: promise-draft, promise-grounding, promise-auto-curate, promise-discovery-schema, promise-discovery-caller, promise-apply + the 2 new promises.test cases).
- `npm run typecheck` + `npm run lint` clean.
- `npm run auto-curate-promises -- --dry-run` produces a sane preview from real snapshots.
- `npm run apply-promise-draft -- <id>` round-trips a queue draft into a re-validated `promises.json`.
- No unreviewed draft is ever committed (queue lives in gitignored `editorial/`).

## What Plan A intentionally leaves to Plan B

- The `/curator` dashboard section (approve/edit/reject/retract UI) + `GET /api/curator/promise-queue` middleware endpoint + generalized commit allowlist.
- The public `PromiseCard` "publicada automáticamente · revisión pendiente" badge in `src/pages/Promesas.jsx`.
- The daily launchd agent (`com.civicpulse.auto-curate-promises.plist` + `auto-curate-promises-daily.sh` + installer).
- `/metodologia` + `/aviso-legal` disclosure copy.
- Phase 2 status-change miner (its own spec).

Until Plan B lands, the engine is usable headlessly: run `auto-curate-promises` (optionally `--no-auto-publish` for the first runs), review `editorial/promise-review-queue.json` by hand, and apply with `apply-promise-draft`.
```
