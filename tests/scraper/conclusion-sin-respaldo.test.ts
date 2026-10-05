import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CLASES_SIN_RESPALDO,
  conclusionSinRespaldo,
} from '../../src/scraper/conclusion-sin-respaldo'

/**
 * ¿Concluye el razonamiento del motor que ningún candidato respalda la
 * declaración?
 *
 * La re-derivación del 04-10-2026 (#233) dejó 52 retractaciones como «ya no la
 * retractaría». En 36, el razonamiento entero del modelo concluye que no hay
 * respaldo genuino, y aun así la extracción devolvió `parcial`: su prompt llama
 * `parcial` a lo «relacionado temáticamente». Las filas son de verdad, con la
 * lectura a mano de editorial/rederivacion-0410-52/INFORME.md
 * (tests/fixtures/motor-sin-respaldo_2026-10-04.json).
 */
const F = JSON.parse(
  readFileSync(resolve('tests/fixtures/motor-sin-respaldo_2026-10-04.json'), 'utf8'),
)
type Fila = { n: number; id: string; concluyeSinRespaldo: boolean; razonamiento: string }
const FILAS = F.filas as Fila[]

/** La única de las 36 que ninguna clase reconoce: «respaldo muy débil como mucho». */
const NO_RECONOCIDA = '1tgd1h4-264-cit-4fee56'

describe('conclusionSinRespaldo, contra las 52 leídas a mano', () => {
  it('reconoce las que concluyen sin respaldo, salvo la que se nombra', () => {
    const negativas = FILAS.filter((f) => f.concluyeSinRespaldo)
    expect(negativas).toHaveLength(36)
    const sinReconocer = negativas.filter((f) => !conclusionSinRespaldo(f.razonamiento))
    expect(sinReconocer.map((f) => f.id)).toEqual([NO_RECONOCIDA])
  })

  it('no dispara en ninguna de las 16 cuyo razonamiento ve algún respaldo', () => {
    const control = FILAS.filter((f) => !f.concluyeSinRespaldo)
    expect(control).toHaveLength(16)
    const disparadas = control
      .map((f) => [f.id, conclusionSinRespaldo(f.razonamiento)])
      .filter(([, c]) => c)
    expect(disparadas).toEqual([])
  })

  it('cada clase reconoce al menos una fila real: una clase que no caza nada es una regla sin medir', () => {
    for (const { nombre, patron } of CLASES_SIN_RESPALDO) {
      expect(
        FILAS.some((f) => patron.test(f.razonamiento)),
        nombre,
      ).toBe(true)
    }
  })

  it('una valoración acotada no es una conclusión negativa', () => {
    // 19gax3o-124-cit-452536 (02-08-2026): «…ofrece un respaldo débil-moderado…
    // por lo que no hay respaldo genuino fuerte», dicho de los demás candidatos.
    expect(
      conclusionSinRespaldo(
        'El candidato [5] ofrece un respaldo débil-moderado. Los demás candidatos no coinciden en entidad, fecha o tipo de suceso, por lo que no hay respaldo genuino fuerte.',
      ),
    ).toBeNull()
    // «no basta para verificar la afirmación completa» es un `parcial` (19gax3o-034).
    expect(
      conclusionSinRespaldo(
        'Conclusión: respaldo débil/parcial. El lugar coincide, así que es insuficiente para verificar la afirmación completa.',
      ),
    ).toBeNull()
  })
})
