import { describe, it, expect } from 'vitest'

import { aggregateNeighborhood, computePerNeighborhood } from '../../src/lib/neighborhood-aggregate'
import { MOTIVOS_SIN_CIFRA } from '../../src/lib/reloj-lpacap'
import { CATALOGUE, LOCALES } from '../../src/i18n'

/**
 * «⏳ 1» junto a un barrio afirma que el ayuntamiento le debe una respuesta.
 *
 * Es el mismo defecto que se arregló por cargo, vivo todavía por barrio. El plazo
 * de la LPACAP corre desde el REGISTRO de la queja, así que mientras ninguna
 * queja de ese barrio esté registrada el ayuntamiento no ha recibido nada que
 * pudiera contestar: «⏳ 1» apunta una deuda que no tiene y «✓ 0 · ⚠ 0» se lee
 * como un expediente limpio que nadie se ha ganado. Con la única queja publicada
 * —capturada y sin registrar— los tres mapas decían exactamente eso.
 *
 * El criterio es UNO y vive en `reloj-lpacap`: `medibilidad(instantánea,
 * pertenece)`. Aquí se comprueba sobre el predicado del barrio; `reloj-lpacap`
 * lo comprueba sobre el del cargo. Dos copias del criterio serían dos
 * oportunidades de arreglar una y dejar la otra, que es justo cómo este defecto
 * sobrevivió al PR que arregló los cargos.
 *
 * ## Lo que SÍ se sigue publicando
 *
 * - **`total`** — cuántas quejas pusieron los vecinos en ese barrio. Es un hecho
 *   del canal, no una nota sobre el ayuntamiento, y se da siempre.
 * - **El color.** `healthFromCounts` sale de lo que los vecinos reportaron, y es
 *   seguro por construcción: `resuelta`, `silencio_negativo` y `escalada_sindic`
 *   son estados POSTERIORES al registro, así que un barrio sin registro no puede
 *   pintar ni rojo, ni ámbar, ni verde — sólo el azul «en curso». Por eso el
 *   módulo lo calcula él con los recuentos crudos y los expone ya gateados: si
 *   las cifras nulas llegaran a `healthFromCounts`, `null / total` daría 0 % en
 *   silencio y el tono saldría de una coerción en vez de de un dato.
 */

const BARRIO = { slug: 'la-reva', name: 'La Reva', centroid: [39.5, -0.5], population: 1200 }
const OTRO = { slug: 'el-molinet', name: 'El Molinet', centroid: [39.5, -0.5] }
const REGISTRADA = '2026-07-10T09:00:00.000Z'

const queja = (over = {}) => ({
  service_request_id: 'Q-1',
  status: 'capturada',
  address_string: 'la-reva',
  registered_at: null,
  ...over,
})

/** Una instantánea de `public/data/quejas.json` con su recuento coherente. */
const instantanea = ({ items, total = items.length }) => ({
  stats: { total, byNeighborhood: {} },
  items,
})

// Todos los casos llevan al menos una queja DEL BARRIO: un barrio sin quejas no
// tiene cifras que gatear, se cae de la lista, y ése es otro caso —el de abajo—.
const CASOS = [
  ['una instantánea sin recuento', { items: [queja()] }, 'sinDatos'],
  [
    'un recuento que no es un número',
    { stats: { total: Number.NaN }, items: [queja()] },
    'sinDatos',
  ],
  [
    'el listado publicado está truncado',
    instantanea({ items: [queja({ registered_at: REGISTRADA })], total: 1001 }),
    'exportIncompleto',
  ],
  ['ninguna queja del barrio llegó al registro', instantanea({ items: [queja()] }), 'sinRegistro'],
  [
    'la fecha de registro no se puede leer',
    instantanea({ items: [queja({ registered_at: 'jueves' })] }),
    'sinRegistro',
  ],
  [
    'la registrada es de OTRO barrio',
    instantanea({
      items: [
        queja(),
        queja({
          service_request_id: 'Q-2',
          address_string: 'el-molinet',
          registered_at: REGISTRADA,
        }),
      ],
    }),
    'sinRegistro',
  ],
]

describe('computePerNeighborhood: cuándo las cifras de respuesta NO se publican', () => {
  for (const [nombre, snap, motivo] of CASOS) {
    it(`${nombre} → motivo ${motivo}, y ninguna de las tres cifras`, () => {
      const fila = computePerNeighborhood(snap, [BARRIO, OTRO]).find((r) => r.slug === BARRIO.slug)
      expect(fila, 'el barrio con quejas tiene que seguir saliendo, con su total').toBeTruthy()
      expect(fila.medible).toBe(false)
      expect(fila.motivo).toBe(motivo)
      expect(fila.resueltas).toBeNull()
      expect(fila.pendientes).toBeNull()
      expect(fila.silencios).toBeNull()
    })
  }

  it('la tabla cubre todos los motivos que el criterio declara', () => {
    // Un motivo nuevo sin su caso aquí es un motivo que nadie ha visto salir.
    expect(new Set(CASOS.map(([, , m]) => m))).toEqual(new Set(MOTIVOS_SIN_CIFRA))
  })

  it('el total sí se publica sin registro: es un hecho del canal', () => {
    const fila = computePerNeighborhood(instantanea({ items: [queja(), queja()] }), [BARRIO])[0]
    expect(fila.total).toBe(2)
    expect(fila.medible).toBe(false)
  })

  /**
   * Sin instantánea no hay motivo que dar.
   *
   * No es que las cifras del barrio no se puedan publicar: es que no se sabe de
   * ninguna queja suya. El barrio se cae de la lista igual que uno con cero, la
   * capa no pinta nada y ése es el estado vacío honesto — no un barrio en blanco
   * con una excusa al lado.
   */
  it('sin instantánea no se inventa una fila con motivo: la lista sale vacía', () => {
    expect(computePerNeighborhood(null, [BARRIO, OTRO])).toEqual([])
    expect(computePerNeighborhood({ items: [] }, [BARRIO])).toEqual([])
  })
})

describe('computePerNeighborhood: cuándo SÍ', () => {
  it('con el listado completo y una queja del barrio registrada, las cifras salen tal cual', () => {
    // El control de la tabla de arriba: la misma forma, ahora con registro.
    const snap = instantanea({
      items: [
        queja({ registered_at: REGISTRADA, status: 'resuelta' }),
        queja({
          service_request_id: 'Q-2',
          registered_at: REGISTRADA,
          status: 'silencio_negativo',
        }),
        queja({ service_request_id: 'Q-3', registered_at: REGISTRADA, status: 'en_tramite' }),
      ],
    })
    const fila = computePerNeighborhood(snap, [BARRIO])[0]
    expect(fila.medible).toBe(true)
    expect(fila.motivo).toBeNull()
    expect(fila).toMatchObject({ total: 3, resueltas: 1, pendientes: 1, silencios: 1 })
  })

  it('un barrio sin ninguna queja sigue cayéndose de la lista', () => {
    const snap = instantanea({ items: [queja({ registered_at: REGISTRADA })] })
    expect(computePerNeighborhood(snap, [BARRIO, OTRO]).map((r) => r.slug)).toEqual([BARRIO.slug])
  })
})

describe('el color no se gatea: sale de lo que reportaron los vecinos', () => {
  it('la fila trae su `health` ya calculado, con los recuentos crudos', () => {
    // Sin registro el tono sólo puede ser el azul «en curso»: los estados que
    // pintan rojo, ámbar o verde son posteriores al registro.
    const fila = computePerNeighborhood(instantanea({ items: [queja()] }), [BARRIO])[0]
    expect(fila.health, 'la fila tiene que traer el tono calculado').toBeTruthy()
    expect(fila.health.level).toBe('civic')
    expect(fila.health.color).toBeTruthy()
  })

  it('con silencios registrados el tono sí sube, y las cifras se publican', () => {
    const snap = instantanea({
      items: [
        queja({ registered_at: REGISTRADA, status: 'silencio_negativo' }),
        queja({ service_request_id: 'Q-2', registered_at: REGISTRADA, status: 'en_tramite' }),
      ],
    })
    const fila = computePerNeighborhood(snap, [BARRIO])[0]
    expect(fila.health.level).toBe('crit') // 1 de 2 = 50 % de silencio
    expect(fila.medible).toBe(true)
    expect(fila.silencios).toBe(1)
  })
})

describe('aggregateNeighborhood aplica el mismo criterio', () => {
  it('sin registro, las tres cifras del popup son null y el total se queda', () => {
    const agg = aggregateNeighborhood({
      neighborhood: BARRIO,
      zones: [],
      instantanea: instantanea({ items: [queja()] }),
    })
    expect(agg.quejas.total).toBe(1)
    expect(agg.quejas.medible).toBe(false)
    expect(agg.quejas.motivo).toBe('sinRegistro')
    expect(agg.quejas.resueltas).toBeNull()
    expect(agg.quejas.pendientes).toBeNull()
    expect(agg.quejas.silencios).toBeNull()
    expect(agg.health.level).toBe('civic')
  })

  it('con registro, el popup publica las tres', () => {
    const agg = aggregateNeighborhood({
      neighborhood: BARRIO,
      zones: [],
      instantanea: instantanea({
        items: [queja({ registered_at: REGISTRADA, status: 'resuelta' })],
      }),
    })
    expect(agg.quejas.medible).toBe(true)
    expect(agg.quejas).toMatchObject({ total: 1, resueltas: 1, pendientes: 0, silencios: 0 })
  })

  it('un barrio sin quejas no inventa un motivo: cero de verdad y tono neutro', () => {
    const agg = aggregateNeighborhood({
      neighborhood: OTRO,
      zones: [],
      instantanea: instantanea({ items: [queja({ registered_at: REGISTRADA })] }),
    })
    expect(agg.quejas.total).toBe(0)
    expect(agg.health.level).toBe('neutral')
  })
})

describe('cada motivo se explica en todos los idiomas', () => {
  // Se reutilizan las claves de `quejas.reloj.*` a propósito: el motivo por el
  // que un barrio no tiene cifras es el mismo por el que no las tiene un cargo,
  // así que no se inventan claves nuevas que traducir.
  for (const lang of LOCALES) {
    it(`${lang}: texto corto para cada motivo`, () => {
      for (const m of MOTIVOS_SIN_CIFRA) {
        expect(CATALOGUE[lang][`quejas.reloj.${m}.corto`], `${lang} ${m}.corto`).toBeTruthy()
      }
    })
  }
})
