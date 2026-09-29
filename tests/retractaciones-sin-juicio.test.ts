import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { RETRACTACIONES_SIN_JUICIO } from '../src/scraper/retractaciones-sin-juicio'
import { RESUMEN_SIN_REGISTRO } from '../src/scraper/claim-verifier'

/**
 * La lista de retractaciones que el motor escribió sin que el modelo viera la
 * declaración se midió contra la caché LLM del checkout principal, que no está
 * en el repositorio. Lo que sí se puede comprobar aquí es que cada id declarado
 * existe y que, mientras su entrada siga como se midió, tiene la forma de una
 * verificación que no pasó por el modelo: la frase del determinista, sin
 * evidencia y sin `derivedBy`. Una id mal copiada, o una que señalara una
 * retractación con razonamiento del modelo, no pasa. Una de las que el modelo
 * juzgó y que guardaron la misma frase SÍ pasaría: eso sólo lo separa la caché,
 * y por eso la lista cuenta cómo se midió.
 *
 * La lista se queda después de devolverlas: es el registro de qué se devolvió
 * y por qué. `retirar-pasada -- --sin-juicio` se salta lo que ya no está.
 */
const overlay = JSON.parse(readFileSync('public/data/pleno-claims-overlay.json', 'utf8'))
const publicadas = new Set(
  JSON.parse(readFileSync('public/data/pleno-claims-verified.json', 'utf8')).items.map(
    (it: { claim: { id: string } }) => it.claim.id,
  ),
)
const declaradas = Object.entries(RETRACTACIONES_SIN_JUICIO)

describe('RETRACTACIONES_SIN_JUICIO', () => {
  it('cada id declarado es una declaración del corpus publicado', () => {
    for (const [id] of declaradas) expect(publicadas.has(id), id).toBe(true)
  })

  it('mientras la entrada siga como se midió, es la verificación del determinista', () => {
    const pendientes = declaradas.filter(
      ([id, m]) =>
        overlay.entries[id]?.source === 'verdict-engine' &&
        overlay.entries[id].editor === m.editor &&
        overlay.entries[id].appliedAt === m.appliedAt,
    )
    for (const [id] of pendientes) {
      const v = overlay.entries[id].verification
      expect(v.verdict, id).toBe('sin-datos')
      expect(v.summary, id).toBe(RESUMEN_SIN_REGISTRO)
      expect(v.evidence, id).toEqual([])
      expect(v.derivedBy, id).toBeUndefined()
    }
  })
})
