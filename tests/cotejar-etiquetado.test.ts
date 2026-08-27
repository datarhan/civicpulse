/**
 * Contrato de `cotejar:etiquetado`.
 *
 * La herramienta existe porque «la máquina relee su propio etiquetado y dice
 * confirmado» no añade información: es un veredicto automático ascendiéndose
 * solo. Lo que añade es contrastar cada etiqueta contra señales que no son el
 * juicio que la puso.
 */
import { describe, expect, it } from 'vitest'

import { cotejar, leerTabla, ETIQUETAS, DESENLACES } from '../scripts/cotejar-etiquetado'

const fila = (etiqueta: string, literal: string) => ({
  n: 1,
  etiqueta: etiqueta as (typeof ETIQUETAS)[number],
  tipo: 'x',
  tema: 'y',
  literal,
})

describe('leerTabla', () => {
  it('lee la tabla de cinco columnas', () => {
    const md = [
      '| # | etiqueta | tipo | tema | literal |',
      '| ---: | --- | --- | --- | --- |',
      '| 1 | `comprobable` | afirmacion_numerica | fiscal | el PMP fue de 76 días |',
      '| 2 | `no-factual` | cita_convenio | salud | no está gestionando como toca |',
    ].join('\n')
    const filas = leerTabla(md)
    expect(filas).toHaveLength(2)
    expect(filas[1]).toMatchObject({ n: 2, etiqueta: 'no-factual', tema: 'salud' })
  })

  it('LA TRAMPA: no confunde la tabla de CORRECCIONES con la de datos', () => {
    // La tabla de correcciones también empieza por `| 38 | \`comprobable\` |`,
    // y un grep la cuenta como una fila más — me pasó al verificar el documento:
    // salían 107 filas de 102. Tiene CUATRO columnas, no cinco, y por eso el
    // parser real no la toca. Si esto se rompe, el reparto publicado se infla
    // con las propias correcciones.
    const md = [
      '| 1 | `comprobable` | afirmacion_numerica | fiscal | el PMP fue de 76 días |',
      '| 38 | `comprobable` | `no-factual` | describe qué es un puesto |',
    ].join('\n')
    const filas = leerTabla(md)
    expect(filas).toHaveLength(1)
    expect(filas[0].n).toBe(1)
  })

  it('ignora una etiqueta que no existe en vez de inventarla', () => {
    expect(leerTabla('| 1 | `quizas` | a | b | c |')).toHaveLength(0)
  })
})

describe('cotejar — cada etiqueta hace una predicción comprobable', () => {
  it('sin-fuente-publica queda apoyada si nombra un documento', () => {
    const c = cotejar(
      fila('sin-fuente-publica', 'visto el informe de la Secretaría de 24 de febrero'),
    )
    expect(c.desenlace).toBe('apoyada')
  })

  it('comprobable queda apoyada con una cifra, y contradicha sin nada que casar', () => {
    expect(cotejar(fila('comprobable', 'el PMP está en 76 días')).desenlace).toBe('apoyada')
    expect(cotejar(fila('comprobable', 'eso que prometieron no lo han cumplido')).desenlace).toBe(
      'contradicha',
    )
  })

  it('una cantidad EN LETRA cuenta como cifra', () => {
    // La primera versión exigía dígitos y mandaba «un presupuesto de dos
    // millones y medio» a contradicha. Medía su propia estrechez, no el
    // etiquetado, y su titular («24 % apoyadas») era falso.
    expect(cotejar(fila('comprobable', 'un presupuesto de dos millones y medio')).desenlace).toBe(
      'apoyada',
    )
  })

  it('un identificador alfanumérico también es algo que casar', () => {
    expect(cotejar(fila('comprobable', 'el proyecto de la rotonda CV336')).desenlace).not.toBe(
      'contradicha',
    )
  })

  it('no-factual queda apoyada sin cifra, sin fecha y sin documento', () => {
    expect(cotejar(fila('no-factual', 'no está gestionando como toca')).desenlace).toBe('apoyada')
  })

  it('no-municipal reconoce otra administración', () => {
    expect(
      cotejar(fila('no-municipal', 'los fondos que la Generalitat no ha gastado')).desenlace,
    ).toBe('apoyada')
  })

  it('todo desenlace pertenece al enum exportado — nadie lo recita', () => {
    for (const e of ETIQUETAS) {
      const c = cotejar(fila(e, 'un texto cualquiera con 76 días y un informe'))
      expect(DESENLACES).toContain(c.desenlace)
      expect(c.senal.length).toBeGreaterThan(0)
    }
  })
})
