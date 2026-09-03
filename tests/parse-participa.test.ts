import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseParticipaPosts } from '../src/scraper/participa'

const POSTS = join(__dirname, 'fixtures', 'participa_posts_2026-04-19.json')
const CATS = join(__dirname, 'fixtures', 'participa_categories_2026-04-19.json')

describe('scraper/participa — parseParticipaPosts', () => {
  let items: ReturnType<typeof parseParticipaPosts>

  beforeAll(() => {
    items = parseParticipaPosts(readFileSync(POSTS, 'utf8'), {
      categoriesJson: readFileSync(CATS, 'utf8'),
    })
  })

  it('parses every published post (6 on the snapshot)', () => {
    expect(items.length).toBe(6)
  })

  it('every item has a title, link, iso date, and category labels', () => {
    for (const it of items) {
      expect(it.title.length).toBeGreaterThan(3)
      expect(it.link).toMatch(/^https?:\/\//)
      expect(it.date).toMatch(/^\d{4}-\d{2}-\d{2}/)
      expect(Array.isArray(it.categories)).toBe(true)
      for (const c of it.categories) {
        expect(typeof c).toBe('string')
        expect(c.length).toBeGreaterThan(0)
      }
    }
  })

  /**
   * La prueba de al lado busca ETIQUETAS, y lo que se colaba eran ENTIDADES.
   *
   * Las siete tarjetas de participación de `/plenos` terminaban en un literal
   * «[&hellip;]» — el recorte que pone WordPress— porque `stripHtml` era una
   * copia local que decodificaba seis entidades y no ésa. `normalize.ts` ya
   * exporta `decodeHtmlEntities` para esto, y su cabecera lo pide: «New call
   * sites import this».
   *
   * Se afirma sobre la CLASE, no sobre `&hellip;`: cualquier entidad que
   * sobreviva es el mismo fallo con otro nombre.
   */
  it('decodes HTML entities (none survive into title or excerpt)', () => {
    const ENTIDAD = /&(?:[a-zA-Z]{2,10}|#x?[0-9a-fA-F]+);/
    const supervivientes = items
      .flatMap((i) => [
        { campo: 'title', valor: i.title },
        { campo: 'excerpt', valor: i.excerpt },
      ])
      .filter((c) => ENTIDAD.test(c.valor))
      .map((c) => `${c.campo}: …${c.valor.slice(-40)}`)
    expect(supervivientes, `entidades sin decodificar: ${supervivientes.join(' | ')}`).toEqual([])
  })

  it('strips HTML from the excerpt (no tags leaking through)', () => {
    for (const it of items) {
      expect(it.excerpt).not.toMatch(/<\/?[a-z][^>]*>/i)
    }
  })

  it('maps category IDs 21 and 22 to human labels (activities / surveys)', () => {
    const labels = new Set(items.flatMap((i) => i.categories))
    expect(labels.has('Actividades participativas')).toBe(true)
    expect(labels.has('Encuestas')).toBe(true)
  })

  it('is sorted newest-first', () => {
    for (let i = 0; i < items.length - 1; i++) {
      const a = new Date(items[i].date).getTime()
      const b = new Date(items[i + 1].date).getTime()
      expect(a).toBeGreaterThanOrEqual(b)
    }
  })

  it('produces a unique slug per item', () => {
    const slugs = items.map((i) => i.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('kind classifies each post as "activity" or "survey"', () => {
    const valid = new Set(['activity', 'survey', 'other'])
    for (const it of items) {
      expect(valid.has(it.kind)).toBe(true)
    }
  })
})
