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
 * Se fijan las cadenas que rotulan la CIFRA y también el nombre de la capa.
 * Al principio el nombre se dejó fuera —un rótulo de tema no es una afirmación
 * sobre un número— pero la capa se llamaba «Gasto situado» encima de una
 * tarjeta que decía «adjudicado acumulado», así que el mapa se contradecía
 * consigo mismo a dos centímetros de distancia. Si la cifra es adjudicado, la
 * capa que la pinta también.
 *
 * Aparte va una trampa que salió al renombrar: el deslizador de INCENDIOS
 * tomaba prestadas las etiquetas de reproducción de la capa del dinero, así
 * que quien usa lector de pantalla oía «línea de tiempo del gasto» sobre los
 * incendios forestales. Renombrar sin mirar eso lo habría empeorado —habría
 * dicho «de los contratos»— así que ahora son neutras y compartidas a
 * propósito, con `map.timeline.*`.
 *
 * Y la misma tarjeta otra vez, en /presupuesto, encontrada al revisar la
 * traducción de #38 (issue #62). Allí el mapa vive dentro de «¿A dónde va el
 * dinero en contratos?», cuya cifra se rotula «adjudicado sin IVA» — y aun así
 * la pestaña se llamaba «Tipos de gasto», las pestañas se anunciaban como
 * «Vistas del gasto» y el deslizador como «Línea de tiempo del gasto situado».
 * Se arregla en ESTE fichero, no en uno nuevo: dos guardas del mismo
 * vocabulario derivan, y la que nadie lee es la que se queda atrás.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CATALOGUE, LOCALES } from '../src/i18n'
import { isCommittedContract } from '../src/lib/contract-status'
import { contractAmount, contractTypeTotals } from '../src/lib/tender-geo'

/** La cifra, su cobertura, y el nombre de la capa que las pinta. */
const ROTULOS_DE_CIFRA = [
  'map.money.accum',
  'map.money.coverage',
  'map.layer.money',
  'map.money.title',
]

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

  it('el deslizador de incendios no toma prestada la etiqueta del dinero', () => {
    // Antes usaba `map.money.play`/`map.money.pause`, así que un lector de
    // pantalla oía «línea de tiempo del gasto» sobre la capa de incendios.
    // Invisible en pantalla y por eso duró: la etiqueta sólo existe para quien
    // no ve el botón.
    const slider = readFileSync('src/components/LiveCity/controls/IncendiosYearSlider.jsx', 'utf8')
    expect(slider).not.toMatch(/map\.money\./)
  })
})

/**
 * Los rótulos de la tarjeta de contratos de /presupuesto: la pestaña que se
 * lee, las dos etiquetas que sólo oye quien no ve la pantalla y el nombre del
 * mapa. Las `aria-*` entran a propósito: son invisibles, y por eso son donde
 * un rótulo equivocado dura más.
 */
const ROTULOS_DE_PRESUPUESTO = [
  'presupuesto.gasto.pestana.tipos',
  'presupuesto.gasto.pestanas.aria',
  'presupuesto.gasto.mapa.aria',
  'presupuesto.gasto.mapa.ariaVacio',
  'presupuesto.gasto.tiempo.aria',
]

describe('/presupuesto · la tarjeta de contratos, el mismo vocabulario', () => {
  it('lo que agrupa la pestaña de tipos son contratos comprometidos, no ejecución', () => {
    // La premisa, medida y no supuesta: el total de la pestaña se reconstruye
    // ENTERO desde el universo que la tarjeta rotula «adjudicado sin IVA», más
    // un resto que también se mide. No es un «se parece»: la diferencia son
    // exactamente los contratos comprometidos que no publican importe de
    // adjudicación, donde `contractAmount` cae al de licitación. Ni un euro del
    // desglose viene de ejecución presupuestaria, que es lo que hace falsa la
    // palabra «gasto». Si algún día entrara ejecución ahí, esto se cae antes
    // que el vocabulario.
    const contratos = JSON.parse(readFileSync('public/data/tenders.json', 'utf8')).contracts
    const universo = JSON.parse(readFileSync('public/data/tender-geo.json', 'utf8')).universe
    const { rows, total } = contractTypeTotals(contratos)
    expect(rows.length).toBeGreaterThan(0)

    const sinAdjudicacion = contratos.filter(
      (c: { finalAmountNoTaxes?: number; finalAmount?: number }) =>
        isCommittedContract(c) && !(c.finalAmountNoTaxes! > 0) && !(c.finalAmount! > 0),
    )
    const resto = sinAdjudicacion.reduce((a: number, c: object) => a + contractAmount(c), 0)
    expect(total).toBeCloseTo(universo.totalAmount + resto, 2)
  })

  it('ningún rótulo de la tarjeta usa la palabra de la ejecución', () => {
    for (const locale of LOCALES) {
      for (const clave of ROTULOS_DE_PRESUPUESTO) {
        const texto = CATALOGUE[locale]?.[clave]
        expect(texto, `${locale} · ${clave} no existe`).toBeTruthy()
        expect(texto, `${locale} · ${clave}`).not.toMatch(FAMILIA_GASTO)
        expect(texto, `${locale} · ${clave}`).toMatch(FAMILIA_ADJUDICADO)
      }
    }
  })

  it('la frase que remite a la pestaña la nombra por el catálogo, no a mano', () => {
    // El lede dice «el desglose completo está en «…»». Copiar ahí el rótulo en
    // vez de leer su clave deja la frase apuntando a una pestaña que ya no se
    // llama así, y nada lo nota.
    const fuente = readFileSync('src/components/Presupuesto/GastoDashboard.jsx', 'utf8')
    expect(fuente).toMatch(/pestana: t\('presupuesto\.gasto\.pestana\.tipos'\)/)
  })
})
