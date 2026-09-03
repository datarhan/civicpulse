#!/usr/bin/env tsx
/**
 * ¿El mapa base sale sin marca de agua?
 *
 *   npm run check:basemap
 *   npm run check:basemap -- --json
 *
 * ## Por qué existe
 *
 * CARTO empezó a exigir clave en sus teselas ráster. Lo que hace sin ella no
 * es fallar: devuelve `200 image/png` con una tesela válida y «API KEY
 * REQUIRED» estampado en diagonal. Los cuatro mapas del sitio llevaron esa
 * marca sin que nada lo dijera, porque todas las puertas de este repositorio
 * miran códigos, datos y texto, y ésta es una diferencia de PÍXELES.
 *
 * Y lo medido el 3-sep-2026 es peor que eso:
 *
 *     sin clave                        md5 980b6824bf6ab60a72b447109530c119
 *     con clave inventada              md5 980b6824bf6ab60a72b447109530c119
 *
 * Byte a byte lo mismo. CARTO no responde 401 ni 403 a una clave inválida:
 * sirve la tesela marcada. De modo que una variable mal escrita, un secreto
 * sin poner en Vercel, una clave revocada o la cuota agotada producen el mismo
 * mapa marcado en producción, y NINGÚN control por HTTP puede distinguirlo de
 * acertar. Ésa es toda la razón de este fichero.
 *
 * ## Cómo lo mira, y por qué así
 *
 * Se pide la MISMA tesela dos veces —con clave y sin ella— y se comparan los
 * bytes. Si son idénticos, la clave no se está honrando.
 *
 * La alternativa era fijar el hash de la tesela marcada, y es peor: CARTO
 * redibuja su cartografía, el hash caducaría, y una puerta caducada aprueba
 * todo en silencio. Comparar contra la respuesta sin clave se recalibra sola
 * cada noche: sea cual sea la tesela de hoy, la pregunta sigue siendo «¿me
 * están dando algo distinto por tener clave?».
 *
 * ## Desenlaces
 *
 * Cuatro, no dos. Doblar «no he podido mirar» dentro de «bien» es el defecto
 * que este repositorio lleva pagando desde `r?.findings ?? []`. Los que
 * bloquean se declaran en `DESENLACES_QUE_BLOQUEAN`, no aquí.
 *
 *   ok            · la tesela con clave difiere de la que sale sin ella
 *   marcada       · idénticas → la clave no funciona            SALE 1
 *   sin-clave     · VITE_CARTO_API_KEY no está puesta           SALE 1
 *   inalcanzable  · el CDN no contesta → NO COMPROBADO          sale 0
 *
 * `inalcanzable` no bloquea, por el mismo criterio que `check:citations` con
 * sus URLs: una puerta que se pone roja porque se cayó una red ajena es una
 * puerta que se aprende a ignorar. Pero no imprime el visto bueno: dice que no
 * ha comprobado nada.
 *
 * ## Por qué no aparece en la tabla de inyecciones de `check:guards`
 *
 * Aquella tabla corrompe FICHEROS, y esta guarda no lee ninguno: su entrada es
 * la red y una variable de entorno. La inyección existe igual, en dos sitios:
 * `tests/basemap-check.test.ts` fija el caso de las dos huellas idénticas —que
 * es literalmente lo medido—, y contra el CDN de verdad se reproduce con
 *
 *     VITE_CARTO_API_KEY=not-a-real-key-000 npm run check:basemap   # → sale 1
 *
 * Que salga en la lista de «sin inyección» sin este párrafo se leería como un
 * descuido, y no lo es.
 *
 * La clave se lee del entorno, no de un `.env` cargado por nadie: en este
 * repositorio los scripts esperan que el `.env` venga ya en el entorno
 * (`set -a; . .env; set +a`). Cargarlo aquí a escondidas es como se acaba
 * midiendo una cosa distinta según quién invoque.
 */
import { tileUrl } from '../src/lib/basemap.js'
import { sha256Short } from '../src/scraper/hash.js'
import { bloquea, sinClaveConfigurada, valorar, type Parte } from '../src/scraper/basemap-check.js'

/** Una tesela cualquiera SOBRE el municipio: la que se ve al abrir la portada. */
const TESELA = { z: 13, x: 4082, y: 3114 }

const UA = 'CivicPulse/1.0 (+https://civicpulse.es; monitor ciudadano Riba-roja de Túria)'

/** Los bytes de una tesela, o null si no se pudo pedir. */
async function huella(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!r.ok) return null
    return sha256Short(Buffer.from(await r.arrayBuffer()).toString('base64'))
  } catch {
    return null
  }
}

function conCoordenadas(plantilla: string): string {
  // `{r}` a vacío: la versión @2x es otra imagen, y comparar peras con peras
  // importa más que comprobar la retina.
  return plantilla
    .replace('{z}', String(TESELA.z))
    .replace('{x}', String(TESELA.x))
    .replace('{y}', String(TESELA.y))
    .replace('{r}', '')
}

async function comprobar(clave: string | undefined): Promise<Parte> {
  if (!clave) return sinClaveConfigurada()
  const [conClave, sinClave] = await Promise.all([
    huella(conCoordenadas(tileUrl(clave))),
    huella(conCoordenadas(tileUrl(undefined))),
  ])
  return valorar(conClave, sinClave)
}

const json = process.argv.includes('--json')
const parte = await comprobar(process.env.VITE_CARTO_API_KEY)

if (json) {
  console.log(JSON.stringify(parte, null, 2))
} else {
  const etiqueta = bloquea(parte.desenlace)
    ? 'ERROR'
    : parte.desenlace === 'inalcanzable'
      ? 'AVISO'
      : 'OK'
  console.log(`${etiqueta} [${parte.desenlace}] mapa base — ${parte.mensaje}`)
  if (bloquea(parte.desenlace)) {
    console.log('  clave gratuita (uso no comercial): https://carto.com/basemaps/apikey')
    console.log('  se pone en VITE_CARTO_API_KEY — en .env y en el secreto de Actions')
  }
}

process.exit(bloquea(parte.desenlace) ? 1 : 0)
