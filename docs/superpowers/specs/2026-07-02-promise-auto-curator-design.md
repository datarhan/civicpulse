# Promise Auto-Curator — Design Spec

- **Date:** 2026-07-02
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Owner:** datarhan
- **Subsystem:** `/promesas` (promise tracker) — the project's highest libel-risk surface
- **Related contracts:** `CLAUDE.md → "Promise tracker (sensitive subsystem)"`, `src/scraper/promises.ts`, `/metodologia`, `/aviso-legal`

---

## 1. Problem & goal

`/promesas` renders `public/data/promises.json`, a **curated, human-edited** file. Nothing updates it automatically (by design), so it goes stale: at time of writing it holds 16 promises, last content-edited 2026-04-20 (`generatedAt` 2026-04-20, `frozenUntil: null`). The nightly `promise-suggestions.json` refreshes but is display-only and can never become a published status.

**Goal:** a **curator-in-the-loop auto-curator** that keeps the tracker current with far less manual toil, while preserving every libel guardrail the subsystem was built around. It:

1. Runs a daily LLM analysis (via the user's Gemini/Claude subscription — no metered API) to **discover new promises** and (Phase 2) **detect status changes** on existing ones.
2. **Auto-publishes** high-confidence, deterministically-grounded items; routes everything else to a **human review queue** in the existing `/curator` dashboard.
3. Keeps the accusatory "broke promise" verdict on a one-click human path, and `inviable` fully human-only.

---

## 2. Locked decisions

| Dial | Decision |
|---|---|
| Scope | **Both** discovery (new promises) + status changes — **phased**, discovery first |
| Publishing posture | **Hybrid**: auto-publish above the bar, human queue below |
| Cadence | **Daily** launchd agent (regenerates queue + applies auto-publishes) |
| LLM backend | **Gemini primary → claude-code fallback** (subscription/local, `$0`) |
| Review surface | **`/curator` dashboard** (dev-only, localhost) — Approach 1 |
| Auto-approve gate | **LLM confidence ≥ 0.70 AND deterministic grounding** |
| Auto-approve scope | New `documentada` + positive/neutral escalations auto-publish; `no-ejecutada` → one-click fast-track; `inviable` → human-only |
| Visibility | Auto-published items **badged** "publicada automáticamente · revisión pendiente" + **retract list** + **daily digest** |

---

## 3. Architecture & data flow

```
Daily launchd agent (runs on the curator's laptop, like the other local agents)
  │  LLM_BACKEND=gemini (fallback claude-code)
  ▼
scripts/auto-curate-promises.ts  ── orchestrator CLI ───────────────────────┐
  │  reads (read-only): promises.json (dedup + freeze), press.json,          │
  │    plenos-agendas.json, pleno-claims-verified.json (ClaimType 'promesa'),│
  │    + tenders.json / bdns.json / budget.json (evidence corpus)            │
  │                                                                          │
  │  Phase 1 DISCOVERY: src/llm/promise-discovery.ts → NEW promise candidates│
  │  Phase 2 STATUS:    reuse promise-llm-inference miner → status candidates│
  ▼                                                                          │
src/scraper/promise-grounding.ts  ── deterministic gate ────────────────────┤
  │  resolve source URL (follow RSS/Google-News redirects) → 200?            │
  │  verbatim quote present in fetched page? party/date present + sane?       │
  │  FAIL-SAFE: anything not grounded → forced to human queue                │
  ▼                                                                          │
src/scraper/promise-auto-curate.ts  ── PURE core ──────────────────────────┤
  │  dedup (vs existing + queued + archived) · confidence + grounding gate   │
  │  decision tiering per status → {auto-publish | fast-track | queue}       │
  ▼                                                                          │
  ├── decision = queue / fast-track ──► editorial/promise-review-queue.json  │
  │                                       (LOCAL-ONLY, gitignored)           │
  └── decision = auto-publish ────────► scripts/apply-promise-draft.ts ──────┘
                                          │  read → validate → insert/patch →
                                          │  RE-validate whole snapshot → write
                                          │  tag autoPublished + addedBy
                                          ▼
                                        public/data/promises.json (committed + pushed
                                          by the launchd job → Vercel deploy)

Curator opens /curator → "Promesas · cola de revisión" section
  │  reads queue via  GET /api/curator/promise-queue  (local file)
  │  reads auto-published-pending via promises.json (autoPublished.reviewState)
  │  Approve / Edit+Approve / Reject  → POST /api/curator/run (apply|reject)
  │  Retract / Mark-reviewed          → POST /api/curator/run (retract|mark-reviewed)
  ▼
promises.json  →  commit via generalized POST /api/curator/commit
```

Public `/promesas` renders the badge for any promise whose `autoPublished.reviewState === 'pending-review'`.

---

## 4. Component inventory

| # | File (new unless noted) | Purpose | Phase |
|---|---|---|---|
| 1 | `src/scraper/promise-draft.ts` | Queue-record schema + validators (`DraftNewPromise`, `DraftStatusChange`), all `requiresHumanApproval:true` | 1 |
| 2 | `src/scraper/promise-grounding.ts` | Deterministic grounding: URL-resolve + verbatim-quote-in-source + party/date. Pure matcher + thin fetch wrapper | 1 |
| 3 | `src/scraper/promise-auto-curate.ts` | **Pure** core: dedup, confidence+grounding gate, decision tiering → `{drafts, autoPublish, skipped}` | 1 |
| 4 | `src/llm/promise-discovery.ts` + prompt (`prompts.ts`) + `PromiseDiscoverySchema` (`schemas.ts`) | LLM discovery: fresh press/agendas/pleno-`promesa` → new promise candidates. Never sets status (defaults `documentada`) | 1 |
| 5 | `scripts/auto-curate-promises.ts` | Orchestrator CLI `npm run auto-curate-promises`. Flags: `--max`, `--min-confidence`, `--phase`, `--dry-run`, `--no-auto-publish` | 1 |
| 6 | `scripts/apply-promise-draft.ts` | **Only** new writer of `promises.json`. `apply <id> [--edit …]`, `--reject <id>`, `--retract <id>`, `--mark-reviewed <id>`. read→validate→mutate→re-validate→write. Used by dashboard **and** programmatically by the batch for auto-publish | 1 |
| 7 | `src/scraper/promises.ts` (edit) | Add optional `autoPublished` field + validation; keep V1 evidence gate | 1 |
| 8 | `src/pages/curator/promises.jsx` + `Curator.jsx` (edit) | Dashboard section: draft cards + auto-published-pending list; Approve / Edit+Approve / Reject / Retract / Mark-reviewed. Freeze-aware | 1 |
| 9 | `vite-curator-plugin.js` (edit) | `GET /api/curator/promise-queue`; actions `apply-promise-draft`, `reject-promise-draft`, `retract-promise`, `mark-reviewed`; **generalize `handleCommit`** to an allowlist `{pleno-findings.json, promises.json}` | 1 |
| 10 | `src/pages/Promesas.jsx` (`PromiseCard`, edit) | Render "publicada automáticamente · revisión pendiente" badge | 1 |
| 11 | `scripts/com.civicpulse.auto-curate-promises.plist` + `scripts/auto-curate-promises-daily.sh` + `scripts/launchd-install-auto-curate-promises.sh` | Daily launchd. git pull-rebase → LLM_BACKEND=gemini → run CLI → commit `promises.json` only if changed → push. Digest to `scripts/logs/` | 1 |
| 12 | `src/pages/Metodologia.jsx` + `src/pages/AvisoLegal.jsx` (edit) | Disclose auto-curation + auto-publish behavior + threshold/grounding | 1 |
| 13 | Status miner wiring in #4/#5 | Detect status escalations on existing promises → feeds the same pipeline | 2 |

---

## 5. Data shapes

### Queue records (`editorial/promise-review-queue.json`, local-only)

```ts
type DraftDecision = 'auto-publish' | 'fast-track' | 'queue'

interface Grounding {
  grounded: boolean
  urlResolved: boolean       // final URL returned 200
  quoteFound: boolean        // verbatim quote present in fetched page text
  resolvedUrl?: string       // publisher URL after following redirects
  checkedAt: string          // ISO
}

interface DraftNewPromise {         // Phase 1
  draftId: string                   // stable hash of (party|title|sourceUrl)
  kind: 'new-promise'
  requiresHumanApproval: true
  confidence: number                // 0..1, LLM self-report (uncalibrated)
  grounding: Grounding
  decision: DraftDecision
  proposed: {                       // shape validated against promises.ts on apply
    party: Party
    title: string
    quote: string                   // verbatim 20..1500
    source: { url: string; publisher: string }
    madeAt: string                  // ISO, not future
    topic: Topic
    kind: Kind
    status: 'documentada'           // discovery never proposes anything else
  }
  reasoning: Array<{ url; date; quote; publisher?; matchedKeywords: string[] }>
  generatedAt: string
}

interface DraftStatusChange {       // Phase 2
  draftId: string                   // stable hash of (promiseId|proposedStatus|evidenceUrls)
  kind: 'status-change'
  requiresHumanApproval: true
  confidence: number
  grounding: Grounding
  decision: DraftDecision
  promiseId: string                 // must exist in promises.json
  currentStatus: Status
  proposedStatus: Exclude<Status, 'inviable'>  // inviable is human-only
  evidence: EvidenceEntry[]         // grounded, schema-valid, addedBy:'auto-curation-v1'
  reasoning: Array<{ url; date; quote; publisher?; matchedKeywords: string[] }>
  generatedAt: string
}
```

Rejected drafts move to `editorial/promise-review-archive.json` (also local-only) so they never resurface.

### New optional field on the curated `Promise` (`promises.ts`)

```ts
autoPublished?: {
  at: string                        // ISO
  by: 'auto-curation-v1'
  confidence: number
  reviewState: 'pending-review' | 'reviewed' | 'retracted'
  reviewedAt?: string
} | null
```

Backward-compatible (optional). Validated: `by` is the literal tag, `confidence` 0..1, `reviewState` enum, dates ISO.

### Config constants (`src/scraper/promise-auto-curate.ts`)

```ts
const AUTO_PUBLISH_MIN_CONFIDENCE = 0.70

// Tier per status. Editable in one place to retune risk posture.
const STATUS_TIER: Record<Status, 'auto' | 'fast-track' | 'human-only'> = {
  documentada:       'auto',
  'en-verificacion': 'auto',
  'en-progreso':     'auto',
  parcial:           'auto',
  cumplida:          'auto',
  'no-ejecutada':    'fast-track',   // accusatory → one human click
  inviable:          'human-only',   // never machine-published
}
```

---

## 6. Auto-approval decision logic

For each candidate, after the LLM pass and grounding:

| Verdict class | Statuses | `conf ≥ 0.70` **and** grounded | otherwise |
|---|---|---|---|
| New commitment | `documentada` | **auto-publish** (badged) | → queue |
| Positive / neutral escalation | `en-verificacion`, `en-progreso`, `parcial`, `cumplida` | **auto-publish** (badged) | → queue |
| Accusatory | `no-ejecutada` | **fast-track** (drafted, grounded, pinned top of queue; one click to publish) | → queue |
| Hard human-only | `inviable` | never (→ queue for a human) | → queue |

**Grounding (`promise-grounding.ts`) — the real safety layer, since LLM confidence is uncalibrated:**

1. **URL resolve** — GET the source URL following redirects (Google-News/RSS wrappers resolve to the publisher). Require final status 200. Record `resolvedUrl`.
2. **Verbatim quote present** — fetch page, strip HTML to text, normalize (diacritics fold + whitespace collapse via `src/scraper/normalize.ts`). Require the normalized verbatim quote to be a **substring** of the normalized page text. (Fallback: ≥ 0.9 token coverage — still strict; stricter = fewer false auto-publishes, which is the safe direction.)
3. **Party present** — `proposed.party` ∈ `ALLOWED_PARTIES`.
4. **Date sane** — `madeAt` valid ISO, not in the future.

Any failure → `grounded: false` → the item is **forced to the human queue** regardless of confidence. Grounding never runs against the raw RSS redirect for the quote check — only against the resolved publisher page.

**Why grounding ≠ correctness for accusatory verdicts (rationale for the fast-track tier):** grounding proves the *evidence exists*, not that the *inference* "…therefore they broke it" is sound (project could be delayed not abandoned, delivered under a different name, or the "evidence" was an opposition claim). For `documentada` the claim *is* "they said X" so grounding ≈ correctness; for `no-ejecutada` it is not — hence a human clicks.

---

## 7. Libel guardrails (carried verbatim from the existing contract)

1. **Evidence gate stays.** `validatePromisesSnapshot` still requires any non-V1 status to carry ≥1 valid `EvidenceEntry`. Auto-published escalations always attach grounded evidence; the gate is enforced at write time by `apply-promise-draft.ts`.
2. **Two-file separation.** The queue lives in gitignored `editorial/` — it is not `promises.json`. **Only `apply-promise-draft.ts` writes `promises.json`**, via read→validate→mutate→re-validate→write.
3. **LOREG freeze fail-closed** in *both* the batch and the apply-CLI. If `promises.json` is missing/unreadable → **exit 1, refuse** (freeze state unknowable), mirroring `auto-curate-findings.ts`.
4. **`response` and `departmentSlug` are never machine-written** (right-of-reply is an unvalidated passthrough; dept is human-only).
5. **Unreviewed party attributions never leave the laptop** — no public/data file for drafts, gitignored queue, dev-only dashboard.
6. **`inviable` never machine-published**; `no-ejecutada` never silently published.
7. **Provenance** — every machine-added evidence row `addedBy:'auto-curation-v1'`; every auto-published promise carries `autoPublished`.
8. Verbatim quote 20–1500, `source.url`+`publisher` required, unique ids, provenance tag — all re-checked by `validatePromisesSnapshot` on every write.

---

## 8. Editorial-contract consequences (explicit sign-off items)

1. **The "V1-only live data" policy ends.** `promises.json` will legitimately contain `en-progreso`/`parcial`/`cumplida`/`no-ejecutada`. `tests/parse-promises.test.ts`'s "live data is V1-only" assertion is **relaxed to the evidence-gated form** (non-V1 allowed iff ≥1 dated, URL-backed evidence entry). The evidence gate itself is **not** loosened. This is the explicit editorial decision the CLAUDE.md guardrail requires.
2. **New optional `autoPublished` field** on the curated schema (§5), backward-compatible, validated in `promises.ts`.
3. **`/metodologia` + `/aviso-legal` updated in the same PR** to disclose: the auto-curation pipeline, the 0.70 + grounding auto-publish threshold, the "publicada automáticamente · revisión pendiente" badge, and the human-only boundary for `no-ejecutada`/`inviable`. Public disclosure is itself part of the libel defense.

---

## 9. Phasing

### Phase 1 (this spec, full): discovery + auto-approval machinery
Components 1–12. The **entire** pipeline is built (grounding, decision tiering for all statuses, queue, dashboard, apply-CLI, auto-publish, badge, retract, digest, launchd), but the only **candidate source wired is the discovery miner**, which emits `documentada` new promises. So in Phase 1 the exercised auto-publish row is `documentada`; the escalation rows exist in code but receive no candidates yet. Delivers: new promises flowing into the queue + auto-publishing daily.

### Phase 2 (sketched): status-change detection
Component 13. Wire the existing `promise-llm-inference.ts` miner (already Zod-bounded, already freeze-aware) as a **second candidate source** feeding the same pipeline. This activates the escalation rows: `en-progreso`/`parcial`/`cumplida` auto-publish, `no-ejecutada` fast-track. Deferred so the curator sees real Phase-1 behavior (and tunes the threshold) before the accusatory path goes live. Its own spec → plan → implement cycle.

---

## 10. Testing plan (TDD, RED→GREEN, per repo cadence)

- **`promise-grounding.test.ts`** — normalized-substring quote match (hit/miss), redirect resolution (mocked fetch), party/date sanity, fail-safe returns `grounded:false`.
- **`promise-auto-curate.test.ts`** — decision tiering (each status → correct path), threshold boundary (`0.699` → queue, `0.70` → auto/fast-track), dedup vs existing+queued+archived, freeze → empty output, `--no-auto-publish` forces all to queue.
- **`promise-draft.test.ts`** — queue-record validators (reject missing source, quote < 20, unknown enum, `inviable` proposedStatus).
- **`apply-promise-draft.test.ts`** — insert new promise → snapshot re-validates + contains it + carries `autoPublished`; reject → archived, absent from snapshot; retract → status/field reverted; freeze → non-zero exit, no write; non-V1 status without evidence → rejected.
- **`parse-promises.test.ts`** (edit) — relax V1-live assertion to evidence-gated; keep evidence gate; add `autoPublished` field validation.
- **`vite-curator-plugin` `__test`** (edit) — new action schemas + `buildArgv` cases + generalized commit allowlist (reject a non-allowlisted file).
- **E2E (light)** — `/curator` promise-queue section renders (dev-only); `/promesas` badge renders when `reviewState==='pending-review'`.

---

## 11. Rollout & safety valves

- **`--no-auto-publish` first.** Initial live runs force everything to the queue so the curator inspects real drafts + grounding results before enabling auto-publish. Flip on once trust is established.
- **Threshold + tier map are single-source config constants** — retune `AUTO_PUBLISH_MIN_CONFIDENCE` or move `parcial` to `fast-track` with a one-line change.
- **One-command revert.** Every auto-publish is a git commit touching only `promises.json`; `git revert` + `retract-promise` back it out.
- **Daily digest** surfaces what auto-published / fast-tracked / queued each run → the curator monitors false-positive + retract rates.

---

## 12. Non-goals (YAGNI for Phase 1)

- **No eval harness / gold-set accuracy measurement.** Gate is confidence + grounding (the chosen approach). An eval to calibrate the threshold is a possible future, not required.
- **No Telegram digest.** Digest is a local markdown file + launchd log; Telegram push is an easy later add (the bot already runs).
- **No Phase 2 status miner** (separate cycle).
- **No changes to the nightly `scrape:promise-suggestions` job** — the display-only suggestion engine stays as-is; the auto-curator is a separate daily agent.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM confidence uncalibrated (0.70 ≠ 70% correct) | Grounding is the real gate; accusatory verdicts require a human click; digest + retract-rate monitoring; `--no-auto-publish` rollout |
| Grounding flaky on RSS/Google-News redirect URLs | Resolve to publisher URL first; fail-safe drops ungroundable items to the queue (fewer auto-publishes, safe direction) |
| Schema change to a legally-material curated file | New field is optional + backward-compatible + validated; whole-snapshot re-validation on every write |
| Commit endpoint generalization widens write surface | Strict file allowlist `{pleno-findings.json, promises.json}`; existing origin-lock + zod + execFile guards unchanged |
| Auto-published error goes live | Public badge signals "revisión pendiente"; retract list + one-command git revert; daily digest |

---

## 14. Open questions

None blocking. Deferred to the implementation plan: exact digest markdown format, and whether `mark-reviewed` clears the badge in bulk or per-item (default: per-item).
