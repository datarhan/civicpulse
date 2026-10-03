/**
 * Cada nota numerada dice también de qué FICHA habla, no sólo de qué cita.
 *
 * #193 (29-09-2026) numeró las citas de cada ficha y obligó al hueco «Literal
 * retenido» y a la nota de debajo de las citas a decir de qué número hablan
 * (tests/components/citas-numeradas.test.jsx). Eso arregló la lectura cruzada
 * DENTRO de una ficha, y su cuerpo avisó de la que quedaba: la numeración es
 * por ficha, y la revisión lectora lee la página aplanada, en fragmentos que no
 * saben dónde acaba una.
 *
 * Volvió el 30-09-2026. En /hallazgos, f-2026-07-03-cit-df8455 y
 * f-2026-05-11-acu-a870a4 van seguidas y las dos tienen una cita 3: la de la
 * primera es un hueco; la de la segunda, un elogio impreso. Una relectura entera
 * de la página (42 fragmentos, `npm run review:surfaces -- /hallazgos`) leyó la
 * nota de la primera —«Cita 3 · acusación no contrastada — …» y «ni en la cita
 * 3, donde queda a la vista su hueco «Literal retenido»»— contra la cita 3
 * impresa de la segunda, y lo señaló dos veces. El fragmento que lo hizo
 * empezaba en la entrada de esa nota: la cabecera de df8455 se había quedado en
 * el fragmento anterior, y la única «CITA 3» a la vista era la de a870a4.
 *
 * `chunkRenderedText` corta el texto aplanado entre líneas, nunca dentro de una,
 * y con más probabilidad tras una línea larga: las de la nota son las más
 * largas de la ficha. Así que la regla va por LÍNEA. Cada línea que nombra una
 * cita por su número nombra también su ficha, con el código de su enlace
 * permanente (`codigoDeFicha`), el mismo que imprime su cabecera; ninguna nombra
 * el de otra; y lo mismo las cabeceras de la banda de cotejos, cuyo vídeo del
 * pleno se leyó en aquella pasada contra la ficha de otra sesión. Un fragmento
 * puede empezar en cualquier línea, pero no puede partir una.
 *
 * Se aplana como `innerText`, que es lo que lee la revisión
 * (`page.locator('body').innerText()` en scripts/review-surfaces.ts): un salto
 * en cada caja de bloque, en cada elemento de un contenedor flex y en cada
 * <br>, y nada de lo que un <details> cerrado esconde. Las fichas son las
 * publicadas, en la copia servida, y contiguas como las pinta cada página. Los
 * mensajes nombran fichas y números, nunca el texto de una cita: el repositorio
 * es público.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FindingCard, codigoDeFicha } from '../../src/components/PlenoFindings'
import { FindingDetailCard, agruparPorPleno } from '../../src/pages/Hallazgos'
import { citaRetenida } from '../../src/lib/cita-retenida'
import { provenanceFor } from '../../src/hooks/useFindingQuoteProvenance'
import { invalidateSnapshots, peekSnapshot } from '../../src/lib/snapshot-store'
import { retenerLiterales } from '../../src/scraper/literales-retenidos'
import { CATALOGUE, DEFAULT_LOCALE } from '../../src/i18n'

const ROOT = join(__dirname, '..', '..')
const FUENTE = JSON.parse(readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'))
const PROV = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
)
const SERVIDA = retenerLiterales(FUENTE, PROV).snapshot

const realFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/data/finding-quote-provenance.json')) {
      return new Response(JSON.stringify(PROV), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }
  invalidateSnapshots()
})

afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

/* ── El texto como lo lee la revisión ─────────────────────────────────────── */

const BLOQUES = new Set(
  'ADDRESS ARTICLE ASIDE BLOCKQUOTE DD DETAILS DIV DL DT FIELDSET FIGCAPTION FIGURE FOOTER FORM H1 H2 H3 H4 H5 H6 HEADER HR LI MAIN NAV OL P PRE SECTION SUMMARY TABLE TR UL'.split(
    ' ',
  ),
)
const FUERA = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'])

/** ¿Pone `innerText` un salto antes y después de este elemento? */
function esBloque(el) {
  // Un hijo de un contenedor flex o grid se vuelve bloque: por eso la pastilla
  // «sin contraste en los datos» sale en su propia línea.
  if (/flex|grid/.test(el.parentElement?.style?.display ?? '')) return true
  const display = el.style?.display ?? ''
  if (display) return !display.startsWith('inline') && display !== 'contents'
  return BLOQUES.has(el.tagName)
}

function aplanar(nodo, out = []) {
  // Un <details> cerrado sólo enseña su <summary>: la bitácora de correcciones.
  const cerrado = nodo.tagName === 'DETAILS' && !nodo.open
  for (const hijo of nodo.childNodes) {
    if (hijo.nodeType === 3) {
      if (!cerrado) out.push(hijo.textContent)
      continue
    }
    if (hijo.nodeType !== 1) continue
    if (cerrado && hijo.tagName !== 'SUMMARY') continue
    if (FUERA.has(hijo.tagName) || hijo.hidden || hijo.style?.display === 'none') continue
    if (hijo.tagName === 'BR') {
      out.push('\n')
      continue
    }
    const bloque = esBloque(hijo)
    if (bloque) out.push('\n')
    aplanar(hijo, out)
    if (bloque) out.push('\n')
  }
  return out
}

/** Las líneas de un elemento, como las cortaría `chunkRenderedText`. */
const lineasDe = (el) =>
  aplanar(el)
    .join('')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

/* ── Qué es una nota numerada ─────────────────────────────────────────────── */

/** «Cita 3», «la cita 3», «las citas 1, 2 y 4»: nombra citas por su número. */
const NOMBRA_CITAS = /\bcitas?\s+\d/i
/** El rótulo con que abre cada cita. Es a lo que apuntan las notas, no una nota. */
const ROTULO = /^cita \d+$/i
/** «Cita 3 de la…», «las citas 1, 2 y 4»: lo que el mensaje de un fallo enseña de la línea. */
const citasDe = (l) => l.match(/\bcitas?\s+\d+(?:(?:,\s*|\s+y\s+)\d+)*/i)[0]

/** Las cabeceras de la banda de cotejos, leídas del catálogo: nunca recitadas. */
const BANDAS = ['crossChecked', 'contradiction', 'provenance'].map(
  (k) => CATALOGUE[DEFAULT_LOCALE][`findings.refs.${k}`],
)

const nombraLaFicha = (codigo) => new RegExp(`\\bficha ${codigo}\\b`, 'i')

/**
 * Lo que una ficha dice de sus citas y de su banda de cotejos, línea a línea:
 * cada una tiene que nombrarla a ella y a ninguna otra de `otras`.
 */
function revisarFicha(f, lineas, otras) {
  const propio = codigoDeFicha(f.id)
  const fallos = []
  const notas = lineas.filter((l) => NOMBRA_CITAS.test(l) && !ROTULO.test(l))
  const bandas = lineas.filter((l) => BANDAS.some((b) => l.startsWith(b)))
  for (const [l, que] of [
    ...notas.map((l) => [l, `«${citasDe(l)}…»`]),
    ...bandas.map((l) => [l, `la cabecera «${BANDAS.find((b) => l.startsWith(b))}»`]),
  ]) {
    if (!nombraLaFicha(propio).test(l)) fallos.push(`${f.id}: ${que} no dice de qué ficha es`)
    for (const o of otras) {
      if (new RegExp(`\\b${o}\\b`, 'i').test(l)) fallos.push(`${f.id}: ${que} nombra la ficha ${o}`)
    }
  }
  // Y el nombre tiene a qué apuntar: la cabecera lo imprime antes de la primera cita.
  const cabecera = lineas.findIndex((l) => nombraLaFicha(propio).test(l))
  const primeraCita = lineas.findIndex((l) => ROTULO.test(l))
  if (cabecera === -1 || (primeraCita !== -1 && cabecera > primeraCita)) {
    fallos.push(`${f.id}: la cabecera no imprime «ficha ${propio}» antes de sus citas`)
  }
  return { fallos, notas: notas.length, bandas: bandas.length }
}

/* ── Las dos superficies, y sus fichas contiguas ──────────────────────────── */

const SUPERFICIES = [
  {
    ruta: '/hallazgos',
    pinta: (f) => <FindingDetailCard f={f} permalink={`/hallazgos/${f.id}`} />,
    tramo: (n) => n,
    // Una sola lista, en el orden en que la pinta la página.
    listas: () => [agruparPorPleno(SERVIDA.items).flatMap(([, lista]) => lista)],
  },
  {
    ruta: '/plenos/:id',
    pinta: (f) => <FindingCard f={f} />,
    tramo: (n) => Math.min(n, 3),
    // Una lista por pleno: la pestaña «Hallazgos» de cada sesión.
    listas: () => {
      const porPleno = new Map()
      for (const f of SERVIDA.items) {
        if (!porPleno.has(f.plenoId)) porPleno.set(f.plenoId, [])
        porPleno.get(f.plenoId).push(f)
      }
      return [...porPleno.values()]
    },
  },
]

/** Por cada cita que la superficie pinta: ¿es un hueco? Como lo decide la página. */
function huecos(sup, f) {
  const prov = provenanceFor(PROV, f.id)
  const quotes = f.quotes ?? []
  return quotes.slice(0, sup.tramo(quotes.length)).map((q, i) => citaRetenida(prov[i], q))
}

/**
 * Las parejas contiguas donde la lectura cruzada puede pasar: el mismo número
 * es un hueco en una ficha y una cita impresa en la otra. La del 30-09
 * (df8455 → a870a4, cita 3) es una de ellas mientras las dos sigan publicadas.
 */
function parejas(sup) {
  const out = []
  for (const lista of sup.listas()) {
    for (let i = 0; i + 1 < lista.length; i += 1) {
      const [a, b] = [lista[i], lista[i + 1]]
      const [ha, hb] = [huecos(sup, a), huecos(sup, b)]
      const numeros = ha.flatMap((h, j) => (j < hb.length && h !== hb[j] ? [j + 1] : []))
      if (numeros.length > 0) out.push({ a, b, numeros })
    }
  }
  return out
}

/** Pinta varias fichas seguidas, como la página, y espera a la procedencia DE VERDAD. */
async function pintarSeguidas(sup, fichas) {
  const arbol = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {fichas.map((f) => (
        <div key={f.id} data-ficha={f.id}>
          {sup.pinta(f)}
        </div>
      ))}
    </div>
  )
  const utils = render(arbol())
  await waitFor(() => {
    expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
  })
  utils.rerender(arbol())
  await waitFor(() => {
    expect(
      utils.container.querySelectorAll('a[href="/metodologia#citas-contraste"]').length,
      'sin la nota de contraste bajo las citas: no hay nada que medir',
    ).toBeGreaterThanOrEqual(fichas.length)
  })
  const lineas = (f) => lineasDe(utils.container.querySelector(`[data-ficha="${f.id}"]`))
  return { ...utils, lineas }
}

describe('codigoDeFicha', () => {
  it('es único entre las fichas publicadas y las retiradas: un nombre no señala dos', () => {
    const ids = [
      ...SERVIDA.items.map((f) => f.id),
      ...(SERVIDA.retractions ?? []).map((r) => r.findingId),
    ]
    const codigos = ids.map(codigoDeFicha)
    expect(ids.length).toBeGreaterThan(1)
    for (const [i, c] of codigos.entries()) {
      expect(c, `${ids[i]}: sin código`).toBeTruthy()
      expect(ids[i].endsWith(c), `${ids[i]}: el código no sale de su identificador`).toBe(true)
    }
    expect(new Set(codigos).size).toBe(ids.length)
  })
})

describe.each(SUPERFICIES)('$ruta', (sup) => {
  const contiguas = parejas(sup)

  it('mide algo: hay fichas contiguas con el mismo número de cita, hueco en una e impresa en la otra', () => {
    expect(contiguas.length).toBeGreaterThan(0)
  })

  it.each(contiguas.map((p) => [p.a.id, p.b.id, p.numeros.join(', '), p]))(
    '%s → %s (citas %s): cada nota numerada nombra su ficha, y no la contigua',
    async (_a, _b, _n, { a, b, numeros }) => {
      const { lineas, unmount } = await pintarSeguidas(sup, [a, b])
      const [la, lb] = [lineas(a), lineas(b)]
      // Lo que hace posible la lectura cruzada está en el texto: las dos fichas
      // abren una cita con el mismo rótulo, hueco en una e impresa en la otra.
      for (const n of numeros) {
        expect(la.filter((l) => l === `Cita ${n}`)).toHaveLength(1)
        expect(lb.filter((l) => l === `Cita ${n}`)).toHaveLength(1)
      }
      const [ra, rb] = [
        revisarFicha(a, la, [codigoDeFicha(b.id)]),
        revisarFicha(b, lb, [codigoDeFicha(a.id)]),
      ]
      expect(ra.notas, `${a.id}: ninguna nota numerada`).toBeGreaterThan(0)
      expect(rb.notas, `${b.id}: ninguna nota numerada`).toBeGreaterThan(0)
      expect([...ra.fallos, ...rb.fallos]).toEqual([])
      unmount()
    },
  )

  it('todas las fichas, seguidas como en la página: ninguna nota nombra otra ficha que la suya', async () => {
    const fallos = []
    let notas = 0
    let bandas = 0
    let fichas = 0
    for (const lista of sup.listas()) {
      const { lineas, unmount } = await pintarSeguidas(sup, lista)
      const codigos = lista.map((f) => codigoDeFicha(f.id))
      for (const f of lista) {
        const otras = codigos.filter((c) => c !== codigoDeFicha(f.id))
        const r = revisarFicha(f, lineas(f), otras)
        fallos.push(...r.fallos)
        notas += r.notas
        bandas += r.bandas
        fichas += 1
      }
      unmount()
    }
    // Midió algo: cada ficha tiene al menos la entrada de su nota, y su banda.
    expect(fichas).toBe(SERVIDA.items.length)
    expect(notas).toBeGreaterThanOrEqual(fichas)
    expect(bandas).toBeGreaterThanOrEqual(fichas)
    expect(fallos).toEqual([])
  })
})
