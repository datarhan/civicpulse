# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install      # install dependencies
npm run dev      # start Vite dev server on http://localhost:5173
npm run build    # production build to dist/
npm run preview  # serve the production build locally
```

There are no tests, linter, or formatter configured in this project.

## Architecture

CivicPulse is a **front-end-only prototype** (Vite + React 18 + React Router 6) that renders a civic-monitor dashboard for the municipality of Riba-roja de Túria. All data is currently static and imported from `src/data/mockData.js` — there is no backend, API client, or build-time data fetching. The `first_description.md` file describes an intended FastAPI + PostGIS + pgvector stack, but **none of that exists in this repo yet**; do not assume any server code is present.

Routing lives in `src/App.jsx`:
- `/` → `pages/Dashboard.jsx` — composes `VitalsBar`, `MorningPulse`, `CityMap`, `RivalryMeter`.
- `/scorecards` → `pages/Scorecards.jsx` — politician cards from `mockData.politicians`.
- `AskChat` is mounted globally outside `<Routes>` as a floating chat bubble (scripted response from `mockData.chatResponses`).

The map (`components/CityMap.jsx`) uses **react-leaflet** with a CARTO dark tile layer. Incidents render as `CircleMarker`s colored by `status` (`open` / `in_progress` / `fixed`); clicking a pin opens `PoliticianCard` populated via `getPolitician(incident.assignedTo)` which joins incidents to politicians by id. Leaflet's CSS is loaded from a CDN in `index.html`, not imported from `node_modules` — keep it that way or the map will render without styling.

`mockData.js` is the single source of truth for app state. Shape:
- `vitals` — top-bar cards (air/safety/metro).
- `morningPulse` — council-meeting AI summary.
- `incidents` — pins on the map, each with `lat/lng/status/category/assignedTo`.
- `politicians` — scorecard entries, keyed by the id referenced from `incidents.assignedTo`.
- `rivalry` — municipality efficiency ranking.
- `MAP_CENTER` / `MAP_ZOOM` — Riba-roja center coordinates.

## Styling conventions

- Design tokens (colors, spacing, typography, party colors for PSOE/PP/Compromís/Vox) are defined as CSS variables in `src/index.css:6`. Use those variables instead of hard-coding hex values.
- Each component ships its own sibling `.css` file (e.g. `CityMap.jsx` + `CityMap.css`) — follow that pattern when adding components.
- Fonts (Inter, Outfit) and Leaflet CSS are loaded via `<link>` tags in `index.html`, not through JS imports.
- UI copy is Spanish (with some Valencian place names); keep user-facing strings in Spanish.

## Product context

Riba-roja de Túria is a real municipality in Valencia, Spain. The product positions itself as a transparency / accountability tool that surfaces incidents and ties each one to a named councilor. When extending features, preserve the "face of the issue" pattern: every incident must map to a responsible politician and show a measurable stat (fix rate, avg response hours). The `first_description.md` roadmap lists features that are **not yet implemented** (AI RAG chat, Telegram verification loop, PostGIS backend) — treat it as product direction, not as a description of existing code.
