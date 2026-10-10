import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClaimLedger } from '../src/components/ClaimLedger'
import { evidenciaDelRegistro, subirVeredicto } from '../src/scraper/subida-firmada'
import { mergeVerified } from '../src/scraper/verified-merge'
import { gateItemsForPublic } from '../src/scraper/claim-public-gate'

/**
 * La tarjeta de una subida que cita un punto del orden del día: la fila se rotula
 * como lo que es —un orden del día, no un contrato— y enlaza a la sesión; la
 * línea de fuentes nombra el corpus de los órdenes del día. La fila se hace por
 * el camino real: el registro, la subida, la composición y la puerta.
 */

const PERSONA = 'María de la Fuente Llorens'
const AGENDAS = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/plenos-agendas_2026-10-10.json'), 'utf8'),
)
const RX4HB4 =
  'https://regmeet.com/aytoribarroja/participaciones/c5b270a763686e776039618cc709f3a6?idioma=castellano'
const ID = '1sqj7is-081-cit-50c5bb'
const RESUMEN =
  'El orden del día de la sesión del 9 de febrero de 2026 llevó, en su punto 2, la información pública de la versión inicial del PRI de la UE Santa Rosa 2.'

const CLAIM = {
  id: ID,
  plenoId: '1sqj7is',
  plenoDate: '2026-03-09',
  segmentIndex: 81,
  type: 'cita_obra',
  speakerGroup: null,
  verbatim: 'ya comenté en el pleno pasado que trajimos Santa Rosa 2',
  context: '…ya comenté en el pleno pasado que trajimos Santa Rosa 2…',
  topic: 'urbanismo',
  entities: {},
  confidence: 0.9,
  reasoning: 'Cita una actuación concreta.',
  requiresHumanApproval: true,
}

function servida() {
  const fila = evidenciaDelRegistro(
    { enlace: RX4HB4, lote: null, punto: 2 },
    { tenders: null, bdns: null, agendas: AGENDAS },
  )
  const overlay = subirVeredicto(
    { version: 1, generatedAt: '2026-10-10T00:00:00.000Z', entries: {} },
    { claimId: ID, veredicto: 'verificado', evidencia: [fila], resumen: RESUMEN, editor: PERSONA },
    { tipo: 'cita_obra', publicado: 'sin-datos', resumenesDeMaquina: [] },
    '2026-10-10T09:00:00.000Z',
  )
  const base = {
    claimId: ID,
    verdict: 'sin-datos',
    summary: 'Un «sin datos» no es un desmentido: la afirmación puede ser cierta.',
    evidence: [],
    checkedAgainst: [],
  }
  const [it0] = gateItemsForPublic(mergeVerified([{ claim: CLAIM, verification: base }], overlay))
  return it0
}

/** El texto de la línea que empieza por `rotulo`, sin el rótulo. */
function linea(rotulo) {
  const empieza = (el) => el?.textContent?.startsWith(rotulo) ?? false
  const el = screen.getByText((_, e) => empieza(e) && ![...(e?.children ?? [])].some(empieza), {
    selector: 'div, span, p',
  })
  return el.textContent.slice(rotulo.length).trim()
}

describe('la tarjeta de una subida que cita un orden del día', () => {
  it('rotula la fila como orden del día, enlazada a la sesión, y nombra su corpus', () => {
    const it0 = servida()
    expect(it0.visibility).toBe('shown')
    const { container } = render(
      <MemoryRouter>
        <ClaimLedger items={[it0]} />
      </MemoryRouter>,
    )
    expect(linea('Fuentes comprobadas:')).toBe('plenos-agendas')
    expect(linea('Veredicto:')).toBe(`subido por una persona · firmado por ${PERSONA}`)
    const enlace = container.querySelector(`a[href="${RX4HB4}"]`)
    expect(enlace, 'la fila no enlaza a la sesión').not.toBeNull()
    expect(enlace.textContent).toMatch(/^ORDEN DEL DÍA/)
    expect(enlace.textContent).toContain('punto 2: Expedient: 5543/2020/GEN')
  })
})
