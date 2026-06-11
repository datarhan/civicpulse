/**
 * BOE adapter contract tests (Package 2B).
 *
 * Real shape probed: `epigrafe` and `item` are sometimes single objects,
 * sometimes arrays. These tests pin both shapes + the title-match filter
 * + the fetcher's day-walking behaviour.
 */
import { describe, expect, it } from 'vitest'

import { parseBoeSumario, type ApiSumarioResponse } from '../src/scraper/boe'
import { fetchBoeRows } from '../src/scraper/boe-fetch'

function makeSumario(
  items: Array<{ identificador: string; titulo: string }>,
  fecha = '20260515',
): ApiSumarioResponse {
  return {
    status: { code: '200' },
    data: {
      sumario: {
        metadatos: { fecha_publicacion: fecha },
        diario: [
          {
            seccion: [
              {
                nombre: 'III. Otras disposiciones',
                departamento: [
                  {
                    nombre: 'AYUNTAMIENTO DE RIBA-ROJA DE TÚRIA',
                    epigrafe: [
                      {
                        nombre: 'Subvenciones',
                        item: items.map((it) => ({
                          identificador: it.identificador,
                          titulo: it.titulo,
                          url_html: `https://www.boe.es/diario_boe/txt.php?id=${it.identificador}`,
                          url_pdf: {
                            texto: `https://www.boe.es/boe/dias/2026/05/15/pdfs/${it.identificador}.pdf`,
                          },
                        })),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  }
}

describe('parseBoeSumario', () => {
  it('keeps only items whose titulo mentions Riba-roja', () => {
    const payload = makeSumario([
      {
        identificador: 'BOE-A-2026-10000',
        titulo: 'Resolución sobre Madrid centro · expropiación de un edificio histórico.',
      },
      {
        identificador: 'BOE-A-2026-10001',
        titulo: 'Convenio del Ayuntamiento de Riba-roja de Túria con la GVA · DANA recovery 2026.',
      },
      {
        identificador: 'BOE-A-2026-10002',
        titulo: 'Subvención nominativa al Ayuntamiento de Ribarroja (sin guión).',
      },
    ])
    const rows = parseBoeSumario(payload)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.identificador).sort()).toEqual([
      'BOE-A-2026-10001',
      'BOE-A-2026-10002',
    ])
  })

  it('parses the publicacionDate as ISO UTC midnight', () => {
    const payload = makeSumario([
      {
        identificador: 'BOE-A-2026-10003',
        titulo: 'Convenio Riba-roja',
      },
    ])
    const rows = parseBoeSumario(payload)
    expect(rows[0].publicacionDate).toBe('2026-05-15T00:00:00.000Z')
  })

  it('truncates very long titulos to 480 chars', () => {
    const longTitle = `Convenio del Ayuntamiento de Riba-roja · ${'lorem '.repeat(100)}`
    const payload = makeSumario([
      {
        identificador: 'BOE-A-2026-10004',
        titulo: longTitle,
      },
    ])
    const rows = parseBoeSumario(payload)
    expect(rows[0].titulo.length).toBeLessThanOrEqual(480)
  })

  it('accepts a single object where the API would normally use an array', () => {
    const payload: ApiSumarioResponse = {
      status: { code: '200' },
      data: {
        sumario: {
          metadatos: { fecha_publicacion: '20260514' },
          diario: {
            seccion: {
              nombre: 'V. Anuncios',
              departamento: {
                nombre: 'AYUNTAMIENTO DE RIBA-ROJA',
                epigrafe: {
                  nombre: 'Concursos públicos',
                  item: {
                    identificador: 'BOE-B-2026-99999',
                    titulo: 'Adjudicación a una UTE en Riba-roja de Túria.',
                    url_html: 'https://www.boe.es/diario_boe/txt.php?id=BOE-B-2026-99999',
                    url_pdf: { texto: 'https://www.boe.es/boe/.../BOE-B-2026-99999.pdf' },
                  },
                },
              },
            },
          },
        },
      },
    }
    const rows = parseBoeSumario(payload)
    expect(rows).toHaveLength(1)
    expect(rows[0].identificador).toBe('BOE-B-2026-99999')
    expect(rows[0].epigrafe).toBe('Concursos públicos')
  })

  it('deduplicates by identificador', () => {
    const payload = makeSumario([
      { identificador: 'BOE-A-2026-10005', titulo: 'Subvención Riba-roja' },
      { identificador: 'BOE-A-2026-10005', titulo: 'Subvención Riba-roja (dup)' },
    ])
    const rows = parseBoeSumario(payload)
    expect(rows).toHaveLength(1)
  })

  it('returns empty array on missing payload', () => {
    expect(parseBoeSumario({})).toEqual([])
    expect(parseBoeSumario({ data: {} })).toEqual([])
  })

  it('skips items with no titulo or identificador', () => {
    const payload: ApiSumarioResponse = {
      status: { code: '200' },
      data: {
        sumario: {
          metadatos: { fecha_publicacion: '20260515' },
          diario: [
            {
              seccion: [
                {
                  nombre: 'III',
                  departamento: [
                    {
                      nombre: 'AYTO',
                      epigrafe: [
                        {
                          nombre: 'X',
                          item: [
                            { identificador: '', titulo: 'Riba-roja sin id' },
                            { identificador: 'BOE-A-2026-99', titulo: '' },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    }
    expect(parseBoeSumario(payload)).toEqual([])
  })

  it('handles items hanging directly off departamento (no epigrafe)', () => {
    const payload: ApiSumarioResponse = {
      status: { code: '200' },
      data: {
        sumario: {
          metadatos: { fecha_publicacion: '20260515' },
          diario: [
            {
              seccion: [
                {
                  nombre: 'III',
                  departamento: [
                    {
                      nombre: 'AYTO',
                      item: {
                        identificador: 'BOE-A-2026-77',
                        titulo: 'Convenio Riba-roja sin epigrafe',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    }
    const rows = parseBoeSumario(payload)
    expect(rows).toHaveLength(1)
    expect(rows[0].epigrafe).toBe('')
  })
})

describe('fetchBoeRows (mocked)', () => {
  it('walks N days, skips non-200 days, returns sorted rows', async () => {
    const calls: string[] = []
    const fetchImpl = async (url: string) => {
      calls.push(url)
      const stamp = url.match(/sumario\/(\d{8})/)?.[1] ?? ''
      if (stamp.endsWith('14')) {
        return new Response('not found', { status: 404 }) as unknown as Response
      }
      const items = [
        {
          identificador: `BOE-A-2026-${stamp}`,
          titulo: `Riba-roja anuncio del ${stamp}`,
        },
      ]
      return new Response(JSON.stringify(makeSumario(items, stamp)), {
        status: 200,
      }) as unknown as Response
    }
    const now = new Date(Date.UTC(2026, 4, 15))
    const { rows, daysFetched, daysWithMatches } = await fetchBoeRows({
      days: 3,
      now,
      fetchImpl,
      delayMs: 0,
    })
    expect(calls).toHaveLength(3)
    expect(calls[0]).toContain('20260515')
    expect(calls[1]).toContain('20260514')
    expect(calls[2]).toContain('20260513')
    expect(daysFetched).toBe(2)
    expect(daysWithMatches).toBe(2)
    expect(rows).toHaveLength(2)
    expect(rows[0].publicacionDate >= rows[1].publicacionDate).toBe(true)
  })

  it('skips days where status.code !== "200"', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ status: { code: '404' } }), {
        status: 200,
      }) as unknown as Response
    const { rows, daysFetched } = await fetchBoeRows({
      days: 2,
      now: new Date(Date.UTC(2026, 4, 15)),
      fetchImpl,
      delayMs: 0,
    })
    expect(rows).toEqual([])
    expect(daysFetched).toBe(0)
  })
})
