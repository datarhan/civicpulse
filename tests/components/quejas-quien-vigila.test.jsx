/**
 * /quejas, debajo del divisor: «Si el Ayuntamiento no responde: quién más
 * vigila», el cruce por barrio que espera a tener quejas en varios barrios y
 * los datos técnicos al pie (auditoría de las dos lecturas, §18).
 *
 * La página entera se pinta con lo publicado para mirar qué queda dentro del
 * grupo, en qué orden y a qué nivel. Los bloques nuevos se pintan además solos
 * y en los dos idiomas: en valencià no queda castellano que no sea dato, y cada
 * cadena nueva se pinta en algún escenario.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Quejas from '../../src/pages/Quejas'
import QuejasSpendOverlap from '../../src/components/Quejas/QuejasSpendOverlap'
import { QuienMasVigila, QueEsLaInstitucion } from '../../src/components/Quejas/QuienMasVigila'
import { DatosTecnicos } from '../../src/components/Quejas/DatosTecnicos'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { computeOverlapRows, cruceDibujable } from '../../src/lib/neighborhood-aggregate'
import { rellena } from '../../src/lib/formatters'
import { installFetchMock } from '../setup/mockFetch'
import {
  cadenasDe,
  datosPintados,
  detectorDeCastellano,
  masLargasPrimero,
} from '../setup/castellano'
import { pintaYLee } from '../setup/pinta-y-lee'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const GEO = lee('geo.json')
const TENDER_GEO = lee('tender-geo.json')
const QUEJAS = lee('quejas.json')

/** El id de cada tarjeta y la clave del glosario que dice qué es, en el orden de la página. */
const INSTITUCIONES = [
  ['sindic', 'sindicDeGreuges'],
  ['consell-transparencia', 'consellDeTransparencia'],
  ['ctbg', 'ctbg'],
  ['sindicatura', 'sindicaturaDeComptes'],
]

describe('/quejas · quién más vigila, con lo publicado', () => {
  async function montaLaPagina() {
    localStorage.setItem('cp:lang', 'es')
    installFetchMock(
      Object.fromEntries(
        [
          'quejas.json',
          'geo.json',
          'tender-geo.json',
          'sindic-expedientes.json',
          'sindic.json',
          'consell-cv.json',
          'ctbg.json',
          'sindicatura.json',
          'bop.json',
        ].map((f) => [`/data/${f}`, lee(f)]),
      ),
    )
    const { container } = render(
      <MemoryRouter>
        <LocaleProvider>
          <Quejas />
        </LocaleProvider>
      </MemoryRouter>,
    )
    await waitFor(
      () => {
        for (const [id] of INSTITUCIONES)
          expect(container.querySelector(`[id="${id}"]`), id).not.toBeNull()
        expect(container.querySelector('[data-datos-tecnicos]')).not.toBeNull()
        expect(
          container.querySelector('[data-cruce-pendiente], .cp-cruce'),
          'el cruce',
        ).not.toBeNull()
      },
      { timeout: 15000 },
    )
    return container
  }

  it('las cuatro tarjetas van bajo un solo título, en su orden y un nivel por debajo', async () => {
    const c = await montaLaPagina()
    const grupo = c.querySelector('section[aria-labelledby="quien-mas-vigila"]')
    expect(grupo).not.toBeNull()
    expect(grupo.querySelector('h2#quien-mas-vigila').textContent).toBe(
      CATALOGUE.es['quejas.vigilan.titulo'],
    )
    const tarjetas = [...grupo.querySelectorAll('[data-tarjeta][id]')]
    expect(tarjetas.map((t) => t.id)).toEqual(INSTITUCIONES.map(([id]) => id))
    for (const t of tarjetas) {
      expect(t.querySelector('h2'), t.id).toBeNull()
      expect(t.querySelector('h3'), t.id).not.toBeNull()
    }
  }, 60000)

  it('cada tarjeta abre con qué es la institución: su definición del glosario', async () => {
    const c = await montaLaPagina()
    for (const [id, clave] of INSTITUCIONES) {
      const linea = c.querySelector(`[id="${id}"] [data-que-es]`)
      expect(linea?.getAttribute('data-que-es'), id).toBe(clave)
      expect(linea.textContent).toBe(CATALOGUE.es[`glosario.${clave}.def`])
    }
  }, 60000)

  it('el BOP no es quien vigila: queda fuera del grupo', async () => {
    const c = await montaLaPagina()
    const grupo = c.querySelector('section[aria-labelledby="quien-mas-vigila"]')
    const bop = [...c.querySelectorAll('h2, h3')].find((h) =>
      /Boletín Oficial de la Provincia/.test(h.textContent),
    )
    expect(bop, 'mide algo: la tarjeta del BOP se pinta').toBeDefined()
    expect(grupo.contains(bop)).toBe(false)
  }, 60000)

  it('la fecha, la fuente y el formato del canal van al pie, no en el feed', async () => {
    const c = await montaLaPagina()
    const pie = c.querySelector('[data-datos-tecnicos]')
    expect(pie.textContent).toContain(
      rellena(CATALOGUE.es['quejas.datosTecnicos.fuente'], { fuente: QUEJAS.source.platform }),
    )
    expect(pie.textContent).toContain(
      rellena(CATALOGUE.es['quejas.datosTecnicos.formato'], { formato: QUEJAS.source.spec }),
    )
    expect(pie.querySelector('a[href="/data/quejas.json"]')).not.toBeNull()
    expect(c.textContent).not.toContain('Snapshot:')
    // Es lo último de la página.
    expect(c.querySelector('.cp-page').lastElementChild).toBe(pie)
  }, 60000)

  it('el cruce se dibuja o no según los barrios con quejas de lo publicado', async () => {
    const c = await montaLaPagina()
    const cruce = cruceDibujable(
      computeOverlapRows({
        neighborhoods: GEO.neighborhoods,
        zones: TENDER_GEO.zones,
        instantanea: QUEJAS,
      }),
    )
    const pendiente = c.querySelector('[data-cruce-pendiente]')
    if (cruce.dibujable) {
      expect(pendiente).toBeNull()
      expect(c.querySelector('.cp-cruce')).not.toBeNull()
    } else {
      expect(c.querySelector('.cp-cruce')).toBeNull()
      expect(pendiente.textContent).toContain(
        rellena(CATALOGUE.es['quejas.cruce.pendiente'], { minimo: cruce.minimo }),
      )
    }
  }, 60000)
})

// ─── Los bloques nuevos, solos y en los dos idiomas ─────────────────────────

/** La queja publicada, en un barrio que geo.json conoce o sin barrio. */
const conUnaQueja = (barrio) => {
  const q = { ...QUEJAS.items[0], address_string: barrio }
  return { ...QUEJAS, stats: { ...QUEJAS.stats, total: 1 }, items: [q] }
}

const escenario = (nombre, quejas) => ({
  nombre,
  fetch: {
    '/data/geo.json': GEO,
    '/data/tender-geo.json': TENDER_GEO,
    '/data/quejas.json': quejas,
  },
  pinta: () => (
    <>
      <QuienMasVigila>
        {INSTITUCIONES.map(([, clave]) => (
          <QueEsLaInstitucion key={clave} clave={clave} />
        ))}
      </QuienMasVigila>
      <QuejasSpendOverlap />
      <DatosTecnicos data={quejas} />
    </>
  ),
  listo: (c) =>
    c.querySelectorAll('[data-que-es]').length === INSTITUCIONES.length &&
    c.querySelector('[data-cruce-pendiente]') !== null,
})

// La tercera trae un barrio que geo.json no conoce: no está «sin barrio», y por
// eso la frase dice «situada en un barrio del mapa» y no que la queja no lo diga.
const ESCENARIOS = [
  escenario('una queja, en un barrio', conUnaQueja(GEO.neighborhoods[0].slug)),
  escenario('una queja, sin barrio', conUnaQueja(null)),
  escenario('una queja, en un barrio que el mapa no conoce', conUnaQueja('barrio-que-no-esta')),
]

/** Nombres propios y lo que se escribe igual en los dos idiomas. */
const SIGLAS = [
  'Síndic de Greuges',
  'Consell de Transparència',
  'Sindicatura de Comptes',
  'Comunitat Valenciana',
  'Riba-roja',
  'quejas.json',
]

describe('/quejas · quién más vigila, el cruce y el pie, en los dos idiomas', () => {
  it('mide algo: los escenarios dan las dos frases del cruce', async () => {
    // Uno detrás de otro: pintaYLee comparte la caché de instantáneas.
    const leidos = []
    for (const esc of ESCENARIOS) leidos.push((await pintaYLee(esc, 'es')).piezas.join('\n'))
    const [enBarrio, sinBarrio, desconocido] = leidos
    expect(enBarrio).toContain(rellena(CATALOGUE.es['quejas.cruce.pendiente.n'], { n: 1 }).trim())
    expect(sinBarrio).toContain(CATALOGUE.es['quejas.cruce.pendiente.ninguno'].trim())
    expect(desconocido).toContain(CATALOGUE.es['quejas.cruce.pendiente.ninguno'].trim())
  }, 60000)

  it.each(ESCENARIOS)(
    '$nombre: en valencià, nada en castellano que no sea dato',
    async (esc) => {
      const es = await pintaYLee(esc, 'es')
      const ca = await pintaYLee(esc, 'ca')
      expect(es.pedidasSinServir).toEqual([])
      expect(ca.piezas.length).toBe(es.piezas.length)
      const datos = datosPintados(es.piezas, cadenasDe(esc.fetch))
      const { castellanoEn, sinTraducir } = detectorDeCastellano(
        masLargasPrimero([...datos, ...SIGLAS]),
      )
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

  it('cada cadena nueva se pinta en algún escenario', async () => {
    const claves = Object.keys(CATALOGUE.es).filter(
      (k) =>
        k.startsWith('quejas.vigilan.') ||
        k.startsWith('quejas.datosTecnicos.') ||
        k.startsWith('quejas.cruce.pendiente') ||
        INSTITUCIONES.some(([, clave]) => k === `glosario.${clave}.def`),
    )
    expect(claves.length).toBe(2 + 5 + 3 + INSTITUCIONES.length)
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
