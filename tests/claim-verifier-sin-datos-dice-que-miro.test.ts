import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { verifyClaim } from '../src/scraper/claim-verifier'

/**
 * «No se encontró registro» no puede decirse de un expediente que sí se leyó.
 *
 * El claim `15uvjew-015-cit-c4edb0` se publica `sin-datos`, con la evidencia
 * VACÍA y esta frase: «No se encontró registro en tenders / BDNS / presupuesto».
 * El expediente existe —`tenders.json` trae el 46717, la concesión del
 * abastecimiento de agua potable, adjudicada el 6-08-2026— y el verificador lo
 * leyó: lo descartó por un eje y luego afirmó que no había ninguno.
 *
 * Los tres caminos, medidos el 16-09-2026:
 *
 *   · el del IMPORTE compara 3,5 M€ (el canon que cita el concejal) con los
 *     55,69 M€ del contrato: `similarAmount` ≈ 0,004, y la fila se cae;
 *   · el de `contradicho` pide Jaccard ≥ 0,34 y aquí sale ≈ 0,11 sobre un título
 *     larguísimo, así que se niega a refutar — y hace BIEN: esa puerta nació de
 *     49 `contradicho` equivocados y no se toca;
 *   · el de sólo-objeto está limitado a `cita_obra` y `acusacion_publica`, así
 *     que un `cita_convenio` no llega nunca.
 *
 * Es la familia del `r?.findings ?? []`: «no lo encontré» fundido con «lo
 * encontré y no dice eso», en una frase publicada en /hallazgos.
 *
 * El arreglo mueve la FRASE, no el veredicto: los automáticos sólo bajan.
 *
 * Las dos filas se leen de las instantáneas publicadas, no se escriben aquí.
 */
const ROOT = join(__dirname, '..')
const leer = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))

const VERIFICADOS = leer('public/data/pleno-claims-verified.json')
const TENDERS = leer('public/data/tenders.json')

const fila = VERIFICADOS.items.find(
  (x: { claim?: { id?: string } }) => x.claim?.id === '15uvjew-015-cit-c4edb0',
)
const claim = fila?.claim
const agua = TENDERS.contracts.find((c: { id?: string }) => c.id === '46717')
/** Un expediente que no comparte objeto con la cita: el control negativo. */
const ajeno = TENDERS.contracts.find((c: { title?: string }) =>
  /alumbrado ornamental navideño/i.test(c.title ?? ''),
)

describe('un sin-datos dice si miró algo parecido', () => {
  it('mide algo: las dos filas están publicadas y son el caso que se describe', () => {
    expect(claim, 'no está el claim del agua en la instantánea').toBeTruthy()
    expect(agua, 'no está el expediente 46717 en tenders').toBeTruthy()
    expect(ajeno, 'no está el contrato de control').toBeTruthy()
    expect(claim.type).toBe('cita_convenio')
    expect(claim.entities.amountEuros).toBeGreaterThan(0)
    // El objeto coincide y el importe NO: es justo el hueco entre los caminos.
    expect(agua.title.toLowerCase()).toContain('agua potable')
    expect(agua.finalAmountNoTaxes / claim.entities.amountEuros).toBeGreaterThan(2)
  })

  it('no dice «no se encontró registro» cuando el objeto SÍ aparece', () => {
    const v = verifyClaim({ claim, tenders: { contracts: [agua] } })
    expect(v.verdict, 'un veredicto automático no sube').toBe('sin-datos')
    expect(v.summary).not.toMatch(/no se encontró registro/i)
    expect(v.summary).toMatch(/no coincide|no es la citada|ninguna de sus magnitudes/i)
    const tender = v.evidence.filter((e) => e.kind === 'tender')
    expect(tender).toHaveLength(1)
    expect(tender[0].stance).toBe('checked')
    expect(tender[0].ref).toBe(agua.permalink)
  })

  it('con un expediente ajeno sigue diciendo que no encontró registro (el control)', () => {
    const v = verifyClaim({ claim, tenders: { contracts: [ajeno] } })
    expect(v.verdict).toBe('sin-datos')
    expect(v.summary).toMatch(/no se encontró registro/i)
    expect(v.evidence.filter((e) => e.kind === 'tender')).toEqual([])
  })
})
