/**
 * Las citas de cada ficha publicada, leídas en valencià.
 *
 * `CitasDeLaFicha` pinta las citas de una ficha de hallazgo —numeradas, impresas o
 * retenidas— y la nota que explica sus marcas de procedencia y de contraste, en
 * /plenos/:id y en /hallazgos/:id. Hasta el 12-10-2026 todo lo que no era cita lo
 * escribía la página a mano en castellano, y la prueba valenciana de /plenos/:id lo
 * quitaba de su lectura. Ahora pasa por el catálogo (`findings.citas.*`).
 *
 * Aquella prueba lee una sesión con cada forma; ésta lee el componente sobre TODAS
 * las fichas publicadas, tal como las sirve el sitio —sin el literal de las
 * retenidas (`retenerLiterales`)— y en la variante de /hallazgos/:id, que no tiene
 * prueba valenciana propia: la pastilla del grupo con su color. Las citas son dato y
 * se pintan como se publican; el resto, en valencià no puede quedar en castellano.
 *
 * Y el castellano no se mueve: lo citan pruebas, descartes de la revisión lectora y
 * /metodologia. El rótulo del hueco, además, lo usan en castellano la bitácora y la
 * copia servida desde `ROTULO_CITA_RETENIDA`, y aquí se ata a su clave.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'

import { CitasDeLaFicha, codigoDeFicha } from '../../src/components/PlenoFindings'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { ROTULO_CITA_RETENIDA } from '../../src/lib/cita-retenida'
import { provenanceFor } from '../../src/hooks/useFindingQuoteProvenance'
import { retenerLiterales } from '../../src/scraper/literales-retenidos'
import { detectorDeCastellano, lectura, masLargasPrimero } from '../setup/castellano'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const PROV = lee('finding-quote-provenance.json')
const SERVIDA = retenerLiterales(lee('pleno-findings.json'), PROV).snapshot
const FICHAS = SERVIDA.items.filter((f) => (f.quotes ?? []).length > 0)

function pinta(f, idioma) {
  localStorage.setItem('cp:lang', idioma)
  const { container, unmount } = render(
    <LocaleProvider>
      <CitasDeLaFicha
        quotes={f.quotes}
        prov={provenanceFor(PROV, f.id)}
        curatorName={f.curatorName}
        colorDeGrupo
        ficha={codigoDeFicha(f.id)}
      />
    </LocaleProvider>,
  )
  const leido = { piezas: lectura(container), citas: container.querySelectorAll('ol > li').length }
  unmount()
  return leido
}

/**
 * Lo que es dato en estas listas: el texto de cada cita, el grupo al que se
 * atribuye, quién editó la ficha y su código.
 */
const NO_SE_TRADUCE = masLargasPrimero(
  FICHAS.flatMap((f) => [
    ...f.quotes.flatMap((q) => [q.text, q.speakerGroup]),
    f.curatorName,
    codigoDeFicha(f.id),
  ]),
)

afterEach(() => localStorage.clear())

describe('las citas de una ficha, en valencià', () => {
  it('el rótulo del hueco del catálogo castellano es `ROTULO_CITA_RETENIDA`', () => {
    expect(CATALOGUE.es['findings.citas.retenida.rotulo']).toBe(ROTULO_CITA_RETENIDA)
    expect(CATALOGUE.ca['findings.citas.retenida.rotulo']).not.toBe(ROTULO_CITA_RETENIDA)
  })

  it('cada ficha publicada, sin castellano fuera de las citas', () => {
    expect(FICHAS.length, 'fichas con citas').toBeGreaterThan(20)
    const { castellanoEn, sinTraducir } = detectorDeCastellano(NO_SE_TRADUCE)
    const castellano = []
    const iguales = []
    let citas = 0
    for (const f of FICHAS) {
      const es = pinta(f, 'es')
      const ca = pinta(f, 'ca')
      citas += ca.citas
      expect(ca.citas, `${f.id}: las mismas citas en los dos idiomas`).toBe(es.citas)
      expect(ca.piezas.length, `${f.id}: las mismas piezas en los dos idiomas`).toBe(
        es.piezas.length,
      )
      for (const p of ca.piezas)
        for (const palabra of castellanoEn(p))
          castellano.push(`${f.id}: «${palabra}» en «${p.slice(0, 100)}»`)
      // Pieza a pieza, lo que se lee igual sin ser dato: una cadena valenciana
      // copiada del castellano. Las compuestas, trozo a trozo.
      const pares = es.piezas.flatMap((p, i) =>
        p === ca.piezas[i] ? p.split(' · ').map((t) => [t, t]) : [[p, ca.piezas[i]]],
      )
      iguales.push(...sinTraducir(pares).map((s) => `${f.id}: «${s.slice(0, 100)}»`))
    }
    expect(citas, 'citas leídas').toBeGreaterThan(FICHAS.length)
    expect.soft([...new Set(castellano)], 'castellano dentro del valencià').toEqual([])
    expect.soft([...new Set(iguales)], 'se lee igual en castellano y en valencià').toEqual([])
  })
})
