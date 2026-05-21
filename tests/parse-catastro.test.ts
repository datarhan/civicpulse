/**
 * Catastro adapter contract tests (Package 2D).
 *
 * Live probes confirmed the JSON envelopes for both endpoints:
 *   Consulta_DNPLOC  → {consulta_dnplocResult: {control, lerr, bico, lrcdnp}}
 *   Consulta_DNPRC   → {consulta_dnprcResult:  {control, lerr, bico, lrcdnp}}
 *
 * Error paths are well-exercised in production (Catastro returns
 * structured errors with cod="22" / "33" / "4"); the parsers must
 * surface those cleanly without throwing.
 */
import { describe, expect, it } from 'vitest'

import {
  parseDnplocResponse,
  parseDnprcResponse,
  queryByAddress,
  queryByRefCat,
} from '../src/scraper/catastro'

describe('parseDnplocResponse', () => {
  it('emits an error result when Catastro signals an error', () => {
    const payload = {
      consulta_dnplocResult: {
        control: { cuerr: 1 },
        lerr: [{ cod: '33', des: 'LA VÍA NO EXISTE' }],
      },
    }
    const result = parseDnplocResponse(payload, { Provincia: 'VALENCIA' })
    expect(result.ok).toBe(false)
    expect(result.parcels).toEqual([])
    expect(result.error).toEqual({ code: '33', description: 'LA VÍA NO EXISTE' })
  })

  it('projects an lrcdnp list of parcels onto the normalised shape', () => {
    const payload = {
      consulta_dnplocResult: {
        control: { cuerr: 0, cudnp: 2 },
        lrcdnp: {
          rcdnp: [
            {
              rc: { pc1: '4720001', pc2: 'YJ2742S', car: '0001', cc1: 'J', cc2: 'F' },
              dt: {
                locs: {
                  lous: {
                    lourb: { dir: { tv: 'CL', nv: 'MAYOR', pnp: '14' }, dp: '46190' },
                  },
                },
              },
            },
            {
              rc: { pc1: '4720002', pc2: 'YJ2742S', car: '0001', cc1: 'K', cc2: 'G' },
              dt: {
                locs: {
                  lous: {
                    lourb: { dir: { tv: 'CL', nv: 'MAYOR', pnp: '16' }, dp: '46190' },
                  },
                },
              },
            },
          ],
        },
      },
    }
    const result = parseDnplocResponse(payload, { Provincia: 'VALENCIA' })
    expect(result.ok).toBe(true)
    expect(result.parcels).toHaveLength(2)
    expect(result.parcels[0].refCatastral).toBe('4720001YJ2742S0001JF')
    expect(result.parcels[0].direccion).toBe('CL MAYOR 14')
    expect(result.parcels[0].cp).toBe('46190')
    expect(result.parcels[0].origin).toBe('address')
  })

  it('accepts a single rcdnp object (the API switches between object/array)', () => {
    const payload = {
      consulta_dnplocResult: {
        control: { cuerr: 0, cudnp: 1 },
        lrcdnp: {
          rcdnp: {
            rc: { pc1: '4720001', pc2: 'YJ2742S', car: '0001', cc1: 'J', cc2: 'F' },
            dt: {
              locs: {
                lous: { lourb: { dir: { tv: 'CL', nv: 'MAYOR', pnp: '14' }, dp: '46190' } },
              },
            },
          },
        },
      },
    }
    const result = parseDnplocResponse(payload, {})
    expect(result.parcels).toHaveLength(1)
    expect(result.parcels[0].refCatastral).toBe('4720001YJ2742S0001JF')
  })

  it('skips parcels with no rc reference', () => {
    const payload = {
      consulta_dnplocResult: {
        control: { cuerr: 0 },
        lrcdnp: { rcdnp: [{ dt: {} }] },
      },
    }
    const result = parseDnplocResponse(payload, {})
    expect(result.ok).toBe(false)
    expect(result.parcels).toEqual([])
  })
})

describe('parseDnprcResponse', () => {
  it('projects a single bico (Bien Inmueble) onto CatastroParcel', () => {
    const payload = {
      consulta_dnprcResult: {
        control: { cuerr: 0 },
        bico: {
          bi: {
            idbi: {
              rc: { pc1: '4720001', pc2: 'YJ2742S', car: '0001', cc1: 'J', cc2: 'F' },
            },
            dt: {
              locs: {
                lous: { lourb: { dir: { tv: 'CL', nv: 'MAYOR', pnp: '14' }, dp: '46190' } },
              },
            },
            debi: { luso: 'Residencial', sfc: 220 },
          },
        },
      },
    }
    const result = parseDnprcResponse(payload, { RefCat: '4720001YJ2742S0001JF' })
    expect(result.ok).toBe(true)
    expect(result.parcels).toHaveLength(1)
    const [p] = result.parcels
    expect(p.refCatastral).toBe('4720001YJ2742S0001JF')
    expect(p.direccion).toBe('CL MAYOR 14')
    expect(p.uso).toBe('Residencial')
    expect(p.superficie).toBe(220)
    expect(p.origin).toBe('refCat')
  })

  it('emits an error result on malformed RefCat', () => {
    const payload = {
      consulta_dnprcResult: {
        control: { cuerr: 1 },
        lerr: [{ cod: '4', des: 'LA REFERENCIA CATASTRAL NO ESTÁ CORRECTAMENTE FORMADA' }],
      },
    }
    const result = parseDnprcResponse(payload, { RefCat: 'BAD' })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('4')
  })

  it('returns ok=false when bico is missing entirely', () => {
    const result = parseDnprcResponse({ consulta_dnprcResult: { control: { cuerr: 0 } } }, {})
    expect(result.ok).toBe(false)
    expect(result.parcels).toEqual([])
  })
})

describe('queryByAddress (mocked)', () => {
  it('POSTs the DNPLOC URL and returns a parsed result', async () => {
    let calledUrl = ''
    const fetchImpl = async (url: string) => {
      calledUrl = url
      return new Response(
        JSON.stringify({
          consulta_dnplocResult: {
            control: { cuerr: 0, cudnp: 1 },
            lrcdnp: {
              rcdnp: {
                rc: { pc1: '4720001', pc2: 'YJ2742S', car: '0001', cc1: 'J', cc2: 'F' },
                dt: {
                  locs: {
                    lous: { lourb: { dir: { tv: 'CL', nv: 'MAYOR', pnp: '14' }, dp: '46190' } },
                  },
                },
              },
            },
          },
        }),
        { status: 200 },
      ) as unknown as Response
    }
    const result = await queryByAddress({
      sigla: 'CL',
      calle: 'MAYOR',
      numero: 14,
      fetchImpl,
    })
    expect(calledUrl).toContain('Consulta_DNPLOC')
    expect(calledUrl).toContain('Provincia=VALENCIA')
    expect(calledUrl).toContain('Municipio=RIBA-ROJA+DE+TURIA')
    expect(calledUrl).toContain('Calle=MAYOR')
    expect(result.ok).toBe(true)
    expect(result.parcels[0].refCatastral).toBe('4720001YJ2742S0001JF')
  })

  it('returns a structured error when Catastro returns the WCF HTML help page', async () => {
    const fetchImpl = async () =>
      new Response('<?xml version="1.0"?><html>service help</html>', {
        status: 200,
      }) as unknown as Response
    const result = await queryByAddress({
      sigla: 'CL',
      calle: 'MAYOR',
      numero: 14,
      fetchImpl,
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('XML')
  })

  it('returns an error on non-2xx HTTP', async () => {
    const fetchImpl = async () =>
      new Response('rate limited', { status: 429 }) as unknown as Response
    const result = await queryByAddress({
      sigla: 'CL',
      calle: 'X',
      numero: 1,
      fetchImpl,
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('429')
  })
})

describe('queryByRefCat (mocked)', () => {
  it('targets DNPRC + parses bico', async () => {
    let calledUrl = ''
    const fetchImpl = async (url: string) => {
      calledUrl = url
      return new Response(
        JSON.stringify({
          consulta_dnprcResult: {
            control: { cuerr: 0 },
            bico: {
              bi: {
                idbi: {
                  rc: { pc1: '4720001', pc2: 'YJ2742S', car: '0001', cc1: 'J', cc2: 'F' },
                },
                debi: { luso: 'Residencial', sfc: 220 },
              },
            },
          },
        }),
        { status: 200 },
      ) as unknown as Response
    }
    const result = await queryByRefCat({
      refCatastral: '4720001YJ2742S0001JF',
      fetchImpl,
    })
    expect(calledUrl).toContain('Consulta_DNPRC')
    expect(calledUrl).toContain('RefCat=4720001YJ2742S0001JF')
    expect(result.ok).toBe(true)
    expect(result.parcels[0].uso).toBe('Residencial')
    expect(result.parcels[0].superficie).toBe(220)
  })
})
