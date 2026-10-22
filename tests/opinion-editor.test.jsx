import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'

import { LocaleProvider } from '../src/i18n'
import {
  PLAZO_MINIMO_DIAS,
  comprobarNombres,
  corregirOpinion,
  cotejarHecho,
  opinionesVacias,
  opinionesVisibles,
  publicarOpinion,
  retirarOpinion,
  validarOpinionesSnapshot,
} from '../src/scraper/opinion-editor'
import { OpinionEditor } from '../src/components/eficiencia/OpinionEditor'

/**
 * La opinión del editor (src/scraper/opinion-editor.ts): lo único de /eficiencia
 * que juzga. Cada prueba de abajo es una regla que el esquema IMPIDE, no que
 * pide: si alguna se pudiera saltar, el juicio llegaría al lector sin firma, sin
 * hechos o con un nombre fuera de su sitio.
 */
const leer = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const IND = leer('indicadores.json')
const COMP = leer('competencias.json')
const POLICIA = 'b132-130p-coste-unitario'
const titular = COMP.asignaciones.find((a) => a.clave === POLICIA)
const MANDATO = COMP.mandato.desde

/** Una opinión válida, sin nombres. El firmante es ficticio. */
function base(extra = {}) {
  return {
    id: 'policia-local-coste',
    panel: 'coste-efectivo',
    titulo: 'La policía local cuesta mucho más por agente que en 2021',
    cuerpo: ['Párrafo de prueba con la extensión mínima que exige el esquema para un cuerpo.'],
    firma: { nombre: 'Firmante Ficticio', rol: 'editor de CivicPulse' },
    fecha: '2026-11-20',
    hechos: [{ tipo: 'indicador', id: POLICIA }],
    noSabemos: ['Si el aumento es de más agentes o de mejores sueldos: el divisor no se remide.'],
    nombra: [],
    contactoPrevio: null,
    replicas: [],
    correcciones: [],
    ...extra,
  }
}

/** La misma, nombrando al titular de la competencia dentro de su mandato. */
function conNombre(extra = {}) {
  return base({
    nombra: [
      {
        oficial: titular.oficial,
        nombre: titular.nombre,
        clave: POLICIA,
        periodo: { desde: MANDATO, hasta: '2026-10-01' },
      },
    ],
    contactoPrevio: {
      enviadoEl: '2026-11-10',
      canal: 'correo al registro del Ayuntamiento',
      plazoDias: PLAZO_MINIMO_DIAS,
      respuesta: null,
    },
    ...extra,
  })
}

const snap = (items, retiradas = []) =>
  JSON.stringify({ version: 1, actualizadoEl: '2026-11-20', items, retiradas })

describe('el esquema', () => {
  it('acepta una opinión completa, con y sin nombres', () => {
    expect(validarOpinionesSnapshot(snap([base()])).items).toHaveLength(1)
    expect(validarOpinionesSnapshot(snap([conNombre()])).items).toHaveLength(1)
  })

  it('el fichero publicado es válido', () => {
    expect(() =>
      validarOpinionesSnapshot(readFileSync('public/data/opiniones-editor.json', 'utf8')),
    ).not.toThrow()
  })

  const rechaza = [
    [
      'una marca de máquina en cualquier profundidad',
      base({ hechos: [{ tipo: 'indicador', id: POLICIA, requiresHumanApproval: true }] }),
    ],
    ['un campo de modelo', base({ modelo: 'cualquiera' })],
    ['sin hechos', base({ hechos: [] })],
    ['sin «lo que no sabemos»', base({ noSabemos: [] })],
    ['una firma que no es de una persona', base({ firma: { nombre: 'Redacción', rol: 'x' } })],
    ['un nombre sin contacto previo', conNombre({ contactoPrevio: null })],
    [
      'un plazo de réplica corto',
      conNombre({
        contactoPrevio: {
          enviadoEl: '2026-11-15',
          canal: 'correo',
          plazoDias: PLAZO_MINIMO_DIAS - 1,
          respuesta: null,
        },
      }),
    ],
    [
      'publicar antes de que venza el plazo',
      conNombre({
        contactoPrevio: {
          enviadoEl: '2026-11-18',
          canal: 'correo',
          plazoDias: PLAZO_MINIMO_DIAS,
          respuesta: null,
        },
      }),
    ],
    [
      'un nombre sin periodo',
      conNombre({ nombra: [{ oficial: 'x', nombre: 'y', clave: POLICIA }] }),
    ],
  ]
  it.each(rechaza)('rechaza %s', (_, o) => {
    expect(() => validarOpinionesSnapshot(snap([o]))).toThrow()
  })

  it('rechaza un id repetido y una opinión a la vez publicada y retirada', () => {
    expect(() => validarOpinionesSnapshot(snap([base(), base()]))).toThrow(/repetido/)
    expect(() =>
      validarOpinionesSnapshot(
        snap(
          [base()],
          [{ id: 'policia-local-coste', fecha: '2026-11-21', motivo: 'motivo largo de prueba' }],
        ),
      ),
    ).toThrow(/publicada y retirada/)
  })
})

describe('los nombres, por competencia y por mandato', () => {
  it('mide algo: la policía local tiene titular y el mandato tiene fecha', () => {
    expect(titular?.oficial).toBeTruthy()
    expect(MANDATO).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('nombrar al titular dentro de su mandato no da problemas', () => {
    expect(comprobarNombres(conNombre(), COMP)).toEqual([])
  })

  it('el salto de 2022 no se le puede atribuir a quien tiene la delegación desde 2023', () => {
    const o = conNombre()
    o.nombra[0].periodo = { desde: '2022-01-01', hasta: '2022-12-31' }
    expect(comprobarNombres(o, COMP).join(' ')).toMatch(/anterior a su delegación/)
  })

  it('nombrar a alguien por una competencia que no tiene es un problema', () => {
    const o = conNombre()
    o.nombra[0].oficial = 'otra-persona'
    expect(comprobarNombres(o, COMP).join(' ')).toMatch(/no tiene la competencia/)
  })
})

describe('publicar, corregir, retirar', () => {
  const vacio = opinionesVacias('2026-11-01')

  it('publica quien firma, y el día que firma', () => {
    expect(() => publicarOpinion(vacio, base(), 'Otra Persona', '2026-11-20', COMP)).toThrow(
      /no coincide/,
    )
    expect(() => publicarOpinion(vacio, base(), 'Firmante Ficticio', '2026-11-19', COMP)).toThrow(
      /hoy/,
    )
    const s = publicarOpinion(vacio, base(), 'Firmante Ficticio', '2026-11-20', COMP)
    expect(s.items).toHaveLength(1)
  })

  it('en periodo electoral no se publica una opinión que nombra; sin nombres, sí', () => {
    const conPlazo = conNombre()
    expect(() =>
      publicarOpinion(vacio, conPlazo, 'Firmante Ficticio', '2026-11-20', COMP, false),
    ).toThrow(/periodo electoral/)
    expect(
      publicarOpinion(vacio, base(), 'Firmante Ficticio', '2026-11-20', COMP, false).items,
    ).toHaveLength(1)
  })

  it('un borrador con marca de máquina no se publica', () => {
    expect(() =>
      publicarOpinion(
        vacio,
        { ...base(), requiresHumanApproval: true },
        'Firmante Ficticio',
        '2026-11-20',
        COMP,
      ),
    ).toThrow()
  })

  it('corregir guarda lo que decía; retirar deja motivo', () => {
    let s = publicarOpinion(vacio, base(), 'Firmante Ficticio', '2026-11-20', COMP)
    s = corregirOpinion(
      s,
      'policia-local-coste',
      { titulo: 'Titular corregido con extensión suficiente', cuerpo: base().cuerpo },
      'error en el titular',
      '2026-11-25',
    )
    expect(s.items[0].correcciones[0].antes.titulo).toBe(base().titulo)
    s = retirarOpinion(s, 'policia-local-coste', 'retirada por un motivo de prueba', '2026-11-26')
    expect(s.items).toHaveLength(0)
    expect(s.retiradas[0].id).toBe('policia-local-coste')
  })
})

describe('la ventana LOREG y los hechos', () => {
  it('con la ventana abierta no sale ninguna opinión que nombre; las demás sí', () => {
    const s = { items: [conNombre(), base({ id: 'sin-nombres-de-prueba' })] }
    expect(opinionesVisibles(s, 'coste-efectivo', true)).toHaveLength(2)
    const ventana = opinionesVisibles(s, 'coste-efectivo', false)
    expect(ventana.map((o) => o.id)).toEqual(['sin-nombres-de-prueba'])
  })

  it('cotejar: coincide, movido, contradice, sin-indicador', () => {
    const ind = IND.indicadores.find((i) => i.id === POLICIA)
    const conValor = ind.serie.filter((p) => typeof p.valor === 'number')
    const ultimo = conValor.at(-1)
    const anterior = conValor.at(-2)
    expect(
      cotejarHecho(
        { tipo: 'indicador', id: POLICIA, anio: ultimo.anio, valor: ultimo.valor },
        IND,
        null,
      ),
    ).toBe('coincide')
    expect(
      cotejarHecho(
        { tipo: 'indicador', id: POLICIA, anio: anterior.anio, valor: anterior.valor },
        IND,
        null,
      ),
    ).toBe('movido')
    expect(
      cotejarHecho(
        { tipo: 'indicador', id: POLICIA, anio: ultimo.anio, valor: ultimo.valor * 2 },
        IND,
        null,
      ),
    ).toBe('contradice')
    // Citado a propósito junto a un año más reciente que sigue siendo el último: no es «movido».
    expect(
      cotejarHecho(
        { tipo: 'indicador', id: POLICIA, anio: anterior.anio, valor: anterior.valor },
        IND,
        null,
        ultimo.anio,
      ),
    ).toBe('coincide')
    expect(cotejarHecho({ tipo: 'indicador', id: 'no-existe' }, IND, null)).toBe('sin-indicador')
    expect(cotejarHecho({ tipo: 'hallazgo', id: 'no-existe' }, IND, { items: [] })).toBe(
      'sin-indicador',
    )
  })
})

describe('lo que lee el vecino', () => {
  const pinta = (o, nombresOn = true) =>
    render(
      <LocaleProvider>
        <OpinionEditor
          opiniones={{ items: [o] }}
          panel="coste-efectivo"
          nombresOn={nombresOn}
          data={IND}
        />
      </LocaleProvider>,
    ).container

  it('el rótulo de opinión va antes que el titular, y en el mismo marco van firma, hechos y lo que no sabemos', () => {
    const c = pinta(conNombre())
    const marco = c.querySelector('[data-opinion]')
    const texto = marco.textContent
    expect(texto.indexOf('Opinión del editor')).toBeLessThan(texto.indexOf(conNombre().titulo))
    expect(texto).toContain('Firmante Ficticio')
    expect(texto).toContain('Los hechos en que se basa')
    expect(texto).toContain(base().noSabemos[0])
    expect(marco.querySelector(`a[href="/eficiencia/${POLICIA}"]`)).not.toBeNull()
  })

  it('el contacto previo se dice, y el silencio se publica como silencio', () => {
    const c = pinta(conNombre())
    const contacto = c.querySelector('[data-opinion-contacto]')
    expect(contacto.textContent).toContain(titular.nombre)
    expect(contacto.textContent).toContain('Sin respuesta')
  })

  it('en la ventana LOREG, una opinión que nombra no se pinta', () => {
    expect(pinta(conNombre(), false).textContent).toBe('')
  })
})
