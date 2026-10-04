/**
 * La nota de debajo de las citas habla sólo de citas que el lector puede leer.
 *
 * `QuoteProvenanceNote` explica una vez, bajo el grupo de citas, qué concluir
 * de cada marca que llevan. Desde el 27-08-2026 una cita que la puerta
 * editorial retiene no se imprime: queda el hueco «Literal retenido», sin
 * chips. Pero la nota seguía sumando la marca de TRANSCRIPCIÓN de la retenida,
 * así que en f-2026-05-11-cit-a0a379 —y en 73d3cf, ea9d47 y 5b06c8— decía
 * «Sesión re-transcrita […] Las citas marcadas constan literalmente en la
 * transcripción anterior» bajo una ficha sin ninguna cita marcada a la vista:
 * la única que llevaba esa marca era la retenida. Lo señaló la relectura de
 * /hallazgos del 29-09-2026 (PR #179, señalamiento «L3»).
 *
 * El eje de CONTRASTE sí cuenta la retenida, y tiene que seguir haciéndolo: su
 * nota, la de «acusación no contrastada», es la que explica el hueco y lo nombra
 * por su rótulo.
 *
 * Contra los snapshots reales y en la copia que sirve el sitio (sin el literal
 * de las retenidas), en las dos superficies que pintan la nota: /hallazgos
 * (`FindingDetailCard`) y /plenos/:id (`FindingCard`), las dos con todas las
 * citas. Los mensajes de fallo nombran fichas, nunca el texto de una cita:
 * el repositorio y los registros de la CI son públicos, y el literal de una
 * retenida es justo lo que la ficha no reproduce.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FindingCard, QuoteProvenanceNote, quoteMarks } from '../../src/components/PlenoFindings'
import { citaRetenida } from '../../src/lib/cita-retenida'
import { FindingDetailCard } from '../../src/pages/Hallazgos'
import { provenanceFor } from '../../src/hooks/useFindingQuoteProvenance'
import { invalidateSnapshots, peekSnapshot } from '../../src/lib/snapshot-store'
import { retenerLiterales } from '../../src/scraper/literales-retenidos'
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

/** Los enlaces de la nota, uno por eje: sólo la nota los pinta. */
const ENLACE_TRANSCRIPCION = 'a[href="/metodologia#citas-transcripcion"]'
const ENLACE_CONTRASTE = 'a[href="/metodologia#citas-contraste"]'

/** El chip de transcripción de una cita, leído del componente; `null` si no lleva. */
const chipDeTranscripcion = (entry) =>
  MARKED_STATUS_IDS.includes(entry?.status) ? quoteMarks({ status: entry.status })[0]?.chip : null

/**
 * Las dos superficies y el tramo de citas que pinta cada una: las dos las
 * pintan todas (`FindingCard` cortaba en tres hasta que una frase del sumario
 * se quedó sin su cita a la vista).
 */
const SUPERFICIES = [
  {
    ruta: '/hallazgos',
    pinta: (f) => <FindingDetailCard f={f} permalink={`#${f.id}`} />,
    tramo: (n) => n,
  },
  { ruta: '/plenos/:id', pinta: (f) => <FindingCard f={f} />, tramo: (n) => n },
]

/**
 * Cada ficha con alguna retenida que lleve marca de transcripción, repartida
 * según quién más lleva esa marca en el tramo pintado. La retenida se decide
 * como en la página: `provenanceFor` + `citaRetenida`, nunca una puerta escrita
 * aquí a mano.
 */
function repartir(sup) {
  return SERVIDA.items.flatMap((f) => {
    const prov = provenanceFor(PROV, f.id)
    const impresas = new Set()
    const deRetenidas = new Set()
    const n = sup.tramo(f.quotes?.length ?? 0)
    for (let i = 0; i < n; i++) {
      const chip = chipDeTranscripcion(prov[i])
      if (!chip) continue
      if (citaRetenida(prov[i], f.quotes[i])) deRetenidas.add(chip)
      else impresas.add(chip)
    }
    if (deRetenidas.size === 0) return []
    return [
      {
        f,
        soloDeRetenidas: [...deRetenidas].filter((c) => !impresas.has(c)),
        compartidas: [...deRetenidas].filter((c) => impresas.has(c)),
        hayImpresasMarcadas: impresas.size > 0,
      },
    ]
  })
}

/**
 * Pinta la ficha y espera a la procedencia DE VERDAD: sin ella no hay nota, y
 * cualquier «no la explica» pasaría midiendo el estado de carga. Toda ficha que
 * se pinta aquí tiene una retenida, así que la nota de contraste es la señal.
 */
async function pintar(sup, f) {
  const utils = render(sup.pinta(f))
  await waitFor(() => {
    expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
  })
  utils.rerender(sup.pinta(f))
  await waitFor(() => {
    expect(
      utils.container.querySelector(ENLACE_CONTRASTE),
      `${f.id}: sin la nota de contraste que explica su hueco`,
    ).toBeTruthy()
  })
  return utils
}

describe.each(SUPERFICIES)('$ruta', (sup) => {
  const fichas = repartir(sup)
  const afectadas = fichas.filter((c) => c.soloDeRetenidas.length > 0)
  const mixtas = fichas.filter((c) => c.compartidas.length > 0)

  it('mide algo: hay fichas cuya marca de transcripción sólo la lleva una retenida, y mixtas', () => {
    expect(afectadas.length, 'ninguna ficha con la marca sólo en una retenida').toBeGreaterThan(0)
    expect(
      mixtas.length,
      'ninguna ficha con la marca en una retenida y una impresa',
    ).toBeGreaterThan(0)
  })

  it('la nota no explica una marca de transcripción que sólo lleva una cita retenida', async () => {
    const fallos = []
    for (const { f, soloDeRetenidas, hayImpresasMarcadas } of afectadas) {
      const { container, unmount } = await pintar(sup, f)
      // En toda la ficha, no sólo en la nota: ninguna cita impresa lleva ese
      // chip, así que dondequiera que salga habla de una cita que no se ve.
      for (const chip of soloDeRetenidas) {
        if (container.textContent.includes(chip)) fallos.push(`${f.id}: «${chip}»`)
      }
      if (!hayImpresasMarcadas && container.querySelector(ENLACE_TRANSCRIPCION)) {
        fallos.push(`${f.id}: enlace a cómo se comprueba una cita`)
      }
      unmount()
    }
    expect(fallos, 'fichas cuya nota habla de la transcripción de una cita retenida').toEqual([])
  })

  it('y la sigue explicando cuando la marca la lleva también una cita impresa', async () => {
    // El control: si la nota callara el eje entero en cuanto hay una retenida,
    // la prueba de arriba pasaría igual.
    const fallos = []
    for (const { f } of mixtas) {
      const { container, unmount } = await pintar(sup, f)
      if (!container.querySelector(ENLACE_TRANSCRIPCION)) fallos.push(f.id)
      unmount()
    }
    expect(fallos, 'fichas mixtas que perdieron la nota de transcripción').toEqual([])
  })
})

describe('la nota decide la retenida como la página', () => {
  it('una cita retenida por su puerta no suma su marca de transcripción, y sí la de contraste', () => {
    const { container } = render(
      <QuoteProvenanceNote entries={[{ status: 'solo-en-sustituida', gate: 'hidden' }]} />,
    )
    expect(container.querySelector(ENLACE_TRANSCRIPCION)).toBeNull()
    expect(container.textContent).not.toContain(
      chipDeTranscripcion({ status: 'solo-en-sustituida' }),
    )
    expect(container.querySelector(ENLACE_CONTRASTE)).toBeTruthy()
    expect(container.textContent).toContain(quoteMarks({ gate: 'hidden' })[0].chip)
  })

  it('una cita que la copia servida marca como retenida tampoco, aunque su fila diga otra cosa', () => {
    // Una procedencia de otro despliegue (caché del navegador) puede traer una
    // puerta distinta de la que retuvo el literal al compilar. La página pinta
    // el hueco (`citaRetenida` lee también `literalRetenido`); la nota tiene que
    // callar lo mismo que la página no imprime.
    const { container } = render(
      <QuoteProvenanceNote
        entries={[{ status: 'solo-en-sustituida', gate: 'toggle' }]}
        quotes={[{ literalRetenido: true }]}
      />,
    )
    expect(container.querySelector(ENLACE_TRANSCRIPCION)).toBeNull()
    expect(container.textContent).not.toContain(
      chipDeTranscripcion({ status: 'solo-en-sustituida' }),
    )
  })
})
