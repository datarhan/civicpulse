/**
 * La licitación de un sistema dinámico de adquisición (SDA) como registro de una
 * subida firmada.
 *
 * Un SDA no se adjudica como un contrato: es un procedimiento que queda abierto
 * años, y sus contratos son los derivados. Para lo que se dice de un SDA, la
 * licitación ES el registro. El caso: qz6weg-184 (pleno del 01-12-2025), que
 * habla de los SDA «abiertos a otros ayuntamientos»; lo que encaja es la
 * licitación ESDA1/2025, sin contrato propio.
 *
 * La fixture es un trozo de `public/data/tenders.json` del 10-10-2026, tal cual:
 * las dos filas de ESDA1/2025 (dos codificaciones del mismo enlace de PLACSP, una
 * «abandoned» y otra «provisionally_awarded»), la de ESDA2/2022, una licitación
 * que no es un SDA y no tiene contrato, y dos contratos derivados de 2026.
 * Diseño: docs/superpowers/specs/2026-10-10-licitacion-sda-design.md.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  comprobarRegistrosConLaDeclaracion,
  evidenciaDelRegistro,
  registroDeLaSubida,
  subirVeredicto,
} from '../src/scraper/subida-firmada'

const SDA = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/sda-licitaciones_2026-10-10.json'), 'utf8'),
)
const CORPUS = { tenders: SDA.tenders, bdns: null }
const ESDA1 =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=2N0awhGNBRR%2FR5QFTlaM4A%3D%3D'
const ESDA1_OTRA =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink%3Adetalle_licitacion&idEvl=2N0awhGNBRR%2FR5QFTlaM4A%3D%3D'
const NO_SDA =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=2RZHIgcWJEKqb7rCcv76BA%3D%3D'
const TITULO = SDA.tenders.tenders
  .find((t: { id: string }) => t.id === '4930957')
  .title.replace(/\s+/g, ' ')
  .trim()
const PERSONA = 'María de la Fuente Llorens'

const pedida = (enlace: string, lote: number | null = null) => ({ enlace, lote })

describe('registroDeLaSubida · la licitación de un SDA', () => {
  it('el título entero, el expediente y la fecha de apertura; nunca el estado, el importe ni «adjudicado»', () => {
    const r = registroDeLaSubida(pedida(ESDA1), CORPUS)
    expect(r.fila).toEqual({
      kind: 'licitacion',
      ref: ESDA1,
      snippet: `Licitación de un sistema dinámico de adquisición · ${TITULO} · expediente ESDA1/2025 · ofertas desde el 08-08-2025`,
      stance: 'checked',
    })
    expect(r.fecha).toBe('2025-08-08')
    expect(r.diceImporte).toBe(false)
    expect(r.fila.snippet).not.toMatch(/adjudicad|desistid|abandon|provisional|€|3\.000\.000/i)
  })

  it('el título no se corta: la cláusula que importa está más allá de los 240 caracteres', () => {
    const { snippet } = evidenciaDelRegistro(pedida(ESDA1), CORPUS)
    expect(snippet.length).toBeGreaterThan(240)
    expect(snippet).toContain(
      'abierto a otras entidades públicas mediante el sistema de compra conjunta esporádica',
    )
  })

  it('las dos codificaciones del enlace llevan al mismo registro, y la fila guarda un enlace del corpus', () => {
    const a = evidenciaDelRegistro(pedida(ESDA1), CORPUS)
    const b = evidenciaDelRegistro(pedida(ESDA1_OTRA), CORPUS)
    expect(b.snippet).toBe(a.snippet)
    expect([ESDA1, ESDA1_OTRA]).toContain(b.ref)
  })

  it('dos filas del mismo registro que no dicen lo mismo se niegan', () => {
    const tenders = structuredClone(SDA.tenders)
    tenders.tenders.find((t: { id: string }) => t.id === '4930957').openProposalsDate = '2025-09-01'
    expect(() => evidenciaDelRegistro(pedida(ESDA1), { tenders, bdns: null })).toThrow(
      /no dicen lo mismo/,
    )
  })

  it('una licitación que no es un SDA sigue sin citarse', () => {
    expect(() => evidenciaDelRegistro(pedida(NO_SDA), CORPUS)).toThrow(/adjudicado ni formalizado/)
  })

  it('la licitación de un contrato derivado no es el SDA, aunque lo nombre', () => {
    const tenders = structuredClone(SDA.tenders)
    tenders.tenders.find((t: { id: string }) => t.id === '4333841').title =
      'Contrato para el servicio de consultoría, contrato derivado del Sistema Dinámico de Adquisición de servicios de arquitectura e ingeniería'
    expect(() => evidenciaDelRegistro(pedida(NO_SDA), { tenders, bdns: null })).toThrow(
      /adjudicado ni formalizado/,
    )
  })

  it('--lote con un SDA se niega: no tiene lotes que elegir', () => {
    expect(() => evidenciaDelRegistro(pedida(ESDA1, 2), CORPUS)).toThrow(/--lote/)
  })
})

describe('comprobarRegistrosConLaDeclaracion · un SDA', () => {
  const sda = () => registroDeLaSubida(pedida(ESDA1), CORPUS)

  it('abierto después de la declaración, no la sostiene', () => {
    expect(() =>
      comprobarRegistrosConLaDeclaracion(
        [sda()],
        { fecha: '2025-07-01', conImporte: false },
        'parcial',
      ),
    ).toThrow(/posterior/)
  })

  it('abierto antes, sí', () => {
    expect(() =>
      comprobarRegistrosConLaDeclaracion(
        [sda()],
        { fecha: '2025-12-01', conImporte: false },
        'verificado',
      ),
    ).not.toThrow()
  })

  it('no dice importe: con una cifra en la declaración no llega a verificado', () => {
    expect(() =>
      comprobarRegistrosConLaDeclaracion(
        [sda()],
        { fecha: '2025-12-01', conImporte: true },
        'verificado',
      ),
    ).toThrow(/importe/)
  })
})

describe('la subida que cita un SDA', () => {
  it('se escribe con el corpus de los contratos, y la fila es una licitación', () => {
    const overlay = subirVeredicto(
      { version: 1, generatedAt: '2026-10-10T00:00:00.000Z', entries: {} },
      {
        claimId: 'qz6weg-184-cit-8629f9',
        veredicto: 'parcial',
        evidencia: [evidenciaDelRegistro(pedida(ESDA1), CORPUS)],
        resumen:
          'El Ayuntamiento licitó en agosto de 2025 un sistema dinámico de adquisición abierto a otras entidades públicas; la bolsa de autónomos no consta.',
        editor: PERSONA,
      },
      { tipo: 'cita_obra', publicado: 'sin-datos', resumenesDeMaquina: [] },
      '2026-10-10T09:00:00.000Z',
    )
    const v = overlay.entries['qz6weg-184-cit-8629f9'].verification
    expect(v.checkedAgainst).toEqual(['tenders'])
    expect(v.evidence[0].kind).toBe('licitacion')
  })
})
