import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CONTRACT_STATUS, TENDER_STATUS } from '../src/scraper/tenders'
import { STATUS_LABEL, STATUS_TONE } from '../src/hooks/useTenders'
import { TONE_NAMES } from '../src/components/Primitives'

/**
 * La regla 1 de `docs/DATA_INTEGRITY.md`, sobreviviendo en la capa de rótulos.
 *
 * `src/scraper/tenders.ts` EXPORTA el vocabulario de estados; `useTenders.js` lo
 * rehacía a mano, y las dos listas se separaron. Medido sobre el snapshot
 * publicado el 24-08-2026: 413 de 1.234 filas pintaban su estado como un token
 * inglés crudo —`formalized` (316), `void` (56), `provisionally_awarded` (26),
 * `abandoned` (15)— y en el gris `ghost`, que es el del centinela.
 *
 * Lo caro es cuál: `formalized` significa FIRMADO, es el estado más
 * comprometido que hay, y se pintaba igual que «Sin clasificar». Y el mapa
 * seguía declarando `finalized`, la errata de una letra que `tenders.ts:7-14`
 * documenta como la que borró 53,5 M€ de la web.
 *
 * Ninguna prueba miraba este mapa. Ésta lo ata al enum por los dos extremos.
 */

const TODOS = [...new Set([...CONTRACT_STATUS, ...TENDER_STATUS])] as string[]

type Fila = { status?: string }
const snapshot = JSON.parse(readFileSync(resolve('public/data/tenders.json'), 'utf8')) as {
  contracts?: Fila[]
  tenders?: Fila[]
}
const FILAS: Fila[] = [...(snapshot.contracts ?? []), ...(snapshot.tenders ?? [])]

describe('el vocabulario de estados y sus rótulos no pueden separarse', () => {
  it('mide algo: el enum tiene estados y el snapshot filas', () => {
    // Sin esto, un enum vacío o un fichero vacío dejarían verde todo lo de
    // abajo sin haber comprobado nada — que es el defecto que persigue.
    expect(TODOS.length).toBeGreaterThan(5)
    expect(FILAS.length).toBeGreaterThan(100)
  })

  it('todo estado del enum tiene rótulo en castellano', () => {
    const sinRotulo = TODOS.filter((s) => !STATUS_LABEL[s] || !STATUS_LABEL[s].trim())
    expect(sinRotulo, `estados sin rótulo: ${sinRotulo.join(', ')}`).toEqual([])
  })

  it('todo estado del enum tiene un tono que Pill conoce', () => {
    const malos = TODOS.filter((s) => !TONE_NAMES.includes(STATUS_TONE[s]))
    expect(malos, `estados sin tono válido: ${malos.join(', ')}`).toEqual([])
  })

  it('y ningún rótulo sobra: una clave fuera del enum es una errata', () => {
    // La dirección que cobró los 53,5 M€: `finalized` escrito donde la fuente
    // dice `formalized`. Aquí `finalized` SÍ está en el enum, así que pasa; lo
    // que esta prueba impide es la PRÓXIMA errata.
    const huerfanas = Object.keys(STATUS_LABEL).filter((k) => !TODOS.includes(k))
    expect(
      huerfanas,
      `rótulos que no corresponden a ningún estado: ${huerfanas.join(', ')}`,
    ).toEqual([])
    expect(Object.keys(STATUS_TONE).sort()).toEqual(Object.keys(STATUS_LABEL).sort())
  })
})

describe('techo de reserva: sobre lo PUBLICADO, no sobre un fixture', () => {
  it('ninguna fila publicada pinta su estado en inglés', () => {
    const crudas = FILAS.filter((f) => !STATUS_LABEL[f.status ?? 'unknown'])
    const porEstado = [...new Set(crudas.map((f) => f.status))].join(', ')
    expect(
      crudas.length,
      `${crudas.length} de ${FILAS.length} filas caerían al token crudo: ${porEstado}`,
    ).toBe(0)
  })
})

describe('las dos erratas concretas que este defecto ya cobró', () => {
  it('`formalized` existe y NO se pinta como el centinela', () => {
    expect(STATUS_LABEL.formalized).toBeTruthy()
    // Firmado es el estado más comprometido que hay: no puede compartir el gris
    // de «Sin clasificar», que es lo que hacía cayendo al defecto de Pill.
    expect(STATUS_TONE.formalized).not.toBe('ghost')
    expect(STATUS_TONE.formalized).toBe(STATUS_TONE.awarded)
  })

  it('`formalized` y `finalized` no dicen lo mismo', () => {
    expect(STATUS_LABEL.formalized).not.toBe(STATUS_LABEL.finalized)
  })

  it('`abandoned` es el desistimiento, no `revoked`', () => {
    // Verificado contra la ficha de PLACSP de una fila `abandoned` el
    // 24-08-2026: «Resultado: Desistimiento». `revoked` llevaba «Desistido»
    // desde siempre, en la fila equivocada.
    expect(STATUS_LABEL.abandoned).toMatch(/desist/i)
    expect(STATUS_LABEL.revoked).not.toMatch(/desist/i)
  })
})
