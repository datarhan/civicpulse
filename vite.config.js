import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteCuratorPlugin } from './vite-curator-plugin.js'
import { buildDefines } from './build-defines.js'

// `apply: 'serve'` on viteCuratorPlugin already prevents it from running in
// production builds, but we ALSO gate registration on the mode here as
// belt-and-suspenders. Two layers must both fail before the curator
// endpoints could leak into a deployed bundle.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'development' ? [viteCuratorPlugin()] : [])],
  define: buildDefines(),
  server: {
    port: 5173,
    open: false,
  },
  build: {
    rollupOptions: {
      // Production: ensure no chunk references the dev-only Curator page.
      // (The route is gated by `import.meta.env.MODE` in App.jsx; this is
      // an additional fence.)
      external: mode === 'production' ? [/.*\bvite-curator-plugin\.js$/] : [],
    },
  },
}))
