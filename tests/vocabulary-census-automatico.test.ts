import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  censusFindings,
  censoDe,
  esCampoDeVocabulario,
  informeDeVocabulario,
  CAMPOS_TRADUCIDOS,
  type FieldCensus,
} from '../src/scraper/vocabulary-census'
import {
  estadoDeLicitacion,
  ESTADOS_DE_LICITACION_TRADUCIDOS,
  PLACSP_DE_LICITACION_GOBIERTO,
} from '../src/scraper/tenders'
import { pickCheckDiagnosis, clasificarGuarda } from '../src/scraper/health-monitor'

/**
 * El aviso de vocabulario, sin nadie que tenga que aceptarlo a mano lo nuestro
 * ni leer un registro para enterarse de lo de fuera.
 *
 * Medido el 2026-10-19 sobre main: `check:vocabulary` imprimía 42 avisos cada
 * noche, con la línea base sin aceptar desde el 03-09. 35 eran ruido —en
 * `bop.json` caben seis anuncios, así que ids, URL, fechas y títulos pasaban el
 * tope de 12 valores distintos y cada anuncio nuevo «era» vocabulario—, y entre
 * ellos iban tres palabras de verdad nuevas (`minor_contract`, `educacion`,
 * `social`) que nadie vio, porque un aviso salía 0 y moría en el registro del
 * nocturno. Y #390 iba a sumar cinco más que no eran del origen sino nuestras:
 * la traducción del estado de las licitaciones.
 */

describe('qué campo es vocabulario', () => {
  it('uno en el que ningún valor se repite no lo es: es una lista de cosas', () => {
    expect(esCampoDeVocabulario('regNumber', { '2026/1': 1, '2026/2': 1, '2026/3': 1 })).toBe(false)
    expect(esCampoDeVocabulario('title', { a: 1, b: 1 })).toBe(false)
  })

  it('ids, enlaces, fechas, sellos y correos no lo son aunque se repitan', () => {
    const repetido = { x: 4, y: 3 }
    for (const campo of [
      'id',
      'plenoId',
      'pdfUrl',
      'sourceUrl',
      'date',
      'plenoDate',
      'createdAt',
      'retrievedAt',
      'email',
    ])
      expect(esCampoDeVocabulario(campo, repetido), campo).toBe(false)
  })

  it('un estado, un tema o un partido sí, aunque la muestra sea pequeña', () => {
    expect(esCampoDeVocabulario('status', { awarded: 300, unknown: 4 })).toBe(true)
    expect(esCampoDeVocabulario('topic', { fiscal: 2, social: 1, educacion: 1 })).toBe(true)
    expect(esCampoDeVocabulario('sourceStatus', { revoked: 114, awarded: 277 })).toBe(true)
  })

  it('censoDe aplica la regla: el anuncio nuevo del BOP deja de ser vocabulario', () => {
    const censo = censoDe({
      'bop.json': {
        anuncios: [
          { id: 'a1', title: 'Uno', pdfUrl: 'https://x/1', kind: 'edicto' },
          { id: 'a2', title: 'Dos', pdfUrl: 'https://x/2', kind: 'edicto' },
          { id: 'a3', title: 'Tres', pdfUrl: 'https://x/3', kind: 'anuncio' },
        ],
      },
    })
    expect(censo.map((c) => c.path)).toEqual(['bop.anuncios.kind'])
  })
})

describe('un campo que traducimos nosotros no es deriva del origen', () => {
  const ruta = 'tenders.tenders.status'
  const base: FieldCensus[] = [
    { path: ruta, values: { awarded: 277, revoked: 114, provisionally_awarded: 23, void: 7 } },
  ]

  it('la declaración real es lo que la traducción puede producir, ni más ni menos', () => {
    const producidos = new Set(
      [...Object.keys(PLACSP_DE_LICITACION_GOBIERTO), 'cualquier-otra', ''].map((w) =>
        estadoDeLicitacion(w),
      ),
    )
    expect([...ESTADOS_DE_LICITACION_TRADUCIDOS].sort()).toEqual([...producidos].sort())
    expect(CAMPOS_TRADUCIDOS[ruta]).toBe(ESTADOS_DE_LICITACION_TRADUCIDOS)
  })

  it('las palabras que produce la traducción aparecen sin aviso', () => {
    const ahora: FieldCensus[] = [
      { path: ruta, values: { awarded: 391, evaluation: 30, annulled: 2, unknown: 8 } },
    ]
    expect(censusFindings(ahora, base)).toEqual([])
  })

  it('las palabras del origen que la traducción ya no produce desaparecen sin aviso', () => {
    const ahora: FieldCensus[] = [{ path: ruta, values: { awarded: 391, evaluation: 30 } }]
    const f = censusFindings(ahora, base)
    expect(f.filter((x) => x.kind === 'value-vanished')).toEqual([])
  })

  it('pero una palabra que la traducción NO puede producir sigue avisando', () => {
    const ahora: FieldCensus[] = [{ path: ruta, values: { awarded: 391, raro: 3 } }]
    expect(censusFindings(ahora, base).map((x) => x.kind)).toEqual(['new-value'])
  })

  it('y que desaparezca una que sí produce, también', () => {
    const conAwarded: FieldCensus[] = [{ path: ruta, values: { awarded: 391, evaluation: 30 } }]
    const ahora: FieldCensus[] = [{ path: ruta, values: { evaluation: 30, annulled: 2 } }]
    expect(censusFindings(ahora, conAwarded).map((x) => x.kind)).toEqual(['value-vanished'])
  })

  it('la palabra del origen se vigila en sourceStatus, que la línea base comiteada ya conoce', () => {
    // Sin esto, traducir habría dejado al origen sin vigilar: un campo nuevo es
    // un «primer avistamiento» y no compara con nada hasta que alguien acepta.
    const linea = JSON.parse(readFileSync(resolve('.vocabulary-census.json'), 'utf8')) as {
      path: string
      values: Record<string, number>
    }[]
    const fuente = linea.find((c) => c.path === 'tenders.tenders.sourceStatus')
    expect(fuente, 'la línea base no vigila la palabra de Gobierto').toBeDefined()
    for (const palabra of Object.keys(PLACSP_DE_LICITACION_GOBIERTO))
      expect(Object.keys(fuente!.values)).toContain(palabra)
  })
})

describe('el aviso llega al parte de salud', () => {
  const hallazgos = censusFindings(
    [{ path: 'tenders.tenders.processType', values: { open: 200, minor_contract: 1 } }],
    [{ path: 'tenders.tenders.processType', values: { open: 180 } }],
  )

  it('una palabra nueva del origen hace salir la guarda con 1', () => {
    expect(informeDeVocabulario(35, hallazgos).codigo).toBe(1)
    expect(informeDeVocabulario(35, []).codigo).toBe(0)
  })

  it('y el parte la nombra, con su clase entre corchetes para la huella', () => {
    const { texto, codigo } = informeDeVocabulario(35, hallazgos)
    const desenlace = clasificarGuarda(codigo, texto)
    expect(desenlace.desenlace).toBe('fallo')
    const mensaje = pickCheckDiagnosis(texto)
    expect(mensaje).toContain('[new-value]')
    expect(mensaje).toContain('minor_contract')
    expect(mensaje).toContain('tenders.tenders.processType')
  })
})
