/** Node-only fetcher for the procesos-selectivos list page. */
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

export const PROCESOS_URL = 'https://www.ribarroja.es/es/noticia/publicaciones-procesos-selectivos'

export async function fetchProcesosHtml(): Promise<string | null> {
  const res = await fetch(PROCESOS_URL, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  return res.text()
}
