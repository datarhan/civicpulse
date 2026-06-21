# Plenos claim-ledger editorial gate + signal-first UX

**Date:** 2026-06-21
**Status:** Approved (design), pending implementation
**Surface:** `/plenos` (the public claim ledger block) + the chunk build step + `/metodologia`

## Problem

The curated findings path (`/hallazgos`, `pleno-findings.json`, 17 published) is
human-gated. But the **ClaimLedger block on `/plenos` renders the raw
machine-verified file directly, with no curator gate**:

- `pleno-claims-verified.json` ships **4,658 claims**; the SPA loads them via the
  chunk manifest and renders **the first 30 in arbitrary manifest order** —
  no sort, no filter, no search.
- **1,597 are `acusacion_publica`** (public accusations) — **799 `opinativa`**
  (pure character/intent), and **1,543 accusations carry a `sin-datos` verdict**.
  A verbatim public accusation the verifier *itself refused to check*
  (`opinativa` → `sin-datos` *by policy*) is shown to the public anyway, often
  incoherent out of context and attributed only to a bloc or `"Otro"`. This is
  exactly the libel surface the rest of the pipeline is engineered to prevent.
- 87% of all claims are `sin-datos`, so the 24 `contradicho` (most newsworthy)
  and 216 `verificado` are statistically invisible in the unsorted first-30.
- Dev-facing copy leaks to the public: empty state says *"Ejecuta `npm run
  extract:pleno-claims`…"*; footer says *"ver fichero raw
  pleno-claims-verified.json"*.

Because `public/data/` is the deploy root, **everything there is publicly
downloadable** — so even the claims the page doesn't render are fetchable. Any
fix must address the shipped artifact, not just the rendered DOM.

## Goals

1. The public claim ledger only surfaces **data-grounded** claims; verbatim
   opinion/unsubstantiated accusations never reach the public (rendered *or*
   downloadable).
2. The newsworthy signal (`contradicho`, then `verificado`/`parcial`) leads.
3. Readers can filter (verdict/type/pleno/grupo) and search.
4. The gate is a single, unit-tested function — the legally material contract.

Non-goals (deferred; see "Follow-ups"): full page IA/tabs/per-session view; the
verifier completion-pattern + match-floor fixes; transcription validation/QA.

## Decisions (locked with the user)

- **Policy:** *Data-grounded only.* Hide all `opinativa` accusations and all
  `sin-datos` accusations always. Show verdict-bearing claims of any type
  (including data-backed `factual`/`contra-datos` accusations). Non-accusation
  `sin-datos` sit behind a "mostrar sin datos" toggle.
- **Enforcement:** *Build-time + client* (defense-in-depth). Curator monolith
  stays for the CLIs but is excluded from deploy.
- **Layout:** *Signal-first flat list*, filters + search + toggle, "Cargar más".

## The gate contract (single source of truth)

New pure module `src/scraper/claim-public-gate.ts`:

```ts
export type ClaimVisibility = 'shown' | 'toggle' | 'hidden'

const DATA_GROUNDED = new Set(['verificado', 'parcial', 'contradicho', 'promesa-repetida'])

// item: { claim: PlenoClaim, verification: ClaimVerification }
export function classifyClaimVisibility(item): ClaimVisibility {
  const verdict = item?.verification?.verdict
  const grounded = DATA_GROUNDED.has(verdict)
  if (item?.claim?.type === 'acusacion_publica') {
    const subtype = item.claim.accusationSubtype ?? 'opinativa' // safe default
    if (subtype === 'opinativa') return 'hidden'
    return grounded ? 'shown' : 'hidden' // factual/contra-datos need a real verdict
  }
  return grounded ? 'shown' : 'toggle' // non-accusation: grounded shows, else toggle
}
```

Design notes:
- **Fail-safe by default:** anything whose verdict is missing/unknown is treated
  as not-grounded → `hidden` for accusations, `toggle` for the rest. A new claim
  type or a malformed record can never default to `shown`.
- Mirrors the verifier's own `opinativa` short-circuit, so the two layers agree.

### Expected partition of the current corpus (4,658)
- `hidden`  ≈ 1,543 (all sin-datos/opinativa accusations) — never ships.
- `shown`   ≈ 608 verdict-bearing + promesa-repetida (incl. ~54 data-backed accusations).
- `toggle`  ≈ 2,507 non-accusation sin-datos.
- Deployed chunk payload drops ~33%.

## Architecture

### Layer 1 — build time
- `scripts/chunk-pleno-claims.ts` calls `classifyClaimVisibility`, writes only
  `shown` + `toggle` items into `public/data/pleno-claims/*.json`, and stamps
  each item with a `visibility` field so the client honors the toggle without
  re-deriving policy. `hidden` items never enter a deployed file.
- Manifest `index.json` gains gated counts (`byVerdict` over the shown set, plus
  a `toggleCount`) so filter chips show correct numbers without loading first.
- `.vercelignore`: exclude `public/data/pleno-claims-verified.json` and
  `public/data/pleno-claims-suggestions.json` (curator/CLI artifacts, not needed
  by the SPA which reads chunks). Verify the CLIs (`promote-claim`,
  `auto-curate`, `verify:pleno-claims`) still read them from the repo path —
  they do; `.vercelignore` only affects the deploy, not git/local.

### Layer 2 — client
- `usePlenoClaims` keeps loading chunks; the ledger re-applies
  `classifyClaimVisibility` defensively before render. A stale chunk or a future
  hook change cannot re-expose a `hidden` claim.
- New pure `src/lib/claim-ledger.js`:
  - `sortSignalFirst(items)` — `contradicho → verificado → parcial →
    promesa-repetida`, then newest `plenoDate` first.
  - `filterClaims(items, { verdict, type, pleno, grupo, query, showSinDatos })`
    — `query` matches `claim.verbatim`; **operates only on the gated visible set**
    (callers pass already-gated items), so search can never resurface a hidden
    claim. `showSinDatos=false` drops `toggle` items.
  - `facetCounts(items)` — counts per verdict/type for the chips.

### UI
- Extract the ledger from the 686-line `Plenos.jsx` into
  `src/components/plenos/ClaimLedger.jsx` (presentational) backed by
  `claim-ledger.js` (logic). Other blocks (votes, agenda, participa) are left
  alone in this pass.
- Controls: verdict chips with counts, type/pleno/grupo selects, search box,
  "mostrar sin datos" toggle, "Cargar más" beyond ~25.
- Replace dev copy with reader-facing empty state + a `/metodologia` link.
- New chrome strings go through `src/i18n.jsx` (es + ca).

## Editorial contract
- Update `/metodologia#verificacion-declaraciones` to state exactly what the
  public ledger shows vs. withholds and why (CLAUDE.md requires this page track
  pipeline behavior). Neutral framing; link it from the ledger.

## Testing (TDD; the gate is legally material)
- **Unit `claim-public-gate`** (write first, RED): opinativa accusation→hidden;
  sin-datos accusation→hidden; contradicho accusation→shown; verificado
  numeric→shown; sin-datos numeric→toggle; missing verdict→hidden(accusation)/
  toggle(other); missing subtype→hidden.
- **Unit `claim-ledger`**: signal-first order; filters; search only over the
  passed (gated) set; toggle includes/excludes sin-datos.
- **Chunker test**: chunks exclude `hidden`; items carry `visibility`; manifest
  counts match the shown set.
- **E2E `/plenos`**: strict a11y still passes; contradicho sorts first; toggle
  reveals sin-datos; assert **no opinativa/sin-datos accusation verbatim in the
  DOM or in the fetched chunk JSON** on first load.

## Risks
- Chunk consumers other than the SPA: only the SPA reads chunks; CLIs read the
  monolith. Confirmed during build-time step.
- Regenerating chunks rewrites committed JSON — expected; nightly already
  commits `public/data`.

## Follow-ups (out of scope, recorded so they're not lost)
1. Verifier `contradicho` recall: completion-detection is 7 hardcoded verbs;
   entity-match floor was lowered 0.65→0.50 (false-positive corroborations).
2. Transcription QA: no transcript validation (monotonic timestamps/format)
   before extraction; wrong-video-match guard; `refine --apply` is destructive
   (keep `.orig`); the page's "Whisper ~90%" is unmeasured.
3. Full page IA: per-session view, tabbed/anchored nav, dedupe the
   Findings/ClaimLedger overlap with `/hallazgos`.
