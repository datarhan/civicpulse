/**
 * ¿Ve el lector la marca donde tiene que verla, y **sólo** donde tiene que
 * verla?
 *
 * 95 de los 177 literales de /hallazgos proceden de la transcripción que su
 * sesión tenía antes de re-transcribirse. La disculpa de un aviso es que se
 * lea; la trampa es un aviso tan generoso que lo lleva todo y por tanto no
 * distingue nada. Así que cada afirmación de ausencia va emparejada con su
 * control positivo, sobre el fichero de procedencia REAL y el snapshot de
 * hallazgos REAL.
 *
 * Se renderiza el componente de verdad —`FindingCard`, el mismo que usan
 * /hallazgos y /plenos/:id— con `fetch` sustituido por el disco. Un test que
 * sólo montara el chip pasaría aunque nadie lo hubiera enchufado a la ficha.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  FindingCard,
  QuoteProvenanceMark,
  QuoteProvenanceNote,
} from '../../src/components/PlenoFindings'
import { FindingDetailCard } from '../../src/pages/Hallazgos'
import { invalidateSnapshots, peekSnapshot } from '../../src/lib/snapshot-store'
import { MARKED_STATUS_IDS } from '../../src/scraper/quote-provenance'

const ROOT = join(__dirname, '..', '..')
const FINDINGS = JSON.parse(readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'))
const PROVENANCE = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
)

/** El chip que el lector ve. Se lee del componente, no se recita aquí. */
const MARK_TEXT = {
  'solo-en-sustituida': 'no consta en la transcripción revisada',
  'sin-determinar': 'no hemos podido comprobarlo',
}

const realFetch = globalThis.fetch

// En `beforeEach`, no en `beforeAll`: el guardia de red de la suite se reinstala
// antes de cada prueba a propósito, para que el stub de un fichero no desarme el
// resto de la ejecución. Un stub puesto una sola vez lo pisaría el guardia y la
// ficha acabaría pidiendo la procedencia a localhost:3000.
beforeEach(() => {
  // El disco hace de red: el store de snapshots es la única vía por la que la
  // ficha llega a la procedencia, y saltárselo probaría otro camino.
  globalThis.fetch = async (url) => {
    const path = String(url)
    if (path.endsWith('/data/finding-quote-provenance.json')) {
      return new Response(JSON.stringify(PROVENANCE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    // Los tenders no hacen falta para esto; un 404 los resuelve al vacío.
    return new Response('not found', { status: 404 })
  }
  invalidateSnapshots()
})

afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

/**
 * El primer hallazgo cuya PRIMERA cita está marcada.
 *
 * Pedía antes que lo estuvieran las tres primeras. Eso se cumplía cuando 90 de
 * 172 citas estaban marcadas y dejó de cumplirse el 2026-08-10, cuando la tanda
 * de reanclaje bajó la cifra a 41 y no quedó ni un hallazgo con las tres. El
 * criterio estricto no medía nada que estas pruebas necesiten: todas
 * interrogan `quotes[0]`. Y el hallazgo mixto que ahora sale elegido es un
 * control MEJOR — abajo se comprueba que las citas sanas del mismo hallazgo
 * siguen sin marca, que es lo que distingue «marca la cita afectada» de
 * «marca todas las citas».
 */
const affected = FINDINGS.items.find((f) => {
  const rows = PROVENANCE.quotes[f.id] ?? []
  return rows.length > 0 && MARKED_STATUS_IDS.includes(rows[0].status)
})

/** El primer hallazgo cuyas tres primeras citas están TODAS en el texto vigente. */
const sound = FINDINGS.items.find((f) => {
  const rows = (PROVENANCE.quotes[f.id] ?? []).slice(0, 3)
  return rows.length > 0 && rows.every((r) => r.status === 'en-vigente')
})

/**
 * Renderiza la ficha y espera a que el store haya resuelto DE VERDAD. Sin la
 * espera, cualquier «no aparece la marca» pasaría midiendo el estado de carga.
 */
async function renderCard(finding) {
  const utils = render(<FindingCard f={finding} />)
  await waitFor(() => {
    expect(utils.container.textContent).toContain(finding.quotes[0].text.slice(0, 40))
  })
  await waitFor(() => {
    expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
  })
  return utils
}

describe('los datos reales traen los dos lados del control', () => {
  it('hay hallazgos afectados y hallazgos sanos que comparar', () => {
    // Sin esto, «no aparece la marca» podría estar midiendo un caso vacío.
    expect(affected).toBeTruthy()
    expect(sound).toBeTruthy()
    expect(affected.id).not.toBe(sound.id)
  })
})

/**
 * La marca tiene que estar DENTRO de la cita, no sólo en algún sitio de la
 * ficha.
 *
 * Medido por ablación, y la primera versión de esta prueba lo falló: quitando
 * el chip de cada `<blockquote>` seguía verde, porque la nota al pie de la
 * ficha repite el mismo rótulo y `container.textContent` no distingue dónde
 * está. Una ficha con tres citas, una marcada y dos sanas, se habría quedado
 * sin decir cuál — que es justo la información que el lector necesita.
 */
const blockquotes = (container) => [...container.querySelectorAll('blockquote')]

describe('la ficha marca la cita afectada', () => {
  it('pone el chip DENTRO del literal que no consta en el texto vigente', async () => {
    const { container } = await renderCard(affected)
    const status = PROVENANCE.quotes[affected.id][0].status
    const quotes = blockquotes(container)
    expect(quotes.length).toBeGreaterThan(0)
    expect(quotes[0].textContent).toContain(MARK_TEXT[status])
  })

  it('explica qué debe concluir el lector, no sólo que algo pasa', async () => {
    const { container } = await renderCard(affected)
    expect(container.textContent).toMatch(/no está confirmada contra el mejor texto|no afirmamos/)
    expect(container.querySelector('a[href="/metodologia#citas-transcripcion"]')).toBeTruthy()
    // Y la explicación va FUERA de la cita: dentro, se leería como parte de lo
    // que dijo el concejal.
    for (const bq of blockquotes(container)) {
      expect(bq.textContent).not.toMatch(/no está confirmada contra el mejor texto/)
    }
  })

  it('sigue publicando la cita: marcarla no es retirarla', async () => {
    const { container } = await renderCard(affected)
    expect(container.textContent).toContain(affected.quotes[0].text.slice(0, 40))
  })

  it('y NO marca las citas sanas del mismo hallazgo', async () => {
    // El control que el criterio anterior no podía hacer: cuando se exigía que
    // las tres primeras citas estuvieran marcadas, «marca la afectada» y «marca
    // todas» daban el mismo verde. Desde el reanclaje del 2026-08-10 los
    // hallazgos son mixtos, así que la distinción se puede medir de verdad.
    const { container } = await renderCard(affected)
    const bq = blockquotes(container)
    // `FindingCard` corta en tres citas, así que el índice de `blockquote` sólo
    // coincide con el de la cita dentro de ese tramo. Se busca ahí.
    const rows = PROVENANCE.quotes[affected.id].slice(0, bq.length)
    const soundIdx = rows.findIndex((r) => r.status === 'en-vigente')
    expect(
      soundIdx,
      'el hallazgo elegido no tiene ninguna cita sana visible con la que contrastar',
    ).toBeGreaterThan(-1)
    for (const text of Object.values(MARK_TEXT)) {
      expect(bq[soundIdx].textContent).not.toContain(text)
    }
    // Y la afectada sí la lleva, en el mismo render: sin esto el «no marca»
    // pasaría también con la marca apagada del todo.
    expect(bq[0].textContent).toContain(MARK_TEXT[rows[0].status])
  })
})

describe('/hallazgos renderiza la misma marca que /plenos/:id', () => {
  // Dos superficies pintan citas de hallazgo y ya se han desincronizado antes:
  // `RefList` estaba duplicado literal en las dos, y el arreglo de un rótulo
  // que mentía llegó sólo a una. Aquí se prueba la ficha larga, la de
  // /hallazgos, además del `FindingCard` de arriba.
  async function renderDetail(finding) {
    const utils = render(<FindingDetailCard f={finding} permalink={`#${finding.id}`} />)
    await waitFor(() => {
      expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
    })
    utils.rerender(<FindingDetailCard f={finding} permalink={`#${finding.id}`} />)
    return utils
  }

  it('marca la cita afectada dentro de su literal', async () => {
    const { container } = await renderDetail(affected)
    const status = PROVENANCE.quotes[affected.id][0].status
    expect(blockquotes(container)[0].textContent).toContain(MARK_TEXT[status])
  })

  it('no marca nada en un hallazgo cuyas citas están en el texto vigente', async () => {
    const { container } = await renderDetail(sound)
    expect(blockquotes(container).length).toBeGreaterThan(0)
    for (const text of Object.values(MARK_TEXT)) {
      expect(container.textContent).not.toContain(text)
    }
  })
})

describe('la ficha NO marca la cita sana — el control positivo', () => {
  it('ningún chip, ninguna nota, ningún enlace a la explicación', async () => {
    const { container } = await renderCard(sound)
    const quotes = blockquotes(container)
    expect(quotes.length).toBeGreaterThan(0)
    for (const text of Object.values(MARK_TEXT)) {
      expect(container.textContent).not.toContain(text)
      for (const bq of quotes) expect(bq.textContent).not.toContain(text)
    }
    expect(container.querySelector('a[href="/metodologia#citas-transcripcion"]')).toBeNull()
  })

  it('y sí publica sus citas, así que el silencio no es una ficha vacía', async () => {
    const { container } = await renderCard(sound)
    expect(container.textContent).toContain(sound.quotes[0].text.slice(0, 40))
  })
})

describe('los componentes de marca, aislados', () => {
  it('una entrada «en-vigente» no pinta nada', () => {
    const { container } = render(<QuoteProvenanceMark entry={{ status: 'en-vigente' }} />)
    expect(container.textContent).toBe('')
  })

  it('sin entrada —procedencia aún sin cargar— no pinta nada, en vez de afirmar', () => {
    const { container } = render(<QuoteProvenanceMark entry={undefined} />)
    expect(container.textContent).toBe('')
  })

  it('cada estado marcable tiene su redacción, y no la comparten', () => {
    const seen = new Set()
    for (const status of MARKED_STATUS_IDS) {
      const { container } = render(<QuoteProvenanceMark entry={{ status }} />)
      const text = container.textContent
      expect(text.length).toBeGreaterThan(10)
      expect(seen.has(text)).toBe(false)
      seen.add(text)
    }
    expect(seen.size).toBe(MARKED_STATUS_IDS.length)
  })

  it('la nota dice una cosa por estado presente, sin repetir', () => {
    const { container } = render(
      <QuoteProvenanceNote
        entries={[
          { status: 'solo-en-sustituida' },
          { status: 'solo-en-sustituida' },
          { status: 'sin-determinar' },
          { status: 'en-vigente' },
        ]}
      />,
    )
    const text = container.textContent
    expect(text.match(/no consta en la transcripción revisada/g)).toHaveLength(1)
    expect(text.match(/no hemos podido comprobarlo/g)).toHaveLength(1)
  })

  it('la nota calla cuando no hay nada marcado', () => {
    const { container } = render(
      <QuoteProvenanceNote entries={[{ status: 'en-vigente' }, { status: 'en-vigente' }]} />,
    )
    expect(container.textContent).toBe('')
    expect(render(<QuoteProvenanceNote entries={[]} />).container.textContent).toBe('')
  })
})
