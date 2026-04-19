# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install      # install dependencies
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # production build to dist/
npm run preview  # serve the production build locally
```

No tests, linter, or formatter are configured.

## Architecture

CivicPulse is a **front-end-only prototype** (Vite + React 18 + React Router 6) styled as a **municipal data-OS dashboard** — sidebar + topbar shell with six surfaces: Overview, Quejas (complaints), Cargos (officials), Presupuesto (budget), Plenos (council sessions), Datos (open data). All data is mocked in `src/data/mockData.js` — no backend, no API client, no build-time fetching.

The UI is derived from the "Direction A — Municipal Dashboard" handoff in the `civicpulse-design-system` bundle (Linear/Vercel data-OS feel, density 75, MHS score hero, map demoted to a widget inside Quejas). Don't reintroduce the old map-centric Dashboard/Scorecards shell — it was intentionally replaced.

### Layout
- `src/App.jsx` owns persistent Sidebar + Topbar, routes, and three overlays: Cmd+K spotlight, Tweaks panel, SimCity toggle hook.
- `tweaks` state (city, persona, dark mode, density) is persisted to `localStorage` under `cp:tweaks` and applied as `html.dark` class + `html` `font-size` (density maps to 13.5/14/15 px base).
- Breadcrumb is derived from `useLocation()` matched against the `NAV` array exported from `components/Sidebar.jsx`.

### Routes
Direction A (Sidebar + Topbar shell): `/` Overview · `/quejas` · `/cargos` · `/presupuesto` · `/plenos` · `/datos` · `/ciudad` (live Riba-roja map, Leaflet-based, kiosk-capable). A catch-all `*` renders Overview.

Variant routes — each renders its own full-page shell and hides the Sidebar/Topbar:
- `/hud` → `variants/Hud.jsx` (Direction B, dark SimCity-style HUD)
- `/briefing` → `variants/Briefing.jsx` (Direction C, editorial "Civic Briefing")
- `/d` → `variants/DirectionD.jsx` (Direction D, "El Mirador" — Leaflet map + editorial column + KPI strip)
- `/variants` → `variants/Chooser.jsx` (landing to pick a direction)

A floating `VariantSwitcher` (see `variants/VariantSwitcher.jsx`) is rendered on every variant page with per-variant `theme` and `position` props so it doesn't collide with that variant's layout (e.g. Direction D uses `position="bottom-right-d"` at `{bottom: 96, right: 440}` to sit inside the map column).

### Design tokens
All tokens live in `src/index.css` as CSS variables, with a `html.dark` override block that remaps `--ink`, `--surf`, `--paper`, `--soft`, `--border*`, and the `--*-soft` tonal surfaces. Tone names (`civic`, `ok`, `warn`, `crit`, `intel`, `neutral`, `ghost`) flow through `Pill`, `Delta`, and page status logic — add new semantic colors here, not inline. The `.mono` class switches to DM Mono with `font-variant-numeric: tabular-nums` and is used for every numeric/KPI value.

Components use **inline styles driven by CSS variables**, not per-component `.css` files. This matches the prototype's structure and keeps theming (dark mode, density) working through a single token layer — don't refactor to styled-components or CSS modules without the user asking.

### Charts & maps
`src/components/Charts.jsx` contains all SVG viz — `Sparkline`, `DualLine`, `Donut`, `BudgetBars`, `Heatmap`, and a stylized pure-SVG `MiniMap` used as decoration inside Quejas.

Leaflet + react-leaflet **are** installed and used by two real map surfaces:
- `src/components/LiveCity/LiveMap.jsx` — powers `/ciudad` (kiosk live monitor). CartoDB Dark Matter tiles, heat zones, landmarks, pulsing incident pins, budget-particle flow.
- `src/components/LiveCity/StylizedMap.jsx` — powers `/d` (Direction D "El Mirador"). **Deliberately minimal "information-first" map**. CartoDB Voyager (warm daytime) tiles + real OSM geometry, with a thin layer of overlays:
  - Neighborhood cards (`NeighborhoodCard`) — divIcons with a breathing health-ring (CSS keyframe `cpHoodBreathe`) colored by MHS score via the `mhsColor()` helper, the MHS score as a big tabular number, and the neighborhood name below as a chip.
  - Metro L9 animated train (`MetroTrain`) — position interpolated via haversine along a coord array (see `buildPathSegments`/`posAlongPath`) using `requestAnimationFrame`.
  - Polyline accents for CV-35, CV-370, and the L9 track.
  - Pulsing `IncidentPin`s (CSS `cpIncidentHalo`) and `BudgetParticles` (Leaflet `layerGroup` rebuilt on each tick).
  - `HeatOverlay` circles shown only when `layer` is `calor` or `aire`.
  - `MetroBadge` top-right with a 15-min cycle countdown.

  Earlier iterations tried hand-drawn SVG rectangles, Dorfromantik cottages, Tropico haciendas/factories, SimCity grids, and Kenney CC0 isometric sprite tiles on top of the tile layer. **All were removed** — they looked procedural, cluttered the view, and did not convey real municipal data at a glance. The current minimal design (health ring + MHS number per neighborhood) is the chosen baseline. Do not reintroduce synthetic buildings without a clear brief.

### Mock data structure
`src/data/mockData.js` is the single source of truth. Key exports:
- `CITIES` — city switcher items, each with `mhs`, `delta`, `pop`, `region`, and a 2-letter `code` used as the sidebar city avatar.
- `DEPTS` — used by Overview leaderboard, Cargos grid, and CmdK search. The `lead` field is joined by initials to make the card avatar.
- `PROMISES` — status is `'ok' | 'risk' | 'late'`, which maps to `ok / warn / crit` tones.
- `FEED`, `COMPLAINT_ROWS`, `COMPLAINT_CATS`, `AGENDA_CIVICA`, `AGENDA_PLENO`, `HISTORIC_VOTES`, `TOP_CONTRACTS`, `DATASETS`, `TAX_BREAKDOWN`, `BUDGET_*`, `MHS_15D`, `COMPLAINTS_30D`, `RESOLVED_30D`.
- Riba-roja / Direction-D data: `RIBA_ROJA` (center/zoom/bbox), `RR_NEIGHBORHOODS`, `RR_LANDMARKS`, `RR_INCIDENTS_SEED`, `RR_EVENT_POOL` (live-feed simulator pool), `RR_BUDGET_FLOW`, `RR_WEATHER`, `RR_LAYERS`, `RR_PRESS_POOL`, `RR_SOCIAL_POOL`. All coordinates are real lat/lng so they line up with the CartoDB tile base in `/d` and `/ciudad`.

## Cmd+K / shortcuts

Cmd/Ctrl+K anywhere opens the spotlight in `components/CmdK.jsx`. It indexes `NAV`, all `DEPTS`, three most recent `PROMISES`, and a couple of action stubs. Navigation uses `react-router`'s `useNavigate`.

## Design bundle

`civicpulse-design-system/` (in `/tmp/civicpulse-design/` on dev machines, delivered as a tar.gz from Claude Design) ships three directions: A (Dashboard), B (City HUD / SimCity), C (Civic Briefing editorial). All three are implemented. Direction D ("El Mirador") is not in the bundle — it was added later as a fusion of A + C with a real map as the main canvas and a `/d` route. The README in the bundle says "recreate pixel-perfectly" for A/B/C — match the visual output, not the prototype's file structure.

## Product context

Spain-based civic monitor (Spanish UI, Castilian Spanish with some Valencian place names). Target personas per the PLAN: engaged citizen (default lens), journalist, municipal official, activist. The "Lentes" (lenses) section of the sidebar switches persona — right now it only changes the footer label, but future features should key off `tweaks.persona` to gate overlays. `first_description.md` describes the original intended FastAPI + PostGIS + pgvector backend — it's roadmap, not implemented.
