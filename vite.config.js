import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteCuratorPlugin } from './vite-curator-plugin.js'
import { viteAppGraphPlugin } from './vite-app-graph-plugin.js'
import { vitePublicationGuard } from './publication-denylist.js'
import { buildDefines } from './build-defines.js'

// `apply: 'serve'` on viteCuratorPlugin already prevents it from running in
// production builds, but we ALSO gate registration on the mode here as
// belt-and-suspenders. Two layers must both fail before the curator
// endpoints could leak into a deployed bundle.
//
// `vitePublicationGuard` es el mismo razonamiento sobre los DATOS: Vite copia
// `public/` entero dentro de `dist/`, y lo que se despliega es `dist/`
// (`vercel build` + `vercel deploy --prebuilt`). Retira de la salida los
// artefactos que sólo son para la máquina del curador. Va sin condicionar por
// `mode` a propósito: una compilación de vista previa sirve los mismos
// ficheros por HTTP que una de producción.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'development' ? [viteCuratorPlugin(), viteAppGraphPlugin()] : []),
    vitePublicationGuard(),
  ],
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
      external:
        mode === 'production'
          ? [/.*\bvite-curator-plugin\.js$/, /.*\bvite-app-graph-plugin\.js$/]
          : [],
    },
  },
}))
