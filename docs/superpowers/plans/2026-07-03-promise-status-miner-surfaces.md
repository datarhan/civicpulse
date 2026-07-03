# Promise Status-Change Miner — Surfaces (Plan 2B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Repo model policy: dispatch subagents ONLY on Opus 4.8 (`opus`) or Fable 5 (`fable`).

**Goal:** Make the Plan-2A status-change drafts **viewable, approvable, and disclosed** in the `/curator` review flow.

**Architecture:** Four small, independent changes. (1) The `/curator` queue row renders `status-change` drafts (they currently fall through the `new-promise` layout and show blank). (2) The apply CLI gains an approve path for status-change drafts (today it refuses them). (3) The curator middleware's draft-id regex is widened to accept `dsc-…` ids (today it 400s them before the CLI runs). (4) `/metodologia` discloses status-change auto-curation. **Retract parity is out of scope** — nothing auto-publishes while the daily wrapper stays `--no-auto-publish`, so there is nothing to retract yet; the interim `removeAutoPublished` guard (Plan 2A) already prevents data loss.

**Tech Stack:** React 18 (inline-style components), Node CLI (`tsx`), a Vite dev middleware (zod-validated, argv-array execFile), Vitest + happy-dom.

## Global Constraints

- Branch `feat/promise-status-surfaces` off `main` (Plan 2A is merged at `89f5db1`).
- `promises.json` is the highest libel-risk file. The apply CLI's contract is unchanged: `read → validatePromisesSnapshot → mutate (pure helper) → re-validate → write`, refuses on LOREG freeze (exit 3). Approving a status-change draft is **human-approved** — it must NOT stamp `autoPublished` (that field marks *machine* publications). The Plan-2A `applyStatusChange` stale-transition guard stays in force (a stale queued draft → the CLI errors → dashboard surfaces it, non-zero exit).
- The middleware stays defense-in-depth: strict zod, argv-array execFile (no shell), commit allowlist scoped to `public/data/promises.json`. Widen the id regex to exactly `/^(?:dnp|dsc)-[a-z0-9-]{3,120}$/` — no broader.
- `/metodologia` is the published editorial contract, not marketing copy — update it because the pipeline's behavior changed.
- Vitest `globals:false`. Prettier + `npm run lint` + `npm run typecheck` clean. Existing suite (1293 pass/1 skip) stays green. Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW
  ```

---

## Task 1: Render `status-change` drafts in the curator queue row

**Files:** Modify `src/pages/curator/promise-queue.jsx`; Test `tests/promise-queue-row.test.jsx` (new).

**Context:** `PromiseDraftRow` currently assumes the new-promise shape (`const p = draft.proposed ?? {}`, then renders `p.party`/`p.title`/`p.quote`/`p.source`). A `status-change` draft has NO `proposed` — it has `promiseId`, `currentStatus`, `proposedStatus`, and a single `evidence` object (`{date,url,quote,publisher,kind,addedBy}`). Branch on `draft.kind` and render a status-change layout; keep the new-promise layout byte-identical.

- [ ] **Step 1: Failing test** — `tests/promise-queue-row.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PromiseDraftRow } from '../src/pages/curator/promise-queue'

const newDraft = {
  draftId: 'dnp-psoe-x', kind: 'new-promise', confidence: 0.8,
  grounding: { grounded: true }, decision: 'auto-publish',
  proposed: { party: 'PSOE', title: 'Carril bici', quote: 'Haremos un carril bici en la avenida', madeAt: '2026-06-20', source: { url: 'https://x/n', publisher: 'Levante' } },
}
const statusDraft = {
  draftId: 'dsc-psoe-obra-en-progreso-abc', kind: 'status-change', confidence: 0.85,
  grounding: { grounded: true }, decision: 'auto-publish',
  promiseId: 'psoe-obra', currentStatus: 'documentada', proposedStatus: 'en-progreso',
  evidence: { date: '2026-05-01', url: 'https://placsp/t1', quote: 'obra adjudicada por 240.000 €', publisher: 'PLACSP', kind: 'tender' },
}
const row = (draft) =>
  renderToStaticMarkup(
    <PromiseDraftRow draft={draft} onApprove={() => {}} onReject={() => {}} busy={false} />,
  )

describe('PromiseDraftRow', () => {
  it('renders a new-promise draft (title)', () => {
    expect(row(newDraft)).toContain('Carril bici')
  })

  it('renders a status-change draft (promiseId + proposed status + evidence, no blanks)', () => {
    const html = row(statusDraft)
    expect(html).toContain('psoe-obra')
    expect(html).toContain('en-progreso')
    expect(html).toContain('PLACSP')
    expect(html).not.toContain('undefined')
  })
})
```

- [ ] **Step 2: Run → FAIL** `npx vitest run tests/promise-queue-row.test.jsx` (status-change row renders `undefined`s / throws).

- [ ] **Step 3: Implement** — in `src/pages/curator/promise-queue.jsx`, add a `STATUS_TONE` map near `DECISION_TONE`:

```jsx
const STATUS_TONE = {
  documentada: 'neutral',
  'en-verificacion': 'neutral',
  'en-progreso': 'intel',
  parcial: 'warn',
  cumplida: 'ok',
}
```

Then, at the top of `PromiseDraftRow`, branch before the existing body:

```jsx
function PromiseDraftRow({ draft, onApprove, onReject, busy }) {
  if (draft.kind === 'status-change') {
    return (
      <StatusChangeDraftRow draft={draft} onApprove={onApprove} onReject={onReject} busy={busy} />
    )
  }
  const p = draft.proposed ?? {}
  // …existing new-promise body unchanged…
```

Add the `StatusChangeDraftRow` component (same card chrome + the same two action buttons as the new-promise row — extract the buttons inline; do NOT change the button markup/labels/handlers):

```jsx
function StatusChangeDraftRow({ draft, onApprove, onReject, busy }) {
  const ev = draft.evidence ?? {}
  const grounded = Boolean(draft.grounding?.grounded)
  return (
    <div style={{ padding: '12px 14px', border: '1px solid var(--border2)', borderRadius: 8, marginBottom: 10, background: 'var(--paper)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <Pill tone="intel">cambio de estado</Pill>
        <Pill tone={STATUS_TONE[draft.currentStatus] ?? 'neutral'}>{draft.currentStatus}</Pill>
        <span style={{ color: 'var(--ink50)' }}>→</span>
        <Pill tone={STATUS_TONE[draft.proposedStatus] ?? 'intel'}>{draft.proposedStatus}</Pill>
        <Pill tone={grounded ? 'ok' : 'warn'}>{grounded ? 'anclada' : 'sin anclar'}</Pill>
        {draft.decision && <Pill tone={DECISION_TONE[draft.decision] ?? 'neutral'}>{draft.decision}</Pill>}
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 11 }}>conf {Number(draft.confidence ?? 0).toFixed(2)}</span>
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginBottom: 4 }}>{draft.draftId}</div>
      <div style={{ fontSize: 13.5, marginBottom: 4 }}>
        Promesa: <span className="mono">{draft.promiseId}</span>
      </div>
      {ev.quote && (
        <div style={{ fontSize: 12, color: 'var(--ink60)', lineHeight: 1.4, marginBottom: 6 }}>«{String(ev.quote).slice(0, 180)}…»</div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {ev.url && (
          <ExtLink href={ev.url} style={{ fontSize: 11.5, color: 'var(--civic)', textDecoration: 'none' }}>
            Evidencia: {ev.publisher || ev.kind || 'fuente'} →
          </ExtLink>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => onApprove(draft.draftId)} disabled={busy} style={{ padding: '5px 12px', fontSize: 11.5, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--ink)', color: 'var(--paper)', borderRadius: 6, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Aplicando…' : 'Aprobar y aplicar'}
          </button>
          <button onClick={() => onReject(draft.draftId)} disabled={busy} style={{ padding: '5px 12px', fontSize: 11.5, border: '1px solid var(--border2)', background: 'var(--paper)', borderRadius: 6, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            Rechazar
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run → PASS** `npx vitest run tests/promise-queue-row.test.jsx` + `npm run lint`. (Pattern matches `tests/ext-link.test.jsx` — SSR `renderToStaticMarkup`, no DOM/Router needed; the row's children — `Pill`, `ExtLink`, `PartyChip`, buttons — are all SSR-safe.)

- [ ] **Step 5: Commit** `feat(curator): render status-change drafts in the review queue` (+ trailers). Stage `src/pages/curator/promise-queue.jsx` + the test.

---

## Task 2: Approve path for status-change drafts in the apply CLI

**Files:** Modify `scripts/apply-promise-draft.ts`.

**Context:** The default approve path currently does `if (draft.kind !== 'new-promise') { error; exit(1) }` (a Plan-2A guard). Replace it with a kind branch: status-change → `applyStatusChange` (human-approved, no `autoPublished`); new-promise → the existing `newPromiseFromDraft` + `insertPromise`.

- [ ] **Step 1: Add the import** — extend the `promise-apply` import:

```ts
import {
  newPromiseFromDraft,
  insertPromise,
  removeAutoPublished,
  setReviewState,
  tombstoneDraftFromPromise,
  applyStatusChange,
} from '../src/scraper/promise-apply'
```

- [ ] **Step 2: Replace the refuse block** — swap the current guard + tail (the `if (draft.kind !== 'new-promise') {…}` block through the final `console.log`) for:

```ts
  const snap = await readSnap()
  if (draft.kind === 'status-change') {
    // Human-approved: set the status + append the grounded evidence atomically
    // (V1 gate). No autoPublished stamp — that marks MACHINE publications only.
    // The stale-transition guard in applyStatusChange throws (non-zero exit) if
    // the promise moved since the draft was queued; the dashboard surfaces it.
    await writeSnap(applyStatusChange(snap, draft, now))
    await writeQueue(QUEUE, removeDraftFromQueue(queue, draftId))
    console.log(
      `[apply-promise-draft] applied status change "${draftId}" (${draft.promiseId} → ${draft.proposedStatus}, human-approved)`,
    )
    return
  }
  const promise = newPromiseFromDraft(draft, now) // no autoPublish meta → human-approved
  await writeSnap(insertPromise(snap, promise))
  await writeQueue(QUEUE, removeDraftFromQueue(queue, draftId))
  console.log(`[apply-promise-draft] published "${draftId}" as promise (human-approved)`)
```

(`readSnap()` — which validates + refuses on freeze — now runs before the kind branch; the previous version called it only on the new-promise path, so freeze protection now covers both, which is correct.)

- [ ] **Step 3: Verify — typecheck + manual round-trip.** `npm run typecheck` clean. Then a headless round-trip against a temp queue (no network, no LLM):

```bash
cd /Users/sergeilutchenko/Documents/CivicPulse
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('public/data/promises.json','utf8'));const t=p.items[0];console.log('seed promise id:',t.id,'status:',t.status)"
# Build a status-change draft targeting that promise's CURRENT status, write a temp queue:
PID=$(node -e "const p=require('./public/data/promises.json');console.log(p.items[0].id)")
ST=$(node -e "const p=require('./public/data/promises.json');console.log(p.items[0].status)")
node -e "const fs=require('fs');const now=new Date().toISOString();const d={version:'1.0',generatedAt:now,drafts:[{draftId:'dsc-manual-test-abc',kind:'status-change',requiresHumanApproval:true,confidence:0.9,grounding:{grounded:true,urlResolved:true,quoteFound:true,checkedAt:now},decision:'fast-track',promiseId:process.env.PID,currentStatus:process.env.ST,proposedStatus:'en-progreso',evidence:{date:'2026-05-01',url:'https://contrataciondelestado.es/deeplink',quote:'obra adjudicada por doscientos cuarenta mil euros',publisher:'PLACSP',kind:'tender',addedBy:'auto-curation-v1'},reasoning:[],generatedAt:now}]};fs.mkdirSync('editorial',{recursive:true});fs.writeFileSync('editorial/promise-review-queue.json',JSON.stringify(d,null,2))" 
git stash push -- public/data/promises.json 2>/dev/null; cp public/data/promises.json /tmp/promises.before.json
PID=$PID ST=$ST npm run apply-promise-draft -- dsc-manual-test-abc
node -e "const p=require('./public/data/promises.json');const t=p.items.find(x=>x.id===process.env.PID);console.log('after:',t.status, 'evidence+1?', t.evidence.length, 'autoPublished(null expected):', t.autoPublished ?? null)"
# EXPECT: status 'en-progreso', an appended tender evidence, autoPublished null (human-approved). Then RESTORE:
git checkout public/data/promises.json; rm -f editorial/promise-review-queue.json
```
Confirm the restore leaves `git status` clean on `public/data/promises.json`. Report the before/after.

- [ ] **Step 4: Commit** `feat(curator): apply-promise-draft applies status-change drafts (human-approved)` (+ trailers). Stage `scripts/apply-promise-draft.ts` only.

---

## Task 3: Widen the curator middleware draft-id regex to accept `dsc-`

**Files:** Modify `vite-curator-plugin.js`.

**Context:** The `apply-promise-draft` and `reject-promise-draft` zod schemas validate `draftId` against `/^dnp-[a-z0-9-]{3,120}$/`. Status-change ids are `dsc-…` (`makeStatusDraftId`), so the middleware 400s them before the CLI runs. Widen exactly these promise-**draft** id regexes to `/^(?:dnp|dsc)-[a-z0-9-]{3,120}$/`. Do NOT touch the `retract-promise` / `mark-reviewed-promise` schemas (those take a `promiseId`, not a draftId).

- [ ] **Step 1: Locate** — `grep -n "dnp-\[a-z0-9" vite-curator-plugin.js`. Expect the `apply-promise-draft` schema (~line 279) and the `reject-promise-draft` schema. Read each in context to confirm it's a `draftId` field.

- [ ] **Step 2: Widen** — for each promise-draft `draftId` regex, replace `/^dnp-[a-z0-9-]{3,120}$/` with `/^(?:dnp|dsc)-[a-z0-9-]{3,120}$/`. Leave everything else (argv builder, execFile, commit allowlist) untouched.

- [ ] **Step 3: Verify** — `npm run lint` clean, and a one-liner proving both prefixes pass and a bad one still fails:
```bash
node -e "const re=/^(?:dnp|dsc)-[a-z0-9-]{3,120}$/; console.log('dnp:',re.test('dnp-psoe-abc'),'dsc:',re.test('dsc-psoe-obra-en-progreso-abc'),'evil:',re.test('../x'))"
# EXPECT: dnp: true dsc: true evil: false
```
(The plugin file isn't in the vitest tree; the regex is a plain literal — the node check is sufficient. If the repo has a middleware test, run it.)

- [ ] **Step 4: Commit** `fix(curator): accept dsc- (status-change) draft ids in apply/reject middleware` (+ trailers). Stage `vite-curator-plugin.js` only.

---

## Task 4: Disclose status-change auto-curation on `/metodologia`

**Files:** Modify `src/pages/Metodologia.jsx`.

**Context:** The `#auto-curacion-promesas` Card (~lines 176-207) already says "propone promesas nuevas y cambios de estado" but never explains the status-change half. Add one paragraph + one bullet so the editorial contract matches the shipped pipeline. Match the existing inline-style pattern exactly (`<p style={{ margin: '8px 0 0', color: 'var(--ink70)' }}>`, `<li>`).

- [ ] **Step 1: Add a paragraph** — immediately AFTER the existing intro `<p>…espera revisión humana en cola.</p>` (before the `<ul>`), insert:

```jsx
        <p style={{ margin: '8px 0 0', color: 'var(--ink70)' }}>
          Los <em>cambios de estado</em> sobre promesas ya publicadas se infieren de licitaciones y
          adjudicaciones (PLACSP), subvenciones (BDNS), el presupuesto municipal y la prensa. Un
          avance a «en progreso» se auto-publica cuando supera el umbral (≥0,70) y queda anclado a
          una fila real de esas fuentes; «parcial» y «cumplida» nunca se auto-publican —{' '}
          quedan a un solo clic humano. Cada cambio sólo puede <em>avanzar</em> una promesa, nunca
          revertirla, y adjunta la evidencia citada en la propia ficha.
        </p>
```

- [ ] **Step 2: Add a bullet** — inside the existing `<ul>`, after the "no ejecutada" bullet, add:

```jsx
          <li>
            El anclaje de un cambio de estado demuestra que la licitación o la noticia existe, no
            que corresponda exactamente a la promesa; por eso un avance a «cumplida» siempre lo
            confirma una persona.
          </li>
```

- [ ] **Step 3: Verify** — `npm run lint` + `npm run build` (the page must compile). If the e2e suite has a `/metodologia` spec (`tests/e2e/metodologia.spec.ts`), it should still pass (`npx playwright test metodologia` is optional — the build check is the gate here).

- [ ] **Step 4: Commit** `docs(metodologia): disclose status-change auto-curation` (+ trailers). Stage `src/pages/Metodologia.jsx` only.

---

## Done criteria (Plan 2B)
- `npm test` green (Task 1 adds a render test); `npm run typecheck` + `npm run lint` clean; `npm run build` succeeds.
- A `dsc-…` status-change draft: renders correctly in the `/curator` queue (current→proposed + evidence), passes the middleware regex, and `apply-promise-draft -- <dsc-id>` sets the promise's status + appends the grounded evidence (human-approved, no `autoPublished`), re-validating clean.
- `/metodologia` discloses status-change auto-curation.

## Explicitly deferred (not in 2B)
- **Retract parity** for auto-published status changes (revert status + drop appended evidence) — needs a `priorStatus` on `autoPublished` and only matters once the daily wrapper drops `--no-auto-publish`. Build it in go-live prep.
- Engine Minors from the 2A final review (structured-row quote literal check; queue re-validation before write; miner rejection-stat surfacing).
