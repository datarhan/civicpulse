/**
 * El censo tipográfico: qué escalón y qué tinta usa CADA ruta, medidos en el
 * navegador.
 *
 * Por qué hace falta uno más. `tests/type-scale.test.js` ya prueba que la
 * escala DECLARA ocho pasos, que van en rem y que ningún fichero escribe un
 * tamaño a mano; `tests/brand-tokens.test.js` prueba que hay tres tintas y que
 * las tres cumplen AA. Las dos puertas leen el CÓDIGO FUENTE y las dos estaban
 * verdes el día que se midió esto:
 *
 *     /eficiencia · 395 de 415 elementos con texto a 13 px o menos  (95 %)
 *     /gestion    · 222 de 246                                      (90 %)
 *     `--fs-head` (16 px), el escalón cuyo trabajo declarado es «encabezado de
 *     bloque», aparecía UNA vez en cada página — y en las dos era un <h3>
 *     metido dentro de un <h2> a 14 px.
 *
 * Ningún tamaño estaba fuera de la escala. Todos eran pasos legales. Lo que
 * estaba mal era el REPARTO, y un grep no puede verlo: sólo se ve componiendo
 * la página. Es la misma familia que la banda de /eficiencia que salió
 * midiendo la mitad del hueco con toda la suite verde — «verde» y «bien» son
 * afirmaciones distintas, y sólo una habla de lo que ve un lector.
 *
 * El censo mide sobre el navegador y responde a cuatro preguntas por ruta:
 *
 *   1. reparto por escalón   — ¿cuánta página vive en los tres pasos de abajo?
 *   2. reparto por tinta     — ¿cuánta página está escrita en el escalón meta?
 *   3. encabezados           — ¿hay <h2> de verdad, y a qué tamaño?
 *   4. fuera de escala       — tamaños, radios y anchos que no son de la casa
 *
 * Uso:
 *   npm run build && npx vite preview --port 4173
 *   npx tsx scripts/censo-tipografico.ts                    # todas las rutas
 *   npx tsx scripts/censo-tipografico.ts /eficiencia        # una
 *   npx tsx scripts/censo-tipografico.ts --json censo.json  # guarda el parte
 *   npx tsx scripts/censo-tipografico.ts --contra censo.json  # compara
 *
 * El parte separa CUATRO desenlaces por ruta, nunca dos: `medida`, `vacía`
 * (cargó pero no había texto), `error` (no cargó) y `no-intentada`. Doblar «no
 * la intenté» dentro de «sin problemas» es cómo una pasada anterior de esta
 * casa dijo «re-juzgados 1017» sin haber hecho una sola llamada.
 */
import { chromium, type Browser, type Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { STRICT_ROUTES } from '../tests/e2e/_rutas'

const BASE = process.env.CENSO_BASE ?? 'http://localhost:4173'

/** Los ocho pasos, leídos de index.css y no repetidos aquí. */
export function pasosDeclarados(css = readFileSync('src/index.css', 'utf8')) {
  const pasos: Record<string, number> = {}
  for (const m of css.matchAll(/--fs-([a-z]+):\s*([^;]+);/g)) {
    const raw = m[2].trim()
    const rem = /(-?[\d.]+)rem/.exec(raw)
    const px = /(-?[\d.]+)px/.exec(raw)
    // `max(11px, .7857rem)` declara los dos; a raíz 14 gana el rem salvo en el
    // suelo, así que se toma el mayor, que es lo que compone el navegador.
    const cand = [rem ? parseFloat(rem[1]) * 14 : null, px ? parseFloat(px[1]) : null].filter(
      (n): n is number => n !== null,
    )
    if (cand.length) pasos[m[1]] = Math.max(...cand)
  }
  return pasos
}

/** Los tres tiers de tinta, también leídos y no repetidos. */
export function tintasDeclaradas(css = readFileSync('src/index.css', 'utf8')) {
  // El corte va contra el SELECTOR, no contra la cadena: `html.dark` aparece
  // antes dentro de un comentario del bloque :root («no se redefine en
  // html.dark»), y cortar ahí dejaba fuera los tres tiers de tinta, que se
  // declaran veinte líneas más abajo. El censo entonces decía «sin token» —
  // que es un cero con forma de dato, justo lo que este fichero vigila.
  const fin = css.search(/^html\.dark\s*\{/m)
  const raiz = css.slice(css.indexOf(':root'), fin > 0 ? fin : undefined)
  const t: Record<string, string> = {}
  for (const m of raiz.matchAll(
    /--(ink\d*|civic-ink|warn-ink|crit-ink|ok-ink|intel-ink):\s*([^;]+);/g,
  ))
    t[m[1]] = m[2].trim()
  return t
}

export type CensoRuta = {
  ruta: string
  desenlace: 'medida' | 'vacia' | 'error'
  motivo?: string
  elementos: number
  prosa: number
  prosaPequena: number
  prosaGris: number
  porTamano: Record<string, number>
  porTinta: Record<string, number>
  encabezados: { tag: string; px: number; peso: string; texto: string }[]
  seccionesSinNivel: number
  saltos: string[]
  anchos: Record<string, number>
  altoDoc: number
}

/** Lo que se mide dentro de la página. Se serializa entero a `evaluate`. */
const SONDA = () => {
  const raiz = document.querySelector('main') ?? document.body
  const todos = Array.from(raiz.querySelectorAll<HTMLElement>('*'))
  const conTexto = todos.filter((e) =>
    Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim()),
  )
  const porTamano: Record<string, number> = {}
  const porTinta: Record<string, number> = {}
  // Prosa: un elemento cuyo texto propio es una FRASE, no una etiqueta ni una
  // unidad. Contar «cuántos elementos van a 13 px o menos» mete en el mismo
  // saco los cientos de «€/m²», «n=41» y «2026-T1» de un cuadro de mando, que
  // a 12 px están donde deben. Lo que el lector nota es la frase escrita por
  // debajo del cuerpo, y eso hay que contarlo aparte.
  let prosa = 0
  let prosaPequena = 0
  let prosaGris = 0
  for (const e of conTexto) {
    const cs = getComputedStyle(e)
    const px = Math.round(parseFloat(cs.fontSize) * 10) / 10
    porTamano[String(px)] = (porTamano[String(px)] ?? 0) + 1
    porTinta[cs.color] = (porTinta[cs.color] ?? 0) + 1
    const propio = Array.from(e.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent!.trim())
      .join(' ')
    if (propio.length >= 60 && propio.includes(' ')) {
      prosa++
      // El corte va en 12,6 y no en 13,6, y la diferencia es una decisión, no
      // un ajuste. `aux` (13 px) tiene un trabajo declarado —«descripción
      // auxiliar y subtítulos»— así que una frase ahí puede ser exactamente lo
      // que debe. `meta` (12) y `micro` (11) NO: sus trabajos son la fecha, la
      // fuente, el contador y la etiqueta. Una frase de sesenta caracteres en
      // el escalón de las etiquetas es la infracción; contar también las de 13
      // metía en el mismo saco los pies de tabla, que están bien.
      if (px < 12.6) prosaPequena++
      const a = /rgba?\([^)]*?([\d.]+)\)/.exec(cs.color)
      if (a && parseFloat(a[1]) <= 0.7 && cs.color.startsWith('rgba')) prosaGris++
    }
  }
  const encabezados = Array.from(raiz.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')).map(
    (h) => ({
      tag: h.tagName,
      px: Math.round(parseFloat(getComputedStyle(h).fontSize) * 10) / 10,
      peso: getComputedStyle(h).fontWeight,
      texto: (h.textContent ?? '').trim().slice(0, 60),
    }),
  )
  // Un encabezado de sección que no es un elemento de encabezado: para un
  // lector de pantalla la página no tiene esa sección. `SectionHead` pintaba
  // un <div> en 187 sitios.
  const seccionesSinNivel = raiz.querySelectorAll(
    '[data-section-head]:not(h1):not(h2):not(h3)',
  ).length
  // Saltos de nivel: h1→h3 sin h2 por medio. Es exactamente lo que puede
  // romper dar nivel semántico a un encabezado que hasta ahora era un <div>,
  // así que se mide en vez de suponerse. axe lo marca `moderate` y la puerta
  // de esta casa filtra a critical/serious, de modo que NO lo cazaría.
  const saltos: string[] = []
  let previo = 0
  for (const h of encabezados) {
    const n = Number(h.tag[1])
    if (previo && n > previo + 1) saltos.push(`h${previo}→h${n} « ${h.texto} »`)
    previo = n
  }
  const anchos: Record<string, number> = {}
  for (const e of todos) {
    const r = e.getBoundingClientRect()
    if (r.width > 600 && r.height > 60) {
      const w = String(Math.round(r.width))
      anchos[w] = (anchos[w] ?? 0) + 1
    }
  }
  return {
    elementos: conTexto.length,
    prosa,
    prosaPequena,
    prosaGris,
    porTamano,
    porTinta,
    encabezados,
    seccionesSinNivel,
    saltos,
    anchos,
    altoDoc: document.documentElement.scrollHeight,
  }
}

async function medirRuta(page: Page, ruta: string): Promise<CensoRuta> {
  const base = {
    ruta,
    elementos: 0,
    prosa: 0,
    prosaPequena: 0,
    prosaGris: 0,
    porTamano: {},
    porTinta: {},
    encabezados: [],
    seccionesSinNivel: 0,
    saltos: [],
    anchos: {},
    altoDoc: 0,
  }
  try {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(400)
    const d = await page.evaluate(SONDA)
    if (!d.elementos) return { ...base, desenlace: 'vacia', motivo: 'ningún elemento con texto' }
    return { ruta, desenlace: 'medida', ...d }
  } catch (e) {
    return { ...base, desenlace: 'error', motivo: String((e as Error).message).slice(0, 120) }
  }
}

/** Reparte los tamaños medidos entre los ocho pasos y lo que no es ninguno. */
export function reparto(porTamano: Record<string, number>, pasos: Record<string, number>) {
  const nombre = (px: number) => {
    for (const [k, v] of Object.entries(pasos)) if (Math.abs(v - px) < 0.6) return k
    return null
  }
  const total = Object.values(porTamano).reduce((a, b) => a + b, 0)
  const porPaso: Record<string, number> = {}
  const fuera: Record<string, number> = {}
  let pequeno = 0
  for (const [px, n] of Object.entries(porTamano)) {
    const k = nombre(parseFloat(px))
    if (k) porPaso[k] = (porPaso[k] ?? 0) + n
    else fuera[px] = (fuera[px] ?? 0) + n
    if (parseFloat(px) <= 13.2) pequeno += n
  }
  return { total, porPaso, fuera, cuotaPequeno: total ? pequeno / total : 0 }
}

async function main() {
  const args = process.argv.slice(2)
  const jsonIdx = args.indexOf('--json')
  const destino = jsonIdx >= 0 ? args[jsonIdx + 1] : null
  const contraIdx = args.indexOf('--contra')
  const contra = contraIdx >= 0 ? args[contraIdx + 1] : null
  // Los valores de --json/--contra son rutas de disco y empiezan por «/»
  // igual que una ruta del sitio. Sin descontarlos, el censo medía el fichero
  // de salida: el SPA sirve su catch-all para cualquier URL desconocida, así
  // que la petición devolvía 200 y el parte salía verde midiendo la portada.
  const consumidos = new Set([destino, contra].filter(Boolean) as string[])
  const rutas = args.filter((a) => a.startsWith('/') && !consumidos.has(a))
  const objetivo: string[] = rutas.length ? rutas : (STRICT_ROUTES as string[])

  const pasos = pasosDeclarados()
  const tintas = tintasDeclaradas()
  console.log(
    `censo · ${objetivo.length} rutas · ${Object.keys(pasos).length} pasos declarados · base ${BASE}\n`,
  )

  let browser: Browser | null = null
  const partes: CensoRuta[] = []
  const noIntentadas: string[] = []
  try {
    browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    for (const [i, ruta] of objetivo.entries()) {
      const p = await medirRuta(page, ruta)
      partes.push(p)
      const r = reparto(p.porTamano, pasos)
      const h2 = p.encabezados.filter((h) => h.tag === 'H2')
      const h2Peq = h2.filter((h) => h.px <= pasos.body + 0.6).length
      const marca =
        p.desenlace !== 'medida'
          ? '· ' + p.desenlace
          : `prosa ${String(p.prosaPequena).padStart(3)}/${String(p.prosa).padEnd(3)} en etiqueta · ` +
            `gris ${String(Math.round((100 * p.prosaGris) / Math.max(1, p.prosa))).padStart(3)} % · ` +
            `head×${String(r.porPaso.head ?? 0).padStart(2)} · ` +
            `h2 ${h2.length - h2Peq}/${h2.length} bien · ` +
            `${Object.keys(p.anchos).length} anchos` +
            (Object.keys(r.fuera).length ? ` · FUERA ${Object.keys(r.fuera).join(',')}` : '') +
            (p.saltos.length ? ` · SALTO×${p.saltos.length}` : '')
      console.log(`${String(i + 1).padStart(3)}. ${ruta.padEnd(42)} ${marca}`)
    }
  } finally {
    await browser?.close()
  }
  for (const r of objetivo) if (!partes.some((p) => p.ruta === r)) noIntentadas.push(r)

  const medidas = partes.filter((p) => p.desenlace === 'medida')
  console.log(
    `\nmedidas ${medidas.length} · vacías ${partes.filter((p) => p.desenlace === 'vacia').length} · ` +
      `errores ${partes.filter((p) => p.desenlace === 'error').length} · no intentadas ${noIntentadas.length}`,
  )
  if (!medidas.length) {
    console.error('\nCERO rutas medidas. ¿Está levantado el preview en ' + BASE + '?')
    process.exitCode = 1
    return
  }

  const agr = medidas.reduce(
    (a, p) => {
      const r = reparto(p.porTamano, pasos)
      a.total += r.total
      a.peq += Math.round(r.cuotaPequeno * r.total)
      a.head += r.porPaso.head ?? 0
      a.card += r.porPaso.card ?? 0
      a.prosa += p.prosa
      a.prosaPeq += p.prosaPequena
      a.prosaGris += p.prosaGris
      for (const [c, n] of Object.entries(p.porTinta)) a.tinta[c] = (a.tinta[c] ?? 0) + n
      return a
    },
    {
      total: 0,
      peq: 0,
      head: 0,
      card: 0,
      prosa: 0,
      prosaPeq: 0,
      prosaGris: 0,
      tinta: {} as Record<string, number>,
    },
  )
  console.log(
    `\nTODO EL SITIO · ${agr.total} elementos con texto\n` +
      `  a 13 px o menos ....... ${((100 * agr.peq) / agr.total).toFixed(0)} %\n` +
      `  frases en escalón de etiqueta . ${agr.prosaPeq} de ${agr.prosa} ` +
      `(${((100 * agr.prosaPeq) / Math.max(1, agr.prosa)).toFixed(0)} %)\n` +
      `  frases en tinta clara . ${((100 * agr.prosaGris) / Math.max(1, agr.prosa)).toFixed(0)} %\n` +
      `  en el paso «head» ..... ${agr.head}\n` +
      `  en el paso «card» ..... ${agr.card}`,
  )
  // Se compara sin espacios y con el alfa normalizado: el navegador devuelve
  // `rgba(11, 15, 25, 0.62)` y el token está escrito igual, pero un `.62` sin
  // cero delante en el CSS no casaría con el `0.62` computado.
  const norm = (c: string) => {
    const h = /^#([0-9a-f]{6})$/i.exec(c.trim())
    if (h) {
      const n = parseInt(h[1], 16)
      return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`
    }
    return c.replace(/\s/g, '').replace(/,\./g, ',0.')
  }
  const cuota = (tok: string) => {
    const v = tintas[tok] && norm(tintas[tok])
    if (!v) return null
    const n = Object.entries(agr.tinta).reduce((a, [c, k]) => a + (norm(c) === v ? k : 0), 0)
    return (100 * n) / agr.total
  }
  for (const tok of ['ink', 'ink70', 'ink50']) {
    const c = cuota(tok)
    console.log(
      `  en la tinta «${tok}»`.padEnd(24, '.') +
        ` ${c === null ? 'sin token' : c.toFixed(0) + ' %'}`,
    )
  }

  if (destino) {
    writeFileSync(destino, JSON.stringify({ pasos, partes, noIntentadas }, null, 1))
    console.log(`\nparte guardado en ${destino}`)
  }
  if (contra) {
    const antes = JSON.parse(readFileSync(contra, 'utf8'))
    console.log('\ncontra ' + contra + ':')
    for (const p of medidas) {
      const a = antes.partes.find((x: CensoRuta) => x.ruta === p.ruta)
      if (!a || a.desenlace !== 'medida') continue
      const ra = reparto(a.porTamano, antes.pasos)
      const rb = reparto(p.porTamano, pasos)
      const d = Math.round((rb.cuotaPequeno - ra.cuotaPequeno) * 100)
      const dh = (rb.porPaso.head ?? 0) - (ra.porPaso.head ?? 0)
      if (d || dh)
        console.log(
          `  ${p.ruta.padEnd(42)} ≤13px ${d > 0 ? '+' : ''}${d} pp · head ${dh > 0 ? '+' : ''}${dh}`,
        )
    }
  }
}

// Sólo como CLI: el módulo lo importa `tests/censo-tipografico.test.js` para
// reusar `pasosDeclarados`/`reparto` sin levantar un navegador.
if (process.argv[1]?.endsWith('censo-tipografico.ts')) main()
