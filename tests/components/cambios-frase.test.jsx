/**
 * «En una frase» de /cambios, pintada (auditoría de las dos lecturas, §2).
 *
 * La regla —qué es un hecho, qué no consta, de qué no hay datos— se prueba en
 * `tests/en-breve-cambios.test.ts`. Aquí, las palabras: que cada caso dice lo
 * que debe en los dos idiomas, que en valencià no queda castellano, y que cada
 * cadena `cambios.frase.*` se pinta en algún escenario. Y la página con lo
 * publicado: la frase va arriba, antes del divisor, y las tarjetas del
 * Ayuntamiento antes que la prensa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Cambios from '../../src/pages/Cambios'
import { FraseDeLaSemana } from '../../src/components/Cambios/FraseDeLaSemana'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { fmtDateLong, rellena } from '../../src/lib/formatters'
import { installFetchMock } from '../setup/mockFetch'
import { detectorDeCastellano, masLargasPrimero } from '../setup/castellano'
import { pintaYLee } from '../setup/pinta-y-lee'

const HOY = Date.parse('2026-10-28T12:00:00Z')
const AYER = '2026-10-27T10:00:00Z'
const VIEJA = '2026-09-01T10:00:00Z'

const fuente = (fichero, generatedAt = AYER, leida = true) => ({ fichero, generatedAt, leida })
const FRESCAS = {
  pleno: fuente('plenos.json'),
  licitacion: fuente('tenders.json'),
  subvencion: fuente('bdns.json'),
  participa: fuente('participa.json'),
  queja: fuente('quejas.json'),
  prensa: fuente('press.json'),
}
const muchos = (n, kind, extra = {}) =>
  Array.from({ length: n }, () => ({ kind, date: '2026-10-25', ...extra }))

const escenario = (nombre, byKind, fuentes = FRESCAS) => ({
  nombre,
  pinta: () => <FraseDeLaSemana byKind={byKind} fuentes={fuentes} dias={7} hoy={HOY} />,
  listo: (c) => c.querySelector('[data-cambios-frase] p') !== null,
})

const ESCENARIOS = [
  escenario('una semana con de todo', {
    pleno: muchos(1, 'pleno'),
    licitacion: muchos(2, 'licitacion'),
    subvencion: muchos(1, 'subvencion', { direction: 'granted' }),
    participa: muchos(3, 'participa'),
    queja: muchos(1, 'queja'),
    prensa: [
      ...muchos(13, 'prensa', { origen: 'levante-emv.com' }),
      ...muchos(1, 'prensa', { origen: 'ribarroja.es' }),
    ],
  }),
  escenario('los otros plurales', {
    pleno: muchos(2, 'pleno'),
    licitacion: muchos(1, 'licitacion'),
    subvencion: muchos(2, 'subvencion', { direction: 'granted' }),
    participa: muchos(1, 'participa'),
    queja: muchos(3, 'queja'),
    prensa: [
      ...muchos(1, 'prensa', { origen: 'ribarroja.es' }),
      ...muchos(1, 'prensa', { origen: 'www.ribarroja.es' }),
    ],
  }),
  escenario('nada, con las fuentes al día', {}),
  escenario(
    'una noticia, y fuentes atrasadas o caídas',
    { prensa: muchos(1, 'prensa') },
    {
      ...FRESCAS,
      pleno: fuente('plenos.json', VIEJA),
      licitacion: fuente('tenders.json', null, false),
      subvencion: fuente('bdns.json', VIEJA),
      participa: fuente('participa.json', VIEJA),
      queja: fuente('quejas.json', VIEJA),
      prensa: fuente('press.json', null, false),
    },
  ),
  escenario(
    'ninguna fuente se pudo leer',
    {},
    Object.fromEntries(
      Object.entries(FRESCAS).map(([k, f]) => [k, fuente(f.fichero, null, false)]),
    ),
  ),
]

const lee = async (esc, idioma) => (await pintaYLee(esc, idioma)).piezas.join(' ')

describe('«En una frase», en castellano', () => {
  it('una semana con de todo: los hechos en orden, las quejas y la prensa', async () => {
    const texto = await lee(ESCENARIOS[0], 'es')
    expect(texto).toContain(
      'En los últimos 7 días, el Ayuntamiento celebró 1 pleno, adjudicó 2 contratos, abrió 1 convocatoria de subvenciones y publicó 3 entradas en su portal de participación.',
    )
    expect(texto).toContain('hay 1 enviada en estos días')
    expect(texto).toContain(
      'Hay 14 noticias que mencionan Riba-roja. Una es de la web del Ayuntamiento.',
    )
    expect(texto).not.toContain('No consta')
  })

  it('nada, con las fuentes al día: «no consta», y ningún «sin datos»', async () => {
    const texto = await lee(ESCENARIOS[2], 'es')
    expect(texto).toContain(
      'No consta ningún pleno, ningún contrato adjudicado, ninguna convocatoria municipal de subvenciones ni ninguna entrada en el portal de participación en los últimos 7 días.',
    )
    expect(texto).not.toContain('Sin datos')
    expect(texto).not.toContain('En los últimos 7 días, el Ayuntamiento')
  })

  it('fuentes atrasadas: «sin datos desde» con la fecha de la copia, nunca «no consta»', async () => {
    const texto = await lee(ESCENARIOS[3], 'es')
    expect(texto).toContain(`Sin datos de plenos desde el ${fmtDateLong(VIEJA, 'es')}.`)
    expect(texto).toContain('No se han podido leer los datos de contratos.')
    expect(texto).not.toContain('No consta')
    // La noticia que sí hay se cuenta aunque la copia de prensa no se lea.
    expect(texto).toContain('Hay 1 noticia que menciona Riba-roja.')
  })
})

describe('«En una frase», sin ninguna fuente', () => {
  it('no dice «no consta» ni da ceros: dice qué no se pudo leer', async () => {
    const texto = await lee(ESCENARIOS[4], 'es')
    expect(texto).not.toMatch(/No consta|ninguna enviada|Ninguna noticia/)
    expect(texto).toContain('No se han podido leer los datos de prensa.')
    // Sin artículo delante: «los datos de el canal» era la primera redacción.
    expect(texto).toContain('No se han podido leer los datos de quejas.')
    expect(texto).not.toMatch(/\bde el\b/)
  })
})

describe('«En una frase», en los dos idiomas', () => {
  /** Lo que se escribe igual: nombres propios y la fecha, que pinta el formateador. */
  const SIGLAS = ['CivicPulse', 'Riba-roja']

  it.each(ESCENARIOS)(
    '$nombre: en valencià, nada en castellano',
    async (esc) => {
      const es = await pintaYLee(esc, 'es')
      const ca = await pintaYLee(esc, 'ca')
      expect(ca.piezas.length).toBe(es.piezas.length)
      const { castellanoEn, sinTraducir } = detectorDeCastellano(masLargasPrimero(SIGLAS))
      expect
        .soft([...new Set(ca.piezas.flatMap((p) => castellanoEn(p)))], 'castellano en valencià')
        .toEqual([])
      expect
        .soft(
          [...new Set(sinTraducir(es.piezas.map((p, i) => [p, ca.piezas[i]])))],
          'se lee igual en los dos idiomas',
        )
        .toEqual([])
    },
    60000,
  )

  it('cada cadena cambios.frase.* se pinta en algún escenario', async () => {
    const claves = Object.keys(CATALOGUE.es).filter((k) => k.startsWith('cambios.frase.'))
    expect(claves.length).toBeGreaterThan(30)
    const leido = []
    for (const esc of ESCENARIOS) leido.push(...(await pintaYLee(esc, 'es')).piezas)
    const texto = leido.join('\n')
    const sinPintar = claves.filter((clave) =>
      CATALOGUE.es[clave]
        .split(/\{\w+\}/)
        .map((trozo) => trozo.trim())
        .filter((trozo) => /\p{L}/u.test(trozo))
        .some((trozo) => !texto.includes(trozo)),
    )
    expect(sinPintar).toEqual([])
  }, 120000)
})

describe('/cambios con lo publicado', () => {
  const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(HOY)
  })
  afterEach(() => vi.useRealTimers())

  it('la frase va arriba, antes del divisor, y las tarjetas del Ayuntamiento antes que la prensa', async () => {
    localStorage.setItem('cp:lang', 'es')
    installFetchMock(
      Object.fromEntries(
        ['quejas', 'plenos', 'press', 'tenders', 'bdns', 'participa', 'geo'].map((f) => [
          `/data/${f}.json`,
          lee(`${f}.json`),
        ]),
      ),
    )
    const { container } = render(
      <MemoryRouter>
        <LocaleProvider>
          <Cambios />
        </LocaleProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(container.querySelector('[data-cambios-frase] p')).not.toBeNull(), {
      timeout: 15000,
    })
    const frase = container.querySelector('[data-cambios-frase]')
    const divisor = container.querySelector('[data-divisor-lecturas]')
    expect(frase.compareDocumentPosition(divisor) & 4).toBe(4)
    // Mide algo: la frase dice algo de cada parte.
    expect(frase.textContent.length).toBeGreaterThan(80)
    // La entradilla ya no explica el botón.
    expect(container.textContent).not.toMatch(/botón verde/)
    // Las tarjetas que haya: las del Ayuntamiento antes que quejas y prensa.
    const orden = ['pleno', 'licitacion', 'subvencion', 'participa', 'queja', 'prensa'].map((k) =>
      rellena(CATALOGUE.es[`cambios.kind.${k}`], {}),
    )
    const titulos = [...container.querySelectorAll('[data-section-head]')].map((h) => h.textContent)
    const posiciones = titulos.map((t) => orden.indexOf(t)).filter((i) => i >= 0)
    expect(posiciones.length).toBeGreaterThan(0)
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b))
  }, 60000)
})
