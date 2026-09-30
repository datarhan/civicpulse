/**
 * La caja del motor sólo enseña una propuesta que adelantaría la promesa.
 *
 * La revisión lectora del 30-09-2026 lo señaló en /promesas: la misma tarjeta
 * decía «Documentada» —con «publicada automáticamente · revisión pendiente»— y,
 * en la caja discontinua de debajo, «El motor propone estado: Documentada …
 * No está publicada: sólo un curador humano puede aplicarla». El lector no
 * podía saber si «Documentada» estaba publicada o no, y tenía razón.
 *
 * El motor de palabras clave (`inferPromiseSuggestions`) no lee el estado
 * publicado: devuelve una clasificación absoluta, y su suelo, `documentada`,
 * quiere decir «no encontré señal de avance». Ese día las ocho sugerencias
 * publicadas eran `documentada`, y la caja salía para toda la que traía
 * fundamentación: en dos tarjetas repetía el estado publicado —la
 * contradicción de arriba— y en tres `en-progreso` se leía como una propuesta
 * de rebajarlas, que el motor no hace.
 *
 * Se lee el texto RENDERIZADO, como en metodologia-estados-propuestos.test.jsx,
 * y los estados y rótulos esperados van escritos a mano: calcularlos con la
 * regla que se prueba haría que la prueba pasase dijera la regla lo que dijera.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter } from 'react-router-dom'

import Promesas, { PromiseCard } from '../../src/pages/Promesas'
import { ALLOWED_STATUSES } from '../../src/scraper/promises'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'

const ROOT = join(__dirname, '..', '..')
const leer = (f) => JSON.parse(readFileSync(join(ROOT, 'public/data', f), 'utf8'))
const PROMESAS = leer('promises.json')
const SUGERENCIAS = leer('promise-suggestions.json')

/**
 * Una fila de sugerencia como las que publica el motor, con su fundamentación
 * de verdad; si un día el fichero no trae ninguna con fundamentación, una
 * escrita con la misma forma.
 */
const PLANTILLA = SUGERENCIAS.suggestions.find((s) => s.reasoning.length > 0) ?? {
  promiseId: 'x',
  proposedStatus: 'documentada',
  confidence: 0.4,
  reasoning: [
    {
      url: 'https://prensa.invalid/noticia',
      date: '2026-09-01',
      quote: 'Titular que comparte palabras clave con la promesa',
      kind: 'press',
      publisher: 'Medio',
      matchedKeywords: ['palabra'],
    },
  ],
  requiresHumanApproval: true,
  generatedAt: '2026-09-30T00:00:00.000Z',
}

/** La tarjeta que señaló el lector: «Documentada», auto-publicada y en revisión. */
const SENALADA = PROMESAS.items.find(
  (p) => p.status === 'documentada' && p.autoPublished?.reviewState === 'pending-review',
) ?? {
  ...PROMESAS.items[0],
  status: 'documentada',
  autoPublished: {
    at: '2026-09-01T00:00:00.000Z',
    by: 'auto-curation-v1',
    confidence: 0.8,
    reviewState: 'pending-review',
  },
}

const sugerencia = (p, proposedStatus) => ({
  ...PLANTILLA,
  promiseId: p.id,
  proposedStatus,
  confidence: 0.4,
})

let servido = {}
const realFetch = globalThis.fetch
beforeEach(() => {
  globalThis.fetch = async (url) => {
    const ruta = String(url).split('?')[0]
    const clave = Object.keys(servido).find((k) => ruta.endsWith(k))
    return clave
      ? new Response(JSON.stringify(servido[clave]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      : new Response('not found', { status: 404 })
  }
  invalidateSnapshots()
})
afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

const plano = (el) => el.textContent.replace(/\s+/g, ' ')

const pinta = (p, s) =>
  render(
    <MemoryRouter>
      <PromiseCard p={p} suggestion={s} llmEvidence={null} frozen={false} />
    </MemoryRouter>,
  )

/**
 * [estado publicado, estado propuesto, lo que la caja tiene que decir | null].
 * `null`: la caja no sale.
 */
const CASOS = [
  // Lo que señaló el lector: la propuesta repite el estado publicado.
  ['documentada', 'documentada', null],
  ['en-verificacion', 'en-verificacion', null],
  ['en-progreso', 'en-progreso', null],
  // El suelo del motor bajo una promesa más avanzada no propone rebajarla.
  ['en-progreso', 'documentada', null],
  ['en-verificacion', 'documentada', null],
  ['parcial', 'en-progreso', null],
  ['cumplida', 'en-progreso', null],
  // Los veredictos que sólo asigna una persona no salen como propuesta de
  // máquina, aunque el fichero trajera uno.
  ['documentada', 'no-ejecutada', null],
  ['en-progreso', 'no-ejecutada', null],
  ['documentada', 'inviable', null],
  // Lo que adelanta la promesa sí sale, con su rótulo. Es el control: sin él,
  // una caja que no saliera nunca pasaría todo lo de arriba.
  ['documentada', 'en-progreso', 'El motor propone estado: En progreso.'],
  ['en-verificacion', 'en-progreso', 'El motor propone estado: En progreso.'],
  ['en-progreso', 'parcial', 'El motor propone estado: Parcial.'],
  ['en-progreso', 'cumplida', 'El motor propone estado: Cumplida.'],
]

describe('la caja del motor sólo propone lo que adelantaría la promesa', () => {
  it('los estados de la tabla existen: si se renombra uno, esto lo dice', () => {
    for (const [publicado, propuesto] of CASOS) {
      expect(ALLOWED_STATUSES).toContain(publicado)
      expect(ALLOWED_STATUSES).toContain(propuesto)
    }
  })

  it('la tarjeta que señaló el lector ya no se contradice', () => {
    const real = SUGERENCIAS.suggestions.find((s) => s.promiseId === SENALADA.id)
    const s =
      real &&
      real.proposedStatus === SENALADA.status &&
      real.confidence > 0 &&
      real.reasoning.length
        ? real
        : sugerencia(SENALADA, 'documentada')
    const texto = plano(pinta(SENALADA, s).container)
    // Lo que el lector vio arriba sigue ahí: la prueba mira esa tarjeta.
    expect(texto).toContain('Documentada')
    expect(texto).toContain('publicada automáticamente · revisión pendiente')
    // Y abajo ya no se dice que «Documentada» no está publicada.
    expect(texto).not.toMatch(/propone estado/i)
    expect(texto).not.toMatch(/No está publicada/)
    cleanup()
  })

  it.each(CASOS)('publicada «%s», propuesta «%s»', (publicado, propuesto, dice) => {
    const p = { ...SENALADA, status: publicado }
    const c = pinta(p, sugerencia(p, propuesto))
    const texto = plano(c.container)
    // La tarjeta se pintó: una vacía también pasaría el «no sale».
    expect(texto).toContain(`id: ${p.id}`)
    if (dice) {
      expect(texto).toContain(dice)
      expect(texto).toMatch(/No está publicada/)
    } else {
      expect(c.container.querySelector('[data-machine-proposal]')).toBeNull()
      expect(texto).not.toMatch(/propone estado/i)
    }
    cleanup()
  })
})

describe('/promesas entera, con las promesas publicadas', () => {
  it('sólo sale la caja de la propuesta que adelanta', async () => {
    const promesas = structuredClone(PROMESAS)
    const elegida = promesas.items[0]
    elegida.status = 'documentada'
    // Lo que publicó el motor el 30-09-2026: su suelo, `documentada`, para
    // todas; aquí, además, una propuesta de verdad.
    servido = {
      '/data/promises.json': promesas,
      '/data/promise-suggestions.json': {
        ...SUGERENCIAS,
        suggestions: promesas.items.map((p) =>
          sugerencia(p, p === elegida ? 'en-progreso' : 'documentada'),
        ),
      },
    }
    const c = render(
      <MemoryRouter>
        <Promesas />
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(c.container.querySelectorAll('.cp-card').length).toBe(promesas.items.length),
    )
    // Mide algo: hay más tarjetas que la elegida, cada una con su sugerencia.
    expect(promesas.items.length).toBeGreaterThan(1)

    const cajas = [...c.container.querySelectorAll('[data-machine-proposal]')]
    expect(cajas).toHaveLength(1)
    expect(plano(cajas[0].closest('.cp-card'))).toContain(`id: ${elegida.id}`)
    expect(plano(cajas[0])).toContain('El motor propone estado: En progreso.')
    servido = {}
  })
})
