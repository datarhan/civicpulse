// Feature flags shared by the router (App.jsx) and page components — kept in
// a leaf module so pages and hooks can read them without importing the
// router (circular-import hazard).

const isDev = import.meta.env.MODE !== 'production'

// "Periodistas IA" (the journalist agent) generates AI-drafted biographies of
// named living officials — the highest legal-sensitivity surface in the app.
// Hidden from public production builds unless VITE_ENABLE_PERIODISTAS=true
// (set as a Vercel env var since the 2026-07 launch); always on in dev.
export const PERIODISTAS_ENABLED = isDev || import.meta.env.VITE_ENABLE_PERIODISTAS === 'true'

// "Eficiencia" publishes unit costs and a peer position for a named council —
// the first new claim type since the biographies. Every figure traces to the
// ministry's own coste efectivo return and the page states its own coverage,
// but the reading is new and worth checking against real data before it is
// public: on in dev, needs VITE_ENABLE_EFICIENCIA=true in production.
export const EFICIENCIA_ENABLED = isDev || import.meta.env.VITE_ENABLE_EFICIENCIA === 'true'
