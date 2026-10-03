/**
 * Quién decidió una bajada viaja con la verificación publicada.
 *
 * `mergeVerified` estampaba sólo el `source` de la entrada del overlay, así que
 * una bajada de curador llegaba a la página sin nada que dijera quién la
 * decidió, y la tarjeta la rotulaba «corregido por un curador» siempre. Medido
 * el 30-09-2026: de las 69 entradas `curator-downgrade`, 47 no las firma una
 * persona —40 `ai-gold-review`, la revisión de oro del 24-06 hecha con un
 * modelo; 3 de sesiones de Claude; 4 `sergei`—, y 25 de ésas se sirven.
 *
 * La firma cruda no se publica: viaja su CLASE (`claseDeFirma`), y, si el
 * motivo se enmendó, el nombre de quien firmó la última enmienda, que
 * `validateOverlay` ya exige que sea una persona.
 *
 * Las entradas no se escriben a mano: salen de los escritores reales
 * (`verificacionDeBajada`, `applyOverlayEntries`, `enmendarMotivoDeBajada`).
 */
import { describe, it, expect } from 'vitest'
import {
  applyOverlayEntries,
  enmendarMotivoDeBajada,
  mergeVerified,
  verificacionDeBajada,
  type Overlay,
  type VerifiedItem,
} from '../../src/scraper/verified-merge'
import { entradaDelMotor } from '../../src/scraper/entrada-de-pasada'
import type { ClaimEvidence, ClaimVerdict } from '../../src/scraper/claim-verifier'

const ID = '19gax3o-132-cit-35c4f5'
const BAJADA_EL = '2026-06-24T07:40:24.903Z'
const HOY = '2026-09-30T05:51:57.111Z'

const CONTRATO: ClaimEvidence = {
  kind: 'tender',
  ref: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=x',
  snippet: 'Servicio mantenimiento instalaciones en complejo deportivo La Malla.',
}

/** La fila de la base: un «verificado» del cotejo, con su corpus y su contrato. */
const BASE: VerifiedItem = {
  claim: { id: ID } as VerifiedItem['claim'],
  verification: {
    claimId: ID,
    verdict: 'verificado',
    summary: 'Coincidencia con un contrato de mantenimiento.',
    evidence: [CONTRATO],
    checkedAgainst: ['tenders'],
  },
}

const VACIO: Overlay = { version: 1, generatedAt: BAJADA_EL, entries: {} }
const MOTIVO =
  'Gold review (ai): La Malla complex confirmed via maintenance tender; budget not verified'

/** Una bajada por la vía de la CLI, firmada con `editor` (o sin firma). */
function bajadaFirmadaPor(editor: string | undefined, a: ClaimVerdict = 'parcial'): Overlay {
  return applyOverlayEntries(
    VACIO,
    [
      {
        claimId: ID,
        verification: verificacionDeBajada(ID, BASE.verification, a, MOTIVO),
        source: 'curator-downgrade',
        reason: MOTIVO,
        ...(editor === undefined ? {} : { editor }),
      },
    ],
    BAJADA_EL,
    new Map([[ID, 'verificado' as ClaimVerdict]]),
  )
}

const servida = (overlay: Overlay) => mergeVerified([BASE], overlay)[0].verification

describe('mergeVerified · la verificación publicada dice quién decidió la bajada', () => {
  it('la firmada con nombre y apellido: una persona', () => {
    const v = servida(bajadaFirmadaPor('Sergei Lutchenko'))
    expect(v.source).toBe('curator-downgrade')
    expect(v.downgradedBy).toBe('persona')
  })

  it('la de la revisión de oro: automática', () => {
    expect(servida(bajadaFirmadaPor('ai-gold-review')).downgradedBy).toBe('automatica')
  })

  it('la firmada con un alias o sin firma: no consta', () => {
    expect(servida(bajadaFirmadaPor('sergei')).downgradedBy).toBe('no-consta')
    expect(servida(bajadaFirmadaPor(undefined)).downgradedBy).toBe('no-consta')
  })

  it('la firma cruda no se publica: sólo su clase', () => {
    const v = servida(bajadaFirmadaPor('Claude (revisión 17-08, aprobada en plan)'))
    expect(v.downgradedBy).toBe('automatica')
    expect(JSON.stringify(v)).not.toContain('Claude')
  })

  it('sin enmienda, no hay firma de motivo que publicar', () => {
    expect('reasonSignedBy' in servida(bajadaFirmadaPor('ai-gold-review'))).toBe(false)
  })

  it('con enmiendas, publica a quien firmó la última, y la bajada sigue siendo de quien la decidió', () => {
    const pedida = (editor: string, motivo: string, porque: string) => ({
      claimId: ID,
      veredicto: 'parcial' as ClaimVerdict,
      motivo,
      porque,
      editor,
    })
    const primera = enmendarMotivoDeBajada(
      bajadaFirmadaPor('ai-gold-review'),
      pedida(
        'Ana Pérez Llorca',
        'Baja de «Verificado» a «Parcial»: el contrato confirma el complejo, no el resto.',
        'El motivo se publicó en inglés; se reescribe en castellano sin cambiar lo que afirma.',
      ),
      '2026-09-29T10:00:00.000Z',
    ).overlay
    const segunda = enmendarMotivoDeBajada(
      primera,
      pedida(
        'Luis Gómez Vidal',
        'Baja de «Verificado» a «Parcial»: el contrato de mantenimiento confirma el complejo.',
        'La primera enmienda seguía nombrando lo que no se comprobó; se acota a lo que consta.',
      ),
      HOY,
    ).overlay
    const v = servida(segunda)
    expect(v.reasonSignedBy).toBe('Luis Gómez Vidal')
    expect(v.downgradedBy).toBe('automatica')
    expect(v.verdict).toBe('parcial')
  })

  it('una entrada de otro canal no lleva ni la clase ni la firma de motivo', () => {
    const motor = applyOverlayEntries(
      VACIO,
      [
        entradaDelMotor({
          verification: {
            claimId: ID,
            verdict: 'sin-datos',
            summary: 'Ningún candidato respalda la afirmación: es otro complejo.',
            evidence: [],
            checkedAgainst: ['tenders'],
            derivedBy: ['verdict-engine'],
          },
          modelo: 'gpt-5.4-mini',
          tipo: 'retractacion',
          desde: 'verificado',
        }),
      ],
      BAJADA_EL,
    )
    const v = servida(motor)
    expect(v.source).toBe('verdict-engine')
    expect('downgradedBy' in v).toBe(false)
    expect('reasonSignedBy' in v).toBe(false)
  })

  it('una fila de la base, que no pasó por ningún canal, tampoco', () => {
    const v = servida(VACIO)
    expect('downgradedBy' in v).toBe(false)
    expect('source' in v).toBe(false)
  })
})
