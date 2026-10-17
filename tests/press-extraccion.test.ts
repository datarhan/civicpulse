import { describe, expect, it } from 'vitest'
import {
  DESENLACES_EXTRACCION,
  desenlaceDe,
  elegirPendientes,
  extraccionParaVerificado,
  fundirExtraccion,
  pasadaEnRojo,
  sembrarDesdeClaims,
  type DesenlaceExtraccion,
  type ExtraccionArticulo,
} from '../src/scraper/press-extraccion'

// Reproductor de la extracción acumulada de prensa. La pasada que se auditó en
// octubre de 2026 sólo vio los titulares del 7 al 9 de octubre: reescribió el
// fichero entero, olvidó lo extraído en ventanas anteriores y /laboratorio dijo
// «no sacó ninguna afirmación» de titulares que el extractor nunca había visto.

const art = (
  articleId: string,
  desenlace: DesenlaceExtraccion,
  fingerprint = 'f-' + articleId,
  procesadoEl = '2026-10-15',
): ExtraccionArticulo => ({ articleId, fingerprint, desenlace, procesadoEl })

describe('fundirExtraccion', () => {
  it('lo que la pasada procesó sustituye su desenlace y sus afirmaciones anteriores', () => {
    const prev = {
      articulos: [art('a', 'extraido', 'f-vieja', '2026-10-01')],
      items: [
        { articleId: 'a', texto: 'vieja-1' },
        { articleId: 'a', texto: 'vieja-2' },
      ],
    }
    const run = {
      articulos: [art('a', 'extraido', 'f-nueva', '2026-10-15')],
      items: [{ articleId: 'a', texto: 'nueva' }],
    }
    const out = fundirExtraccion(prev, run)
    expect(out.articulos).toEqual([art('a', 'extraido', 'f-nueva', '2026-10-15')])
    expect(out.items).toEqual([{ articleId: 'a', texto: 'nueva' }])
  })

  it('lo que la pasada no tocó conserva su desenlace y sus afirmaciones', () => {
    const prev = {
      articulos: [art('a', 'extraido'), art('b', 'descartado-en-triaje')],
      items: [{ articleId: 'a', texto: 'de-a' }],
    }
    const run = { articulos: [art('c', 'sin-afirmaciones')], items: [] }
    const out = fundirExtraccion(prev, run)
    expect(out.articulos.map((x) => [x.articleId, x.desenlace])).toEqual([
      ['a', 'extraido'],
      ['b', 'descartado-en-triaje'],
      ['c', 'sin-afirmaciones'],
    ])
    expect(out.items).toEqual([{ articleId: 'a', texto: 'de-a' }])
  })

  it('una pasada sin LLM no borra lo que ya se extrajo', () => {
    const prev = { articulos: [art('a', 'extraido')], items: [{ articleId: 'a' }] }
    const run = { articulos: [art('a', 'llm-no-disponible')], items: [] }
    const out = fundirExtraccion(prev, run)
    expect(out.articulos[0].desenlace).toBe('extraido')
    expect(out.items).toEqual([{ articleId: 'a' }])
  })

  it.each(['sin-afirmaciones', 'descartado-en-triaje'] as const)(
    'una pasada sin LLM no pisa un %s anterior',
    (anterior) => {
      const prev = { articulos: [art('a', anterior, 'f-a', '2026-10-01')], items: [] }
      const run = { articulos: [art('a', 'llm-no-disponible', 'f-a', '2026-10-15')], items: [] }
      expect(fundirExtraccion(prev, run).articulos).toEqual([
        art('a', anterior, 'f-a', '2026-10-01'),
      ])
    },
  )

  it('una extracción sin respuesta tras un triaje positivo no borra lo ya extraído', () => {
    const prev = {
      articulos: [art('a', 'extraido', 'f-a', '2026-10-01')],
      items: [{ articleId: 'a', texto: 'de-a' }],
    }
    // press-claim-llm.ts devuelve el triaje real con `claims: []` cuando la
    // llamada de extracción no responde; la CLI lo señala con el aviso.
    const desenlace = desenlaceDe({
      triage: { hasCheckableClaim: true, reasoning: 'cifra de inversión' },
      claims: 0,
      extraccionSinRespuesta: true,
    })
    const run = { articulos: [art('a', desenlace, 'f-a', '2026-10-15')], items: [] }
    const out = fundirExtraccion(prev, run)
    expect(out.articulos).toEqual([art('a', 'extraido', 'f-a', '2026-10-01')])
    expect(out.items).toEqual([{ articleId: 'a', texto: 'de-a' }])
  })

  it('una pasada sin LLM sí anota el desenlace de lo que antes no tenía ninguno', () => {
    const prev = { articulos: [art('a', 'llm-no-disponible', 'f-a', '2026-10-01')], items: [] }
    const run = {
      articulos: [
        art('a', 'llm-no-disponible', 'f-a', '2026-10-15'),
        art('b', 'llm-no-disponible'),
      ],
      items: [],
    }
    const out = fundirExtraccion(prev, run)
    expect(out.articulos).toEqual([
      art('a', 'llm-no-disponible', 'f-a', '2026-10-15'),
      art('b', 'llm-no-disponible'),
    ])
  })

  it('salida estable: artículos por id, afirmaciones previas en su orden y luego las nuevas', () => {
    const prev = {
      articulos: [art('m', 'extraido'), art('c', 'extraido')],
      items: [
        { articleId: 'm', n: 1 },
        { articleId: 'c', n: 2 },
        { articleId: 'm', n: 3 },
      ],
    }
    const run = {
      articulos: [art('z', 'extraido'), art('b', 'extraido')],
      items: [
        { articleId: 'z', n: 4 },
        { articleId: 'b', n: 5 },
      ],
    }
    const out = fundirExtraccion(prev, run)
    expect(out.articulos.map((x) => x.articleId)).toEqual(['b', 'c', 'm', 'z'])
    expect(out.items.map((x) => x.n)).toEqual([1, 2, 3, 4, 5])
  })

  it('sin fichero previo, la pasada es todo', () => {
    const run = {
      articulos: [art('b', 'extraido'), art('a', 'sin-afirmaciones')],
      items: [{ articleId: 'b' }],
    }
    const out = fundirExtraccion(null, run)
    expect(out.articulos.map((x) => x.articleId)).toEqual(['a', 'b'])
    expect(out.items).toEqual([{ articleId: 'b' }])
  })
})

describe('elegirPendientes', () => {
  it('la huella cambiada vuelve a la cola', () => {
    const items = [{ id: 'a', fingerprint: 'nueva', date: '2026-10-01' }]
    expect(elegirPendientes(items, [art('a', 'extraido', 'vieja')], 5).map((x) => x.id)).toEqual([
      'a',
    ])
  })

  it('lo ya procesado y sin cambios no se reenvía', () => {
    const items = [
      { id: 'a', fingerprint: 'f-a', date: '2026-10-09' },
      { id: 'b', fingerprint: 'f-b', date: '2026-10-08' },
      { id: 'c', fingerprint: 'f-c', date: '2026-10-07' },
    ]
    const prev = [
      art('a', 'extraido'),
      art('b', 'sin-afirmaciones'),
      art('c', 'descartado-en-triaje'),
    ]
    expect(elegirPendientes(items, prev, 25)).toEqual([])
  })

  it('lo nunca visto y lo que no llegó al LLM van juntos, más nuevo antes; luego la huella cambiada', () => {
    const items = [
      { id: 'reintento-nuevo', fingerprint: 'f-reintento-nuevo', date: '2026-10-09' },
      { id: 'cambiada', fingerprint: 'otra', date: '2026-10-08' },
      { id: 'inedito-viejo', fingerprint: 'x', date: '2026-09-01' },
      { id: 'reintento-viejo', fingerprint: 'f-reintento-viejo', date: '2026-09-02' },
      { id: 'inedito-nuevo', fingerprint: 'y', date: '2026-10-05' },
      { id: 'hecho', fingerprint: 'f-hecho', date: '2026-10-10' },
    ]
    const prev = [
      art('reintento-nuevo', 'llm-no-disponible'),
      art('reintento-viejo', 'llm-no-disponible'),
      art('cambiada', 'extraido'),
      art('hecho', 'extraido'),
    ]
    // Un apagón del LLM no deja `reintento-nuevo` detrás del atraso viejo.
    expect(elegirPendientes(items, prev, 10).map((x) => x.id)).toEqual([
      'reintento-nuevo',
      'inedito-nuevo',
      'reintento-viejo',
      'inedito-viejo',
      'cambiada',
    ])
  })

  it('el tope se gasta en trabajo nuevo, por orden', () => {
    const items = [
      { id: 'a', fingerprint: 'f-a', date: '2026-10-01' },
      { id: 'b', fingerprint: 'f-b', date: '2026-10-03' },
      { id: 'c', fingerprint: 'f-c', date: '2026-10-02' },
      { id: 'd', fingerprint: 'f-d', date: '2026-10-09' },
    ]
    // `d` es el más nuevo pero ya se procesó: no ocupa plaza.
    expect(elegirPendientes(items, [art('d', 'extraido')], 2).map((x) => x.id)).toEqual(['b', 'c'])
  })

  it('sólo Infinity quita el tope; un tope ilegible o negativo no manda nada al LLM', () => {
    const items = [
      { id: 'a', fingerprint: 'f-a', date: '2026-10-01' },
      { id: 'b', fingerprint: 'f-b', date: '2026-10-02' },
    ]
    expect(elegirPendientes(items, [], Infinity).map((x) => x.id)).toEqual(['b', 'a'])
    expect(elegirPendientes(items, [], NaN)).toEqual([])
    expect(elegirPendientes(items, [], -1)).toEqual([])
    expect(elegirPendientes(items, [], 0)).toEqual([])
  })
})

describe('desenlaceDe', () => {
  it('sin LLM es llm-no-disponible, aunque el triaje diga que no hay nada', () => {
    expect(
      desenlaceDe({
        triage: { hasCheckableClaim: false, reasoning: 'llm-unavailable' },
        claims: 0,
      }),
    ).toBe('llm-no-disponible')
  })

  it('con afirmaciones es extraido', () => {
    expect(desenlaceDe({ triage: { hasCheckableClaim: true }, claims: 2 })).toBe('extraido')
  })

  it('el triaje que no ve afirmación comprobable es descartado-en-triaje', () => {
    expect(
      desenlaceDe({
        triage: { hasCheckableClaim: false, reasoning: 'columna de opinión' },
        claims: 0,
      }),
    ).toBe('descartado-en-triaje')
  })

  it('pasó el triaje y la extracción no respondió: llm-no-disponible, no sin-afirmaciones', () => {
    expect(
      desenlaceDe({ triage: { hasCheckableClaim: true }, claims: 0, extraccionSinRespuesta: true }),
    ).toBe('llm-no-disponible')
  })

  it('pasó el triaje y la extracción respondió sin afirmaciones: sin-afirmaciones', () => {
    expect(
      desenlaceDe({
        triage: { hasCheckableClaim: true },
        claims: 0,
        extraccionSinRespuesta: false,
      }),
    ).toBe('sin-afirmaciones')
  })
})

it('el enum exportado es el que usa la página', () => {
  expect(DESENLACES_EXTRACCION).toContain('descartado-en-triaje')
  expect(new Set(DESENLACES_EXTRACCION).size).toBe(DESENLACES_EXTRACCION.length)
})

// Migración de una sola vez de los ficheros anteriores a `articulos`: de lo
// que el fichero viejo prueba —sólo las afirmaciones— y de nada más. Los
// artículos de la ventana que no dieron afirmaciones no dejaron rastro de su
// desenlace; inventarles un «sin-afirmaciones» sería la regla 2 al revés.
describe('sembrarDesdeClaims', () => {
  const claim = (articleId: string, articleFingerprint?: string) => ({
    articleId,
    ...(articleFingerprint === undefined ? {} : { articleFingerprint }),
  })

  it('siembra sólo los artículos con al menos una afirmación, todos `extraido`, fechados con el fichero', () => {
    const { articulos, sinHuella } = sembrarDesdeClaims(
      [claim('b', 'fb'), claim('a', 'fa'), claim('b', 'fb')],
      '2026-10-12T08:31:15.395Z',
      new Map([
        ['a', 'fa'],
        ['b', 'fb'],
        ['sin-claims', 'fz'],
      ]),
    )
    expect(articulos).toEqual([
      {
        articleId: 'a',
        fingerprint: 'fa',
        desenlace: 'extraido',
        procesadoEl: '2026-10-12T08:31:15.395Z',
      },
      {
        articleId: 'b',
        fingerprint: 'fb',
        desenlace: 'extraido',
        procesadoEl: '2026-10-12T08:31:15.395Z',
      },
    ])
    expect(sinHuella).toEqual([])
  })

  it('nunca inventa otro desenlace que `extraido`', () => {
    const { articulos } = sembrarDesdeClaims(
      [claim('a', 'fa'), claim('c', 'fc')],
      '2026-10-12',
      new Map([['z', 'fz']]),
    )
    expect(articulos.length).toBeGreaterThan(0)
    expect(new Set(articulos.map((a) => a.desenlace))).toEqual(new Set(['extraido']))
    expect(articulos.some((a) => a.desenlace === 'sin-afirmaciones')).toBe(false)
  })

  it('la huella de la afirmación manda sobre la de press.json: un titular cambiado vuelve a la cola', () => {
    const { articulos } = sembrarDesdeClaims(
      [claim('a', 'huella-extraida')],
      '2026-10-12',
      new Map([['a', 'huella-de-hoy']]),
    )
    expect(articulos[0].fingerprint).toBe('huella-extraida')
    // Y por eso `elegirPendientes` lo devuelve como cambiado.
    const cola = elegirPendientes(
      [{ id: 'a', fingerprint: 'huella-de-hoy', date: '2026-10-12' }],
      articulos,
      Infinity,
    )
    expect(cola.map((x) => x.id)).toEqual(['a'])
  })

  it('sin huella en la afirmación usa la de press.json; sin ninguna, lo deja fuera y lo dice', () => {
    const { articulos, sinHuella } = sembrarDesdeClaims(
      [claim('a'), claim('b'), claim('c', '')],
      '2026-10-12',
      new Map([['a', 'fa-prensa']]),
    )
    expect(articulos.map((x) => [x.articleId, x.fingerprint])).toEqual([['a', 'fa-prensa']])
    expect(sinHuella).toEqual(['b', 'c'])
  })
})

describe('pasadaEnRojo', () => {
  // Un exit 1 hace que press-lab-pipeline.sh salte verify y lo que cuelga de él. El
  // triaje salía en rojo con UN fallo, y con lo `llm-no-disponible` primero en la cola,
  // un solo titular terco habría congelado /laboratorio en cada pasada.
  const pasada = (p: Partial<Parameters<typeof pasadaEnRojo>[0]>) =>
    pasadaEnRojo({ total: 10, llmUnavailable: 0, triageHits: 4, sinRespuesta: 0, ...p })

  it('un fallo parcial del triaje no es rojo: queda llm-no-disponible y se reintenta', () => {
    expect(pasada({ llmUnavailable: 1 })).toBe(false)
    expect(pasada({ llmUnavailable: 9, triageHits: 1 })).toBe(false)
  })
  it('el triaje caído para TODOS es rojo', () => {
    expect(pasada({ llmUnavailable: 10, triageHits: 0 })).toBe(true)
  })
  it('la extracción: parcial no, entera sí', () => {
    expect(pasada({ sinRespuesta: 3 })).toBe(false)
    expect(pasada({ sinRespuesta: 4 })).toBe(true)
  })
  it('una pasada sin nada que enviar no es rojo', () => {
    expect(pasada({ total: 0, triageHits: 0 })).toBe(false)
  })
})

describe('extraccionParaVerificado', () => {
  it('copia los desenlaces tal cual', () => {
    const articulos = [art('a1', 'extraido'), art('a2', 'descartado-en-triaje')]
    expect(extraccionParaVerificado({ articulos })).toEqual({ articulos })
  })
  it('un fichero de sugerencias sin `articulos` da null, no una lista vacía', () => {
    // Una lista vacía se leería «no se ha procesado ninguno»; null es «no se sabe».
    expect(extraccionParaVerificado({})).toEqual({ articulos: null })
    expect(extraccionParaVerificado({ articulos: 'no' })).toEqual({ articulos: null })
    expect(extraccionParaVerificado(null)).toEqual({ articulos: null })
  })
  it('una lista vacía de verdad se conserva', () => {
    expect(extraccionParaVerificado({ articulos: [] })).toEqual({ articulos: [] })
  })
})
