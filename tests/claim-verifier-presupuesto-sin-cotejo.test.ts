import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { verifyClaim } from '../src/scraper/claim-verifier'
import { corpusReales } from '../src/scraper/claim-verdicts'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

/**
 * El presupuesto no se coteja, y la verificación no puede decir que sí.
 *
 * La revisión lectora del 26-10-2026 señaló en /plenos/1sqj7is una tarjeta
 * `sin-datos` —«en un presupuesto de cuarenta y pico millones»— cuya
 * explicación decía «No se encontró registro en contratos, contratos anunciados
 * en TED, subvenciones (BDNS) y presupuesto que la sostenga», cuando el
 * presupuesto de 2025 abre con un crédito inicial de gasto de 41.578.252 €.
 *
 * El cotejo con el presupuesto no se había hecho nunca. El bloque de
 * `verifyClaim` buscaba un capítulo por pistas del tema en `c.name`, y
 * `budget.json` rotula sus capítulos en `label` (src/scraper/budget.ts) desde
 * el adaptador del 19-04-2026, tres días antes que el verificador: ningún
 * capítulo casaba con ninguna pista. Anotaba `budget` de todos modos, antes de
 * buscar. Medido el 26-10-2026: 541 filas de pleno-claims-verified.json y 10 de
 * press-claims-verified.json listan `budget` y ninguna de las 8.042 trae una
 * fila de presupuesto. Es la regla nº1 de docs/DATA_INTEGRITY.md —las pruebas
 * copiaban la forma con `name`, la de producción dice `label`— y la nº2: un
 * comparador que no compara nada no puede figurar como consultado.
 *
 * Y repararlo leyendo `label` habría sido peor. Con las pistas del tema, una
 * afirmación fiscal se compara con el grupo «Deuda pública» (1.100.009,69 €) y
 * nunca con el total; medido sobre las mismas filas, 21 `sin-datos` subían a
 * `parcial` por decir «un millón» en un contexto fiscal, dos de ellas
 * acusaciones. Un veredicto automático sólo baja. El bloque se quitó, y aquí se
 * pasa por el verificador con el `budget.json` publicado, no con una forma
 * copiada.
 *
 * Las dos citas son las de la revisión, congeladas tal como las sirven sus
 * trozos (public/data/pleno-claims/1sqj7is.json y c8kr44.json): cuando la
 * tubería vuelva a verificar, lo servido dejará de listar `budget` y la premisa
 * ya no estaría ahí para leerla.
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

/** «en un presupuesto de cuarenta y pico millones» — /plenos/1sqj7is. */
const CUARENTA_Y_PICO: PlenoClaim = {
  id: '1sqj7is-028-afi-4ee50f',
  plenoId: '1sqj7is',
  plenoDate: '2026-03-09',
  segmentIndex: 28,
  type: 'afirmacion_numerica',
  speakerGroup: null,
  verbatim: 'en un presupuesto de cuarenta y pico millones',
  context:
    'a realidad que en un presupuesto de cuarenta y pico millones, que dura más de doscientos y cuarenta mil, no sé si ya hemos estado alguna vez, que es posible que venga alguna vez',
  topic: 'fiscal',
  entities: {
    amountEuros: 40000000,
    referencedEntity: 'presupuesto municipal riba-roja de túria',
  },
  confidence: 0.7,
  reasoning:
    'El orador cita el tamaño del presupuesto municipal para contextualizar el reconocimiento extrajudicial (punto 2 del orden del día). Contrastable contra budget.json / CONPREL MinHac.',
  requiresHumanApproval: true,
}

/** La retribución de 91,98 € de las ceremonias civiles — /plenos/c8kr44. */
const NOVENTA_Y_DOS: PlenoClaim = {
  id: 'c8kr44-008-afi-abc45b',
  plenoId: 'c8kr44',
  plenoDate: '2025-09-08',
  segmentIndex: 8,
  type: 'afirmacion_numerica',
  speakerGroup: null,
  verbatim:
    'se propone una retribución única de 91,98 euros por todo el proceso, es decir, tramitación y asistencia para el personal del ayuntamiento',
  context:
    'Uno de ellos es el que se refiere a la tramitación de los expedientes y asistencia en ceremonias civiles y se propone una retribución única de 91,98 euros por todo el proceso, es decir, tramitación y asistencia para el personal del ayuntamiento. Hasta la fecha había dos remuneracione',
  topic: 'empleo',
  entities: {
    amountEuros: 92,
    referencedEntity: 'manual de productividades y gratificaciones',
  },
  confidence: 1,
  reasoning:
    'La propuesta de establecer una retribución única de 91,98 euros para la tramitación y asistencia en ceremonias civiles es verificable en el expediente de modificación del manual de productividad (Expediente 2621/2025/GEN).',
  requiresHumanApproval: true,
}

/** Lo que una explicación diría del presupuesto, con el identificador o con su nombre. */
const NOMBRA_PRESUPUESTO = /\bbudget\b|presupuest/i

/** Lo que la frase dice haber mirado: lo que va entre «registro en» y «que la sostenga». */
const consultadoSegunLaFrase = (frase: string) =>
  frase.match(/registro en (.+?) que la sostenga/)?.[1] ?? ''

describe('verifyClaim · el presupuesto, que no se coteja', () => {
  it('la premisa: el presupuesto publicado sí trae un total de cuarenta y pico millones', () => {
    // Lo que la revisión vio. Si un día el fichero no lo trae, la prueba de
    // abajo no está midiendo la tarjeta que se señaló.
    const total = DATOS.budget.snapshot.totalExpense
    expect(total).toBeGreaterThan(40_000_000)
    expect(total).toBeLessThan(50_000_000)
  })

  for (const [nombre, claim] of [
    ['«cuarenta y pico millones» (1sqj7is)', CUARENTA_Y_PICO],
    ['la retribución de 92 € (c8kr44)', NOVENTA_Y_DOS],
  ] as const) {
    it(`${nombre}: nombra lo que miró y no el presupuesto`, () => {
      const v = verifyClaim({ claim, ...DATOS })
      // El veredicto no se mueve: un automático sólo baja, y aquí no hay nada
      // que lo baje.
      expect(v.verdict).toBe('sin-datos')
      // Lo positivo primero: los comparadores que sí corrieron siguen dichos.
      expect(corpusReales(v.checkedAgainst)).toEqual(['tenders', 'tenders-ted', 'bdns'])
      expect(v.summary).toMatch(/tenders/)
      // Y el que no compara nada, ni en la lista ni entre lo que la frase dice
      // haber mirado.
      expect(v.checkedAgainst).not.toContain('budget')
      expect(consultadoSegunLaFrase(v.summary)).not.toMatch(NOMBRA_PRESUPUESTO)
      expect(v.evidence.filter((e) => e.kind === 'budget')).toEqual([])
    })
  }

  it('«cuarenta y pico millones»: la frase dice que en el presupuesto no se buscó', () => {
    // La revisión lectora del 27-10-2026 sobre la misma tarjeta: nombrar sólo
    // contratos, TED y BDNS se leía como que nada sostiene la cifra, cuando la
    // fuente que la sostendría —el presupuesto, 41,58 M€ de crédito inicial en
    // 2025— no se miró (claim-verdicts.ts, `callaElPresupuesto`).
    const v = verifyClaim({ claim: CUARENTA_Y_PICO, ...DATOS })
    expect(v.summary).toBe(
      'No se encontró registro en tenders, tenders-ted y bdns que la sostenga. ' +
        'En el presupuesto municipal no se buscó. ' +
        'Un «sin datos» no es un desmentido: la afirmación puede ser cierta.',
    )
  })

  it('la retribución de 92 € (control): su cita no habla del presupuesto y la frase tampoco', () => {
    const v = verifyClaim({ claim: NOVENTA_Y_DOS, ...DATOS })
    expect(v.summary).not.toMatch(NOMBRA_PRESUPUESTO)
  })

  it('ninguna cita publicada lista el presupuesto ni saca de él una fila', () => {
    // Todas las citas extraídas, con el presupuesto publicado como único
    // corpus: con él solo, todo lo que el verificador anote es suyo.
    const { items } = leer('pleno-claims-suggestions.json') as { items: PlenoClaim[] }
    const llegan = items.filter(
      (c) =>
        c.entities.amountEuros != null &&
        (c.type === 'afirmacion_numerica' || c.type === 'cita_obra' || c.type === 'cita_convenio'),
    )
    // Que la prueba mida algo: cientos de citas llegan al bloque del importe,
    // que es donde se anotaba `budget`.
    expect(llegan.length).toBeGreaterThan(100)
    const conPresupuesto = items
      .map((claim) => verifyClaim({ claim, budget: DATOS.budget }))
      .filter(
        (v) => v.checkedAgainst.includes('budget') || v.evidence.some((e) => e.kind === 'budget'),
      )
      .map((v) => v.claimId)
    expect(conPresupuesto).toEqual([])
  })
})
