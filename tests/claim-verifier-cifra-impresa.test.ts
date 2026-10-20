import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { verifyClaim } from '../src/scraper/claim-verifier'
import { importeImpreso } from '../src/scraper/importe-de-contrato'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

/**
 * Un `verificado` automático cita un registro que IMPRIME la cifra declarada,
 * con el umbral de «prácticamente exacto» del verificador (un 1 %).
 *
 * El 19-10-2026, k4olcs-019-cit-b9b013 («sistema de debate, captura y grabación
 * de vídeo y control del salón de plenos municipales», 80.666 €) se publicaba
 * «Verificado» con una sola fila de evidencia: la LICITACIÓN del expediente
 * 32/2024, que imprime 70.158 € (su presupuesto base sin IVA). Los 80.666,66 €
 * dichos son el importe de adjudicación con IVA, y están en la fila de
 * `contracts` del mismo expediente, que el emparejador no eligió: compara un
 * solo importe por fila —el primero de `CAMPOS_DEL_EMPAREJADOR`, sin IVA— y la
 * licitación (70.157,72) se parecía más a 80.666 que la adjudicación sin IVA
 * (66.666,66). El lector veía «Verificado» encima de otra cifra.
 *
 * Es la regla que #405 pone a las subidas firmadas, en el verificador
 * automático: si el registro que imprime la cifra existe, es la evidencia; si
 * no, el veredicto sólo puede bajar.
 *
 * Las filas son las publicadas: la cita sale de pleno-claims-suggestions.json y
 * los registros de los ficheros servidos.
 */

const ROOT = join(__dirname, '..')
const leer = (p: string) => JSON.parse(readFileSync(join(ROOT, 'public/data', p), 'utf8'))

const DATOS = {
  tenders: leer('tenders.json'),
  tendersTed: leer('tenders-ted.json'),
  bdns: leer('bdns.json'),
  budget: leer('budget.json'),
  promises: leer('promises.json'),
}
const CITAS = (leer('pleno-claims-suggestions.json') as { items: PlenoClaim[] }).items

/** El 1 % del verificador, dicho como cociente: 0,99² ≈ 0,98. */
const dentroDelUnoPorCiento = (a: number, b: number) => Math.min(a, b) / Math.max(a, b) >= 0.99

describe('verificado · la evidencia imprime la cifra declarada', () => {
  it('k4olcs-019-cit-b9b013: cita la adjudicación de 80.666,66 €, no la licitación de 70.158 €', () => {
    const c = CITAS.find((x) => x.id === 'k4olcs-019-cit-b9b013')!
    expect(c.entities.amountEuros).toBe(80666)
    const v = verifyClaim({ claim: c, ...DATOS })
    expect(v.verdict).toBe('verificado')
    const filas = v.evidence.filter((e) => e.kind === 'tender')
    expect(filas).toHaveLength(1)
    const impreso = importeImpreso(filas[0].snippet)
    expect(impreso, filas[0].snippet).not.toBeNull()
    expect(dentroDelUnoPorCiento(impreso!, 80666), filas[0].snippet).toBe(true)
    // El mismo expediente: la fila de `contracts` de 32/2024.
    expect(filas[0].ref).toMatch(/qDjb9WdwTN3jHF5qKI4aaw/)
  })

  it('ninguna cita con cifra del corpus extraído sale verificada sobre otra cifra', () => {
    // Sobre TODAS las citas con importe, no una muestra: la regla es del
    // veredicto, y una fila que la rompa es una tarjeta publicable.
    const conCifra = CITAS.filter((c) => c.entities.amountEuros != null)
    expect(conCifra.length).toBeGreaterThan(100) // que mida algo
    let verificadas = 0
    const malas: string[] = []
    for (const c of conCifra) {
      const v = verifyClaim({ claim: c, ...DATOS })
      if (v.verdict !== 'verificado') continue
      verificadas += 1
      const dice = v.evidence.some((e) => {
        if (e.kind !== 'tender' && e.kind !== 'bdns') return false
        const n = importeImpreso(e.snippet)
        return n != null && dentroDelUnoPorCiento(n, c.entities.amountEuros!)
      })
      if (!dice) malas.push(c.id)
    }
    expect(verificadas).toBeGreaterThan(0)
    expect(malas).toEqual([])
    // Pasa por el verificador todas las citas con cifra del corpus extraído: ~9 s en la CI.
  }, 60_000)
})
