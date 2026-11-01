// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { construirParo, MUNI, type ParoPayload } from '../src/scraper/paro-fetch'
import type { ParoSnapshot } from '../src/scraper/paro'

/**
 * El 2026-10-27 a las 06:20, `scrape-ci-blocked` publicó un paro.json con DOS
 * meses menos y salió con 0. El registro decía, de 2026-09 y de 2025-07,
 * «skipped: The operation was aborted due to timeout», y ninguna línea de
 * «transient fetch error» antes: `fetch()` había devuelto las cabeceras a la
 * primera, y el `AbortSignal.timeout(30_000)` cortó después la LECTURA del
 * cuerpo, `res.arrayBuffer()`, que estaba fuera del try de los reintentos. La
 * excepción subía al catch de main(), que la anotaba como «skipped», no la
 * contaba para el cortacircuitos y seguía. `latestPeriod` retrocedió de
 * 2026-09 a 2026-08: un mes que nadie llegó a leer se publicó como un mes que
 * no existe (clase E05 del atlas: lo que no corrió cuenta como «no había
 * nada»; regla 2 de CLAUDE.md).
 *
 * La regla que fijan estas pruebas: una fila sólo sale de la serie, o cambia,
 * por una LECTURA nueva. Un mes que no se pudo leer conserva la fila del
 * fichero anterior, y el bloque `stats` dice cuál y por qué.
 */

const AHORA = new Date(2026, 9, 27, 6, 20) // hora local, como la del cron

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function periodoDe(url: string): string {
  const m = /\/(\d{4})\/([a-z]+)_\d{4}\//.exec(url)
  if (!m) throw new Error(`URL sin mes: ${url}`)
  return `${m[1]}-${String(MESES.indexOf(m[2]) + 1).padStart(2, '0')}`
}

/** Los 24 meses que recorre la pasada de AHORA: 2024-11 … 2026-10. */
const VENTANA = Array.from({ length: 24 }, (_, i) => {
  const d = new Date(2024, 10 + i, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})

function fila(period: string, total: number): ParoSnapshot {
  const men = Math.round(total * 0.38)
  return {
    municipio: MUNI,
    period,
    total,
    men,
    women: total - men,
    source: 'SEPE Muniacteco 20-45',
  }
}

/** El fichero publicado antes de la pasada: hasta 2026-09, con sus dos 1178 reales. */
const PREVIO: ParoSnapshot[] = VENTANA.slice(0, 23).map((p, i) =>
  p === '2026-09'
    ? { ...fila(p, 1178), men: 452, women: 726 }
    : p === '2025-07'
      ? { ...fila(p, 1178), men: 457, women: 721 }
      : fila(p, 1150 + i),
)
const valorPrevio = (p: string) => PREVIO.find((r) => r.period === p)

/**
 * Lo que «responde» SEPE a cada mes.
 *  - `xls`: el libro entero (cabecera CDFV2 y el periodo, que lee el parser falso)
 *  - `404`: aún no publicado — lo normal del mes más nuevo
 *  - `html`: la página de SEPE con un 200 en lugar del XLS
 *  - `cuerpo-cortado`: cabeceras a la primera, y el cuerpo abortado a media
 *    lectura — lo que hace `AbortSignal.timeout` pasados los 30 s
 *  - `red`: ni cabeceras (el apretón de manos TLS que SEPE deja caer)
 *  - un número: ese estado HTTP
 */
type Guion = Record<string, 'xls' | '404' | 'html' | 'cuerpo-cortado' | 'red' | number>

function montar(guion: Guion, lecturas: Record<string, number | null> = {}) {
  const llamadas: string[] = []
  const fetchImpl = (async (url: string) => {
    const p = periodoDe(url)
    llamadas.push(p)
    const r = guion[p] ?? 'xls'
    const xls = { 'content-type': 'application/vnd.ms-excel;charset=UTF-8' }
    if (r === 'red') throw new TypeError('fetch failed')
    if (r === '404')
      return new Response('<html>SEPE</html>', {
        status: 404,
        headers: { 'content-type': 'text/html;charset=UTF-8' },
      })
    if (r === 'html')
      return new Response('<html>SEPE</html>', {
        status: 200,
        headers: { 'content-type': 'text/html;charset=UTF-8' },
      })
    if (r === 'cuerpo-cortado')
      return new Response(
        new ReadableStream({
          pull(c) {
            c.error(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
          },
        }),
        { status: 200, headers: xls },
      )
    if (typeof r === 'number') return new Response('', { status: r })
    const libro = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.from(p)])
    return new Response(libro, { status: 200, headers: xls })
  }) as typeof fetch
  // El parser de verdad está fijado en parse-paro.test.ts contra la descarga
  // real; aquí basta uno que no necesite un libro de 3 MB por mes. Por defecto
  // lee lo mismo que ya estaba publicado; `lecturas` cambia un mes, y `null`
  // es un libro sin la fila de Riba-roja.
  const parse = (buf: Buffer | ArrayBuffer, opts: { municipio: string; period: string }) => {
    expect(
      Buffer.from(buf as Buffer)
        .subarray(4)
        .toString(),
    ).toBe(opts.period)
    if (opts.period in lecturas) {
      const v = lecturas[opts.period]
      return v === null ? null : fila(opts.period, v)
    }
    return valorPrevio(opts.period) ?? fila(opts.period, 1100)
  }
  return { llamadas, deps: { now: AHORA, fetchImpl, esperar: async () => {}, parse } }
}

const periodos = (p: ParoPayload) => p.series.map((r) => r.period)

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('construirParo — un mes sin leer no sale de la serie', () => {
  it('2026-10-27: el cuerpo de 2026-09 y el de 2025-07 se cortan; ninguno desaparece', async () => {
    const { llamadas, deps } = montar({
      '2026-10': '404',
      '2026-09': 'cuerpo-cortado',
      '2025-07': 'cuerpo-cortado',
    })
    const r = await construirParo({ ...deps, previo: PREVIO })
    if (r.ok === false) throw new Error(r.motivo)

    expect(r.payload.latestPeriod).toBe('2026-09')
    expect(r.payload.latestTotal).toBe(1178)
    expect(periodos(r.payload)).toEqual(VENTANA.slice(0, 23))
    expect(r.payload.series.find((s) => s.period === '2026-09')).toEqual(valorPrevio('2026-09'))
    expect(r.payload.series.find((s) => s.period === '2025-07')).toEqual(valorPrevio('2025-07'))

    // Lo dice, con el motivo: estas dos filas no salen de esta pasada.
    expect(r.payload.stats.arrastrados.map((a) => [a.period, a.estado])).toEqual([
      ['2025-07', 'sin-respuesta'],
      ['2026-09', 'sin-respuesta'],
    ])
    expect(r.payload.stats.arrastrados[0].motivo).toMatch(/aborted due to timeout/)
    expect(r.payload.stats.fueraDeLaSerie).toEqual([
      { period: '2026-10', estado: 'ausente', motivo: 'HTTP 404' },
    ])
    // Las tres cuentas separadas suman los meses recorridos: nada se pierde
    // entre «leído» y «no había».
    const s = r.payload.stats
    expect(s.leidos).toBe(21)
    expect(s.leidos + s.arrastrados.length + s.fueraDeLaSerie.length).toBe(s.mesesRecorridos)
    expect(s.mesesRecorridos).toBe(24)

    // La lectura del cuerpo tiene los mismos reintentos que el apretón de manos.
    expect(llamadas.filter((p) => p === '2026-09')).toHaveLength(3)
    expect(llamadas.filter((p) => p === '2025-07')).toHaveLength(3)
  })

  it('tres meses seguidos sin respuesta cortan la pasada, también si lo que se corta es el cuerpo', async () => {
    const { deps } = montar({
      '2026-10': '404',
      '2026-09': 'cuerpo-cortado',
      '2026-08': 'red',
      '2026-07': 'cuerpo-cortado',
    })
    const r = await construirParo({ ...deps, previo: PREVIO })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.motivo).toMatch(/3 consecutive months unreachable/)
  })

  it('un mes sin respuesta que el fichero anterior no tenía no se inventa: queda fuera, como «sin-respuesta», no como «ausente»', async () => {
    const { deps } = montar({ '2026-10': 'cuerpo-cortado' })
    const r = await construirParo({ ...deps, previo: PREVIO })
    if (r.ok === false) throw new Error(r.motivo)
    expect(r.payload.latestPeriod).toBe('2026-09')
    expect(periodos(r.payload)).not.toContain('2026-10')
    expect(r.payload.stats.fueraDeLaSerie).toEqual([
      expect.objectContaining({ period: '2026-10', estado: 'sin-respuesta' }),
    ])
  })

  it('un error HTTP que no es 404 no es «no publicado»: el mes conserva su fila', async () => {
    const { llamadas, deps } = montar({ '2026-10': '404', '2026-08': 503 })
    const r = await construirParo({ ...deps, previo: PREVIO })
    if (r.ok === false) throw new Error(r.motivo)
    expect(r.payload.series.find((s) => s.period === '2026-08')).toEqual(valorPrevio('2026-08'))
    expect(r.payload.stats.arrastrados).toEqual([
      { period: '2026-08', estado: 'sin-respuesta', motivo: 'HTTP 503' },
    ])
    expect(llamadas.filter((p) => p === '2026-08')).toHaveLength(3)
  })

  it('un libro del que el parser no saca la fila tampoco borra la que había, y se nombra aparte', async () => {
    const { deps } = montar({ '2026-10': '404' }, { '2026-05': null })
    const r = await construirParo({ ...deps, previo: PREVIO })
    if (r.ok === false) throw new Error(r.motivo)
    expect(r.payload.series.find((s) => s.period === '2026-05')).toEqual(valorPrevio('2026-05'))
    // El motivo culpa al parser, no al libro: el de mayo de 2026 SÍ trae la
    // fila, en la columna 0 (atlas I-2026-10-27-paro-motivo-ilegible-falso).
    expect(r.payload.stats.arrastrados).toEqual([
      {
        period: '2026-05',
        estado: 'ilegible',
        motivo: 'el parser no sacó la fila de Riba-roja de Túria del XLS',
      },
    ])
  })

  it('una lectura nueva sí manda sobre la fila anterior', async () => {
    const { deps } = montar({ '2026-10': '404' }, { '2026-09': 1190 })
    const r = await construirParo({ ...deps, previo: PREVIO })
    if (r.ok === false) throw new Error(r.motivo)
    expect(r.payload.series.find((s) => s.period === '2026-09')?.total).toBe(1190)
    expect(r.payload.latestTotal).toBe(1190)
    expect(r.payload.stats.arrastrados).toEqual([])
  })

  it('una fila anterior que ya cae fuera de los 24 meses no se arrastra', async () => {
    const { deps } = montar({ '2026-10': '404' })
    const r = await construirParo({ ...deps, previo: [fila('2024-10', 1300), ...PREVIO] })
    if (r.ok === false) throw new Error(r.motivo)
    expect(periodos(r.payload)[0]).toBe('2024-11')
  })

  it('sin ninguna lectura nueva no se escribe nada, aunque el fichero anterior pudiera rellenar la serie entera', async () => {
    const { deps } = montar(Object.fromEntries(VENTANA.map((p) => [p, '404'])))
    const r = await construirParo({ ...deps, previo: PREVIO })
    expect(r.ok).toBe(false)
  })
})

describe('construirParo — lo normal sigue siendo normal', () => {
  it('el 404 del mes más nuevo no cuenta como fallo de red ni se reintenta', async () => {
    const { llamadas, deps } = montar({ '2026-10': '404' })
    const r = await construirParo({ ...deps, previo: PREVIO })
    if (r.ok === false) throw new Error(r.motivo)
    expect(r.payload.latestPeriod).toBe('2026-09')
    expect(r.payload.stats.leidos).toBe(23)
    expect(r.payload.stats.arrastrados).toEqual([])
    expect(llamadas.filter((p) => p === '2026-10')).toHaveLength(1)
  })

  it('un 200 sin XLS para el mes más nuevo es «ausente», no un fallo', async () => {
    const { llamadas, deps } = montar({ '2026-10': 'html' })
    const r = await construirParo({ ...deps, previo: PREVIO })
    if (r.ok === false) throw new Error(r.motivo)
    // Dice lo que llegó, sin atribuírselo a nadie.
    expect(r.payload.stats.fueraDeLaSerie).toEqual([
      {
        period: '2026-10',
        estado: 'ausente',
        motivo: 'HTTP 200 sin un XLS (text/html;charset=UTF-8)',
      },
    ])
    expect(llamadas.filter((p) => p === '2026-10')).toHaveLength(1)
  })

  it('sin fichero anterior, la serie es lo que se leyó', async () => {
    const { deps } = montar({ '2026-10': '404', '2025-07': 'cuerpo-cortado' })
    const r = await construirParo({ ...deps, previo: null })
    if (r.ok === false) throw new Error(r.motivo)
    expect(periodos(r.payload)).toEqual(VENTANA.slice(0, 23).filter((p) => p !== '2025-07'))
    expect(r.payload.stats.fueraDeLaSerie.map((f) => f.period)).toEqual(['2025-07', '2026-10'])
  })
})
