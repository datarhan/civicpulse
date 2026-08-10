/**
 * ¿Distingue el lector un expediente anulado de un contrato firmado?
 *
 * `RefList` publicaba la FECHA de cada documento cotejado y nunca su ESTADO.
 * Cinco refs de /hallazgos resuelven a cuatro expedientes PLACSP anulados antes
 * de adjudicar —importe final 0, sin fecha de adjudicación, formalización ni
 * inicio— y aparecían bajo «Documentos cotejados» exactamente igual que un
 * contrato firmado. Ninguna prosa publicada los nombra, así que los criterios
 * de retirada los dejan donde están: lo que faltaba era el dato.
 *
 * TRES estados y sólo tres, cada afirmación con su control positivo, sobre el
 * snapshot de contratación REAL y el de hallazgos REAL. Se renderiza el
 * componente de verdad —`RefList`, el mismo que usan /hallazgos y /plenos/:id—
 * con `fetch` sustituido por el disco: montar el chip suelto pasaría aunque
 * nadie lo hubiera enchufado a la lista.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { RefList } from '../../src/components/PlenoFindings'
import { invalidateSnapshots, peekSnapshot } from '../../src/lib/snapshot-store'
import { buildRefStatusIndex, refStatus } from '../../src/lib/crosschecked-status.js'

const ROOT = join(__dirname, '..', '..')
const FINDINGS = JSON.parse(readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'))
const TENDERS = JSON.parse(readFileSync(join(ROOT, 'public/data/tenders.json'), 'utf8'))

/** El rótulo que el lector ve, por estado. Uno por estado, y distintos. */
const CHIP = {
  cancelled: 'expediente anulado',
  committed: 'adjudicado',
  'in-flight': 'en licitación',
  none: 'sin estado',
}

const realFetch = globalThis.fetch

// En `beforeEach` y no en `beforeAll`: el guardia de red de la suite se
// reinstala antes de cada prueba, y un stub puesto una sola vez lo pisaría.
beforeEach(() => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/data/tenders.json')) {
      return new Response(JSON.stringify(TENDERS), {
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

const INDEX = buildRefStatusIndex(TENDERS)
const allRefs = FINDINGS.items.flatMap((f) =>
  (f.crossChecked ?? []).map((r) => ({ finding: f, ...r })),
)

/** El primer ref de cada estado, tomado de los datos reales. */
const pick = (want) =>
  allRefs.find((r) => {
    if (r.kind !== 'tender') return false
    const s = refStatus(r, INDEX)
    return want === 'none' ? s === null : s?.kind === want
  })

const samples = {
  cancelled: pick('cancelled'),
  committed: pick('committed'),
  'in-flight': pick('in-flight'),
}

/**
 * Renderiza la lista y espera a que el store haya resuelto DE VERDAD. Sin la
 * espera, «no aparece el chip» pasaría midiendo el estado de carga.
 */
async function renderRefs(refs, plenoDate = '2026-05-11') {
  const utils = render(<RefList refs={refs} kind="crossChecked" plenoDate={plenoDate} />)
  await waitFor(() => {
    expect(peekSnapshot('/data/tenders.json')?.status).toBe('ready')
  })
  utils.rerender(<RefList refs={refs} kind="crossChecked" plenoDate={plenoDate} />)
  return utils
}

describe('los datos reales traen los tres estados', () => {
  it('hay un ref anulado, uno adjudicado y uno en licitación que comparar', () => {
    // Sin esto cualquier «no se marca» de abajo podría estar midiendo un caso
    // que no existe en el snapshot.
    expect(samples.cancelled).toBeTruthy()
    expect(samples.committed).toBeTruthy()
    expect(samples['in-flight']).toBeTruthy()
    expect(new Set(Object.values(samples).map((r) => r.ref)).size).toBe(3)
  })
})

describe('los tres estados se leen distintos en la página', () => {
  it('un expediente anulado se ve anulado', async () => {
    const { container } = await renderRefs([samples.cancelled])
    expect(container.textContent).toContain(CHIP.cancelled)
    // Y no se le puede confundir con lo contrario.
    expect(container.textContent).not.toContain(CHIP.committed)
  })

  it('un contrato adjudicado NO se marca como anulado — el control positivo', async () => {
    const { container } = await renderRefs([samples.committed])
    expect(container.textContent).toContain(CHIP.committed)
    expect(container.textContent).not.toContain(CHIP.cancelled)
  })

  it('un expediente todavía en marcha dice eso y no otra cosa', async () => {
    const { container } = await renderRefs([samples['in-flight']])
    expect(container.textContent).toContain(CHIP['in-flight'])
    expect(container.textContent).not.toContain(CHIP.cancelled)
  })

  it('un ref que el snapshot no conoce no recibe ninguna afirmación', async () => {
    // No es un estado: es que nada ha resuelto ese documento. Inventar
    // «sin estado» aquí sería una afirmación hecha desde nuestro propio índice.
    const { container } = await renderRefs([
      { kind: 'tender', ref: 'https://ejemplo/desconocido', snippet: 'Contrato inventado' },
    ])
    expect(container.textContent).toContain('Contrato inventado')
    for (const text of Object.values(CHIP)) {
      expect(container.textContent).not.toContain(text)
    }
  })

  it('un documento CONOCIDO que no publica estado lo dice en palabras', async () => {
    // El tercer estado, y el que ningún ref publicado alcanza hoy: el
    // expediente está en el registro y su única fila lleva el centinela. Un
    // blanco ahí se leería como «normal», que es la confusión que esto repara.
    // Con snapshot propio, porque el vivo no tiene ni un caso.
    globalThis.fetch = async (url) =>
      String(url).endsWith('/data/tenders.json')
        ? new Response(
            JSON.stringify({
              contracts: [{ permalink: 'https://ejemplo/mudo', status: 'unknown' }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        : new Response('not found', { status: 404 })
    invalidateSnapshots()
    const { container } = await renderRefs([
      { kind: 'tender', ref: 'https://ejemplo/mudo', snippet: 'Expediente mudo' },
    ])
    expect(container.textContent).toContain(CHIP.none)
    // Y NO el token que el registro trae dentro.
    expect(container.textContent).not.toMatch(/unknown/i)
    // Ni ninguno de los otros dos: son tres respuestas distintas.
    expect(container.textContent).not.toContain(CHIP.cancelled)
    expect(container.textContent).not.toContain(CHIP.committed)
  })

  it('los tres juntos en una lista siguen siendo tres rótulos distintos', async () => {
    const { container } = await renderRefs(Object.values(samples))
    const seen = ['cancelled', 'committed', 'in-flight'].map((k) => CHIP[k])
    for (const text of seen) expect(container.textContent).toContain(text)
    expect(new Set(seen).size).toBe(3)
  })
})

describe('el centinela no llega al lector', () => {
  const withSentinel = allRefs.filter((r) => /estado:\s*unknown/i.test(r.snippet ?? ''))

  it('hay literales publicados que sí lo llevan — el defecto es real', () => {
    // Control positivo: sin esto, «no aparece unknown» pasaría sobre un
    // conjunto vacío.
    expect(withSentinel.length).toBeGreaterThan(10)
  })

  it('la lista no imprime «estado: unknown» en ningún caso', async () => {
    const { container } = await renderRefs(withSentinel.slice(0, 12))
    expect(container.textContent).not.toMatch(/estado:\s*unknown/i)
    // Y no lo consigue borrando el ref: el título del expediente sigue ahí.
    const title = withSentinel[0].snippet.split('·')[0].trim().slice(0, 30)
    expect(container.textContent).toContain(title)
  })

  it('tampoco imprime el token en inglés de un expediente adjudicado', async () => {
    const awarded = allRefs.filter((r) => /estado:\s*awarded/i.test(r.snippet ?? ''))
    expect(awarded.length).toBeGreaterThan(0)
    const { container } = await renderRefs(awarded.slice(0, 6))
    expect(container.textContent).not.toMatch(/·\s*estado:/i)
  })

  it('ninguna de las fichas publicadas enseña el centinela', async () => {
    // La barrida entera, no una muestra: es texto sobre grupos con nombre.
    for (const item of FINDINGS.items.slice(0, 8)) {
      const { container } = await renderRefs(item.crossChecked ?? [], item.plenoDate)
      expect(container.textContent).not.toMatch(/estado:\s*unknown/i)
      cleanup()
    }
  })
})

describe('el estado no se inventa mientras carga', () => {
  it('sin snapshot de contratación no se afirma nada sobre ningún documento', () => {
    // `fetch` devuelve 404 para tenders.json aquí, así que el índice queda
    // vacío: el ref no resuelve y la lista calla. Marcar «sin estado» con el
    // snapshot en vuelo sería una afirmación hecha desde nuestro propio
    // estado de carga.
    globalThis.fetch = async () => new Response('not found', { status: 404 })
    invalidateSnapshots()
    const { container } = render(
      <RefList refs={[samples.cancelled]} kind="crossChecked" plenoDate="2026-05-11" />,
    )
    for (const text of Object.values(CHIP)) {
      expect(container.textContent).not.toContain(text)
    }
    // La lista sí se pinta: el silencio es sobre el estado, no la ausencia
    // del documento. (El rótulo va en mayúsculas por CSS, no en el texto.)
    expect(container.textContent).toContain('Documentos cotejados')
  })
})
