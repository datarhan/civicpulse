/**
 * «2 registros y 1 desglose retirados» lo escribía la tarjeta de /plenos
 * nombrando dos alcances a mano. Cuando el modelo ganó el tercero —retirar
 * sólo el plazo—, esa frase siguió contando tres retiradas mientras /datos, que
 * las suma todas, publicaba cuatro: el mismo fichero y dos cifras distintas en
 * dos páginas.
 *
 * La frase se construye ahora recorriendo los alcances que trae la instantánea.
 * Estas pruebas la fijan y, sobre todo, exigen que cada alcance del modelo
 * tenga rótulo propio: un alcance nuevo sin rótulo se publicaría por su clave.
 */
import { describe, expect, it } from 'vitest'

import { rotuloRetiradas } from '../src/lib/pleno-summary'
import { RETRACTION_SCOPES } from '../src/scraper/pleno-votes'

describe('rotuloRetiradas', () => {
  it('sin retiradas no hay frase, y un cero no es una retirada', () => {
    expect(rotuloRetiradas(null)).toBeNull()
    expect(rotuloRetiradas(undefined)).toBeNull()
    expect(rotuloRetiradas({})).toBeNull()
    expect(rotuloRetiradas(Object.fromEntries(RETRACTION_SCOPES.map((s) => [s, 0])))).toBeNull()
  })

  it('cada alcance del modelo tiene rótulo propio, en singular y en plural', () => {
    // Derivado del enum, no apuntado: si mañana hay un cuarto alcance sin
    // rótulo, su singular y su plural serían la misma palabra —su clave— y esto
    // se pone rojo. Es la comprobación que no existía cuando llegó `plazo`.
    for (const alcance of RETRACTION_SCOPES) {
      const uno = rotuloRetiradas({ [alcance]: 1 })
      const dos = rotuloRetiradas({ [alcance]: 2 })
      // El participio no se fija en masculino: los tres alcances de hoy lo son,
      // y uno femenino («atribución») necesitaría género en ROTULO_RETIRADA.
      // Lo que sí se exige aquí es que el número concuerde.
      expect(uno, alcance).toMatch(/^1 \S+ retirad[oa]$/)
      expect(dos, alcance).toMatch(/^2 \S+ retirad[oa]s$/)
      expect(uno.split(' ')[1], `${alcance}: singular y plural son la misma palabra`).not.toBe(
        dos.split(' ')[1],
      )
    }
  })

  it('enumera los alcances presentes, y sólo ésos', () => {
    expect(rotuloRetiradas({ record: 2, breakdown: 1, plazo: 1 })).toBe(
      '2 registros, 1 desglose y 1 plazo retirados',
    )
    expect(rotuloRetiradas({ record: 2, breakdown: 0, plazo: 1 })).toBe(
      '2 registros y 1 plazo retirados',
    )
  })

  it('una sola retirada va en singular, participio incluido', () => {
    expect(rotuloRetiradas({ plazo: 1 })).toBe('1 plazo retirado')
    expect(rotuloRetiradas({ record: 1 })).toBe('1 registro retirado')
  })
})
