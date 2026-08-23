import { describe, it, expect } from 'vitest'
import { nombresVisibles } from '../src/scraper/competencias'
import { isPromiseFrozen } from '../src/hooks/usePromises'

/**
 * Una ventana electoral, tres lecturas del mismo campo.
 *
 * `frozenUntil` lo leen hoy tres sitios: `isPromiseFrozen`, que pone
 * `/promesas` en sólo lectura; el `now < new Date(...)` de
 * `set-promises-freeze.ts`, que decide si el CLI dice «ya estaba congelado»; y
 * `nombresVisibles`, que decide si `/eficiencia` y `/gestion` pintan el nombre
 * de un concejal junto a una cifra.
 *
 * Las tres tienen que contestar lo mismo TODOS los días, y sobre todo el del
 * límite. Este repositorio ya pagó una vez por dos definiciones de «por
 * debajo» que sólo discrepaban en el 50 exacto —la página contradiciéndose a
 * sí misma en un punto—; aquí el punto en discordia sería el día en que una
 * página vuelve a nombrar a alguien y la otra sigue congelada.
 *
 * Esto no es un test de `nombresVisibles`: es un test del acuerdo. Si mañana
 * alguien cambia una de las dos, esto se pone rojo antes de que la ventana
 * empiece a significar dos cosas.
 */

/** La tercera lectura, transcrita de scripts/set-promises-freeze.ts:50. */
const congeladoSegunCli = (frozenUntil: string | null, hoy: string) =>
  frozenUntil ? new Date(hoy) < new Date(frozenUntil) : false

/** Un rango de días alrededor del límite, más el propio límite. */
const DIAS = [
  '2026-08-20',
  '2026-08-21',
  '2026-08-22',
  '2026-08-23',
  '2026-08-24',
  '2026-08-25',
  '2027-06-09',
  '2027-06-10',
  '2027-06-11',
]

describe('la ventana LOREG significa lo mismo en sus tres lecturas', () => {
  it('mide algo: recorre días de verdad a ambos lados del límite', () => {
    expect(DIAS.length).toBeGreaterThan(5)
  })

  for (const limite of ['2026-08-23', '2027-06-10']) {
    for (const hoy of DIAS) {
      it(`frozenUntil ${limite}, hoy ${hoy}: las tres coinciden`, () => {
        const visible = nombresVisibles(limite, hoy)
        const congeladoHook = isPromiseFrozen({ frozenUntil: limite }, new Date(hoy))
        const congeladoCli = congeladoSegunCli(limite, hoy)

        expect(visible, 'nombresVisibles vs isPromiseFrozen').toBe(!congeladoHook)
        expect(visible, 'nombresVisibles vs el CLI').toBe(!congeladoCli)
      })
    }
  }

  it('sin congelación, las tres dejan ver', () => {
    for (const hoy of DIAS) {
      expect(nombresVisibles(null, hoy)).toBe(true)
      expect(isPromiseFrozen({ frozenUntil: null }, new Date(hoy))).toBe(false)
      expect(congeladoSegunCli(null, hoy)).toBe(false)
    }
  })
})
