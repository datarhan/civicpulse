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

function stripHtml(html: string): string {
  return html
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim()
}

function classify(labels: string[]): PostKind {
  const lc = labels.map((l) => l.toLowerCase())
  if (lc.some((l) => l.includes('encuesta') || l.includes('survey'))) return 'survey'
  if (lc.some((l) => l.includes('actividad') || l.includes('activit'))) return 'activity'
  return 'other'
}

export function parseParticipaPosts(
  postsJson: string,
  opts: ParseOpts = {}
): ParticipaItem[] {
  const posts = JSON.parse(postsJson) as WpPost[]
  let categories: Record<number, string> = {}
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
          .filter((n): n is string => typeof n === 'string' && n.length > 0)
      )
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
