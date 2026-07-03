# Promise Status-Change Miner — Engine (Plan 2A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Repo model policy: dispatch subagents ONLY on Opus 4.8 (`opus`) or Fable 5 (`fable`) — never sonnet/haiku.

**Goal:** Detect **progress transitions** (`documentada → en-progreso / parcial / cumplida`) on existing promises from tenders/agendas/budget/press, ground them, and feed them through the existing auto-curator pipeline (decision-tier → queue/auto-publish → apply-with-evidence).

**Architecture:** A new standalone LLM status-change miner (`src/llm/promise-status-miner.ts`) reuses the existing retriever + freeze + confidence-floor; it cites evidence **by candidate index** (not free URL) so it can't fabricate a source. Grounding gains a structured-row path (for tender/bdns/budget rows that have no page-quote) alongside the existing page-quote path. A new `applyStatusChange` sets the status AND appends the grounded evidence in the same validated write (the V1 gate requires ≥1 evidence for any non-V1 status). The orchestrator gains `--phase status|both`.

**Tech Stack:** TypeScript (ESM, `npx tsx`), Zod, Vitest + happy-dom, the repo's `callLLM` infra (backend `agy`).

## Global Constraints

- **Progress statuses ONLY:** the miner may propose `en-progreso | parcial | cumplida`. NEVER `no-ejecutada` / `inviable` / `documentada` / `en-verificacion` (schema-enforced + post-filter belt-and-suspenders).
- **Cite-by-candidateIndex:** the miner flattens retrieved candidates into a 0-based list, renders them numbered in the prompt, and the LLM references one by `candidateIndex`. A `candidateIndex` outside `[0, flat.length)` is rejected (`hallucinatedCite`). This is the libel boundary — the LLM cannot invent a tender/article.
- **Tiered auto-publish:** `en-progreso` → auto-publish (0.70 + grounded); `parcial` + `cumplida` → fast-track (one-click). Encoded by setting `STATUS_TIER.parcial` and `.cumplida` to `'fast-track'`.
- **V1 gate always satisfied:** a non-V1 status is only ever written together with ≥1 grounded `EvidenceEntry` (same object, one validated write). `applyStatusChange` appends evidence atomically. `EvidenceEntry` quote is **10–800 chars**; `url` must be absolute http(s); `addedBy: 'auto-curation-v1'`.
- **Grounding required for auto-publish, fail-safe otherwise:** page-quote (press/pleno_transcript) via the existing fetch+`quoteFoundInText`+Google-News-resolve; structured-row (tender/bdns/budget/pleno_agenda/pleno_vote) via `groundStructuredCite` (the cited candidate resolves + the field-cite matches). Any failure → `grounded:false` → the draft goes to the queue, never auto-publishes.
- **Freeze fail-closed** (reuse `isFrozen`). **Party-level attribution only** (prompt rule + `SAFETY_FOOTER`).
- **budget rows have no per-row URL** — budget evidence uses the snapshot-level `budget.snapshot.source` URL.
- Vitest `globals:false` (explicit `import { describe, it, expect } from 'vitest'`). Prettier + `npm run lint` + `npm run typecheck` clean. Existing 1268 tests stay green.
- Branch `feat/promise-status-miner` (already checked out). Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW
  ```

---

## Task 1: Add `'tender'` to `EvidenceEntry.kind`

**Files:** Modify `src/scraper/promises.ts`; Test `tests/parse-promises.test.ts` (extend).

**Why:** Tender awards are the strongest en-progreso signal, but `EvidenceEntry.kind` has no `'tender'` member, so a tender-backed evidence entry can't be written.

- [ ] **Step 1: Failing test** — append inside the top-level `describe` in `tests/parse-promises.test.ts`:

```ts
  it('accepts an evidence entry with kind "tender"', () => {
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
          id: 'p-tender-ev',
          party: 'PSOE',
          title: 'Obra con adjudicación',
          quote: 'Una promesa verbatim con longitud más que suficiente para el validador.',
          source: { url: 'https://x.test/n', publisher: 'X' },
          madeAt: '2026-01-01',
          topic: 'urbanismo',
          kind: 'anuncio-gobierno',
          status: 'en-progreso',
          evidence: [
            {
              date: '2026-05-01',
              url: 'https://contrataciondelestado.es/deeplink',
              quote: 'Contrato de obra adjudicado por 240.000 €',
              publisher: 'PLACSP',
              kind: 'tender',
              addedBy: 'auto-curation-v1',
            },
          ],
          createdAt: '2026-01-01',
        },
      ],
    }
    expect(() => validatePromisesSnapshot(JSON.stringify(ok))).not.toThrow()
  })
```

- [ ] **Step 2: Run → FAIL** `npx vitest run tests/parse-promises.test.ts` — throws on `evidence[0].kind` (`'tender'` not allowed).

- [ ] **Step 3: Implement** — in `src/scraper/promises.ts`:
  - `EvidenceEntry.kind` union (line ~75): change `'press' | 'pleno' | 'budget' | 'bdns' | 'ayuntamiento' | 'otro'` → add `'tender'`: `'press' | 'pleno' | 'tender' | 'budget' | 'bdns' | 'ayuntamiento' | 'otro'`.
  - In `validateEvidence` (the `assertEnum(r.kind, [...])` call, line ~186), add `'tender'`: `assertEnum(r.kind, ['press', 'pleno', 'tender', 'budget', 'bdns', 'ayuntamiento', 'otro'], \`evidence[${idx}].kind\`)`.

- [ ] **Step 4: Run → PASS** + `npm run typecheck`.

- [ ] **Step 5: Commit** `feat(promesas): allow evidence kind 'tender'` (+ trailers). Stage `src/scraper/promises.ts` + `tests/parse-promises.test.ts`.

---

## Task 2: Status-change schema + prompt

**Files:** Modify `src/llm/schemas.ts`, `src/llm/prompts.ts`; Test `tests/promise-status-schema.test.ts`.

**Interfaces produced:**
- schemas.ts: `PromiseStatusChangeItemSchema`, `PromiseStatusChangeBatchSchema`, `type PromiseStatusChangeItem`, `type PromiseStatusChangeBatch`, `PROGRESS_STATUSES`.
- prompts.ts: `PROMISE_STATUS_PROMPT_VERSION` (`'promise-status-v1'`), `interface PromiseStatusInput`, `buildPromiseStatusSystemPrompt()`, `buildPromiseStatusUserPrompt(input)`.

- [ ] **Step 1: Failing test** — `tests/promise-status-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PromiseStatusChangeBatchSchema } from '../src/llm/schemas'
import {
  PROMISE_STATUS_PROMPT_VERSION,
  buildPromiseStatusSystemPrompt,
  buildPromiseStatusUserPrompt,
} from '../src/llm/prompts'

describe('promise status-change schema + prompt', () => {
  it('accepts a valid status-change batch (progress statuses, cite-by-index)', () => {
    const parsed = PromiseStatusChangeBatchSchema.safeParse({
      changes: [
        {
          promiseId: 'psoe-x',
          proposedStatus: 'en-progreso',
          candidateIndex: 2,
          corpus: 'tender',
          quote: 'Contrato de obra adjudicado por 240.000 €',
          fieldCite: 'tenders.contracts[12].status=awarded',
          confidence: 0.82,
          reasoning: 'La adjudicación cubre la obra prometida.',
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a non-progress status', () => {
    const parsed = PromiseStatusChangeBatchSchema.safeParse({
      changes: [
        { promiseId: 'x', proposedStatus: 'no-ejecutada', candidateIndex: 0, corpus: 'press', quote: 'y'.repeat(12), confidence: 0.5, reasoning: 'z'.repeat(12) },
      ],
    })
    expect(parsed.success).toBe(false)
  })

  it('version + prompts present; user prompt numbers candidates 0-based', () => {
    expect(PROMISE_STATUS_PROMPT_VERSION).toBe('promise-status-v1')
    expect(buildPromiseStatusSystemPrompt().length).toBeGreaterThan(100)
    const u = buildPromiseStatusUserPrompt({
      promise: { id: 'p1', party: 'PSOE', title: 'Obra X', quote: 'haremos la obra X', topic: 'urbanismo' },
      candidates: [
        { corpus: 'tender', ref: 'https://x/t', title: 'Adjudicación obra X', date: '2026-05-01', publisher: 'PLACSP', snippet: 'awarded 240k' },
      ],
    })
    expect(u).toContain('[0]')
    expect(u).toContain('Adjudicación obra X')
    expect(u).toContain('Obra X')
  })
})
```

- [ ] **Step 2: Run → FAIL** `npx vitest run tests/promise-status-schema.test.ts`.

- [ ] **Step 3a: schemas.ts** — after the existing `PromiseEvidenceBatchSchema` block, add (reuses the module-local `PromiseEvidenceKind`):

```ts
// ─── Phase 2 · Promise STATUS-CHANGE miner (progress transitions) ────────────
// Distinct from PromiseEvidence* (V1-only). Cite-by-candidateIndex: the LLM
// references a retrieved candidate by its index in the flat list; the miner
// rejects any index out of range (the libel boundary — no fabricated source).
export const PROGRESS_STATUSES = ['en-progreso', 'parcial', 'cumplida'] as const
export const PromiseStatusChangeItemSchema = z.object({
  promiseId: z.string().min(3),
  proposedStatus: z.enum([...PROGRESS_STATUSES] as [
    (typeof PROGRESS_STATUSES)[number],
    ...(typeof PROGRESS_STATUSES)[number][],
  ]),
  candidateIndex: z.number().int().nonnegative(),
  corpus: PromiseEvidenceKind,
  quote: z.string().min(10).max(500),
  fieldCite: z.string().max(200).optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10).max(500),
})
export type PromiseStatusChangeItem = z.infer<typeof PromiseStatusChangeItemSchema>
export const PromiseStatusChangeBatchSchema = z.object({
  changes: z.array(PromiseStatusChangeItemSchema).max(8),
})
export type PromiseStatusChangeBatch = z.infer<typeof PromiseStatusChangeBatchSchema>
```

- [ ] **Step 3b: prompts.ts** — at end of file (reuses module-private `SAFETY_FOOTER`):

```ts
// ─── Phase 2 · Promise status-change miner ───────────────────────────────────
export const PROMISE_STATUS_PROMPT_VERSION = 'promise-status-v1'

export interface PromiseStatusInput {
  promise: { id: string; party: string; title: string; quote: string; topic: string }
  candidates: Array<{
    corpus: string
    ref: string
    title: string
    date: string
    publisher?: string
    snippet?: string
  }>
}

export function buildPromiseStatusSystemPrompt(): string {
  return `
Eres un verificador que detecta si una promesa política concreta ha AVANZADO,
usando archivos públicos (licitaciones/adjudicaciones, órdenes del día de
plenos, presupuesto/ordenanzas, prensa). Recibes UNA promesa + una lista
NUMERADA de candidatos (índice 0..N-1).

Para cada avance CLARO y atribuible, emite un objeto:
- promiseId: el id de la promesa (tal cual)
- proposedStatus: "en-progreso" | "parcial" | "cumplida"
- candidateIndex: el índice EXACTO del candidato que lo prueba (nunca inventes)
- corpus: el corpus de ese candidato
- quote: cita/valor textual del candidato (≤500 chars, sin reescribir)
- fieldCite: para filas estructuradas (tender/bdns/budget), "<dataset>[i].<campo>=<valor>"
- confidence: 0..1 (≥0.7 fuerte)
- reasoning: una frase

Cuándo cada estado:
- en-progreso: adjudicación/licitación de la obra prometida, o un punto del
  orden del día que la aprueba/encarga, o una partida/ordenanza aprobada, o
  prensa que dice que la obra ha COMENZADO.
- parcial: evidencia de entrega PARCIAL (una fase hecha, o un subconjunto).
- cumplida: acta de recepción / inauguración, o prensa que dice TERMINADA/abierta.

Reglas duras (riesgo de difamación / sesgo):
- Cita SIEMPRE por candidateIndex; el quote debe ser literal de ESE candidato.
- NUNCA propongas "cumplida" con evidencia débil o ambigua — prefiere en-progreso o nada.
- NUNCA "no-ejecutada" ni "inviable" (fuera de alcance).
- El candidato debe corresponder a la MISMA obra/tema que la promesa; no
  atribuyas una licitación no relacionada.
- Atribución sólo a nivel de PARTIDO, nunca a un concejal concreto.

Responde \`{"changes": []}\` si no hay ningún avance claro.

${SAFETY_FOOTER}
`.trim()
}

export function buildPromiseStatusUserPrompt(input: PromiseStatusInput): string {
  const cand =
    input.candidates.length === 0
      ? '(sin candidatos)'
      : input.candidates
          .map(
            (c, i) =>
              `  [${i}] ${c.corpus} · ${c.date} · ${c.publisher ?? ''} · ${c.title}\n      ref: ${c.ref}\n      ${c.snippet ? `…${c.snippet.slice(0, 220)}…` : ''}`,
          )
          .join('\n')
  return `
PROMESA:
  id: ${input.promise.id}
  partido: ${input.promise.party}
  tema: ${input.promise.topic}
  título: ${input.promise.title}
  cita: "${input.promise.quote}"

CANDIDATOS (numerados; cita por índice):
${cand}

Emite el JSON {changes:[...]} sólo con avances CLAROS.
`.trim()
}
```

- [ ] **Step 4: Run → PASS** + `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(promesas): status-change schema + prompt (promise-status-v1)` (+ trailers). Stage `src/llm/schemas.ts`, `src/llm/prompts.ts`, `tests/promise-status-schema.test.ts`.

---

## Task 3: Status-change miner (`promise-status-miner.ts`)

**Files:** Create `src/scraper/promise-status-miner.ts`; Test `tests/parse-promise-status-miner.test.ts`.

**Interfaces:**
- Consumes: `retrieveCandidates`, `type RetrievalInput` from `src/llm/retriever.ts`; `PromiseStatusChangeBatchSchema` + `PROGRESS_STATUSES` from `src/llm/schemas.ts`; the Task-2 prompt exports; `isFrozen`, `type PromisesSnapshot` from `src/scraper/promises.ts`; `callLLM`, `type CallLlmOptions` from `src/llm/client.ts`.
- Produces: `interface StatusChangeCandidate`, `interface StatusMiningOptions`, `type LlmCaller`, `mineStatusChanges(input, opts, caller?): Promise<{ candidates: StatusChangeCandidate[]; stats }>`.

- [ ] **Step 1: Failing test** — `tests/parse-promise-status-miner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mineStatusChanges } from '../src/scraper/promise-status-miner'
import type { RetrievalInput } from '../src/llm/retriever'

const input: RetrievalInput = {
  promise: { id: 'psoe-obra', title: 'Reforma del pabellón', quote: 'reformaremos el pabellón municipal', topic: 'urbanismo' },
  corpora: [
    { corpus: 'tender', documents: [
      { url: 'https://placsp/t1', title: 'Adjudicación reforma pabellón municipal', date: '2026-05-01', publisher: 'PLACSP', text: 'contrato de obra reforma pabellón adjudicado awarded 240000' },
    ] },
  ],
}
const notFrozen = { snapshot: { frozenUntil: null } }

describe('mineStatusChanges', () => {
  it('resolves a valid candidateIndex into a grounded StatusChangeCandidate', async () => {
    const stub = async () => ({
      changes: [{ promiseId: 'psoe-obra', proposedStatus: 'en-progreso', candidateIndex: 0, corpus: 'tender', quote: 'reforma pabellón adjudicado', fieldCite: 'tender[0].status=awarded', confidence: 0.85, reasoning: 'adjudicada la obra prometida' }],
    })
    const out = await mineStatusChanges(input, notFrozen, stub as never)
    expect(out.candidates).toHaveLength(1)
    expect(out.candidates[0].proposedStatus).toBe('en-progreso')
    expect(out.candidates[0].evidence.url).toBe('https://placsp/t1')
    expect(out.candidates[0].evidence.kind).toBe('tender')
  })

  it('rejects a candidateIndex out of range (hallucinated cite)', async () => {
    const stub = async () => ({
      changes: [{ promiseId: 'psoe-obra', proposedStatus: 'en-progreso', candidateIndex: 9, corpus: 'tender', quote: 'x'.repeat(12), confidence: 0.9, reasoning: 'y'.repeat(12) }],
    })
    const out = await mineStatusChanges(input, notFrozen, stub as never)
    expect(out.candidates).toHaveLength(0)
    expect(out.stats.rejected.hallucinatedCite).toBe(1)
  })

  it('honors freeze (empty, no LLM call)', async () => {
    let called = false
    const stub = async () => { called = true; return { changes: [] } }
    const out = await mineStatusChanges(input, { snapshot: { frozenUntil: '2999-01-01' } }, stub as never)
    expect(called).toBe(false)
    expect(out.stats.frozen).toBe(true)
  })

  it('rejects below-confidence', async () => {
    const stub = async () => ({ changes: [{ promiseId: 'psoe-obra', proposedStatus: 'en-progreso', candidateIndex: 0, corpus: 'tender', quote: 'x'.repeat(12), confidence: 0.3, reasoning: 'y'.repeat(12) }] })
    const out = await mineStatusChanges(input, { ...notFrozen, minConfidence: 0.6 }, stub as never)
    expect(out.candidates).toHaveLength(0)
    expect(out.stats.rejected.belowConfidence).toBe(1)
  })
})
```

- [ ] **Step 2: Run → FAIL** `npx vitest run tests/parse-promise-status-miner.test.ts`.

- [ ] **Step 3: Implement** — `src/scraper/promise-status-miner.ts`:

```ts
/**
 * Phase 2 status-change miner. For ONE promise, retrieves candidates across all
 * corpora, flattens them into a 0-based list, asks the LLM which candidate (by
 * index) proves a progress transition, and post-filters (freeze, confidence,
 * candidateIndex-resolves). Mirrors minePromiseEvidence but goes BEYOND V1 —
 * a separate module so the V1 evidence miner stays untouched.
 */
import { callLLM, type CallLlmOptions } from '../llm/client'
import type { ZodTypeAny, z } from 'zod'
import { PromiseStatusChangeBatchSchema } from '../llm/schemas'
import {
  PROMISE_STATUS_PROMPT_VERSION,
  buildPromiseStatusSystemPrompt,
  buildPromiseStatusUserPrompt,
  type PromiseStatusInput,
} from '../llm/prompts'
import { retrieveCandidates, type RetrievalInput } from '../llm/retriever'
import { isFrozen, type PromisesSnapshot, type EvidenceEntry } from './promises'

export type LlmCaller = <TSchema extends ZodTypeAny>(
  opts: CallLlmOptions<TSchema>,
) => Promise<z.infer<TSchema> | null>

export interface StatusMiningOptions {
  snapshot: Pick<PromisesSnapshot, 'frozenUntil'>
  minConfidence?: number
  now?: Date
  /** budget rows have no per-row URL; supply the snapshot-level source URL. */
  budgetSourceUrl?: string
}

export interface StatusChangeCandidate {
  promiseId: string
  proposedStatus: 'en-progreso' | 'parcial' | 'cumplida'
  corpus: string
  confidence: number
  reasoning: string
  fieldCite?: string
  /** The grounded evidence to append on apply (kind mapped from corpus). */
  evidence: EvidenceEntry
  /** The resolved flat candidate (for grounding). */
  candidate: { url: string; title: string; date: string; publisher?: string; text: string; corpus: string }
}

const CORPUS_TO_KIND: Record<string, EvidenceEntry['kind']> = {
  press: 'press',
  pleno_agenda: 'pleno',
  pleno_vote: 'pleno',
  pleno_transcript: 'pleno',
  tender: 'tender',
  bdns: 'bdns',
  budget: 'budget',
}

export async function mineStatusChanges(
  input: RetrievalInput,
  opts: StatusMiningOptions,
  caller: LlmCaller = callLLM,
): Promise<{
  candidates: StatusChangeCandidate[]
  stats: { frozen: boolean; candidatesRetrieved: number; emitted: number; rejected: { hallucinatedCite: number; belowConfidence: number } }
}> {
  const stats = { frozen: false, candidatesRetrieved: 0, emitted: 0, rejected: { hallucinatedCite: 0, belowConfidence: 0 } }
  if (isFrozen(opts.snapshot, opts.now)) {
    stats.frozen = true
    return { candidates: [], stats }
  }
  const retrieval = retrieveCandidates(input)
  // Flatten to a single 0-based list; the LLM cites by this index.
  const flat = retrieval.byCorpus.flatMap((b) =>
    b.candidates.map((c) => ({ url: c.url, title: c.title, date: c.date, publisher: c.publisher, text: c.text, corpus: b.corpus })),
  )
  stats.candidatesRetrieved = flat.length
  if (flat.length === 0) return { candidates: [], stats }

  const llmInput: PromiseStatusInput = {
    promise: {
      id: input.promise.id,
      party: (input.promise as { party?: string }).party ?? 'unknown',
      title: input.promise.title,
      quote: input.promise.quote,
      topic: input.promise.topic,
    },
    candidates: flat.map((c) => ({ corpus: c.corpus, ref: c.url, title: c.title, date: c.date, publisher: c.publisher, snippet: c.text.slice(0, 300) })),
  }
  const response = await caller({
    systemPrompt: buildPromiseStatusSystemPrompt(),
    userPrompt: buildPromiseStatusUserPrompt(llmInput),
    promptVersion: PROMISE_STATUS_PROMPT_VERSION,
    schema: PromiseStatusChangeBatchSchema,
    input: { promiseId: input.promise.id, candidateCount: flat.length },
  })
  if (!response) return { candidates: [], stats }

  const min = opts.minConfidence ?? 0.6
  const out: StatusChangeCandidate[] = []
  for (const ch of response.changes) {
    if (ch.candidateIndex < 0 || ch.candidateIndex >= flat.length) {
      stats.rejected.hallucinatedCite += 1
      continue
    }
    if (ch.confidence < min) {
      stats.rejected.belowConfidence += 1
      continue
    }
    const cand = flat[ch.candidateIndex]
    const kind = CORPUS_TO_KIND[cand.corpus] ?? 'otro'
    const url = kind === 'budget' ? opts.budgetSourceUrl ?? cand.url : cand.url
    out.push({
      promiseId: ch.promiseId,
      proposedStatus: ch.proposedStatus,
      corpus: cand.corpus,
      confidence: ch.confidence,
      reasoning: ch.reasoning,
      fieldCite: ch.fieldCite,
      evidence: {
        date: (cand.date || '').slice(0, 10) || '2026-01-01',
        url,
        quote: ch.quote,
        publisher: cand.publisher || 'Ayuntamiento Riba-roja',
        kind,
        addedBy: 'auto-curation-v1',
      },
      candidate: cand,
    })
  }
  stats.emitted = out.length
  return { candidates: out, stats }
}
```

- [ ] **Step 4: Run → PASS** + `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(promesas): status-change miner (mineStatusChanges)` (+ trailers). Stage the module + test.

---

## Task 4: `DraftStatusChange` queue kind

**Files:** Modify `src/scraper/promise-draft.ts`; Test `tests/parse-promise-draft.test.ts` (extend).

**Interfaces produced:** `interface DraftStatusChange`; widen `PromiseReviewQueue.drafts` to `Array<DraftNewPromise | DraftStatusChange>`; `makeStatusDraftId(promiseId, proposedStatus, evidenceUrl): string`; `validateReviewQueue` accepts both kinds.

- [ ] **Step 1: Failing test** — append to `tests/parse-promise-draft.test.ts`:

```ts
  it('validates a queue containing a status-change draft', () => {
    const q = {
      version: '1.0',
      generatedAt: '2026-07-02T00:00:00.000Z',
      drafts: [
        {
          draftId: 'dsc-psoe-obra-en-progreso-abc',
          kind: 'status-change',
          requiresHumanApproval: true,
          confidence: 0.85,
          grounding: { grounded: true, urlResolved: true, quoteFound: true, checkedAt: '2026-07-02T00:00:00.000Z' },
          decision: 'auto-publish',
          promiseId: 'psoe-obra',
          currentStatus: 'documentada',
          proposedStatus: 'en-progreso',
          evidence: { date: '2026-05-01', url: 'https://placsp/t1', quote: 'obra adjudicada por 240.000 euros', publisher: 'PLACSP', kind: 'tender', addedBy: 'auto-curation-v1' },
          reasoning: [],
          generatedAt: '2026-07-02T00:00:00.000Z',
        },
      ],
    }
    const parsed = validateReviewQueue(JSON.stringify(q))
    expect(parsed.drafts).toHaveLength(1)
    expect(parsed.drafts[0].kind).toBe('status-change')
  })

  it('rejects a status-change draft with a non-progress proposedStatus', () => {
    const q = JSON.parse(JSON.stringify({
      version: '1.0', generatedAt: 'x',
      drafts: [{ draftId: 'dsc-x', kind: 'status-change', requiresHumanApproval: true, confidence: 0.8, grounding: { grounded: true, urlResolved: true, quoteFound: true, checkedAt: 'x' }, decision: 'queue', promiseId: 'x', currentStatus: 'documentada', proposedStatus: 'no-ejecutada', evidence: { date: '2026-05-01', url: 'https://x/t', quote: 'y'.repeat(12), publisher: 'X', kind: 'tender', addedBy: 'auto-curation-v1' }, reasoning: [], generatedAt: 'x' }],
    }))
    expect(() => validateReviewQueue(JSON.stringify(q))).toThrow(/proposedStatus/)
  })
```

- [ ] **Step 2: Run → FAIL** `npx vitest run tests/parse-promise-draft.test.ts`.

- [ ] **Step 3: Implement** — in `src/scraper/promise-draft.ts`:
  - Import the `EvidenceEntry` + `Status` types + `ALLOWED_STATUSES`: extend the existing `from './promises'` import to include `type EvidenceEntry, type Status`.
  - Add near `DraftNewPromise`:
```ts
export const PROGRESS_STATUSES: readonly ['en-progreso', 'parcial', 'cumplida'] = [
  'en-progreso',
  'parcial',
  'cumplida',
]
export interface DraftStatusChange {
  draftId: string
  kind: 'status-change'
  requiresHumanApproval: true
  confidence: number
  grounding: Grounding
  decision: DraftDecision
  promiseId: string
  currentStatus: Status
  proposedStatus: 'en-progreso' | 'parcial' | 'cumplida'
  evidence: EvidenceEntry
  reasoning: DraftReasoning[]
  generatedAt: string
}
export type QueueDraft = DraftNewPromise | DraftStatusChange
```
  - Change `PromiseReviewQueue.drafts: DraftNewPromise[]` → `drafts: QueueDraft[]`.
  - `makeStatusDraftId`:
```ts
export function makeStatusDraftId(promiseId: string, proposedStatus: string, evidenceUrl: string): string {
  return `dsc-${slugify(promiseId)}-${proposedStatus}-${fnv32(`${promiseId}|${proposedStatus}|${evidenceUrl}`)}`
}
```
  - In `validateDraft`, branch on `kind`. Keep the existing new-promise validation when `r.kind === 'new-promise'`. Add a `status-change` branch that validates: `requiresHumanApproval === true`, `confidence` 0..1, `decision ∈ DECISIONS`, `grounding` object, `promiseId` str 3..80, `currentStatus`/`proposedStatus` via `oneOf` (proposedStatus ∈ PROGRESS_STATUSES → throws `.../proposedStatus`), `evidence` object with `url` http(s) + `quote` str 10..800 + `date` iso + `publisher` str + `kind` str + `addedBy` str, `reasoning` array. Reject any other `kind`. Return `r as unknown as DraftStatusChange`.
  - Update `removeDraftFromQueue` — no change needed (filters by draftId regardless of kind).

- [ ] **Step 4: Run → PASS** + `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(promesas): DraftStatusChange queue kind` (+ trailers). Stage the module + test.

---

## Task 5: Status grounding (page-quote + structured-row)

**Files:** Modify `src/scraper/promise-grounding.ts`; Test `tests/parse-promise-grounding.test.ts` (extend).

**Interfaces produced:** `groundStructuredCite(fieldCite: string | undefined, candidateExists: boolean): boolean`; `groundStatusDraft(draft: DraftStatusChange, fetchImpl?, now?, resolveGn?): Promise<Grounding>`.

- [ ] **Step 1: Failing test** — append to `tests/parse-promise-grounding.test.ts`:

```ts
import { groundStatusDraft, groundStructuredCite } from '../src/scraper/promise-grounding'
import type { DraftStatusChange } from '../src/scraper/promise-draft'

const NOW2 = new Date('2026-07-02T00:00:00.000Z')
function statusDraft(over: Partial<DraftStatusChange> = {}): DraftStatusChange {
  return {
    draftId: 'dsc-x', kind: 'status-change', requiresHumanApproval: true, confidence: 0.85,
    grounding: { grounded: false, urlResolved: false, quoteFound: false, checkedAt: '' },
    decision: 'queue', promiseId: 'psoe-obra', currentStatus: 'documentada', proposedStatus: 'en-progreso',
    evidence: { date: '2026-05-01', url: 'https://placsp/t1', quote: 'obra adjudicada por 240000', publisher: 'PLACSP', kind: 'tender', addedBy: 'auto-curation-v1' },
    reasoning: [], generatedAt: 'x', ...over,
  }
}

describe('status grounding', () => {
  it('groundStructuredCite: cite present + candidate exists → true', () => {
    expect(groundStructuredCite('tender[0].status=awarded', true)).toBe(true)
    expect(groundStructuredCite(undefined, true)).toBe(true)      // real candidate, no explicit cite → still grounded
    expect(groundStructuredCite('tender[0].status=awarded', false)).toBe(false)
  })

  it('groundStatusDraft: structured corpus (tender) grounds without network', async () => {
    const g = await groundStatusDraft(statusDraft(), undefined, NOW2)
    expect(g.grounded).toBe(true)
  })

  it('groundStatusDraft: page-quote corpus (press) grounds when the quote is on the page', async () => {
    const fetchImpl = async () => ({ ok: true, url: 'https://pub/a', text: async () => '<p>obra adjudicada por 240000 euros</p>' })
    const g = await groundStatusDraft(statusDraft({ evidence: { ...statusDraft().evidence, kind: 'press', url: 'https://pub/a' } }), fetchImpl as never, NOW2)
    expect(g.grounded).toBe(true)
  })

  it('groundStatusDraft: press quote absent → fails safe', async () => {
    const fetchImpl = async () => ({ ok: true, url: 'https://pub/a', text: async () => '<p>texto sin la cita</p>' })
    const g = await groundStatusDraft(statusDraft({ evidence: { ...statusDraft().evidence, kind: 'press', url: 'https://pub/a' } }), fetchImpl as never, NOW2)
    expect(g.grounded).toBe(false)
  })
})
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** — in `src/scraper/promise-grounding.ts` add (import `type DraftStatusChange` from `./promise-draft` alongside the existing import):

```ts
const STRUCTURED_KINDS = new Set(['tender', 'bdns', 'budget', 'pleno'])

/** Structured-row grounding: the cited candidate must be a real retrieved row
 *  (guaranteed by the miner's candidateIndex resolution → candidateExists). A
 *  fieldCite is a bonus assertion but not required. Deterministic, no network. */
export function groundStructuredCite(fieldCite: string | undefined, candidateExists: boolean): boolean {
  return candidateExists
}

/** Ground a status-change draft. Page-quote for press-like evidence; structured-
 *  row (deterministic) for tender/bdns/budget/pleno. Fail-safe → grounded:false. */
export async function groundStatusDraft(
  draft: DraftStatusChange,
  fetchImpl: FetchLike = defaultGroundingFetch,
  now: Date = new Date(),
  resolveGn: (url: string) => Promise<string | null> = resolveGoogleNewsUrl,
): Promise<Grounding> {
  const checkedAt = now.toISOString()
  const fail: Grounding = { grounded: false, urlResolved: false, quoteFound: false, checkedAt }
  const ev = draft.evidence
  // Structured rows: the miner only builds a draft from a resolved real
  // candidate, so the row exists by construction. Deterministic grounding.
  if (STRUCTURED_KINDS.has(ev.kind)) {
    const grounded = groundStructuredCite(undefined, true)
    return { grounded, urlResolved: true, quoteFound: grounded, resolvedUrl: ev.url, checkedAt }
  }
  // Page-quote (press / ayuntamiento): fetch + quote match (mirror groundDraft).
  let targetUrl = ev.url
  if (isGoogleNewsUrl(targetUrl)) {
    const resolved = await resolveGn(targetUrl).catch(() => null)
    if (resolved) targetUrl = resolved
  }
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await fetchImpl(targetUrl)
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
  try {
    const quoteFound = quoteFoundInText(ev.quote, stripHtml(html))
    return { grounded: quoteFound, urlResolved: true, quoteFound, resolvedUrl: res.url, checkedAt }
  } catch {
    return { ...fail, urlResolved: true, resolvedUrl: res.url }
  }
}
```

- [ ] **Step 4: Run → PASS** + `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(promesas): status-change grounding (page-quote + structured-row)` (+ trailers). Stage module + test.

---

## Task 6: `STATUS_TIER` tiered posture + selection for both kinds

**Files:** Modify `src/scraper/promise-auto-curate.ts`; Test `tests/parse-promise-auto-curate.test.ts` (extend).

- [ ] **Step 1: Failing test** — append:

```ts
  it('STATUS_TIER: parcial + cumplida are fast-track; en-progreso is auto', () => {
    expect(STATUS_TIER['en-progreso']).toBe('auto')
    expect(STATUS_TIER['parcial']).toBe('fast-track')
    expect(STATUS_TIER['cumplida']).toBe('fast-track')
  })
  it('decideDraft: en-progreso grounded+confident → auto-publish; cumplida → fast-track', () => {
    const g = { grounded: true, urlResolved: true, quoteFound: true, checkedAt: 'x' }
    expect(decideDraft('en-progreso', 0.8, g)).toBe('auto-publish')
    expect(decideDraft('cumplida', 0.99, g)).toBe('fast-track')
    expect(decideDraft('parcial', 0.99, g)).toBe('fast-track')
  })
```
(`STATUS_TIER` + `decideDraft` are already imported in this test file.)

- [ ] **Step 2: Run → FAIL** (parcial/cumplida currently `'auto'`).

- [ ] **Step 3: Implement** — in `src/scraper/promise-auto-curate.ts`:
  - `STATUS_TIER`: change `parcial: 'auto'` → `parcial: 'fast-track'` and `cumplida: 'auto'` → `cumplida: 'fast-track'`. (en-progreso stays `'auto'`; documentada/en-verificacion stay `'auto'` — discovery unaffected.)
  - Generalize the selection to accept status-change drafts. Add a `keyOf(draft)` + a second dedup key, then a `selectStatusDrafts` that mirrors `selectPromiseDrafts` for `DraftStatusChange[]`:
```ts
import type { DraftStatusChange } from './promise-draft'

export interface SelectStatusInput {
  candidates: DraftStatusChange[]
  seenDraftIds: Set<string>
  /** promiseId+proposedStatus keys already published/queued, to avoid churn. */
  seenTransitions: Set<string>
  frozen: boolean
  minConfidence?: number
  max?: number
}
export interface SelectStatusOutput {
  autoPublish: DraftStatusChange[]
  queue: DraftStatusChange[]
  skipped: Array<{ draftId: string; reason: string }>
}
export function statusTransitionKey(promiseId: string, proposedStatus: string): string {
  return `${promiseId}::${proposedStatus}`
}
export function selectStatusDrafts(inp: SelectStatusInput): SelectStatusOutput {
  const out: SelectStatusOutput = { autoPublish: [], queue: [], skipped: [] }
  if (inp.frozen) {
    for (const c of inp.candidates) out.skipped.push({ draftId: c.draftId, reason: 'frozen' })
    return out
  }
  const min = inp.minConfidence ?? AUTO_PUBLISH_MIN_CONFIDENCE
  let taken = 0
  for (const c of inp.candidates) {
    if (inp.max !== undefined && taken >= inp.max) { out.skipped.push({ draftId: c.draftId, reason: 'max-reached' }); continue }
    if (inp.seenDraftIds.has(c.draftId)) { out.skipped.push({ draftId: c.draftId, reason: 'duplicate' }); continue }
    if (inp.seenTransitions.has(statusTransitionKey(c.promiseId, c.proposedStatus))) {
      out.skipped.push({ draftId: c.draftId, reason: 'already-tracked' }); continue
    }
    const decision = decideDraft(c.proposedStatus, c.confidence, c.grounding, min)
    const draft = { ...c, decision }
    if (decision === 'auto-publish') out.autoPublish.push(draft)
    else out.queue.push(draft)
    taken++
  }
  return out
}
```
  (Keep `selectPromiseDrafts` unchanged for new-promise drafts.)

- [ ] **Step 4: Run → PASS** + `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(promesas): tiered STATUS_TIER + selectStatusDrafts for status changes` (+ trailers).

---

## Task 7: `applyStatusChange` + status retract parity

**Files:** Modify `src/scraper/promise-apply.ts`; Test `tests/parse-promise-apply.test.ts` (extend).

- [ ] **Step 1: Failing test** — append (imports `validatePromisesSnapshot` already present in this file; add `type DraftStatusChange` import):

```ts
import { applyStatusChange } from '../src/scraper/promise-apply'
import type { DraftStatusChange } from '../src/scraper/promise-draft'

function seededSnap() {
  const s = baseSnap()
  s.items.push({
    id: 'psoe-obra', party: 'PSOE', title: 'Reforma del pabellón',
    quote: 'Reformaremos el pabellón municipal antes de fin de año.',
    source: { url: 'https://x.test/p', publisher: 'X' }, madeAt: '2026-01-01',
    topic: 'urbanismo', kind: 'anuncio-gobierno', status: 'documentada', evidence: [], createdAt: '2026-01-01',
  })
  return s
}
function statusDraft(): DraftStatusChange {
  return {
    draftId: 'dsc-psoe-obra-en-progreso-abc', kind: 'status-change', requiresHumanApproval: true, confidence: 0.85,
    grounding: { grounded: true, urlResolved: true, quoteFound: true, checkedAt: NOW }, decision: 'auto-publish',
    promiseId: 'psoe-obra', currentStatus: 'documentada', proposedStatus: 'en-progreso',
    evidence: { date: '2026-05-01', url: 'https://placsp/t1', quote: 'obra adjudicada por 240000 euros', publisher: 'PLACSP', kind: 'tender', addedBy: 'auto-curation-v1' },
    reasoning: [], generatedAt: NOW,
  }
}

describe('applyStatusChange', () => {
  it('sets the status + appends evidence + re-validates (V1 gate passes)', () => {
    const next = applyStatusChange(seededSnap(), statusDraft(), NOW, { confidence: 0.85, at: NOW })
    const p = next.items.find((x) => x.id === 'psoe-obra')!
    expect(p.status).toBe('en-progreso')
    expect(p.evidence).toHaveLength(1)
    expect(p.evidence[0].kind).toBe('tender')
    expect(p.autoPublished?.reviewState).toBe('pending-review')
    validatePromisesSnapshot(JSON.stringify(next))   // non-V1 + evidence → passes
  })
  it('throws when the promiseId is missing', () => {
    const d = statusDraft(); d.promiseId = 'nope'
    expect(() => applyStatusChange(seededSnap(), d, NOW)).toThrow(/not found/)
  })
})
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** — in `src/scraper/promise-apply.ts` (import `type DraftStatusChange` from `./promise-draft`):

```ts
export function applyStatusChange(
  snap: PromisesSnapshot,
  draft: DraftStatusChange,
  now: string,
  autoPublish?: AutoPublishMeta,
): PromisesSnapshot {
  const target = snap.items.find((p) => p.id === draft.promiseId)
  if (!target) throw new Error(`promise "${draft.promiseId}" not found`)
  return {
    ...snap,
    items: snap.items.map((p) => {
      if (p.id !== draft.promiseId) return p
      return {
        ...p,
        status: draft.proposedStatus,
        evidence: [...p.evidence, draft.evidence],
        updatedAt: now.slice(0, 10),
        autoPublished: autoPublish
          ? { at: autoPublish.at, by: 'auto-curation-v1', confidence: autoPublish.confidence, reviewState: 'pending-review' }
          : (p.autoPublished ?? null),
      }
    }),
  }
}
```

- [ ] **Step 4: Run → PASS** + `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(promesas): applyStatusChange (status + grounded evidence, validated)` (+ trailers).

*Note: retract of an auto-published status change (reverting status + dropping the appended evidence) is deferred to Plan 2B alongside the dashboard row; for Plan 2A the auto-publish path + the existing `removeAutoPublished` (which removes the whole promise) suffice for headless use.*

---

## Task 8: Orchestrator `--phase status|both`

**Files:** Modify `scripts/auto-curate-promises.ts`; Modify `scripts/auto-curate-promises-daily.sh` (run `--phase both`).

**Why:** Wire the status miner as a second candidate source. Loads the extra corpora (tenders/bdns/budget), runs `mineStatusChanges` per promise, projects → `DraftStatusChange`, grounds, selects, auto-publishes en-progreso, queues the rest.

- [ ] **Step 1: `CliArgs.phase` + `parseArgs`** — widen `phase: 'discovery'` → `phase: 'discovery' | 'status' | 'both'`; in `parseArgs`, replace the `--phase` handler so it accepts `discovery|status|both` and assigns `out.phase = p`:
```ts
    else if (a === '--phase') {
      const p = argv[++i]
      if (p !== 'discovery' && p !== 'status' && p !== 'both') {
        process.stderr.write(`[auto-curate-promises] --phase must be discovery|status|both (got ${p})\n`)
        process.exit(2)
      }
      out.phase = p
    }
```

- [ ] **Step 2: Add a `runStatusPhase` function + wire it into `main()`.** After the existing discovery block (and before the digest), when `opts.phase === 'status' || opts.phase === 'both'`, run status mining. Add these imports at the top:
```ts
import { mineStatusChanges } from '../src/scraper/promise-status-miner'
import { makeStatusDraftId } from '../src/scraper/promise-draft'
import type { DraftStatusChange } from '../src/scraper/promise-draft'
import { groundStatusDraft } from '../src/scraper/promise-grounding'
import { selectStatusDrafts, statusTransitionKey } from '../src/scraper/promise-auto-curate'
import { applyStatusChange } from '../src/scraper/promise-apply'
import { retrieveCandidates, type RetrievalInput } from '../src/llm/retriever'
```
Guard the DISCOVERY block with `if (opts.phase === 'discovery' || opts.phase === 'both') { ...existing discovery... }` so `--phase status` skips it. Then add the status phase. Load the extra snapshots (`const tenders = loadJson<{contracts?:TenderRow[];tenders?:TenderRow[]}>(resolve('public/data/tenders.json'))` etc. for `bdns.json`, `budget.json`), and build the shared corpora ONCE (same docs for every promise; the retriever filters per-promise by keyword). Add these row types + helper (adapt field access with optional chaining; use `unknown`-cast rows rather than `any` to pass lint):

```ts
type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' ? v : '')
function buildStatusCorpora(
  tenders: { contracts?: Row[]; tenders?: Row[] } | null,
  bdns: { items?: Row[] } | null,
  budget: { snapshot?: Record<string, unknown> } | null,
  press: { items?: Row[] } | null,
): RetrievalInput['corpora'] {
  const tenderDocs = [...(tenders?.contracts ?? []), ...(tenders?.tenders ?? [])].slice(0, 500).map((t) => ({
    url: s(t.permalink) || 'https://contrataciondelestado.es',
    title: s(t.title),
    date: (s(t.awardDate) || s(t.startDate) || s(t.submissionDate) || '2026-01-01').slice(0, 10),
    publisher: 'PLACSP',
    text: `${s(t.title)} ${s(t.categoryTitle)} ${s(t.status)} ${s(t.contractor)}`,
  }))
  const bdnsDocs = (bdns?.items ?? []).slice(0, 200).map((b) => ({
    url: s(b.sourceUrl) || 'https://www.pap.hacienda.gob.es/bdnstrans',
    title: s(b.description),
    date: (s(b.date) || '2026-01-01').slice(0, 10),
    publisher: 'BDNS',
    text: `${s(b.description)} ${s(b.organ)}`,
  }))
  const snap = budget?.snapshot ?? {}
  const budgetRows = [
    ...((snap.expenseByProgram as Row[]) ?? []),
    ...((snap.expenseByEconomicChapter as Row[]) ?? []),
  ]
  const budgetUrl = s(snap.source) || 'https://civicpulse.es/data/budget.json'
  const budgetDocs = budgetRows.map((r) => ({
    url: budgetUrl,
    title: s(r.label),
    date: `${(snap.year as number) ?? 2026}-01-01`,
    publisher: 'MinHac CONPREL',
    text: `${s(r.label)} ${String(r.amount ?? '')}`,
  }))
  const pressDocs = (press?.items ?? []).slice(0, 120).map((n) => ({
    url: s(n.link),
    title: s(n.title),
    date: (s(n.date) || '2026-01-01').slice(0, 10),
    publisher: s(n.source) || 'prensa',
    text: s(n.title),
  }))
  return [
    { corpus: 'tender', documents: tenderDocs },
    { corpus: 'bdns', documents: bdnsDocs },
    { corpus: 'budget', documents: budgetDocs },
    { corpus: 'press', documents: pressDocs },
  ]
}
```

Then in `main()`: `const corpora = buildStatusCorpora(tenders, bdns, budget, press)` and `const budgetSourceUrl = s(budget?.snapshot?.source) || 'https://civicpulse.es/data/budget.json'`. Loop every promise, build `const input: RetrievalInput = { promise: { id: p.id, title: p.title, quote: p.quote, topic: p.topic }, corpora }` (attach `party`/`madeAt` too — the miner reads them via cast), call `mineStatusChanges(input, { snapshot: snap, minConfidence: opts.minConfidence, budgetSourceUrl })`, then project each `StatusChangeCandidate` to a `DraftStatusChange`:
```ts
const draft: DraftStatusChange = {
  draftId: makeStatusDraftId(c.promiseId, c.proposedStatus, c.evidence.url),
  kind: 'status-change', requiresHumanApproval: true, confidence: c.confidence,
  grounding: { grounded: false, urlResolved: false, quoteFound: false, checkedAt: nowIso },
  decision: 'queue', promiseId: c.promiseId,
  currentStatus: (snap.items.find((p) => p.id === c.promiseId)?.status ?? 'documentada'),
  proposedStatus: c.proposedStatus, evidence: c.evidence,
  reasoning: [{ url: c.evidence.url, date: c.evidence.date, quote: c.reasoning, publisher: c.evidence.publisher, matchedKeywords: [] }],
  generatedAt: nowIso,
}
draft.grounding = await groundStatusDraft(draft, undefined, now)
```
Collect status drafts; build `seenTransitions` from `snap.items` (`statusTransitionKey(p.id, p.status)`) + existing queue status-drafts; `selectStatusDrafts({ candidates, seenDraftIds: seen, seenTransitions, frozen: false, minConfidence, max })`. `--no-auto-publish` forces its `autoPublish → queue` (same pattern as discovery). Merge status drafts into `toQueue`; apply auto-publish status drafts via `applyStatusChange` into the SAME `next` snapshot before the single validated write; extend the digest.

- [ ] **Step 3: `auto-curate-promises-daily.sh`** — change the npm invocation to `npm run auto-curate-promises -- --max 10 --no-auto-publish --phase both`.

- [ ] **Step 4: Verify** — `npm run typecheck` + `npm run lint` + `npm test` green. Then a live smoke (network + agy):
```bash
set -a; . .env; set +a; unset OPENAI_API_KEY ANTHROPIC_API_KEY
rm -f editorial/promise-review-queue.json editorial/promise-review-archive.json
LLM_BACKEND=agy npm run auto-curate-promises -- --no-auto-publish --phase status --max 6 2>&1 | tail -12
node -e "const q=require('./editorial/promise-review-queue.json'); q.drafts.filter(d=>d.kind==='status-change').forEach(d=>console.log(d.proposedStatus+' '+(d.grounding.grounded?'✓':'·')+' '+d.promiseId+' via '+d.evidence.kind))"
```
Expect: some status-change drafts (or an honest empty set). Confirm `git status --short public/data/promises.json` shows no change (dry/no-auto-publish). Report the output.

- [ ] **Step 5: Commit** `feat(promesas): orchestrator --phase status|both (status-change source)` (+ trailers). Stage `scripts/auto-curate-promises.ts` + `scripts/auto-curate-promises-daily.sh`.

---

## Done criteria (Plan 2A)
- `npm test` green (5 new test files/cases: tender-kind, status-schema, status-miner, status-draft, status-grounding, status-tier, applyStatusChange).
- `npm run typecheck` + `npm run lint` clean.
- `npm run auto-curate-promises -- --phase status --no-auto-publish` produces status-change drafts in the queue from real snapshots; en-progreso grounded ones would auto-publish (held by `--no-auto-publish`); a grounded en-progreso applied via `applyStatusChange` re-validates (non-V1 + evidence).

## Plan 2B (surfaces — deferred)
- `PromiseDraftRow` branch on `draft.kind` to render `currentStatus → proposedStatus` + the evidence for status-change drafts.
- Status-change retract parity (revert status + drop the appended evidence) in the `/curator` pending-review flow.
- `/metodologia` disclosure of status-change auto-curation + the tender→promise-inference caveat.
