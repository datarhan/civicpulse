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
 * `--json` emite el mismo veredicto en una línea, para que
 * `.github/workflows/cesel-entrega.yml` decida si vale la pena bajar los 45 MB.
 * El código de salida es el MISMO en los dos modos: quien lo llame desde bash
 * no tiene que aprenderse dos contratos.
 *
 * Usage: npm run check:cesel-entregas [-- --json]
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
const JSON_OUT = process.argv.includes('--json')

type Estado = 'coincide' | 'divergen' | 'no-alcanzable'

interface Veredicto {
  estado: Estado
  /** Por qué no se pudo comprobar. Sólo en `no-alcanzable`. */
  motivo?: string
  conocidas: number[]
  vivas: number[]
  nuevas: number[]
  desaparecidas: number[]
  /** id→año del desplegable, tal cual, para quien tenga que reescribir la lista. */
  desplegable: Record<string, number>
}

async function paginaViva(): Promise<string | null> {
  try {
    const res = await fetch(CONSULTA_URL, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      if (!JSON_OUT) console.warn(`[cesel-entregas] HTTP ${res.status} en la consulta`)
      return null
    }
    return await res.text()
  } catch (e) {
    if (!JSON_OUT)
      console.warn(`[cesel-entregas] no se pudo leer la consulta: ${(e as Error).message}`)
    return null
  }
}

async function anioBasePublicado(): Promise<number | null> {
  try {
    const d = JSON.parse(await readFile(SNAPSHOT, 'utf8')) as { stats?: { anios?: number[] } }
    const anios = d.stats?.anios ?? []
    return anios.length ? Math.max(...anios) : null
  } catch {
    return null
  }
}

async function veredicto(): Promise<Veredicto> {
  const conocidas = Object.values(ENTREGAS).sort((a, b) => a - b)
  const vacio = { conocidas, vivas: [], nuevas: [], desaparecidas: [], desplegable: {} }

  const html = await paginaViva()
  if (html === null) {
    return { estado: 'no-alcanzable', motivo: 'la consulta no respondió', ...vacio }
  }

  const desplegable = parseEntregasDisponibles(html)
  const vivas = Object.values(desplegable).sort((a, b) => a - b)
  if (!vivas.length) {
    // La página respondió pero no trae desplegable: un rediseño, un WAF que
    // devuelve una portada, un error 200. Tampoco es un visto bueno.
    return { estado: 'no-alcanzable', motivo: 'respondió sin desplegable ddlEntrega', ...vacio }
  }

  const nuevas = vivas.filter((a) => !conocidas.includes(a))
  const desaparecidas = conocidas.filter((a) => !vivas.includes(a))
  return {
    estado: nuevas.length || desaparecidas.length ? 'divergen' : 'coincide',
    conocidas,
    vivas,
    nuevas,
    desaparecidas,
    desplegable,
  }
}

async function main() {
  const v = await veredicto()

  if (JSON_OUT) {
    console.log(JSON.stringify(v))
    if (v.estado === 'divergen') process.exit(1)
    return
  }

  if (v.estado === 'no-alcanzable') {
    console.log(`[cesel-entregas] NO COMPROBADO — ${v.motivo}.`)
    console.log(
      `[cesel-entregas] no se ha verificado nada: las ${v.conocidas.length} entregas conocidas ` +
        `(${v.conocidas[0]}–${v.conocidas[v.conocidas.length - 1]}) siguen sin cotejar.`,
    )
    return
  }

  // Imprescindible: decir cuántas comparó. «0 nuevas» y «no miré ninguna» se
  // ven igual desde fuera si no se cuenta en voz alta.
  console.log(
    `[cesel-entregas] ${v.vivas.length} entregas en el desplegable ` +
      `(${v.vivas[0]}–${v.vivas[v.vivas.length - 1]}), ${v.conocidas.length} en el repositorio.`,
  )

  const cal = calendarioEntrega(await anioBasePublicado(), new Date())
  if (cal) {
    console.log(
      `[cesel-entregas] publicado aquí: ${cal.ultima}. La de ${cal.proxima} ` +
        (cal.estado === 'en-plazo'
          ? `se rinde antes del 1-nov-${cal.venceEn}; aún no debería existir.`
          : `venció el 1-nov-${cal.venceEn}; ya puede aparecer en cualquier momento.`),
    )
  }

  if (v.estado === 'coincide') {
    console.log('[cesel-entregas] ✓ coincide')
    return
  }

  if (v.nuevas.length) {
    console.error(
      `[cesel-entregas] ENTREGA NUEVA: el ministerio publica ${v.nuevas.join(', ')} y aquí no consta.`,
    )
    const ids = Object.entries(v.desplegable)
      .filter(([, a]) => v.nuevas.includes(a))
      .map(([id, a]) => `${id}→${a}`)
    console.error(`[cesel-entregas] ids del desplegable: ${ids.join(', ')}`)
    console.error(
      '[cesel-entregas] npm run sync:cesel-entregas la añade a la lista, y luego:\n' +
        '                 npm run fetch:cesel-ccaa && npm run scrape:coste-efectivo && ' +
        'npm run compute:indicadores',
    )
  }
  if (v.desaparecidas.length) {
    console.error(
      `[cesel-entregas] entregas que el desplegable ya NO ofrece: ${v.desaparecidas.join(', ')}. ` +
        'El snapshot las sigue publicando; comprobar si la fuente las retiró.',
    )
  }
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
