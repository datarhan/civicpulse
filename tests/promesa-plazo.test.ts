/**
 * El plazo de una promesa lo fija una persona, con las palabras de la cita.
 *
 * Hasta la PR #311, «Plazos vencidos» de /departamentos imprimía 0 en áreas
 * donde ninguna promesa llevaba fecha; desde entonces imprime «— · sin plazo
 * fechado», porque ninguna de las promesas publicadas tiene un `dueBy` y ningún
 * CLI podía escribirlo. Un anuncio como «lanzará la convocatoria el próximo mes
 * de septiembre» lleva el plazo en la cita y en ningún campo.
 *
 * Deducirlo del texto sería el plazo inferido por máquina que CLAUDE.md prohíbe
 * («Evidence gates the strong verdicts»). Así que el plazo lo fija una persona
 * con `corregir-promesa plazo`, y el esquema exige lo mismo que a un voto de
 * pleno —el fragmento literal que lo sostiene, `dueBySource`— y algo más: que
 * ese fragmento esté, palabra por palabra, en la cita que la tarjeta publica, y
 * que el cambio deje su rastro firmado (`dueByLog`).
 *
 * Todo sobre una promesa de mentira: ninguna prueba lee ni escribe el
 * `public/data/promises.json` del repositorio.
 */
import { describe, expect, it } from 'vitest'

import { computeDepartmentStats } from '../src/lib/department-stats'
import { celdaPlazosVencidos } from '../src/lib/plazos-vencidos'
import { CATALOGUE } from '../src/i18n'
import { withDueBy, withoutDueBy } from '../src/scraper/promise-corrections'
import {
  DUE_BY_RULES,
  DUE_BY_SOURCE_MIN,
  resolveDueBy,
  validatePromisesSnapshot,
} from '../src/scraper/promises'

const PERSONA = 'María de la Fuente Llorens'
const OTRA = 'Joan Martí Puig'
const ROL = 'civicpulse-curator'
const MOTIVO = 'La nota del Ayuntamiento fija la convocatoria en septiembre de 2026.'
const FRAGMENTO = 'el próximo mes de septiembre'
const AHORA = new Date('2026-10-12T09:00:00Z')

/** Una promesa con la forma del caso real, inventada. */
const promesa = (over: Record<string, unknown> = {}) => ({
  id: 'prueba-plazo-1',
  party: 'PSOE',
  title: 'Ayudas de prueba para rehabilitar fachadas',
  quote: 'El consistorio lanzará la convocatoria el próximo mes de septiembre.',
  source: { url: 'https://www.ribarroja.es/es/noticia/prueba', publisher: 'Ayuntamiento' },
  madeAt: '2026-08-25',
  topic: 'urbanismo',
  kind: 'anuncio-gobierno',
  status: 'en-progreso',
  evidence: [
    {
      date: '2026-08-25',
      url: 'https://www.ribarroja.es/es/noticia/prueba',
      quote: 'Una evidencia de prueba con cuerpo suficiente.',
      publisher: 'Ayuntamiento',
      kind: 'press',
      addedBy: 'auto-curation-v1',
    },
  ],
  createdAt: '2026-09-28',
  response: null,
  ...over,
})

const instantanea = (items: unknown[], over: Record<string, unknown> = {}) =>
  JSON.stringify(
    {
      version: '1.0',
      generatedAt: '2026-10-01T00:00:00.000Z',
      frozenUntil: null,
      legalNotice: 'x'.repeat(100),
      contactUrl: 'https://x.test/issues',
      methodologyUrl: '/metodologia',
      items,
      ...over,
    },
    null,
    2,
  ) + '\n'

const RAW = instantanea([promesa()])

/** Una entrada de la bitácora de plazos que fija `dueBy` desde nada. */
const fijado = (dueBy = '2026-09-30', dueBySource = FRAGMENTO, rule = 'fin-de-mes') => ({
  from: null,
  to: { dueBy, dueBySource, rule },
  reason: MOTIVO,
  editor: PERSONA,
  changedAt: '2026-10-12',
})

const conPlazo = (over: Record<string, unknown> = {}) =>
  promesa({ dueBy: '2026-09-30', dueBySource: FRAGMENTO, dueByLog: [fijado()], ...over })

const item = (json: string) => JSON.parse(json).items[0]

describe('resolveDueBy — cómo se lee la fecha que escribe el curador', () => {
  it('un día se publica tal cual', () => {
    expect(resolveDueBy('2026-09-15')).toEqual({ dueBy: '2026-09-15', rule: 'dia' })
  })

  it('un mes se lee como su último día (regla «fin-de-mes»)', () => {
    expect(resolveDueBy('2026-09')).toEqual({ dueBy: '2026-09-30', rule: 'fin-de-mes' })
    expect(resolveDueBy('2026-12')).toEqual({ dueBy: '2026-12-31', rule: 'fin-de-mes' })
    expect(resolveDueBy('2028-02')).toEqual({ dueBy: '2028-02-29', rule: 'fin-de-mes' })
    expect(resolveDueBy('2027-02')).toEqual({ dueBy: '2027-02-28', rule: 'fin-de-mes' })
  })

  it.each(['2026-02-30', '2026-13', '2026-9', '09/2026', 'septiembre', '2026-09-31', ''])(
    'rechaza «%s»',
    (texto) => {
      expect(() => resolveDueBy(texto)).toThrow(/plazo/)
    },
  )

  it('las reglas son las dos que se describen en /metodologia', () => {
    expect([...DUE_BY_RULES]).toEqual(['dia', 'fin-de-mes'])
  })
})

describe('validatePromisesSnapshot — un plazo sólo con su fragmento literal y su firma', () => {
  it('acepta un plazo con fragmento de la cita y bitácora firmada, y lo conserva al normalizar', () => {
    const snap = validatePromisesSnapshot(instantanea([conPlazo()]))
    expect(snap.items[0].dueBy).toBe('2026-09-30')
    expect(snap.items[0].dueBySource).toBe(FRAGMENTO)
    expect(snap.items[0].dueByLog).toHaveLength(1)
    // Los escritores que serializan la copia normalizada (freeze:set, el
    // auto-curador, apply-promise-draft) no pueden perder el plazo ni su rastro.
    expect(() => validatePromisesSnapshot(JSON.stringify(snap))).not.toThrow()
  })

  it('rechaza un dueBy sin dueBySource', () => {
    const p = conPlazo()
    delete (p as Record<string, unknown>).dueBySource
    expect(() => validatePromisesSnapshot(instantanea([p]))).toThrow(/dueBySource/)
  })

  it('rechaza un dueBySource sin dueBy', () => {
    expect(() =>
      validatePromisesSnapshot(instantanea([promesa({ dueBySource: FRAGMENTO })])),
    ).toThrow(/dueBySource/)
  })

  it('rechaza un fragmento que no está literal en la cita', () => {
    const otro = 'durante el mes de septiembre próximo'
    expect(() =>
      validatePromisesSnapshot(
        instantanea([conPlazo({ dueBySource: otro, dueByLog: [fijado('2026-09-30', otro)] })]),
      ),
    ).toThrow(/no está literal en la cita/)
  })

  it(`rechaza un fragmento de menos de ${DUE_BY_SOURCE_MIN} caracteres, aunque esté en la cita`, () => {
    const corto = 'septiembre'
    expect(() =>
      validatePromisesSnapshot(
        instantanea([conPlazo({ dueBySource: corto, dueByLog: [fijado('2026-09-30', corto)] })]),
      ),
    ).toThrow(/dueBySource/)
  })

  it('rechaza un plazo anterior al día en que se hizo la promesa', () => {
    expect(() =>
      validatePromisesSnapshot(
        instantanea([
          conPlazo({ dueBy: '2026-08-01', dueByLog: [fijado('2026-08-01', FRAGMENTO, 'dia')] }),
        ]),
      ),
    ).toThrow(/madeAt/)
  })

  it('rechaza una fecha que no existe', () => {
    expect(() =>
      validatePromisesSnapshot(
        instantanea([
          conPlazo({ dueBy: '2026-09-31', dueByLog: [fijado('2026-09-31', FRAGMENTO, 'dia')] }),
        ]),
      ),
    ).toThrow(/dueBy/)
  })

  it('rechaza un plazo sin bitácora: nadie firmó que lo dijera', () => {
    const p = conPlazo()
    delete (p as Record<string, unknown>).dueByLog
    expect(() => validatePromisesSnapshot(instantanea([p]))).toThrow(/dueByLog/)
  })

  it('rechaza una bitácora cuyo último plazo no es el publicado', () => {
    expect(() =>
      validatePromisesSnapshot(instantanea([conPlazo({ dueByLog: [fijado('2026-10-31')] })])),
    ).toThrow(/dueByLog/)
  })

  it('rechaza un «fin-de-mes» que no cae en el último día del mes', () => {
    expect(() =>
      validatePromisesSnapshot(
        instantanea([
          conPlazo({ dueBy: '2026-09-29', dueByLog: [fijado('2026-09-29', FRAGMENTO)] }),
        ]),
      ),
    ).toThrow(/fin-de-mes/)
  })

  it('rechaza un plazo fijado con la cuenta de rol: lo firma una persona', () => {
    expect(() =>
      validatePromisesSnapshot(
        instantanea([conPlazo({ dueByLog: [{ ...fijado(), editor: ROL }] })]),
      ),
    ).toThrow(/editor/)
  })

  it('rechaza un motivo de menos de 20 caracteres', () => {
    expect(() =>
      validatePromisesSnapshot(
        instantanea([conPlazo({ dueByLog: [{ ...fijado(), reason: 'corto' }] })]),
      ),
    ).toThrow(/reason/)
  })

  it('rechaza requiresHumanApproval en una promesa publicada', () => {
    expect(() =>
      validatePromisesSnapshot(instantanea([promesa({ requiresHumanApproval: true })])),
    ).toThrow(/requiresHumanApproval/)
  })
})

describe('withDueBy / withoutDueBy — el plazo y su rastro', () => {
  it('fija el plazo, con su fragmento, y deja quién, cuándo, antes→después y por qué', () => {
    const json = withDueBy(
      RAW,
      'prueba-plazo-1',
      { plazo: '2026-09', fuente: FRAGMENTO },
      { reason: MOTIVO, editor: PERSONA },
      AHORA,
    )
    const p = item(json)
    expect(p.dueBy).toBe('2026-09-30')
    expect(p.dueBySource).toBe(FRAGMENTO)
    expect(p.dueByLog).toEqual([
      {
        from: null,
        to: { dueBy: '2026-09-30', dueBySource: FRAGMENTO, rule: 'fin-de-mes' },
        reason: MOTIVO,
        editor: PERSONA,
        changedAt: '2026-10-12',
      },
    ])
    expect(p.updatedAt).toBe('2026-10-12')
    expect(JSON.parse(json).generatedAt).toBe(AHORA.toISOString())
    // El resto de la fila, como se leyó.
    expect(p.quote).toBe(promesa().quote)
    expect(p.evidence).toEqual(promesa().evidence)
  })

  it('un segundo cambio encadena desde el anterior', () => {
    const uno = withDueBy(
      RAW,
      'prueba-plazo-1',
      { plazo: '2026-09', fuente: FRAGMENTO },
      { reason: MOTIVO, editor: PERSONA },
      AHORA,
    )
    const dos = withDueBy(
      uno,
      'prueba-plazo-1',
      { plazo: '2026-09-15', fuente: 'lanzará la convocatoria el próximo mes de septiembre' },
      { reason: 'La nota posterior concreta el día quince de septiembre.', editor: OTRA },
      AHORA,
    )
    const log = item(dos).dueByLog
    expect(log).toHaveLength(2)
    expect(log[1].from).toEqual({ dueBy: '2026-09-30', dueBySource: FRAGMENTO })
    expect(log[1].to.dueBy).toBe('2026-09-15')
    expect(log[1].to.rule).toBe('dia')
  })

  it('quitarlo también se firma y se razona, y la fila queda sin plazo', () => {
    const uno = withDueBy(
      RAW,
      'prueba-plazo-1',
      { plazo: '2026-09', fuente: FRAGMENTO },
      { reason: MOTIVO, editor: PERSONA },
      AHORA,
    )
    const quitado = withoutDueBy(
      uno,
      'prueba-plazo-1',
      { reason: 'El Ayuntamiento aplazó la convocatoria sin fecha nueva.', editor: ROL },
      AHORA,
    )
    const p = item(quitado)
    expect(p.dueBy).toBeUndefined()
    expect(p.dueBySource).toBeUndefined()
    expect(p.dueByLog).toHaveLength(2)
    expect(p.dueByLog[1]).toMatchObject({
      from: { dueBy: '2026-09-30', dueBySource: FRAGMENTO },
      to: null,
      editor: ROL,
    })
    expect(() => validatePromisesSnapshot(quitado)).not.toThrow()
  })

  it('no fija un plazo con un fragmento que no está en la cita', () => {
    expect(() =>
      withDueBy(
        RAW,
        'prueba-plazo-1',
        { plazo: '2026-09', fuente: 'antes de que acabe el verano de 2026' },
        { reason: MOTIVO, editor: PERSONA },
        AHORA,
      ),
    ).toThrow(/no está literal en la cita/)
  })

  it('no fija un plazo firmado con la cuenta de rol', () => {
    expect(() =>
      withDueBy(
        RAW,
        'prueba-plazo-1',
        { plazo: '2026-09', fuente: FRAGMENTO },
        { reason: MOTIVO, editor: ROL },
        AHORA,
      ),
    ).toThrow(/persona|cuenta/)
  })

  it.each(['undefined', 'null', '<nombre y apellidos>'])('no firma con «%s»', (firma) => {
    expect(() =>
      withDueBy(
        RAW,
        'prueba-plazo-1',
        { plazo: '2026-09', fuente: FRAGMENTO },
        { reason: MOTIVO, editor: firma },
        AHORA,
      ),
    ).toThrow()
    expect(() =>
      withoutDueBy(
        withDueBy(
          RAW,
          'prueba-plazo-1',
          { plazo: '2026-09', fuente: FRAGMENTO },
          { reason: MOTIVO, editor: PERSONA },
          AHORA,
        ),
        'prueba-plazo-1',
        { reason: MOTIVO, editor: firma },
        AHORA,
      ),
    ).toThrow()
  })

  it('no fija lo que ya está, ni quita lo que no hay', () => {
    const uno = withDueBy(
      RAW,
      'prueba-plazo-1',
      { plazo: '2026-09', fuente: FRAGMENTO },
      { reason: MOTIVO, editor: PERSONA },
      AHORA,
    )
    expect(() =>
      withDueBy(
        uno,
        'prueba-plazo-1',
        { plazo: '2026-09-30', fuente: FRAGMENTO },
        { reason: MOTIVO, editor: PERSONA },
        AHORA,
      ),
    ).toThrow(/nada que cambiar/)
    expect(() =>
      withoutDueBy(RAW, 'prueba-plazo-1', { reason: MOTIVO, editor: PERSONA }, AHORA),
    ).toThrow(/no tiene plazo/)
  })

  it('no toca nada durante la veda electoral', () => {
    const vedado = instantanea([promesa()], { frozenUntil: '2099-01-01' })
    expect(() =>
      withDueBy(
        vedado,
        'prueba-plazo-1',
        { plazo: '2026-09', fuente: FRAGMENTO },
        { reason: MOTIVO, editor: PERSONA },
        AHORA,
      ),
    ).toThrow(/veda|LOREG/)
  })

  it('una corrección de la cita que deja fuera el fragmento no se escribe', async () => {
    const { withQuoteCorrection } = await import('../src/scraper/promise-corrections')
    const uno = withDueBy(
      RAW,
      'prueba-plazo-1',
      { plazo: '2026-09', fuente: FRAGMENTO },
      { reason: MOTIVO, editor: PERSONA },
      AHORA,
    )
    expect(() =>
      withQuoteCorrection(
        uno,
        'prueba-plazo-1',
        { quote: 'El consistorio lanzará la convocatoria en otoño de este año.' },
        { reason: MOTIVO, editor: PERSONA },
        AHORA,
      ),
    ).toThrow(/no está literal en la cita/)
  })
})

describe('/departamentos lee el plazo que fija la CLI', () => {
  const es = (k: string) => (CATALOGUE.es as Record<string, string>)[k] ?? k

  it('sin plazo, «— · sin plazo fechado»; con el plazo vencido, 1 de 1', () => {
    const antes = computeDepartmentStats({ promises: JSON.parse(RAW), now: AHORA })
    expect(celdaPlazosVencidos(antes.bySlug.urbanismo, es).value).toBe('—')

    const json = withDueBy(
      RAW,
      'prueba-plazo-1',
      { plazo: '2026-09', fuente: FRAGMENTO },
      { reason: MOTIVO, editor: PERSONA },
      AHORA,
    )
    const r = computeDepartmentStats({ promises: JSON.parse(json), now: AHORA })
    const b = r.bySlug.urbanismo
    expect(b.promesas.conPlazo).toBe(1)
    expect(b.promesas.plazosVencidos).toBe(1)
    const celda = celdaPlazosVencidos(b, es)
    expect(celda.value).toBe(1)
    expect(celda.tone).toBe('warn')
    expect(celda.sub).toBe(es('departamentos.card.deConPlazo').replace('{n}', '1'))
  })

  it('un plazo que aún no ha llegado cuenta en el denominador y no como vencido', () => {
    const json = withDueBy(
      RAW,
      'prueba-plazo-1',
      { plazo: '2026-12', fuente: FRAGMENTO },
      { reason: MOTIVO, editor: PERSONA },
      AHORA,
    )
    const b = computeDepartmentStats({ promises: JSON.parse(json), now: AHORA }).bySlug.urbanismo
    expect(b.promesas.conPlazo).toBe(1)
    expect(b.promesas.plazosVencidos).toBe(0)
    expect(celdaPlazosVencidos(b, es).value).toBe(0)
  })
})
