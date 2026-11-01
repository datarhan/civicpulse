import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hallazgosPorTema, temaDelHallazgo } from '../src/scraper/hallazgos-por-tema'
import { ALLOWED_CLAIM_TOPICS } from '../src/scraper/pleno-claim'

/**
 * Los hallazgos de una sesión, agrupados por el tema de las declaraciones que
 * citan (auditoría de las dos lecturas, §10). En /plenos/10yl550 se leían
 * nueve títulos seguidos, con casi repetidos en dos formatos de fecha y en dos
 * lenguas: «Feria de Comercio» y «Fira de Comercio», dos de movilidad, dos de
 * vivienda. El título de un hallazgo es prosa firmada y no se toca; lo que
 * cambia es el orden en que se leen.
 *
 * Todo se comprueba sobre lo publicado: los hallazgos y los fragmentos de
 * declaraciones de cada sesión, como los pinta la página.
 */
const datos = join(__dirname, '..', 'public', 'data')
const leer = (f: string) => JSON.parse(readFileSync(join(datos, f), 'utf8'))
type Hallazgo = { id: string; plenoId: string; title: string; sourceClaimIds: string[] }
type Declaracion = { claim: { id: string; topic: string } }
const hallazgos: Hallazgo[] = leer('pleno-findings.json').items

const declaracionesDe = (plenoId: string): Declaracion[] => {
  const f = join(datos, 'pleno-claims', `${plenoId}.json`)
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).items : []
}
const sesiones = [...new Set(hallazgos.map((h) => h.plenoId))]

describe('temaDelHallazgo — el tema que más repiten las declaraciones que cita', () => {
  it('lee hallazgos de verdad', () => {
    expect(hallazgos.length).toBeGreaterThan(10)
  })

  it('sobre lo publicado: el tema es el de alguna de sus declaraciones, y el más repetido', () => {
    let conTema = 0
    for (const h of hallazgos) {
      const temaDe = new Map(declaracionesDe(h.plenoId).map((d) => [d.claim.id, d.claim.topic]))
      const temas = h.sourceClaimIds.map((id) => temaDe.get(id)).filter(Boolean) as string[]
      const tema = temaDelHallazgo(h, temaDe)
      if (temas.length === 0) {
        expect(tema, h.id).toBeNull()
        continue
      }
      conTema++
      expect(temas, h.id).toContain(tema)
      const veces = (t: string) => temas.filter((x) => x === t).length
      for (const t of temas) expect(veces(tema!), h.id).toBeGreaterThanOrEqual(veces(t))
    }
    expect(conTema, 'algún hallazgo con tema').toBeGreaterThan(0)
  })

  it('empate: gana el que el hallazgo cita antes', () => {
    const declaraciones = declaracionesDe('10yl550')
    const de = (t: string) => declaraciones.find((d) => d.claim.topic === t)!.claim.id
    const temaDe = new Map(declaraciones.map((d) => [d.claim.id, d.claim.topic]))
    const h = { sourceClaimIds: [de('vivienda'), de('movilidad')] }
    expect(temaDelHallazgo(h, temaDe)).toBe('vivienda')
    expect(temaDelHallazgo({ sourceClaimIds: [...h.sourceClaimIds].reverse() }, temaDe)).toBe(
      'movilidad',
    )
  })

  it('sin ninguna declaración publicada que lo diga, null y no un tema por eliminación', () => {
    const temaDe = new Map(declaracionesDe('10yl550').map((d) => [d.claim.id, d.claim.topic]))
    expect(temaDelHallazgo({ sourceClaimIds: ['no-publicada'] }, temaDe)).toBeNull()
    expect(temaDelHallazgo({ sourceClaimIds: [] }, temaDe)).toBeNull()
  })
})

describe('hallazgosPorTema — cada hallazgo en un solo grupo', () => {
  it('sobre lo publicado, sesión a sesión: nadie se pierde ni se repite, y cada grupo es de su tema', () => {
    for (const id of sesiones) {
      const deLaSesion = hallazgos.filter((h) => h.plenoId === id)
      const declaraciones = declaracionesDe(id)
      const temaDe = new Map(declaraciones.map((d) => [d.claim.id, d.claim.topic]))
      const grupos = hallazgosPorTema(deLaSesion, declaraciones)
      const ids = grupos.flatMap((g) => g.hallazgos.map((h) => h.id))
      expect(ids.sort(), id).toEqual(deLaSesion.map((h) => h.id).sort())
      expect(new Set(grupos.map((g) => g.tema)).size, `${id}: un grupo por tema`).toBe(
        grupos.length,
      )
      for (const g of grupos) {
        if (g.tema !== null) expect(ALLOWED_CLAIM_TOPICS, id).toContain(g.tema)
        for (const h of g.hallazgos) expect(temaDelHallazgo(h, temaDe), h.id).toBe(g.tema)
      }
    }
  })

  it('/plenos/10yl550: los casi repetidos quedan juntos', () => {
    const grupos = hallazgosPorTema(
      hallazgos.filter((h) => h.plenoId === '10yl550'),
      declaracionesDe('10yl550'),
    )
    const deTema = (t: string) => grupos.find((g) => g.tema === t)?.hallazgos.map((h) => h.title)
    expect(deTema('cultura')?.join(' | ')).toMatch(/Feria de Comercio.*Fira de Comercio/)
    expect(deTema('movilidad')).toHaveLength(2)
    expect(deTema('vivienda')).toHaveLength(2)
  })

  it('los grupos van de más a menos hallazgos; a igualdad, por su primer hallazgo; sin tema, al final', () => {
    const declaraciones = declaracionesDe('10yl550')
    const de = (t: string) => declaraciones.find((d) => d.claim.topic === t)!.claim.id
    const lista = [
      { id: 'a', sourceClaimIds: [de('fiscal')] },
      { id: 'b', sourceClaimIds: ['no-publicada'] },
      { id: 'c', sourceClaimIds: [de('cultura')] },
      { id: 'd', sourceClaimIds: [de('cultura')] },
      { id: 'e', sourceClaimIds: [de('seguridad')] },
    ]
    const grupos = hallazgosPorTema(lista, declaraciones)
    expect(grupos.map((g) => [g.tema, g.hallazgos.map((h) => h.id).join('')])).toEqual([
      ['cultura', 'cd'],
      ['fiscal', 'a'],
      ['seguridad', 'e'],
      [null, 'b'],
    ])
  })

  it('sin hallazgos, ningún grupo', () => {
    expect(hallazgosPorTema([], declaracionesDe('10yl550'))).toEqual([])
  })
})
