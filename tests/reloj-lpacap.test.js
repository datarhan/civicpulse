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

import { contadoresDeCargo, MOTIVOS_SIN_CIFRA, registroUtilizable } from '../src/lib/reloj-lpacap'
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
  ['un recuento que no es un número', { stats: { total: Number.NaN }, items: [] }, 'sinDatos'],
  [
    'la fila del cargo viene a medias',
    instantanea({
      items: [queja({ registered_at: REGISTRADA })],
      byConcejal: { [SLUG]: { total: 1 } },
    }),
    'sinDatos',
  ],
  [
    'la fila trae una cifra imposible',
    instantanea({
      items: [queja({ registered_at: REGISTRADA })],
      byConcejal: { [SLUG]: { total: 1, resueltas: -3, pendientes: 1, silencios: 0 } },
    }),
    'sinDatos',
  ],
  [
    'la fecha de registro no se puede leer',
    instantanea({ items: [queja({ registered_at: 'jueves' })], byConcejal: { [SLUG]: FILA } }),
    'sinRegistro',
  ],
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

describe('registroUtilizable: las dos formas en que el bot publica la fecha', () => {
  // Hasta el 28-09-2026 `registered_at` salía como lo guarda SQLite, en UTC y sin
  // zona; desde entonces el bot lo exporta con la Z. La instantánea publicada
  // cambia de una forma a la otra en el primer `pull-quejas` tras el despliegue,
  // y una queja registrada no puede dejar de contar por eso.
  it.each(['2026-09-27 22:00:01', '2026-09-27T22:00:01Z'])('«%s» es un registro', (marca) => {
    expect(registroUtilizable(marca)).toBe(true)
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

  it('sin instantánea el total es null, no cero: una ausencia no es un dato', () => {
    // El cero se publicaba como «Sin quejas asignadas actualmente» en la ficha y
    // hacía desaparecer la tarjeta del listado, así que un fetch fallido —o el
    // tic de carga— se leía como un hecho sobre el buzón del ayuntamiento.
    expect(contadoresDeCargo(null, SLUG).total).toBeNull()
    expect(contadoresDeCargo({ items: [] }, SLUG).total).toBeNull()
    // Y con la instantánea leída, un cargo sin fila tiene cero DE VERDAD.
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

/**
 * Una fecha de registro es utilizable si el reloj sabe contar desde ella.
 *
 * `registroUtilizable` decide si /cargos, los barrios y /departamentos publican
 * cifras de respuesta, y decía usar «el mismo criterio que el panel para contar
 * días»: `Date.parse`. El reloj ya no cuenta así —lee la marca del bot en UTC y
 * cuenta en el calendario de la sede—, y `Date.parse` acepta formas que el reloj
 * no puede contar, como «09/28/2026», que lee en hora local y al estilo de EE. UU.
 * Dos criterios para la misma regla legal: una queja se contaría como registrada
 * en la ficha de un cargo sin que nadie pudiera decir cuándo le vence el plazo.
 */
describe('registroUtilizable: el mismo criterio que el reloj', () => {
  it('sirven la marca del bot y la ISO con zona', () => {
    expect(registroUtilizable('2026-09-27 22:00:01')).toBe(true)
    expect(registroUtilizable('2026-09-27T22:00:01Z')).toBe(true)
  })

  it('lo que el reloj no sabe leer no cuenta como registro', () => {
    expect(registroUtilizable('09/28/2026')).toBe(false)
    expect(registroUtilizable('ayer')).toBe(false)
    expect(registroUtilizable(null)).toBe(false)
  })
})
