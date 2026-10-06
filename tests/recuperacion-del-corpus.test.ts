import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildTenderRows, CLAVE_DE_LICITACION } from '../scripts/embed-verifier-corpus'
import { mergeShortlists } from '../src/scraper/semantic-shortlist'
import { snippetDeContrato } from '../src/scraper/snippet-de-contrato'
import type { CandidateShortlist } from '../src/scraper/claim-verifier'

/**
 * Lo que el corpus semántico y la lista corta híbrida dejaban fuera, medido el
 * 06-10-2026 tras la lectura de las 52 (editorial/rederivacion-0410-52/INFORME.md
 * §4 f): registros buenos que no llegaban nunca al modelo.
 */
const F = JSON.parse(
  readFileSync(resolve('tests/fixtures/corpus-del-verificador_2026-10-06.json'), 'utf8'),
)
const contrato = (id: string) =>
  (F.contracts as Record<string, unknown>[]).find((r) => r.id === id)!
const licitacion = (id: string) =>
  (F.tenders as Record<string, unknown>[]).find((r) => r.id === id)!

describe('una licitación cuyo id repite el de un contrato', () => {
  it('entra en el corpus si trae otro objeto: las dos filas de ESDA1/2025 y la de 136/2025', () => {
    const filas = buildTenderRows(F)
    const textos = filas.map((f) => f.text)
    for (const id of ['4889055', '4930957', '4653394']) {
      const titulo = String(licitacion(id).title)
      expect(textos.some((t) => t.startsWith(titulo))).toBe(true)
    }
    // Cada fila con su clave: la caché las guarda por `kind:sourceId`.
    expect(new Set(filas.map((f) => f.sourceId)).size).toBe(filas.length)
  })

  it('entra si su importe de licitación no es el del contrato: el total de los seis lotes de 53/2022', () => {
    const filas = buildTenderRows(F)
    const fila = filas.find((f) => f.sourceId === CLAVE_DE_LICITACION + '1945526')
    expect(fila?.snippet).toContain('expediente 53/2022')
    expect(fila?.snippet).toContain('122.545,68 €')
  })

  it('no entra si repite el objeto y los importes de su contrato: 34/2022 no añade nada', () => {
    // Medido el 06-10-2026: 336 licitaciones así. Con ellas dentro, cada una
    // volvía a la lista corta pegada a su contrato —el mismo título, casi el
    // mismo vector— y los gemelos ocupaban una de cada seis plazas.
    const filas = buildTenderRows(F)
    expect(filas.find((f) => f.sourceId === CLAVE_DE_LICITACION + '1946071')).toBeUndefined()
    const titulo = String(contrato('1946071').title)
    expect(filas.filter((f) => f.text.startsWith(titulo)).map((f) => f.sourceId)).toEqual([
      '1946071',
    ])
  })

  it('el contrato conserva su clave de siempre', () => {
    const filas = buildTenderRows(F)
    const titulo = String(contrato('4653394#1').title)
    expect(filas.find((f) => f.text.startsWith(titulo))?.sourceId).toBe('4653394#1')
  })
})

describe('el texto que se embebe', () => {
  it('lleva la adjudicataria, que es por lo que una declaración la nombra', () => {
    const [auditesa] = buildTenderRows({ contracts: [contrato('4653394#1')] })
    expect(auditesa.text).toContain('AUDITESA SL')
  })
})

describe('mergeShortlists con los lotes de un mismo expediente', () => {
  const garbialdi: CandidateShortlist = {
    kind: 'tender',
    ref: String(contrato('4653394').permalink),
    snippet: snippetDeContrato(contrato('4653394')),
    similarity: 0.52,
  }
  const auditesa: CandidateShortlist = {
    kind: 'tender',
    ref: String(contrato('4653394#1').permalink),
    snippet: snippetDeContrato(contrato('4653394#1')),
    similarity: 0.45,
  }

  it('los dos lotes comparten permalink y sobreviven los dos', () => {
    expect(garbialdi.ref).toBe(auditesa.ref)
    const merged = mergeShortlists([[garbialdi], [auditesa]], 8)
    expect(merged.map((c) => c.snippet)).toEqual([garbialdi.snippet, auditesa.snippet])
  })

  it('el mismo candidato traído por las dos mitades sale una vez, con la similitud mayor', () => {
    const merged = mergeShortlists([[garbialdi], [{ ...garbialdi, similarity: 0.6 }]], 8)
    expect(merged).toEqual([{ ...garbialdi, similarity: 0.6 }])
  })
})
