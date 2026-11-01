import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseVideoEntry,
  parseChannelFeed,
  plenoSinFecha,
  argumentosYtdlp,
  PLENO_VIDEO_KINDS,
  MOTIVOS_SIN_FECHA,
} from '../src/scraper/pleno-videos'

/**
 * Los plenos que el canal SÍ publica y el parser no veía (medido el 2026-10-27).
 *
 * `pleno-videos.json` casaba 26 de las 63 sesiones de `plenos.json`, y la causa
 * no era sobre todo la ventana de 60 entradas: la pestaña Live lista los plenos
 * desde enero de 2023, pero `parseVideoEntry` sólo aceptaba «Ple » + día + mes
 * valenciano + «de» + año. Quedaban fuera los títulos en castellano, los que no
 * llevan «de», los que lo llevan ante el día, tres erratas del propio canal y
 * uno que YouTube devolvía TRADUCIDO al inglés («Extraordinary Plenary Session
 * July 3, 2026»), porque `yt-dlp` pide los listados con `hl=en`.
 *
 * La fixture es el volcado real de
 *   yt-dlp --flat-playlist --dump-json --playlist-end 60 \
 *     --extractor-args youtube:lang=ca https://www.youtube.com/@ajuntam_riba_roja_de_turia
 * (121 líneas: Videos, Live y Shorts). Con `lang=ca` y con `lang=es` los 121
 * títulos salen idénticos —el original—; sin `lang`, ocho salen en inglés.
 *
 * Lo que NO se arregla, a propósito: un título sin día o sin año no se ata a una
 * fecha. «Ple ordinari octubre 2023» es la sesión del 02-10-2023 sólo para quien
 * ya lo sabe; regmeet la ata a su sesión (#447). Aquí se queda sin fecha, y se
 * dice cuántos y por qué en vez de callarlo.
 */

const FIXTURE = readFileSync(resolve('tests/fixtures/rr_youtube_channel_2026-10-27.jsonl'), 'utf8')
const SNAP = parseChannelFeed(FIXTURE, { generatedAt: '2026-10-27T00:00:00Z' })
const porId = new Map(SNAP.items.map((v) => [v.ytId, v]))
const filas = FIXTURE.split('\n')
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l) as { id: string; title: string })
const tituloDe = (id: string) => filas.find((f) => f.id === id)?.title ?? `(${id} no está)`

describe('pleno-videos · títulos que se descartaban', () => {
  // Cada fecha es la de una sesión de plenos.json, y en seis de los nueve la
  // página de esa sesión en regmeet incrusta este mismo vídeo (Wayback, 27-10).
  const CASOS = [
    // «Pleno ordinario 10 de febrero de 2025» — castellano
    ['gKUtAb8aMqw', '2025-02-10', 'ordinario'],
    // «Pleno extrordinario y urgente 23 de diciembre de 2025» — castellano y errata
    ['5bpHZRUclkk', '2025-12-23', 'urgente'],
    // «Pleno ordinario 7 ade abril de 2025» — errata «ade»
    ['vR_XPJJPoBg', '2025-04-07', 'ordinario'],
    // «Ple ordinari 6 de Novembre 2023» — sin «de» ante el año
    ['2lbgtbP_Uho', '2023-11-06', 'ordinario'],
    // «Ple extraordinari 24 octubre 2023» — sin ningún «de»
    ['BUW79jOqnIc', '2023-10-24', 'extraordinario'],
    // «Ple extraordinari i urgent 15 desembre 2023» — sin «de»
    ['GFo7NjFStf8', '2023-12-15', 'urgente'],
    // «Ple ordinari 4 de decembre 2023» — errata «decembre»
    ['2vLWPNAXQMs', '2023-12-04', 'ordinario'],
    // «Ple ordinari de 13 febrer de 2023 - Part II» — «de» ante el día
    ['QF3xwnV4ycQ', '2023-02-13', 'ordinario'],
    // «Ple Extraordinari 3 de juliol de 2026.» — llegaba traducido al inglés
    ['L6Cy1hTrpIc', '2026-07-03', 'extraordinario'],
  ] as const

  it.each(CASOS)('%s → %s (%s)', (id, fecha, tipo) => {
    const v = porId.get(id)
    expect(v, tituloDe(id)).toBeDefined()
    expect(v!.plenoDate).toBe(fecha)
    expect(v!.kind).toBe(tipo)
    // El título se publica tal cual lo da el canal: no se corrige ni se traduce.
    expect(v!.title).toBe(tituloDe(id).trim())
  })

  it('la errata «extrordinari» ya no deja el tipo en «otro»', () => {
    // «Ple extrordinari i urgent 26 de desembre de 2025»
    expect(porId.get('AHxn3d-Kc6g')?.kind).toBe('urgente')
  })

  it('lo que ya casaba sigue casando igual', () => {
    expect(porId.get('C7SSTb7q0ys')?.plenoDate).toBe('2026-10-05') // «5 d´octubre  de 2026.»
    expect(porId.get('OGM7-9SLePc')?.plenoDate).toBe('2025-12-23')
    expect(porId.get('7_q2QYdJsAA')?.plenoDate).toBe('2023-02-13') // «- Part I»
    expect(porId.get('hiZ6YplwNzA')?.kind).toBe('extraordinario') // «Ple Extraordinari 31 de Juliol»
  })
})

describe('pleno-videos · sin día o sin año, sin fecha', () => {
  const SIN_FECHA: Record<string, (typeof MOTIVOS_SIN_FECHA)[number]> = {
    SrXYerYa_pQ: 'sin-año', // «Pleno ordinario 2 de diciembre»
    OL3Ga_b9_XA: 'sin-año', // «Pleno extraordinario 13 de mayo»
    C5ZVIzmEK4U: 'sin-año', // «Pleno extraordinario 24 de mayo»
    wxEeSXxt6Zk: 'sin-dia', // «Ple ordinari Juny 2024»
    zv4FtEbzAp0: 'sin-dia', // «Ple extraordinari Juny 2024»
    sy1v_ic4i8k: 'sin-dia', // «Ple ordinari abril 2024»
    'xd-q6CXFS28': 'sin-dia', // «Ple ordinari octubre 2023»
    'ABYYZ-zmPU4': 'sin-dia', // «Ple ordinari juliol 2023»
    BJojmSoO2CU: 'sin-dia', // «Ple extraordinari juliol 2023»
    t2XNOlOu5rk: 'sin-dia', // «Ple extraordinari juny 2023»
    '1W99l8iIT0s': 'sin-dia', // «PLE EXTRAORDINARI MAIG»
    yxCYja3_51Q: 'sin-dia', // «PLE ORDINARI ABRIL 2023»
    Ndp3emhfYhM: 'sin-dia', // «PLE ORDINARI MARÇ 2023»
  }

  it('cada pleno sin día o sin año queda fuera de items y dice por qué', () => {
    for (const id of Object.keys(SIN_FECHA)) expect(porId.has(id), tituloDe(id)).toBe(false)
    const leidos = Object.fromEntries(SNAP.sinFecha.map((s) => [s.ytId, s.motivo]))
    expect(leidos).toEqual(SIN_FECHA)
    expect(SNAP.stats.plenosSinFecha).toBe(SNAP.sinFecha.length)
    for (const s of SNAP.sinFecha) expect(s.title).toBe(tituloDe(s.ytId).trim())
  })

  it('ninguna fecha sale de un mes: el título escribe el día y el año que se publican', () => {
    expect(SNAP.items.length).toBeGreaterThan(0)
    for (const v of SNAP.items) {
      const [anyo, , dia] = v.plenoDate.split('-')
      expect(v.title, v.ytId).toMatch(new RegExp(`(?<!\\d)0?${Number(dia)}(?!\\d)`))
      expect(v.title, v.ytId).toContain(anyo)
    }
  })

  it('un clip de portavoces o una comparecencia no es un pleno sin fecha', () => {
    const noPlenos = ['xt7TEqr7eSQ', '-W8kcP_NlJ0', '2Zw232uJx8s', '-3fmb7CU92w']
    for (const id of noPlenos) {
      const raw = filas.find((f) => f.id === id)
      expect(raw, id).toBeDefined()
      expect(parseVideoEntry(raw!), raw!.title).toBeNull()
      expect(plenoSinFecha(raw!), raw!.title).toBeNull()
    }
  })

  it('un día que el calendario no tiene no se publica', () => {
    const raw = { id: 'abcdefghijk', title: 'Ple ordinari 31 de febrer de 2024' }
    expect(parseVideoEntry(raw)).toBeNull()
    expect(plenoSinFecha(raw)?.motivo).toBe('fecha-imposible')
  })

  it('un mes que no está en la tabla se dice, no se adivina', () => {
    const raw = { id: 'abcdefghijk', title: 'Ple ordinari 4 de decembe de 2023' }
    expect(parseVideoEntry(raw)).toBeNull()
    expect(plenoSinFecha(raw)?.motivo).toBe('mes-desconocido')
  })
})

describe('pleno-videos · vocabulario exportado y techos', () => {
  it('byKind cuenta exactamente los tipos exportados', () => {
    expect(Object.keys(SNAP.stats.byKind).sort()).toEqual([...PLENO_VIDEO_KINDS].sort())
    for (const v of SNAP.items) expect(PLENO_VIDEO_KINDS).toContain(v.kind)
  })

  it('«otro» —tipo que no se pudo leer— no pasa del 10 % de lo casado', () => {
    expect(SNAP.stats.plenoVideosMatched).toBeGreaterThan(0)
    expect(SNAP.stats.byKind.otro / SNAP.stats.plenoVideosMatched).toBeLessThan(0.1)
  })

  it('todo motivo está en el vocabulario exportado, y los de «no sé leerlo» no pasan de cero aquí', () => {
    for (const s of SNAP.sinFecha) expect(MOTIVOS_SIN_FECHA).toContain(s.motivo)
    // `sin-dia` y `sin-año` son el canal; los otros tres serían el parser.
    const delParser = SNAP.sinFecha.filter((s) => s.motivo !== 'sin-dia' && s.motivo !== 'sin-año')
    expect(delParser).toEqual([])
  })
})

describe('pleno-videos · el título original, no la traducción', () => {
  it('el título que YouTube traduce al inglés no se lee como pleno', () => {
    // El mismo vídeo, volcado sin `--extractor-args youtube:lang=…` el 27-10-2026.
    const traducido = { id: 'L6Cy1hTrpIc', title: 'Extraordinary Plenary Session July 3, 2026' }
    expect(parseVideoEntry(traducido)).toBeNull()
    expect(plenoSinFecha(traducido)).toBeNull()
  })

  it('el CLI pide los títulos en su idioma, con los mismos límites que la fixture', () => {
    const args = argumentosYtdlp('https://www.youtube.com/@ajuntam_riba_roja_de_turia', 60)
    const i = args.indexOf('--extractor-args')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(args[i + 1]).toBe('youtube:lang=ca')
    expect(args).toEqual(
      expect.arrayContaining(['--flat-playlist', '--dump-json', '--playlist-end', '60']),
    )
    expect(args[args.length - 1]).toBe('https://www.youtube.com/@ajuntam_riba_roja_de_turia')
  })
})
