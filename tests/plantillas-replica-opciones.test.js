import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SPEAKER_GROUPS } from '../src/scraper/pleno-votes'
import { ALLOWED_PARTIES } from '../src/scraper/promises'
import { RESPONDENTES } from '../src/scraper/eficiencia-finding'
import { RESPONSE_BLOCS } from '../src/scraper/journalist'

/**
 * Lo que ofrece el desplegable de cada plantilla de réplica es lo que acepta el
 * CLI que la publica.
 *
 * EL FALLO, medido el 2026-09-27: la plantilla de hallazgos ofrecía «Otro», que
 * `finding-reply` rechaza siempre —el validador retiró el centinela—, y no
 * ofrecía EU-Podem, que sí acepta. La de promesas, igual contra
 * `ALLOWED_PARTIES`. Un grupo municipal con representación no podía elegirse a
 * sí mismo para replicar, y quien eligiera «Otro» se encontraba con «El
 * validador rechazó la réplica». La de informes y su CLI coincidían entre sí,
 * pero los dos habían copiado a mano `RESPONSE_BLOCS` y se habían quedado sin
 * EU-Podem, que el validador del informe publicado sí admite. Una lista copiada
 * es la que se queda atrás (regla 1 de DATA_INTEGRITY).
 *
 * Un YAML no puede importar el enum, así que aquí se compara con él. El CLI de
 * informes ya lo importa.
 */

/** Las opciones del desplegable `id` de una plantilla, leídas línea a línea. */
function opciones(plantilla, id) {
  const lineas = readFileSync(`.github/ISSUE_TEMPLATE/${plantilla}`, 'utf8').split('\n')
  const campo = lineas.findIndex((l) => l.trim() === `id: ${id}`)
  if (campo < 0) return []
  const inicio = lineas.findIndex((l, k) => k > campo && l.trim() === 'options:')
  const fuera = []
  for (let k = inicio + 1; inicio > 0 && k < lineas.length; k++) {
    const m = lineas[k].match(/^\s+- (.+)$/)
    if (!m) break
    fuera.push(m[1].trim().replace(/^['"]|['"]$/g, ''))
  }
  return fuera
}

const CASOS = [
  ['finding-response.yml', 'party', 'finding-reply', SPEAKER_GROUPS],
  ['promise-response.yml', 'party', 'reply', ALLOWED_PARTIES],
  ['journalist-report-response.yml', 'from', 'journalist-reply', RESPONSE_BLOCS],
  ['eficiencia-finding-response.yml', 'respondente', 'indicador-reply', RESPONDENTES],
]

describe('plantillas de réplica · el desplegable es el enum del CLI', () => {
  it.each(CASOS)('%s (%s) ofrece lo que acepta `%s`', (plantilla, id, _cli, acepta) => {
    const ofrece = opciones(plantilla, id)
    // Que haya leído algo: un campo renombrado dejaría la lista vacía, y una
    // lista vacía contra otra vacía también «coincide».
    expect(ofrece.length, `${plantilla}: no encuentro el desplegable «${id}»`).toBeGreaterThan(1)
    expect([...ofrece].sort()).toEqual([...acepta].sort())
  })
})
