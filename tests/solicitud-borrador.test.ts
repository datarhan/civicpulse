/**
 * Contrato del redactor de solicitudes de acceso.
 *
 * Las cuatro cartas se escribieron a mano, con las cifras dentro («68
 * afirmaciones»). Este repositorio prohíbe escribir una cifra en un documento
 * —todas las auditadas estaban mal, alguna por 4×— y estos documentos se
 * registran ante una administración pública. Así que se derivan, y se cotejan
 * con el manifiesto antes de escribir nada.
 */
import { describe, expect, it } from 'vitest'

import { deAmbitoAjeno, ejemplos } from '../scripts/lib/solicitud-borrador'

const f = (verbatim: string, fecha = '2026-01-01') => ({ verbatim, fecha })

describe('ámbito ajeno — una conjunción, no una lista negra', () => {
  it('aparta el plan de otra administración', () => {
    expect(
      deAmbitoAjeno(
        'En la tercera década, de 1959 a 1969, con el plan de estabilización del Opus Dei',
      ),
    ).toBe(true)
    expect(
      deAmbitoAjeno('financiados por la Unión Europea en el marco del Plan de Recuperación'),
    ).toBe(true)
  })

  it('NO aparta lo que nombra otro ámbito PERO también el nuestro', () => {
    // El pleno adhiriéndose a un convenio de la Generalitat es un acto
    // municipal. Exigir señal municipal rechazaría de más; la conjunción no.
    expect(
      deAmbitoAjeno(
        'Ya en el pleno celebrado el 3 de junio acordamos la adhesión al convenio marco con la Unión Europea',
      ),
    ).toBe(false)
  })

  it('no aparta lo municipal corriente, que es el caso por defecto', () => {
    expect(
      deAmbitoAjeno('un informe técnico y jurídico donde resolvemos el anterior contrato'),
    ).toBe(false)
    expect(deAmbitoAjeno('no hay expediente sancionador')).toBe(false)
  })
})

describe('ejemplos — lo que se le enseña a una administración', () => {
  it('EL DEFECTO: el mismo literal entero y recortado salían como dos ejemplos', () => {
    const salida = ejemplos(
      [
        f(
          'Más tarde, en julio del 24, en acuerdo plenario, se aprobó el documento de la política interna',
        ),
        f('en julio del 24, en acuerdo plenario, se aprobó el documento de la política interna'),
      ],
      6,
    )
    expect(salida).toHaveLength(1)
  })

  it('un prefijo distinto no basta para colar el duplicado', () => {
    // Ésta es la razón de comparar por CONTENCIÓN: los dos de arriba difieren
    // en los primeros 60 caracteres, que es como se dedupliraba antes.
    const a = 'Más tarde, en julio del 24, en acuerdo plenario, se aprobó el documento'
    const b = 'en julio del 24, en acuerdo plenario, se aprobó el documento'
    expect(a.slice(0, 60)).not.toBe(b.slice(0, 60))
  })

  it('nunca enseña un documento de otra administración', () => {
    const salida = ejemplos(
      [
        f('En la tercera década, de 1959 a 1969, con el plan de estabilización del Opus Dei'),
        f('en abril del 2023 se aprobó en el PLE el Plan de Medidas Antifraude'),
      ],
      6,
    )
    expect(salida.map((x) => x.verbatim)).toEqual([
      'en abril del 2023 se aprobó en el PLE el Plan de Medidas Antifraude',
    ])
  })

  it('prefiere lo fechado, porque un documento con fecha se puede localizar', () => {
    const salida = ejemplos(
      [f('hay un informe por ahí'), f('el informe de la arquitecta con fecha 1 de julio')],
      1,
    )
    expect(salida[0].verbatim).toContain('1 de julio')
  })

  it('respeta el tope y no inventa filas cuando hay menos', () => {
    expect(ejemplos([f('el informe de 3 de marzo')], 6)).toHaveLength(1)
    expect(ejemplos([], 6)).toHaveLength(0)
  })
})
