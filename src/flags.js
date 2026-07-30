// @ts-check
// Feature flags shared by the router (App.jsx) and page components — kept in
// a leaf module so pages and hooks can read them without importing the
// router (circular-import hazard).

const isDev = import.meta.env.MODE !== 'production'

// "Periodistas IA" (the journalist agent) generates AI-drafted biographies of
// named living officials — the highest legal-sensitivity surface in the app.
// Hidden from public production builds unless VITE_ENABLE_PERIODISTAS=true
// (set as a Vercel env var since the 2026-07 launch); always on in dev.
export const PERIODISTAS_ENABLED = isDev || import.meta.env.VITE_ENABLE_PERIODISTAS === 'true'
