import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'
import Declaraciones from '../src/pages/Declaraciones'
import {
  applyOverlayEntries,
  enmendarMotivoDeBajada,
  mergeVerified,
  verificacionDeBajada,
} from '../src/scraper/verified-merge'
import { gateItemsForPublic } from '../src/scraper/claim-public-gate'
import { CLASES_DE_FIRMA, claseDeFirma, rechazoDeFirma } from '../src/scraper/firma-de-persona'

/**
 * Una bajada de curador dice quién la decidió.
 *
 * La tarjeta de /plenos/:id y /departamentos/:slug, y la línea de evidencia de
 * /declaraciones, rotulaban «corregido por un curador» toda verificación que
 * entrara por `downgrade-verdict`, y /metodologia promete que rebajar un
 * veredicto lo hace una persona. Medido el 30-09-2026 sobre los trozos
 * servidos: 25 de esas tarjetas no las decidió ninguna persona. 21 son de la
 * revisión de oro del 24-06 (`ai-gold-review`, hecha con un modelo), tres de
 * sesiones de Claude que usaron la CLI del curador, y una firma «sergei», que
 * no dice quién. Veinte llevan además un motivo reescrito en castellano y
 * firmado por una persona (#199), que borró la única pista que quedaba en la
 * página —el prefijo inglés «Gold review (ai)»— de que el veredicto lo bajó
 * una máquina.
 *
 * La firma es de quien DECIDIÓ la bajada. La de quien reescribió el motivo es
 * otra, y la tarjeta dice las dos cuando las hay.
 */

const STAMP = '2026-06-24T07:40:24.903Z'
const HOY = '2026-09-30T05:51:57.111Z'
const VACIO = { version: 1, generatedAt: STAMP, entries: {} }

const CORREGIDO = 'corregido por un curador'
const AUTOMATICA = 'rebajado en una revisión automática'
const NO_CONSTA = 'rebajado; no consta quién lo decidió'

const CLAIM = {
  id: '1sqj7is-053-pro-68944b',
  plenoId: '1sqj7is',
  plenoDate: '2026-03-30',
  segmentIndex: 53,
  type: 'promesa',
  speakerGroup: 'PSOE',
  verbatim: 'el sistema dinámico de adquisición nos permitirá mejorar la forma de contratar',
  context: '…el sistema dinámico de adquisición nos permitirá mejorar la forma de contratar…',
  topic: 'transparencia',
  entities: {},
  confidence: 0.9,
  reasoning: 'Promesa sobre el modo de contratar.',
  requiresHumanApproval: true,
}

const CONTRATO = {
  kind: 'tender',
  ref: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=x',
  snippet: 'Contrato derivado del sistema dinámico de adquisición de suministros.',
  similarity: 1,
}

const BASE = {
  claimId: CLAIM.id,
  verdict: 'verificado',
  summary: 'Coincidencia con contratos derivados del sistema dinámico de adquisición.',
  evidence: [CONTRATO],
  checkedAgainst: ['tenders'],
}

const MOTIVO = 'Gold review (ai): the dynamic purchasing contracts only confirm the mechanism'

/** Una bajada a parcial por la vía de la CLI, firmada por `editor`. */
function bajada(editor) {
  return applyOverlayEntries(
    VACIO,
    [
      {
        claimId: CLAIM.id,
        verification: verificacionDeBajada(CLAIM.id, BASE, 'parcial', MOTIVO),
        source: 'curator-downgrade',
        reason: MOTIVO,
        editor,
      },
    ],
    STAMP,
    new Map([[CLAIM.id, 'verificado']]),
  )
}

/** Con el motivo reescrito y firmado por `firma`, como en #199. */
function enmendada(overlay, firma) {
  return enmendarMotivoDeBajada(
    overlay,
    {
      claimId: CLAIM.id,
      veredicto: 'parcial',
      motivo:
        'Baja de «Verificado» a «Parcial»: los contratos confirman que el mecanismo se usa, no que mejore la forma de contratar.',
      porque:
        'El motivo se publicó en inglés y con jerga de revisión; se reescribe en castellano llano.',
      editor: firma,
    },
    HOY,
  ).overlay
}

/** base ⊕ overlay → puerta pública: el ítem tal y como va a un trozo. */
function servir(overlay) {
  const servidos = gateItemsForPublic(
    mergeVerified([{ claim: CLAIM, verification: BASE }], overlay),
  )
  expect(servidos, 'la puerta pública no dejó pasar la fila').toHaveLength(1)
  return servidos[0]
}

function pintarLedger(it) {
  return render(
    <MemoryRouter>
      <ClaimLedger items={[it]} />
    </MemoryRouter>,
  )
}

/** El texto de la línea «Veredicto:» de la tarjeta, sin el rótulo. */
function veredicto() {
  const rotulo = 'Veredicto:'
  const empieza = (el) => el?.textContent?.startsWith(rotulo) ?? false
  const el = screen.getByText((_, e) => empieza(e) && ![...(e?.children ?? [])].some(empieza), {
    selector: 'div, span, p',
  })
  return el.textContent.slice(rotulo.length).trim()
}

describe('la tarjeta dice quién decidió la bajada', () => {
  it('firmada con nombre y apellido: «corregido por un curador»', () => {
    pintarLedger(servir(bajada('Sergei Lutchenko')))
    expect(veredicto()).toBe(CORREGIDO)
  })

  it('la de la revisión de oro: «rebajado en una revisión automática»', () => {
    pintarLedger(servir(bajada('ai-gold-review')))
    expect(veredicto()).toBe(AUTOMATICA)
  })

  it('una firma que no dice quién: «no consta», ni persona ni máquina', () => {
    pintarLedger(servir(bajada('sergei')))
    expect(veredicto()).toBe(NO_CONSTA)
  })

  it('con el motivo reescrito, dice también quién firmó el motivo', () => {
    pintarLedger(servir(enmendada(bajada('ai-gold-review'), 'Sergei Lutchenko')))
    expect(veredicto()).toBe(`${AUTOMATICA} · motivo firmado por Sergei Lutchenko`)
  })
})

describe('lo que ningún escritor produce no se lee como una persona', () => {
  // Formas de un trozo rancio o editado a mano. La clase la estampa
  // `mergeVerified` desde la entrada validada, junto con el `source`: sin los
  // dos, nadie ha dicho quién decidió.
  function fila(verification) {
    return {
      claim: CLAIM,
      verification: {
        claimId: CLAIM.id,
        verdict: 'sin-datos',
        summary: 'Resumen neutro de una bajada.',
        evidence: [],
        checkedAgainst: ['curator-downgrade'],
        ...verification,
      },
      visibility: 'toggle',
    }
  }

  it.each([
    ['el canal sin la clase (un trozo anterior al arreglo)', { source: 'curator-downgrade' }],
    ['sólo la marca vieja en checkedAgainst', {}],
    ['una clase que no existe', { source: 'curator-downgrade', downgradedBy: 'curador' }],
    [
      'la clase de persona sin el canal que la estampa',
      { source: 'verdict-engine', downgradedBy: 'persona' },
    ],
  ])('%s → «no consta»', (_, verification) => {
    pintarLedger(fila(verification))
    expect(veredicto()).toBe(NO_CONSTA)
  })

  it('una firma de motivo que no nombra a una persona no se imprime', () => {
    pintarLedger(
      fila({
        source: 'curator-downgrade',
        downgradedBy: 'automatica',
        reasonSignedBy: 'ai-gold-review',
      }),
    )
    expect(veredicto()).toBe(AUTOMATICA)
  })
})

// ─── Lo servido ────────────────────────────────────────────────────────────

const DIR = resolve('public/data/pleno-claims')
const servidas = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .flatMap((f) => JSON.parse(readFileSync(resolve(DIR, f), 'utf8')).items ?? [])
const overlay = JSON.parse(readFileSync(resolve('public/data/pleno-claims-overlay.json'), 'utf8'))

/** Las servidas que entraron por la vía del curador, según el overlay y no según el trozo. */
const bajadas = servidas
  .map((it) => ({ it, e: overlay.entries[it.claim.id] }))
  .filter(({ e }) => e?.source === 'curator-downgrade')

/**
 * El rótulo de cada firma que hay hoy en el overlay, decidido a mano. Una firma
 * nueva no está aquí y cae en la regla general de abajo: con nombre, curador;
 * sin él, nunca.
 */
const ROTULO_DE_LA_FIRMA = {
  'Sergei Lutchenko': CORREGIDO,
  'ai-gold-review': AUTOMATICA,
  'claude-fable-5.1': AUTOMATICA,
  'Claude (revisión 17-08, aprobada en plan)': AUTOMATICA,
  sergei: NO_CONSTA,
}

const ultimaEnmienda = (e) => e.reasonAmendments?.[e.reasonAmendments.length - 1]

describe('lo servido: cada bajada dice quién la decidió', () => {
  it('mide algo: bajadas firmadas por una persona, sin ella y con el motivo enmendado', () => {
    const conNombre = bajadas.filter(({ e }) => rechazoDeFirma(e.editor) === null)
    const sinNombre = bajadas.filter(({ e }) => rechazoDeFirma(e.editor) !== null)
    expect(conNombre.length, 'firmadas por una persona').toBeGreaterThan(0)
    expect(sinNombre.length, 'sin firma de una persona').toBeGreaterThan(0)
    expect(bajadas.filter(({ e }) => ultimaEnmienda(e)).length, 'enmendadas').toBeGreaterThan(0)
  })

  it('ninguna sin la firma de una persona dice «corregido por un curador», y cada una dice lo suyo', () => {
    const mal = []
    for (const { it, e } of bajadas) {
      const { unmount } = pintarLedger(it)
      const rotulo = veredicto()
      unmount()
      const [decision, firmaDelMotivo] = rotulo.split(' · motivo firmado por ')
      const esperado = ROTULO_DE_LA_FIRMA[e.editor]
      const persona = rechazoDeFirma(e.editor) === null
      if (esperado ? decision !== esperado : (decision === CORREGIDO) !== persona) {
        mal.push(`${it.claim.id} (${e.editor}): «${rotulo}»`)
      }
      if (firmaDelMotivo !== ultimaEnmienda(e)?.editor) {
        mal.push(`${it.claim.id}: firma del motivo «${firmaDelMotivo}», no la de la enmienda`)
      }
    }
    expect(mal).toEqual([])
  })

  it('el sello de cada trozo es el que la entrada estampa hoy, y la firma cruda no viaja', () => {
    // Si se cambió la clasificación sin regenerar los trozos, o un trozo se
    // tocó a mano, el sello y el overlay se separan.
    const discrepan = []
    for (const { it, e } of bajadas) {
      const v = it.verification
      if (!CLASES_DE_FIRMA.includes(v.downgradedBy) || v.downgradedBy !== claseDeFirma(e.editor)) {
        discrepan.push(`${it.claim.id}: sello ${v.downgradedBy}, firma ${e.editor}`)
      }
    }
    expect(discrepan).toEqual([])
    const conFirmaCruda = servidas.filter((it) => 'editor' in it.verification)
    expect(conFirmaCruda.map((it) => it.claim.id)).toEqual([])
    // `downgradedBy` sólo lo lleva una bajada de curador. `reasonSignedBy`, también
    // la explicación firmada de una retractación del motor (vía 1, #269): sólo en
    // sin-datos y con la firma de la última enmienda de su entrada. Las primeras
    // de verdad se firmaron el 10-10-2026.
    const firmadaDelMotor = (it) => {
      const v = it.verification
      const e = overlay.entries[it.claim.id]
      return (
        v.source === 'verdict-engine' &&
        v.verdict === 'sin-datos' &&
        e?.source === 'verdict-engine' &&
        v.reasonSignedBy === ultimaEnmienda(e)?.editor
      )
    }
    const fueraDelCanal = servidas.filter((it) => {
      const v = it.verification
      if (v.source === 'curator-downgrade') return false
      if ('downgradedBy' in v) return true
      return 'reasonSignedBy' in v && !firmadaDelMotor(it)
    })
    expect(fueraDelCanal.map((it) => it.claim.id)).toEqual([])
    // Mide algo: hay explicaciones del motor firmadas, y viajan con su firma.
    expect(servidas.filter(firmadaDelMotor).length).toBeGreaterThan(0)
  })
})

describe('lo servido en /declaraciones: la línea de evidencia dice lo mismo', () => {
  it('las bajadas con evidencia que no firmó una persona no dicen «corregido por un curador»', async () => {
    const reales = bajadas
      .filter(({ it }) => it.verification.evidence.length > 0 && it.visibility === 'shown')
      .map(({ it }) => it)
    // Las reales son hoy las tres que firmó una persona. El caso sin firma de
    // persona lo daba la «parcial» de la revisión de oro sobre el sistema
    // dinámico de adquisición (1sqj7is-053-pro-68944b), la última que quedaba
    // contrastada: el 04-10-2026 la bajó a sin-datos una persona con
    // `downgrade-verdict`, porque publicaba por encima de su base. La rama sigue
    // probada con una fila hecha por la misma vía —la CLI y la puerta pública,
    // `servir(bajada(…))`—, y una real sin firma de persona que vuelva a
    // servirse con evidencia entra en la cuenta sola.
    const sintetica = servir(bajada('ai-gold-review'))
    expect(sintetica.visibility, 'la sintética se sirve como las reales').toBe('shown')
    const conEvidencia = [...reales, sintetica]
    const firmaDe = (it) =>
      it === sintetica ? 'ai-gold-review' : overlay.entries[it.claim.id].editor
    const sinPersona = conEvidencia.filter((it) => rechazoDeFirma(firmaDe(it)) !== null)
    expect(sinPersona.length, 'ninguna bajada con evidencia sin firma de persona').toBeGreaterThan(
      0,
    )
    installFetchMock({
      '/data/pleno-claims/index.json': {
        plenos: [{ plenoId: 'p1', plenoDate: '2026-01-19', chunkPath: 'pleno-claims/p1.json' }],
        totals: { items: conEvidencia.length, byVerdict: { parcial: conEvidencia.length } },
      },
      '/data/pleno-claims/p1.json': { items: conEvidencia },
      '/data/plenos.json': { items: [] },
    })
    render(
      <MemoryRouter>
        <Declaraciones />
      </MemoryRouter>,
    )
    const cabeceras = await screen.findAllByText(
      (_, e) => /^\d+ evidencias? · /.test(e?.textContent ?? '') && e?.children.length === 0,
    )
    expect(cabeceras).toHaveLength(conEvidencia.length)
    const dicen = cabeceras.map((c) => c.textContent.replace(/^\d+ evidencias? · /, ''))
    const automaticas = dicen.filter((d) => d.startsWith(AUTOMATICA))
    expect(automaticas).toHaveLength(sinPersona.length)
    expect(dicen.filter((d) => d === CORREGIDO)).toHaveLength(
      conEvidencia.length - sinPersona.length,
    )
  })
})
