import { describe, expect, it } from 'vitest'
import {
  timeAgo,
  prettyNeighborhood,
  safeHref,
  truncateAtWord,
  fmtDateHuman,
  rellena,
  porcentajeLegible,
} from '../../src/lib/formatters'

// Build an ISO string a given number of milliseconds in the past.
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('timeAgo (unified canonical: round / 24h / 30d)', () => {
  it('returns "" for null/undefined/empty', () => {
    expect(timeAgo(null)).toBe('')
    expect(timeAgo(undefined)).toBe('')
    expect(timeAgo('')).toBe('')
  })

  it('shows "ahora" under a minute', () => {
    expect(timeAgo(ago(10_000))).toBe('ahora')
  })

  it('shows minutes under an hour', () => {
    expect(timeAgo(ago(5 * MIN))).toBe('hace 5 min')
  })

  it('shows hours under a day', () => {
    expect(timeAgo(ago(3 * HOUR))).toBe('hace 3 h')
  })

  it('shows days under 30 days', () => {
    expect(timeAgo(ago(5 * DAY))).toBe('hace 5 d')
  })

  it('falls back to an absolute es-ES date past 30 days', () => {
    const out = timeAgo(ago(60 * DAY))
    expect(out).not.toMatch(/^hace /)
    expect(out).not.toBe('ahora')
    // Localised "12 abr 2026"-style string — contains a 4-digit year.
    expect(out).toMatch(/\d{4}/)
  })
})

describe('prettyNeighborhood', () => {
  it('returns "" for falsy input', () => {
    expect(prettyNeighborhood('')).toBe('')
    expect(prettyNeighborhood(null)).toBe('')
    expect(prettyNeighborhood(undefined)).toBe('')
  })

  it('title-cases hyphen-, underscore-, and space-separated slugs', () => {
    expect(prettyNeighborhood('santa-rosa')).toBe('Santa Rosa')
    expect(prettyNeighborhood('l_oliveral')).toBe('L Oliveral')
    expect(prettyNeighborhood('vallesa de mandor')).toBe('Vallesa De Mandor')
  })
})

describe('safeHref', () => {
  it('allows http/https, rejects javascript:/data:/relative/null', () => {
    expect(safeHref('https://contrataciondelestado.es/x')).toBe(
      'https://contrataciondelestado.es/x',
    )
    expect(safeHref('http://example.com')).toBe('http://example.com')
    expect(safeHref('javascript:alert(1)')).toBe(null)
    expect(safeHref('data:text/html,<script>x</script>')).toBe(null)
    expect(safeHref(null)).toBe(null)
    expect(safeHref('not a url')).toBe(null)
  })

  // A vote's breakdown cites /data/pleno-transcripts/<plenoId>.txt. Before this
  // these returned null and ExtLink rendered an unlinked <span> — the citation
  // vanished from the page without anything failing.
  it('allows a site-absolute path so an internal citation stays clickable', () => {
    expect(safeHref('/data/pleno-transcripts/qz6weg.txt')).toBe(
      '/data/pleno-transcripts/qz6weg.txt',
    )
    expect(safeHref('/plenos/qz6weg')).toBe('/plenos/qz6weg')
  })

  it('still rejects a protocol-relative url, which only looks like a path', () => {
    expect(safeHref('//evil.example/x')).toBe(null)
  })
})

describe('truncateAtWord', () => {
  it('returns "" for falsy input', () => {
    expect(truncateAtWord('', 20)).toBe('')
    expect(truncateAtWord(null, 20)).toBe('')
    expect(truncateAtWord(undefined, 20)).toBe('')
  })

  it('leaves text at or under the budget untouched — no gratuitous ellipsis', () => {
    expect(truncateAtWord('corto', 20)).toBe('corto')
    expect(truncateAtWord('exactamente-veinte!!', 20)).toBe('exactamente-veinte!!')
  })

  it('trims surrounding whitespace before measuring', () => {
    expect(truncateAtWord('   corto   ', 20)).toBe('corto')
  })

  it('cuts on a word boundary, never mid-word', () => {
    const out = truncateAtWord('El Ayuntamiento celebra una plataforma innovadora', 30)
    expect(out.endsWith('…')).toBe(true)
    // Every word in the output is a whole word from the source.
    for (const w of out.replace('…', '').split(' ')) {
      expect('El Ayuntamiento celebra una plataforma innovadora'.split(' ')).toContain(w)
    }
  })

  it('never exceeds the budget plus the one ellipsis character', () => {
    const long = 'palabra '.repeat(80)
    for (const max of [10, 40, 120, 165]) {
      expect(truncateAtWord(long, max).length).toBeLessThanOrEqual(max + 1)
    }
  })

  it('hard-cuts a single word longer than the budget rather than returning only "…"', () => {
    const out = truncateAtWord('supercalifragilisticoespialidoso', 10)
    expect(out).toBe('supercalif…')
  })

  it('strips dangling punctuation so the ellipsis does not read as ",…"', () => {
    // The comma would otherwise survive the word-boundary cut.
    expect(truncateAtWord('visitantes, el expediente de contratación permite', 12)).toBe(
      'visitantes…',
    )
  })

  it('does not append an ellipsis when the boundary cut consumed nothing', () => {
    expect(truncateAtWord('dos palabras', 12)).toBe('dos palabras')
  })
})

describe('fmtDateHuman', () => {
  it('returns "" for falsy input', () => {
    expect(fmtDateHuman('')).toBe('')
    expect(fmtDateHuman(null)).toBe('')
    expect(fmtDateHuman(undefined)).toBe('')
  })

  it('renders an ISO date as a long Spanish date', () => {
    // The reportaje snapshots carry BOTH shapes: `publicadoEl` is hand-written
    // prose, `fechaDatos` is ISO. Rendering the raw ISO next to prose is the
    // drift this exists to kill.
    expect(fmtDateHuman('2026-07-06')).toBe('6 de julio de 2026')
  })

  it('passes an already-human Spanish date through verbatim', () => {
    expect(fmtDateHuman('15 de julio de 2026')).toBe('15 de julio de 2026')
  })

  it('passes any non-ISO string through rather than guessing', () => {
    expect(fmtDateHuman('primavera de 2026')).toBe('primavera de 2026')
  })
})

/**
 * `rellena` — las dos cosas que `String.replace` hace mal.
 *
 * Vivía dentro de /presupuesto y ahora la comparten dos superficies, así que lo
 * que la hace preferible queda fijado aquí y no en un comentario. Las dos
 * aserciones fallan si alguien la reescribe con `replace(`{clave}`, valor)`.
 */
describe('rellena', () => {
  it('sustituye TODAS las apariciones, no sólo la primera', () => {
    // Con `String.replace` y un patrón de texto, la segunda se queda sin poner:
    // la plantilla llega al lector con «{n}» escrito.
    expect(rellena('{n} de {n}', { n: 3 })).toBe('3 de 3')
  })

  it('un `$&` en el VALOR se escribe tal cual', () => {
    // `String.replace` lo interpreta como «lo que casó» y reescribe el dato.
    expect(rellena('total: {x}', { x: '$& y $1' })).toBe('total: $& y $1')
  })

  it('deja intacto el hueco que nadie nombra', () => {
    // Dejar «{total}» a la vista es el defecto original de /empleo, y es mejor
    // que inventarse un valor: se ve, y se arregla.
    expect(rellena('{n} de {total}', { n: 24 })).toBe('24 de {total}')
  })

  it('un 0 se escribe «0» en vez de desaparecer por ser falso', () => {
    // El nombre de antes hablaba de «[object Object]», que no es lo que mide.
    expect(rellena('{n}', { n: 0 })).toBe('0')
  })
})

describe('porcentajeLegible', () => {
  it('lo que no es cero no se escribe «0», ni lo que no es el total «100»', () => {
    expect(porcentajeLegible(2, 1005)).toBe('<1')
    expect(porcentajeLegible(1004, 1005)).toBe('>99')
  })

  it('un cero, una mitad y un total de verdad se quedan como están', () => {
    expect(porcentajeLegible(0, 4)).toBe('0')
    expect(porcentajeLegible(1, 2)).toBe('50')
    expect(porcentajeLegible(4, 4)).toBe('100')
  })

  it('sin total no hay proporción: null, no un cero', () => {
    expect(porcentajeLegible(0, 0)).toBeNull()
  })
})
