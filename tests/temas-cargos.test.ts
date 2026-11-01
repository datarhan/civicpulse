/**
 * «¿A quién le pregunto por…?» (auditoría de las dos lecturas, §3; decisión D3):
 * el vocabulario curado que lleva de una palabra de la vida diaria —«basura»,
 * «colegio»— a un área delegada, y de ahí a quien la tiene hoy.
 *
 * El fichero no nombra a nadie: la persona sale de la lista de cargos, como en
 * cada tarjeta de /cargos. Las filas de prueba usan cadenas de área reales de
 * officials.json; las personas se derivan de él, nunca se escriben aquí.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

import {
  buscaTema,
  normaliza,
  respuestaDeTema,
  temasSinTitular,
  validateTemasCargos,
  type TemasCargos,
} from '../src/scraper/temas-cargos'

const LISTA = JSON.parse(readFileSync('public/data/officials.json', 'utf8'))
const AREAS: string[] = LISTA.officials.flatMap((o: any) => o.portfolios ?? [])
const area = (trozo: string) => {
  const a = AREAS.find((x) => x.toLowerCase().includes(trozo))
  if (!a) throw new Error(`ninguna área con «${trozo}» en officials.json`)
  return a
}
const titularesDe = (cargo: string) =>
  LISTA.officials.filter((o: any) => (o.portfolios ?? []).includes(cargo)).map((o: any) => o.slug)

const CEMENTERIO = area('cementerio')
const SERVICIOS = area('servicios públicos')

function vocabulario(cambios: Partial<TemasCargos> = {}): TemasCargos {
  return {
    generatedAt: '2026-10-28T00:00:00.000Z',
    note: 'Vocabulario curado de prueba: qué área delegada corresponde a cada asunto.',
    fuente: { titulo: 'Corporación municipal', url: 'https://www.ribarroja.es/' },
    temas: [
      {
        tema: 'cementerio',
        palabras: ['cementerio', 'nichos'],
        cargo: CEMENTERIO,
        confianza: 'literal',
        fecha: '2026-10-28',
      },
      {
        tema: 'basura',
        palabras: ['basura', 'residuos', 'contenedores'],
        cargo: SERVICIOS,
        confianza: 'editorial',
        razon:
          'El cargo no nombra la recogida de residuos; se le atribuye por ser el área de servicios públicos municipales.',
        fecha: '2026-10-28',
      },
      {
        tema: 'limpieza de calles',
        palabras: ['limpieza de calles', 'limpieza viaria'],
        cargo: SERVICIOS,
        confianza: 'editorial',
        razon:
          'El cargo no nombra la limpieza viaria; se le atribuye por ser el área de servicios públicos municipales.',
        fecha: '2026-10-28',
      },
    ],
    sinAsignar: [
      {
        tema: 'padrón',
        palabras: ['padrón', 'empadronarse'],
        motivo: 'Ninguna delegación del decreto de áreas nombra el padrón de habitantes.',
        fecha: '2026-10-28',
      },
    ],
    ...cambios,
  }
}
const valida = (v: unknown) => () => validateTemasCargos(JSON.parse(JSON.stringify(v)))

describe('validateTemasCargos', () => {
  it('mide algo: las áreas de prueba existen hoy y tienen titular', () => {
    expect(titularesDe(CEMENTERIO).length).toBeGreaterThan(0)
    expect(titularesDe(SERVICIOS).length).toBeGreaterThan(0)
  })

  it('acepta un vocabulario bien formado', () => {
    expect(valida(vocabulario())).not.toThrow()
  })

  it('«literal» sólo si el área nombra el asunto con sus palabras', () => {
    const v = vocabulario()
    v.temas[1] = { ...v.temas[1], confianza: 'literal' }
    delete v.temas[1].razon
    expect(valida(v)).toThrow(/literal/)
  })

  it('una atribución editorial no se publica sin su razón', () => {
    const v = vocabulario()
    delete v.temas[1].razon
    expect(valida(v)).toThrow(/razon/)
  })

  it('no nombra a nadie: rechaza cualquier campo de persona, también anidado', () => {
    for (const campo of ['oficial', 'nombre', 'partido', 'slug', 'email']) {
      const v: any = vocabulario()
      v.temas[0][campo] = 'x'
      expect(valida(v), campo).toThrow(new RegExp(campo))
    }
    const anidado: any = vocabulario()
    anidado.fuente.nombre = 'x'
    expect(valida(anidado)).toThrow(/nombre/)
  })

  it('ni campos con forma de juicio ni campos que no conoce', () => {
    const juicio: any = vocabulario()
    juicio.temas[0].valoracion = 'mal'
    expect(valida(juicio)).toThrow(/valoracion/)
    const raro: any = vocabulario()
    raro.temas[0].extra = 'x'
    expect(valida(raro)).toThrow(/extra/)
  })

  it('una palabra, una respuesta: ni repetida entre asuntos ni entre asunto y palabra', () => {
    const v = vocabulario()
    v.temas[2] = { ...v.temas[2], palabras: ['limpieza de calles', 'Basura'] }
    expect(valida(v)).toThrow(/basura/i)
    const w = vocabulario()
    w.sinAsignar[0] = { ...w.sinAsignar[0], palabras: ['empadronarse', 'nichos'] }
    expect(valida(w)).toThrow(/nichos/)
  })

  it('un asunto sin área dice por qué, y no lleva área', () => {
    const v: any = vocabulario()
    delete v.sinAsignar[0].motivo
    expect(valida(v)).toThrow(/motivo/)
    const w: any = vocabulario()
    w.sinAsignar[0].cargo = SERVICIOS
    expect(valida(w)).toThrow(/cargo/)
  })
})

describe('buscaTema', () => {
  const v = vocabulario()

  it('una palabra exacta, sin mayúsculas ni tildes, da su asunto', () => {
    for (const q of ['basura', 'BASURA', 'Básura ', 'contenedores']) {
      const r = buscaTema(v, q)
      expect(r.tipo, q).toBe('uno')
      expect(r.tipo === 'uno' && r.entrada.tema).toBe('basura')
    }
    const p = buscaTema(v, 'empadronarse')
    expect(p.tipo === 'uno' && p.entrada.tema).toBe('padrón')
  })

  it('un trozo de tres letras o más que sólo está en un asunto, también', () => {
    const r = buscaTema(v, 'nich')
    expect(r.tipo === 'uno' && r.entrada.tema).toBe('cementerio')
  })

  it('varias palabras del mismo asunto siguen siendo un asunto', () => {
    const r = buscaTema(v, 'limpieza')
    expect(r.tipo === 'uno' && r.entrada.tema).toBe('limpieza de calles')
    const calles = buscaTema(v, 'call')
    expect(calles.tipo === 'uno' && calles.entrada.tema).toBe('limpieza de calles')
  })

  it('un trozo que está en varios asuntos los ofrece todos, sin elegir', () => {
    // «conteNEDores» (basura) y «cemeNTErio».
    const r = buscaTema(v, 'nte')
    expect(r.tipo).toBe('varios')
    expect(r.tipo === 'varios' && r.entradas.map((e) => e.tema)).toEqual(['cementerio', 'basura'])
  })

  it('menos de tres letras sin palabra exacta no busca', () => {
    expect(buscaTema(v, 'ci').tipo).toBe('vacio')
  })

  it('lo que en valenciano se teclea de dos maneras es una palabra', () => {
    expect(normaliza('Col·legi')).toBe('collegi')
    expect(normaliza('col.legi')).toBe('collegi')
    expect(normaliza('collegi')).toBe('collegi')
    expect(normaliza('llicència d’obra')).toBe(normaliza("llicencia d'obra"))
  })

  it('lo que no está en el vocabulario es «ninguno», nunca una conjetura', () => {
    expect(buscaTema(v, 'helicóptero').tipo).toBe('ninguno')
    expect(buscaTema(v, '').tipo).toBe('vacio')
  })
})

describe('respuestaDeTema', () => {
  const v = vocabulario()

  it('el titular sale de la lista de cargos de hoy, como en su tarjeta', () => {
    const r = respuestaDeTema(v.temas[0], LISTA.officials)
    expect(r.tipo).toBe('cargo')
    if (r.tipo !== 'cargo') return
    expect(r.cargo).toBe(CEMENTERIO)
    expect(r.titulares.map((o) => o.slug)).toEqual(titularesDe(CEMENTERIO))
    expect(r.confianza).toBe('literal')
  })

  it('la atribución editorial viaja con su razón', () => {
    const r = respuestaDeTema(v.temas[1], LISTA.officials)
    expect(r.tipo === 'cargo' && r.razon).toBe(v.temas[1].razon)
  })

  it('un área que ya no figura en la lista no es «nadie la tiene»: es «no lo sabemos hoy»', () => {
    const r = respuestaDeTema({ ...v.temas[0], cargo: 'Un área que ya no existe' }, LISTA.officials)
    expect(r.tipo).toBe('sinTitular')
  })

  it('un asunto sin área delegada lo dice, con su motivo', () => {
    const r = respuestaDeTema(v.sinAsignar[0], LISTA.officials)
    expect(r.tipo === 'sinAsignar' && r.motivo).toBe(v.sinAsignar[0].motivo)
  })

  it('temasSinTitular cuenta la deriva', () => {
    const w = vocabulario()
    w.temas[0] = { ...w.temas[0], cargo: 'Un área que ya no existe' }
    expect(temasSinTitular(w, LISTA.officials)).toEqual(['cementerio'])
    expect(temasSinTitular(vocabulario(), LISTA.officials)).toEqual([])
  })
})

describe('el vocabulario publicado', () => {
  const RUTA = 'public/data/temas-cargos.json'

  it('existe, valida y mide algo', () => {
    expect(existsSync(RUTA)).toBe(true)
    const v = validateTemasCargos(JSON.parse(readFileSync(RUTA, 'utf8')))
    expect(v.temas.length).toBeGreaterThanOrEqual(20)
    expect(v.temas.some((t) => t.confianza === 'literal')).toBe(true)
    expect(v.temas.some((t) => t.confianza === 'editorial' && t.razon)).toBe(true)
  })

  // La alarma de deriva: officials.json se raspa cada noche, y si el ayuntamiento
  // cambia el reparto, un asunto puede quedarse apuntando a un área que nadie
  // tiene. La página entonces dice «no lo sabemos hoy», y esta prueba se pone roja
  // para que alguien lo cure con `npm run tema-cargo`.
  it('cada área del vocabulario tiene hoy titular en la lista de cargos', () => {
    const v = validateTemasCargos(JSON.parse(readFileSync(RUTA, 'utf8')))
    expect(temasSinTitular(v, LISTA.officials)).toEqual([])
  })
})
