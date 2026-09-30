/**
 * Cada cita de una ficha dice cuál es, y el hueco y la nota dicen de cuál hablan.
 *
 * Una cita que la puerta editorial retiene deja en su sitio el hueco «Literal
 * retenido», con un pie que explica por qué, y bajo las citas una nota explica
 * cada marca. En /hallazgos, veinte fichas (29-09-2026) mezclan huecos y citas
 * impresas, y aplanada la página —lo que lee la revisión lectora, y también un
 * lector de pantalla o el copia-pega— desaparece el filete que separa un hueco
 * de la cita de encima. La revisión leyó el pie y la nota sobre la vecina una y
 * otra vez: «La ficha la atribuye a PSOE» contra una cita «sin atribuir», «Es
 * una acusación que…» contra una efeméride impresa, «acusación no contrastada —
 * es una acusación pública…» contra una cita «sin contraste — no es una
 * acusación». Nueve descartes entre el 29-08 y el 29-09-2026, cada uno anclado
 * a una ficha (#171, #179, #186), y cada composición nueva lo traía de vuelta.
 *
 * Se fija lo que lo arregla en la página, no en el registro de descartes:
 *
 *   1. cada cita abre con su número, impresa o retenida;
 *   2. cada frase del pie de un hueco que afirma algo de la cita la nombra por
 *      su número;
 *   3. cada línea de la nota dice de qué números habla, y son EXACTAMENTE los de
 *      las citas que el lector ve con esa marca. Se lee de la lista pintada, no
 *      de las reglas de la puerta: lo que se promete es que la nota y la lista
 *      digan lo mismo.
 *
 * En las dos superficies (/hallazgos: `FindingDetailCard`, todas las citas;
 * /plenos/:id: `FindingCard`, las tres primeras) y con la copia servida, que no
 * trae el literal de las retenidas. Los mensajes nombran fichas y números, nunca
 * el texto de una cita: el repositorio es público.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  FindingCard,
  nombrarCitas,
  quoteMarks,
  ROTULO_CITA_RETENIDA,
} from '../../src/components/PlenoFindings'
import { FindingDetailCard } from '../../src/pages/Hallazgos'
import { citaRetenida, PUERTA_QUE_RETIENE } from '../../src/lib/cita-retenida'
import { provenanceFor } from '../../src/hooks/useFindingQuoteProvenance'
import { invalidateSnapshots, peekSnapshot } from '../../src/lib/snapshot-store'
import { retenerLiterales } from '../../src/scraper/literales-retenidos'
import { CLAIM_VISIBILITIES } from '../../src/scraper/claim-public-gate'
import { MARKED_STATUS_IDS } from '../../src/scraper/quote-provenance'

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

/** Los rótulos de marca, leídos del componente: nunca recitados aquí. */
const CHIP_RETENIDA = quoteMarks({ gate: PUERTA_QUE_RETIENE })[0].chip
const CHIPS = [
  ...CLAIM_VISIBILITIES.map((gate) => quoteMarks({ gate })[0]?.chip),
  ...MARKED_STATUS_IDS.map((status) => quoteMarks({ status })[0]?.chip),
].filter(Boolean)

const SUPERFICIES = [
  {
    ruta: '/hallazgos',
    pinta: (f) => <FindingDetailCard f={f} permalink={`#${f.id}`} />,
    tramo: (n) => n,
  },
  { ruta: '/plenos/:id', pinta: (f) => <FindingCard f={f} />, tramo: (n) => Math.min(n, 3) },
]

/**
 * Las fichas que mezclan, en el tramo que pinta la superficie, huecos y citas
 * impresas: donde la lectura cruzada puede pasar. La retenida se decide como en
 * la página, con `provenanceFor` + `citaRetenida`.
 */
function mixtas(sup) {
  return SERVIDA.items.filter((f) => {
    const prov = provenanceFor(PROV, f.id)
    const tramo = (f.quotes ?? []).slice(0, sup.tramo(f.quotes?.length ?? 0))
    const retenidas = tramo.filter((q, i) => citaRetenida(prov[i], q)).length
    return retenidas > 0 && retenidas < tramo.length
  })
}

/** Pinta la ficha y espera a la procedencia DE VERDAD: sin ella no hay huecos ni nota. */
async function pintar(sup, f) {
  const utils = render(sup.pinta(f))
  await waitFor(() => {
    expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
  })
  utils.rerender(sup.pinta(f))
  await waitFor(() => {
    expect(
      utils.container.querySelector('a[href="/metodologia#citas-contraste"]'),
      `${f.id}: sin la nota de contraste que explica sus huecos`,
    ).toBeTruthy()
  })
  return utils
}

/** Las citas tal como las pinta la ficha: la lista que lleva figuras, y sus elementos. */
function citasPintadas(container) {
  const lista = [...container.querySelectorAll('ol')].find((ol) => ol.querySelector('figure'))
  return lista ? [...lista.children] : []
}

/** «Citas 1, 2 y 4 · …» → [1, 2, 4]. */
const numerosDe = (s) =>
  s
    .split(/, | y /)
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)

/** Las líneas de la nota: su rótulo en negrita, «Cita(s) N · marca». */
function lineasDeLaNota(container) {
  return [...container.querySelectorAll('strong')].flatMap((s) => {
    const m = s.textContent.match(/^Citas? ([\d, y]+) · (.+)$/)
    return m ? [{ numeros: numerosDe(m[1]), chip: m[2].trim() }] : []
  })
}

describe('nombrarCitas', () => {
  it('nombra una, dos o más citas por su número, y concuerda', () => {
    expect(nombrarCitas([2])).toEqual({ plural: false, rotulo: 'Cita 2', sujeto: 'la cita 2' })
    expect(nombrarCitas([1, 3])).toEqual({
      plural: true,
      rotulo: 'Citas 1 y 3',
      sujeto: 'las citas 1 y 3',
    })
    expect(nombrarCitas([1, 2, 4]).rotulo).toBe('Citas 1, 2 y 4')
    expect(nombrarCitas([1, 2, 4]).sujeto).toBe('las citas 1, 2 y 4')
  })
})

describe.each(SUPERFICIES)('$ruta', (sup) => {
  const fichas = mixtas(sup)

  it('mide algo: hay fichas que mezclan huecos y citas impresas', () => {
    expect(fichas.length, 'ninguna ficha mezcla huecos y citas impresas').toBeGreaterThan(0)
  })

  it('cada cita abre con su número, impresa o retenida', async () => {
    const fallos = []
    for (const f of fichas) {
      const { container, unmount } = await pintar(sup, f)
      const n = sup.tramo(f.quotes.length)
      const citas = citasPintadas(container)
      if (citas.length !== n) fallos.push(`${f.id}: ${citas.length} citas numeradas de ${n}`)
      citas.forEach((li, i) => {
        if (!li.textContent.trim().startsWith(`Cita ${i + 1}`)) {
          fallos.push(`${f.id}: la cita ${i + 1} no abre con su número`)
        }
      })
      unmount()
    }
    expect(fallos).toEqual([])
  })

  it('el pie de cada hueco nombra su cita en todo lo que afirma de ella', async () => {
    const fallos = []
    let huecos = 0
    for (const f of fichas) {
      const { container, unmount } = await pintar(sup, f)
      citasPintadas(container).forEach((li, i) => {
        const texto = li.textContent
        if (!texto.includes(ROTULO_CITA_RETENIDA)) return
        huecos += 1
        if (texto.split(ROTULO_CITA_RETENIDA).length !== 2) {
          fallos.push(`${f.id}: el hueco de la cita ${i + 1} repite su rótulo`)
        }
        const pie = li.querySelector('figcaption')?.textContent ?? ''
        // Las frases que dicen algo de la cita: que es una acusación, a quién se
        // atribuye. Una que no la nombre se puede pegar a la cita de al lado.
        for (const frase of pie.split(/(?<=\.)\s+/)) {
          if (/acusaci|atribu/i.test(frase) && !frase.includes(`cita ${i + 1}`)) {
            fallos.push(`${f.id}: una frase del hueco de la cita ${i + 1} no dice de cuál habla`)
          }
        }
      })
      unmount()
    }
    // Midió algo: cada ficha elegida tiene al menos un hueco.
    expect(huecos).toBeGreaterThanOrEqual(fichas.length)
    expect(fallos).toEqual([])
  })

  it('cada línea de la nota nombra exactamente las citas que el lector ve con esa marca', async () => {
    const fallos = []
    // Sin lista, las dos mitades de la comparación salen vacías y coinciden: la
    // primera versión de esta prueba pasó así contra la página de antes. Se
    // cuentan las comparaciones que tenían algo que comparar.
    let comparadas = 0
    for (const f of fichas) {
      const { container, unmount } = await pintar(sup, f)
      const citas = citasPintadas(container)
      if (citas.length === 0) fallos.push(`${f.id}: sin lista de citas numeradas`)
      const lineas = lineasDeLaNota(container)
      for (const chip of new Set(CHIPS)) {
        // Lo que la lista enseña: las citas impresas con ese rótulo en su
        // literal, y —la marca de la retenida— los huecos.
        const vistas = citas.flatMap((li, i) => {
          const bq = li.querySelector('blockquote')
          const hueco = li.textContent.includes(ROTULO_CITA_RETENIDA)
          if (bq?.textContent.includes(chip)) return [i + 1]
          return chip === CHIP_RETENIDA && hueco ? [i + 1] : []
        })
        const enLaNota = lineas.filter((l) => l.chip === chip).flatMap((l) => l.numeros)
        if (vistas.length > 0) comparadas += 1
        if (JSON.stringify(enLaNota) !== JSON.stringify(vistas)) {
          fallos.push(
            `${f.id}: «${chip}» — la nota nombra [${enLaNota}] y la lista lo enseña en [${vistas}]`,
          )
        }
      }
      unmount()
    }
    // Cada ficha elegida tiene al menos un hueco, y el hueco lleva su marca.
    expect(comparadas).toBeGreaterThanOrEqual(fichas.length)
    expect(fallos).toEqual([])
  })

  it('la entrada de la nota dice qué citas se cotejaron: las que llevan una marca de contraste', async () => {
    const contraste = CLAIM_VISIBILITIES.map((gate) => quoteMarks({ gate })[0]?.chip).filter(
      Boolean,
    )
    const fallos = []
    for (const f of fichas) {
      const { container, unmount } = await pintar(sup, f)
      const esperadas = lineasDeLaNota(container)
        .filter((l) => contraste.includes(l.chip))
        .flatMap((l) => l.numeros)
        .sort((a, b) => a - b)
      const entrada = [...container.querySelectorAll('div')]
        .map((d) => d.textContent.match(/^(?:La cita|Las citas) ([\d, y]+) se cotej/))
        .filter(Boolean)
        .at(-1)
      const nombradas = entrada ? numerosDe(entrada[1]) : null
      if (JSON.stringify(nombradas) !== JSON.stringify(esperadas)) {
        fallos.push(
          `${f.id}: la entrada nombra [${nombradas ?? 'ninguna'}], cotejadas [${esperadas}]`,
        )
      }
      unmount()
    }
    expect(fallos).toEqual([])
  })
})
