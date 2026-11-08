import { describe, it, expect } from 'vitest'
import { cargosNombrados } from '../../src/scraper/cargos-nombrados'
import type { OfficialsDoc } from '../../src/scraper/corporation-seats'

/** Plantilla inventada: la forma de `officials.json`, sin nadie real. */
const PLANTILLA: OfficialsDoc = {
  composition: { PSOE: 2, PP: 1, VOX: 1 },
  officials: [
    { slug: 'ana-perez', name: 'Ana Pérez Soler', party: 'PSOE', role: 'alcalde' },
    { slug: 'jose-luis-pla', name: 'José Luis Pla Mora', party: 'PSOE', role: 'concejal' },
    { slug: 'eva-de-la-cruz', name: 'Eva de la Cruz Ibáñez', party: 'PP', role: 'concejal' },
    { slug: 'mar-roig', name: 'Mar Roig Vidal', party: 'VOX', role: 'concejal' },
  ],
  formerOfficials: [{ slug: 'iker-sanz', name: 'Iker Sanz Abad', party: 'PP', role: 'concejal' }],
}

const en = (texto: string, doc: OfficialsDoc | null = PLANTILLA) =>
  cargosNombrados({ textos: [texto] }, doc)
const valores = (texto: string) => (en(texto) ?? []).map((m) => m.valor)

describe('cargosNombrados · apellidos', () => {
  it('encuentra un apellido suelto, la forma del 04-07-2026', () => {
    expect(en('Según anunció Pérez, el parque abrirá en primavera.')).toEqual([
      { tipo: 'apellido', valor: 'Pérez' },
    ])
  })

  it('encuentra el segundo apellido y el de quien ya dejó el cargo', () => {
    expect(valores('Lo dijo Soler en el acto')).toEqual(['Soler'])
    expect(valores('Sanz firmó el convenio')).toEqual(['Sanz'])
  })

  it('un nombre compuesto no cuenta su segundo nombre como apellido', () => {
    expect(en('Luis abrió la sesión')).toEqual([])
    expect(valores('Pla abrió la sesión')).toEqual(['Pla'])
  })

  it('las partículas no son apellidos, y el apellido tras ellas sí', () => {
    expect(en('La zona de la Vega')).toEqual([])
    expect(valores('Habló Cruz sobre el presupuesto')).toEqual(['Cruz'])
  })

  it('un apellido que es palabra común no cuenta en minúscula', () => {
    expect(en("anem a recolzar aquest pla d'ocupació")).toEqual([])
  })

  it('cuenta en un titular en mayúsculas y sin el acento de la plantilla', () => {
    expect(valores('PEREZ ANUNCIA EL PARQUE')).toEqual(['PEREZ'])
    expect(valores('Lo anunció Ibanez ayer')).toEqual(['Ibanez'])
  })

  it('un apellido se dice una vez aunque se repita', () => {
    expect(en('Pérez habló. Después, Pérez calló.')).toHaveLength(1)
  })
})

describe('cargosNombrados · oficios que nombran a una persona', () => {
  it.each([
    ['El alcalde anunció el parque', 'alcalde'],
    ['La alcaldesa inauguró la obra', 'alcaldesa'],
    ["L'alcaldessa va inaugurar l'obra", 'alcaldessa'],
    ['El exalcalde defendió la adjudicación', 'exalcalde'],
    ['Decreto de Alcaldía de 3 de marzo', 'alcaldia'],
    ['La teniente de alcalde lo presentó', 'alcalde'],
    ['El concejal de Urbanismo presentó el plan', 'concejal de'],
    ['La concejala delegada de Cultura abrió el acto', 'concejala delegada de'],
    ["La regidora d'Educació va presentar el pla", "regidora d'"],
    ['El edil del área de Hacienda respondió', 'edil del'],
    ['El portavoz del PP pidió la palabra', 'portavoz'],
    ['El portaveu de Compromís', 'portaveu'],
  ])('«%s»', (texto, oficio) => {
    expect(en(texto)).toContainEqual({ tipo: 'oficio', valor: oficio })
  })

  it.each([
    'Los concejales aprobaron el presupuesto',
    'Veintiún concejales forman la corporación',
    'La Concejalía de Fiestas organiza la cabalgata',
    'Los alcaldes de la comarca firmaron un manifiesto',
  ])('no nombra a nadie: «%s»', (texto) => {
    expect(en(texto)).toEqual([])
  })
})

describe('cargosNombrados · grupos de un escaño', () => {
  it('cuenta la etiqueta de un grupo de un escaño', () => {
    expect(
      cargosNombrados({ etiquetas: ['VOX'], textos: ['El parque abrirá.'] }, PLANTILLA),
    ).toEqual([{ tipo: 'grupo', valor: 'VOX' }])
  })

  it('cuenta el grupo escrito en la prosa, por su alias', () => {
    expect(en('Vox pide un plan de reconstrucción')).toEqual([{ tipo: 'grupo', valor: 'VOX' }])
  })

  it('un grupo con varios escaños no nombra a nadie', () => {
    expect(
      cargosNombrados({ etiquetas: ['PSOE'], textos: ['El PSOE defiende'] }, PLANTILLA),
    ).toEqual([])
  })
})

describe('cargosNombrados · sin plantilla no se sabe', () => {
  it.each([
    ['ausente', null],
    ['vacía', {}],
    ['sin cargos', { composition: { PSOE: 2 } }],
    ['sin composición ni cargos', { officials: [] }],
  ])('plantilla %s: null, nunca «ninguno»', (_, doc) => {
    expect(cargosNombrados({ textos: ['Texto sin nada'] }, doc as OfficialsDoc | null)).toBeNull()
  })

  it('un texto vacío o ausente no nombra a nadie', () => {
    expect(cargosNombrados({ textos: ['', null, undefined] }, PLANTILLA)).toEqual([])
  })

  it('reúne lo que hay en todos los textos', () => {
    const r = cargosNombrados(
      { etiquetas: ['VOX'], textos: ['Pérez habló', null, 'El alcalde calló'] },
      PLANTILLA,
    )
    expect(r?.map((m) => m.tipo).sort()).toEqual(['apellido', 'grupo', 'oficio'])
  })
})
