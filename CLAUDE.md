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
`/` Overview · `/quejas` · `/cargos` · `/presupuesto` · `/plenos` · `/datos`. A catch-all `*` renders Overview.

### Design tokens
All tokens live in `src/index.css` as CSS variables, with a `html.dark` override block that remaps `--ink`, `--surf`, `--paper`, `--soft`, `--border*`, and the `--*-soft` tonal surfaces. Tone names (`civic`, `ok`, `warn`, `crit`, `intel`, `neutral`, `ghost`) flow through `Pill`, `Delta`, and page status logic — add new semantic colors here, not inline. The `.mono` class switches to DM Mono with `font-variant-numeric: tabular-nums` and is used for every numeric/KPI value.

Components use **inline styles driven by CSS variables**, not per-component `.css` files. This matches the prototype's structure and keeps theming (dark mode, density) working through a single token layer — don't refactor to styled-components or CSS modules without the user asking.

### Charts
`src/components/Charts.jsx` contains all SVG viz — `Sparkline`, `DualLine`, `Donut`, `BudgetBars`, `Heatmap`, and a stylized pure-SVG `MiniMap`. There is **no Leaflet** in the app; the `MiniMap` is a decorative SVG with fixed pin coordinates. If you need a real interactive map, add leaflet + react-leaflet back to `package.json` deliberately.

### Mock data structure
`src/data/mockData.js` is the single source of truth. Key exports:
- `CITIES` — city switcher items, each with `mhs`, `delta`, `pop`, `region`, and a 2-letter `code` used as the sidebar city avatar.
- `DEPTS` — used by Overview leaderboard, Cargos grid, and CmdK search. The `lead` field is joined by initials to make the card avatar.
- `PROMISES` — status is `'ok' | 'risk' | 'late'`, which maps to `ok / warn / crit` tones.
- `FEED`, `COMPLAINT_ROWS`, `COMPLAINT_CATS`, `AGENDA_CIVICA`, `AGENDA_PLENO`, `HISTORIC_VOTES`, `TOP_CONTRACTS`, `DATASETS`, `TAX_BREAKDOWN`, `BUDGET_*`, `MHS_15D`, `COMPLAINTS_30D`, `RESOLVED_30D`.

## Cmd+K / shortcuts

Cmd/Ctrl+K anywhere opens the spotlight in `components/CmdK.jsx`. It indexes `NAV`, all `DEPTS`, three most recent `PROMISES`, and a couple of action stubs. Navigation uses `react-router`'s `useNavigate`.

## Design bundle

`civicpulse-design-system/` (in `/tmp/civicpulse-design/` on dev machines, delivered as a tar.gz from Claude Design) ships three directions: A (what's implemented), B (City HUD / SimCity), C (Civic Briefing editorial). The README in that bundle says "recreate pixel-perfectly" — match the visual output, not the prototype's file structure.

## Product context

Spain-based civic monitor (Spanish UI, Castilian Spanish with some Valencian place names). Target personas per the PLAN: engaged citizen (default lens), journalist, municipal official, activist. The "Lentes" (lenses) section of the sidebar switches persona — right now it only changes the footer label, but future features should key off `tweaks.persona` to gate overlays. `first_description.md` describes the original intended FastAPI + PostGIS + pgvector backend — it's roadmap, not implemented.
