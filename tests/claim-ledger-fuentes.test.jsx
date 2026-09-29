import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'
import { CORPUS_IDS, PASADAS } from '../src/scraper/claim-verdicts'

/**
 * «Fuentes comprobadas» nombra corpus de datos, no la pasada que dio el
 * veredicto.
 *
 * `checkedAgainst` mezcla dos cosas (claim-verdicts.ts, «Procedencia»): los
 * corpus contra los que se cotejó la afirmación —tenders, bdns, budget…— y las
 * MARCAS DE PASADA que dicen cómo se llegó al veredicto —verdict-engine,
 * curator-downgrade…—. La tarjeta de `ClaimLedger` (en /plenos/:id y
 * /departamentos/:slug) imprimía el array tal cual. Medido el 2026-09-29 sobre
 * los trozos servidos: 920 tarjetas de 4.964 presentaban una marca de pasada
 * como si fuera una fuente consultada — 878 «verdict-engine» y 42
 * «curator-downgrade», entre ellas la de La Malla en /plenos/19gax3o, que es un
 * «parcial» firmado por un curador.
 *
 * /declaraciones ya lo hacía bien: rotula con `etiquetaVerificador` quién dio
 * el veredicto. Las dos superficies tienen que decir lo mismo de la misma
 * afirmación, así que aquí se comprueba con los rótulos de ese módulo.
 *
 * Los ítems copian la forma servida (claim completo, `visibility`, y el
 * `source` que #164 lleva a la verificación): una forma recortada es cómo una
 * prueba sigue verde mientras la página real hace otra cosa.
 */

beforeEach(() => {
  // El hook interno sigue corriendo aunque se pasen `items`: se le sirve un
  // manifiesto vacío para que su fetch resuelva sin ruido.
  installFetchMock({
    '/data/pleno-claims/index.json': { plenos: [], totals: { items: 0, byVerdict: {} } },
  })
})

const ROTULO = 'Fuentes comprobadas:'

function item({ verdict, checkedAgainst, source, evidence = [], type = 'afirmacion_numerica' }) {
  const id = `p1-001-afi-${checkedAgainst.join('-') || 'vacio'}`
  // `source` va cuando lo lleva el servido (#164): la verificación del overlay.
  return {
    claim: {
      id,
      plenoId: 'p1',
      plenoDate: '2026-01-19',
      segmentIndex: 1,
      type,
      speakerGroup: null,
      verbatim: 'el complejo se presupuestó en el año 2006',
      context: '…el complejo se presupuestó en el año 2006…',
      topic: 'urbanismo',
      entities: { date: '2006-01-01', referencedEntity: 'complejo' },
      confidence: 0.84,
      reasoning: 'Afirma una obra concreta y una fecha.',
      requiresHumanApproval: true,
    },
    verification: {
      claimId: id,
      verdict,
      summary: 'Resumen neutro de la verificación.',
      evidence,
      checkedAgainst,
      ...(source ? { source } : {}),
    },
    visibility: verdict === 'sin-datos' ? 'toggle' : 'shown',
  }
}

/** Una tarjeta sola: el contenedor entero ES la tarjeta. */
function pintar(it) {
  return render(
    <MemoryRouter>
      <ClaimLedger items={[it]} />
    </MemoryRouter>,
  )
}

/** Lo que la línea lista como fuentes, ya sin el rótulo. */
function fuentesListadas() {
  // El elemento más interior que empieza por el rótulo: si la línea se parte
  // en trozos, sus padres también «empiezan por» él. getByText revienta si no
  // hay ninguno, así que la prueba no puede pasar sin haberla leído.
  const empieza = (el) => el?.textContent?.startsWith(ROTULO) ?? false
  const linea = screen.getByText(
    (_, el) => empieza(el) && ![...(el?.children ?? [])].some(empieza),
    { selector: 'div, span, p' },
  )
  const texto = linea.textContent.slice(ROTULO.length).trim()
  return { texto, fuentes: texto.split(' · ').map((s) => s.trim()) }
}

describe('ClaimLedger · «Fuentes comprobadas» lista corpus, no pasadas', () => {
  for (const pasada of PASADAS) {
    it(`«${pasada}» no sale como fuente; el corpus real sí`, () => {
      pintar(item({ verdict: 'sin-datos', checkedAgainst: ['tenders', pasada] }))
      const { fuentes } = fuentesListadas()
      // Lo positivo primero: sin esto, una línea que no listara nada pasaría
      // la negativa sin haber mirado.
      expect(fuentes).toContain('tenders')
      expect(fuentes, `la marca ${pasada} listada como fuente`).not.toContain(pasada)
    })
  }

  it('todo corpus declarado se lista', () => {
    // Contra el enum exportado, no contra una copia: una lista blanca
    // recitada en la tarjeta a la que le faltara uno lo callaría sin ruido.
    for (const corpus of CORPUS_IDS) {
      const { unmount } = pintar(item({ verdict: 'sin-datos', checkedAgainst: [corpus] }))
      expect(fuentesListadas().fuentes, corpus).toEqual([corpus])
      unmount()
    }
  })

  it('los corpus de verdad salen todos y en su orden', () => {
    pintar(
      item({ verdict: 'sin-datos', checkedAgainst: ['tenders', 'tenders-ted', 'bdns', 'budget'] }),
    )
    expect(fuentesListadas().fuentes).toEqual(['tenders', 'tenders-ted', 'bdns', 'budget'])
  })
})

describe('ClaimLedger · sin corpus real, «ninguna» y «no constan» no son lo mismo', () => {
  it('con sólo una marca de pasada: «no constan», nunca «ninguna»', () => {
    // La pasada SUSTITUYÓ la lista de corpus: no sabemos cuáles se miraron,
    // no que no se mirara ninguno. De los 878 resúmenes del motor servidos el
    // 2026-09-29, 871 cuentan los contratos o subvenciones que examinó, y las
    // cinco bajadas a «parcial» enseñan una fila CONTRATO: «ninguna» debajo
    // contradiría la propia tarjeta. Es la regla nº3 de DATA_INTEGRITY — un
    // centinela no es un valor.
    //
    // Un nombre que no está declarado ni como corpus ni como pasada cae aquí
    // también: algo se anotó, pero no sabemos qué; ni se lista como fuente
    // (lista blanca, claim-verdicts.ts) ni se lee como «ninguna».
    for (const checkedAgainst of [['verdict-engine'], ['curator-downgrade'], ['corpus-nuevo']]) {
      const { unmount } = pintar(item({ verdict: 'sin-datos', checkedAgainst }))
      expect(fuentesListadas().texto, JSON.stringify(checkedAgainst)).toBe('no constan')
      unmount()
    }
  })

  it('sin nada anotado: «ninguna», que es lo que /declaraciones cuenta como sin corpus', () => {
    pintar(item({ verdict: 'sin-datos', checkedAgainst: [] }))
    expect(fuentesListadas().texto).toBe('ninguna')
  })
})

describe('ClaimLedger · dice quién dio el veredicto, como /declaraciones', () => {
  it('la bajada de curador (forma de La Malla): lo dice, y la marca no aparece', () => {
    const { container } = pintar(
      item({
        verdict: 'parcial',
        type: 'cita_obra',
        checkedAgainst: ['curator-downgrade'],
        source: 'curator-downgrade',
        evidence: [
          {
            kind: 'tender',
            ref: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=x',
            snippet: 'Servicio mantenimiento instalaciones en complejo deportivo.',
            similarity: 1,
          },
        ],
      }),
    )
    expect(container.textContent).toContain('corregido por un curador')
    expect(container.textContent).not.toContain('curator-downgrade')
  })

  it('la pasada del motor: «verificador LLM», y la marca no aparece', () => {
    const { container } = pintar(
      item({ verdict: 'sin-datos', checkedAgainst: ['verdict-engine'], source: 'verdict-engine' }),
    )
    expect(container.textContent).toContain('verificador LLM')
    expect(container.textContent).not.toContain('verdict-engine')
  })

  it('el cotejo determinista lo dice', () => {
    const { container } = pintar(
      item({ verdict: 'sin-datos', checkedAgainst: ['tenders', 'tenders-ted'] }),
    )
    expect(container.textContent).toContain('verificador determinista')
  })

  it('sin nada anotado lo dice, y no se inventa verificador', () => {
    const { container } = pintar(item({ verdict: 'sin-datos', checkedAgainst: [] }))
    expect(container.textContent).toContain('sin verificador anotado')
    expect(container.textContent).not.toMatch(/determinista|LLM|curador/)
  })
})
