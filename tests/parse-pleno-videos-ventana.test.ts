import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseChannelFeed,
  parseVideoEntry,
  plenoSinFecha,
  matchVideosToPlenos,
  decideEscrituraIndice,
  grabacionMasHonda,
  VENTANA_CANAL,
  MARGEN_AVISO,
  CAUSAS_BAJA,
  BAJAS_TOLERADAS,
  PLENO_VIDEO_KINDS,
} from '../src/scraper/pleno-videos'

/**
 * La ventana sobre el canal y la guarda que impide que el índice encoja callado
 * (medido el 2026-10-27).
 *
 * `yt-dlp --playlist-end N` corta CADA pestaña del canal en N: con 60 salían
 * 121 líneas (Vídeos 60, En directe 60, Curts 1). Se pensaba que la pestaña que
 * mandaba era «En directe», cuya 60.ª entrada era el pleno más antiguo de
 * `plenos.json` (EKoMiCY-HUk, 23-01-2023). No: las grabaciones SUBIDAS —no
 * emitidas en directo— de 22 sesiones están en «Vídeos», entre la 90.ª y la
 * 291.ª, detrás de los programas de Tele Riba-roja, y ninguna ventana de 60 las
 * veía.
 *
 * Fixtures, las dos recortadas a los campos que se leen:
 *   · rr_youtube_channel_entero_2026-10-27.jsonl — el canal ENTERO (1165
 *     líneas: Vídeos 995, En directe 169, Curts 1), volcado con
 *       yt-dlp --flat-playlist --dump-json --extractor-args youtube:lang=ca <canal>
 *     Cortar cada pestaña por `playlist_index` reproduce cualquier ventana.
 *   · rr_youtube_channel_sin-lang_2026-10-27.jsonl — las mismas 121 entradas que
 *     rr_youtube_channel_2026-10-27.jsonl, pedidas SIN `lang`, como las pedía el
 *     CLI hasta #448: L6Cy1hTrpIc vuelve como «Extraordinary Plenary Session
 *     July 3, 2026», y AHxn3d-Kc6g también en inglés. Es la pasada que, de
 *     julio a septiembre, sacó el primero del índice tres veces sin que nadie
 *     lo viera.
 */

const ENTERO = readFileSync(
  resolve('tests/fixtures/rr_youtube_channel_entero_2026-10-27.jsonl'),
  'utf8',
)
const CON_LANG = readFileSync(resolve('tests/fixtures/rr_youtube_channel_2026-10-27.jsonl'), 'utf8')
const SIN_LANG = readFileSync(
  resolve('tests/fixtures/rr_youtube_channel_sin-lang_2026-10-27.jsonl'),
  'utf8',
)
const PLENOS = JSON.parse(readFileSync(resolve('public/data/plenos.json'), 'utf8')).items as {
  id: string
  date: string
}[]
const PRIMERA_SESION = PLENOS.map((p) => p.date).sort()[0]

interface Fila {
  id: string
  title: string
  playlist_title: string
  playlist_index: number
}
const lineas = (jsonl: string) => jsonl.split('\n').filter((l) => l.trim().length > 0)
const filas = (jsonl: string) => lineas(jsonl).map((l) => JSON.parse(l) as Fila)

/**
 * Lo que devolvería `yt-dlp --playlist-end n`: cada pestaña, cortada en n. Una
 * pestaña cortada viene SIN su total —medido el 27-10-2026 con
 * `--playlist-end 3`: «Vídeos» y «En directe» con `playlist_count: null`,
 * «Curts», entera, con 1—, así que se le quita aquí; el volcado entero lo
 * trae porque nada lo cortó. Hasta que se vio en la pasada real, esta función
 * dejaba el 995 y la prueba de pestañas afirmaba un total que el CLI no ve.
 */
function listado(n: number, jsonl = ENTERO): string {
  const tamano = new Map<string, number>()
  for (const f of filas(jsonl))
    tamano.set(f.playlist_title, (tamano.get(f.playlist_title) ?? 0) + 1)
  return lineas(jsonl)
    .filter((l) => (JSON.parse(l) as Fila).playlist_index <= n)
    .map((l) => {
      const f = JSON.parse(l) as Fila & { playlist_count: number | null }
      return (tamano.get(f.playlist_title) ?? 0) > n
        ? JSON.stringify({ ...f, playlist_count: null })
        : l
    })
    .join('\n')
}
const snapshot = (jsonl: string) => parseChannelFeed(jsonl, { generatedAt: '2026-10-27T00:00:00Z' })
const serializa = (jsonl: string) => JSON.stringify(snapshot(jsonl))

const EN_VENTANA = snapshot(listado(VENTANA_CANAL))
const EN_EL_CANAL = snapshot(ENTERO)
const posicion = new Map(filas(ENTERO).map((f) => [f.id, f.playlist_index]))

describe('pleno-videos · la ventana sobre el canal', () => {
  it('alcanza a toda sesión de plenos.json cuya grabación está en el canal', () => {
    const enCanal = Object.keys(matchVideosToPlenos(PLENOS, EN_EL_CANAL.items)).sort()
    const enVentana = Object.keys(matchVideosToPlenos(PLENOS, EN_VENTANA.items)).sort()
    expect(enCanal.length).toBeGreaterThan(40)
    expect(enVentana).toEqual(enCanal)
  })

  it('la ventana vieja de 60 no alcanzaba: es la que esta prueba existe para no repetir', () => {
    const en60 = matchVideosToPlenos(PLENOS, snapshot(listado(60)).items)
    const enCanal = matchVideosToPlenos(PLENOS, EN_EL_CANAL.items)
    const fuera = Object.keys(enCanal).filter((id) => !en60[id])
    // 3-03-2025, 2-12-2024, 11-09-2023: subidas a «Vídeos», no emitidas.
    expect(fuera).toEqual(expect.arrayContaining(['4kokik', '19m20g0', '1g1d38x']))
    expect(fuera.length).toBeGreaterThanOrEqual(10)
  })

  it('con margen: toda grabación de una sesión queda a 150 entradas o más del borde', () => {
    // «Vídeos» crece unas 78 entradas al año (la 1.ª es del 22-10-2026, la
    // 300.ª del 12-12-2022), así que 150 son casi dos años antes de que la más
    // vieja vuelva a quedarse fuera. La más honda hoy es la 291.ª: kS5fyq_a6CY,
    // «Ple ordinari 13 de febrer de 2023 c».
    const fechas = new Set(PLENOS.map((p) => p.date))
    const hondas = EN_EL_CANAL.items
      .filter((v) => fechas.has(v.plenoDate))
      .map((v) => posicion.get(v.ytId) ?? Infinity)
    expect(hondas.length).toBeGreaterThan(40)
    const masHonda = Math.max(...hondas)
    expect(masHonda).toBe(291)
    expect(VENTANA_CANAL - masHonda).toBeGreaterThanOrEqual(150)
    // Lo que el CLI imprime en cada pasada, para que el margen se vea gastarse
    // en el canal vivo y no sólo en este volcado congelado.
    expect(grabacionMasHonda(ENTERO, EN_EL_CANAL, fechas)).toEqual({
      ytId: 'kS5fyq_a6CY',
      plenoDate: '2023-02-13',
      pestana: 'Ajuntament de Riba-roja de Túria - Vídeos',
      posicion: 291,
    })
    expect(VENTANA_CANAL - 291).toBeGreaterThan(MARGEN_AVISO)
  })

  it('un título viejo no se ata a nada: los anteriores a la primera sesión se quedan sin sesión', () => {
    const antiguos = EN_VENTANA.items.filter((v) => v.plenoDate < PRIMERA_SESION)
    expect(antiguos.length).toBeGreaterThan(20)
    const atados = new Set(
      Object.values(matchVideosToPlenos(PLENOS, EN_VENTANA.items)).map((v) => v.ytId),
    )
    expect(antiguos.filter((v) => atados.has(v.ytId))).toEqual([])
  })

  it('lo que el parser no sabe leer es sólo de antes de 2023, y no se ata', () => {
    // «Ple Riba-roja 9/01/2017», «Ple ordinari 7 de feber de 2022», «Ple
    // Riba-roja 15 dic 2016»: fechas que existen en formas que el parser no
    // lee. Ninguna sesión de plenos.json es de esos años, así que enseñárselas
    // no ataría nada; si aparece una de 2023 en adelante, eso sí es un hueco.
    const delParser = EN_VENTANA.sinFecha.filter(
      (s) => s.motivo !== 'sin-dia' && s.motivo !== 'sin-año',
    )
    expect(delParser.length).toBeGreaterThan(0)
    const anio = (t: string) => Number(t.match(/(?<!\d)(?:19|20)\d{2}(?!\d)/)?.[0] ?? NaN)
    const recientes = delParser.filter((s) => !(anio(s.title) < Number(PRIMERA_SESION.slice(0, 4))))
    expect(recientes).toEqual([])
  })

  it('«otro» —tipo que no se pudo leer— no pasa del 10 % en la ventana', () => {
    expect(EN_VENTANA.items.length).toBeGreaterThan(0)
    for (const v of EN_VENTANA.items) expect(PLENO_VIDEO_KINDS).toContain(v.kind)
    expect(EN_VENTANA.stats.byKind.otro / EN_VENTANA.items.length).toBeLessThan(0.1)
  })

  it('las declaraciones de portavoces no son la sesión, aunque el título empiece por «Ple»', () => {
    // GpLGP5eRLiw, 14 min, la 240.ª de «Vídeos». Con la ventana ancha entraba
    // como segundo vídeo «ordinario» de la sesión del 04-12-2023, y el
    // resolvedor se habría negado a elegir entre él y la sesión (2vLWPNAXQMs).
    const clip = filas(ENTERO).find((f) => f.id === 'GpLGP5eRLiw')!
    expect(clip.title).toBe('Ple ordinari 4 desembre 2023 declaracions protaveus')
    expect(parseVideoEntry(clip)).toBeNull()
    expect(plenoSinFecha(clip)).toBeNull()
    expect(EN_VENTANA.items.filter((v) => v.plenoDate === '2023-12-04').map((v) => v.ytId)).toEqual(
      ['2vLWPNAXQMs'],
    )
  })

  it('cuenta, por pestaña, lo leído, y si la ventana la cortó', () => {
    // Cortada: leídas = la ventana y total desconocido. Entera: su total.
    const { pestanas, totalVideosScanned } = EN_VENTANA.stats
    expect(pestanas.reduce((s, p) => s + p.leidas, 0)).toBe(totalVideosScanned)
    expect(pestanas).toEqual([
      { pestana: 'Ajuntament de Riba-roja de Túria - Vídeos', leidas: VENTANA_CANAL, total: null },
      { pestana: 'Ajuntament de Riba-roja de Túria - En directe', leidas: 169, total: 169 },
      { pestana: 'Ajuntament de Riba-roja de Túria - Curts', leidas: 1, total: 1 },
    ])
  })
})

describe('pleno-videos · guarda: el índice no encoge callado', () => {
  it('los títulos traducidos: cada baja con su causa y su título de ahora, nombradas', () => {
    // Pedido una hora después que la fixture con `lang`, YouTube ya traducía
    // DOS plenos, no uno: AHxn3d-Kc6g todavía salía en valenciano a las 08:52.
    // Eso es el vaivén entero: qué título vuelve cambia de una hora a otra.
    const d = decideEscrituraIndice({
      nuevo: snapshot(SIN_LANG),
      jsonl: SIN_LANG,
      anteriorRaw: serializa(CON_LANG),
    })
    expect(d.bajas).toEqual([
      {
        ytId: 'L6Cy1hTrpIc',
        title: 'Ple Extraordinari 3 de juliol de 2026.',
        plenoDate: '2026-07-03',
        causa: 'no-pleno',
        tituloAhora: 'Extraordinary Plenary Session July 3, 2026',
      },
      {
        ytId: 'AHxn3d-Kc6g',
        title: 'Ple extrordinari i urgent 26 de desembre de 2025',
        plenoDate: '2025-12-26',
        causa: 'no-pleno',
        tituloAhora: 'Extraordinary and urgent plenary session December 26, 2025',
      },
    ])
    // Dos de 35 está en lo tolerado: escribe, y las dos van por su nombre.
    expect(d.escribir).toBe(true)
    expect(d.motivo).toMatch(/2 bajas de 35/)
  })

  it('cuenta leídas, con fecha y sin fecha por separado, y cuadran con lo escrito', () => {
    const nuevo = snapshot(SIN_LANG)
    const d = decideEscrituraIndice({ nuevo, jsonl: SIN_LANG, anteriorRaw: serializa(CON_LANG) })
    expect(d.leidas).toBe(121)
    expect(d.conFecha).toBe(nuevo.items.length)
    expect(d.sinFecha).toBe(nuevo.sinFecha.length)
    expect(d.anteriores).toBe(snapshot(CON_LANG).items.length)
    expect(d.conservadas + d.bajas.length).toBe(d.anteriores)
    expect(d.conservadas + d.nuevas).toBe(d.conFecha)
  })

  it(`hasta ${BAJAS_TOLERADAS} bajas escribe; una más, no`, () => {
    // Lo que hacía la ventana de 60 con cada directo nuevo: sacar el más viejo
    // de «En directe». Las tres últimas son plenos (Part II, Part I, 23-01-2023).
    const sinCola = (k: number) =>
      lineas(CON_LANG)
        .filter((l) => {
          const f = JSON.parse(l) as Fila
          return !(f.playlist_title.endsWith('En directe') && f.playlist_index > 60 - k)
        })
        .join('\n')
    const anteriorRaw = serializa(CON_LANG)
    const dos = sinCola(BAJAS_TOLERADAS)
    const tres = sinCola(BAJAS_TOLERADAS + 1)
    const dDos = decideEscrituraIndice({ nuevo: snapshot(dos), jsonl: dos, anteriorRaw })
    const dTres = decideEscrituraIndice({ nuevo: snapshot(tres), jsonl: tres, anteriorRaw })
    expect(dDos.bajas.map((b) => b.causa)).toEqual(Array(BAJAS_TOLERADAS).fill('fuera-del-listado'))
    expect(dDos.escribir).toBe(true)
    expect(dTres.bajas).toHaveLength(BAJAS_TOLERADAS + 1)
    expect(dTres.escribir).toBe(false)
  })

  it('volver a la ventana de 60 sobre el índice ancho se niega', () => {
    const corto = listado(60)
    const d = decideEscrituraIndice({
      nuevo: snapshot(corto),
      jsonl: corto,
      anteriorRaw: JSON.stringify(EN_VENTANA),
    })
    expect(d.bajas.length).toBeGreaterThan(20)
    expect(new Set(d.bajas.map((b) => b.causa))).toEqual(new Set(['fuera-del-listado']))
    expect(d.escribir).toBe(false)
    expect(d.motivo).toMatch(/se niega/)
  })

  it('una pestaña que falta no se tapa con otra que crece: cuenta bajas, no el total', () => {
    // El índice de hoy (60 por pestaña) contra un listado en el que «En
    // directe» no llegó y «Vídeos» sí, entero hasta la ventana. El total SUBE,
    // y aun así se pierden todos los plenos emitidos en directo.
    const soloVideos = lineas(listado(VENTANA_CANAL))
      .filter((l) => !(JSON.parse(l) as Fila).playlist_title.endsWith('En directe'))
      .join('\n')
    const anterior = snapshot(CON_LANG)
    const nuevo = snapshot(soloVideos)
    expect(nuevo.items.length).toBeGreaterThan(anterior.items.length)
    const d = decideEscrituraIndice({
      nuevo,
      jsonl: soloVideos,
      anteriorRaw: JSON.stringify(anterior),
    })
    expect(d.bajas.length).toBeGreaterThan(10)
    expect(d.escribir).toBe(false)
  })

  it('una pasada que no leyó nada no escribe, haya índice anterior o no', () => {
    for (const anteriorRaw of [serializa(CON_LANG), null]) {
      const d = decideEscrituraIndice({ nuevo: snapshot(''), jsonl: '', anteriorRaw })
      expect(d.leidas).toBe(0)
      expect(d.escribir).toBe(false)
    }
  })

  it('sin índice anterior, o ilegible, escribe y dice que no pudo comparar', () => {
    for (const anteriorRaw of [null, '{', '{"items": "no"}']) {
      const d = decideEscrituraIndice({ nuevo: snapshot(CON_LANG), jsonl: CON_LANG, anteriorRaw })
      expect(d.escribir).toBe(true)
      expect(d.anteriores).toBeNull()
      expect(d.bajas).toEqual([])
      expect(d.motivo).toMatch(/sin índice anterior|ilegible/)
    }
  })

  it('el operador puede aceptar las bajas, y queda dicho', () => {
    const corto = listado(60)
    const d = decideEscrituraIndice({
      nuevo: snapshot(corto),
      jsonl: corto,
      anteriorRaw: JSON.stringify(EN_VENTANA),
      aceptarBajas: true,
    })
    expect(d.escribir).toBe(true)
    expect(d.motivo).toMatch(/aceptadas/)
  })

  it('toda causa está en el vocabulario exportado', () => {
    const corto = listado(60)
    const casos = [
      decideEscrituraIndice({
        nuevo: snapshot(SIN_LANG),
        jsonl: SIN_LANG,
        anteriorRaw: serializa(CON_LANG),
      }),
      decideEscrituraIndice({
        nuevo: snapshot(corto),
        jsonl: corto,
        anteriorRaw: JSON.stringify(EN_VENTANA),
      }),
    ]
    const causas = casos.flatMap((d) => d.bajas.map((b) => b.causa))
    expect(causas.length).toBeGreaterThan(0)
    for (const c of causas) expect(CAUSAS_BAJA).toContain(c)
  })
})
