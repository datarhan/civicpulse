/**
 * Un `.ts` o un `.js` corre en Node y no paga un DOM que no usa.
 *
 * El 01-11-2026 `npm test` cayó dos veces por el `timeout-minutes: 10` de su paso
 * en `e2e.yml`, sin una sola prueba roja, una en `main` y otra en una PR que sólo
 * cambiaba una frase. Cada uno de los 867 ficheros montaba happy-dom y cargaba
 * Testing Library, y 657 de los 671 `.ts`/`.js` no miran jamás un global de
 * navegador: medido con una trampa en cada uno, sobre la suite entera. Eso eran
 * de 300 a 590 s de trabajador por pasada, más que todo el fichero más lento.
 *
 * Quien sí necesita DOM en un `.ts`/`.js` lo declara en su primera línea con
 * `// @vitest-environment happy-dom`, como `tests/entorno-declarado.test.ts`.
 * El reparto vive en `vitest.config.ts`; esta prueba y sus dos hermanas fijan lo
 * que un lector de esa configuración no puede ver: que se aplica de verdad.
 */
import { describe, expect, it } from 'vitest'

describe('entorno de un .ts: Node', () => {
  it('no hay DOM', () => {
    expect(typeof document).toBe('undefined')
    expect(typeof window).toBe('undefined')
  })

  it('el `fetch` que se cubre es el de Node, el de los raspadores en producción', () => {
    expect(typeof fetch).toBe('function')
    expect(navigator.userAgent).toMatch(/^Node\.js/)
  })
})
