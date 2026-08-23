import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseBormeSeccion, seccionesDelSumario } from '../src/scraper/borme'

/**
 * BORME, sección de empresarios de una provincia, contra un volcado real.
 *
 * La fixture es la sección de Alicante del 18 de mayo de 2026 tal como la sirve
 * el BOE, sin recortar. Es el contrato en ROJO: si el parser deja de sacar de
 * ahí lo que este test pide, es que el formato cambió y hay que mirarlo, no que
 * el test esté mal.
 *
 * Se eligió esa fecha porque trae los tres casos que la ficha societaria
 * necesita saber leer: una revocación de apoderados (Hidraqua), una declaración
 * de unipersonalidad con su socio único, y un nombramiento de administrador.
 */
const HTML = readFileSync(join(__dirname, 'fixtures/borme_alicante_2026-05-18.html'), 'utf8')

describe('borme — la sección provincial se convierte en anuncios', () => {
  const anuncios = parseBormeSeccion(HTML)

  it('mide algo: la sección trae anuncios de verdad, no una página vacía', () => {
    expect(HTML.length).toBeGreaterThan(20000)
    expect(anuncios.length).toBeGreaterThan(50)
  })

  it('cada anuncio sale con su número y su denominación', () => {
    for (const a of anuncios) {
      expect(a.numero, `anuncio sin número: ${a.denominacion}`).toBeGreaterThan(0)
      expect(a.denominacion.length, `anuncio ${a.numero} sin denominación`).toBeGreaterThan(2)
    }
  })

  it('encuentra la sociedad que motivó todo esto, con su denominación literal', () => {
    const h = anuncios.find((a) => /HIDRAQUA/i.test(a.denominacion))
    expect(h, 'no aparece Hidraqua en la sección de Alicante de ese día').toBeTruthy()
    expect(h!.numero).toBe(232200)
    expect(h!.denominacion).toBe('HIDRAQUA, GESTION INTEGRAL DE AGUAS DE LEVANTE SA')
  })

  it('la hoja registral se separa del texto: es el identificador que cita la ficha', () => {
    const h = anuncios.find((a) => /HIDRAQUA/i.test(a.denominacion))!
    expect(h.datosRegistrales).toBeTruthy()
    expect(h.datosRegistrales!.seccion).toBe('8')
    expect(h.datosRegistrales!.hoja).toBe('A 44577')
    expect(h.datosRegistrales!.inscripcion).toBe('238')
  })

  it('los pares «etiqueta: valor» se separan, que es donde están los nombres', () => {
    const h = anuncios.find((a) => /HIDRAQUA/i.test(a.denominacion))!
    const porEtiqueta = new Map(h.campos.map((c) => [c.etiqueta, c.valor]))
    expect(porEtiqueta.get('Apoderado')).toBe('LOPEZ RODRIGUEZ JOSE IRENEO')
    expect(porEtiqueta.get('Apo.Man.Soli')).toBe('SOTO VALERO MIREIA')
  })

  it('un socio único se lee tal cual: es el vínculo con el grupo matriz', () => {
    // Caso real de esa misma sección, en otra sociedad.
    const uni = anuncios.find((a) => a.campos.some((c) => c.etiqueta === 'Socio único'))
    expect(uni, 'la sección no trae ninguna declaración de unipersonalidad').toBeTruthy()
    const socio = uni!.campos.find((c) => c.etiqueta === 'Socio único')!.valor
    expect(socio.length).toBeGreaterThan(3)
    expect(socio).toBe(socio.toUpperCase())
  })

  it('varios titulares en un mismo campo se parten por «;»', () => {
    const conVarios = anuncios.find((a) => a.campos.some((c) => c.valores.length > 1))
    expect(conVarios, 'ningún campo trae más de un titular').toBeTruthy()
    const campo = conVarios!.campos.find((c) => c.valores.length > 1)!
    expect(campo.valor).toContain(';')
    expect(campo.valores.length).toBeGreaterThan(1)
  })

  it('el texto verbatim se conserva: lo que se cita es lo que publicó el BORME', () => {
    const h = anuncios.find((a) => /HIDRAQUA/i.test(a.denominacion))!
    expect(h.texto).toContain('Revocaciones')
    expect(h.texto).toContain('Datos registrales')
    expect(h.texto).not.toContain('<')
  })
})

/**
 * El sumario, y el día que tiró dos jornadas de barrido.
 *
 * La API del BOE **colapsa las colecciones de un solo elemento a objeto**: el 9
 * y el 10 de mayo de 2024 sólo traen la sección C, así que `seccion` llegó como
 * diccionario y no como lista, y el barrido murió con «object is not iterable».
 * Se vio porque el parte cuenta los fallos aparte; si los hubiera sumado a «sin
 * resultados», dos días habrían desaparecido en silencio.
 */
describe('borme — el sumario y sus colecciones de un solo elemento', () => {
  const sumario = JSON.parse(
    readFileSync(join(__dirname, 'fixtures/borme_sumario_2024-05-09.json'), 'utf8'),
  )

  it('mide algo: la fixture es el día raro, con su única sección C', () => {
    const s = sumario.data.sumario.diario[0].seccion
    expect(Array.isArray(s), 'la fixture ya no reproduce el caso: seccion vino como lista').toBe(
      false,
    )
    expect(s.codigo).toBe('C')
  })

  it('no revienta con seccion como objeto: devuelve lista vacía', () => {
    expect(() => seccionesDelSumario(sumario)).not.toThrow()
    expect(seccionesDelSumario(sumario)).toEqual([])
  })

  it('un sumario normal sí da secciones provinciales, con su url', () => {
    const normal = {
      data: {
        sumario: {
          diario: {
            seccion: {
              codigo: 'A',
              item: {
                identificador: 'BORME-A-2026-92-03',
                titulo: 'ALICANTE',
                url_html: 'https://www.boe.es/diario_borme/txt.php?id=BORME-A-2026-92-03',
              },
            },
          },
        },
      },
    }
    // Los TRES niveles colapsados a objeto a la vez: diario, seccion e item.
    const out = seccionesDelSumario(normal)
    expect(out).toHaveLength(1)
    expect(out[0].provincia).toBe('ALICANTE')
    expect(out[0].id).toBe('BORME-A-2026-92-03')
  })

  it('ni un sumario vacío ni uno malformado tiran el barrido', () => {
    expect(seccionesDelSumario({})).toEqual([])
    expect(seccionesDelSumario(null)).toEqual([])
    expect(seccionesDelSumario({ data: { sumario: {} } })).toEqual([])
  })
})
