/**
 * El cotejo de un desglose publicado contra la votación de FONDO de su acta.
 *
 * Fixture: el acta real del pleno del 09-02-2026 (`rx4hb4`), leída con pdftotext
 * sin `-layout`; el comando exacto está en la cabecera de `tests/acta-votos.test.ts`.
 * Lo publicado hoy en rx4hb4-10/-11 está mal (PP y VOX cruzados con la urgencia):
 * estas pruebas fijan que el cotejo lo diga, y que nunca lo compare con la urgencia.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { cotejarVoto, resumenCotejo } from '../src/scraper/cotejo-votos-acta'
import { parseVotacionesActa, SIN_DESGLOSE } from '../src/scraper/acta-votos'

const ACTA = parseVotacionesActa(readFileSync('tests/fixtures/regmeet_acta_2026-02-09.txt', 'utf8'))
const publicado11 = {
  id: 'rx4hb4-11',
  itemNumber: 11,
  votes: [
    { bloc: 'PSOE', direction: 'a_favor', seats: 11 },
    { bloc: 'Compromís', direction: 'a_favor', seats: 1 },
    { bloc: 'PP', direction: 'abstencion', seats: 7 },
    { bloc: 'VOX', direction: 'en_contra', seats: 1 },
    { bloc: null, direction: 'a_favor', seats: 1 },
  ],
} as const

describe('cotejarVoto', () => {
  it('lo publicado hoy en rx4hb4-11 contradice el fondo del acta', () => {
    const c = cotejarVoto(publicado11 as never, ACTA)
    expect(c.resultado).toBe('contradice')
    expect(c.detalle).toMatch(/PP/)
    expect(c.detalle).toMatch(/fondo/)
  })
  it('el desglose corregido coincide (y un null no se cuenta como contradicción)', () => {
    const corregido = {
      ...publicado11,
      votes: [
        { bloc: 'PSOE', direction: 'a_favor', seats: 11 },
        { bloc: 'Compromís', direction: 'a_favor', seats: 1 },
        { bloc: 'PP', direction: 'en_contra', seats: 7 },
        { bloc: 'VOX', direction: 'abstencion', seats: 1 },
        { bloc: null, direction: 'a_favor', seats: 1 },
      ],
    }
    const c = cotejarVoto(corregido as never, ACTA)
    expect(c.resultado).toBe('coincide')
    expect(c.detalle).toMatch(/1 escaño sin grupo publicado; el acta lo nombra \(EU-Podem\)/)
  })
  it('nunca compara contra la votación de urgencia', () => {
    // El desglose de la urgencia del 11 (PSOE sí; PP no; VOX, EUPV, Compromís abst.) NO es «coincide».
    const comoUrgencia = {
      ...publicado11,
      votes: [
        { bloc: 'PSOE', direction: 'a_favor', seats: 11 },
        { bloc: 'PP', direction: 'en_contra', seats: 7 },
        { bloc: 'VOX', direction: 'abstencion', seats: 1 },
        { bloc: 'EU-Podem', direction: 'abstencion', seats: 1 },
        { bloc: 'Compromís', direction: 'abstencion', seats: 1 },
      ],
    }
    expect(cotejarVoto(comoUrgencia as never, ACTA).resultado).toBe('contradice')
  })
  it('sin acta es sin-acta; punto ausente en el acta es no-encontrada, nunca coincide', () => {
    expect(cotejarVoto(publicado11 as never, null).resultado).toBe('sin-acta')
    expect(cotejarVoto({ ...publicado11, itemNumber: 29 } as never, ACTA).resultado).toBe(
      'no-encontrada',
    )
  })
  it('dos votaciones de fondo bajo el mismo punto: ambigua', () => {
    const doble = [
      ...ACTA.filter((v) => v.itemNumber === 11 && v.fase === 'fondo'),
      ...ACTA.filter((v) => v.itemNumber === 11 && v.fase === 'fondo'),
    ]
    expect(cotejarVoto(publicado11 as never, doble).resultado).toBe('ambigua')
  })
  it('unanimidad: cualquier sentido distinto de a_favor/ausente contradice', () => {
    const unan = [
      {
        itemNumber: 3,
        fase: 'fondo' as const,
        unanimidad: true,
        blocs: [],
        sinMapear: [],
        literal: 'por unanimidad',
      },
    ]
    const ok = {
      id: 'x-03',
      itemNumber: 3,
      votes: [
        { bloc: 'PP', direction: 'a_favor', seats: 7 },
        { bloc: 'VOX', direction: 'ausente', seats: 1 },
      ],
    }
    const mal = {
      id: 'x-03',
      itemNumber: 3,
      votes: [{ bloc: 'PP', direction: 'abstencion', seats: 7 }],
    }
    expect(cotejarVoto(ok as never, unan).resultado).toBe('coincide')
    expect(cotejarVoto(mal as never, unan).resultado).toBe('contradice')
  })
  it('una cláusula no unánime sin desglose legible es no-encontrada, nunca coincide', () => {
    const sinDesglose = [
      {
        itemNumber: 4,
        fase: 'fondo' as const,
        unanimidad: false,
        blocs: [],
        sinMapear: [SIN_DESGLOSE],
        literal: 'por 13 votos a favor y 8 en contra, acordó',
      },
    ]
    const voto = { id: 'x-04', itemNumber: 4, votes: [{ bloc: 'PP', direction: 'a_favor' }] }
    const c = cotejarVoto(voto as never, sinDesglose)
    expect(c.resultado).toBe('no-encontrada')
    expect(c.detalle).toMatch(/cláusula sin desglose legible/)
    // Y aunque el parser no hubiera dejado la marca, sin grupos no hay nada que cotejar.
    const sinMarca = [{ ...sinDesglose[0], sinMapear: [] }]
    expect(cotejarVoto(voto as never, sinMarca).resultado).toBe('no-encontrada')
  })
  it('un grupo publicado que el acta no nombra es ambigua, nombrando el grupo', () => {
    const fondo = ACTA.filter((v) => v.itemNumber === 11 && v.fase === 'fondo')
    const conCs = {
      ...publicado11,
      votes: [
        { bloc: 'PSOE', direction: 'a_favor', seats: 11 },
        { bloc: 'PP', direction: 'en_contra', seats: 7 },
        { bloc: 'Ciudadanos', direction: 'a_favor', seats: 1 },
      ],
    }
    const c = cotejarVoto(conCs as never, fondo)
    expect(c.resultado).toBe('ambigua')
    expect(c.detalle).toMatch(/Ciudadanos/)
  })
  it('un grupo con sentido distinto pesa más que uno ausente del acta: contradice', () => {
    const fondo = ACTA.filter((v) => v.itemNumber === 11 && v.fase === 'fondo')
    const mezcla = {
      ...publicado11,
      votes: [
        { bloc: 'PP', direction: 'abstencion', seats: 7 },
        { bloc: 'Ciudadanos', direction: 'a_favor', seats: 1 },
      ],
    }
    expect(cotejarVoto(mezcla as never, fondo).resultado).toBe('contradice')
  })
})

describe('resumenCotejo — demuestra que hizo trabajo', () => {
  const c = (resultado: string) => ({ voteId: 'v', resultado, detalle: '' }) as never
  it('falla con una contradicción', () => {
    expect(resumenCotejo([c('coincide'), c('contradice')]).falla).toBe(true)
  })
  it('falla si había actas y no evaluó nada', () => {
    const r = resumenCotejo([c('no-encontrada'), c('no-encontrada')])
    expect(r.evaluados).toBe(2)
    expect(r.falla).toBe(true)
  })
  it('falla si «no-encontrada» pasa del 20 % de lo evaluado (el parser se rompió)', () => {
    expect(
      resumenCotejo([c('coincide'), c('coincide'), c('coincide'), c('no-encontrada')]).falla,
    ).toBe(true)
    expect(
      resumenCotejo([
        c('coincide'),
        c('coincide'),
        c('coincide'),
        c('coincide'),
        c('coincide'),
        c('no-encontrada'),
      ]).falla,
    ).toBe(false)
  })
  it('sin-acta no cuenta como evaluado, y ambigua no hace fallar', () => {
    const r = resumenCotejo([c('sin-acta'), c('ambigua'), c('coincide')])
    expect(r.evaluados).toBe(2)
    expect(r.falla).toBe(false)
  })
})
