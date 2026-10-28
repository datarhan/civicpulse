import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { verifyClaim } from '../src/scraper/claim-verifier'
import { cifraCitada, cifraEnElLiteral } from '../src/scraper/cifra-en-literal'
import { resumenVerificado } from '../src/scraper/claim-verdicts'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

/**
 * El camino del importe sólo coteja la cifra que la cita DICE.
 *
 * La revisión lectora del 27-10-2026 leyó en /plenos/k4olcs, pestaña
 * Declaraciones, la tarjeta de k4olcs-019-cit-b9b013: «sistema de debate,
 * captura y grabación de vídeo y control del salón de plenos municipales.»,
 * «Verificado», «81 K €» en la cabecera y debajo «Lo que se cotejó: un contrato
 * publicado imprime la cifra citada, con un 1 % de margen, y nombra el mismo
 * objeto.». La cita no trae ninguna cifra. Los 80.666 € se dijeron en la frase
 * SIGUIENTE —k4olcs-018-afi-7abae5, «por importe de 80.666 euros»— y el
 * extractor se los anotó también a ésta en `entities.amountEuros`. El contrato
 * 32/2024 es el bueno; lo que la tarjeta decía de ESTA cita era falso.
 *
 * El bloque de sólo-objeto ya lo había aprendido con la entidad: «un parecido
 * con lo que el modelo entendió no es un parecido con lo que se dijo»
 * (claim-verifier.ts, bloque 3; tests/claim-verifier-anclaje-literal.test.ts).
 * Esto es lo mismo con la cifra.
 *
 * Medido el 27-10-2026 sobre las 6.756 verificaciones deterministas servidas,
 * con el verificador de antes y el de ahora: cambian DOS. k4olcs-019, de
 * `verificado` a `parcial` por el título del contrato, sin cifra; y
 * qz6weg-023-cit-aae985 —«…asumían el personal del Conservatorio de Danza», con
 * 1,5 M€ del extractor—, que enseñaba un expediente parecido bajo «su importe no
 * coincide con la cifra citada» de una cifra que no dijo nadie. Ninguna sube.
 *
 * Las citas son las publicadas (pleno-claims-suggestions.json) y los registros,
 * los ficheros servidos.
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
const cita = (id: string) => {
  const c = CITAS.find((x) => x.id === id)
  expect(c, id).toBeDefined()
  return c!
}

/** Una fila de evidencia que imprime un importe: «… · 80.667 €». */
const IMPRIME_IMPORTE = /\d €$/

describe('cifraEnElLiteral', () => {
  it('la cifra escrita en dígitos, leída como se escribe en castellano', () => {
    expect(cifraEnElLiteral('por importe de 80.666 euros', 80666)).toBe(true)
    expect(cifraEnElLiteral('cartelería digital por importe de 35.252,87 y…', 35252.87)).toBe(true)
    expect(cifraEnElLiteral('serán 1,5 millones de euros', 1_500_000)).toBe(true)
    // El 1 % del verificador: «80.666» dicho por 80.666,66 €.
    expect(cifraEnElLiteral('por importe de 80.666 euros', 80666.66)).toBe(true)
  })

  it('con las mismas cifras significativas, como las lee el extractor', () => {
    expect(cifraEnElLiteral('un remanente de 3,3 mill', 3_300_000)).toBe(true)
    expect(cifraEnElLiteral('Hace 10 años. Hoy 46.', 46_000_000)).toBe(true)
    expect(cifraEnElLiteral('la cantidad correcta son 143.539.04', 14_353_904)).toBe(true)
    expect(cifraEnElLiteral('por importe de 15,334.918 €', 15_334_918)).toBe(true)
  })

  it('en letra basta un cardinal: el valor no se lee', () => {
    expect(cifraEnElLiteral('en un presupuesto de cuarenta y pico millones', 40_000_000)).toBe(true)
    expect(cifraEnElLiteral('tenían una partida de cincuenta mil euros', 50_000)).toBe(true)
    expect(cifraEnElLiteral('ha costat setanta-cinc mil euros', 75_000)).toBe(true)
  })

  it('una cifra que la cita no dice no está, aunque la cita traiga otros números', () => {
    expect(
      cifraEnElLiteral(
        'sistema de debate, captura y grabación de vídeo y control del salón de plenos municipales.',
        80666,
      ),
    ).toBe(false)
    expect(cifraEnElLiteral('y la actuación 2, sistema de debate…', 80666)).toBe(false)
    expect(cifraEnElLiteral('Son de servicios sociales. Del 2025.', 838_000)).toBe(false)
    // Una sola cifra significativa no es la cifra: «el punto 2» no dice dos millones.
    expect(cifraEnElLiteral('vamos al punto 2 del orden del día', 2_000_000)).toBe(false)
    // «Miles» no es una cifra.
    expect(cifraEnElLiteral('miles de euros en facturas', 5_000)).toBe(false)
  })

  it('sin cifra positiva no hay nada que buscar', () => {
    expect(cifraEnElLiteral('va costar zero euros', 0)).toBe(false)
    expect(cifraEnElLiteral('por importe de 80.666 euros', null)).toBe(false)
    expect(cifraEnElLiteral('por importe de 80.666 euros', undefined)).toBe(false)
  })

  it('cifraCitada: la de la cita si la dice; si no, null', () => {
    expect(cifraCitada(cita('k4olcs-018-afi-7abae5'))).toBe(80666)
    expect(cifraCitada(cita('k4olcs-019-cit-b9b013'))).toBeNull()
  })
})

describe('k4olcs-019-cit-b9b013: la cita sin cifra no se verifica con la de la frase siguiente', () => {
  it('la premisa: el extractor le anotó 80.666 € y el literal no trae ninguna cifra', () => {
    const c = cita('k4olcs-019-cit-b9b013')
    expect(c.entities.amountEuros).toBe(80666)
    expect(c.verbatim).not.toMatch(/\d/)
    // Y la frase siguiente sí la dice: de ahí la sacó.
    expect(cita('k4olcs-018-afi-7abae5').verbatim).toMatch(/80\.666/)
  })

  it('no sale `verificado`, ni con la frase de lo que «imprime la cifra citada»', () => {
    const v = verifyClaim({ claim: cita('k4olcs-019-cit-b9b013'), ...DATOS })
    expect(v.verdict).not.toBe('verificado')
    expect(v.summary).not.toBe(resumenVerificado('tender'))
    expect(v.summary).not.toMatch(/cifra/)
  })

  it('sigue cotejada por lo que dice —el objeto, con el contrato del salón de plenos—, sin importe', () => {
    const v = verifyClaim({ claim: cita('k4olcs-019-cit-b9b013'), ...DATOS })
    // Lo positivo primero: el bloque de sólo-objeto la casa con el título.
    expect(v.verdict).toBe('parcial')
    const filas = v.evidence.filter((e) => e.kind === 'tender')
    expect(filas).toHaveLength(1)
    expect(filas[0].ref).toMatch(/qDjb9WdwTN3jHF5qKI4aaw/)
    // Y su fila no imprime un importe que se lea contra la cita.
    expect(filas[0].snippet).not.toMatch(IMPRIME_IMPORTE)
    // Y nombra lo que la comparó —los contratos, por su título—, no las
    // subvenciones, con las que sin cifra no se compara nada.
    expect(v.checkedAgainst).toEqual(['tenders', 'tenders-ted'])
  })

  it('con la cifra dicha en el literal, el mismo objeto sí se verifica (control)', () => {
    const v = verifyClaim({
      claim: {
        ...cita('k4olcs-019-cit-b9b013'),
        verbatim:
          'sistema de debate, captura y grabación de vídeo y control del salón de plenos municipales. por importe de 80.666 euros.',
      },
      ...DATOS,
    })
    expect(v.verdict).toBe('verificado')
    expect(v.summary).toBe(resumenVerificado('tender'))
  })
})

describe('qz6weg-023-cit-aae985: ni el expediente «que se parece» de una cifra que no se dijo', () => {
  it('no enseña un contrato bajo «su importe no coincide con la cifra citada»', () => {
    const c = cita('qz6weg-023-cit-aae985')
    // La premisa: una cifra del extractor y ninguna en el literal.
    expect(c.entities.amountEuros).toBe(1_500_000)
    expect(cifraEnElLiteral(c.verbatim, c.entities.amountEuros)).toBe(false)
    const v = verifyClaim({ claim: c, ...DATOS })
    expect(v.verdict).toBe('sin-datos')
    expect(v.evidence.filter((e) => e.kind === 'tender')).toEqual([])
    expect(v.summary).not.toMatch(/cifra citada/)
    // Y no dice haber mirado contratos ni subvenciones: sin cifra en el literal
    // no hubo nada que comparar con ellos (la regla por la que se quitó el
    // presupuesto, `VerifierInputs.budget`).
    expect(v.checkedAgainst).toEqual([])
  })
})

describe('todas las citas: lo que funda o enseña una cifra es la que la cita dice', () => {
  it('ningún `verificado` ni `contradicho`, ni expediente parecido, sobre una cifra fuera del literal', () => {
    const conCifra = CITAS.filter((c) => c.entities.amountEuros != null)
    const fuera = conCifra.filter((c) => !cifraEnElLiteral(c.verbatim, c.entities.amountEuros))
    // Que mida algo: hay citas con la cifra fuera del literal, y k4olcs-019 entre ellas.
    expect(fuera.length).toBeGreaterThan(10)
    expect(fuera.some((c) => c.id === 'k4olcs-019-cit-b9b013')).toBe(true)
    const malas = fuera
      .map((c) => ({ c, v: verifyClaim({ claim: c, ...DATOS }) }))
      .filter(
        ({ v }) =>
          v.verdict === 'verificado' ||
          v.verdict === 'contradicho' ||
          /cifra citada/.test(v.summary) ||
          v.evidence.some(
            (e) =>
              (e.kind === 'tender' || e.kind === 'bdns') && IMPRIME_IMPORTE.test(e.snippet ?? ''),
          ),
      )
      .map(({ c, v }) => `${c.id} ${v.verdict}: ${v.summary.slice(0, 80)}`)
    expect(malas).toEqual([])
  }, 60_000)

  it('ninguna cita sin su cifra en el literal dice haber cotejado subvenciones, que sólo se miran por la cifra', () => {
    const fuera = CITAS.filter(
      (c) =>
        c.entities.amountEuros != null && !cifraEnElLiteral(c.verbatim, c.entities.amountEuros),
    )
    // El control: con su cifra en el literal, el camino del importe sí las anota.
    const conCifra = verifyClaim({ claim: cita('k4olcs-018-afi-7abae5'), ...DATOS })
    expect(conCifra.checkedAgainst).toContain('bdns')
    const malas = fuera
      .map((c) => ({ c, v: verifyClaim({ claim: c, ...DATOS }) }))
      .filter(({ v }) => v.checkedAgainst.includes('bdns'))
      .map(({ c }) => c.id)
    expect(fuera.length).toBeGreaterThan(10)
    expect(malas).toEqual([])
  }, 60_000)
})

describe('lo servido, una vez re-verificado', () => {
  const TROZOS = join(ROOT, 'public/data/pleno-claims')
  const servidos = readdirSync(TROZOS)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .flatMap(
      (f) =>
        JSON.parse(readFileSync(join(TROZOS, f), 'utf8')).items as Array<{
          claim: PlenoClaim
          verification: { verdict: string; summary?: string; source?: string }
        }>,
    )

  it('ningún `verificado` automático se sirve sobre una cifra que su cita no dice', () => {
    // Lo positivo primero: se sirven `verificado`, y k4olcs-019 se sirve.
    expect(servidos.some((it) => it.verification.verdict === 'verificado')).toBe(true)
    expect(servidos.some((it) => it.claim.id === 'k4olcs-019-cit-b9b013')).toBe(true)
    const malos = servidos
      .filter(
        (it) =>
          it.verification.verdict === 'verificado' &&
          [resumenVerificado('tender'), resumenVerificado('bdns')].includes(
            it.verification.summary ?? '',
          ) &&
          !cifraEnElLiteral(it.claim.verbatim, it.claim.entities.amountEuros),
      )
      .map((it) => it.claim.id)
    expect(malos).toEqual([])
  })
})
