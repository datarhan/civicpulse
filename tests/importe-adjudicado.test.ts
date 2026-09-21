/**
 * Una sola regla para «cuánto se adjudicó», porque había cinco y no coincidían.
 *
 * La pestaña «Tipos de contrato» de /presupuesto y el universo que publica el
 * mapa de esa misma tarjeta dan dos totales distintos. Medido el 2026-09-21
 * sobre los snapshots publicados:
 *
 *   contractTypeTotals()    124.349.688,09 €   711 filas
 *   universe.totalAmount    124.039.832,54 €   706 filas
 *   diferencia                  309.855,55 €     5 filas
 *
 * Las cinco son contratos FIRMADOS que no publican importe de adjudicación
 * —`finalAmountNoTaxes` y `finalAmount` vienen a cero, no ausentes— y sí
 * publican su presupuesto base de licitación. El raspador del mapa las excluye;
 * `contractAmount` caía al de licitación y las sumaba. Así que la tarjeta
 * rotulaba «adjudicado sin IVA» sobre 309.855,55 € que nadie adjudicó: son lo
 * que el ayuntamiento SACÓ a licitación, que es otra magnitud y además mayor.
 *
 * El comentario de `contractAmount` decía que la caída era «defensive (none do
 * today)». Llevaba al menos cinco filas siendo falso. Es la trampa de
 * CLAUDE.md una vez más: una rama que se declara imposible, no se mira, y
 * resulta que corre.
 *
 * ── Las cinco copias ────────────────────────────────────────────────────────
 *
 * Ninguna estaba mal escrita; el defecto es que eran cinco.
 *
 *   src/scraper/tender-geo.ts    `amountOf`           sólo adjudicación, EXCLUYE
 *   src/lib/tender-geo.js        `contractAmount`     cae a licitación
 *   src/lib/contract-status.js   `contractAmountEur`  otra precedencia, sin usar
 *   src/scraper/entities.ts      `amountOf`           copia de la segunda
 *   src/pages/Presupuesto.jsx    en línea, ×3         `??`, otra precedencia
 *
 * Las tres de Presupuesto.jsx son el denominador de «el 2,5 % del importe» y de
 * la banda de cuatro recuentos, en la MISMA página cuya tarjeta enseña el otro
 * total. Hoy dan la cifra buena por casualidad: `??` sólo cae cuando el campo
 * falta, y Gobierto lo manda a cero en vez de omitirlo. El día que lo omita,
 * saltan al importe de licitación y la tarjeta de al lado no. Una regla que
 * acierta por la forma que trae la fuente no es una regla.
 *
 * Y la quinta vivía en una PRUEBA: `i18n-dinero-adjudicado` reconstruía el
 * universo copiando la precedencia a mano, que es la regla 1 de
 * `docs/DATA_INTEGRITY.md` —«exporta el enum; nunca lo repitas en un test»—
 * cometida por la guarda escrita para el mismo defecto.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  isCommittedContract,
  importeAdjudicado,
  importeLicitacion,
  publicaImporteAdjudicado,
} from '../src/lib/contract-status'
import { contractTypeTotals, topContractors } from '../src/lib/tender-geo'

const contratos = JSON.parse(readFileSync('public/data/tenders.json', 'utf8')).contracts
const universo = JSON.parse(readFileSync('public/data/tender-geo.json', 'utf8')).universe

describe('importeAdjudicado · la regla, en un solo sitio', () => {
  it('prefiere el sin IVA, acepta el con IVA y no inventa el de licitación', () => {
    expect(importeAdjudicado({ finalAmountNoTaxes: 100, finalAmount: 121 })).toBe(100)
    expect(importeAdjudicado({ finalAmount: 121 })).toBe(121)
    expect(
      importeAdjudicado({ finalAmountNoTaxes: 0, finalAmount: 0, initialAmount: 999 }),
    ).toBeNull()
    expect(importeAdjudicado({ initialAmountNoTaxes: 81166.08 })).toBeNull()
  })

  it('sin adjudicación devuelve `null`, nunca cero: no se adjudicó por cero euros', () => {
    // Un cero se suma, se compara y se pinta como una cifra. `null` no: es la
    // regla 3 de DATA_INTEGRITY —«un centinela nunca es un valor»— aplicada al
    // hueco que dejó la fuente.
    expect(importeAdjudicado(null)).toBeNull()
    expect(importeAdjudicado({})).toBeNull()
    expect(importeAdjudicado({ finalAmountNoTaxes: -5 })).toBeNull()
    expect(publicaImporteAdjudicado({ finalAmountNoTaxes: 0, initialAmount: 999 })).toBe(false)
    expect(publicaImporteAdjudicado({ finalAmountNoTaxes: 12 })).toBe(true)
  })

  it('el importe de licitación se pide por su nombre, no cayendo desde el otro', () => {
    expect(importeLicitacion({ initialAmountNoTaxes: 81166.08, initialAmount: 98210.96 })).toBe(
      81166.08,
    )
    expect(importeLicitacion({ initialAmount: 98210.96 })).toBe(98210.96)
    expect(importeLicitacion({ finalAmountNoTaxes: 100 })).toBeNull()
  })
})

describe('los dos totales de /presupuesto son el mismo total', () => {
  it('hay filas firmadas que NO publican importe de adjudicación', () => {
    // La premisa, medida y no supuesta. Si un día la fuente publicara todas las
    // adjudicaciones, las dos afirmaciones de abajo pasarían sin comprobar
    // nada, que es la guarda verde por no ejecutarse. Entonces esto se pone
    // rojo y dice que el caso desapareció, en vez de callarse.
    const sinAdjudicar = contratos.filter(
      (c: object) => isCommittedContract(c) && !publicaImporteAdjudicado(c),
    )
    expect(
      sinAdjudicar.length,
      'ninguna fila firmada sin importe de adjudicación: ya no hay defecto que vigilar aquí',
    ).toBeGreaterThan(0)
    // Y publican el de licitación, que es de donde salía la cifra inventada.
    expect(sinAdjudicar.every((c: object) => importeLicitacion(c)! > 0)).toBe(true)
  })

  it('el desglose por tipos suma exactamente el universo que publica el mapa', () => {
    const { rows, total } = contractTypeTotals(contratos)
    expect(rows.length).toBeGreaterThan(0)
    const filas = rows.reduce((a: number, r: { count: number }) => a + r.count, 0)
    expect(filas, 'la pestaña cuenta otras filas que el universo del mapa').toBe(
      universo.totalContracts,
    )
    expect(total, 'la pestaña suma otros euros que el universo del mapa').toBeCloseTo(
      universo.totalAmount,
      2,
    )
  })

  it('el reparto por empresa se mide sobre esos mismos euros', () => {
    // `topContractors` recorta a quince, así que no se compara su suma con el
    // total: se comprueba que ninguna fila arrastre un importe de licitación.
    const conNombre = contratos.filter(
      (c: { assignee?: string }) => isCommittedContract(c) && c.assignee,
    )
    const esperado = conNombre.reduce((a: number, c: object) => a + (importeAdjudicado(c) ?? 0), 0)
    const medido = topContractors(conNombre, conNombre.length).reduce(
      (a: number, r: { amount: number }) => a + r.amount,
      0,
    )
    expect(medido).toBeCloseTo(esperado, 2)
  })
})

describe('nadie vuelve a escribir la precedencia a mano', () => {
  // Una guarda de FUENTE, no de comportamiento: las copias coincidían en el
  // número y por eso ninguna prueba de resultado las veía. Lo que hay que
  // impedir es que vuelva a haber dos sitios donde decirlo.
  const CONSUMIDORES = [
    'src/lib/tender-geo.js',
    'src/scraper/tender-geo.ts',
    'src/scraper/entities.ts',
    'src/pages/Presupuesto.jsx',
    'src/components/Presupuesto/ContractsExplorer.jsx',
  ]

  it('los consumidores importan la regla en vez de repetirla', () => {
    for (const fichero of CONSUMIDORES) {
      const fuente = readFileSync(fichero, 'utf8')
      expect(fuente, `${fichero} no menciona la regla`).toMatch(/importeAdjudicado/)
      expect(fuente, `${fichero} vuelve a escribir la caída al importe de licitación`).not.toMatch(
        /initialAmount(NoTaxes)?\s*(\?\?|>|\|\|)/,
      )
    }
  })

  it('la guarda del vocabulario tampoco la repite', () => {
    // Se escribió para este mismo defecto y llevaba dentro una sexta copia.
    const fuente = readFileSync('tests/i18n-dinero-adjudicado.test.ts', 'utf8')
    expect(fuente).toMatch(/importeAdjudicado/)
    expect(fuente).not.toMatch(/finalAmountNoTaxes\s*>\s*0/)
  })
})
