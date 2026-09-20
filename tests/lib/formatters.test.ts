import { describe, expect, it, vi } from 'vitest'
import {
  timeAgo,
  prettyNeighborhood,
  safeHref,
  truncateAtWord,
  fmtDateHuman,
  fmtDateShort,
  partePorHueco,
  rellena,
  porcentajeLegible,
  decimal,
} from '../../src/lib/formatters'
import { CATALOGUE } from '../../src/i18n'

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

/**
 * La portada valenciana escribía «hace 3 h» junto a cada titular de prensa: el
 * tiempo relativo sólo sabía castellano. Las palabras salen ahora del catálogo,
 * que `formatters` no puede importar —no depende de React—, así que quien pinta le
 * pasa su `t` y su idioma. Sin ellos escribe exactamente lo de siempre.
 */
describe('timeAgo en el idioma de la interfaz', () => {
  const traductor = (idioma: 'es' | 'ca') => (clave: string) =>
    (CATALOGUE[idioma] as Record<string, string>)[clave] ?? clave
  const cadena = (idioma: 'es' | 'ca', clave: string) =>
    (CATALOGUE[idioma] as Record<string, string>)[clave]

  it('con el catálogo castellano escribe lo mismo que sin él (el control)', () => {
    for (const ms of [10_000, 5 * MIN, 3 * HOUR, 5 * DAY, 60 * DAY]) {
      const iso = ago(ms)
      expect(timeAgo(iso, { t: traductor('es'), locale: 'es' })).toBe(timeAgo(iso))
    }
  })

  it('en valencià, cada tramo con su cadena del catálogo', () => {
    // Mide algo: las cuatro cadenas existen en valencià y no son las castellanas.
    for (const clave of ['tiempo.ahora', 'tiempo.haceMin', 'tiempo.haceHoras', 'tiempo.haceDias']) {
      expect(cadena('ca', clave), `falta ${clave} en valencià`).toBeTruthy()
      expect(cadena('ca', clave)).not.toBe(cadena('es', clave))
    }
    const ca = { t: traductor('ca'), locale: 'ca' }
    expect(timeAgo(ago(10_000), ca)).toBe(cadena('ca', 'tiempo.ahora'))
    expect(timeAgo(ago(5 * MIN), ca)).toBe(rellena(cadena('ca', 'tiempo.haceMin'), { n: 5 }))
    expect(timeAgo(ago(3 * HOUR), ca)).toBe(rellena(cadena('ca', 'tiempo.haceHoras'), { n: 3 }))
    expect(timeAgo(ago(5 * DAY), ca)).toBe(rellena(cadena('ca', 'tiempo.haceDias'), { n: 5 }))
  })

  it('pasado el mes, la fecha va en ca-ES; sin idioma, en es-ES', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-09-15T12:00:00Z'))
      const iso = '2026-06-03T10:00:00Z'
      expect(timeAgo(iso, { t: traductor('ca'), locale: 'ca' })).toMatch(/juny/)
      expect(timeAgo(iso)).toMatch(/jun/)
      expect(timeAgo(iso)).not.toMatch(/juny/)
    } finally {
      vi.useRealTimers()
    }
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

/**
 * El separador decimal (#62).
 *
 * /presupuesto escribía «el 2.5 % del importe» con punto —`cuota.toFixed(1)`— y
 * la frase siguiente «serían el 7.4 %» con otro, porque `String(7.4)` también
 * lleva punto. En la misma tarjeta, dos líneas más arriba, la página escribe
 * «62,12 M€». Ningún dato estaba mal: el idioma del número sí.
 *
 * Se fija aquí en vez de en la página porque son dos sitios en una sola frase, y
 * dos copias de una decisión de formato es exactamente lo que acaba derivando.
 * El CLDR de la CI no es el del portátil —ya escribe «2 M €» donde el portátil
 * escribe «2 M€»—, así que la coma se comprueba en las dos.
 */
describe('decimal', () => {
  it('escribe el decimal con coma, como el resto de la página', () => {
    expect(decimal(2.5)).toBe('2,5')
    expect(decimal(7.4)).toBe('7,4')
  })

  it('no inventa un decimal que no hay', () => {
    expect(decimal(7)).toBe('7')
    expect(decimal(0)).toBe('0')
  })

  it('redondea a la precisión pedida', () => {
    expect(decimal(7.44)).toBe('7,4')
    expect(decimal(7.46)).toBe('7,5')
    expect(decimal(7.456, 2)).toBe('7,46')
  })

  it('sin número no escribe un cero', () => {
    expect(decimal(null)).toBe('')
    expect(decimal(undefined)).toBe('')
    expect(decimal(Number.NaN)).toBe('')
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

/**
 * `fmtDateShort` con idioma.
 *
 * El deslizador del mapa y la tarjeta de contrato escribían el mes en castellano
 * también en la portada valenciana, porque la función fijaba `es-ES`. Ahora
 * recibe el idioma, y sin él —que es como la llaman todas las demás páginas—
 * escribe lo mismo que escribía. Los números y la moneda siguen en `es-ES` en
 * los dos idiomas: sólo cambia el nombre del mes.
 */
describe('fmtDateShort, en los dos idiomas', () => {
  // Mediodía UTC: el día es el mismo en cualquier huso en el que corra la suite.
  const ISO = '2026-06-03T12:00:00Z'

  it('sin idioma, y con «es», escribe lo que escribía', () => {
    expect(fmtDateShort(ISO)).toBe('3 jun 2026')
    expect(fmtDateShort(ISO, 'es')).toBe(fmtDateShort(ISO))
  })

  it('en valencià, el mes en valencià', () => {
    // ICU escribe «3 de juny del 2026». Se fija el mes y no la forma entera,
    // que es de ICU y no nuestra.
    expect(fmtDateShort(ISO, 'ca')).toMatch(/juny/)
  })

  it('un idioma que el sitio no tiene cae al castellano', () => {
    expect(fmtDateShort(ISO, 'fr')).toBe(fmtDateShort(ISO))
  })

  it('sin fecha no hay texto, en ningún idioma', () => {
    expect(fmtDateShort(null, 'ca')).toBe('')
  })
})

/**
 * `partePorHueco` — para las plantillas que envuelven un dato en `<strong>`.
 *
 * «Atribuido por la Generalitat a <strong>Vilamarxant</strong>; …» no cabe en
 * `rellena`, que devuelve texto: el dato va dentro de un elemento. Se parte la
 * plantilla por el hueco y el componente pinta las dos mitades alrededor.
 */
describe('partePorHueco', () => {
  it('parte la plantilla alrededor del hueco', () => {
    expect(
      partePorHueco(
        'Atribuido por la Generalitat a {municipio}; su perímetro entra en Riba-roja.',
        '{municipio}',
      ),
    ).toEqual(['Atribuido por la Generalitat a ', '; su perímetro entra en Riba-roja.'])
  })

  it('con el hueco en un extremo, esa mitad queda vacía', () => {
    expect(partePorHueco('{fuente} (ICV)', '{fuente}')).toEqual(['', ' (ICV)'])
  })

  it('sin el hueco, la plantilla va entera delante y el dato no se pierde detrás', () => {
    // Una traducción que se come el hueco no puede borrar el dato: se pinta
    // después del texto, que se ve y se arregla, en vez de desaparecer.
    expect(partePorHueco('Zonas oficiales de peligrosidad', '{fuente}')).toEqual([
      'Zonas oficiales de peligrosidad',
      '',
    ])
  })
})
