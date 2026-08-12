import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCeselInforme, parseCeselWorkbook, MODOS_GESTION } from '../src/scraper/coste-efectivo'
import { SERVICIOS } from '../src/scraper/indicador-registry'

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n))

// Las dos variantes que publica la consulta, las dos de la entrega 2024 y las
// dos reales: el informe por ente tal cual lo entrega la aplicación, y el de
// comunidad recortado a once municipios por scripts/ (valores verbatim).
const porEnte = parseCeselInforme(fx('cesel_informe_46214_2024.xlsx'), { anio: 2024 })
const porCcaa = parseCeselInforme(fx('cesel_ccaa17_2024_slice.xlsx'), { anio: 2024 })
const mias = (rows: typeof porEnte) => rows.filter((r) => r.ine === '46214')

describe('scraper/coste-efectivo — parseCeselInforme', () => {
  it('lee las dos variantes del informe, que reparten las hojas distinto', () => {
    // por ente: CE1a (gestión) + CE2a (coste) separadas, cabecera «IdInforme».
    // por comunidad: «CE1a y CE2a» juntas, cabecera «Provincia».
    expect(mias(porEnte).length).toBeGreaterThan(20)
    expect(mias(porCcaa).length).toBeGreaterThan(20)
    expect(porCcaa.length).toBeGreaterThan(porEnte.length) // trae más municipios
  })

  it('las dos variantes coinciden en cada cifra del mismo municipio y entrega', () => {
    // Es la comprobación fuerte: dos ficheros distintos del ministerio, con
    // estructura distinta, tienen que decir exactamente lo mismo. Si una lectura
    // se desvía, se desvía sola.
    const a = new Map(mias(porEnte).map((r) => [r.programa, r]))
    const b = new Map(mias(porCcaa).map((r) => [r.programa, r]))
    expect(a.size).toBe(b.size)
    for (const [programa, ra] of a) {
      const rb = b.get(programa)
      expect(rb, `falta ${programa} en la variante por comunidad`).toBeDefined()
      expect(rb!.costeTotal).toBe(ra.costeTotal)
      expect(rb!.modoGestion).toBe(ra.modoGestion)
      expect(rb!.unidades).toEqual(ra.unidades)
    }
  })

  it('traduce el sufijo de la hoja al prefijo del programa', () => {
    // `165` en CE2a es el mismo servicio que `a165` en el volcado nacional, y
    // `151/150P` en CE2b es `b151/150P`. Sin esa traducción el registro de
    // denominadores no casaría con nada y los servicios desaparecerían.
    const programas = new Set(mias(porEnte).map((r) => r.programa))
    expect(programas.has('a165')).toBe(true)
    expect(programas.has('b151/150P')).toBe(true)
    expect(programas.has('165')).toBe(false)
    for (const p of programas) expect(p).toMatch(/^[ab]/)
  })

  it('descarta las entidades dependientes y se queda con el ayuntamiento', () => {
    // El informe por ente trae también una Comunidad de Usuarios que declara
    // «No se presta el servicio» en casi todo. Quedarse con la última fila de
    // cada programa —que es lo que hace un Map.set ingenuo— convertía al
    // ayuntamiento entero en un servicio ausente.
    expect(new Set(porEnte.map((r) => r.ine))).toEqual(new Set(['46214']))
    const alumbrado = mias(porEnte).find((r) => r.programa === 'a165')!
    expect(alumbrado.modoGestion).toBe('directa')
    expect(alumbrado.costeTotal).toBe(664679.12)
  })

  it('lee el total por el nombre de la columna, no por su posición', () => {
    // Las hojas `a` y `b` no tienen el mismo número de columnas de coste; el
    // total se llama `coste_efectivo` en las dos.
    const residuos = mias(porCcaa).find((r) => r.programa === 'a1621')!
    expect(residuos.costeTotal).toBe(740272.16)
    const urbanismo = mias(porCcaa).find((r) => r.programa === 'b151/150P')!
    expect(urbanismo.costeTotal).toBeGreaterThan(0)
  })

  it('conserva la concesión y su unidad física, que es lo que arma la trampa', () => {
    for (const programa of ['a161', 'a160']) {
      const row = mias(porEnte).find((r) => r.programa === programa)!
      expect(row.modoGestion).toBe('concesion')
      expect(row.unidades.length).toBeGreaterThan(0)
    }
  })

  it('emite sólo valores del enum y deja el texto del ministerio intacto', () => {
    for (const r of porCcaa) {
      expect(MODOS_GESTION).toContain(r.modoGestion)
      expect(r.anio).toBe(2024)
      expect(r.ine).toMatch(/^\d{5}$/)
    }
    const concesion = mias(porEnte).find((r) => r.programa === 'a161')!
    expect(concesion.codGestionRaw).toMatch(/riesgo y ventura/i)
  })

  it('produce filas que el registro de denominadores sabe leer', () => {
    // Un informe cuyos programas no casen con el registro deja la página vacía
    // sin que falle nada, que es el modo de fallo silencioso a evitar.
    const programas = new Set(mias(porEnte).map((r) => r.programa))
    const reconocidos = Object.keys(SERVICIOS).filter((p) => programas.has(p))
    expect(reconocidos.length).toBeGreaterThan(8)
  })

  it('devuelve vacío ante un libro que no es un informe, sin reventar', () => {
    // El volcado nacional tiene otras hojas: no debe leerse como informe.
    expect(parseCeselInforme(fx('cesel_2021_cv_slice.xlsx'), { anio: 2021 })).toEqual([])
    // …y el lector del volcado tampoco debe leer un informe.
    expect(parseCeselWorkbook(fx('cesel_informe_46214_2024.xlsx'), { anio: 2024 })).toEqual([])
  })
})
