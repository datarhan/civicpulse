/**
 * El texto que el descubrimiento de promesas necesita para poder citar.
 *
 * El prompt de descubrimiento exige una cita LITERAL del compromiso (20–1500
 * caracteres) y `auto-curate-promises` le mandaba sólo título, URL y fecha. Sin
 * el texto delante, el modelo intentaba leer cada artículo con WebFetch, WebSearch
 * y Bash —denegados todos— hasta que el vigilante lo mataba: 17 pasadas de 17 sin
 * una respuesta, del 2026-08-26 al 2026-09-23.
 *
 * Aquí cada fuente viaja con un extracto de su cuerpo. La que no tiene cuerpo NO
 * viaja con el titular solo, que es pedir otra vez lo imposible: se aparta y se
 * cuenta con su motivo, para que «no había de dónde citar» no se confunda con «no
 * había promesas». La cita que el modelo devuelva sigue pasando por `groundDraft`,
 * que la busca literal en la página: dar texto no afloja la prueba.
 *
 * El fetcher se inyecta. En producción es `fetchArticleBody` del laboratorio de
 * prensa (robots.txt, un pedido por host cada 2 s, caché de 7 días en
 * `.press-cache/`), y por eso los cuerpos se piden de uno en uno.
 */

/** Caracteres del cuerpo que viajan por fuente. 60 fuentes × 900 ≈ 54 KB de prompt. */
export const LARGO_EXTRACTO = 900

export interface ItemDescubrimiento {
  title: string
  url: string
  date: string
  publisher?: string
  snippet?: string
}

export type TraerCuerpo = (url: string) => Promise<{ body: string; robotsAllowed: boolean }>

export interface ConCuerpos {
  items: ItemDescubrimiento[]
  sinCuerpo: Array<{ url: string; motivo: string }>
}

export async function adjuntarCuerpos(
  items: ItemDescubrimiento[],
  traer: TraerCuerpo,
): Promise<ConCuerpos> {
  const out: ConCuerpos = { items: [], sinCuerpo: [] }
  for (const it of items) {
    let r: Awaited<ReturnType<TraerCuerpo>>
    try {
      r = await traer(it.url)
    } catch (err) {
      out.sinCuerpo.push({
        url: it.url,
        motivo: `error: ${err instanceof Error ? err.message : String(err)}`,
      })
      continue
    }
    if (!r.robotsAllowed) {
      out.sinCuerpo.push({ url: it.url, motivo: 'robots' })
      continue
    }
    const cuerpo = r.body.trim()
    if (!cuerpo) {
      out.sinCuerpo.push({ url: it.url, motivo: 'vacío' })
      continue
    }
    out.items.push({ ...it, snippet: cuerpo.slice(0, LARGO_EXTRACTO) })
  }
  return out
}
