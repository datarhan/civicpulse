/**
 * Parse posts from participa.ribarroja.es (WordPress / Votiveu REST API).
 *
 * Source endpoints:
 *   /wp-json/wp/v2/posts?per_page=100
 *   /wp-json/wp/v2/categories?per_page=50
 *
 * Classification is intentionally simple: the blog only uses two
 * meaningful categories today — "Actividades participativas" (id 21) and
 * "Encuestas" (id 22) — so we map to {activity|survey|other} based on
 * the category labels attached to the post.
 */
import { decodeHtmlEntities } from './normalize'

export type PostKind = 'activity' | 'survey' | 'other'

export interface ParticipaItem {
  id: number
  slug: string
  title: string
  link: string
  date: string // ISO-8601 (YYYY-MM-DDTHH:MM:SS)
  excerpt: string
  categories: string[]
  kind: PostKind
}

interface WpPost {
  id: number
  date: string
  title: { rendered: string }
  link: string
  excerpt?: { rendered?: string }
  content?: { rendered?: string }
  categories: number[]
  slug: string
  status: string
}

interface WpCategory {
  id: number
  name: string
  slug: string
  count: number
}

interface ParseOpts {
  categoriesJson?: string
}

// Esto era una copia local que decodificaba seis entidades, y `&hellip;` no
// estaba entre ellas: las siete tarjetas de participación de `/plenos`
// terminaban en un literal «[&hellip;]», el recorte que pone WordPress.
// `decodeHtmlEntities` cubre esas seis y ochenta más, y es donde se arregla
// la próxima que falte. Se decodifica DESPUÉS de quitar las etiquetas, como
// en `sindic-expedientes.ts`, para que un `&lt;b&gt;` decodificado no se
// convierta en una etiqueta que ya nadie va a quitar.
function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<\/?[a-z][^>]*>/gi, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function classify(labels: string[]): PostKind {
  const lc = labels.map((l) => l.toLowerCase())
  if (lc.some((l) => l.includes('encuesta') || l.includes('survey'))) return 'survey'
  if (lc.some((l) => l.includes('actividad') || l.includes('activit'))) return 'activity'
  return 'other'
}

export function parseParticipaPosts(postsJson: string, opts: ParseOpts = {}): ParticipaItem[] {
  const posts = JSON.parse(postsJson) as WpPost[]
  const categories: Record<number, string> = {}
  if (opts.categoriesJson) {
    const cats = JSON.parse(opts.categoriesJson) as WpCategory[]
    for (const c of cats) categories[c.id] = c.name
  }

  const items: ParticipaItem[] = []
  for (const p of posts) {
    if (p.status && p.status !== 'publish') continue
    const labels = Array.from(
      new Set(
        (p.categories || [])
          .map((id) => categories[id])
          .filter((n): n is string => typeof n === 'string' && n.length > 0),
      ),
    )
    items.push({
      id: p.id,
      slug: p.slug,
      title: stripHtml(p.title?.rendered || ''),
      link: p.link,
      date: p.date,
      excerpt: stripHtml(p.excerpt?.rendered || p.content?.rendered || ''),
      categories: labels,
      kind: classify(labels),
    })
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return items
}
