/**
 * La portada empareja 711 contratos con el dinero de 706.
 *
 * `stats.awardedContracts` cuenta los contratos COMPROMETIDOS y
 * `stats.awardedTotalEuros` suma los que publican importe de adjudicación. Son
 * dos conjuntos distintos por cinco filas, y las tres superficies de la portada
 * los pintan pegados:
 *
 *   KpiStrip      «124,0 M€ · 711»
 *   AlcaldeBox    «711 contratos acumulados 2017–2026 · 124,0 M€»
 *   FeedBlocks    «711 · 124,0 M€»
 *
 * Cada cifra por separado es cierta. El par no: «711 contratos que suman
 * 124,0 M€» deja fuera lo que se adjudicó en cinco contratos firmados cuyo
 * importe la fuente no publica — no cero, DESCONOCIDO.
 *
 * Es 0,25 % del dinero, y aun así es la misma familia que el «804 contratos ·
 * 68 M€» que ya se arregló una vez en esta página: un recuento y una suma que
 * describen conjuntos distintos, pegados como si describieran el mismo.
 *
 * Las tres superficies YA tienen este cuidado con el PERIODO —las tres derivan
 * `yearSpan` de exactamente las filas que cuentan, y las tres llevan un
 * comentario explicando por qué—. Esto es ese mismo cuidado aplicado al otro
 * eje. Y va en las tres a la vez: arreglar dos de tres es como este defecto
 * sobrevivió a dos rondas de revisión, según CLAUDE.md.
 *
 * El recuento se DERIVA de `contracts` en el cliente, como `yearSpan`, en vez
 * de añadir un campo a `tenders.json`: así no puede quedarse viejo respecto al
 * fichero que lo acompaña.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { isCommittedContract, comprometidosSinImporte } from '../src/lib/contract-status'
import { CATALOGUE, LOCALES } from '../src/i18n'

const tenders = JSON.parse(readFileSync('public/data/tenders.json', 'utf8'))

/** Las tres superficies de la portada que publican el par recuento + dinero. */
const SUPERFICIES = [
  'src/variants/direction-d/KpiStrip.jsx',
  'src/variants/direction-d/blocks/AlcaldeBox.jsx',
  'src/variants/direction-d/blocks/FeedBlocks.jsx',
]

describe('comprometidosSinImporte', () => {
  it('cuenta las filas firmadas cuyo importe de adjudicación no consta', () => {
    expect(
      comprometidosSinImporte([
        { status: 'formalized', assignee: 'A', finalAmountNoTaxes: 0, initialAmount: 100 },
        { status: 'awarded', assignee: 'B', finalAmountNoTaxes: 50 },
        { status: 'void', assignee: 'C', finalAmountNoTaxes: 0, initialAmount: 100 },
        { status: 'open', assignee: 'D' },
      ]),
    ).toBe(1)
  })

  it('sin filas no inventa un cero engañoso: cuenta cero porque no hay nada', () => {
    expect(comprometidosSinImporte([])).toBe(0)
    expect(comprometidosSinImporte(null)).toBe(0)
  })
})

describe('la portada no empareja un recuento con el dinero de otro conjunto', () => {
  it('premisa: el par publicado describe DOS conjuntos distintos', () => {
    // Medida, no supuesta. Si la fuente pasara a publicar todos los importes,
    // el par volvería a describir un solo conjunto y esta guarda dejaría de
    // tener caso — y lo diría, en vez de pasar en verde sin comprobar nada.
    const comprometidos = tenders.contracts.filter((c: object) => isCommittedContract(c))
    const sinImporte = comprometidosSinImporte(tenders.contracts)
    expect(comprometidos.length).toBe(tenders.stats.awardedContracts)
    expect(
      sinImporte,
      'ya no hay filas firmadas sin importe: el par describe un solo conjunto',
    ).toBeGreaterThan(0)
  })

  it('las tres superficies lo dicen, y lo dicen con la misma clave', () => {
    for (const fichero of SUPERFICIES) {
      const fuente = readFileSync(fichero, 'utf8')
      expect(fuente, `${fichero} publica el par sin decir que falta un importe`).toMatch(
        /landing\.contratos\.sinImporte/,
      )
      expect(fuente, `${fichero} no deriva el recuento`).toMatch(/comprometidosSinImporte/)
    }
  })

  it('la salvedad existe en los dos idiomas y lleva su hueco', () => {
    for (const locale of LOCALES) {
      const texto = CATALOGUE[locale]?.['landing.contratos.sinImporte']
      expect(texto, `${locale} · falta la clave`).toBeTruthy()
      expect(texto, `${locale} · sin hueco para el número`).toMatch(/\{n\}/)
    }
  })
})
