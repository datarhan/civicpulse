/**
 * Node-only fetcher for Riba-roja budget-execution PDFs (sibling of
 * bop-fetch.ts). The pure parser in budget-execution.ts never touches network.
 */
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

export const EXEC_INDEX_URL =
  'https://www.ribarroja.es/es/1_gestion_presupuestaria/2_estados_ejecucion_presupuesto'

export async function fetchPdfText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' } })
  if (!res.ok) return null
  const ct = res.headers.get('content-type') || ''
  if (!/pdf/i.test(ct) && !/\.pdf/i.test(url)) return null
  const buf = Buffer.from(await res.arrayBuffer())
  // pdf-parse v1: default export → { text }. Lazy-load (heavy pdfjs dep).
  const mod = (await import('pdf-parse')) as unknown as {
    default: (b: Buffer) => Promise<{ text: string }>
  }
  const { text } = await mod.default(buf)
  return text
}

export async function fetchExecutionIndex(): Promise<Array<{ label: string; href: string }>> {
  const res = await fetch(EXEC_INDEX_URL, { headers: { 'User-Agent': UA } })
  if (!res.ok) return []
  const html = await res.text()
  // Content-page links inside the estados-de-ejecución index (year / trimestre).
  const out: Array<{ label: string; href: string }> = []
  const re = /<a[^>]+href="([^"]+)"[^>]*>([^<]{4,80}?)<\/a>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const href = m[1]
    const label = m[2].replace(/\s+/g, ' ').trim()
    if (
      /ejecuci[oó]n|trimestre/i.test(label) &&
      /2_estados_ejecucion|estados-de-ejecuci/i.test(href)
    ) {
      out.push({ label, href: href.startsWith('http') ? href : `https://www.ribarroja.es${href}` })
    }
  }
  return out
}
