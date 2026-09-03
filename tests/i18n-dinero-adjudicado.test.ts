/**
 * En la portada, «gasto» y «adjudicado» son dos cifras distintas, y la tarjeta
 * del mapa llamaba a la segunda con la palabra de la primera.
 *
 * El rótulo decía «gasto acumulado» sobre «2,2 M€ de 123,7 M€ (2017–2026)».
 * Esos 123,7 M€ son el importe ADJUDICADO —el propio `amountOf()` de
 * `tender-geo.ts` dice que se alinea con el titular «Importe de adjudicación»
 * de PLACSP— y no dinero desembolsado. A pocos cientos de píxeles, la misma
 * pantalla publica «presupuesto 2025 · 41,6 M€», que sí es ejecución anual. Un
 * lector que compara las dos concluye lo que no es, y el comentario de
 * `AlcaldeBox.jsx` ya lo decía con esas palabras antes de que esto se arreglara.
 *
 * Las otras tres superficies de la portada ya usaban el vocabulario correcto
 * —«Contratos adj. · acumulado» en `KpiStrip`, «contratos acumulados» en
 * `AlcaldeBox`, «Acumulado 2017–2026» en `FeedBlocks`—, así que la tarjeta del
 * mapa era la única discrepante. Lo señaló la revisión lectora nocturna el
 * 2026-08-30 y otra vez después; ninguna prueba podía verlo, porque el dato
 * estaba bien y la palabra mal.
 *
 * Lo que se fija aquí son las cadenas que rotulan una CIFRA. El nombre de la
 * capa («Gasto situado») es un rótulo de tema, no una afirmación sobre un
 * número, y se deja aparte a propósito.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CATALOGUE, LOCALES } from '../src/i18n'
import { isCommittedContract } from '../src/lib/contract-status'

/** Las cadenas de la tarjeta del dinero que describen una cifra. */
const ROTULOS_DE_CIFRA = ['map.money.accum', 'map.money.coverage']

/** Ejecución presupuestaria: en la portada esta palabra ya tiene dueño. */
const FAMILIA_GASTO = /gasto|despesa/i
/** Importe de adjudicación: contratos comprometidos. Los dos idiomas se
 *  nombran enteros porque no comparten raíz — «contratos» y «contractes» no
 *  tienen ningún prefijo común más allá de «contra». */
const FAMILIA_ADJUDICADO = /adjudicad|adjudicat|contrato|contracte/i

describe('portada · «gasto» no es «adjudicado»', () => {
  it('la cifra que rotulan es, de hecho, adjudicado y no gasto', () => {
    // La premisa del test, medida y no supuesta: si el universo del mapa
    // resulta reproducible sumando SÓLO contratos adjudicados, entonces
    // llamarlo «gasto» es falso, y este test tiene razón de existir. Si algún
    // día el universo pasara a incluir ejecución, esto se cae y hay que
    // repensar el vocabulario antes que la prueba.
    const contratos = JSON.parse(readFileSync('public/data/tenders.json', 'utf8')).contracts
    const universo = JSON.parse(readFileSync('public/data/tender-geo.json', 'utf8')).universe

    let suma = 0
    let n = 0
    for (const c of contratos) {
      if (!isCommittedContract(c)) continue
      const a =
        typeof c.finalAmountNoTaxes === 'number' && c.finalAmountNoTaxes > 0
          ? c.finalAmountNoTaxes
          : typeof c.finalAmount === 'number' && c.finalAmount > 0
            ? c.finalAmount
            : 0
      if (!a) continue
      suma += a
      n++
    }

    expect(n).toBe(universo.totalContracts)
    expect(suma).toBeCloseTo(universo.totalAmount, 2)
  })

  it('ningún rótulo de cifra del mapa usa la palabra de la ejecución', () => {
    // En los DOS idiomas: el catálogo cae al castellano cuando falta una clave,
    // así que arreglar sólo el español dejaría el valencià diciendo lo viejo
    // sin que nada se rompa.
    for (const locale of LOCALES) {
      for (const clave of ROTULOS_DE_CIFRA) {
        const texto = CATALOGUE[locale]?.[clave]
        expect(texto, `${locale} · ${clave} no existe`).toBeTruthy()
        expect(texto, `${locale} · ${clave}`).not.toMatch(FAMILIA_GASTO)
        expect(texto, `${locale} · ${clave}`).toMatch(FAMILIA_ADJUDICADO)
      }
    }
  })
})
