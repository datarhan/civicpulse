#!/usr/bin/env tsx
/**
 * check:cesel-entregas — ¿ha publicado el ministerio una entrega que aquí no
 * consta?
 *
 * El coste efectivo llega con un desfase estructural: un ejercicio se rinde
 * antes del 1 de noviembre del año siguiente (Orden HAP/2075/2014) y se publica
 * después. Eso hace normal que la página titule en 2024 durante todo 2026 — y
 * hace invisible el día en que deje de serlo. La lista de entregas se leía a
 * mano del desplegable del ministerio y se copiaba en dos scripts; nada la
 * volvía a mirar. Publicada la entrega de 2025, el sitio habría seguido
 * diciendo 2024 indefinidamente, con toda la suite en verde.
 *
 * TRES DESENLACES, no dos:
 *
 *   coincide      el desplegable y ENTREGAS dicen lo mismo          → exit 0
 *   divergen      hay entregas nuevas (o desaparecidas)             → exit 1
 *   no-alcanzable no se pudo leer la página                         → exit 0, y lo dice
 *
 * El tercero existe porque un `{}` de un ministerio caído y un `{}` de «no hay
 * nada nuevo» son indistinguibles si se colapsan, y el que se imprime entonces
 * es un visto bueno falso. Un ministerio inaccesible no tumba la nocturna —una
 * guarda que falla por causas ajenas es una guarda que se acaba ignorando— pero
 * tampoco firma nada.
 *
 * Usage: npm run check:cesel-entregas
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ENTREGAS,
  CONSULTA_URL,
  parseEntregasDisponibles,
  calendarioEntrega,
} from '../src/scraper/cesel-entregas'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SNAPSHOT = join(ROOT, 'public/data/coste-efectivo.json')

const UA = 'CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)'

async function paginaViva(): Promise<string | null> {
  try {
    const res = await fetch(CONSULTA_URL, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      console.warn(`[cesel-entregas] HTTP ${res.status} en la consulta`)
      return null
    }
    return await res.text()
  } catch (e) {
    console.warn(`[cesel-entregas] no se pudo leer la consulta: ${(e as Error).message}`)
    return null
  }
}

async function anioBasePublicado(): Promise<number | null> {
  try {
    const d = JSON.parse(await readFile(SNAPSHOT, 'utf8')) as {
      stats?: { anios?: number[] }
    }
    const anios = d.stats?.anios ?? []
    return anios.length ? Math.max(...anios) : null
  } catch {
    return null
  }
}

async function main() {
  const conocidas = Object.values(ENTREGAS).sort((a, b) => a - b)
  const html = await paginaViva()

  if (html === null) {
    console.log('[cesel-entregas] NO COMPROBADO — la consulta del ministerio no respondió.')
    console.log(
      `[cesel-entregas] no se ha verificado nada: las ${conocidas.length} entregas conocidas ` +
        `(${conocidas[0]}–${conocidas[conocidas.length - 1]}) siguen sin cotejar.`,
    )
    return
  }

  const vivas = parseEntregasDisponibles(html)
  const anios = Object.values(vivas).sort((a, b) => a - b)

  if (!anios.length) {
    // La página respondió pero no trae desplegable: un rediseño, un WAF que
    // devuelve una portada, un error 200. Tampoco es un visto bueno.
    console.log(
      '[cesel-entregas] NO COMPROBADO — la página respondió sin desplegable `ddlEntrega`.',
    )
    console.log('[cesel-entregas] revisar si la consulta cambió de forma o de URL.')
    return
  }

  const nuevas = anios.filter((a) => !conocidas.includes(a))
  const desaparecidas = conocidas.filter((a) => !anios.includes(a))

  // Imprescindible: decir cuántas comparó. «0 nuevas» y «no miré ninguna» se
  // ven igual desde fuera si no se cuenta en voz alta.
  console.log(
    `[cesel-entregas] ${anios.length} entregas en el desplegable ` +
      `(${anios[0]}–${anios[anios.length - 1]}), ${conocidas.length} en el repositorio.`,
  )

  const base = await anioBasePublicado()
  const cal = calendarioEntrega(base, new Date())
  if (cal) {
    console.log(
      `[cesel-entregas] publicado aquí: ${cal.ultima}. La de ${cal.proxima} ` +
        (cal.estado === 'en-plazo'
          ? `se rinde antes del 1-nov-${cal.venceEn}; aún no debería existir.`
          : `venció el 1-nov-${cal.venceEn}; ya puede aparecer en cualquier momento.`),
    )
  }

  if (!nuevas.length && !desaparecidas.length) {
    console.log('[cesel-entregas] ✓ coincide')
    return
  }

  if (nuevas.length) {
    console.error(
      `[cesel-entregas] ENTREGA NUEVA: el ministerio publica ${nuevas.join(', ')} y aquí no consta.`,
    )
    const ids = Object.entries(vivas)
      .filter(([, a]) => nuevas.includes(a))
      .map(([id, a]) => `${id}→${a}`)
    console.error(`[cesel-entregas] ids del desplegable: ${ids.join(', ')}`)
    console.error(
      '[cesel-entregas] añádelas a ENTREGAS en src/scraper/cesel-entregas.ts y luego:\n' +
        '                 npm run fetch:cesel-ccaa && npm run scrape:coste-efectivo && ' +
        'npm run compute:indicadores',
    )
  }
  if (desaparecidas.length) {
    console.error(
      `[cesel-entregas] entregas que el desplegable ya NO ofrece: ${desaparecidas.join(', ')}. ` +
        'El snapshot las sigue publicando; comprobar si la fuente las retiró.',
    )
  }
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
