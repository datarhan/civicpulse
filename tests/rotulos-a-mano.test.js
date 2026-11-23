import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Rótulos escritos a mano en páginas que sí están traducidas: en valencià salían
 * en castellano, o como un sentinela que el lector no tiene con qué leer.
 * Cada uno tiene ya su clave en el catálogo; estas pruebas comprueban que la
 * página la usa.
 */
const fuente = (ruta) => readFileSync(ruta, 'utf8')

describe('rótulos que pasan por el catálogo', () => {
  it('/cargos/:slug no escribe «Alcalde» a mano', () => {
    const s = fuente('src/pages/CargoDetalle.jsx')
    expect(s).not.toMatch(/>\s*Alcalde\s*</)
    expect(s).not.toMatch(/['"`]Alcalde['"`]/)
    expect(s).toContain("'cargos.card.alcalde'")
    expect(s).toContain("'cargos.card.alcaldesa'")
  })

  it('/hallazgos no rotula el chip de grupo con el sentinela', () => {
    const s = fuente('src/pages/Hallazgos.jsx')
    expect(s).not.toMatch(/label=\{\s*g\s*\}/)
    expect(s).toContain('rotuloDeGrupo(')
  })

  /**
   * `rotuloDeGrupo` lee `findings.citas.sinAtribuir` porque es la clave con que
   * la ficha imprime una cita sin grupo. Si la ficha cambiara de clave, el chip
   * y la cita dirían dos cosas y la prueba del rótulo seguiría en verde.
   */
  it('la ficha imprime la cita sin grupo con la clave que usa el chip', () => {
    expect(fuente('src/components/PlenoFindings.jsx')).toMatch(
      /attribution=\{attribution \?\? t\('findings\.citas\.sinAtribuir'\)\}/,
    )
    expect(fuente('src/lib/hallazgos-filtros.js')).toContain("t('findings.citas.sinAtribuir')")
  })

  it('/cambios no arma sus líneas con las tablas en castellano', () => {
    const hook = fuente('src/hooks/useCambios.js')
    for (const tabla of ['STATE_LABEL', 'CATEGORY_LABEL', 'KIND_LABEL[']) {
      expect(hook, tabla).not.toContain(tabla)
    }
    expect(hook).not.toMatch(/shareText: `(Queja|Contrato|Subvención)/)
    const pagina = fuente('src/pages/Cambios.jsx')
    expect(pagina).toContain('textoParaCompartir(')
    expect(pagina).toContain('subtituloDe(')
  })
})
