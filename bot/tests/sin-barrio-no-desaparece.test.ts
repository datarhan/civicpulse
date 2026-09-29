import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import { autorTelegram } from '../src/db/queries'
import { resumenDeBarrios } from '../src/commands/barrio'
import { computeRanking, quejasSinBarrio60d } from '../src/commands/ranking'
import { creaPublicada } from './helpers/publicada'

/**
 * Una queja sin barrio no desaparece de `/barrio` ni de `/ranking`.
 *
 * Desde el 2026-09-27 el casco urbano no tiene barrio (situar-barrio.ts), y los
 * dos comandos saltaban esas quejas en silencio: con las recientes en el casco,
 * `/barrio` decía «Aún no hay quejas con ubicación» — tenían ubicación, les
 * faltaba barrio —, y `/ranking` las dejaba fuera sin decirlo (revisión de #131).
 */
const q = (neighborhood: string | null) => ({ neighborhood })

describe('/barrio: el resumen cuenta las que no tienen barrio', () => {
  it('con todas sin barrio no dice que no hay quejas con ubicación', () => {
    const texto = resumenDeBarrios([q(null), q(null)])
    expect(texto).not.toMatch(/con ubicación/)
    expect(texto).toMatch(/Ninguna de las quejas recientes \(2\) tiene barrio/)
  })

  it('con unas y otras, lista los barrios y dice cuántas quedan fuera', () => {
    const texto = resumenDeBarrios([q('el-molinet'), q(null), q('el-molinet')])
    expect(texto).toMatch(/El Molinet — 2/)
    expect(texto).toMatch(/Sin barrio: 1 de 3/)
  })

  it('el control: sin quejas sin barrio, no hay nota', () => {
    expect(resumenDeBarrios([q('el-molinet')])).not.toMatch(/Sin barrio/)
    expect(resumenDeBarrios([])).toMatch(/Aún no hay quejas/)
  })
})

describe('/ranking: cuenta las que no puede clasificar', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })
  const seed = (neighborhood: string | null) =>
    creaPublicada(db, {
      autor: autorTelegram(1),
      category: 'via_publica',
      title: 'Bache sin reparar',
      detail: 'Bache profundo en Av. Primera, 2 meses',
      neighborhood,
      concejalia_area: 'Obra Pública',
      concejal_slug: 'teresa-pozuelo-martin',
    })

  it('una queja del casco no entra en el ranking, y se cuenta aparte', () => {
    seed('el-molinet')
    seed(null)
    seed(null)
    expect(computeRanking(db).map((s) => s.neighborhood)).toEqual(['el-molinet'])
    expect(quejasSinBarrio60d(db)).toBe(2)
  })

  it('el control: sin quejas sin barrio, cero', () => {
    seed('el-molinet')
    expect(quejasSinBarrio60d(db)).toBe(0)
  })
})
