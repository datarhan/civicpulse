# /plenos per-session information-architecture redesign

**Date:** 2026-06-21
**Status:** Approved (design), pending implementation
**Surface:** `/plenos` (index) + new `/plenos/:id` (detail) · `ClaimLedger` reuse · `/declaraciones` unchanged

## Problem

`/plenos` is a ~14,000px single-column scroll of 7 stacked global blocks. A pleno
session is the natural atomic unit, but its facets — agenda, votes, verified
claims, findings, video, transcript — are scattered across those blocks, so a
reader can't see "what happened on 20 abril 2026" in one place. Two blocks also
duplicate other surfaces: the standalone Findings block duplicates `/hallazgos`,
and the cross-session claim ledger duplicates `/declaraciones` (the established,
richer cross-session explorer).

## Goals

1. Make the **session** the unit: a per-session page bundling its agenda, votes,
   declarations, findings, video, and transcript.
2. A lean, scannable `/plenos` **index** (session list with signal counts) instead
   of the mega-scroll.
3. **Dedupe**: cross-session claims → link to `/declaraciones`; findings →
   per-session + `/hallazgos` canonical.
4. Each view loads only the data it needs (index = manifest only; detail = one chunk).

Non-goals: changing `/declaraciones` internals; the verified-data LLM regen; any
scraper/pipeline work.

## Decisions (locked with the user)

- **Structure:** per-session **detail route** `/plenos/:id` + lean index. (Not tabs, not anchors.)
- **Cross-session ledger:** the index **links to `/declaraciones`**; `/plenos` no
  longer embeds a cross-session ledger.
- **Detail media:** video = link-out chip (no iframe); transcript = collapsible
  **lazy** expander that fetches `<id>.txt` only on open.

## Data architecture

All joins are available and cheap (verified against live data):
- **Index counts** come from the chunk manifest `public/data/pleno-claims/index.json`
  — each `plenos[]` descriptor already has `{plenoId, plenoDate, byVerdict, toggleCount, itemCount}`
  (gated counts). No chunk bodies needed for the index.
- **Detail claims** come from a single chunk `public/data/pleno-claims/<id>.json`
  (`{plenoId, plenoDate, items}`).
- Findings carry `plenoId`; votes carry `plenoId`; agendas are keyed by `id`
  (`agenda[]`, `agendaCount`); videos index by pleno id via existing `indexVideosByPleno`.

New units (small, focused, testable):
- `src/hooks/usePlenoClaimsManifest.js` — fetches `index.json`; returns
  `{loading, error, plenos: descriptor[], totals}`. 404 → empty. (Index only.)
- `src/hooks/usePlenoChunk.js` — `usePlenoChunk(plenoId)` fetches
  `/data/pleno-claims/<plenoId>.json`; returns `{loading, error, items}`. 404 →
  empty items. (Detail only.)
- `src/lib/pleno-summary.js` — pure `summarizeSessions({plenos, manifestPlenos,
  findings, agendas})` → `[{id, date, kind, link, agendaCount, verificado,
  contradicho, findings}]` sorted newest-first. Unit-tested.
- `ClaimLedger` gains an optional **`items` prop**: when provided it renders those
  (still gated client-side via `gateForDisplay` + signal-sorted) instead of calling
  `usePlenoClaims`. Backward compatible — `/departamentos` keeps passing only `filter`.

`usePlenoClaims` is left untouched (still used by `/declaraciones` and
`/departamentos`), so no regression there.

## The index (`/plenos`)

Rewrite `src/pages/Plenos.jsx` to a lean list, newest-first. Each row:
`fecha · <kind pill> · ▸ vídeo↗ · N puntos · N✓ · N✗ · N hallazgos` → links to
`/plenos/:id` (whole row is the link; the vídeo chip is a separate external link).
Counts: `verificado`/`contradicho` from the manifest descriptor; `puntos` from
`agendaCount`; `hallazgos` = findings with that `plenoId`.

Kept on the index: `TopDepartmentsCard` (unchanged) and a compact **"Verificación
de declaraciones → /declaraciones"** callout. `ParticipaBlock` stays as a small
bottom section (extracted to `src/components/plenos/ParticipaBlock.jsx`).

Removed from the index (content relocated): global `PlenoVotesBlock` (→ detail),
`PlenoVoteSuggestionsBlock` (→ detail), `PlenoFindingsSection` (→ detail +
`/hallazgos`), cross-session `ClaimLedgerSection` (→ `/declaraciones`).

## The detail page (`/plenos/:id`)

New `src/pages/PlenoDetalle.jsx`; route in `src/App.jsx` (lazy, like siblings);
add `/plenos/:id` (a representative id) to a11y `STRICT_ROUTES`. Resolve the pleno
from `usePlenos()` by `id`; unknown id → honest "sesión no encontrada" + back-link.

Sections, top to bottom, each with an honest empty state:
1. **Header** — breadcrumb (`Plenos / <fecha>`), date, kind pill, `▸ Ver vídeo ↗`
   (link-out; hidden if no video).
2. **Orden del día** — that session's `agenda[]` (reuse the existing `AgendaRow`,
   extracted to `src/components/plenos/AgendaRow.jsx`). Empty → "sin orden del día publicado".
3. **Votaciones** — that session's pleno-votes (reuse `VoteTuple`, extracted);
   plus auto-suggested votes for it (machine, clearly labeled). Empty → honest copy.
4. **Declaraciones contrastadas** — `<ClaimLedger items={chunkItems} />` (gated +
   signal-first; no controls — one session is narrow). Empty → "sin declaraciones
   contrastables".
5. **Hallazgos** — that session's curated findings (reuse `FindingCard`); link to
   `/hallazgos`. Empty → none shown.
6. **Transcripción** — collapsible `▾ Ver transcripción`; on first open, fetch
   `/data/pleno-transcripts/<id>.txt` (loading / 404-"no disponible" / text states).

## Cleanup

Remove the now-unused `controls` / `LedgerControls` / `VerdictChip` from
`ClaimLedger.jsx` and the `controls` prop usage (cross-session controls live on
`/declaraciones`). Keep `gateForDisplay` + `sortSignalFirst` + the `filter`/`items`
paths. Drop the now-unused `ledger.*` i18n keys that only fed the controls, and the
`claim-ledger` lib's `facetCounts`/`filterClaims` if nothing else references them
(verify before deleting).

## Testing (TDD)

- **Unit `pleno-summary`**: counts + newest-first sort; missing manifest/agenda/
  findings tolerated (zeros).
- **Unit hooks**: `usePlenoChunk` / `usePlenoClaimsManifest` loading/empty/404 (happy-dom + fetch mock).
- **Unit `ClaimLedger` items prop**: renders passed items, still drops `hidden`,
  still signal-sorted; `/departamentos` `filter`-only path unchanged.
- **E2E**: index rows render + navigate to `/plenos/:id`; detail shows section
  headings; unknown id → not-found; transcript expander loads on click; `/plenos`
  AND `/plenos/:id` pass strict axe a11y; assert no opinativa/sin-datos accusation
  verbatim in the detail DOM.
- **i18n** keys (es + ca) for all new chrome; remove dead keys.

## Risks
- New `:id` route must precede the catch-all redirect in `App.jsx` (order matters).
- `usePlenos` returns all 58 sessions; the index links every session, but only ~11
  have claims/agenda — rows still render with zero counts (honest).
- Removing `controls` churns code merged earlier this session; acceptable (dedupe
  with `/declaraciones`). The gate/sort/lib it relied on stays.

## Follow-ups (recorded, not in scope)
- Per-chunk lazy-load for `/departamentos` too (still uses load-all `usePlenoClaims`).
- Verifier `contradicho` LLM-regen to surface the negation/synonym fix in production.
