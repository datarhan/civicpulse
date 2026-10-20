import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { verifyClaim } from '../src/scraper/claim-verifier'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

/**
 * El camino de sólo-objeto (bloque 3 de `verifyClaim`) empareja con las
 * palabras que DIJO quien habla, no con la paráfrasis del extractor.
 *
 * Medido el 19-10-2026: zrbgic-086-cit-ec50ea —«Si ha hagut un manteniment no
 * ha sigut l'adequat…», una valoración en valenciano— se publicaba `parcial` y
 * enseñada, con similitud 1, sobre el contrato de mantenimiento del césped
 * artificial. El extractor había anotado `referencedEntity: «contrato/condiciones
 * de mantenimiento del césped artificial»`, y ninguna de esas palabras está en la
 * cita. Un parecido con lo que el modelo entendió no es un parecido con lo que se
 * dijo, y un automático no sube un veredicto (CLAUDE.md, regla 4).
 *
 * Las filas no se escriben aquí: la cita sale tal cual de
 * pleno-claims-suggestions.json, y los contratos son los publicados.
 */

const ROOT = join(__dirname, '..')
const leer = (p: string) => JSON.parse(readFileSync(join(ROOT, 'public/data', p), 'utf8'))

const DATOS = {
  tenders: leer('tenders.json'),
  tendersTed: leer('tenders-ted.json'),
  bdns: leer('bdns.json'),
  budget: leer('budget.json'),
  promises: leer('promises.json'),
}
const CITAS = (leer('pleno-claims-suggestions.json') as { items: PlenoClaim[] }).items
const cita = (id: string): PlenoClaim => {
  const c = CITAS.find((x) => x.id === id)
  if (!c) throw new Error(`la cita ${id} ya no está en el corpus extraído`)
  return c
}
const verificar = (id: string) => verifyClaim({ claim: cita(id), ...DATOS })

describe('sólo-objeto · el emparejamiento se ancla en el literal', () => {
  it('zrbgic-086-cit-ec50ea: la paráfrasis casaba con el césped; la cita no lo nombra', () => {
    const c = cita('zrbgic-086-cit-ec50ea')
    // La premisa, sobre la fila real: el extractor nombra el césped y la cita no.
    expect(c.entities.referencedEntity).toMatch(/césped artificial/)
    expect(c.verbatim).not.toMatch(/c[ée]sped|gespa|artificial/i)

    const v = verificar('zrbgic-086-cit-ec50ea')
    expect(v.verdict).toBe('sin-datos')
    expect(v.evidence.some((e) => /c[ée]sped/i.test(e.snippet))).toBe(false)
    // El comparador se lanzó: que conste, para que no cuente como «ningún
    // comparador» en /laboratorio/cobertura.
    expect(v.checkedAgainst).toContain('tenders')
  })

  it('una cita que SÍ nombra la obra sigue casando con su contrato', () => {
    // «obras de renovación urbana en la zona de la calle Joan Martorell»: la
    // calle está en la cita, y el contrato es el de esa calle.
    const v = verificar('19gax3o-034-cit-8174e3')
    expect(v.verdict).toBe('parcial')
    expect(v.evidence.some((e) => /Joan Martorell/i.test(e.snippet))).toBe(true)
  })

  it('recortar la paráfrasis al literal no sube nada', () => {
    // Con sólo la parte de la entidad que está en el literal, estas filas
    // casaban ENTERAS contra un título y subían de `sin-datos` a `parcial`
    // (medido sobre la base del 19-10-2026, doce así). Se toma el menor de los
    // dos parecidos.
    for (const id of [
      '1xmr0do-061-cit-8b119e',
      '11025xk-005-cit-df605b',
      '19gax3o-066-cit-28a978',
      'c8kr44-108-cit-9e9228',
    ]) {
      expect(verificar(id).verdict, id).toBe('sin-datos')
    }
  })

  it('sin cifra, el contrato de la paráfrasis no vuelve como «expediente parecido»', () => {
    // `mejorCasiPorObjeto` sólo corre si el camino del IMPORTE leyó los
    // contratos; el de sólo-objeto también anota `tenders`, y la frase del
    // parecido habla de una cifra que esta cita no trae.
    const v = verificar('zrbgic-086-cit-ec50ea')
    expect(cita('zrbgic-086-cit-ec50ea').entities.amountEuros ?? null).toBeNull()
    expect(v.evidence).toEqual([])
    expect(v.summary).not.toMatch(/cifra citada/)
  })
})
