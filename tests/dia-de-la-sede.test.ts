import { afterEach, describe, expect, it } from 'vitest'
import { diaDeLaSede, instanteUtc, ZONA_DE_LA_SEDE } from '../src/scraper/queja-router'
import { instanteUtc as instanteDeLasRelaciones } from '../src/scraper/queja-contract-relations'

/**
 * El día de la sede en que cae una marca de tiempo del bot.
 *
 * El plazo de una queja corre desde su entrada en el registro electrónico (art.
 * 21.3.b LPACAP), y ese registro «se regirá a efectos de cómputo de los plazos,
 * por la fecha y hora oficial de la sede electrónica de acceso» (art. 31.2): la
 * de Riba-roja, que es la de Madrid. El bot guarda sus marcas en UTC y sin la Z
 * (`datetime('now')` de SQLite), así que el día que importa no es ni el de UTC
 * ni el del equipo que lee la marca.
 *
 * El caso que lo hace urgente es real: los dos recibos de la sede del 27-09-2026,
 * presentados un domingo, dicen «Fecha de Registro 28/09/2026 0:00:01». Guardado
 * en UTC es `2026-09-27 22:00:01`: el día de UTC es el 27, y leído como hora
 * local en un navegador de Madrid, también.
 */

const antes = process.env.TZ
afterEach(() => {
  if (antes === undefined) delete process.env.TZ
  else process.env.TZ = antes
})

// El desfase de cada zona el 15 de enero de 2026 a mediodía, para comprobar que
// el cambio de zona surtió efecto: sin esto, en un portátil de Madrid el bucle
// probaría cuatro veces Madrid y pasaría solo.
const DESFASE_EN_ENERO: Record<string, number> = {
  UTC: 0,
  'Europe/Madrid': -60,
  'America/New_York': 300,
  'Pacific/Kiritimati': -840,
}

function enCadaZona(prueba: () => void) {
  for (const [zona, desfase] of Object.entries(DESFASE_EN_ENERO)) {
    process.env.TZ = zona
    expect(new Date(2026, 0, 15, 12).getTimezoneOffset(), `no se aplicó ${zona}`).toBe(desfase)
    prueba()
  }
}

describe('diaDeLaSede — el día civil de Madrid de una marca del bot', () => {
  it('lee la forma de SQLite (UTC sin zona) en UTC, no en la hora del equipo', () => {
    enCadaZona(() => {
      // El recibo del 27-09-2026: 0:00:01 del 28 en Madrid (verano, +02:00).
      expect(diaDeLaSede('2026-09-27 22:00:01')).toBe('2026-09-28')
      expect(diaDeLaSede('2026-09-27 21:59:59')).toBe('2026-09-27')
      // El ejemplo de enero (invierno, +01:00): las 00:30 del 31 en Madrid.
      expect(diaDeLaSede('2026-01-30 23:30:00')).toBe('2026-01-31')
      expect(diaDeLaSede('2026-01-30 22:59:59')).toBe('2026-01-30')
    })
  })

  it('la forma con «T» y sin zona también es UTC', () => {
    // `Date.parse` la leería en hora local: el mismo defecto por otra puerta.
    enCadaZona(() => {
      expect(diaDeLaSede('2026-09-27T22:00:01')).toBe('2026-09-28')
    })
  })

  it('respeta la zona cuando la marca la dice', () => {
    enCadaZona(() => {
      expect(diaDeLaSede('2026-09-27T22:00:01Z')).toBe('2026-09-28')
      // Las dos siguientes cambiarían de día si se leyeran como UTC.
      expect(diaDeLaSede('2026-09-27T23:59:00+02:00')).toBe('2026-09-27')
      // 23:30 a +05:00 son las 18:30 UTC y las 20:30 en Madrid.
      expect(diaDeLaSede('2026-09-27T23:30:00+05:00')).toBe('2026-09-27')
    })
  })

  it('sigue el cambio de hora, no un desfase fijo', () => {
    enCadaZona(() => {
      // 29-03-2026: a las 01:00 UTC Madrid pasa de +01:00 a +02:00.
      expect(diaDeLaSede('2026-03-28 23:30:00')).toBe('2026-03-29')
      expect(diaDeLaSede('2026-03-29 21:59:59')).toBe('2026-03-29')
      expect(diaDeLaSede('2026-03-29 22:00:00')).toBe('2026-03-30')
      // 25-10-2026: a las 01:00 UTC vuelve a +01:00.
      expect(diaDeLaSede('2026-10-24 22:00:00')).toBe('2026-10-25')
      expect(diaDeLaSede('2026-10-25 22:59:59')).toBe('2026-10-25')
      expect(diaDeLaSede('2026-10-25 23:00:00')).toBe('2026-10-26')
    })
  })

  it('una fecha sin hora es ese mismo día', () => {
    enCadaZona(() => {
      expect(diaDeLaSede('2026-09-28')).toBe('2026-09-28')
    })
  })

  it('lo que no es una marca ISO da null, sin adivinar', () => {
    // `new Date('09/28/2026')` lo lee como 28 de septiembre en hora local; aquí
    // no se adivina, que es lo que hace `instanteUtc` con las formas no ISO.
    expect(diaDeLaSede('09/28/2026')).toBeNull()
    expect(diaDeLaSede('28/09/2026 0:00:01')).toBeNull()
    expect(diaDeLaSede('')).toBeNull()
    expect(diaDeLaSede(null)).toBeNull()
    expect(diaDeLaSede(undefined)).toBeNull()
  })

  it('la sede está en Madrid', () => {
    // No es una preferencia de presentación: es la hora oficial de la sede de
    // Riba-roja (art. 31.2 LPACAP), y las páginas la usan para pintar horas.
    expect(ZONA_DE_LA_SEDE).toBe('Europe/Madrid')
  })

  it('hay UN lector de marcas: las relaciones usan el mismo', () => {
    // Dos copias de la misma regex se separan en cuanto una cambia, y la que
    // quede atrás vuelve a leer en hora local lo que la otra ya lee en UTC.
    expect(instanteDeLasRelaciones).toBe(instanteUtc)
  })
})
