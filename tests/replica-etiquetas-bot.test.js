import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

import { ETIQUETAS_REPLICA } from '../bot/src/services/eventos-repo.ts'

/**
 * ¿Le llega al administrador cada derecho de réplica que se abre?
 *
 * El bot avisa por Telegram de las issues de réplica (bot/src/services/
 * eventos-repo.ts), y las reconoce por su ETIQUETA. Hasta el 2026-09-27 la
 * respuesta oficial a una queja (`queja-response.yml`) sólo llevaba
 * `queja-response`: su propio formulario la titula «Derecho de réplica» y le da
 * siete días de plazo, y el aviso no la veía. Las demás llevaban
 * `derecho-replica` más la suya, que es lo que las enruta a su ingesta.
 *
 * La lista de formularios se DERIVA del disco (`*-response.yml`), no se escribe
 * aquí: una lista a mano dentro de un control contra el olvido se olvida sola.
 */
const DIR = join(__dirname, '..', '.github', 'ISSUE_TEMPLATE')

const formularios = readdirSync(DIR)
  .filter((f) => /-response\.ya?ml$/.test(f))
  .map((f) => ({ nombre: f, doc: load(readFileSync(join(DIR, f), 'utf8')) }))

const etiquetasDe = (doc) =>
  (Array.isArray(doc?.labels) ? doc.labels : [doc?.labels])
    .filter(Boolean)
    .map((l) => String(l).toLowerCase())

describe('cada formulario de réplica lo avisa el bot', () => {
  // Si el patrón dejara de casar, lo de abajo aprobaría sin mirar nada.
  it('hay formularios de réplica que mirar', () => {
    expect(formularios.map((f) => f.nombre)).toContain('queja-response.yml')
    expect(formularios.length).toBeGreaterThanOrEqual(5)
  })

  it('el aviso reconoce alguna etiqueta', () => {
    expect(ETIQUETAS_REPLICA.length).toBeGreaterThan(0)
  })

  it('todos llevan una etiqueta que el aviso del bot reconoce', () => {
    const sinAviso = formularios
      .filter(({ doc }) => !etiquetasDe(doc).some((e) => ETIQUETAS_REPLICA.includes(e)))
      .map((f) => f.nombre)
    expect(
      sinAviso,
      'estas réplicas tienen plazo y el administrador no se entera de que llegan',
    ).toEqual([])
  })
})
