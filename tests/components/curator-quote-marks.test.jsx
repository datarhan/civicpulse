/**
 * ¿Ve el curador lo mismo que el lector, en la pantalla donde se decide?
 *
 * Desde 8a4ef92 y afe7a91, /hallazgos marca cada literal por dos ejes: de qué
 * transcripción salen las palabras, y qué haría con la afirmación que las
 * sostiene la puerta editorial de `claim-public-gate.ts`. Las colas del curador
 * pintaban `«{q.text}»` a secas, así que quien juzga si un hallazgo sigue
 * publicado veía MENOS que un visitante — al revés de como tiene que ser.
 *
 * Se renderizan las FILAS de verdad, no el chip suelto: montar el componente
 * aparte pasaría aunque nadie lo hubiera enchufado a la cola. Y cada afirmación
 * de presencia va emparejada con su control positivo — una cita sin marcar en
 * la misma pantalla —, porque un aviso que lo lleva todo no distingue nada.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FindingSupportRow } from '../../src/pages/curator/finding-support-queue'
import { QuoteReanchorRow } from '../../src/pages/curator/quote-reanchor-queue'
import { FindingExceptionRow } from '../../src/pages/curator/finding-exception-queue'
import { invalidateSnapshots, peekSnapshot } from '../../src/lib/snapshot-store'
import { MARKED_STATUS_IDS } from '../../src/scraper/quote-provenance'

const ROOT = join(__dirname, '..', '..')
const FINDINGS = JSON.parse(readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'))
const PROVENANCE = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
)

/** Los rótulos que el lector ve. Los mismos que /hallazgos, no otros. */
const TRANSCRIPT_MARK = {
  'solo-en-sustituida': 'no consta en la transcripción revisada',
  'sin-determinar': 'no hemos podido comprobarlo',
}
const GATE_MARK = {
  toggle: 'sin contraste en los datos',
  hidden: 'acusación no contrastada',
}
const ALL_MARKS = [...Object.values(TRANSCRIPT_MARK), ...Object.values(GATE_MARK)]

const realFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/data/finding-quote-provenance.json')) {
      return new Response(JSON.stringify(PROVENANCE), {
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

const entries = (id) => PROVENANCE.quotes[id] ?? []
const isMarked = (e) => MARKED_STATUS_IDS.includes(e?.status) || GATE_MARK[e?.gate] !== undefined

/** Un hallazgo cuya PRIMERA cita está marcada por los dos ejes a la vez. */
const bothAxes = FINDINGS.items.find((f) => {
  const e = entries(f.id)[0]
  return e && MARKED_STATUS_IDS.includes(e.status) && GATE_MARK[e.gate] !== undefined
})

/**
 * El control positivo, a nivel de CITA y no de hallazgo.
 *
 * Ninguna de las 52 fichas publicadas tiene todas sus citas limpias —después de
 * afe7a91 cada una arrastra al menos una marca—, así que «un hallazgo sin
 * marcas» no existe y buscarlo daba `undefined`. Tres sí tienen limpia la
 * PRIMERA, y la fila se construye con esa sola: si el componente marcase por
 * inercia, ahí se vería.
 *
 * (La primera versión de esta prueba pedía sólo `entries[0]` limpia y renderizaba
 * la ficha entera, cuyas otras tres citas sí estaban marcadas. Habría afirmado
 * silencio sobre una pantalla llena de chips.)
 */
const unmarked = FINDINGS.items.find((f) => {
  const rows = entries(f.id)
  return rows.length > 0 && !isMarked(rows[0])
})

/** Un hallazgo real con citas marcadas Y citas limpias en la misma ficha. */
const mixed = FINDINGS.items.find((f) => {
  const rows = entries(f.id)
  return rows.length > 1 && rows.some(isMarked) && rows.some((e) => !isMarked(e))
})

/** Cuántas marcas debería llevar esta ficha, contadas desde el snapshot. */
const expectedMarks = (id) =>
  entries(id).reduce(
    (n, e) => n + (MARKED_STATUS_IDS.includes(e.status) ? 1 : 0) + (GATE_MARK[e.gate] ? 1 : 0),
    0,
  )

/** Cuántas pinta la pantalla. */
const renderedMarks = (text) => ALL_MARKS.reduce((n, mark) => n + (text.split(mark).length - 1), 0)

/** Filas que leen la procedencia por el hook: hay que esperar al store. */
async function renderRow(node, probe) {
  const utils = render(node)
  await waitFor(() => {
    expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
  })
  utils.rerender(node)
  if (probe) await waitFor(() => expect(utils.container.textContent).toContain(probe))
  return utils
}

/** La fila mínima que cada cola necesita, con las citas del hallazgo real. */
const supportRow = (f) => ({
  id: f.id,
  plenoId: f.plenoId,
  plenoDate: f.plenoDate,
  title: f.title,
  summary: f.summary,
  severity: f.severity,
  claimShape: 'afirmativa-documental',
  quotes: (f.quotes ?? []).map((q) => ({ text: q.text, speakerGroup: q.speakerGroup })),
  crossChecked: [],
  correctionCommand: 'npm run correct-pleno-finding -- x',
  verdict: 'pendiente',
})

const SUPPORT_VERDICTS = [{ id: 'pendiente', label: 'pendiente' }]

describe('los datos reales traen los dos lados del control', () => {
  it('hay una cita marcada por ambos ejes, una limpia y una ficha mixta', () => {
    // Sin esto, «no aparece la marca» podría estar midiendo un caso vacío.
    expect(bothAxes).toBeTruthy()
    expect(unmarked).toBeTruthy()
    expect(mixed).toBeTruthy()
    expect(bothAxes.id).not.toBe(unmarked.id)
  })

  it('ninguna ficha publicada tiene todas sus citas limpias', () => {
    // Por eso el control es por cita. Es un hecho del snapshot, no una excusa:
    // las 52 arrastran al menos una marca.
    const clean = FINDINGS.items.filter((f) => {
      const rows = entries(f.id)
      return rows.length > 0 && rows.every((e) => !isMarked(e))
    })
    expect(entries(FINDINGS.items[0].id).length).toBeGreaterThan(0)
    expect(clean).toEqual([])
  })
})

describe('cola «¿lo sostiene?» — no enseñaba ninguno de los dos ejes', () => {
  it('pinta las dos marcas junto a la cita', async () => {
    const e = entries(bothAxes.id)[0]
    const { container } = await renderRow(
      <FindingSupportRow row={supportRow(bothAxes)} verdictOptions={SUPPORT_VERDICTS} />,
      bothAxes.quotes[0].text.slice(0, 30),
    )
    expect(container.textContent).toContain(TRANSCRIPT_MARK[e.status])
    expect(container.textContent).toContain(GATE_MARK[e.gate])
  })

  it('no marca una cita sana — el control positivo', async () => {
    // Sólo la primera cita, que el snapshot da por limpia: la fila pinta todas
    // las de la ficha y ninguna ficha publicada las tiene todas limpias.
    const row = { ...supportRow(unmarked), quotes: [supportRow(unmarked).quotes[0]] }
    const { container } = await renderRow(
      <FindingSupportRow row={row} verdictOptions={SUPPORT_VERDICTS} />,
      unmarked.quotes[0].text.slice(0, 30),
    )
    for (const mark of ALL_MARKS) expect(container.textContent).not.toContain(mark)
  })

  it('marca exactamente las citas marcadas, ni una más', async () => {
    // El control más afilado: en una ficha con citas marcadas y citas limpias,
    // un aviso que lo lleva todo no distingue nada. La cuenta sale del
    // snapshot, no de la pantalla.
    const { container } = await renderRow(
      <FindingSupportRow row={supportRow(mixed)} verdictOptions={SUPPORT_VERDICTS} />,
      mixed.quotes[0].text.slice(0, 30),
    )
    const want = expectedMarks(mixed.id)
    expect(want).toBeGreaterThan(0)
    expect(want).toBeLessThan(entries(mixed.id).length * 2)
    expect(renderedMarks(container.textContent)).toBe(want)
  })

  it('sigue enseñando la cita: marcarla no es esconderla', async () => {
    const { container } = await renderRow(
      <FindingSupportRow row={supportRow(bothAxes)} verdictOptions={SUPPORT_VERDICTS} />,
      bothAxes.quotes[0].text.slice(0, 30),
    )
    expect(container.textContent).toContain(bothAxes.quotes[0].text.slice(0, 40))
  })
})

describe('cola de reanclaje — enseñaba el eje de transcripción y no el de contraste', () => {
  const marked = FINDINGS.items.find((f) => GATE_MARK[entries(f.id)[0]?.gate] !== undefined)

  it('pinta la marca de contraste junto al literal publicado', async () => {
    const e = entries(marked.id)[0]
    const row = {
      key: `${marked.id}::0`,
      findingId: marked.id,
      plenoId: marked.plenoId,
      plenoDate: marked.plenoDate,
      title: marked.title,
      severity: marked.severity,
      quoteIndex: 0,
      publishedQuote: marked.quotes[0].text,
      status: e.status,
      candidates: [],
    }
    const { container } = await renderRow(
      <QuoteReanchorRow row={row} />,
      marked.quotes[0].text.slice(0, 30),
    )
    expect(container.textContent).toContain(GATE_MARK[e.gate])
  })

  it('no inventa una marca donde no la hay', async () => {
    const clean = FINDINGS.items.find((f) => entries(f.id)[0] && !isMarked(entries(f.id)[0]))
    const row = {
      key: `${clean.id}::0`,
      findingId: clean.id,
      plenoId: clean.plenoId,
      plenoDate: clean.plenoDate,
      title: clean.title,
      severity: clean.severity,
      quoteIndex: 0,
      publishedQuote: clean.quotes[0].text,
      status: 'en-vigente',
      candidates: [],
    }
    const { container } = await renderRow(
      <QuoteReanchorRow row={row} />,
      clean.quotes[0].text.slice(0, 30),
    )
    for (const mark of ALL_MARKS) expect(container.textContent).not.toContain(mark)
  })

  it('marca la cita por su índice, no siempre la primera', async () => {
    // `quoteIndex` es la fila: una cola por cita, no por hallazgo. Coger
    // siempre `[0]` daría la marca de otra cita del mismo hallazgo.
    const multi = FINDINGS.items.find((f) => {
      const rows = entries(f.id)
      return rows.length > 1 && !isMarked(rows[0]) && isMarked(rows[1])
    })
    if (!multi) return
    const e = entries(multi.id)[1]
    const row = {
      key: `${multi.id}::1`,
      findingId: multi.id,
      plenoId: multi.plenoId,
      plenoDate: multi.plenoDate,
      title: multi.title,
      severity: multi.severity,
      quoteIndex: 1,
      publishedQuote: multi.quotes[1].text,
      status: e.status,
      candidates: [],
    }
    const { container } = await renderRow(
      <QuoteReanchorRow row={row} />,
      multi.quotes[1].text.slice(0, 30),
    )
    const own = [TRANSCRIPT_MARK[e.status], GATE_MARK[e.gate]].filter(Boolean)
    expect(own.length).toBeGreaterThan(0)
    for (const mark of own) expect(container.textContent).toContain(mark)
  })
})

describe('cola de excepción — ya enseñaba los dos ejes', () => {
  // No tenía el hueco: `triage:finding-exception` pone `gate` y
  // `transcriptStatus` en las 131 citas y la fila los pinta. Se fija aquí para
  // que no se pierdan sin que nadie se entere.
  const row = {
    findingId: 'f-x',
    plenoId: 'p1',
    plenoDate: '2026-05-11',
    title: 'Título',
    severity: 'informational',
    summary: 'Sumario',
    curatorName: 'auto-curation-v1',
    citasMostrables: 0,
    quotes: [
      {
        index: 0,
        text: 'una cita cualquiera',
        gate: 'hidden',
        verdict: 'sin-datos',
        claimType: 'acusacion_publica',
        transcriptStatus: 'solo-en-sustituida',
      },
    ],
    commands: [],
  }

  // Esta cola NO lee el snapshot por el hook: los dos ejes vienen ya en su
  // propio JSON, así que se renderiza directamente y no se espera al store.
  it('dice qué haría la puerta y de qué transcripción viene', () => {
    const { container } = render(<FindingExceptionRow row={row} />)
    expect(container.textContent).toContain('una cita cualquiera')
    expect(container.textContent).toContain('la retiene')
    expect(container.textContent).toContain('solo-en-sustituida')
  })

  it('y calla sobre la transcripción cuando la cita está en el texto vigente', () => {
    const clean = { ...row, quotes: [{ ...row.quotes[0], transcriptStatus: 'en-vigente' }] }
    const { container } = render(<FindingExceptionRow row={clean} />)
    expect(container.textContent).toContain('una cita cualquiera')
    expect(container.textContent).not.toContain('transcripción:')
  })
})
