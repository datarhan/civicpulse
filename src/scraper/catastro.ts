/**
 * Catastro (OVC) adapter — Spanish cadastre lookup helper.
 *
 * Wraps two endpoints of the public Catastro REST service:
 *
 *   · Consulta_DNPLOC   look up parcels by Provincia + Municipio +
 *                       Sigla (CL/AV/PL) + Calle + Numero. Used by
 *                       curators when a press claim cites a specific
 *                       address ("la finca de calle Mayor 14…").
 *   · Consulta_DNPRC    look up a single parcel by RefCat (the 20-char
 *                       cadastral reference). Used when the source
 *                       already names the parcel.
 *
 * Status: curator-only helper, NOT wired into the auto-verifier yet.
 * Catastro's API is brittle (WCF stack returns HTML help pages on
 * malformed requests; municipio spellings vary between "RIBA-ROJA DE
 * TURIA" and "RIBARROJA"); libel discipline is to surface results
 * to a human, not to auto-stamp evidence rows from a flaky lookup.
 *
 * Free, no auth. Polite usage: <60 req/min in batch contexts.
 */
import { createHash } from 'node:crypto'

const BASE = 'http://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json'
const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

const MUNICIPIO_DEFAULT = 'RIBA-ROJA DE TURIA'
const PROVINCIA_DEFAULT = 'VALENCIA'

/** A normalised parcel result from either endpoint. */
export interface CatastroParcel {
  /** sha256(refCatastral) first 12 chars. */
  id: string
  /** 20-char cadastral reference. */
  refCatastral: string
  /** Address line as Catastro returns it (verbatim). */
  direccion: string
  /** Postal code when present. */
  cp: string | null
  /** Use class label (e.g. "Residencial", "Comercial", "Suelo sin edif"). */
  uso: string | null
  /** Surface area in m², when present. */
  superficie: number | null
  /** Lookup origin — useful for the curator audit trail. */
  origin: 'address' | 'refCat'
}

/** Lookup result envelope: either a list of parcels, an error, or both empty. */
export interface CatastroLookupResult {
  ok: boolean
  parcels: CatastroParcel[]
  /** Catastro error code + message when ok=false. */
  error: { code: string; description: string } | null
  /** The raw query parameters echoed back so audit logs make sense. */
  query: Record<string, string>
}

interface ApiControl {
  cuerr?: number
  cudnp?: number
}
interface ApiErr {
  cod?: string
  des?: string
}
interface ApiDirParcel {
  rc?: { pc1?: string; pc2?: string; car?: string; cc1?: string; cc2?: string }
  dt?: {
    locs?: {
      lous?: {
        lourb?: {
          dir?: { cv?: string; tv?: string; nv?: string; pnp?: string }
          loint?: { es?: string; pt?: string; pu?: string }
          dp?: string
        }
      }
    }
  }
}
interface ApiBienInmuebleDir {
  bi?: {
    idbi?: { rc?: { pc1?: string; pc2?: string; car?: string; cc1?: string; cc2?: string } }
    dt?: ApiDirParcel['dt']
    debi?: { luso?: string; sfc?: number }
  }
}
interface ApiDnplocResponse {
  consulta_dnplocResult?: {
    control?: ApiControl
    lerr?: ApiErr[]
    bico?: ApiBienInmuebleDir
    lrcdnp?: { rcdnp?: ApiDirParcel | ApiDirParcel[] }
  }
}
interface ApiDnprcResponse {
  consulta_dnprcResult?: {
    control?: ApiControl
    lerr?: ApiErr[]
    bico?: ApiBienInmuebleDir
    lrcdnp?: { rcdnp?: ApiDirParcel | ApiDirParcel[] }
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12)
}

function refCatFromRc(
  rc: { pc1?: string; pc2?: string; car?: string; cc1?: string; cc2?: string } | undefined,
): string {
  if (!rc) return ''
  return `${rc.pc1 ?? ''}${rc.pc2 ?? ''}${rc.car ?? ''}${rc.cc1 ?? ''}${rc.cc2 ?? ''}`
}

function buildDireccion(p: ApiDirParcel): string {
  const dir = p.dt?.locs?.lous?.lourb?.dir
  if (!dir) return ''
  const parts = [dir.tv, dir.nv, dir.pnp].filter(Boolean)
  return parts.join(' ')
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function buildError(envelope: { control?: ApiControl; lerr?: ApiErr[] } | undefined): {
  code: string
  description: string
} | null {
  if (!envelope) return null
  const errs = envelope.lerr ?? []
  if (errs.length === 0) return null
  const head = errs[0]
  return { code: head.cod ?? '?', description: head.des ?? '' }
}

function projectAddressParcel(p: ApiDirParcel): CatastroParcel | null {
  const refCat = refCatFromRc(p.rc)
  if (!refCat) return null
  const direccion = buildDireccion(p)
  return {
    id: sha256(refCat),
    refCatastral: refCat,
    direccion,
    cp: p.dt?.locs?.lous?.lourb?.dp ?? null,
    uso: null,
    superficie: null,
    origin: 'address',
  }
}

function projectRefCatParcel(bico: ApiBienInmuebleDir | undefined): CatastroParcel | null {
  if (!bico?.bi) return null
  const refCat = refCatFromRc(bico.bi.idbi?.rc)
  if (!refCat) return null
  const direccion = bico.bi.dt
    ? buildDireccion({ dt: bico.bi.dt } as ApiDirParcel)
    : ''
  return {
    id: sha256(refCat),
    refCatastral: refCat,
    direccion,
    cp: bico.bi.dt?.locs?.lous?.lourb?.dp ?? null,
    uso: bico.bi.debi?.luso ?? null,
    superficie: bico.bi.debi?.sfc ?? null,
    origin: 'refCat',
  }
}

// ─── Parsers (pure) ─────────────────────────────────────────────────────────

export function parseDnplocResponse(
  payload: ApiDnplocResponse,
  query: Record<string, string>,
): CatastroLookupResult {
  const env = payload?.consulta_dnplocResult
  const error = buildError(env)
  if (!env || error) {
    return { ok: false, parcels: [], error, query }
  }
  const parcels: CatastroParcel[] = []
  for (const p of asArray(env.lrcdnp?.rcdnp)) {
    const proj = projectAddressParcel(p)
    if (proj) parcels.push(proj)
  }
  const single = projectRefCatParcel(env.bico)
  if (single) parcels.push({ ...single, origin: 'address' })
  return { ok: parcels.length > 0, parcels, error: null, query }
}

export function parseDnprcResponse(
  payload: ApiDnprcResponse,
  query: Record<string, string>,
): CatastroLookupResult {
  const env = payload?.consulta_dnprcResult
  const error = buildError(env)
  if (!env || error) {
    return { ok: false, parcels: [], error, query }
  }
  const parcels: CatastroParcel[] = []
  const single = projectRefCatParcel(env.bico)
  if (single) parcels.push(single)
  return { ok: parcels.length > 0, parcels, error: null, query }
}

// ─── Fetchers ───────────────────────────────────────────────────────────────

export interface AddressLookupOpts {
  provincia?: string
  municipio?: string
  sigla: string // CL = calle, AV = avenida, PL = plaza, …
  calle: string
  numero: number | string
  fetchImpl?: typeof fetch
}

export async function queryByAddress(opts: AddressLookupOpts): Promise<CatastroLookupResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const provincia = opts.provincia ?? PROVINCIA_DEFAULT
  const municipio = opts.municipio ?? MUNICIPIO_DEFAULT
  const params = new URLSearchParams({
    Provincia: provincia,
    Municipio: municipio,
    Sigla: opts.sigla,
    Calle: opts.calle,
    Numero: String(opts.numero),
  })
  const url = `${BASE}/Consulta_DNPLOC?${params}`
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) {
    return {
      ok: false,
      parcels: [],
      error: { code: String(res.status), description: `HTTP ${res.status}` },
      query: Object.fromEntries(params),
    }
  }
  const text = await res.text()
  if (text.trim().startsWith('<')) {
    return {
      ok: false,
      parcels: [],
      error: { code: 'XML', description: 'Catastro returned HTML/XML (likely malformed query)' },
      query: Object.fromEntries(params),
    }
  }
  return parseDnplocResponse(JSON.parse(text) as ApiDnplocResponse, Object.fromEntries(params))
}

export interface RefCatLookupOpts {
  refCatastral: string
  fetchImpl?: typeof fetch
}

export async function queryByRefCat(opts: RefCatLookupOpts): Promise<CatastroLookupResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const params = new URLSearchParams({ RefCat: opts.refCatastral })
  const url = `${BASE}/Consulta_DNPRC?${params}`
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) {
    return {
      ok: false,
      parcels: [],
      error: { code: String(res.status), description: `HTTP ${res.status}` },
      query: Object.fromEntries(params),
    }
  }
  const text = await res.text()
  if (text.trim().startsWith('<')) {
    return {
      ok: false,
      parcels: [],
      error: { code: 'XML', description: 'Catastro returned HTML/XML (likely malformed query)' },
      query: Object.fromEntries(params),
    }
  }
  return parseDnprcResponse(JSON.parse(text) as ApiDnprcResponse, Object.fromEntries(params))
}
