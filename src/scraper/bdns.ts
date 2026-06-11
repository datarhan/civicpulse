/**
 * Parse BDNS "convocatorias" payloads from MinHac's REST endpoint:
 *   /bdnstrans/api/convocatorias/busqueda?vpd=GE&descripcion=riba-roja
 *
 * The scraper CLI concatenates all pages into a single JSON array; this
 * parser accepts either the concatenated array or the single-page object
 * with a `content` property.
 */

export type SubsidyDirection = 'granted' | 'received'

export interface BdnsItem {
  id: number
  bdnsCode: string
  description: string
  date: string // ISO
  organ: string
  level1: string
  level2: string | null
  direction: SubsidyDirection
  sourceUrl: string
}

interface Raw {
  id: number
  numeroConvocatoria: string
  descripcion: string
  fechaRecepcion: string
  nivel1: string
  nivel2?: string | null
  nivel3?: string | null
}

function normalize(raw: unknown): Raw[] {
  if (Array.isArray(raw)) return raw as Raw[]
  if (raw && typeof raw === 'object' && 'content' in raw) {
    return ((raw as { content: Raw[] }).content ?? []) as Raw[]
  }
  return []
}

function parseDate(s: string): string {
  if (!s) return new Date(0).toISOString()
  // BDNS feeds ISO-ish "2026-01-19" (occasionally with a zoneless time
  // suffix) or "19/01/2026". Pin the calendar date at UTC midnight: feeding
  // a zoneless datetime to new Date() parses it in the HOST zone, which can
  // shift the day (e.g. "…T00:30:00" on a UTC+1 host lands on the previous
  // UTC day) and silently mis-order stats.latestDate.
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return new Date(`${iso[1]}T00:00:00.000Z`).toISOString()
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`).toISOString()
  return new Date(s).toISOString()
}

export function parseBdnsConvocatorias(json: string): BdnsItem[] {
  const rows = normalize(JSON.parse(json))
  const seen = new Set<string>()
  const out: BdnsItem[] = []
  for (const r of rows) {
    const code = String(r.numeroConvocatoria || '').trim()
    if (!code || seen.has(code)) continue
    seen.add(code)

    // The Ayuntamiento appears in nivel2/nivel3 when it's the granting
    // body; records whose levels don't name Riba-roja as the convocant
    // (e.g. a Generalitat-level call to which the Ayto might apply) count
    // as "received".
    const nivel2 = (r.nivel2 ?? '').toUpperCase()
    const nivel3 = (r.nivel3 ?? '').toUpperCase()
    const isGranted = nivel2.includes('RIBA-ROJA') && /AYUNTAMIENTO/.test(nivel3)

    out.push({
      id: r.id,
      bdnsCode: code,
      description: (r.descripcion || '').trim(),
      date: parseDate(r.fechaRecepcion),
      organ: [r.nivel1, r.nivel2, r.nivel3].filter(Boolean).join(' · '),
      level1: r.nivel1,
      level2: r.nivel2 ?? null,
      direction: isGranted ? 'granted' : 'received',
      sourceUrl: `https://www.pap.hacienda.gob.es/bdnstrans/GE/es/convocatoria/${code}`,
    })
  }

  out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return out
}
