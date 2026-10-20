import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  computeCoverageGaps,
  esTramiteDePleno,
  palabrasDeContenido,
  MIN_PALABRAS_COMPARTIDAS,
  type PressArticleLite,
} from '../src/scraper/press-analytics'

/**
 * «Lagunas de cobertura · Lo que la prensa local no está siguiendo», medido el
 * 19-10-2026 sobre el press-coverage-gaps.json publicado ese día.
 *
 * Un punto del pleno o una promesa contaba como «seguido» si UNA palabra de más de
 * cuatro letras de su título salía en CUALQUIER titular de los últimos 14 días, y
 * las palabras de todos los titulares se echaban en una sola bolsa. En el pleno
 * zrbgic (5-10-2026) salían «seguidos» cinco puntos y una promesa, y cuatro de los
 * cinco puntos eran casualidades:
 *
 *   · el servicio de transportes, por «proyecto» —una pieza de Interempresas sobre
 *     la restauración de las canteras—;
 *   · la moción del PP y VOX, por «túria», que sale en 20 titulares, 12 de ellos
 *     anuncios de Fotocasa;
 *   · el césped del estadio, por «suministro» —el del agua potable—;
 *   · «Dar cuenta de las Resoluciones…», por «cuenta» —la Cuenta General—.
 *
 * Y la promesa ac-psoe-1kui43c (congelar la tarifa del agua), por «nuevo».
 *
 * Las filas son las de producción: press.json del 19-10-2026, la sesión zrbgic de
 * plenos-agendas.json y las promesas recientes de promises.json, copiadas tal cual.
 */

const leer = (f: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', f), 'utf8'))
const PRESS = leer('press_2026-10-19.json').items as PressArticleLite[]
const LAGUNAS = leer('press-lagunas_2026-10-19.json') as {
  plenos: Array<{
    id: string
    date: string
    agenda: Array<{ number: number; title: string; department?: string }>
  }>
  promesas: Array<{ id: string; title: string; madeAt: string }>
}
/** El `generatedAt` del press-coverage-gaps.json publicado el 19-10-2026. */
const AHORA = new Date('2026-10-19T12:46:45.696Z')

const informe = () =>
  computeCoverageGaps({
    press: PRESS,
    agendas: { plenos: LAGUNAS.plenos },
    promises: { items: LAGUNAS.promesas },
    now: AHORA,
  })

const sinEco = () => new Set(informe().items.map((i) => i.refId))

describe('lagunas de cobertura — el pleno zrbgic del 5-10-2026', () => {
  it('el transporte, la moción del PP y VOX y el césped NO están seguidos por la prensa', () => {
    const lagunas = sinEco()
    expect(lagunas.has('zrbgic:3')).toBe(true) // césped del estadio Roberto Gil
    expect(lagunas.has('zrbgic:4')).toBe(true) // servicio municipal de transportes
    expect(lagunas.has('zrbgic:5')).toBe(true) // moción PP-VOX del 9 d'Octubre
    expect(lagunas.has('zrbgic:6')).toBe(true) // asignación a los grupos políticos
  })

  it('la Cuenta General sí la siguió la prensa, y se dice con qué titular y qué palabras', () => {
    const r = informe()
    expect(r.items.map((i) => i.refId)).not.toContain('zrbgic:2')
    const eco = r.covered.find((c) => c.refId === 'zrbgic:2')
    expect(eco).toBeDefined()
    // Un medio independiente: Valencia Plaza (pqxb2e), no la nota del Ayuntamiento.
    expect(eco!.articleId).toBe('pqxb2e')
    expect(eco!.shared).toEqual(expect.arrayContaining(['cuenta', 'general']))
    expect(eco!.shared.length).toBeGreaterThanOrEqual(MIN_PALABRAS_COMPARTIDAS)
  })

  it('la promesa de congelar la tarifa del agua no la sigue ningún titular: «nuevo» no es eco', () => {
    expect(sinEco().has('ac-psoe-1kui43c')).toBe(true)
  })

  it('los trámites —acta anterior, dar cuenta de resoluciones, ruegos y preguntas— no son candidatos', () => {
    const r = informe()
    for (const ref of ['zrbgic:1', 'zrbgic:7', 'zrbgic:8']) {
      expect(r.items.map((i) => i.refId)).not.toContain(ref)
      expect(r.covered.map((c) => c.refId)).not.toContain(ref)
    }
    expect(r.stats.tramitesExcluidos).toBe(3)
    // 5 puntos con contenido + la única promesa dentro de la ventana.
    expect(r.stats.candidatesExamined).toBe(6)
    // Cuadran: cada candidato o tiene eco o es laguna.
    expect(r.items.length + r.covered.length).toBe(r.stats.candidatesExamined)
  })

  it('ningún eco viene de un anuncio de Fotocasa ni de una nota de prensa oficial', () => {
    const porId = new Map(PRESS.map((p) => [p.id, p]))
    for (const c of informe().covered) {
      const a = porId.get(c.articleId)!
      expect(a.sourceHost).not.toBe('fotocasa.es')
      expect(a.sourceHost).not.toBe('ribarroja.es')
    }
  })
})

describe('palabrasDeContenido — sin vacías, sin el nombre del pueblo, sin fórmulas de trámite', () => {
  it('«túria», «proyecto», «suministro», «cuenta de» y «nuevo» no son contenido', () => {
    const palabras = new Set([
      ...palabrasDeContenido('Riba-roja de Túria ejecutará un nuevo proyecto'),
      ...palabrasDeContenido('Inicio del expediente de contratación del suministro'),
    ])
    for (const p of ['riba', 'roja', 'turia', 'túria', 'nuevo', 'proyecto', 'suministro']) {
      expect(palabras.has(p)).toBe(false)
    }
    expect(palabras.has('ejecutara')).toBe(true)
  })

  it('compara sin tildes: «adjudicación» y «adjudicacion» son la misma palabra', () => {
    expect(palabrasDeContenido('Pavimento de césped')).toEqual(['pavimento', 'cesped'])
  })
})

describe('esTramiteDePleno — los trámites fijos del orden del día, en las dos lenguas', () => {
  it.each([
    'Aprobación Acta Ordinaria anterior de fecha 7 de septiembre de 2026',
    'Aprobación Actas anteriores de fecha 3 de julio de 2026 (Extraordinaria)',
    'Aprovació Acta anterior de data 19 de gener 2026',
    'Dar cuenta de las Resoluciones de la número 2850/2026 a la 3084//2026',
    'Donar compte de les Resolucions de la número 47/2026 a la 363/2026',
    'Ruegos y preguntas',
    'Precs i Preguntes',
    'Precs y preguntes',
    'Asuntos de Urgencia',
  ])('«%s» es trámite', (t) => {
    expect(esTramiteDePleno(t)).toBe(true)
  })

  // Una dación de cuenta con sustancia —una sentencia, una auditoría, la Cuenta
  // General— sí es noticia, y que la prensa no la siga sí es una laguna.
  it.each([
    'Aprobación de la Cuenta General correspondiente al ejercicio 2025',
    'Dación cuenta de la Sentencia nº 100/2026 emitida por el Juzgado de lo Contencioso',
    'Dación cuenta al Pleno del informe de auditoría de sistemas del registro contable',
    'Asuntos de Urgencia. RECURSOS HUMANOS, Acuerdo para la modificación de los criterios de reparto de la asignación a los grupos políticos para la anualidad 2026',
  ])('«%s» no es trámite', (t) => {
    expect(esTramiteDePleno(t)).toBe(false)
  })
})

describe('computeCoverageGaps — un eco es un titular, no la bolsa de todos', () => {
  const base = {
    id: 'x',
    link: 'https://example.org/x',
    source: 'Levante-EMV',
    sourceHost: 'levante-emv.com',
    date: '2026-10-18T10:00:00.000Z',
    fingerprint: 'fp',
  }
  const pleno = (title: string) => ({
    plenos: [{ id: 'p', date: '2026-10-10', agenda: [{ number: 1, title }] }],
  })

  it('dos palabras repartidas entre dos titulares no hacen eco', () => {
    const r = computeCoverageGaps({
      press: [
        { ...base, id: 'a', title: 'Polémica por el pavimento del polideportivo' },
        { ...base, id: 'b', title: 'El estadio cumple cincuenta años' },
      ],
      agendas: pleno('Sustitución del pavimento del estadio municipal'),
      now: AHORA,
    })
    expect(r.items.map((i) => i.refId)).toEqual(['p:1'])
  })

  it('las dos en el mismo titular, sí', () => {
    const r = computeCoverageGaps({
      press: [{ ...base, id: 'a', title: 'Riba-roja cambiará el pavimento del estadio' }],
      agendas: pleno('Sustitución del pavimento del estadio municipal'),
      now: AHORA,
    })
    expect(r.items).toEqual([])
    expect(r.covered[0].shared).toEqual(['pavimento', 'estadio'])
  })

  it('un anuncio clasificado no es prensa: no da eco aunque comparta las palabras', () => {
    const r = computeCoverageGaps({
      press: [
        {
          ...base,
          id: 'anuncio',
          title: '1 Casas y pisos en Calle Joan Fuster, Riba-roja de Túria',
          source: 'Fotocasa',
          sourceHost: 'fotocasa.es',
        },
      ],
      agendas: pleno('Reurbanización de la calle Joan Fuster'),
      now: AHORA,
    })
    expect(r.items.map((i) => i.refId)).toEqual(['p:1'])
  })
})
