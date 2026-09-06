import { describe, it, expect } from 'vitest'
import { parseSeedSources, citationFromSeed } from '../src/scraper/journalist-agent/seeds'
import { JournalistValidationError } from '../src/scraper/journalist'

/**
 * Fuentes sembradas por la curaduría para una ejecución del agente periodista.
 *
 * La investigación previa (skill investigar-cargo) localiza documentos que el
 * agente no encontraría solo — prensa que bloquea al rastreador, un PDF del
 * BOP, una candidatura de 2011. NO pueden viajar en el brief de la asignación
 * porque el brief es PÚBLICO (se sirve en /data/ y se pinta en
 * /laboratorio/agentes); viajan en un fichero bajo editorial/ que
 * `journalist:run --seed` lee. Estas pruebas fijan lo que ese fichero puede y
 * no puede decir.
 */
const BASE = {
  url: 'https://valenciaplaza.com/el-policia-alberto-gimeno-sera-el-candidato-del-pp-a-la-alcaldia-de-riba-roja',
  title: 'El policía Alberto Gimeno será el candidato del PP a la alcaldía de Riba-roja',
  publisher: 'Valencia Plaza',
  publishedAt: '2023-01-19',
  capturedVia: 'fetch' as const,
}

describe('parseSeedSources', () => {
  it('acepta las tres vías de captura', () => {
    const rows = parseSeedSources(
      JSON.stringify([
        BASE,
        { ...BASE, url: 'https://bop.dival.es/bop/drvisapi.dll?id=1', capturedVia: 'pdf' },
        {
          ...BASE,
          url: 'https://www.levante-emv.com/comarcas/2024/01/01/pleno-riba-roja.html',
          capturedVia: 'chrome',
          excerpt: 'El portavoz del PP, Alberto Gimeno, pidió la comparecencia del alcalde.',
          retrievedAt: '2026-09-06T10:00:00.000Z',
        },
      ]),
    )
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.capturedVia)).toEqual(['fetch', 'pdf', 'chrome'])
  })

  it('una captura en navegador exige el extracto literal y su fecha de lectura', () => {
    expect(() => parseSeedSources(JSON.stringify([{ ...BASE, capturedVia: 'chrome' }]))).toThrow(
      /chrome.*excerpt/,
    )
    expect(() =>
      parseSeedSources(
        JSON.stringify([{ ...BASE, capturedVia: 'chrome', excerpt: 'Texto literal del medio.' }]),
      ),
    ).toThrow(/retrievedAt/)
  })

  it('el extracto tiene el mismo tope que una cita publicada: 500 caracteres', () => {
    expect(() =>
      parseSeedSources(
        JSON.stringify([
          { ...BASE, excerpt: 'x'.repeat(501), retrievedAt: '2026-09-06T10:00:00.000Z' },
        ]),
      ),
    ).toThrow(/500/)
  })

  it('nunca acepta una confianza dictada por el fichero — sale de la tabla de dominios', () => {
    expect(() => parseSeedSources(JSON.stringify([{ ...BASE, trust: 'high' }]))).toThrow(/trust/)
  })

  it('rechaza claves desconocidas, URLs que no son http(s) y lo que no es una lista', () => {
    expect(() => parseSeedSources(JSON.stringify([{ ...BASE, kind: 'web' }]))).toThrow(/kind/)
    expect(() =>
      parseSeedSources(JSON.stringify([{ ...BASE, url: 'file:///etc/passwd' }])),
    ).toThrow(/url/)
    expect(() => parseSeedSources(JSON.stringify({ url: BASE.url }))).toThrow(/array/)
    expect(() => parseSeedSources(JSON.stringify([{ ...BASE, title: '' }]))).toThrow(/title/)
  })

  it('lanza el mismo error de validación que el resto del esquema periodista', () => {
    expect(() => parseSeedSources(JSON.stringify([{ ...BASE, trust: 'high' }]))).toThrow(
      JournalistValidationError,
    )
  })
})

describe('citationFromSeed', () => {
  it('la confianza sale del dominio, la nota de curaduría nunca se copia', () => {
    const [seed] = parseSeedSources(
      JSON.stringify([
        {
          ...BASE,
          url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2023-1',
          note: 'localizado por la investigación previa, no citar la nota',
        },
      ]),
    )
    const { citation } = citationFromSeed(seed, 'Cuerpo del documento con el texto literal.')
    expect(citation.kind).toBe('web')
    expect(citation.trust).toBe('high')
    expect(JSON.stringify(citation)).not.toContain('no citar la nota')
    expect(citation.publisher).toBe('Valencia Plaza')
    expect(citation.publishedAt).toBe('2023-01-19')
  })

  it('un dominio desconocido queda en low aunque el fichero lo tenga por bueno', () => {
    const [seed] = parseSeedSources(
      JSON.stringify([{ ...BASE, url: 'https://blog-desconocido.example/post' }]),
    )
    expect(citationFromSeed(seed, 'cuerpo').citation.trust).toBe('low')
  })

  it('con cuerpo descargado, el extracto sembrado sólo se usa si es literal en el cuerpo', () => {
    const excerpt = 'será el candidato del PP a la alcaldía'
    const [seed] = parseSeedSources(
      JSON.stringify([{ ...BASE, excerpt, retrievedAt: '2026-09-06T10:00:00.000Z' }]),
    )
    const ok = citationFromSeed(seed, `Alberto Gimeno ${excerpt} de Riba-roja.`)
    expect(ok.verified).toBe('verbatim')
    expect(ok.citation.excerpt).toBe(excerpt)

    const ko = citationFromSeed(seed, 'Un cuerpo que no contiene esa frase.')
    expect(ko.verified).toBe('not-in-body')
    expect(ko.citation.excerpt).toBe('Un cuerpo que no contiene esa frase.')
  })

  it('una captura en navegador lleva el extracto manual y queda marcada como tal', () => {
    const [seed] = parseSeedSources(
      JSON.stringify([
        {
          ...BASE,
          capturedVia: 'chrome',
          excerpt: 'Frase leída en el navegador.',
          retrievedAt: '2026-09-06T10:00:00.000Z',
        },
      ]),
    )
    const r = citationFromSeed(seed)
    expect(r.verified).toBe('manual')
    expect(r.citation.excerpt).toBe('Frase leída en el navegador.')
    expect(r.citation.retrievedAt).toBe('2026-09-06T10:00:00.000Z')
  })
})
