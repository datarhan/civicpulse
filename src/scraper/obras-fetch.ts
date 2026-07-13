/** Node-only fetcher for the obras-en-curso listing + ficha PDFs. */
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

export const OBRAS_URL =
  'https://www.ribarroja.es/portal_de_transparencia/5_transparencia_en_materias_de_urbanismo__obras_publicas_y_medioambiente/obras_de_infraestructuras_en_curso/contenidos/2467622/1909893'

// Plan RENOVE de adecuación de viales (urbanismo · vías y obras) — the second
// official ficha listing (feb 2024 works). Redirects to /es/pagina/plan-renove.
export const RENOVE_URL =
  'https://www.ribarroja.es/es/urbanismo/vias_y_obras/plan_renove/contenidos/2206634/5542442'

export async function fetchObrasHtml(url: string = OBRAS_URL): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok) return null
  return res.text()
}

export async function fetchFichaText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' } })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  const mod = (await import('pdf-parse')) as unknown as {
    default: (b: Buffer) => Promise<{ text: string }>
  }
  return (await mod.default(buf)).text
}
