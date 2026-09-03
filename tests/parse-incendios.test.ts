import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseIncendios,
  unirIncendios,
  unirPorProcedencia,
  normalizarCausa,
  CAUSAS,
  CAUSA_SIN_CLASIFICAR,
} from '../src/scraper/incendios'

// Respuestas reales del MapServer del ICV (capa «Incendios forestales»,
// tm_medio_ambiente/prevencion_de_incendios), consultadas con la frontera
// municipal de geo.json como geometría y spatialRel=esriSpatialRelIntersects,
// que es exactamente lo que hace el CLI. Dos años elegidos por lo que esconden:
//
//   2019 — LA TRAMPA. Los tres incendios están archivados como
//          «RIBA-ROJA DEL TÚRIA»: mayúsculas y «DEL» en vez de «de». Un
//          filtro por nom_mun LIKE '%Riba-roja%' devuelve CERO para 2019 y
//          parece perfectamente sano. El año no estaba vacío: estaba oculto
//          tras una variante ortográfica. Además la causa viene en minúscula
//          («intencionado»), que es la misma que «Intencionado» de otros años.
//
//   2024 — el incendio de 20,97 ha archivado en VILAMARXANT cuyo perímetro
//          entra en Riba-roja. Filtrando por municipio se pierde el mayor
//          suceso reciente del Parc Natural. Trae además una MultiPolygon de
//          tres anillos, que la Polygon de un solo anillo no ejercita.
const f2019 = readFileSync(
  join(__dirname, 'fixtures', 'icv_incendios_2019_2026-09-03.json'),
  'utf8',
)
const f2024 = readFileSync(
  join(__dirname, 'fixtures', 'icv_incendios_2024_2026-09-03.json'),
  'utf8',
)

describe('scraper/incendios', () => {
  const i2019 = parseIncendios(f2019)
  const i2024 = parseIncendios(f2024)

  it('2019 no es un año sin incendios: la variante ortográfica no los esconde', () => {
    // El reproductor. Tres incendios, todos del municipio, pese a
    // «RIBA-ROJA DEL TÚRIA».
    expect(i2019).toHaveLength(3)
    expect(i2019.every((i) => i.propio)).toBe(true)
    expect(i2019.map((i) => i.id).sort()).toEqual(['2019VL0036', '2019VL0044', '2019VL0072'])
    // El nombre oficial se publica VERBATIM: no lo arreglamos, lo citamos.
    expect(i2019[0].municipio).toBe('RIBA-ROJA DEL TÚRIA')
  })

  it('un incendio archivado en otro municipio se marca, no se descarta', () => {
    const vila = i2024.find((i) => i.id === '2024VL0113')!
    expect(vila).toBeDefined()
    expect(vila.municipio).toBe('Vilamarxant')
    expect(vila.propio).toBe(false)
    // La superficie es la del incendio COMPLETO, tal y como la da la GVA.
    // No recortamos por la frontera: sería nuestra cifra con su firma.
    expect(vila.superficieHa).toBe(20.9769)
  })

  it('la causa se normaliza: mayúsculas y sinónimos caen en el mismo cubo', () => {
    // Cuatro grafías distintas del mismo grupo de causa en la fuente.
    expect(normalizarCausa('Intencionado')).toBe('intencionado')
    expect(normalizarCausa('intencionado')).toBe('intencionado')
    expect(normalizarCausa('Intencionada')).toBe('intencionado')
    // «Negligencia» y «Negligencias y Causas accidentales» son lo mismo:
    // separarlas contaba 9 donde hay 44.
    expect(normalizarCausa('Negligencia')).toBe('negligencia')
    expect(normalizarCausa('Negligencias y Causas accidentales')).toBe('negligencia')
    expect(normalizarCausa('Rayo')).toBe('rayo')
  })

  it('«Otras Causas» y «Causa desconocida» son centinelas, no causas', () => {
    // Publicarlas como una causa es el error de «Otro» otra vez: significaba
    // a la vez «un partido» y «no se sabe».
    for (const centinela of ['Otras', 'Otras Causas', 'Causa desconocida', '', ' ', null]) {
      expect(normalizarCausa(centinela)).toBe(CAUSA_SIN_CLASIFICAR)
    }
  })

  it('toda causa cae dentro del enum exportado, y el centinela tiene techo', () => {
    const filas = unirIncendios([i2019, i2024])
    expect(filas.length).toBeGreaterThan(0)
    for (const i of filas) expect(CAUSAS).toContain(i.causa)
    // El techo de reserva: si la fuente cambia de vocabulario, esto se cae
    // en vez de coercer todo a «sin clasificar» y seguir en verde.
    const sinClasificar = filas.filter((i) => i.causa === CAUSA_SIN_CLASIFICAR).length
    expect(sinClasificar / filas.length).toBeLessThan(0.1)
  })

  it('la causa original viaja verbatim para poder citarla', () => {
    const i = i2019.find((x) => x.id === '2019VL0044')!
    expect(i.causa).toBe('intencionado')
    expect(i.causaOriginal).toBe('intencionado')
  })

  it('un paraje en blanco es null, nunca cadena vacía ni «undefined»', () => {
    for (const i of [...i2019, ...i2024]) {
      expect(i.paraje === null || i.paraje.length > 0).toBe(true)
    }
    expect(i2024.find((i) => i.id === '2024VL0142')!.paraje).toBe('Masia de Sant Antoni')
  })

  it('las fechas salen en ISO desde el dd/mm/aaaa de la fuente', () => {
    const i = i2024.find((x) => x.id === '2024VL0155')!
    expect(i.detectadoEl).toBe('2024-05-04')
    expect(i.horaDeteccion).toBe('14:09')
    expect(i.extinguidoEl).toBe('2024-05-06')
  })

  it('los anillos salen en [lat, lng] y redondeados a 5 decimales', () => {
    const i = i2024.find((x) => x.id === '2024VL0142')!
    expect(i.anillos.length).toBeGreaterThan(0)
    const [lat, lng] = i.anillos[0][0]
    // Riba-roja: lat ~39,5 / lng ~-0,5. Invertir el par manda el pin a Kenia.
    expect(lat).toBeGreaterThan(39)
    expect(lat).toBeLessThan(40)
    expect(lng).toBeGreaterThan(-1)
    expect(lng).toBeLessThan(0)
    for (const anillo of i.anillos) {
      for (const [la, ln] of anillo) {
        expect(la).toBe(Number(la.toFixed(5)))
        expect(ln).toBe(Number(ln.toFixed(5)))
      }
    }
  })

  it('una MultiPolygon aporta todos sus anillos, no sólo el primero', () => {
    const vila = i2024.find((i) => i.id === '2024VL0113')!
    expect(vila.anillos).toHaveLength(3)
  })

  it('el centroide cae dentro del bbox del propio incendio', () => {
    for (const i of [...i2019, ...i2024]) {
      const [minLat, minLng, maxLat, maxLng] = i.bbox
      expect(i.centroide[0]).toBeGreaterThanOrEqual(minLat)
      expect(i.centroide[0]).toBeLessThanOrEqual(maxLat)
      expect(i.centroide[1]).toBeGreaterThanOrEqual(minLng)
      expect(i.centroide[1]).toBeLessThanOrEqual(maxLng)
    }
  })

  it('unirIncendios deduplica por id oficial y ordena de forma estable', () => {
    const unido = unirIncendios([i2019, i2024, i2019])
    expect(unido).toHaveLength(i2019.length + i2024.length)
    const ids = unido.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Orden determinista: por año y luego por id, para que el snapshot no
    // cambie de forma sola entre dos pasadas idénticas.
    const esperado = [...ids].sort((a, b) => a.localeCompare(b))
    expect(ids).toEqual(esperado)
  })

  it('un detecp_txt que es un espacio no se publica como medio de detección', () => {
    // Seis filas del corpus traen ' ' — un centinela disfrazado de valor.
    for (const i of [...i2019, ...i2024]) {
      expect(i.deteccion === null || i.deteccion.trim().length > 0).toBe(true)
    }
  })

  it('una carga vacía da cero filas, no revienta', () => {
    expect(parseIncendios('{"type":"FeatureCollection","features":[]}')).toEqual([])
  })
})

describe('scraper/incendios · procedencia', () => {
  const i2019 = parseIncendios(f2019)
  const i2024 = parseIncendios(f2024)

  it('marca si el perímetro toca el término o sólo lo dice la atribución', () => {
    // Dos consultas distintas al mismo servicio: la espacial (el perímetro
    // cruza la frontera) y la nominal (la GVA lo archiva aquí). Casi siempre
    // coinciden; cuando no, la diferencia es el dato.
    const filas = unirPorProcedencia([i2024], [i2019])
    const vila = filas.find((i) => i.id === '2024VL0113')!
    expect(vila.intersecta).toBe(true)
    const soloAtribuido = filas.find((i) => i.id === '2019VL0036')!
    expect(soloAtribuido.intersecta).toBe(false)
  })

  it('el perímetro manda: un incendio en ambas consultas intersecta', () => {
    // 1994VL0267 —el mayor de la serie, 128 ha— lo atribuye la GVA a
    // Riba-roja y lo cartografía FUERA del término: 5,3 km del centro, sin
    // solape ni de bounding box. No se pinta, pero tampoco se tira en
    // silencio; se publica como discrepancia.
    const filas = unirPorProcedencia([i2019], [i2019])
    expect(filas.every((i) => i.intersecta)).toBe(true)
    expect(filas).toHaveLength(i2019.length)
  })
})
