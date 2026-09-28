/**
 * Lo que pinta la página con la copia SERVIDA de `pleno-findings.json`: la que,
 * desde el 28-09-2026, llega sin el literal de las citas retenidas
 * (`src/scraper/literales-retenidos.ts`, aplicado al compilar por
 * `publication-denylist.js`).
 *
 * Tres caminos por los que la página imprimía el literal que el hueco
 * «Literal retenido» dice retener, medidos ese día:
 *
 *   1. La bitácora de correcciones. Un reanclaje publica `original` y
 *      `corrected`, y los dos son el literal. Va dentro de un `<details>`
 *      cerrado, así que `innerText` —lo que mira la prueba e2e— no lo veía, pero
 *      estaba en el DOM: el rastreador, el lector de pantalla y el copia-pega sí.
 *   2. Cmd+K, que enseñaba los 80 primeros caracteres de la primera cita de
 *      cada ficha (8 fichas empezaban por una retenida). Lo cerró #162, que dejó
 *      el buscador sin citas ni grupo; su prueba es cmdk-cita-retenida.test.jsx.
 *   3. El propio hueco dependía de la procedencia: sin ella —el fichero no llega,
 *      o tarda—, la cita se pintaba como cita, y con la copia servida eso sería
 *      una cita vacía, «», atribuida a un grupo.
 *
 * Todo se afirma sobre `textContent`: el rastreador, el lector de pantalla y el
 * copia-pega leen también lo que un `<details>` cerrado esconde.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CitaRetenida, FindingCard, ROTULO_CITA_RETENIDA } from '../../src/components/PlenoFindings'
import { FindingDetailCard } from '../../src/pages/Hallazgos'
import { BitacoraCorrecciones } from '../../src/components/BitacoraCorrecciones'
import { invalidateSnapshots, peekSnapshot } from '../../src/lib/snapshot-store'
import {
  HUELLA_RE,
  PUERTA_QUE_RETIENE,
  retenerLiterales,
  versionesDeCitas,
} from '../../src/scraper/literales-retenidos'
import { quoteAppearsIn } from '../../src/scraper/quote-match'

const ROOT = join(__dirname, '..', '..')
const FUENTE = JSON.parse(readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'))
const PROV = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
)
const SERVIDA = retenerLiterales(FUENTE, PROV).snapshot

const realFetch = globalThis.fetch
let conProcedencia = true

beforeEach(() => {
  conProcedencia = true
  globalThis.fetch = async (url) => {
    if (conProcedencia && String(url).endsWith('/data/finding-quote-provenance.json')) {
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

const retenidasDe = (f) =>
  (f.quotes ?? []).flatMap((_q, i) =>
    PROV.quotes?.[f.id]?.[i]?.gate === PUERTA_QUE_RETIENE ? [i] : [],
  )

/** La ficha servida con más retenidas y con bitácora de ellas: la del ejemplo del parte. */
const EJEMPLO = SERVIDA.items.find((f) => f.id === 'f-2025-11-03-acu-431140')

describe('el ejemplo mide algo', () => {
  it('la ficha del parte sigue publicada, con dos retenidas y su bitácora en huella', () => {
    expect(EJEMPLO, 'f-2025-11-03-acu-431140 ya no está publicada: elige otra').toBeTruthy()
    expect(retenidasDe(EJEMPLO).length).toBeGreaterThanOrEqual(2)
    expect(EJEMPLO.corrections.some((c) => c.literalRetenido)).toBe(true)
  })
})

describe('sin la procedencia, la copia servida sigue pintando el hueco', () => {
  const huecos = (container) =>
    (container.textContent.match(new RegExp(ROTULO_CITA_RETENIDA, 'g')) ?? []).length
  const citasVacias = (container) =>
    [...container.querySelectorAll('blockquote')].filter((b) =>
      b.textContent.trim().startsWith('«»'),
    )

  it('la tarjeta de /plenos/:id: un hueco por retenida y ninguna cita «» vacía', async () => {
    conProcedencia = false
    const { container } = render(<FindingCard f={EJEMPLO} />)
    await waitFor(() => {
      // Un 404 deja el fichero «missing»: la página se queda sin procedencia.
      expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('missing')
    })
    expect(citasVacias(container)).toEqual([])
    expect(huecos(container)).toBe(retenidasDe(EJEMPLO).length)
  })

  it('la ficha de /hallazgos, igual', async () => {
    conProcedencia = false
    const { container } = render(<FindingDetailCard f={EJEMPLO} permalink="#x" />)
    await waitFor(() => {
      // Un 404 deja el fichero «missing»: la página se queda sin procedencia.
      expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('missing')
    })
    expect(citasVacias(container)).toEqual([])
    expect(huecos(container)).toBeGreaterThanOrEqual(retenidasDe(EJEMPLO).length)
  })
})

describe('la bitácora de una cita retenida dice qué falta, no lo imprime', () => {
  const fila = EJEMPLO.corrections.find((c) => c.literalRetenido)

  it('rotula la fila como literal retenido y enseña su huella, no un «texto vigente» que no lo es', () => {
    const { container } = render(<BitacoraCorrecciones correcciones={[fila]} />)
    const texto = container.textContent.replace(/\s+/g, ' ')
    expect(fila.corrected).toMatch(HUELLA_RE)
    expect(texto).toContain(ROTULO_CITA_RETENIDA)
    expect(texto).toContain(fila.corrected.split(' · ')[1])
    expect(texto).toMatch(/puerta editorial/i)
    // La huella no es el texto vigente: rotularla así diría que la ficha publica
    // hoy un código en vez de una cita.
    expect(texto).not.toMatch(/Texto vigente/i)
  })

  it('conserva quién, cuándo y por qué', () => {
    const { container } = render(<BitacoraCorrecciones correcciones={[fila]} />)
    const texto = container.textContent
    expect(texto).toContain(fila.editor)
    expect(texto).toContain(String(fila.correctedAt).slice(0, 10))
    expect(texto).toContain(fila.reason.slice(0, 40))
  })
})

describe('sobre los datos servidos: ninguna ficha imprime el literal que retiene', () => {
  /** La prosa firmada que espera a una persona (tests/literales-retenidos.test.ts). */
  const ESPERA_A_UNA_PERSONA = new Set(['f-2026-01-19-cit-543cc1#3', 'f-2026-05-11-acu-7c65c5#3'])
  const conRetenidas = SERVIDA.items.filter((f) => retenidasDe(f).length > 0)

  it('hay fichas con retenidas que medir', () => {
    expect(conRetenidas.length).toBeGreaterThan(0)
  })

  it('ni en la cita ni en la bitácora, con la ficha entera montada', async () => {
    const fuentePorId = new Map(FUENTE.items.map((f) => [f.id, f]))
    const impresas = []
    for (const f of conRetenidas) {
      const { container, unmount } = render(<FindingDetailCard f={f} permalink="#x" />)
      await waitFor(() => {
        expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
      })
      const texto = container.textContent
      const versiones = versionesDeCitas(fuentePorId.get(f.id))
      for (const i of retenidasDe(f)) {
        const id = `${f.id}#${i}`
        if (ESPERA_A_UNA_PERSONA.has(id)) continue
        const medibles = [...versiones[i]].filter((v) => v.split(/\s+/).length >= 5)
        if (medibles.some((v) => quoteAppearsIn(v, texto))) impresas.push(id)
      }
      unmount()
    }
    expect(impresas).toEqual([])
  })
})

describe('el pie del hueco no promete más de lo que se cumple', () => {
  it('dice que la ficha no reproduce el literal, sin «no se publica»', () => {
    const { container } = render(<CitaRetenida attribution="PP" tone="pp" />)
    const texto = container.textContent.replace(/\s+/g, ' ')
    expect(texto).not.toMatch(/no (?:la |lo |las |los |se )?publica/i)
    expect(texto).toMatch(/no reproduce su literal/i)
    // Lo que la prueba e2e de /hallazgos exige del hueco, intacto.
    expect(texto).toMatch(/ningún registro municipal/i)
    expect(texto).toMatch(/No decimos que sea falsa/)
  })
})
