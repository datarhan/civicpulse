# Promise Auto-Curator — Surfaces & Activation (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Model policy for this repo: dispatch subagents ONLY on Opus 4.8 (`opus`) or Fable 5 (`fable`) — never sonnet/haiku.

**Goal:** Make the Plan-A promise auto-curator engine safe and usable to ACTIVATE — the public "auto-published · pending review" badge, the `/metodologia` + `/aviso-legal` disclosure (reconciling copy the engine now contradicts), a grounding-fetch fix so real press URLs actually ground, the `/curator` review dashboard + its middleware, and the daily launchd agent.

**Architecture:** Additive UI + disclosure changes to the existing SPA (inline-styles + `Card`/`SectionHead`/`Pill` primitives), a dev-only Vite middleware extension for the review queue, and a launchd agent mirroring the existing `auto-curate` one. No change to the Plan-A engine except a self-contained grounding-fetch hardening.

**Tech Stack:** React 18 (inline styles), Vite dev middleware (`vite-curator-plugin.js`, zod-guarded), Vitest + Playwright e2e, launchd.

## Global Constraints

- Dispatch subagents ONLY on `opus` or `fable`.
- The queue file `editorial/promise-review-queue.json` is LOCAL-ONLY/gitignored — the dashboard reads it through a NEW dev-only `GET /api/curator/promise-queue` endpoint, never a `public/data` fetch. Unreviewed party attributions never leave the laptop.
- Every `promises.json` write still goes through `apply-promise-draft` (read→validate→mutate→re-validate→write, freeze fail-closed). The dashboard only INVOKES that CLI via the allowlisted middleware; it never writes the file directly.
- Disclosure is a libel-defense artifact: `/metodologia` + `/aviso-legal` must be internally consistent after the change — amend the statements the engine now contradicts, don't just append.
- Badge tone: reuse `intel` (the file's existing auto/LLM convention). Only render for `autoPublished.reviewState === 'pending-review'`.
- Prettier + `npm run lint` + `npm run typecheck` clean. Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NSpbEjBP9q4wRcj4dWePZW
  ```
- Work on a branch `feat/promise-auto-curator-planb` off `main`.

---

## Task 1: Grounding-fetch hardening (Mozilla UA + follow redirects)

**Files:** Modify `src/scraper/promise-grounding.ts`; Test `tests/parse-promise-grounding.test.ts` (extend).

**Why:** Final review #2 — bare `fetch(url)` sends no UA and doesn't resolve redirects, so `ribarroja.es` (WAF needs a Mozilla-leading UA) and most press URLs never ground → auto-publish is inert. This adds the UA + `redirect:'follow'` to the DEFAULT fetch only; injected test stubs are unaffected.

- [ ] **Step 1: Failing test** — add to `tests/parse-promise-grounding.test.ts`:

```ts
import { defaultGroundingFetch, MOZILLA_UA } from '../src/scraper/promise-grounding'

describe('promise-grounding — default fetch UA', () => {
  it('defaultGroundingFetch sends a Mozilla-leading UA and follows redirects', async () => {
    let seenInit: RequestInit | undefined
    const realFetch = globalThis.fetch
    // @ts-expect-error test stub
    globalThis.fetch = async (url: string, init?: RequestInit) => {
      seenInit = init
      return { ok: true, url, text: async () => '<p>ok</p>' } as unknown as Response
    }
    try {
      await defaultGroundingFetch('https://ribarroja.es/x')
    } finally {
      globalThis.fetch = realFetch
    }
    expect(MOZILLA_UA.startsWith('Mozilla/5.0')).toBe(true)
    expect((seenInit?.headers as Record<string, string>)['User-Agent']).toBe(MOZILLA_UA)
    expect(seenInit?.redirect).toBe('follow')
  })
})
```

- [ ] **Step 2: Run → FAIL** (`defaultGroundingFetch`/`MOZILLA_UA` not exported): `npx vitest run tests/parse-promise-grounding.test.ts`

- [ ] **Step 3: Implement** — in `src/scraper/promise-grounding.ts`, add above `groundDraft`:

```ts
export const MOZILLA_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 CivicPulse/1.0 (+https://civicpulse.es)'

/** Default fetch used by groundDraft: Mozilla-leading UA (clears the
 *  ribarroja.es WAF) + follow redirects (resolves publisher URLs). */
export const defaultGroundingFetch: FetchLike = (url) =>
  fetch(url, { headers: { 'User-Agent': MOZILLA_UA }, redirect: 'follow' }) as unknown as ReturnType<FetchLike>
```

Change `groundDraft`'s default param from `fetchImpl: FetchLike = fetch as unknown as FetchLike` to `fetchImpl: FetchLike = defaultGroundingFetch`.

- [ ] **Step 4: Run → PASS** + `npm run typecheck`.

- [ ] **Step 5: Commit** `feat(promesas): grounding fetch sends Mozilla UA + follows redirects` (+ trailers). Stage the two grounding files.

*Note (defer to a follow-up, not this task): Google-News RSS wrapper URLs (`news.google.com/rss/...`) still won't resolve server-side; those press rows fail safe to the queue. A future enhancement can prefer official/infoturia direct-URL rows for auto-publish.*

---

## Task 2: Public `autoPublished` badge on `PromiseCard`

**Files:** Modify `src/pages/Promesas.jsx` (`PromiseCard`, lines 134–396). E2E: `tests/e2e/promesas.spec.ts` (extend if present).

**Why:** Spec §Visibility — an auto-published promise must visibly read "publicada automáticamente · revisión pendiente" until a curator reviews it.

- [ ] **Step 1: Implement** — `PromiseCard` already renders a status `Pill` inside the flex row at lines 188–200 (`import { Card, Pill, ExtLink } from '../components/Primitives'`). Immediately AFTER the closing `</Pill>` on line 199 (still inside the `display:flex; gap:10; alignItems:center` row), add:

```jsx
        {p.autoPublished?.reviewState === 'pending-review' && (
          <Pill tone="intel" size="xs">
            publicada automáticamente · revisión pendiente
          </Pill>
        )}
```

No other change; `p` is already the destructured prop and `Pill`/`intel` are already available.

- [ ] **Step 2: Verify render** — start the dev server (`npm run dev`) is not required for CI; add/extend a Playwright assertion in `tests/e2e/promesas.spec.ts`: if any promise in `public/data/promises.json` has `autoPublished.reviewState === 'pending-review'`, assert the text `revisión pendiente` is visible on `/promesas`; otherwise assert the badge is absent (guard so the test is honest when no auto-published promise exists yet). Run `npm run test:e2e -- promesas` (or the project's e2e invocation) if the environment supports it; otherwise `npm run build` to confirm the JSX compiles.

- [ ] **Step 3: Commit** `feat(promesas): public "publicada automáticamente · revisión pendiente" badge on PromiseCard` (+ trailers).

---

## Task 3: Disclosure reconciliation — `/metodologia` + `/aviso-legal`

**Files:** Modify `src/pages/Metodologia.jsx` and `src/pages/AvisoLegal.jsx`. (These are the published editorial contract — this is the libel gate.)

**Why:** Final review #3 + exploration: existing copy now CONTRADICTS the engine. Amend the contradictions AND add a disclosure section, in both files' existing `<Card><SectionHead eyebrow title /><p>…</p></Card>` style (`import { Card, SectionHead } from '../components/Primitives'`).

- [ ] **Step 1: Amend contradicting statements in `src/pages/Metodologia.jsx`**
  - Lines ~43–53 (principles 3 & 4) currently assert "Sólo un curador humano puede subir un estado a cumplida/parcial/no-ejecutada/inviable" and proposals "nunca sustituyen al estado publicado". Reword to the accurate new policy: **automated publication is now possible for non-accusatory verdicts above the confidence+grounding bar, marked with the "revisión pendiente" badge; `no-ejecutada` requires one human click; `inviable` remains human-only.** Keep the wording precise and non-marketing.
  - Lines ~143–147 ("No publica cambios de estado sin aprobación humana… No propone nunca cumplida, no-ejecutada ni inviable"): reword to describe the auto-curator's actual gate (confidence ≥0.70 AND deterministic grounding; `no-ejecutada` fast-track; `inviable` human-only).
  - Bump the "Última revisión" footer (lines ~556–560) to today's date.

- [ ] **Step 2: Add the disclosure section in `Metodologia.jsx`** — insert AFTER line 158 (after the "Qué NO hace el motor automático" Card), before the `id="plazos-vencidos"` Card at line 160:

```jsx
      <Card style={{ marginTop: 14 }} id="auto-curacion-promesas">
        <SectionHead
          eyebrow="Auto-curación · /promesas"
          title="Cómo se auto-publican promesas (y qué nunca se auto-publica)"
        />
        <p style={{ margin: '8px 0 0', color: 'var(--ink70)' }}>
          Un proceso diario propone promesas nuevas y cambios de estado a partir de fuentes
          públicas (prensa, plenos) usando un modelo de lenguaje. Cada propuesta pasa por una
          verificación determinista de anclaje: la URL de la fuente debe resolver y la cita
          textual debe aparecer literalmente en ella. Sólo se publica automáticamente lo que
          supera un umbral de confianza (≥0,70) <em>y</em> queda anclado; el resto espera revisión
          humana en cola.
        </p>
        <ul style={{ margin: '10px 0 0', paddingLeft: 20, color: 'var(--ink70)' }}>
          <li>Lo auto-publicado se marca en su ficha con «publicada automáticamente · revisión pendiente» hasta que un curador lo revisa.</li>
          <li>Un veredicto de «no ejecutada» (incumplimiento) nunca se auto-publica: queda como propuesta lista para publicar con un solo clic humano.</li>
          <li>El estado «inviable» es siempre exclusivamente humano.</li>
          <li>Durante el periodo electoral (LOREG art. 50) el proceso se detiene por completo: no propone ni publica nada.</li>
          <li>El anclaje demuestra que la <em>fuente</em> existe, no que una inferencia acusatoria sea correcta; por eso los veredictos de incumplimiento mantienen a una persona en el bucle.</li>
        </ul>
      </Card>
```

- [ ] **Step 3: Amend + add in `src/pages/AvisoLegal.jsx`**
  - Confirm/adjust line ~83 (LOREG card: "El motor de sugerencias sigue ejecutándose cada noche pero no aplica cambios de estado") so it also states the confidence-gated auto-publisher is likewise suspended during the freeze.
  - Insert AFTER line 95 (after the LOREG card), before the "Privacidad" card, a `<Card style={{ marginTop: 14 }}>` + `<SectionHead eyebrow="Auto-curación" title="Publicación automática con revisión" />` + a `<p>` summarizing: automated publication of non-accusatory, source-anchored promise records above the confidence bar, each marked for pending human review and retractable; accusatory verdicts and `inviable` stay human-gated; the process halts during the LOREG freeze.
  - Bump the "Versión vigente" footer (lines ~222–225) to today's date.

- [ ] **Step 4: Verify** — `npm run build` (JSX compiles) + reread both files for internal consistency (no remaining sentence claims "never auto-publishes"). Optionally `npm run test:e2e -- metodologia aviso-legal` if supported.

- [ ] **Step 5: Commit** `docs(promesas): reconcile /metodologia + /aviso-legal with auto-curation (disclosure + amend contradicting copy)` (+ trailers).

---

## Task 4: Middleware — promise-queue read endpoint + apply actions + commit allowlist

**Files:** Modify `vite-curator-plugin.js`. Test `tests/vite-curator-plugin.test.ts` (extend the existing `__test` coverage).

**Why:** The dashboard needs to (a) READ the local-only queue, (b) run `apply-promise-draft` with its 4 subcommands, and (c) commit `promises.json`. Mirror the existing `handleVoiceprintsRead` (local-file GET) + `ActionSchemas`/`buildArgv` + generalize `handleCommit`.

- [ ] **Step 1: Add a GET endpoint** `GET /api/curator/promise-queue` mirroring `handleVoiceprintsRead` (dev-only, origin-checked): read `editorial/promise-review-queue.json` (+ `editorial/promise-review-archive.json`) from `cwd`, return `{ generatedAt, drafts, archivedCount }` (empty `drafts:[]` when the file is absent). Register it in `configureServer` next to the `/api/curator/voiceprints` mount.

- [ ] **Step 2: Add actions to `ActionSchemas` + `buildArgv`** — four zod schemas + argv builders mapping to `npm run apply-promise-draft`:
  - `apply-promise-draft` → args `{ draftId: z.string().regex(/^dnp-[a-z0-9-]{3,120}$/) }` → `['run','apply-promise-draft','--', draftId]`
  - `reject-promise-draft` → `{ draftId, reason?: SafeStringShort }` → `['run','apply-promise-draft','--','--reject', draftId, ...(reason?[reason]:[])]`
  - `retract-promise` → `{ promiseId: z.string().regex(/^[a-z0-9-]{3,80}$/) }` → `['run','apply-promise-draft','--','--retract', promiseId]`
  - `mark-reviewed-promise` → `{ promiseId }` → `['run','apply-promise-draft','--','--mark-reviewed', promiseId]`
  Keep the strict/`SHELL_METACHAR_RE`/length guards consistent with the existing schemas.

- [ ] **Step 3: Generalize `handleCommit`** — currently hard-codes `git add public/data/pleno-findings.json` (line ~567). Accept an optional `files` array in the body validated against a small ALLOWLIST `['public/data/pleno-findings.json','public/data/promises.json']`; default to `['public/data/pleno-findings.json']` for back-compat. Stage each allowlisted file. Reject any file not on the allowlist.

- [ ] **Step 4: Extend `tests/vite-curator-plugin.test.ts`** — assert the four new `ActionSchemas` accept valid args + reject shell-metachar/bad-id, `buildArgv` produces the expected argv arrays, and the commit allowlist rejects a non-allowlisted path. Run the file.

- [ ] **Step 5: Commit** `feat(curator): promise-queue read endpoint + apply-promise-draft actions + commit allowlist for promises.json` (+ trailers). Stage `vite-curator-plugin.js` + its test.

---

## Task 5: `/curator` dashboard — promise review section

**Files:** Create `src/pages/curator/promise-queue.jsx`; Modify `src/pages/Curator.jsx`. Uses `useJsonResource`, `callCurator`, `callCommit`, `PartyChip` from `./curator/shared`.

**Why:** The click-through review surface. Mirror the existing Contradicho-queue section (Card + SectionHead + Refresh + rows) but read the NEW endpoint and drive the four apply actions.

- [ ] **Step 1: Create `src/pages/curator/promise-queue.jsx`** — a `PromiseDraftRow` component (mirror `ContradichoBundleRow` in `curator/queues.jsx`): renders `PartyChip`, the proposed `title`, a `«quote…»` snippet, a `confidence` mono value, a grounding indicator (`grounding.grounded ? 'anclada' : 'sin anclar'` Pill: tone `ok`/`warn`), and a `decision` Pill (`auto-publish`/`fast-track`/`queue`). Props: `{ draft, onApprove, onReject }`. Buttons call the handlers; disable while running. Export `PromiseDraftRow`.

- [ ] **Step 2: Wire a section into `Curator.jsx`** — mirror the Contradicho section (Card + `<SectionHead title="Promesas · cola de revisión" />` + a Refresh button + loading/error/empty states + map rows). Read via `useJsonResource('/api/curator/promise-queue')`; unpack `data?.drafts ?? []`. Handlers:
  - Approve: `await callCurator('apply-promise-draft', { draftId })`; on `ok && exitCode===0` → `await callCommit('data: publish promise ' + draftId, ['public/data/promises.json'])` then `refresh()`.
  - Reject: `await callCurator('reject-promise-draft', { draftId })` → `refresh()` (no commit; queue+archive are local).
  Sort fast-track drafts first (they're "listo para publicar"). Add the section import + placement next to the existing sections.

- [ ] **Step 3: Verify** — `npm run build`; the `/curator` route is dev-only (tree-shaken from prod). If e2e supports a dev-mode curator spec, assert the section renders an empty-state when the queue is absent; otherwise manual note in the report.

- [ ] **Step 4: Commit** `feat(curator): promesas review-queue section (approve/reject/retract)` (+ trailers). Stage the new file + `Curator.jsx`.

---

## Task 6: Daily launchd agent

**Files:** Create `scripts/com.civicpulse.auto-curate-promises.plist`, `scripts/auto-curate-promises-daily.sh`, `scripts/launchd-install-auto-curate-promises.sh`. Mirror the existing `com.civicpulse.auto-curate.plist` + `auto-curate-weekly.sh` + `launchd-install-auto-curate.sh`.

**Why:** Refresh the review queue daily. **Rollout-safe default: `--no-auto-publish`** until the curator has watched real drafts; flip the flag to enable auto-publish once trusted.

- [ ] **Step 1: `auto-curate-promises-daily.sh`** — mirror `auto-curate-weekly.sh`: source `.env`, `git pull --rebase --autostash origin main`, set `LLM_BACKEND=gemini` (fallback chain handles failures), run `npm run auto-curate-promises -- --max 10 --no-auto-publish`. Because `--no-auto-publish` writes only the gitignored queue, the script commits NOTHING by default (add a commented-out block showing how to stage+commit `public/data/promises.json` when auto-publish is later enabled). Log to `scripts/logs/auto-curate-promises.{out,err}.log`.

- [ ] **Step 2: `com.civicpulse.auto-curate-promises.plist`** — mirror the existing plist: new `Label` `com.civicpulse.auto-curate-promises`, `StartCalendarInterval` with `Hour`/`Minute` only (DAILY — e.g. Hour 8, Minute 30), `ProgramArguments` → `/bin/bash …/scripts/auto-curate-promises-daily.sh`, `WorkingDirectory` repo root, homebrew `PATH`, `StandardOut/ErrorPath` to the log files.

- [ ] **Step 3: `launchd-install-auto-curate-promises.sh`** — mirror `launchd-install-auto-curate.sh`: copy the plist to `~/Library/LaunchAgents/`, `launchctl load`; support `uninstall`.

- [ ] **Step 4: Verify** — `bash -n` syntax-check all three scripts; `plutil -lint` the plist. Do NOT actually `launchctl load` in CI. Report the commands the user runs to install.

- [ ] **Step 5: Commit** `feat(promesas): daily launchd agent for the auto-curator (no-auto-publish rollout default)` (+ trailers).

---

## Done criteria (Plan B)
- Grounding sends a Mozilla UA + follows redirects (real ribarroja.es/direct URLs can ground).
- `/promesas` renders the pending-review badge; `/metodologia` + `/aviso-legal` are internally consistent and disclose the auto-publisher.
- `/curator` has a working promises review section reading the local-only queue via the new endpoint and driving the apply CLI; commit endpoint allowlists `promises.json`.
- launchd agent installs and runs `--no-auto-publish` daily.
- `npm test` + `npm run typecheck` + `npm run lint` green.

## Activation checklist (AFTER Plan B merges — the user's call)
1. Watch a few days of `--no-auto-publish` queue output; spot-check grounding.
2. Flip the launchd script to allow auto-publish (remove `--no-auto-publish`, enable the commit block).
3. First production auto-publish run happens only after 1+2 and with the badge + disclosure live (both land in this plan).
4. Phase 2 (status-change miner + agenda matching + evidence attachment so non-V1 statuses pass the V1 gate) is a separate spec.
