/**
 * Los extremos del despiece, sólo en desarrollo.
 *
 *   GET /api/despiece/grafo    el grafo entero, derivado del código
 *   GET /api/despiece/estado   qué está haciendo ahora mismo cada pieza
 *
 * `apply: 'serve'` y, además, `vite.config.js` sólo lo registra en modo
 * desarrollo: dos capas que tienen que fallar las dos para que esto salga en un
 * paquete desplegado, igual que el panel del curador.
 *
 * SÓLO LECTURA, y a posta. El del curador ejecuta CLIs porque su trabajo es
 * firmar cosas; éste sólo describe. Un extremo que no escribe no necesita ni
 * lista blanca de acciones ni validación de argumentos, y no tenerlas es una
 * superficie de ataque que no existe.
 *
 * El grafo se calcula una vez y se guarda en memoria: recorre `src/` y
 * `scripts/` enteros y tarda ~2 s. La caché se TIRA sola en cuanto Vite ve
 * cambiar un fichero que el grafo mira, porque una página cuyo trabajo es
 * describir el código no puede seguir enseñando el código de hace diez
 * minutos: sería la única mentira que este mapa no se puede permitir. Y se
 * midió — tras clasificar los procesos, la página seguía sirviendo la versión
 * anterior y la sección de mantenimiento salía vacía.
 * `?refrescar=1` fuerza el recálculo a mano.
 */
import { resolve } from 'node:path'

// La raíz del repositorio es donde vive este fichero. Mejor que `process.cwd()`:
// no depende de desde dónde se haya lanzado el servidor de desarrollo.
const RAIZ = import.meta.dirname

const ORIGENES = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173'])

/** Sin Origin sólo se aceptan GET: son idempotentes y no escriben nada. */
function origenValido(req) {
  const origen = req.headers.origin
  if (origen) return ORIGENES.has(origen)
  return req.method === 'GET'
}

function enviarJson(res, estado, cuerpo) {
  res.statusCode = estado
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(cuerpo))
}

export function viteAppGraphPlugin(opts = {}) {
  const cwd = resolve(opts.cwd ?? RAIZ)
  let cache = null

  return {
    name: 'civicpulse:despiece-middleware',
    apply: 'serve',
    configureServer(server) {
      const MIRA = /(^|\/)(src|scripts|bot\/src)\/|package\.json$|\.github\/workflows\//
      const invalidar = (fichero) => {
        if (cache && MIRA.test(fichero)) cache = null
      }
      server.watcher.on('change', invalidar)
      server.watcher.on('add', invalidar)
      server.watcher.on('unlink', invalidar)

      // El estado NO se cachea: es lo único del despiece que se mide en vez de
      // derivarse, y servir una medición vieja lo convertiría en lo contrario
      // de lo que es.
      server.middlewares.use('/api/despiece/estado', (req, res, next) => {
        const ruta = (req.url || '/').split('?')[0]
        if (ruta !== '/' && ruta !== '') return next()
        if (req.method !== 'GET') return enviarJson(res, 405, { error: 'method not allowed' })
        if (!origenValido(req)) return enviarJson(res, 403, { error: 'origin not allowed' })

        Promise.all([
          server.ssrLoadModule('/scripts/lib/app-graph-io.ts'),
          server.ssrLoadModule('/src/scraper/app-graph.ts'),
          server.ssrLoadModule('/scripts/lib/app-graph-estado.ts'),
        ])
          .then(([io, grafoMod, estadoMod]) => {
            const grafo = cache ?? grafoMod.construirGrafoApp(io.leerEntradas(cwd))
            enviarJson(res, 200, {
              medidoEn: new Date().toISOString(),
              estado: estadoMod.medirEstado(cwd, grafo),
            })
          })
          .catch((err) => {
            enviarJson(res, 500, { error: `no se pudo medir el estado: ${err.message}` })
          })
      })

      server.middlewares.use('/api/despiece/grafo', (req, res, next) => {
        const ruta = (req.url || '/').split('?')[0]
        if (ruta !== '/' && ruta !== '') return next()
        if (req.method !== 'GET') return enviarJson(res, 405, { error: 'method not allowed' })
        if (!origenValido(req)) return enviarJson(res, 403, { error: 'origin not allowed' })

        const refrescar = (req.url || '').includes('refrescar=1')
        if (cache && !refrescar) return enviarJson(res, 200, cache)

        // Se cargan aquí y no arriba para que el coste lo pague la primera
        // petición y no el arranque del servidor de desarrollo.
        Promise.all([
          server.ssrLoadModule('/scripts/lib/app-graph-io.ts'),
          server.ssrLoadModule('/src/scraper/app-graph.ts'),
        ])
          .then(([io, grafoMod]) => {
            const grafo = grafoMod.construirGrafoApp(io.leerEntradas(cwd))
            cache = { ...grafo, calculadoEn: new Date().toISOString() }
            enviarJson(res, 200, cache)
          })
          .catch((err) => {
            // Un fallo se DICE. Un despiece vacío que se pinta como si el
            // repositorio no tuviera piezas es el defecto que este mapa existe
            // para no cometer.
            enviarJson(res, 500, { error: `no se pudo construir el despiece: ${err.message}` })
          })
      })
    },
  }
}
