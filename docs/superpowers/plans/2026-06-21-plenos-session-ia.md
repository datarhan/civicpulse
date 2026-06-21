# /plenos Per-Session IA Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ~14k px `/plenos` mega-scroll with a lean session index that links to a new per-session detail page (`/plenos/:id`) bundling that session's agenda, votes, declarations, findings, video, and transcript.

**Architecture:** The index reads only the claim **manifest** (per-pleno counts) + findings/agendas; the detail reads a **single chunk**. The gated, signal-first `ClaimLedger` is reused (filtered to one session) via a new `items` prop. Cross-session claims dedupe to the existing `/declaraciones`; findings dedupe to `/hallazgos`.

**Tech Stack:** React 18 (inline-style components), React Router 6, Vite, Vitest + happy-dom, Playwright e2e.

## Global Constraints

- Reuse, don't rebuild: per-session declarations use `<ClaimLedger items={…} />` (gated client-side via `gateForDisplay` + `sortSignalFirst`). `/declaraciones` and `/departamentos` keep using `usePlenoClaims` (untouched).
- `/plenos/:id` route MUST be added after `/plenos` and before the `path="*"` catch-all in `src/App.jsx`.
- Add a representative `/plenos/:id` to a11y `STRICT_ROUTES` in `tests/e2e/a11y.spec.ts`.
- Chrome strings go through `src/i18n.jsx` (es + ca); data content stays verbatim.
- Honest empty states everywhere (no fabricated content; "sin … publicado/registrado").
- Commit after each green step. Run `npm run typecheck` + `npx prettier --write` before each commit.
- Data joins (verified live): manifest descriptor `{plenoId, plenoDate, byVerdict, toggleCount, itemCount}`; chunk `{plenoId, items}`; findings/votes carry `plenoId`; agendas keyed by `id` with `agenda[]`/`agendaCount`; `indexVideosByPleno(videos, plenos)` → Map by pleno id.

---

### Task 1: Claim manifest + single-chunk hooks

**Files:**
- Modify: `src/hooks/usePlenoClaims.js` (append two hooks; keep `usePlenoClaims` unchanged)
- Test: `tests/use-pleno-claims-hooks.test.js` (create)

**Interfaces:**
- Consumes: `useJsonFetch(path, fallback)` from `src/hooks/useJsonFetch.js` → `{loading, error, data}`.
- Produces:
  - `usePlenoClaimsManifest()` → `{loading, error, data}` where `data = {plenos: descriptor[], totals}` (404 → `{plenos: [], totals: {items:0, byVerdict:{}}}`).
  - `usePlenoChunk(plenoId)` → `{loading, error, data}` where `data = {items: VerifiedClaimItem[]}` (404 or empty id → `{items: []}`).

- [ ] **Step 1: Write the failing test**

```js
// tests/use-pleno-claims-hooks.test.js
import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { installFetchMock } from './setup/mockFetch'
import { usePlenoClaimsManifest, usePlenoChunk } from '../src/hooks/usePlenoClaims'

describe('usePlenoClaimsManifest', () => {
  it('returns the manifest plenos descriptors', async () => {
    installFetchMock({
      '/data/pleno-claims/index.json': {
        plenos: [{ plenoId: 'a', byVerdict: { verificado: 2 } }],
        totals: { items: 2 },
      },
    })
    const { result } = renderHook(() => usePlenoClaimsManifest())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data.plenos[0].plenoId).toBe('a')
  })

  it('falls back to empty on 404', async () => {
    installFetchMock({}) // unknown path → 404
    const { result } = renderHook(() => usePlenoClaimsManifest())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data.plenos).toEqual([])
  })
})

describe('usePlenoChunk', () => {
  it('fetches the chunk for the given plenoId', async () => {
    installFetchMock({
      '/data/pleno-claims/k4olcs.json': { plenoId: 'k4olcs', items: [{ claim: { id: 'x' } }] },
    })
    const { result } = renderHook(() => usePlenoChunk('k4olcs'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data.items).toHaveLength(1)
  })

  it('falls back to empty items on 404', async () => {
    installFetchMock({}) // unknown path → 404
    const { result } = renderHook(() => usePlenoChunk('missing'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data.items).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/use-pleno-claims-hooks.test.js`
Expected: FAIL — `usePlenoClaimsManifest`/`usePlenoChunk` are not exported.

- [ ] **Step 3: Implement the hooks**

Append to `src/hooks/usePlenoClaims.js`:

```js
import { useJsonFetch } from './useJsonFetch'

const EMPTY_MANIFEST = { plenos: [], totals: { items: 0, byVerdict: {} } }
const EMPTY_CHUNK = { items: [] }

/** Per-pleno claim descriptors (counts only) — light index-page source. */
export function usePlenoClaimsManifest() {
  return useJsonFetch('/data/pleno-claims/index.json', EMPTY_MANIFEST)
}

/** One pleno's verified claims — light detail-page source. */
export function usePlenoChunk(plenoId) {
  return useJsonFetch(
    plenoId ? `/data/pleno-claims/${plenoId}.json` : '/data/pleno-claims/__none__.json',
    EMPTY_CHUNK,
  )
}
```

(The `__none__` path 404s → `EMPTY_CHUNK`, so a missing id is handled.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/use-pleno-claims-hooks.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npx prettier --write src/hooks/usePlenoClaims.js tests/use-pleno-claims-hooks.test.js
git add src/hooks/usePlenoClaims.js tests/use-pleno-claims-hooks.test.js
git commit -m "feat(plenos): manifest + single-chunk claim hooks for the per-session IA

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `pleno-summary` index-row builder

**Files:**
- Create: `src/lib/pleno-summary.js`
- Test: `tests/pleno-summary.test.js`

**Interfaces:**
- Produces: `summarizeSessions({ plenos, manifestPlenos, findings, agendas }) → Row[]` where
  `Row = { id, date, title, kind, link, agendaCount, verificado, contradicho, findings }`,
  sorted by `date` descending.

- [ ] **Step 1: Write the failing test**

```js
// tests/pleno-summary.test.js
import { describe, it, expect } from 'vitest'
import { summarizeSessions } from '../src/lib/pleno-summary'

const input = {
  plenos: [
    { id: 'a', date: '2026-01-10', title: 'Sesión A', kind: 'ordinario', link: 'http://a' },
    { id: 'b', date: '2026-04-20', title: 'Sesión B', kind: 'urgente', link: 'http://b' },
  ],
  manifestPlenos: [{ plenoId: 'b', byVerdict: { verificado: 3, contradicho: 1, 'sin-datos': 9 } }],
  findings: [{ plenoId: 'b' }, { plenoId: 'b' }, { plenoId: 'zz' }],
  agendas: [{ id: 'b', agendaCount: 12 }],
}

describe('summarizeSessions', () => {
  it('joins counts and sorts newest-first', () => {
    const rows = summarizeSessions(input)
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']) // newest first
    const b = rows[0]
    expect(b).toMatchObject({ agendaCount: 12, verificado: 3, contradicho: 1, findings: 2 })
  })

  it('yields zero counts for sessions with no claims/agenda/findings', () => {
    const a = summarizeSessions(input).find((r) => r.id === 'a')
    expect(a).toMatchObject({ agendaCount: 0, verificado: 0, contradicho: 0, findings: 0 })
  })

  it('tolerates missing inputs', () => {
    expect(summarizeSessions({ plenos: [] })).toEqual([])
    expect(summarizeSessions({})).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/pleno-summary.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/lib/pleno-summary.js
// @ts-check
/**
 * Build the /plenos index rows: one per session with cheap signal counts,
 * joined from the claim manifest (per-pleno byVerdict), findings, and agendas.
 * Pure — no I/O. Newest session first.
 */
export function summarizeSessions({ plenos = [], manifestPlenos = [], findings = [], agendas = [] } = {}) {
  const verdictById = new Map()
  for (const d of manifestPlenos) verdictById.set(d.plenoId, d.byVerdict || {})
  const agendaCountById = new Map()
  for (const a of agendas) agendaCountById.set(a.id, a.agendaCount || 0)
  const findingsById = new Map()
  for (const f of findings) findingsById.set(f.plenoId, (findingsById.get(f.plenoId) || 0) + 1)

  return plenos
    .map((p) => {
      const v = verdictById.get(p.id) || {}
      return {
        id: p.id,
        date: p.date,
        title: p.title,
        kind: p.kind,
        link: p.link,
        agendaCount: agendaCountById.get(p.id) || 0,
        verificado: v.verificado || 0,
        contradicho: v.contradicho || 0,
        findings: findingsById.get(p.id) || 0,
      }
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/pleno-summary.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npx prettier --write src/lib/pleno-summary.js tests/pleno-summary.test.js
git add src/lib/pleno-summary.js tests/pleno-summary.test.js
git commit -m "feat(plenos): pure pleno-summary index-row builder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `ClaimLedger` gains an `items` prop; remove the cross-session controls

**Files:**
- Modify: `src/components/ClaimLedger.jsx`
- Modify: `src/pages/Plenos.jsx` (drop `controls` from the `ClaimLedgerSection` call — that whole section is removed in Task 6, but to keep the tree compiling between tasks, leave the call but remove `controls`; Task 6 deletes it)
- Test: `tests/claim-ledger-items.test.jsx` (create)

**Interfaces:**
- Consumes: `gateForDisplay`, `sortSignalFirst` from `src/lib/claim-ledger.js`.
- Produces: `ClaimLedger({ filter, limit, emptyHint, items })` — when `items` is provided, it renders those (gated + signal-sorted) instead of calling `usePlenoClaims`. `LedgerControls`/`VerdictChip`/`controls` prop removed.

- [ ] **Step 1: Write the failing test**

```jsx
// tests/claim-ledger-items.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClaimLedger } from '../src/components/ClaimLedger'

const item = (verdict, verbatim, type = 'afirmacion_numerica') => ({
  visibility: verdict === 'sin-datos' ? 'toggle' : 'shown',
  claim: { id: verbatim, type, plenoId: 'p', plenoDate: '2026-04-20', verbatim, entities: {}, speakerGroup: 'PP' },
  verification: { verdict, summary: 's', evidence: [], checkedAgainst: [] },
})

describe('ClaimLedger items prop', () => {
  it('renders passed items (gated + signal-first) without fetching', () => {
    render(
      <MemoryRouter>
        <ClaimLedger
          items={[item('verificado', 'cifra verificada'), item('contradicho', 'obra contradicha')]}
        />
      </MemoryRouter>,
    )
    const cards = screen.getAllByText(/verificada|contradicha/)
    expect(cards.length).toBeGreaterThanOrEqual(2)
  })

  it('drops a hidden item even if passed in', () => {
    render(
      <MemoryRouter>
        <ClaimLedger
          items={[
            { ...item('sin-datos', 'acusacion oculta', 'acusacion_publica'), claim: { id: 'h', type: 'acusacion_publica', accusationSubtype: 'opinativa', plenoId: 'p', plenoDate: '2026-04-20', verbatim: 'acusacion oculta', entities: {} } },
            item('verificado', 'cifra visible'),
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/acusacion oculta/)).toBeNull()
    expect(screen.getByText(/cifra visible/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/claim-ledger-items.test.jsx`
Expected: FAIL — `items` ignored / `acusacion oculta` rendered (or controls error).

- [ ] **Step 3: Edit `ClaimLedger.jsx`**

Remove the imports `useMemo, useState` only if unused after edits — they ARE still used by `ClaimLedger`. Keep `gateForDisplay, sortSignalFirst` imports; remove `filterClaims, facetCounts` from the import (no longer used). Remove the `SIGNAL_VERDICTS` const, the `VerdictChip` function, and the `LedgerControls` function entirely.

Replace the `ClaimLedger` function body's data section. The function signature becomes:

```jsx
export function ClaimLedger({ filter, limit = 20, emptyHint, items }) {
  const t = useT()
  const fetched = usePlenoClaims()
  const loading = items ? false : fetched.loading
  const sourceItems = items ?? fetched.data?.items ?? []
  const [shown, setShown] = useState(limit)

  // Gate (defense-in-depth) → optional external filter → signal-first sort.
  const base = useMemo(() => {
    const gated = gateForDisplay(sourceItems)
    const scoped = filter ? gated.filter(filter) : gated
    return sortSignalFirst(scoped)
  }, [sourceItems, filter])

  if (loading) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: 'var(--ink50)' }}>
        Cargando verificaciones…
      </div>
    )
  }
  if (base.length === 0) {
    return (
      <div
        style={{
          padding: 14,
          background: 'var(--soft)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--ink60)',
          lineHeight: 1.5,
        }}
      >
        {emptyHint ||
          'Todavía no hay declaraciones contrastadas con los datos municipales para mostrar aquí.'}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {base.slice(0, shown).map((it) => (
        <ClaimCard key={it.claim.id} item={it} />
      ))}
      {base.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 25)}
          className="mono"
          style={{
            alignSelf: 'flex-start',
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--border2)',
            background: 'transparent',
            color: 'var(--civic)',
            cursor: 'pointer',
          }}
        >
          {t('ledger.loadMore')} ({base.length - shown})
        </button>
      )}
    </div>
  )
}
```

Note: this drops the `sin-datos` toggle — the per-session and department surfaces now show all gated items (shown + toggle) signal-first, which is fine at their narrower scope. Keep `ClaimLedgerSection` as-is for now (Task 6 removes it); just remove `controls` from the JSX in `src/pages/Plenos.jsx` if present so nothing references the deleted prop.

- [ ] **Step 4: Run tests, verify pass (+ no regressions in departamentos path)**

Run: `npx vitest run tests/claim-ledger-items.test.jsx tests/claim-ledger.test.js`
Expected: PASS. Then `npm run typecheck` clean (no references to removed `facetCounts`/`filterClaims`/`controls`).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/components/ClaimLedger.jsx src/pages/Plenos.jsx
git add src/components/ClaimLedger.jsx src/pages/Plenos.jsx tests/claim-ledger-items.test.jsx
git commit -m "refactor(plenos): ClaimLedger items prop; drop cross-session controls (dedupe to /declaraciones)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Extract reusable per-session presentational components

**Files:**
- Create: `src/components/plenos/AgendaRow.jsx` (move from `Plenos.jsx`)
- Create: `src/components/plenos/VoteTuple.jsx` (move from `Plenos.jsx`)
- Modify: `src/components/PlenoFindings.jsx` (export `FindingCard`)
- Modify: `src/pages/Plenos.jsx` (import the moved components instead of the inline copies)

**Interfaces:**
- Produces: `AgendaRow({ item })`, `VoteTuple({ v })`, and a now-exported `FindingCard({ f })`.

- [ ] **Step 1: Create `src/components/plenos/AgendaRow.jsx`**

Move the existing `AgendaRow` function verbatim from `src/pages/Plenos.jsx` into this new file, prefixed with `export`, and add its imports:

```jsx
import { Pill } from '../Primitives'
import { SECTION_LABEL, SECTION_TONE } from '../../hooks/usePlenoAgendas'

export function AgendaRow({ item }) {
  // ... body identical to the current Plenos.jsx AgendaRow ...
}
```

- [ ] **Step 2: Create `src/components/plenos/VoteTuple.jsx`**

Move the existing `VoteTuple` function verbatim from `src/pages/Plenos.jsx`, prefixed with `export`, with imports:

```jsx
import { DIRECTION_TONE } from '../../hooks/usePlenoVotes'
import { partyColor } from '../../hooks/useOfficials'

export function VoteTuple({ v }) {
  // ... body identical to the current Plenos.jsx VoteTuple ...
}
```

- [ ] **Step 3: Export `FindingCard` from `PlenoFindings.jsx`**

In `src/components/PlenoFindings.jsx`, change `function FindingCard({ f })` to `export function FindingCard({ f })`.

- [ ] **Step 4: Update `Plenos.jsx` to import the moved components**

Delete the inline `AgendaRow` and `VoteTuple` definitions from `src/pages/Plenos.jsx`; add:

```jsx
import { AgendaRow } from '../components/plenos/AgendaRow'
import { VoteTuple } from '../components/plenos/VoteTuple'
```

- [ ] **Step 5: Verify no behavior change**

Run: `npm run typecheck && npx vitest run`
Expected: green. Then build + e2e plenos to confirm the index still renders:
`npm run build && npx playwright test tests/e2e/plenos.spec.ts --project=chromium-desktop`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/components/plenos/AgendaRow.jsx src/components/plenos/VoteTuple.jsx src/components/PlenoFindings.jsx src/pages/Plenos.jsx
git add src/components/plenos/AgendaRow.jsx src/components/plenos/VoteTuple.jsx src/components/PlenoFindings.jsx src/pages/Plenos.jsx
git commit -m "refactor(plenos): extract AgendaRow/VoteTuple, export FindingCard for reuse

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: New `/plenos/:id` detail page

**Files:**
- Create: `src/pages/PlenoDetalle.jsx`
- Modify: `src/App.jsx` (lazy import + route after `/plenos`)
- Modify: `src/i18n.jsx` (detail chrome keys, es + ca)
- Test: covered by e2e in Task 7

**Interfaces:**
- Consumes: `usePlenos`, `usePlenoChunk` (Task 1), `usePlenoVotes`, `usePlenoVoteSuggestions`, `usePlenoAgendas`, `usePlenoVideos` + `indexVideosByPleno`, `usePlenoFindings`, `AgendaRow`/`VoteTuple`/`FindingCard` (Task 4), `ClaimLedger` (Task 3).

- [ ] **Step 1: Add i18n keys**

In `src/i18n.jsx`, add to `es` (near `plenos.*`) and `ca`:

```js
// es
'plenoDetail.notFound': 'Sesión no encontrada',
'plenoDetail.back': '← Todos los plenos',
'plenoDetail.agenda': 'Orden del día',
'plenoDetail.votes': 'Votaciones',
'plenoDetail.declarations': 'Declaraciones contrastadas',
'plenoDetail.findings': 'Hallazgos editoriales',
'plenoDetail.transcript': 'Ver transcripción',
'plenoDetail.transcriptLoading': 'Cargando transcripción…',
'plenoDetail.transcriptMissing': 'Transcripción no disponible para esta sesión.',
'plenoDetail.video': '▸ Ver vídeo',
'plenoDetail.empty.agenda': 'Sin orden del día publicado para esta sesión.',
'plenoDetail.empty.votes': 'Sin votaciones transcritas del acta para esta sesión.',
'plenoDetail.empty.findings': 'Sin hallazgos editoriales para esta sesión.',
```

```js
// ca
'plenoDetail.notFound': 'Sessió no trobada',
'plenoDetail.back': '← Tots els plens',
'plenoDetail.agenda': 'Ordre del dia',
'plenoDetail.votes': 'Votacions',
'plenoDetail.declarations': 'Declaracions contrastades',
'plenoDetail.findings': 'Troballes editorials',
'plenoDetail.transcript': 'Veure transcripció',
'plenoDetail.transcriptLoading': 'Carregant transcripció…',
'plenoDetail.transcriptMissing': 'Transcripció no disponible per a aquesta sessió.',
'plenoDetail.video': '▸ Veure vídeo',
'plenoDetail.empty.agenda': "Sense ordre del dia publicat per a aquesta sessió.",
'plenoDetail.empty.votes': "Sense votacions transcrites de l'acta per a aquesta sessió.",
'plenoDetail.empty.findings': 'Sense troballes editorials per a aquesta sessió.',
```

- [ ] **Step 2: Create `src/pages/PlenoDetalle.jsx`**

```jsx
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, Pill, SectionHead, ExtLink } from '../components/Primitives'
import { AgendaRow } from '../components/plenos/AgendaRow'
import { VoteTuple } from '../components/plenos/VoteTuple'
import { FindingCard } from '../components/PlenoFindings'
import { ClaimLedger } from '../components/ClaimLedger'
import { usePlenos, PLENO_TONE, PLENO_LABEL } from '../hooks/usePlenos'
import { usePlenoChunk } from '../hooks/usePlenoClaims'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { usePlenoVotes, OUTCOME_LABEL, OUTCOME_TONE } from '../hooks/usePlenoVotes'
import { usePlenoVideos, indexVideosByPleno } from '../hooks/usePlenoVideos'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { fmtDateLong, fmtDateShort } from '../lib/formatters'
import { useT } from '../i18n'

function SectionWrap({ title, children }) {
  return (
    <section style={{ marginTop: 24 }}>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  )
}

function EmptyNote({ children }) {
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--soft)',
        borderRadius: 8,
        fontSize: 12,
        color: 'var(--ink60)',
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  )
}

function TranscriptExpander({ plenoId }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ loading: false, text: null, missing: false })
  useEffect(() => {
    if (!open || state.text !== null || state.missing) return
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    fetch(`/data/pleno-transcripts/${plenoId}.txt`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => alive && setState({ loading: false, text, missing: false }))
      .catch(() => alive && setState({ loading: false, text: null, missing: true }))
    return () => {
      alive = false
    }
  }, [open, plenoId, state.text, state.missing])

  return (
    <SectionWrap title={t('plenoDetail.transcript')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mono"
        style={{
          fontSize: 12,
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px solid var(--border2)',
          background: 'transparent',
          color: 'var(--civic)',
          cursor: 'pointer',
        }}
      >
        {open ? '▾ ' : '▸ '}
        {t('plenoDetail.transcript')}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {state.loading && <EmptyNote>{t('plenoDetail.transcriptLoading')}</EmptyNote>}
          {state.missing && <EmptyNote>{t('plenoDetail.transcriptMissing')}</EmptyNote>}
          {state.text && (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--ink70)',
                background: 'var(--soft)',
                padding: 12,
                borderRadius: 8,
                maxHeight: 420,
                overflow: 'auto',
              }}
            >
              {state.text}
            </pre>
          )}
        </div>
      )}
    </SectionWrap>
  )
}

export default function PlenoDetalle() {
  const t = useT()
  const { id } = useParams()
  const { data: plenosData, loading: plenosLoading } = usePlenos()
  const { data: chunk } = usePlenoChunk(id)
  const { data: agendasData } = usePlenoAgendas()
  const { data: votesData } = usePlenoVotes()
  const { data: findingsData } = usePlenoFindings()
  const { data: videosData } = usePlenoVideos()

  const pleno = useMemo(
    () => (plenosData?.items ?? []).find((p) => p.id === id),
    [plenosData, id],
  )
  const agenda = useMemo(
    () => (agendasData?.plenos ?? []).find((a) => a.id === id),
    [agendasData, id],
  )
  const votes = useMemo(
    () => (votesData?.items ?? []).filter((v) => v.plenoId === id),
    [votesData, id],
  )
  const findings = useMemo(
    () => (findingsData?.items ?? []).filter((f) => f.plenoId === id),
    [findingsData, id],
  )
  const video = useMemo(
    () => indexVideosByPleno(videosData, plenosData).get(id),
    [videosData, plenosData, id],
  )

  if (plenosLoading) {
    return <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 13 }}>…</div>
  }
  if (!pleno) {
    return (
      <div className="cp-page" style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
        <SectionHead eyebrow="Plenos" title={t('plenoDetail.notFound')} />
        <Link to="/plenos" style={{ color: 'var(--civic)', fontSize: 13 }}>
          {t('plenoDetail.back')}
        </Link>
      </div>
    )
  }

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 980, margin: '0 auto' }}>
      <Link to="/plenos" style={{ color: 'var(--civic)', fontSize: 12, textDecoration: 'none' }}>
        {t('plenoDetail.back')}
      </Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.015em' }}>
          {fmtDateLong(pleno.date)}
        </div>
        <Pill tone={PLENO_TONE[pleno.kind] || 'ghost'} size="xs">
          {PLENO_LABEL[pleno.kind] || pleno.kind}
        </Pill>
        {video && (
          <ExtLink href={video.url} title={video.title} className="mono" style={{ fontSize: 12, color: 'var(--civic)' }}>
            {t('plenoDetail.video')} ↗
          </ExtLink>
        )}
      </div>

      <SectionWrap title={t('plenoDetail.agenda')}>
        {agenda && agenda.agenda?.length > 0 ? (
          <Card>
            {agenda.agenda.map((it, i) => (
              <AgendaRow key={i} item={it} />
            ))}
          </Card>
        ) : (
          <EmptyNote>{t('plenoDetail.empty.agenda')}</EmptyNote>
        )}
      </SectionWrap>

      <SectionWrap title={t('plenoDetail.votes')}>
        {votes.length > 0 ? (
          <Card>
            {votes.map((rec) => (
              <div key={rec.id} style={{ padding: '10px 0', borderTop: '1px dashed var(--border2)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
                    {fmtDateShort(rec.plenoDate)}
                  </span>
                  <Pill tone={OUTCOME_TONE[rec.outcome]} size="xs">
                    {OUTCOME_LABEL[rec.outcome]}
                  </Pill>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  {rec.itemNumber}. {rec.title}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {rec.votes.map((v) => (
                    <VoteTuple key={v.bloc} v={v} />
                  ))}
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <EmptyNote>{t('plenoDetail.empty.votes')}</EmptyNote>
        )}
      </SectionWrap>

      <SectionWrap title={t('plenoDetail.declarations')}>
        <ClaimLedger items={chunk?.items ?? []} emptyHint="Sin declaraciones contrastables para esta sesión." />
      </SectionWrap>

      <SectionWrap title={t('plenoDetail.findings')}>
        {findings.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {findings.map((f) => (
              <FindingCard key={f.id} f={f} />
            ))}
          </div>
        ) : (
          <EmptyNote>{t('plenoDetail.empty.findings')}</EmptyNote>
        )}
      </SectionWrap>

      <TranscriptExpander plenoId={id} />
    </div>
  )
}
```

- [ ] **Step 3: Wire the route in `src/App.jsx`**

Add the lazy import near the other page imports:

```jsx
const PlenoDetalle = lazy(() => import('./pages/PlenoDetalle'))
```

Add the route immediately after the `/plenos` route (before `path="*"`):

```jsx
<Route path="/plenos/:id" element={<PlenoDetalle />} />
```

- [ ] **Step 4: Verify it builds + renders**

Run: `npm run typecheck && npm run build`
Expected: clean build. Then:
```bash
node -e 'const m=require("./public/data/pleno-claims/index.json");console.log("a real detail id:", m.plenos[0].plenoId)'
```
Use that id to smoke-check in dev/preview that `/plenos/:id` renders the sections.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/pages/PlenoDetalle.jsx src/App.jsx src/i18n.jsx
git add src/pages/PlenoDetalle.jsx src/App.jsx src/i18n.jsx
git commit -m "feat(plenos): per-session detail page /plenos/:id

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Rewrite `/plenos` as the lean session index

**Files:**
- Modify: `src/pages/Plenos.jsx` (replace the stacked blocks with the index)
- Create: `src/components/plenos/ParticipaBlock.jsx` (move from `Plenos.jsx`)
- Modify: `src/i18n.jsx` (index chrome keys, es + ca)

**Interfaces:**
- Consumes: `usePlenos`, `usePlenoClaimsManifest` (Task 1), `usePlenoFindings`, `usePlenoAgendas`, `usePlenoVideos` + `indexVideosByPleno`, `summarizeSessions` (Task 2), `TopDepartmentsCard` (keep), `ParticipaBlock` (moved).

- [ ] **Step 1: Add i18n keys**

In `src/i18n.jsx` add to `es` + `ca`:

```js
// es
'plenosIndex.crossSession': 'Verificación de declaraciones (todas las sesiones) →',
'plenosIndex.points': 'puntos',
'plenosIndex.findings': 'hallazgos',
// ca
'plenosIndex.crossSession': 'Verificació de declaracions (totes les sessions) →',
'plenosIndex.points': 'punts',
'plenosIndex.findings': 'troballes',
```

- [ ] **Step 2: Move `ParticipaBlock` to its own file**

Create `src/components/plenos/ParticipaBlock.jsx` by moving the existing `ParticipaBlock` function from `Plenos.jsx` verbatim, prefixed with `export`, with its imports:

```jsx
import { Card, Pill, ExtLink } from '../Primitives'
import { useParticipa, KIND_ICON, KIND_LABEL } from '../../hooks/useParticipa'
import { fmtDateLong, fmtDateShort } from '../../lib/formatters'

export function ParticipaBlock() {
  // ... body identical to the current Plenos.jsx ParticipaBlock ...
}
```

- [ ] **Step 3: Rewrite `src/pages/Plenos.jsx`**

Replace the ENTIRE file with the lean index (keep `TopDepartmentsCard` — it already lives here; move it too if cleaner, but keeping it inline is fine):

```jsx
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { ParticipaBlock } from '../components/plenos/ParticipaBlock'
import { usePlenos, PLENO_TONE, PLENO_LABEL } from '../hooks/usePlenos'
import { usePlenoClaimsManifest } from '../hooks/usePlenoClaims'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { summarizeSessions } from '../lib/pleno-summary'
import { fmtDateLong } from '../lib/formatters'
import { useT } from '../i18n'

function TopDepartmentsCard({ agendas }) {
  if (!agendas?.topDepartments?.length) return null
  return (
    <Card style={{ marginBottom: 14 }}>
      <SectionHead
        eyebrow={`Plenos analizados · ${agendas.stats.plenosFetched} sesiones · ${agendas.stats.agendaItemsTotal} puntos`}
        title="Departamentos con más presencia en el pleno"
        right={
          <Link to="/departamentos" style={{ fontSize: 12, color: 'var(--civic)', textDecoration: 'none' }}>
            Ver dashboard por departamento →
          </Link>
        }
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {agendas.topDepartments.map((d) => (
          <Link
            key={d.department}
            to={d.departmentSlug ? `/departamentos/${d.departmentSlug}` : '/departamentos'}
            className="mono"
            style={{
              fontSize: 11,
              padding: '3px 8px',
              background: 'var(--civic-soft)',
              color: 'var(--civic)',
              borderRadius: 3,
              letterSpacing: '.05em',
              textDecoration: 'none',
            }}
          >
            {d.department}
            <span style={{ marginLeft: 5, color: 'var(--ink60)' }}>· {d.count}</span>
          </Link>
        ))}
      </div>
    </Card>
  )
}

function Count({ n, label, tone }) {
  if (!n) return null
  return (
    <span className="mono" style={{ fontSize: 11, color: tone, marginLeft: 8 }}>
      {n} {label}
    </span>
  )
}

function SessionRow({ row, t }) {
  return (
    <Link
      to={`/plenos/${row.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '130px 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '11px 6px',
        borderBottom: '1px solid var(--border2)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span className="mono" style={{ fontSize: 12, color: 'var(--ink60)' }}>
        {fmtDateLong(row.date)}
      </span>
      <span style={{ minWidth: 0 }}>
        <Pill tone={PLENO_TONE[row.kind] || 'ghost'} size="xs">
          {PLENO_LABEL[row.kind] || row.kind}
        </Pill>
        <Count n={row.agendaCount} label={t('plenosIndex.points')} tone="var(--ink60)" />
        <Count n={row.verificado} label="✓" tone="var(--ok-ink)" />
        <Count n={row.contradicho} label="✗" tone="var(--crit-ink)" />
        <Count n={row.findings} label={t('plenosIndex.findings')} tone="var(--intel-ink)" />
      </span>
      <span className="mono" style={{ fontSize: 14, color: 'var(--ink40)' }}>
        →
      </span>
    </Link>
  )
}

export default function Plenos() {
  const t = useT()
  const { loading, data: plenosData } = usePlenos()
  const { data: manifest } = usePlenoClaimsManifest()
  const { data: agendasData } = usePlenoAgendas()
  const { data: findingsData } = usePlenoFindings()

  const rows = useMemo(
    () =>
      summarizeSessions({
        plenos: plenosData?.items ?? [],
        manifestPlenos: manifest?.plenos ?? [],
        findings: findingsData?.items ?? [],
        agendas: agendasData?.plenos ?? [],
      }),
    [plenosData, manifest, findingsData, agendasData],
  )

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{ fontSize: 10.5, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.08em' }}
        >
          {t('plenos.eyebrow')}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          {t('plenos.title')}
        </div>
      </div>

      <TopDepartmentsCard agendas={agendasData} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <div
          className="mono"
          style={{ fontSize: 10.5, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.08em' }}
        >
          Sesiones · {plenosData?.stats?.total ?? rows.length}
        </div>
        {plenosData?.generatedAt && <DataAsOf iso={plenosData.generatedAt} label="Plenos" />}
      </div>
      <Card>
        {loading && <div style={{ padding: 12, fontSize: 12, color: 'var(--ink50)' }}>…</div>}
        {rows.map((row) => (
          <SessionRow key={row.id} row={row} t={t} />
        ))}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Link to="/declaraciones" style={{ fontSize: 13, color: 'var(--civic)', textDecoration: 'none' }}>
          {t('plenosIndex.crossSession')}
        </Link>
      </div>

      <ParticipaBlock />
    </div>
  )
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: green build. The old per-page blocks (`PlenoVotesBlock`, `PlenoVoteSuggestionsBlock`, `PlenoFindingsSection` import, `ClaimLedgerSection` import, `RealPlenosList`) are now gone from `Plenos.jsx` — confirm no dangling imports remain (typecheck/lint catch them).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/pages/Plenos.jsx src/components/plenos/ParticipaBlock.jsx src/i18n.jsx
git add src/pages/Plenos.jsx src/components/plenos/ParticipaBlock.jsx src/i18n.jsx
git commit -m "feat(plenos): lean session index linking to per-session detail

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: E2E coverage + a11y for the new routes

**Files:**
- Modify: `tests/e2e/plenos.spec.ts` (index → detail navigation; detail sections; not-found)
- Modify: `tests/e2e/a11y.spec.ts` (add a real `/plenos/:id` to `STRICT_ROUTES`)

**Interfaces:** none.

- [ ] **Step 1: Replace the `/plenos` e2e block**

The old spec asserted the stacked blocks (which no longer exist). Replace the body of `tests/e2e/plenos.spec.ts` with:

```ts
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

// A real pleno id with claims, read from the committed manifest.
const FIRST_ID = (() => {
  const m = JSON.parse(readFileSync('public/data/pleno-claims/index.json', 'utf8'))
  return m.plenos?.[0]?.plenoId as string
})()

test.describe('Plenos index (/plenos)', () => {
  test('renders the session list and links to a detail page', async ({ page }) => {
    await page.goto('/plenos', { waitUntil: 'networkidle' })
    await expect(page.getByText(/Plenos municipales/i)).toBeVisible()
    // cross-session link to /declaraciones
    await expect(page.getByRole('link', { name: /Verificación de declaraciones/i })).toBeVisible()
    // at least one session row links into /plenos/<id>
    const row = page.locator('a[href^="/plenos/"]').first()
    await expect(row).toBeVisible()
    await row.click()
    await expect(page).toHaveURL(/\/plenos\/.+/)
  })
})

test.describe('Pleno detail (/plenos/:id)', () => {
  test('shows the per-session sections and ships no hidden accusations', async ({ page }) => {
    const chunkBodies: Array<{ items?: any[] }> = []
    page.on('response', async (res) => {
      if (/\/data\/pleno-claims\/[^/]+\.json$/.test(res.url()) && !res.url().endsWith('index.json')) {
        try {
          chunkBodies.push(await res.json())
        } catch {
          /* ignore */
        }
      }
    })
    await page.goto(`/plenos/${FIRST_ID}`, { waitUntil: 'networkidle' })
    await expect(page.getByText('Orden del día').first()).toBeVisible()
    await expect(page.getByText('Declaraciones contrastadas').first()).toBeVisible()
    // transcript lazy-loads on click (assert the control exists)
    await expect(page.getByRole('button', { name: /Ver transcripción/i }).first()).toBeVisible()

    const shipped = chunkBodies.flatMap((c) => c.items ?? [])
    const hidden = shipped.filter(
      (it: any) =>
        it.claim?.type === 'acusacion_publica' &&
        ((it.claim?.accusationSubtype ?? 'opinativa') === 'opinativa' ||
          it.verification?.verdict === 'sin-datos'),
    )
    expect(hidden).toEqual([])
  })

  test('unknown id renders a not-found state', async ({ page }) => {
    await page.goto('/plenos/this-id-does-not-exist', { waitUntil: 'networkidle' })
    await expect(page.getByText(/Sesión no encontrada/i)).toBeVisible()
  })
})
```

- [ ] **Step 2: Add `/plenos/:id` to strict a11y**

In `tests/e2e/a11y.spec.ts`, add a concrete detail URL to `STRICT_ROUTES` (use the same first id; hard-code a known id string present in the committed data, e.g. `'/plenos/k4olcs'`, OR read it from the manifest at the top of the file like the plenos spec does). Add:

```ts
// near the top, after imports
import { readFileSync } from 'node:fs'
const FIRST_PLENO_ID = JSON.parse(readFileSync('public/data/pleno-claims/index.json', 'utf8')).plenos?.[0]?.plenoId
```
and include `` `/plenos/${FIRST_PLENO_ID}` `` in the `STRICT_ROUTES` array.

- [ ] **Step 3: Build + run e2e**

Run: `npm run build && npx playwright test tests/e2e/plenos.spec.ts tests/e2e/a11y.spec.ts --project=chromium-desktop`
Expected: PASS (index nav, detail sections, not-found, and strict a11y on `/plenos` + `/plenos/:id`).

- [ ] **Step 4: Full regression**

Run: `npm run lint && npm run typecheck && npx vitest run && npx playwright test --project=chromium-desktop`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/plenos.spec.ts tests/e2e/a11y.spec.ts
git commit -m "test(e2e): cover /plenos index + /plenos/:id detail (nav, sections, a11y, gate)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Per-session detail route → Task 5 ✓
- Lean index with counts → Tasks 2 + 6 ✓
- Dedupe cross-session → `/declaraciones` link (Task 6); findings per-session + `/hallazgos` (Tasks 5/6) ✓
- Each view loads only what it needs (manifest / single chunk) → Tasks 1 + 6 (index manifest), 1 + 5 (detail chunk) ✓
- ClaimLedger `items` prop + remove controls → Task 3 ✓
- Detail media: link video + lazy transcript → Task 5 ✓
- Reuse AgendaRow/VoteTuple/FindingCard → Task 4 ✓
- i18n es+ca → Tasks 5/6 ✓
- Tests (unit + e2e + a11y for both routes) → Tasks 1–3, 7 ✓
- Route order before catch-all → Task 5 Step 3 ✓

**Placeholder scan:** Extraction tasks (4, 6 Step 2) say "move the existing function verbatim" referencing exact current code — not a placeholder; the import wrappers are shown in full. All new logic has complete code.

**Type/name consistency:** `usePlenoClaimsManifest`/`usePlenoChunk` (Task 1) reused in 5/6. `summarizeSessions` shape (Task 2) consumed in Task 6. `ClaimLedger({items})` (Task 3) consumed in Task 5. `AgendaRow`/`VoteTuple`/`FindingCard` (Task 4) consumed in Task 5. `FIRST_ID` derived from the manifest in Task 7.

**Out of scope (recorded):** `/declaraciones` internals; verifier LLM regen; `/departamentos` per-chunk optimization.
