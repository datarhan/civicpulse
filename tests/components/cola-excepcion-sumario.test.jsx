/**
 * La cola de /curator pregunta por el sumario, y lo dice en pantalla.
 *
 * Hasta el 30-09-2026 la sección se titulaba «¿merece este hallazgo la
 * excepción?», rotulaba las citas «Literales publicados» —las retenidas no se
 * imprimen en la página— y sólo ofrecía matizar el sumario o quitar un literal.
 * La pregunta es otra ya (`PREGUNTA_DE_LA_COLA`), y la fila tiene que traer lo
 * que hace falta para responderla y las cuatro respuestas preparadas.
 *
 * La fila se construye con el constructor de verdad sobre los snapshots
 * publicados, no con una forma copiada aquí: una fila escrita a mano seguiría
 * pintándose aunque el constructor dejara de producirla (docs/DATA_INTEGRITY.md,
 * regla 1).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Curator from '../../src/pages/Curator'
import { FindingExceptionRow } from '../../src/pages/curator/finding-exception-queue'
import {
  buildExceptionQueue,
  hechosDelVerificador,
  EXCEPTION_QUEUE_VERSION,
  PREGUNTA_DE_LA_COLA,
} from '../../src/scraper/finding-exception'
import { validateFindingsSnapshot } from '../../src/scraper/pleno-finding'
import { loadVerifiedCorpus } from '../../scripts/lib/verified-corpus'

const ROOT = join(__dirname, '..', '..')
const FINDINGS = validateFindingsSnapshot(
  readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'),
)
const PROVENANCE = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
)
const CORPUS = loadVerifiedCorpus({
  monolithPath: join(ROOT, 'public/data/pleno-claims-verified.json'),
  basePath: join(ROOT, 'public/data/pleno-claims-verified-base.json'),
  overlayPath: join(ROOT, 'public/data/pleno-claims-overlay.json'),
})
const QUEUE = buildExceptionQueue(
  FINDINGS.items,
  { gates: PROVENANCE.quotes, facts: hechosDelVerificador(CORPUS.merged) },
  {
    generatedAt: '2026-09-30T00:00:00.000Z',
    findingsGeneratedAt: FINDINGS.generatedAt,
    provenanceGeneratedAt: PROVENANCE.generatedAt,
  },
)

/** Una fila real que tiene, además de la retenida, alguna cita que la ficha enseña. */
const FILA = QUEUE.rows.find((r) => !r.todasRetenidas && r.quotes.some((q) => q.reclasificar))

describe('una fila real de la cola', () => {
  it('mide algo: hay una fila con retenidas y citas que la ficha enseña', () => {
    expect(FILA).toBeTruthy()
    expect(FILA.citasRetenidas).toBeGreaterThan(0)
    expect(FILA.citasRetenidas).toBeLessThan(FILA.quotes.length)
  })

  it('no rotula «Literales publicados»: la retenida no se imprime en la página', () => {
    const { container } = render(<FindingExceptionRow row={FILA} />)
    expect(container.textContent).not.toMatch(/literales publicados/i)
    expect(container.textContent).toContain(FILA.summary)
  })

  it('marca exactamente las citas que la puerta retiene', () => {
    const { container } = render(<FindingExceptionRow row={FILA} />)
    expect(container.querySelectorAll('[data-retenida="true"]')).toHaveLength(FILA.citasRetenidas)
    expect(container.querySelectorAll('[data-retenida="false"]')).toHaveLength(
      FILA.quotes.length - FILA.citasRetenidas,
    )
  })

  it('enseña las cuatro respuestas al abrirla, y reclasificar sólo en las retenidas', () => {
    const { container, getByRole } = render(<FindingExceptionRow row={FILA} />)
    // Cerrada no enseña órdenes: se leen el sumario y las citas primero.
    expect(container.textContent).not.toContain(FILA.commands.retirarHallazgo)
    fireEvent.click(getByRole('button'))
    const texto = container.textContent
    expect(texto).toContain(FILA.commands.mantener)
    expect(texto).toContain(FILA.commands.corregirSumario)
    expect(texto).toContain(FILA.commands.retirarHallazgo)
    for (const q of FILA.quotes) {
      if (q.reclasificar) expect(texto).toContain(q.reclasificar)
    }
    expect(FILA.quotes.filter((q) => !q.retenida).every((q) => q.reclasificar === null)).toBe(true)
  })
})

describe('/curator: la sección pregunta lo que la cola pregunta', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  /** Sirve `cola` en el endpoint de la cola de excepción; lo demás, 404. */
  function sirve(cola) {
    globalThis.fetch = async (url) =>
      String(url).startsWith('/api/curator/finding-exception-queue')
        ? new Response(JSON.stringify(cola), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : new Response('not found', { status: 404 })
  }

  it('el título es la pregunta nueva, y no la de antes', async () => {
    sirve({ queueVersion: EXCEPTION_QUEUE_VERSION, stats: QUEUE.stats, rows: [FILA] })
    const { container } = render(<Curator />)
    await waitFor(() => expect(container.textContent).toContain(FILA.title))
    const texto = container.textContent.replace(/\s+/g, ' ')
    expect(texto).toContain(PREGUNTA_DE_LA_COLA)
    expect(texto).not.toMatch(/merece este hallazgo la excepci[oó]n/i)
  })

  it('una cola de la versión anterior en disco no se pinta como si preguntara esto', async () => {
    // editorial/finding-exception-queue.json del checkout principal es del
    // 27-08: 38 filas elegidas con el filtro viejo. Bajo el título nuevo,
    // parecerían respuestas pendientes a una pregunta que nunca se les hizo.
    sirve({ queueVersion: 'finding-exception-v1', stats: QUEUE.stats, rows: [FILA] })
    const { container } = render(<Curator />)
    await waitFor(() => expect(container.textContent).toContain('finding-exception-v1'))
    const texto = container.textContent.replace(/\s+/g, ' ')
    expect(texto).toContain('npm run triage:finding-exception')
    expect(texto).not.toContain(FILA.title)
  })
})
