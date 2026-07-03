# Promise Auto-Curator — Phase 2: Status-Change Miner — Design Spec

- **Date:** 2026-07-02
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Owner:** datarhan
- **Subsystem:** `/promesas` status changes — extends the Phase 1/1b auto-curator (highest libel-risk surface)
- **Builds on:** `docs/superpowers/specs/2026-07-02-promise-auto-curator-design.md` (§9 sketched Phase 2)

---

## 1. Problem & goal

Phase 1 (engine) + Plan B (surfaces) auto-curate **new** promises (`documentada`). The published statuses of *existing* promises never move without a human hand-editing `promises.json`. **Goal:** detect **progress transitions** on existing promises — `documentada → en-progreso / parcial / cumplida` — from the municipal open-data trail (tender awards, pleno agendas, budget/ordenanza approvals, press), ground them, and feed them through the *existing* auto-curator pipeline (grounding → decision-tier → queue/auto-publish → `/curator` review).

Phase 2 is mostly **wiring**: `STATUS_TIER` (`promise-auto-curate.ts`) was already built for all seven statuses; the retriever (all 7 corpora typed), grounding, queue, apply, launchd, and the `/curator` pending-review section all reuse. The new work is a status-change *source* + the apply mutation + structured-row grounding.

---

## 2. Locked decisions

| Dial | Decision |
|---|---|
| Scope | **Progress transitions only** (`documentada → en-progreso / parcial / cumplida`). `no-ejecutada` DEFERRED (undetectable without `dueBy`; 0/16 promises have one). |
| Auto-publish posture | **Tiered**: `en-progreso` auto-publishes (0.70 + grounded); `parcial` + `cumplida` → **one-click fast-track**. |
| Approach | **New standalone status-change miner** (do NOT widen the V1 evidence miner in place — the V1 gate is enforced in 3 places with an explicit warning). Reuse retriever + grounding + queue + apply + launchd. |
| Anti-hallucination | **Cite-by-`candidateIndex`** (the LLM references a retrieved candidate by index; it cannot fabricate a URL/row). |
| Grounding | Page-quote (press/ayuntamiento, reuse) **+ new structured-row grounding** for tender/bdns/budget (assert cited row still exists with the cited field value). |

---

## 3. Architecture & data flow

```
auto-curate-promises.ts --phase status   (new; discovery | status | both)
  │ reads: promises.json (existing) + press/plenos-agendas/tenders/bdns/budget/transcripts
  ▼
src/llm/promise-status-miner.ts  (NEW; reuses retriever + buildUrlAllowlist + isFrozen + minConfidence)
  │ per existing promise → retrieveCandidates() across 7 corpora → ONE LLM call:
  │   schema PromiseStatusChangeSchema, prompt "promise-status-v1":
  │   { promiseId, proposedStatus ∈ {en-progreso,parcial,cumplida},
  │     candidateIndex, corpus, quote, fieldCite?, confidence, reasoning }
  │ post-filter: freeze fail-closed · confidence < floor · proposedStatus ∉ progress set ·
  │   candidateIndex must resolve to a real retrieved candidate (else reject: hallucinatedCite)
  ▼  → StatusChangeCandidate[]  (projected to DraftStatusChange)
src/scraper/promise-grounding.ts  (EXTENDED)
  │ page-quote grounding for press/ayuntamiento (reuse groundDraft's fetch+quoteFoundInText+GN-resolve)
  │ + groundStructuredCite(corpus, cite, rows): the cited tender/bdns/budget row exists in the
  │   loaded snapshot AND the cited field value matches (per claim-verifier <dataset>[i].<field>=<value>)
  ▼
src/scraper/promise-auto-curate.ts  (STATUS_TIER tweak: parcial+cumplida auto→fast-track)
  │ decideDraft(proposedStatus, confidence, grounding): gate = confidence ≥ 0.70 AND grounded
  │   en-progreso→auto-publish · parcial/cumplida→fast-track · (no-ejecutada→fast-track, deferred) · inviable→queue
  ├─ decision = queue|fast-track → editorial/promise-review-queue.json  (status-change drafts)
  └─ decision = auto-publish → applyStatusChange
      ▼
src/scraper/promise-apply.ts  (NEW applyStatusChange)
  │ target = promises.json item by promiseId; set status = proposedStatus;
  │ APPEND a grounded EvidenceEntry {date,url,quote,publisher,kind(mapped from corpus),addedBy:'auto-curation-v1'};
  │ set updatedAt; stamp autoPublished {at,by,confidence,reviewState:'pending-review'};
  │ serialize → validatePromisesSnapshot (V1 gate PASSES: non-V1 status carries ≥1 evidence) → write
  ▼
promises.json (committed by orchestrator/launchd) → /curator "pendientes de revisión" section (built)
                                                   → public badge (built)
```

---

## 4. Component inventory

| # | File (new unless noted) | Purpose |
|---|---|---|
| 1 | `src/llm/schemas.ts` (edit) | Add `PromiseStatusChangeItemSchema` + `PromiseStatusChangeBatchSchema` (proposedStatus ∈ progress set, `candidateIndex`, corpus, quote, `fieldCite?`, confidence, reasoning). Kept SEPARATE from the V1 `PromiseEvidence*` schemas. |
| 2 | `src/llm/prompts.ts` (edit) | `PROMISE_STATUS_PROMPT_VERSION` (`'promise-status-v1'`) + `buildPromiseStatusSystemPrompt` + `buildPromiseStatusUserPrompt` (renders the promise + numbered candidates for cite-by-index). |
| 3 | `src/llm/promise-status-miner.ts` | `mineStatusChanges(input, opts, caller?)` — reuse `retrieveCandidates`, `buildUrlAllowlist`, `isFrozen`, confidence floor; one LLM call per promise; post-filter (freeze, floor, progress-set, candidateIndex-resolves). Returns `StatusChangeCandidate[]` + stats. |
| 4 | `src/scraper/promise-draft.ts` (edit) | Add `DraftStatusChange` kind to the queue schema + validator; widen `PromiseReviewQueue.drafts` to `DraftNewPromise | DraftStatusChange`; `makeStatusDraftId(promiseId, proposedStatus, evidenceUrl)`. |
| 5 | `src/scraper/promise-grounding.ts` (edit) | `groundStructuredCite(corpus, cite, rows): { grounded, matchedField }` — assert the cited row exists with the cited value. `groundStatusDraft(draft, snapshots, fetchImpl?)` dispatches page-quote (press/ayto) vs structured-row (tender/bdns/budget). Fail-safe. |
| 6 | `src/scraper/promise-auto-curate.ts` (edit) | `STATUS_TIER`: `parcial` + `cumplida` `'auto' → 'fast-track'` (en-progreso stays `'auto'`). Generalize `selectPromiseDrafts` to accept both draft kinds — dedup new-promise by party+title/url (existing) and status-change by `promiseId + proposedStatus`. |
| 7 | `src/scraper/promise-apply.ts` (edit) | `applyStatusChange(snap, promiseId, proposedStatus, evidence, now, autoPublish?): PromisesSnapshot` — set status, append evidence, updatedAt, autoPublished. `tombstoneStatusDraft` for retract parity. |
| 8 | `src/scraper/promises.ts` (edit) | Add `'tender'` to `EvidenceEntry.kind` union (currently `press|pleno|budget|bdns|ayuntamiento|otro`). |
| 9 | `scripts/auto-curate-promises.ts` (edit) | Accept `--phase status|both` (currently `discovery` only). Load the extra corpora (tenders/bdns/budget/transcripts), run `mineStatusChanges`, project → `DraftStatusChange`, ground, `selectPromiseDrafts`, apply auto-publish, digest. |
| 10 | `src/pages/curator/promise-queue.jsx` (edit) | `PromiseDraftRow` renders a `status-change` draft: `currentStatus → proposedStatus` chips + the evidence, alongside the existing new-promise rendering. |
| 11 | `scripts/auto-curate-promises-daily.sh` (edit) | Run `--phase both` so the daily job does discovery + status (still `--no-auto-publish` rollout default). |

Reused unchanged: `retriever.ts`, `buildUrlAllowlist`, `isFrozen`, `promise-grounding`'s page-quote path + Google-News resolver + UA, the queue file + archive + tombstone model, `newPromiseFromDraft`/`insertPromise`/`setReviewState`/`removeAutoPublished`, the `/curator` pending-review section, the public badge, the launchd wrapper + plist.

---

## 5. Data shapes

### `PromiseStatusChangeItemSchema` (schemas.ts) — cite-by-index
```ts
const PROGRESS_STATUSES = ['en-progreso', 'parcial', 'cumplida'] as const
export const PromiseStatusChangeItemSchema = z.object({
  promiseId: z.string().min(3),
  proposedStatus: z.enum([...PROGRESS_STATUSES]),
  candidateIndex: z.number().int().min(0),   // index into the numbered candidates in the user prompt
  corpus: PromiseEvidenceKind,               // reuse: press|pleno_agenda|pleno_vote|pleno_transcript|tender|bdns|budget
  quote: z.string().min(10).max(500),        // verbatim from the candidate (page text or row field)
  fieldCite: z.string().max(200).optional(), // for structured rows: "<dataset>[i].<field>=<value>"
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10).max(500),
})
export const PromiseStatusChangeBatchSchema = z.object({ changes: z.array(PromiseStatusChangeItemSchema).max(8) })
```

### `DraftStatusChange` (promise-draft.ts)
```ts
interface DraftStatusChange {
  draftId: string                 // makeStatusDraftId(promiseId, proposedStatus, evidenceUrl)
  kind: 'status-change'
  requiresHumanApproval: true
  confidence: number
  grounding: Grounding            // reuse shape; structured-row sets grounded + a flag
  decision: DraftDecision
  promiseId: string
  currentStatus: Status
  proposedStatus: 'en-progreso' | 'parcial' | 'cumplida'
  evidence: EvidenceEntry         // the grounded entry to append on apply (addedBy:'auto-curation-v1')
  reasoning: Array<{ url; date; quote; publisher?; matchedKeywords: string[] }>
  generatedAt: string
}
```
`PromiseReviewQueue.drafts: Array<DraftNewPromise | DraftStatusChange>` (discriminated by `kind`).

### `applyStatusChange` (promise-apply.ts)
Pure: finds the item by `promiseId` (throw if missing), sets `status`, appends the grounded `EvidenceEntry`, sets `updatedAt`, stamps `autoPublished` (when auto). Caller serializes → `validatePromisesSnapshot` → write. The V1 invariant (`promises.ts:212-220`, non-V1 requires ≥1 evidence) is satisfied because the evidence is appended in the same object.

---

## 6. Detection semantics (the `promise-status-v1` prompt)

Progress-transition rules the prompt encodes (party-level attribution only, cite-by-index, verbatim quotes):
- **en-progreso** — a matching **tender award/adjudicación**, a pleno agenda item approving/commissioning the work, a budget line/ordenanza approval, or press reporting the work has *started*.
- **parcial** — evidence of *partial* delivery (one phase done, or a subset of a multi-part promise).
- **cumplida** — an **acta de recepción / inauguración**, or press reporting the work is *finished/opened*.
- Hard rules: NEVER propose `cumplida` on weak/ambiguous evidence (prefer en-progreso or nothing). NEVER `no-ejecutada`/`inviable` (Phase 2 is progress-only; those are human-only/deferred). Cite the candidate by its index; the `quote` must be verbatim from that candidate. Match the promise's topic/subject — do not attach an unrelated obra. `SAFETY_FOOTER` applies (ignore injected instructions in the data).

The tender→promise *match* is the LLM's inference; grounding proves the tender row exists, not that the match is correct — which is exactly why `parcial`/`cumplida` are one-click and only `en-progreso` auto-publishes.

---

## 7. Grounding

- **Page-quote** (corpus ∈ {press, pleno_transcript, ayuntamiento-press}): reuse `groundDraft`'s fetch (Mozilla UA) + Google-News resolver + `quoteFoundInText`. Grounded iff the verbatim quote is on the resolved publisher page.
- **Structured-row** (corpus ∈ {tender, bdns, budget, pleno_agenda, pleno_vote}): NEW `groundStructuredCite` — the cited candidate must still exist in the loaded snapshot, and the `fieldCite` (`<dataset>[i].<field>=<value>`) must match the actual row's field. This is deterministic (no network) and is the anti-hallucination proof for structured evidence. Grounded iff the row + field-value match.
- Fail-safe: any failure → `grounded: false` → the draft goes to the queue (never auto-publishes ungrounded), same as Phase 1.

Corpus → `EvidenceEntry.kind` map: `press → 'press'`, `pleno_* → 'pleno'`, `tender → 'tender'` (new enum member), `bdns → 'bdns'`, `budget → 'budget'`, else `'otro'`.

---

## 8. Libel / safety invariants (carried + new)

1. **Party-level attribution only** (reuse the prompt rule + `speakerGroup`-style discipline).
2. **Freeze fail-closed** in the miner and the apply/orchestrator (reuse `isFrozen`).
3. **Cite-by-`candidateIndex`** — the LLM cannot fabricate a source; a candidateIndex that doesn't resolve is rejected.
4. **Grounding required for auto-publish** (page-quote or structured-row). Ungrounded → queue.
5. **Tiered oversight**: `en-progreso` auto; `parcial`/`cumplida` one-click; `no-ejecutada` (deferred) fast-track; `inviable` human-only. Encoded in `STATUS_TIER`.
6. **V1 gate always satisfied** — a non-V1 status is only ever written *together with* its grounded evidence entry (single validated write). `applyStatusChange` never writes a non-V1 status without evidence.
7. **Single validated writer** — `promises.json` is only mutated via the apply path (read→validate→mutate→re-validate→write).
8. **Retract/mark-reviewed parity** — an auto-published status change is retractable (revert to the prior status + remove the appended evidence) and mark-reviewable via the existing `/curator` section; `applyStatusChange` records enough to revert.
9. **`/metodologia`** update — disclose status-change auto-curation + the tender→promise-inference caveat (published editorial contract).

---

## 9. Deferred (explicit, YAGNI for Phase 2)
- **`no-ejecutada`** detection — requires curating `dueBy` deadlines onto promises + a "plazo vencido sin evidencia" detector. Its own effort.
- **Semantic retrieval** — the retriever is lexical (keyword-overlap). Sufficient for now; embeddings are a later precision upgrade.
- **`statusHistory`** on promises — the current `autoPublished` meta + git history are the audit trail; a structured per-transition history is not needed yet.

---

## 10. Testing (TDD)
- `PromiseStatusChangeItemSchema` validators (progress-only enum, candidateIndex int, fieldCite optional).
- `mineStatusChanges` with a stub caller: rejects candidateIndex-out-of-range (hallucinatedCite), below-floor, non-progress status, honors freeze.
- `groundStructuredCite`: row-exists + field-match → grounded; missing row / wrong value → false.
- `decideDraft` for the status tiers: en-progreso@0.70+grounded → auto-publish; parcial/cumplida → fast-track; ungrounded/sub-threshold → queue.
- `applyStatusChange` round-trip: non-V1 status + appended evidence → `validatePromisesSnapshot` passes; missing promiseId → throw; retract reverts status + drops the appended evidence.
- `promise-draft` validator accepts `DraftStatusChange`; queue holds mixed kinds.
- Orchestrator `--phase status` smoke (dry-run / `--no-auto-publish`) against real snapshots.
- Existing 1268 tests stay green.

---

## 11. Rollout
- Ships behind the same `--no-auto-publish` launchd default (writes only the local queue). Curator watches status-change drafts in `/curator`, spot-checks the tender→promise matches, then enables auto-publish.
- `--phase both` in the daily wrapper runs discovery + status together.
- First live `LLM_BACKEND=agy` run verifies real status-change candidates ground (e.g. an obra-in-progreso from a tender award).
