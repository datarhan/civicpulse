/**
 * El camino entero de una queja en su ficha (auditoría de las dos lecturas,
 * §19): lo hecho con su fecha, el paso en que está y lo que le falta en gris.
 *
 * La línea temporal pintaba sólo lo ocurrido: una queja recién publicada tenía
 * un hito, «Capturada en CivicPulse», y nada que dijera adónde va. El camino
 * sale del estado que publica el bot; los estados son los suyos, leídos de su
 * fuente, y las cifras —apoyos, días, meses— las de `caminoDeUnaQueja`, las
 * mismas que /quejas dibuja.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  caminoDeLaQueja,
  ESTADOS_DE_LA_QUEJA,
  type PasoDelCamino,
} from '../src/scraper/camino-de-la-queja'
import { caminoDeUnaQueja } from '../src/scraper/en-breve-quejas'

/** Los estados del bot, leídos de `QuejaState` en su fuente. */
const ESTADOS_DEL_BOT = (() => {
  const fuente = readFileSync('bot/src/db/queries.ts', 'utf8')
  const desde = fuente.indexOf('export type QuejaState =')
  const bloque = fuente.slice(desde, fuente.indexOf('\n\n', desde))
  return [...bloque.matchAll(/'(\w+)'/g)].map((m) => m[1])
})()

const QUEJA = {
  status: 'capturada',
  service_code: 'alumbrado',
  apoyos: 3,
  requested_datetime: '2026-08-03 18:20:00',
  updated_datetime: '2026-08-21 09:05:00',
  registered_at: null as string | null,
}
const con = (cambios: Partial<typeof QUEJA>) => ({ ...QUEJA, ...cambios })
const REGISTRADA = { registered_at: '2026-09-01 10:00:00', apoyos: 12 }

const forma = (pasos: PasoDelCamino[]) => pasos.map((p) => `${p.clave}:${p.estado}`)

describe('los estados son los del bot', () => {
  it('mide algo: la fuente del bot trae su lista de estados', () => {
    expect(ESTADOS_DEL_BOT.length).toBeGreaterThan(5)
  })

  it('cada estado que el bot publica tiene su camino, y ninguno más', () => {
    expect([...ESTADOS_DE_LA_QUEJA].sort()).toEqual([...ESTADOS_DEL_BOT].sort())
    for (const status of ESTADOS_DEL_BOT)
      expect(caminoDeLaQueja(con({ status, ...REGISTRADA })), status).not.toBeNull()
  })

  it('un estado que no conoce no se coloca en ningún sitio', () => {
    expect(caminoDeLaQueja(con({ status: 'inventado' }))).toBeNull()
  })
})

describe('el camino de cada estado', () => {
  it('recién publicada: enviada, reuniendo apoyos y todo lo demás por delante', () => {
    const c = caminoDeLaQueja(QUEJA)!
    expect(forma(c.pasos)).toEqual([
      'enviada:hecho',
      'apoyos:ahora',
      'registro:pendiente',
      'respuesta:pendiente',
      'escalado:pendiente',
    ])
    expect(c.pasos[0].fecha).toBe(QUEJA.requested_datetime)
    expect(c.apoyos).toBe(3)
  })

  it('con los apoyos: el registro es lo que toca, y los apoyos se fechan', () => {
    const c = caminoDeLaQueja(con({ status: 'apoyada_verificada', apoyos: 10 }))!
    expect(forma(c.pasos)).toEqual([
      'enviada:hecho',
      'apoyos:hecho',
      'registro:ahora',
      'respuesta:pendiente',
      'escalado:pendiente',
    ])
    expect(c.pasos[1].fecha).toBe(QUEJA.updated_datetime)
  })

  it.each(['registrada', 'notificada_10d', 'en_tramite'])(
    '%s: registrada con su fecha y esperando respuesta',
    (status) => {
      const c = caminoDeLaQueja(con({ status, ...REGISTRADA }))!
      expect(forma(c.pasos)).toEqual([
        'enviada:hecho',
        'apoyos:hecho',
        'registro:hecho',
        'respuesta:ahora',
        'escalado:pendiente',
      ])
      // Los apoyos pasaron, pero `updated_datetime` ya no dice cuándo.
      expect(c.pasos[1].fecha).toBeNull()
      expect(c.pasos[2].fecha).toBe(REGISTRADA.registered_at)
    },
  )

  it('registrada sin llegar a los apoyos: no dice que llegara', () => {
    const c = caminoDeLaQueja(con({ status: 'registrada', ...REGISTRADA, apoyos: 4 }))!
    expect(forma(c.pasos)).not.toContain('apoyos:hecho')
    expect(forma(c.pasos)).toContain('registro:hecho')
  })

  it('resuelta: termina ahí, sin escalado', () => {
    const c = caminoDeLaQueja(con({ status: 'resuelta', ...REGISTRADA }))!
    expect(forma(c.pasos).slice(-2)).toEqual(['registro:hecho', 'resuelta:hecho'])
    expect(c.pasos.at(-1)!.fecha).toBe(QUEJA.updated_datetime)
  })

  it('resuelta sin registro: no se inventa el registro', () => {
    const c = caminoDeLaQueja(con({ status: 'resuelta', apoyos: 2 }))!
    expect(forma(c.pasos)).toEqual(['enviada:hecho', 'resuelta:hecho'])
  })

  it('en silencio: el silencio fechado, y el escalado es lo que toca', () => {
    const c = caminoDeLaQueja(con({ status: 'silencio_negativo', ...REGISTRADA }))!
    expect(forma(c.pasos).slice(-2)).toEqual(['silencio:hecho', 'escalado:ahora'])
    expect(c.pasos.at(-2)!.fecha).toBe(QUEJA.updated_datetime)
  })

  it('escalada al Síndic: el silencio pasó sin fecha, el escalado con la suya', () => {
    const c = caminoDeLaQueja(con({ status: 'escalada_sindic', ...REGISTRADA }))!
    expect(forma(c.pasos).slice(-2)).toEqual(['silencio:hecho', 'escalado:hecho'])
    expect(c.pasos.at(-2)!.fecha).toBeNull()
    expect(c.pasos.at(-1)!.fecha).toBe(QUEJA.updated_datetime)
    expect(c.escalado).toBe('sindic')
  })

  it('cerrada sin registrar: termina ahí, sin nada por delante', () => {
    expect(forma(caminoDeLaQueja(con({ status: 'cerrada_no_registrada' }))!.pasos)).toEqual([
      'enviada:hecho',
      'cerrada:hecho',
    ])
    expect(
      forma(caminoDeLaQueja(con({ status: 'cerrada_no_registrada', apoyos: 11 }))!.pasos),
    ).toEqual(['enviada:hecho', 'apoyos:hecho', 'cerrada:hecho'])
  })

  it('en todos: nada hecho después de lo que toca, y como mucho un «ahora»', () => {
    const orden = { hecho: 0, ahora: 1, pendiente: 2 }
    for (const status of ESTADOS_DE_LA_QUEJA) {
      const pasos = caminoDeLaQueja(con({ status, ...REGISTRADA }))!.pasos
      const rangos = pasos.map((p) => orden[p.estado])
      expect(rangos, status).toEqual([...rangos].sort((a, b) => a - b))
      expect(pasos.filter((p) => p.estado === 'ahora').length, status).toBeLessThanOrEqual(1)
      expect(pasos[0], status).toMatchObject({ clave: 'enviada', estado: 'hecho' })
    }
  })
})

describe('las cifras son las de /quejas, y dependen de la categoría', () => {
  const general = caminoDeUnaQueja()

  it('una queja general: acuse, tres meses y el Síndic', () => {
    const c = caminoDeLaQueja(QUEJA)!
    expect(c).toMatchObject({
      umbral: general.apoyos,
      acuseDias: general.acuseDias,
      meses: general.meses,
      escalado: 'sindic',
    })
  })

  it('transparencia: un mes, sin acuse, y se reclama al Consell de Transparència', () => {
    const c = caminoDeLaQueja(con({ service_code: 'transparencia' }))!
    expect(c).toMatchObject({
      meses: general.mesesTransparencia,
      acuseDias: null,
      escalado: 'consell',
    })
  })
})
