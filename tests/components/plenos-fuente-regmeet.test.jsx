/**
 * La frase de la fuente en /plenos dice lo que la página hace, en los dos idiomas.
 *
 * Bajo la entradilla, /plenos decía «Cada sesión enlaza a su acta en regmeet.com,
 * el gestor del propio ayuntamiento.» Medido sobre una build de producción el
 * 26-10-2026: la página no tenía ni un enlace a regmeet (63 a /plenos/:id) y
 * /plenos/:id tampoco. El enlace por sesión se fue en 16dc0b4d, al aligerar el
 * índice, y la frase se quedó. Y aunque volviera, prometería otra cosa: el `link`
 * de `plenos.json` es la página de la sesión en regmeet («participaciones»), no el
 * PDF del acta. Es el rótulo que /departamentos retiró por lo mismo («Acta oficial
 * →» sobre un enlace que no lleva al acta; DepartamentoDetalle.jsx lo cuenta).
 *
 * Lo cierto es de dónde salen las dos cosas que el índice cuenta de cada sesión:
 * el orden del día y el resultado de cada votación los publica la página de la
 * sesión en regmeet (/metodologia: «publica el orden del día y el resultado»;
 * `plenos-agendas.json` y la procedencia `regmeet` de cada resultado en
 * `pleno-votes.json`). El desglose por grupos no sale de ahí, y la frase no lo dice.
 *
 * La página se pinta con las instantáneas publicadas. Las palabras esperadas están
 * escritas a mano, en los dos idiomas: son lo que esta prueba fija. Y si un día la
 * frase vuelve a prometer un enlace, la página tiene que tenerlo.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { CATALOGUE } from '../../src/i18n'
import Plenos from '../../src/pages/Plenos'
import { pintaYLee } from '../setup/pinta-y-lee'

const publicado = (ruta) => JSON.parse(readFileSync(resolve('public', `.${ruta}`), 'utf8'))

const MAPA = Object.fromEntries(
  [
    '/data/plenos.json',
    '/data/plenos-agendas.json',
    '/data/pleno-claims/index.json',
    '/data/pleno-votes.json',
    '/data/pleno-findings.json',
  ].map((r) => [r, publicado(r)]),
)

const ESPERADA = {
  es: 'El orden del día y el resultado de cada votación proceden de la página de la sesión en regmeet.com, el gestor del propio ayuntamiento.',
  ca: 'L’ordre del dia i el resultat de cada votació procedeixen de la pàgina de la sessió a regmeet.com, el gestor del mateix ajuntament.',
}

/** Lo que promete un enlace, en cualquiera de los dos idiomas. */
const PROMETE_ENLACE = /\benlaza|\benlla[çc]a|\benlace|\benlla[çc]/i

/**
 * La frase de la fuente es el párrafo del enlace «Cómo se procesa una sesión →»,
 * sin el texto del enlace. Se lee con los enlaces a regmeet de toda la página.
 */
const leeFuente = (idioma) => (container) => {
  const comoSeProcesa = CATALOGUE[idioma]['plenos.indice.comoSeProcesa']
  const enlace = [...container.querySelectorAll('a[href="/metodologia"]')].find(
    (a) => a.textContent === comoSeProcesa,
  )
  const frase = enlace
    ? enlace.parentElement.textContent.replace(comoSeProcesa, '').trim()
    : '(sin párrafo)'
  const regmeet = container.querySelectorAll('a[href*="regmeet"]').length
  return [frase, `regmeet:${regmeet}`]
}

const escenario = {
  nombre: 'el índice con lo publicado',
  fetch: MAPA,
  pinta: () => <Plenos />,
  listo: (c) =>
    c.querySelectorAll('.cp-plenos-fila').length === MAPA['/data/plenos.json'].items.length,
}

describe('la frase de la fuente en /plenos', () => {
  for (const idioma of ['es', 'ca']) {
    it(`dice de dónde sale lo que la página cuenta (${idioma})`, async () => {
      const { piezas } = await pintaYLee(escenario, idioma, { lee: leeFuente(idioma) })
      const [frase] = piezas
      expect(frase).toBe(ESPERADA[idioma])
    })

    it(`no promete un enlace que la página no tiene (${idioma})`, async () => {
      const { piezas } = await pintaYLee(escenario, idioma, { lee: leeFuente(idioma) })
      const [frase, regmeet] = piezas
      const enlaces = Number(regmeet.split(':')[1])
      if (PROMETE_ENLACE.test(frase)) expect(enlaces, frase).toBeGreaterThan(0)
      // Nombrar el acta sería el rótulo que /departamentos retiró: el `link` de
      // cada sesión lleva a su página en regmeet, no al PDF del acta.
      expect(frase).not.toMatch(/\bacta\b/i)
    })
  }
})
