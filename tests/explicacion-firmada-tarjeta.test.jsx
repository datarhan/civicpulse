import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClaimLedger } from '../src/components/ClaimLedger'
import { etiquetaVerificador } from '../src/lib/claim-provenance.js'
import { ROTULO_RESUMEN_RETIRADO } from '../src/lib/resumenes-retirados.js'
import { enmendarMotivoDeBajada, mergeVerified } from '../src/scraper/verified-merge'
import { gateItemsForPublic } from '../src/scraper/claim-public-gate'

/**
 * La tarjeta de una retractación del motor cuya explicación reescribió una
 * persona: imprime esa explicación y dice quién la firmó, y el veredicto sigue
 * siendo del motor.
 *
 * Antes de firmarla, la de 19gax3o-143 dice «Explicación retirada»: lo que el
 * motor guardó el 02-08-2026 era un parte sobre su tarea. La fila se hace por el
 * camino real —la enmienda, el overlay, la composición y la puerta—, no a mano.
 */

const PERSONA = 'María de la Fuente Llorens'
const ID = '19gax3o-143-cit-a3a7a1'
const DEL_MOTOR =
  'Task completed: provided skeptical fact-check reasoning in Spanish (2-4 sentences) concluding none of the four candidates (bar catering tenders and pool cleaning service tenders) genuinely support the claim about exterior investment addressing reported deficiencies at the C.D. La Mallá sports comple'
const EXPLICACION =
  'La transcripción vigente lo dice en futuro: el exterior «va a tener» una inversión de este gobierno, de un millón de euros, este año. Ningún registro cotejado es esa inversión: la pavimentación del paseo Pacadar entre el complejo y el pabellón se adjudicó en 2023 y 2024 (93.023,59 € y 50.260,40 €), y la reforma del edificio La Mallà licitada en 2026 no tiene contrato adjudicado.'

const CLAIM = {
  id: ID,
  plenoId: '19gax3o',
  plenoDate: '2026-01-19',
  segmentIndex: 143,
  type: 'cita_obra',
  speakerGroup: null,
  verbatim:
    'esa piscina, ese complexo esportivo de la Mallá que ha dicho todas las deficiencias que tenían',
  context: '…esa piscina, ese complexo esportivo de la Mallá…',
  topic: 'deportes',
  entities: {},
  confidence: 0.9,
  reasoning: 'Cita una obra concreta.',
  requiresHumanApproval: true,
}

const BASE = {
  claimId: ID,
  verdict: 'sin-datos',
  summary:
    'No se encontró registro en tenders y tenders-ted que la sostenga. Un «sin datos» no es un desmentido: la afirmación puede ser cierta.',
  evidence: [],
  checkedAgainst: ['tenders', 'tenders-ted'],
}

const OVERLAY = {
  version: 1,
  generatedAt: '2026-08-02T05:38:45.146Z',
  entries: {
    [ID]: {
      verification: {
        claimId: ID,
        verdict: 'sin-datos',
        summary: DEL_MOTOR,
        evidence: [],
        checkedAgainst: ['verdict-engine'],
        confidence: 0.2,
      },
      source: 'verdict-engine',
      reason: `verdict-engine (claude-code) re-judged parcial→sin-datos: ${DEL_MOTOR}`,
      editor: 'verdict-engine:claude-code',
      appliedAt: '2026-08-02T05:38:45.146Z',
    },
  },
}

function servida(overlay) {
  const servidos = gateItemsForPublic(
    mergeVerified([{ claim: CLAIM, verification: BASE }], overlay),
  )
  expect(servidos, 'la puerta pública no dejó pasar la fila').toHaveLength(1)
  return servidos[0]
}

const firmada = () =>
  enmendarMotivoDeBajada(
    OVERLAY,
    {
      claimId: ID,
      veredicto: 'sin-datos',
      motivo: EXPLICACION,
      porque:
        'La explicación publicada era un parte del modelo sobre su tarea; se escribe desde los registros cotejados.',
      editor: PERSONA,
    },
    '2026-10-10T09:00:00.000Z',
  ).overlay

/** El texto de la línea que empieza por `rotulo`, sin el rótulo. */
function linea(rotulo) {
  const empieza = (el) => el?.textContent?.startsWith(rotulo) ?? false
  const el = screen.getByText((_, e) => empieza(e) && ![...(e?.children ?? [])].some(empieza), {
    selector: 'div, span, p',
  })
  return el.textContent.slice(rotulo.length).trim()
}

const pintar = (it) =>
  render(
    <MemoryRouter>
      <ClaimLedger items={[it]} />
    </MemoryRouter>,
  )

describe('la tarjeta de una retractación con la explicación firmada', () => {
  it('antes de firmarla, dice que retiró la explicación del motor', () => {
    const { container } = pintar(servida(OVERLAY))
    expect(container.textContent).toContain(ROTULO_RESUMEN_RETIRADO)
    expect(linea('Veredicto:')).toBe('verificador LLM')
  })

  it('firmada, imprime la explicación y quién la firmó; el veredicto sigue siendo del motor', () => {
    const it0 = servida(firmada())
    expect(it0.verification.verdict).toBe('sin-datos')
    const { container } = pintar(it0)
    expect(container.textContent).toContain(EXPLICACION)
    expect(container.textContent).not.toContain(ROTULO_RESUMEN_RETIRADO)
    expect(linea('Veredicto:')).toBe(`verificador LLM · explicación firmada por ${PERSONA}`)
    // El motor no apuntó qué cotejó: la línea lo sigue diciendo.
    expect(linea('Fuentes comprobadas:')).toBe('no constan')
  })
})

describe('el rótulo sólo se fía de lo que estampa la composición', () => {
  const v = (extra) => ({
    verdict: 'sin-datos',
    summary: EXPLICACION,
    evidence: [],
    checkedAgainst: ['verdict-engine'],
    ...extra,
  })

  it('con el canal del motor y la firma de una persona, lleva su nombre', () => {
    expect(etiquetaVerificador(v({ source: 'verdict-engine', reasonSignedBy: PERSONA }))).toBe(
      `verificador LLM · explicación firmada por ${PERSONA}`,
    )
  })

  it.each([
    [
      'una firma que no es de una persona',
      { source: 'verdict-engine', reasonSignedBy: 'ai-gold-review' },
    ],
    ['la firma sin el canal del motor', { reasonSignedBy: PERSONA }],
    ['la firma en una entrada de la pasada LLM', { source: 'llm', reasonSignedBy: PERSONA }],
  ])('%s → «verificador LLM», sin nombre', (_, extra) => {
    expect(etiquetaVerificador(v(extra))).toBe('verificador LLM')
  })
})
