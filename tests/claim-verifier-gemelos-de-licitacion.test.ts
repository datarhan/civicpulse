import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  verifyClaim,
  shortlistCandidates,
  TENDER_NOT_DONE_STATUSES,
  ESTADOS_QUE_NO_CONTRADICEN,
} from '../src/scraper/claim-verifier'
import { procurementStatusKind } from '../src/lib/contract-status.js'
import { buildTenderRows, CLAVE_DE_LICITACION } from '../scripts/embed-verifier-corpus'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

/**
 * Un expediente, dos estados: el contrato dice adjudicado y su licitación,
 * revocada.
 *
 * `tenders.json` trae dos tablas de Gobierto: `contracts` —el estado del
 * contrato— y `tenders` —el de la licitación—, que comparten `permalink` cuando
 * hablan del mismo documento de PLACSP. Medido el 2026-10-19 sobre origin/main:
 * 114 licitaciones llevan `revoked`, y 109 de ellas tienen un contrato gemelo
 * `awarded`. El ejemplo: 55V/2024, el servicio de emergencia de pluviales tras
 * la DANA adjudicado a Hidraqua el 12-12-2024 por 82.140,36 € sin IVA, que en
 * `contracts` figura adjudicado y en `tenders`, revocado.
 *
 * `readTenders` concatenaba las dos tablas, así que el verificador veía los dos
 * registros como dos contratos distintos. La rama «obra terminada» se queda con
 * la PRIMERA fila cuyo título se parece lo bastante, y el contrato va delante;
 * pero el contrato lleva además la adjudicataria, que la licitación no trae, y
 * esos tokens le bajan el Jaccard. Cuando eso lo deja bajo 0,34 y a la
 * licitación no, la licitación revocada decide sola: `contradicho`, «el contrato
 * en la base municipal aún figura como «revoked»», contra un contrato que la
 * propia base da por adjudicado. Y la lista corta, léxica y semántica, le
 * enseñaba al modelo el mismo expediente adjudicado y revocado a la vez.
 *
 * Ninguna página pinta el estado de `tenders`, y los ficheros de afirmaciones
 * verificadas no traían ningún `contradicho` al medirlo: nada publicado estaba
 * mal todavía. El camino estaba vivo para la siguiente pasada.
 */

const permalink =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=GEMELO%3D%3D'
const titulo =
  'Servicio de reparación del colector de pluviales del barrio de Masía de Traver tras la DANA'

function obraTerminada(partial: Partial<PlenoClaim> = {}): PlenoClaim {
  return {
    id: 'gemelo-001-cit-abc123',
    plenoId: 'gemelo',
    plenoDate: '2026-03-09',
    segmentIndex: 0,
    type: 'cita_obra',
    speakerGroup: 'PSOE',
    verbatim: 'la obra del colector de pluviales ya está terminada',
    context: 'contexto contexto contexto contexto contexto',
    topic: 'urbanismo',
    // Comparte el objeto con el título pero no entero («obra nueva»), así que
    // puntúa por Jaccard: 0,40 contra la licitación, por debajo de 0,34 contra
    // el contrato, que suma los tokens de su adjudicataria.
    entities: { referencedEntity: 'colector de pluviales de Masía de Traver, obra nueva' },
    confidence: 0.8,
    reasoning: 'cita de obra',
    requiresHumanApproval: true,
    ...partial,
  }
}

const contrato = {
  id: '1',
  permalink,
  title: titulo,
  status: 'awarded',
  assignee: 'HIDRAULICAS Y CANALIZACIONES DEL TURIA SOCIEDAD LIMITADA',
  categoryTitle: 'environment',
}
const licitacionRevocada = {
  id: '1',
  permalink,
  title: titulo,
  status: 'revoked',
  categoryTitle: 'environment',
}

describe('el contrato manda sobre su licitación gemela', () => {
  it('una licitación revocada NO desmiente la obra si su contrato figura adjudicado', () => {
    const v = verifyClaim({
      claim: obraTerminada(),
      tenders: { contracts: [contrato], tenders: [licitacionRevocada] },
    })
    expect(v.verdict, v.summary).not.toBe('contradicho')
    for (const e of v.evidence) {
      expect(e.stance, e.snippet).not.toBe('contradicts')
      expect(e.snippet).not.toContain('revoked')
    }
  })

  it('control: una licitación revocada SIN contrato sigue desmintiendo', () => {
    // No se quita `revoked` de TENDER_NOT_DONE_STATUSES: una licitación que de
    // verdad se revocó y no dejó contrato sigue siendo evidencia.
    expect(TENDER_NOT_DONE_STATUSES.has('revoked')).toBe(true)
    const v = verifyClaim({
      claim: obraTerminada(),
      tenders: { contracts: [], tenders: [licitacionRevocada] },
    })
    expect(v.verdict).toBe('contradicho')
    expect(v.summary).toContain('revoked')
  })

  it('control: un contrato gemelo cuyo estado es el centinela no tapa a su licitación', () => {
    // `unknown` no es un estado sino su ausencia (regla 3): el registro del
    // contrato no tiene nada que oponer, y el único estado publicado es el de
    // la licitación. Quitárselo callaría lo único que el registro dice.
    const lista = shortlistCandidates({
      claim: obraTerminada({ verbatim: titulo }),
      tenders: {
        contracts: [{ ...contrato, status: 'unknown' }],
        tenders: [licitacionRevocada],
      },
    })
    const estados = lista.filter((c) => c.ref === permalink).map((c) => c.snippet.split(' · ')[0])
    expect(estados).toContain('revoked')
  })

  it('la lista corta no enseña al modelo el expediente revocado y adjudicado a la vez', () => {
    const lista = shortlistCandidates({
      claim: obraTerminada({ verbatim: titulo }),
      tenders: { contracts: [contrato], tenders: [licitacionRevocada] },
    })
    const delExpediente = lista.filter((c) => c.ref === permalink)
    expect(delExpediente.length, 'el expediente tiene que llegar a la lista').toBeGreaterThan(0)
    for (const c of delExpediente) expect(c.snippet).not.toContain('revoked')
  })

  it('el corpus semántico tampoco: la licitación que entra lo hace sin su estado', () => {
    // Entra porque trae un importe que el contrato no (el total de un
    // expediente con lotes); con él traía su estado.
    const filas = buildTenderRows({
      contracts: [{ ...contrato, initialAmount: 1000, initialAmountNoTaxes: 826.45 }],
      tenders: [{ ...licitacionRevocada, initialAmount: 6000, initialAmountNoTaxes: 4958.68 }],
    })
    const deLicitacion = filas.filter((f) => f.sourceId.startsWith(CLAVE_DE_LICITACION))
    expect(deLicitacion, 'la licitación con otro importe entra en el corpus').toHaveLength(1)
    expect(deLicitacion[0].snippet).not.toContain('revoked')
    expect(deLicitacion[0].snippet).toContain('4958,68')
  })
})

// ─── Sobre el snapshot publicado ────────────────────────────────────────────

interface Fila {
  id?: string
  permalink?: string
  title?: string
  status?: string
}

const snapshot = JSON.parse(readFileSync(resolve('public/data/tenders.json'), 'utf8')) as {
  contracts: Fila[]
  tenders: Fila[]
}

const minus = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '')

/** Licitaciones que desmentirían y cuyo contrato gemelo publica un estado que no. */
function gemelosEnConflicto(): { licitacion: Fila; contratos: Fila[] }[] {
  const porEnlace = new Map<string, Fila[]>()
  for (const c of snapshot.contracts) {
    if (!c.permalink) continue
    porEnlace.set(c.permalink, [...(porEnlace.get(c.permalink) ?? []), c])
  }
  const out: { licitacion: Fila; contratos: Fila[] }[] = []
  for (const t of snapshot.tenders) {
    if (!TENDER_NOT_DONE_STATUSES.has(minus(t.status))) continue
    const contratos = (porEnlace.get(t.permalink ?? '') ?? []).filter(
      (c) =>
        procurementStatusKind(minus(c.status)) !== null &&
        ESTADOS_QUE_NO_CONTRADICEN.has(minus(c.status)),
    )
    if (contratos.length > 0) out.push({ licitacion: t, contratos })
  }
  return out
}

describe('la premisa, medida sobre public/data/tenders.json', () => {
  const conflicto = gemelosEnConflicto()

  it('hay gemelos con estados en conflicto hoy (la guarda no es vacía)', () => {
    // 2026-10-19: 109 `revoked` con contrato `awarded`, más `abandoned` y
    // `provisionally_awarded` con contrato adjudicado o formalizado. Si un día
    // baja a cero, esta prueba lo dice en vez de dejar las de abajo verdes por
    // no tener nada que medir.
    expect(conflicto.length).toBeGreaterThan(0)
  })

  it('la lista corta del verificador sobre el snapshot real no repite el estado de la licitación', () => {
    let medidos = 0
    for (const { licitacion } of conflicto.slice(0, 25)) {
      const lista = shortlistCandidates(
        {
          claim: obraTerminada({ verbatim: String(licitacion.title), context: '' }),
          tenders: snapshot,
        },
        50,
      )
      const delExpediente = lista.filter((c) => c.ref === licitacion.permalink)
      if (delExpediente.length === 0) continue
      medidos += 1
      for (const c of delExpediente) {
        expect(c.snippet.split(' · '), `${licitacion.id} · ${c.snippet}`).not.toContain(
          minus(licitacion.status),
        )
      }
    }
    expect(medidos, 'ningún expediente en conflicto llegó a la lista: no se midió nada').toBe(
      Math.min(25, conflicto.length),
    )
  })

  it('el corpus semántico construido del snapshot real tampoco', () => {
    const enConflicto = new Map(conflicto.map((g) => [g.licitacion.permalink, g.licitacion]))
    const filas = buildTenderRows(snapshot).filter(
      (f) => f.sourceId.startsWith(CLAVE_DE_LICITACION) && enConflicto.has(f.ref),
    )
    // 2026-10-19: 20 de estas licitaciones entraban en el corpus con su estado.
    expect(filas.length, 'ninguna licitación en conflicto entra al corpus').toBeGreaterThan(0)
    for (const f of filas) {
      expect(f.snippet.split(' · '), f.snippet).not.toContain(minus(enConflicto.get(f.ref)?.status))
    }
  })
})
