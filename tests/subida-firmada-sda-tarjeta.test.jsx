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
 * La tarjeta de una subida que cita la licitación de un SDA: la fila se rotula
 * «LICITACIÓN» —no «CONTRATO», que no lo tiene— y no dice estado, importe ni
 * «adjudicado». La fila se hace por el camino real: el registro, la subida, la
 * composición y la puerta.
 */

const PERSONA = 'María de la Fuente Llorens'
const SDA = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/sda-licitaciones_2026-10-10.json'), 'utf8'),
)
const ESDA1 =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=2N0awhGNBRR%2FR5QFTlaM4A%3D%3D'
const ID = 'qz6weg-184-cit-8629f9'
const RESUMEN =
  'El Ayuntamiento licitó en agosto de 2025 un sistema dinámico de adquisición abierto a otras entidades públicas; la bolsa de autónomos no consta.'

const CLAIM = {
  id: ID,
  plenoId: 'qz6weg',
  plenoDate: '2025-12-01',
  segmentIndex: 184,
  type: 'cita_obra',
  speakerGroup: null,
  verbatim:
    'Los sistemas dinámicos de adquisición, que se aprobaron hace poco aquí, y con la cesión de la bolsa de autónomos de Riva Roja a otros ayuntamientos para realizar proyectos.',
  context: '…los sistemas dinámicos de adquisición…',
  topic: 'contratacion',
  entities: {},
  confidence: 0.9,
  reasoning: 'Cita un procedimiento concreto.',
  requiresHumanApproval: true,
}

function servida() {
  const fila = evidenciaDelRegistro(
    { enlace: ESDA1, lote: null },
    { tenders: SDA.tenders, bdns: null },
  )
  const overlay = subirVeredicto(
    { version: 1, generatedAt: '2026-10-10T00:00:00.000Z', entries: {} },
    { claimId: ID, veredicto: 'parcial', evidencia: [fila], resumen: RESUMEN, editor: PERSONA },
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

function linea(rotulo) {
  const empieza = (el) => el?.textContent?.startsWith(rotulo) ?? false
  const el = screen.getByText((_, e) => empieza(e) && ![...(e?.children ?? [])].some(empieza), {
    selector: 'div, span, p',
  })
  return el.textContent.slice(rotulo.length).trim()
}

describe('la tarjeta de una subida que cita la licitación de un SDA', () => {
  it('rotula la fila «LICITACIÓN», sin estado, importe ni «adjudicado», y nombra el corpus', () => {
    const it0 = servida()
    const { container } = render(
      <MemoryRouter>
        <ClaimLedger items={[it0]} />
      </MemoryRouter>,
    )
    expect(linea('Fuentes comprobadas:')).toBe('tenders')
    expect(linea('Veredicto:')).toBe(`subido por una persona · firmado por ${PERSONA}`)
    const enlace = container.querySelector(`a[href="${ESDA1}"]`)
    expect(enlace, 'la fila no enlaza a la licitación').not.toBeNull()
    expect(enlace.textContent).toMatch(/^LICITACIÓN/)
    expect(enlace.textContent).toContain('expediente ESDA1/2025 · ofertas desde el 08-08-2025')
    expect(enlace.textContent).not.toMatch(/CONTRATO|adjudicad|Desistido|€/)
    // Sin importe en la fila, no hay puente que montar.
    expect(container.querySelector('[data-puente-importe]')).toBeNull()
  })
})
