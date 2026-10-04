import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'
import Declaraciones from '../src/pages/Declaraciones'
import { etiquetaVerificador, fuentesComprobadas } from '../src/lib/claim-provenance.js'
import { evidenciaDelRegistro, subirVeredicto } from '../src/scraper/subida-firmada'
import { mergeVerified } from '../src/scraper/verified-merge'
import { gateItemsForPublic } from '../src/scraper/claim-public-gate'
import { RESUMEN_SIN_REGISTRO_FIJO } from '../src/scraper/claim-verdicts'

/**
 * La tarjeta dice que el veredicto lo subió una persona, y quién.
 *
 * Una subida firmada (docs/superpowers/specs/2026-10-04-subida-firmada-design.md)
 * es la única escritura del overlay que refuerza lo que se publica de una
 * declaración. Sin rótulo propio saldría como «verificador determinista» o «sin
 * verificador anotado», y un lector no sabría que lo afirmó una persona con su
 * nombre. La fila se hace por el camino real —la CLI pura, el overlay, la
 * composición y la puerta—, no a mano.
 */

const PERSONA = 'María de la Fuente Llorens'
const STAMP = '2026-10-04T12:00:00.000Z'
const REGISTROS = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/subida-firmada-registros_2026-10-04.json'), 'utf8'),
)
const JUEGOS =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=Dsw60vrWRmm5HQrHoP3G5A%3D%3D'
const RESUMEN =
  'La renovación de los juegos del parque de la Asunción de Nuestra Señora se contrató: suministro e instalación adjudicados el 8-09-2026 por 40.727,10 €.'

const CLAIM = {
  id: '19gax3o-034-cit-8ae8be',
  plenoId: '19gax3o',
  plenoDate: '2026-01-19',
  segmentIndex: 34,
  type: 'cita_obra',
  speakerGroup: null,
  verbatim: 'renovación de juegos en el parque junto a la Asunción de Nuestra Señora',
  context: '…renovación de juegos en el parque junto a la Asunción de Nuestra Señora…',
  topic: 'urbanismo',
  entities: {},
  confidence: 0.9,
  reasoning: 'Cita una obra concreta.',
  requiresHumanApproval: true,
}

const BASE = {
  claimId: CLAIM.id,
  verdict: 'sin-datos',
  summary: RESUMEN_SIN_REGISTRO_FIJO,
  evidence: [],
  checkedAgainst: ['tenders', 'bdns'],
}

/** La fila servida tras subirla por la vía firmada. */
function servida() {
  const evidencia = evidenciaDelRegistro(
    { enlace: JUEGOS, lote: null },
    { tenders: REGISTROS.tenders, bdns: REGISTROS.bdns },
  )
  const overlay = subirVeredicto(
    { version: 1, generatedAt: STAMP, entries: {} },
    {
      claimId: CLAIM.id,
      veredicto: 'parcial',
      evidencia: [evidencia],
      resumen: RESUMEN,
      editor: PERSONA,
    },
    { tipo: CLAIM.type, publicado: 'sin-datos', resumenesDeMaquina: [BASE.summary] },
    STAMP,
  )
  const servidos = gateItemsForPublic(
    mergeVerified([{ claim: CLAIM, verification: BASE }], overlay),
  )
  expect(servidos, 'la puerta pública no dejó pasar la fila').toHaveLength(1)
  return servidos[0]
}

/** El texto de la línea que empieza por `rotulo`, sin el rótulo. */
function linea(rotulo) {
  const empieza = (el) => el?.textContent?.startsWith(rotulo) ?? false
  const el = screen.getByText((_, e) => empieza(e) && ![...(e?.children ?? [])].some(empieza), {
    selector: 'div, span, p',
  })
  return el.textContent.slice(rotulo.length).trim()
}

describe('la tarjeta de una subida firmada', () => {
  it('dice que la subió una persona y quién, contra qué se cotejó, el resumen y el registro', () => {
    const it0 = servida()
    expect(it0.visibility).toBe('shown')
    const { container } = render(
      <MemoryRouter>
        <ClaimLedger items={[it0]} />
      </MemoryRouter>,
    )
    expect(linea('Veredicto:')).toBe(`subido por una persona · firmado por ${PERSONA}`)
    expect(linea('Fuentes comprobadas:')).toBe('tenders')
    expect(container.textContent).toContain(RESUMEN)
    expect(container.textContent).toContain('adjudicado a URBEADAPTA S. L.')
    // Ni la puntuación de parecido, que no la hay, ni el puente de importes.
    expect(container.textContent).not.toMatch(/sim \d/)
    expect(container.querySelector('[data-puente-importe]')).toBeNull()
  })

  it('en /declaraciones, la línea de evidencia dice lo mismo', async () => {
    const it0 = servida()
    installFetchMock({
      '/data/pleno-claims/index.json': {
        plenos: [
          { plenoId: CLAIM.plenoId, plenoDate: CLAIM.plenoDate, chunkPath: 'pleno-claims/p1.json' },
        ],
        totals: { items: 1, byVerdict: { parcial: 1 } },
      },
      '/data/pleno-claims/p1.json': { items: [it0] },
      '/data/plenos.json': { items: [] },
    })
    render(
      <MemoryRouter>
        <Declaraciones />
      </MemoryRouter>,
    )
    const cabecera = await screen.findByText(
      (_, e) => /^1 evidencia · /.test(e?.textContent ?? '') && e?.children.length === 0,
    )
    expect(cabecera.textContent).toBe(
      `1 evidencia · subido por una persona · firmado por ${PERSONA}`,
    )
  })
})

describe('lo que ningún escritor produce no se lee como una subida firmada', () => {
  // La firma la estampa la composición desde la entrada validada, con el canal.
  // Sin los dos, nadie ha dicho quién la subió, y no se imprime un nombre.
  const SIN_FIRMA = 'subido; no consta quién lo firmó'
  const v = (extra) => ({
    verdict: 'parcial',
    summary: RESUMEN,
    evidence: [{ kind: 'tender', ref: JUEGOS, snippet: 's' }],
    checkedAgainst: ['tenders'],
    derivedBy: ['curator-upgrade'],
    ...extra,
  })

  it.each([
    ['el canal sin la firma', { source: 'curator-upgrade' }],
    [
      'el canal con una firma que no es de una persona',
      { source: 'curator-upgrade', raisedBy: 'civicpulse-curator' },
    ],
    ['la pasada en derivedBy, sin el canal', { raisedBy: PERSONA }],
  ])('%s → «no consta quién lo firmó»', (_, extra) => {
    expect(etiquetaVerificador(v(extra))).toBe(SIN_FIRMA)
  })

  it('con el canal y la firma de una persona, el rótulo lleva su nombre', () => {
    expect(etiquetaVerificador(v({ source: 'curator-upgrade', raisedBy: PERSONA }))).toBe(
      `subido por una persona · firmado por ${PERSONA}`,
    )
    expect(fuentesComprobadas(v({ source: 'curator-upgrade', raisedBy: PERSONA }))).toBe('tenders')
  })

  it('una firma de persona colada en otro canal no hace de una bajada una subida', () => {
    const bajada = {
      verdict: 'sin-datos',
      summary: 'Resumen neutro de una bajada.',
      evidence: [],
      checkedAgainst: ['curator-downgrade'],
      source: 'curator-downgrade',
      downgradedBy: 'persona',
      raisedBy: PERSONA,
    }
    expect(etiquetaVerificador(bajada)).toBe('corregido por un curador')
  })
})
