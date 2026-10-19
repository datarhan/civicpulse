import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseRibalicitaContracts, sinEstadoImposible, type Contract } from '../src/scraper/tenders'
import {
  validateContractCorrections,
  applyContractCorrections,
  evaluarCorrecciones,
  ESTADOS_CORREGIDOS,
  type CorreccionContrato,
  type ContractCorrections,
} from '../src/scraper/contract-corrections'
import { procurementStatusKind, CANCELLED_STATUSES } from '../src/lib/contract-status.js'
import { verifyClaim } from '../src/scraper/claim-verifier'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

/**
 * Un contrato firmado que el registro municipal publica como «Renuncia».
 *
 * El 2026-10-19 se cotejaron en la Plataforma de Contratación las 16 filas de
 * `contracts` con `revoked` o `abandoned`: 15 dicen lo que dicen (Renuncia,
 * Desistimiento). La otra es 51/2022, el cambio a LED del alumbrado del casco
 * urbano: adjudicado a EIFFAGE ENERGÍA, S.L.U. el 20-02-2023, formalizado el
 * 21-02-2023 por 481.777,60 € sin IVA. El 11-01-2024 el Ayuntamiento anuló el
 * ANUNCIO de formalización —«Pendiente publicación referida la financiación del
 * contrato a través de los fondos FEDER»— y no volvió a publicarlo; Gobierto lo
 * tradujo a `revoked` y dejó la adjudicataria en blanco. /presupuesto lo pintaba
 * «Renuncia» y fuera del dinero comprometido, y el verificador lo habría tomado
 * por un desmentido de «el alumbrado LED ya está acabado».
 *
 * Dos capas: una automática, que sólo QUITA (un estado cancelado junto a una
 * fecha de formalización, sin lote hermano firmado, es imposible: la renuncia y
 * el desistimiento son anteriores a la formalización, art. 152 LCSP), y una
 * curada y firmada, que restituye lo que el anuncio dice.
 */

const CSV = readFileSync(resolve('tests/fixtures/ribalicita_contratos_2026-04-19.csv'), 'utf8')
const AVISO = readFileSync(
  resolve('tests/fixtures/placsp_51-2022_anulacion-formalizacion_2026-10-19.txt'),
  'utf8',
)
const ENLACE =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=wdnrdmoJINqmq21uxhbaVQ%3D%3D'
const llano = (s: string) => s.replace(/\s+/g, ' ').trim()

const contratos = parseRibalicitaContracts(CSV)
const fila = (id: string) => contratos.find((c) => c.id === id)!

describe('la capa automática: un estado cancelado no convive con una formalización', () => {
  it('51/2022 sale del parser sin estado, con la palabra de Gobierto guardada', () => {
    expect(fila('1943883').status).toBe('unknown')
    expect(fila('1943883').sourceStatus).toBe('revoked')
  })

  it('sólo toca filas con fecha de formalización y sin lote hermano firmado', () => {
    const tocadas = contratos.filter((c) => c.sourceStatus !== undefined)
    expect(tocadas.map((c) => c.id)).toContain('1943883')
    for (const c of tocadas) {
      expect(c.formalizedDate, c.id).toBeTruthy()
      const hermanos = contratos.filter((x) => x.permalink === c.permalink && x !== c)
      expect(
        hermanos.some((h) => procurementStatusKind(h.status) === 'committed'),
        `${c.id} tiene un lote hermano firmado`,
      ).toBe(false)
    }
  })

  it('un lote desierto junto a un hermano firmado se queda desierto (la fecha es del expediente)', () => {
    const explicados = contratos.filter(
      (c) =>
        CANCELLED_STATUSES.includes(c.status) &&
        c.formalizedDate &&
        contratos.some(
          (x) =>
            x !== c &&
            x.permalink === c.permalink &&
            procurementStatusKind(x.status) === 'committed',
        ),
    )
    // Medido: los hay en el fixture, así que esta prueba mide algo.
    expect(explicados.length).toBeGreaterThan(0)
    for (const c of explicados) expect(c.sourceStatus, c.id).toBeUndefined()
  })

  it('una renuncia sin fecha de formalización se queda renuncia', () => {
    const sinFecha = contratos.filter((c) => c.status === 'revoked' && !c.formalizedDate)
    expect(sinFecha.length).toBeGreaterThan(0)
  })

  it('es una función pura sobre filas ya parseadas', () => {
    const fila0 = {
      id: 'x',
      permalink: 'https://x/1',
      status: 'abandoned',
      formalizedDate: '2024-01-01',
    } as Contract
    const [r] = sinEstadoImposible([fila0])
    expect(r.status).toBe('unknown')
    expect(r.sourceStatus).toBe('abandoned')
    expect(fila0.status).toBe('abandoned') // no muta la entrada
  })
})

function correccion(parcial: Partial<CorreccionContrato> = {}): CorreccionContrato {
  return {
    permalink: ENLACE,
    lote: 0,
    id: '1943883',
    status: 'formalized',
    assignee: 'EIFFAGE ENERGÍA, S.L.U.',
    motivo:
      'El Ayuntamiento anuló el anuncio de formalización, no el contrato, para volver a publicarlo con la financiación FEDER.',
    source: {
      title: 'PLACSP · Anuncio de formalización de contrato, expediente 51/2022',
      url: ENLACE,
      date: '2023-03-22',
      quote: 'Importe total ofertado (sin impuestos) 481.777,6 EUR.',
    },
    motivoSource: {
      title: 'PLACSP · Anulación del anuncio de formalización, expediente 51/2022',
      url: ENLACE,
      date: '2024-01-11',
      quote:
        'Pendiente publicación referida la financiación del contrato a través de los fondos FEDER.',
    },
    curatedBy: 'Sergei Lutchenko',
    curatedAt: '2026-10-19',
    ...parcial,
  }
}
const fichero = (...c: CorreccionContrato[]): ContractCorrections => ({
  note: 'prueba',
  corrections: c,
})

describe('el validador', () => {
  it('admite una corrección citada y firmada', () => {
    expect(() => validateContractCorrections(fichero(correccion()))).not.toThrow()
  })

  it('sólo deja restituir un estado comprometido', () => {
    expect([...ESTADOS_CORREGIDOS].every((s) => procurementStatusKind(s) === 'committed')).toBe(
      true,
    )
    expect(() =>
      validateContractCorrections(fichero(correccion({ status: 'void' as never }))),
    ).toThrow(/status/)
  })

  it('exige la cita literal de los dos anuncios y la firma', () => {
    const sinCita = correccion()
    sinCita.source = { ...sinCita.source, quote: 'corta' }
    expect(() => validateContractCorrections(fichero(sinCita))).toThrow(/quote/)
    expect(() =>
      validateContractCorrections(fichero(correccion({ motivoSource: undefined as never }))),
    ).toThrow(/motivoSource/)
    expect(() => validateContractCorrections(fichero(correccion({ curatedBy: '' })))).toThrow(
      /curatedBy/,
    )
  })

  it('no tiene dónde poner un juicio', () => {
    const conJuicio = { ...correccion(), severity: 'alta' }
    expect(() => validateContractCorrections(fichero(conJuicio as never))).toThrow(/juicio/)
  })

  it('no admite dos correcciones para la misma fila', () => {
    expect(() => validateContractCorrections(fichero(correccion(), correccion()))).toThrow(
      /duplicada/,
    )
  })
})

describe('aplicar una corrección', () => {
  it('restituye 51/2022: firmado, con su adjudicataria y la marca de la corrección', () => {
    const r = applyContractCorrections(contratos, fichero(correccion()))
    const c = r.contracts.find((x) => x.id === '1943883')!
    expect(c.status).toBe('formalized')
    expect(c.assignee).toBe('EIFFAGE ENERGÍA, S.L.U.')
    expect(c.sourceStatus).toBe('revoked')
    expect(c.correccion?.url).toBe(ENLACE)
    expect(r.aplicadas).toEqual([{ permalink: ENLACE, lote: 0, id: '1943883' }])
    expect(r.sobran).toEqual([])
    expect(fila('1943883').status).toBe('unknown') // no muta la entrada
  })

  it('si Gobierto ya la publica bien, sobra y no se toca', () => {
    const arreglado = contratos.map((c) =>
      c.id === '1943883'
        ? { ...c, status: 'formalized' as const, sourceStatus: undefined, assignee: 'EIFFAGE' }
        : c,
    )
    const r = applyContractCorrections(arreglado, fichero(correccion()))
    expect(r.sobran.map((s) => s.porque)).toEqual(['ya-corregida-en-origen'])
    expect(r.contracts.find((x) => x.id === '1943883')!.assignee).toBe('EIFFAGE')
  })

  it('si la fila no está, sobra', () => {
    const r = applyContractCorrections(
      contratos.filter((c) => c.id !== '1943883'),
      fichero(correccion()),
    )
    expect(r.sobran.map((s) => s.porque)).toEqual(['sin-fila'])
  })

  it('si el registro nombra a otra adjudicataria, no se pisa: sobra', () => {
    const otra = contratos.map((c) => (c.id === '1943883' ? { ...c, assignee: 'OTRA SL' } : c))
    const r = applyContractCorrections(otra, fichero(correccion()))
    expect(r.sobran.map((s) => s.porque)).toEqual(['adjudicataria-distinta'])
    expect(r.contracts.find((x) => x.id === '1943883')!.status).toBe('unknown')
  })
})

describe('la guarda', () => {
  const aplicado = applyContractCorrections(contratos, fichero(correccion()))
  const snap = (generatedAt: string, extra: Record<string, unknown> = {}) => ({
    generatedAt,
    contracts: aplicado.contracts,
    contractCorrections: { aplicadas: aplicado.aplicadas, sobran: aplicado.sobran },
    ...extra,
  })

  it('aplicada', () => {
    const [e] = evaluarCorrecciones(fichero(correccion()), snap('2026-10-20T03:00:00Z'))
    expect(e.desenlace).toBe('aplicada')
  })

  it('antes de la primera pasada posterior a la firma: pendiente, no rojo', () => {
    const viejo = { generatedAt: '2026-10-18T09:00:00Z', contracts: contratos }
    const [e] = evaluarCorrecciones(fichero(correccion()), viejo)
    expect(e.desenlace).toBe('pendiente')
  })

  it('una pasada posterior que no la aplicó: no-aplicada', () => {
    const sinCapa = { generatedAt: '2026-10-20T03:00:00Z', contracts: contratos }
    const [e] = evaluarCorrecciones(fichero(correccion()), sinCapa)
    expect(e.desenlace).toBe('no-aplicada')
  })

  it('la que la pasada declaró sobrante: sobra', () => {
    const s = snap('2026-10-20T03:00:00Z', {
      contracts: contratos,
      contractCorrections: {
        aplicadas: [],
        sobran: [{ permalink: ENLACE, lote: 0, id: '1943883', porque: 'ya-corregida-en-origen' }],
      },
    })
    const [e] = evaluarCorrecciones(fichero(correccion()), s)
    expect(e.desenlace).toBe('sobra')
  })
})

describe('el fichero curado comiteado', () => {
  const curado = validateContractCorrections(
    JSON.parse(readFileSync(resolve('public/data/contract-corrections.json'), 'utf8')),
  )

  it('trae la corrección de 51/2022', () => {
    expect(curado.corrections.map((c) => c.id)).toContain('1943883')
  })

  it('cada cita está, literal, en el anuncio de la Plataforma', () => {
    for (const c of curado.corrections.filter((x) => x.permalink === ENLACE)) {
      expect(llano(AVISO)).toContain(llano(c.source.quote))
      expect(llano(AVISO)).toContain(llano(c.motivoSource.quote))
      expect(llano(AVISO)).toContain(llano(c.assignee))
    }
  })

  it('corrige algo hoy: en el fixture de Gobierto, la fila figura cancelada', () => {
    for (const c of curado.corrections) {
      const crudo = contratos.find((x) => x.permalink === c.permalink && x.batchNumber === c.lote)
      expect(crudo, `${c.id} no está en el fixture`).toBeDefined()
      expect(CANCELLED_STATUSES).toContain(crudo!.sourceStatus ?? crudo!.status)
    }
  })
})

describe('lo que el verificador deduce de 51/2022', () => {
  const claim: PlenoClaim = {
    id: 'led-001-cit-abc123',
    plenoId: 'led',
    plenoDate: '2026-03-09',
    segmentIndex: 0,
    type: 'cita_obra',
    speakerGroup: 'PSOE',
    verbatim: 'el cambio a tecnología LED del alumbrado del casco urbano ya está terminado',
    context: 'contexto contexto contexto contexto contexto',
    topic: 'urbanismo',
    entities: { referencedEntity: 'alumbrado público casco urbano tecnología LED' },
    confidence: 0.8,
    reasoning: 'cita de obra',
    requiresHumanApproval: true,
  }

  it('con la capa automática ya no lo desmiente', () => {
    const v = verifyClaim({ claim, tenders: { contracts: [fila('1943883')] } })
    expect(v.verdict).not.toBe('contradicho')
  })

  it('y con la corrección, tampoco', () => {
    const r = applyContractCorrections(contratos, fichero(correccion()))
    const v = verifyClaim({
      claim,
      tenders: { contracts: [r.contracts.find((x) => x.id === '1943883')!] },
    })
    expect(v.verdict).not.toBe('contradicho')
  })
})
