import { describe, it, expect } from 'vitest'
import {
  parseSilencios,
  elegirCortes,
  desplazamientos,
  TROZO_S,
  UMBRAL_TROCEO_S,
} from '../src/scraper/cortes-audio'

/**
 * Los trozos de un pleno se cortaban a ciegas cada 1200 s. Medido el 19-11-2026
 * sobre 23 transcripciones: 124 de 195 costuras caen en plena habla y 71 a mitad
 * de frase. `rx4hb4` a 2400 s: «…que los servicios jurídicos municipales la
 * redacción» | «aprobación de un reglamento…», y la declaración publicada
 * `rx4hb4-075-pro-4b9e8e` termina en «la redacción». Cada trozo se transcribe y
 * se diariza por separado, así que la costura parte también al orador en dos
 * etiquetas. Se corta en un silencio cercano, y un resto de segundos se suma al
 * trozo anterior en vez de mandarse solo.
 */

const STDERR = `
[silencedetect @ 0x6000] silence_start: 1187.25
[silencedetect @ 0x6000] silence_end: 1188.1 | silence_duration: 0.85
size=N/A time=00:40:00.00 bitrate=N/A speed= 812x
[silencedetect @ 0x6000] silence_start: 1209.5
[silencedetect @ 0x6000] silence_end: 1211.5 | silence_duration: 2
[silencedetect @ 0x6000] silence_start: 3990
`

describe('parseSilencios', () => {
  it('lee cada silencio con su inicio y su fin', () => {
    expect(parseSilencios(STDERR, 4000)).toEqual([
      { inicio: 1187.25, fin: 1188.1 },
      { inicio: 1209.5, fin: 1211.5 },
      // El último no se cierra: dura hasta el final del audio.
      { inicio: 3990, fin: 4000 },
    ])
  })

  it('sin líneas de silencio, ninguno', () => {
    expect(parseSilencios('size=N/A time=00:00:01.00\n', 60)).toEqual([])
  })
})

describe('elegirCortes', () => {
  it('no trocea lo que cabe en una sola subida', () => {
    expect(elegirCortes(UMBRAL_TROCEO_S, []).cortes).toEqual([])
  })

  it('corta en medio del silencio más largo cerca de cada marca', () => {
    const r = elegirCortes(4000, parseSilencios(STDERR, 4000))
    // 1209.5–1211.5 (2 s) gana a 1187.25–1188.1 (0,85 s); el segundo corte se
    // mide desde el primero, no desde 2400.
    expect(r.cortes[0]).toBe(1210.5)
    expect(r.cortes[1]).toBe(1210.5 + TROZO_S)
  })

  it('cuenta los cortes a ciegas, para que el registro lo diga', () => {
    const r = elegirCortes(4000, parseSilencios(STDERR, 4000))
    // Ningún silencio cerca de 2410,5 ni de 3610,5.
    expect(r.ciegos).toBe(2)
    expect(r.cortes).toHaveLength(3)
  })

  it('ignora un silencio fuera de la ventana', () => {
    const r = elegirCortes(3000, [{ inicio: 1100, fin: 1105 }])
    expect(r.cortes[0]).toBe(TROZO_S)
  })

  it('suma al trozo anterior un resto de pocos segundos', () => {
    // Hoy: «chunk 12/12: 1 segs», un trozo de 3 s mandado solo.
    const r = elegirCortes(2 * TROZO_S + 3, [])
    expect(r.cortes).toEqual([TROZO_S])
  })

  it('nunca deja un trozo mayor que el que admite una subida', () => {
    for (const dur of [1501, 2399, 2410, 2430, 7203, 15650]) {
      const { cortes } = elegirCortes(dur, [])
      const bordes = [0, ...cortes, dur]
      for (let i = 1; i < bordes.length; i += 1) {
        expect(bordes[i] - bordes[i - 1]).toBeLessThanOrEqual(UMBRAL_TROCEO_S)
        expect(bordes[i] - bordes[i - 1]).toBeGreaterThan(0)
      }
    }
  })

  it('el número de trozos sigue cubriendo todo el audio', () => {
    // La comprobación de descarga truncada compara trozos esperados y hechos.
    const { cortes } = elegirCortes(15650, [])
    expect(cortes.length + 1).toBe(Math.ceil(15650 / TROZO_S))
  })
})

describe('desplazamientos', () => {
  it('cada trozo empieza donde lo cortó su corte, no en índice × 1200', () => {
    expect(desplazamientos([1210.5, 2398])).toEqual([0, 1210.5, 2398])
  })
})
