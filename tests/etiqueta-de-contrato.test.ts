/**
 * La etiqueta llana de un contrato (auditoría de las dos lecturas, §2).
 *
 * /cambios pintaba el título oficial tal cual: 519 de los 814 contratos
 * publicados pasan de 100 caracteres, y el de la semana auditada era una frase
 * de 45 palabras con «contrato derivado del SDA de servicios de arquitectura e
 * ingeniería…». La etiqueta quita lo que es fórmula —un código CPV delante, «El
 * objeto del contrato es», «Contrato administrativo de»— y corta donde empieza
 * el procedimiento, sin añadir nada: es siempre un trozo seguido del título.
 * El título entero sigue debajo.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { ETIQUETA_MAXIMA, etiquetaDeContrato } from '../src/scraper/etiqueta-de-contrato'

const TITULOS: string[] = JSON.parse(
  readFileSync('public/data/tenders.json', 'utf8'),
).contracts.map((c: { title: string }) => c.title)
const plano = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('casos', () => {
  it.each([
    [
      'El objeto del presente contrato son las obras de adecuación urbanización Masía de Traver',
      'Obras de adecuación urbanización Masía de Traver',
    ],
    [
      'Contrato derivado del sistema dinámico de adquisición de servicios para TALLERES de INFORMÁTICA en la EPA.',
      'TALLERES de INFORMÁTICA en la EPA',
    ],
    [
      'contrato derivado Acuerdo marco sobre suministro de energía eléctrica.',
      'Suministro de energía eléctrica',
    ],
    [
      'Contrato menor de servicios, para la asistencia técnica para puesta en marcha del proyecto EDIL DANA financiado con fondos europeos.',
      'Asistencia técnica para puesta en marcha del proyecto EDIL DANA',
    ],
    [
      'El objeto del contrato es la Obra de Adecuación de pavimento por levantamiento por raíces de arbolado en la Avenida del Túria por procedimiento abierto súper simplificado, mejor relación calidad-precio',
      'Obra de Adecuación de pavimento por levantamiento por raíces de arbolado en la Avenida del Túria',
    ],
    [
      'Contrato derivado del sistema dinámico de adquisición (SDA) de obras, para la instalación e cuatro elementos exentos de juegos infantiles en la Urbanización Gallipont de Riba-roja de Túria. (Ctto. 216/2023).',
      'Instalación e cuatro elementos exentos de juegos infantiles en la Urbanización Gallipont…',
    ],
    [
      '79900000-Servicios comerciales diversos y otros servicios conexos.',
      'Servicios comerciales diversos y otros servicios conexos',
    ],
  ])('%s', (titulo, etiqueta) => {
    expect(etiquetaDeContrato(titulo).etiqueta).toBe(etiqueta)
  })

  it.each([
    [
      'Contrato de servicio alumbrado ornamental navideño año 2025-2026 a través del contrato derivado del SDA de servicios de diversa índole',
      'Servicio alumbrado ornamental navideño año 2025-2026',
    ],
    [
      'Contrato de servicio de producción, programación, redacción y realización de contenidos multimedia mediante contrato derivado del SDA de servicios de diversa índole (Ctto. 27/2025)',
      'Servicio de producción, programación, redacción y realización de contenidos multimedia',
    ],
    [
      'Contrato del obras de ejecución bloque de nichos en el cementerio municipal, por procedimiento abierto simplificado',
      'Obras de ejecución bloque de nichos en el cementerio municipal',
    ],
    [
      'Inicio, aprobación del expediente y adjudicación del contrato para el suministro de energía eléctrica',
      'Suministro de energía eléctrica',
    ],
    [
      'Acuerdo inicio expediente y adjudicación contrato emergencia acondicionamiento caminos rurales',
      'Emergencia acondicionamiento caminos rurales',
    ],
    [
      'Objeto contratación es la adquisición de vestuario laboral y EPIs',
      'Adquisición de vestuario laboral y EPIs',
    ],
    [
      'Contratación derivada del sistema dinámico de adquisición (SDA) de servicios de diversa índole para el servicio de limpieza',
      'Servicio de limpieza',
    ],
  ])('cortado antes del procedimiento, sin palabra colgando: %s', (titulo, etiqueta) => {
    expect(etiquetaDeContrato(titulo).etiqueta).toBe(etiqueta)
  })

  it('lo que dice qué clase de contrato es se queda: «emergencia», el lote', () => {
    expect(
      etiquetaDeContrato('Contrato verbal de emergencia para trabajos de limpieza de caminos')
        .etiqueta,
    ).toBe('Emergencia para trabajos de limpieza de caminos')
    expect(
      etiquetaDeContrato('Lote 1 - Servicio Ayuda a Domicilio personas sin grado de dependencia'),
    ).toEqual({
      etiqueta: 'Lote 1 - Servicio Ayuda a Domicilio personas sin grado de dependencia',
      recortada: false,
    })
  })

  it('un título que la fuente ya trae cortado no acaba en «de»', () => {
    expect(etiquetaDeContrato('Contrato de suministro de')).toEqual({
      etiqueta: 'Suministro',
      recortada: true,
    })
    expect(etiquetaDeContrato('Instalación Solar Fotovoltaica EDIFICIO A').etiqueta).toBe(
      'Instalación Solar Fotovoltaica EDIFICIO A',
    )
  })

  it('un título corto se queda como está, y no es «recortado»', () => {
    expect(etiquetaDeContrato('Calzado')).toEqual({ etiqueta: 'Calzado', recortada: false })
    expect(etiquetaDeContrato('UE vella 6')).toEqual({ etiqueta: 'UE vella 6', recortada: false })
  })

  it('quitar sólo el código CPV, el punto final o mayúsculas no cuenta como recortar', () => {
    expect(
      etiquetaDeContrato('79900000-Servicios comerciales diversos y otros servicios conexos.')
        .recortada,
    ).toBe(false)
  })

  it('sin título no hay etiqueta: cadena vacía, no una inventada', () => {
    expect(etiquetaDeContrato('')).toEqual({ etiqueta: '', recortada: false })
    expect(etiquetaDeContrato(null as unknown as string)).toEqual({
      etiqueta: '',
      recortada: false,
    })
  })
})

describe('con los 814 títulos publicados', () => {
  it('mide algo: hay títulos, y muchos largos', () => {
    expect(TITULOS.length).toBeGreaterThan(500)
    expect(TITULOS.filter((t) => plano(t).length > ETIQUETA_MAXIMA).length).toBeGreaterThan(100)
  })

  it('la etiqueta es siempre un trozo seguido del título: no añade ni cambia palabras', () => {
    const malas = TITULOS.filter((t) => {
      const { etiqueta } = etiquetaDeContrato(t)
      const trozo = etiqueta.replace(/…$/, '').toLowerCase()
      return !plano(t).toLowerCase().includes(trozo)
    })
    expect(malas).toEqual([])
  })

  it('cabe: como mucho ETIQUETA_MAXIMA caracteres, más la elipsis si se cortó', () => {
    const largas = TITULOS.map((t) => etiquetaDeContrato(t).etiqueta).filter(
      (e) => e.replace(/…$/, '').length > ETIQUETA_MAXIMA,
    )
    expect(largas).toEqual([])
  })

  it('no acaba en una preposición, un artículo o un «mediante» colgando', () => {
    // En minúscula: en «Instalación Solar Fotovoltaica EDIFICIO A» la «A» es un nombre.
    const colgando = TITULOS.map((t) => etiquetaDeContrato(t).etiqueta).filter((e) =>
      /\s(de|del|la|el|los|las|en|y|e|a|al|por|para|con|sin|sobre|mediante|trav[eé]s)…?$/.test(e),
    )
    expect(colgando).toEqual([])
  })

  it('no empieza por la fórmula ni queda vacía', () => {
    const malas = TITULOS.map((t) => etiquetaDeContrato(t).etiqueta).filter(
      (e) => e === '' || /^(contrato\b|el objeto\b|\d{8})/i.test(e),
    )
    expect(malas).toEqual([])
  })

  it('recorta de verdad: todo título que no cabe sale marcado como recortado', () => {
    // «Largo» sin el punto final ni el código CPV, que la etiqueta quita sin
    // perder nada: un título de 101 caracteres por su punto cabe entero.
    const largos = TITULOS.filter(
      (t) =>
        plano(t)
          .replace(/^\d{8}(?:-\d)?\s*-\s*/, '')
          .replace(/[\s.]+$/, '').length > ETIQUETA_MAXIMA,
    )
    const cortados = largos.filter((t) => etiquetaDeContrato(t).recortada)
    expect(cortados.length).toBe(largos.length)
  })
})
