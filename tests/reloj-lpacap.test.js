/**
 * «0 silencios» al lado del nombre de una concejala afirma algo sobre el
 * ayuntamiento: que no ha dejado vencer ningún plazo. Pero el plazo legal
 * (LPACAP) corre desde el REGISTRO de la queja, y la única queja publicada
 * nunca se registró. El ayuntamiento no ha recibido nada que pudiera contestar
 * o dejar sin contestar, así que ese cero no mide nada y se lee como un
 * aprobado. Y «pendientes 1» apunta como pendiente del ayuntamiento una queja
 * que el ayuntamiento no tiene.
 *
 * contadoresDeCargo() sólo da resueltas, pendientes y silencios cuando se
 * pueden leer como respuestas del ayuntamiento: el listado publicado está
 * completo —el bot exporta como mucho mil— y al menos una queja de ESE cargo
 * llegó al registro. Si no, las tres son null y hay un motivo que la página
 * enseña. El total de quejas asignadas sí se da: es un hecho del canal, no
 * una nota al ayuntamiento.
 */
import { describe, expect, it } from 'vitest'

import { contadoresDeCargo, MOTIVOS_SIN_CIFRA } from '../src/lib/reloj-lpacap'
import { CATALOGUE, LOCALES } from '../src/i18n'

const SLUG = 'teresa-pozuelo-martin'
const REGISTRADA = '2026-07-10T09:00:00.000Z'
const FILA = { total: 1, resueltas: 0, pendientes: 1, silencios: 0 }

const queja = (over = {}) => ({
  service_request_id: 'Q-1',
  status: 'capturada',
  concejal_slug: SLUG,
  registro_entry_number: null,
  registered_at: null,
  ...over,
})
const instantanea = ({ items, byConcejal, total = items.length }) => ({
  stats: { total, byConcejal },
  items,
})

const CASOS = [
  ['sin instantánea', null, 'sinDatos'],
  ['una instantánea sin recuento', { items: [queja()] }, 'sinDatos'],
  [
    'el listado publicado está truncado',
    instantanea({
      items: [queja({ registered_at: REGISTRADA })],
      byConcejal: { [SLUG]: FILA },
      total: 1001,
    }),
    'exportIncompleto',
  ],
  [
    'ninguna queja del cargo llegó al registro',
    instantanea({ items: [queja()], byConcejal: { [SLUG]: FILA } }),
    'sinRegistro',
  ],
  [
    'la registrada es de OTRO cargo',
    instantanea({
      items: [
        queja(),
        queja({
          service_request_id: 'Q-2',
          concejal_slug: 'otro-cargo',
          registered_at: REGISTRADA,
        }),
      ],
      byConcejal: { [SLUG]: FILA, 'otro-cargo': FILA },
    }),
    'sinRegistro',
  ],
  [
    'el cargo no tiene ninguna queja asignada',
    instantanea({ items: [], byConcejal: {} }),
    'sinRegistro',
  ],
]

describe('contadoresDeCargo: cuándo NO hay cifras', () => {
  for (const [nombre, snap, motivo] of CASOS) {
    it(`${nombre} → motivo ${motivo}, y ninguna de las tres cifras`, () => {
      const r = contadoresDeCargo(snap, SLUG)
      expect(r.medible).toBe(false)
      expect(r.motivo).toBe(motivo)
      expect(r.resueltas).toBeNull()
      expect(r.pendientes).toBeNull()
      expect(r.silencios).toBeNull()
    })
  }

  it('la tabla cubre todos los motivos que el módulo declara', () => {
    // Un motivo nuevo sin su caso aquí es un motivo que nadie ha visto salir.
    expect(new Set(CASOS.map(([, , m]) => m))).toEqual(new Set(MOTIVOS_SIN_CIFRA))
  })
})

describe('contadoresDeCargo: cuándo SÍ', () => {
  it('con el listado completo y una queja del cargo registrada, las cifras salen tal cual', () => {
    // El control de la tabla de arriba: la misma forma, ahora con registro.
    const snap = instantanea({
      items: [queja({ registered_at: REGISTRADA, registro_entry_number: 'RE-1' })],
      byConcejal: { [SLUG]: { total: 1, resueltas: 0, pendientes: 0, silencios: 1 } },
    })
    const r = contadoresDeCargo(snap, SLUG)
    expect(r.medible).toBe(true)
    expect(r.motivo).toBeNull()
    expect(r).toMatchObject({ total: 1, resueltas: 0, pendientes: 0, silencios: 1 })
  })

  it('el total de quejas asignadas se da también sin registro, y es cero sin fila', () => {
    const conFila = instantanea({ items: [queja()], byConcejal: { [SLUG]: FILA } })
    expect(contadoresDeCargo(conFila, SLUG).total).toBe(1)
    expect(contadoresDeCargo(instantanea({ items: [], byConcejal: {} }), SLUG).total).toBe(0)
  })
})

describe('cada motivo se explica en todos los idiomas', () => {
  for (const lang of LOCALES) {
    it(`${lang}: texto largo y corto para cada motivo`, () => {
      for (const m of MOTIVOS_SIN_CIFRA) {
        expect(CATALOGUE[lang][`quejas.reloj.${m}`], `${lang} quejas.reloj.${m}`).toBeTruthy()
        expect(
          CATALOGUE[lang][`quejas.reloj.${m}.corto`],
          `${lang} quejas.reloj.${m}.corto`,
        ).toBeTruthy()
      }
    })
  }
})
