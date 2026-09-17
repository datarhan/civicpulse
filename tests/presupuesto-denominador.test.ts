import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cascadaGastos } from '../src/scraper/presupuesto-lectura'
import { CATALOGUE } from '../src/i18n'

/**
 * El aviso del denominador no puede negar la infraejecución que sus propias
 * cifras enseñan.
 *
 * Decía: «No es que se ejecutara menos de lo previsto: es que durante el año se
 * previó mucho más». Medido sobre el listado publicado, las dos mitades de esa
 * frase no son alternativas: pasaron LAS DOS.
 *
 *   crédito inicial      37.599.838,15 €
 *   modificaciones       24.523.314,93 €
 *   crédito definitivo   62.123.153,08 €
 *   obligaciones recon.  18.909.465,12 €
 *
 *   ejecutado / definitivo = 30,4 %   ← el cociente que el aviso explica
 *   ejecutado / inicial    = 50,3 %   ← y de lo aprobado en enero quedó la mitad
 *
 * Con la mitad del crédito de enero sin ejecutar, «no es que se ejecutara menos
 * de lo previsto» es falso. Lo señaló la revisión lectora del 16-09-2026
 * —«el lector concluye que no hubo ninguna infraejecución real»— y el dato le da
 * la razón. Es la avería que este repositorio ya tiene escrita: una ficha de
 * hechos ENUMERA, no concluye.
 *
 * Las cifras se sacan del fichero con la función que usa la página, no se
 * recitan aquí: DATA_INTEGRITY §1.
 */
const ROOT = join(__dirname, '..')
const EJECUCION = JSON.parse(readFileSync(join(ROOT, 'public/data/budget-execution.json'), 'utf8'))

const periodo = EJECUCION.periods?.[EJECUCION.periods.length - 1]
const cascada = cascadaGastos(periodo?.gastos?.total)

const AVISO = {
  es: CATALOGUE.es['presupuesto.callout.denominador'],
  ca: CATALOGUE.ca['presupuesto.callout.denominador'],
}

describe('el aviso del denominador enumera, no concluye', () => {
  it('mide algo: el listado publicado trae modificaciones y no se ejecutó todo lo de enero', () => {
    // Sin modificaciones el aviso no se pinta (`c.modificaciones > 0 &&`), así
    // que sin esto la prueba vigilaría una frase que nadie lee. Y si de enero se
    // hubiera ejecutado todo, la frase vieja no habría sido falsa.
    expect(cascada, 'el listado no permite calcular la cascada').toBeTruthy()
    expect(cascada!.modificaciones).toBeGreaterThan(0)
    expect(cascada!.ejecutadoSobreInicialPct).toBeLessThan(100)
  })

  it('no niega la infraejecución, en ninguno de los dos idiomas', () => {
    expect(AVISO.es).not.toMatch(/no es que se ejecutara menos/i)
    expect(AVISO.ca).not.toMatch(/no és que s['’]executara menys/i)
  })

  it('sigue enseñando los dos cocientes, que es de lo que habla', () => {
    for (const texto of Object.values(AVISO)) {
      expect(texto).toContain('{pctDef}')
      expect(texto).toContain('{pctIni}')
    }
  })
})
