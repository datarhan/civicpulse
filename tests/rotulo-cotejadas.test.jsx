import { afterEach, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import CargoDetalle from '../src/pages/CargoDetalle'
import { CATALOGUE, LocaleProvider } from '../src/i18n'
import { deptSlugToClaimTopics } from '../src/lib/department-claim-topics'
import { installFetchMock } from './setup/mockFetch'

/**
 * El agregado de declaraciones se llama «cotejadas», no «contrastadas».
 *
 * La revisión lectora del pre-push de la #249 (06-10-2026) leyó «8 contrastadas» en
 * /departamentos/medio-ambiente, y las ocho eran `parcial`. En castellano una
 * información contrastada es una información comprobada —y en valencià
 * «contrastada» dice lo mismo—, así que la cifra se leía como ocho declaraciones
 * comprobadas y ciertas. Lo que cuenta es otra cosa: las que se pudieron comparar
 * con un documento municipal, saliera a favor o en contra (verificadas + parciales +
 * contradichas). Antes se llamó «con evidencia», que se leía «respaldada»
 * (tests/rotulo-contrastadas.test.js); el mismo error con otra palabra.
 *
 * Se llama «cotejada(s)» / «acarada(es)» —comparar, sin decir el resultado— y donde
 * se da la cifra va al lado cuántas son de cada veredicto, contado del dato.
 *
 * El detector busca el participio afirmativo: «no contrastada», «no esté
 * contrastada», «sin contrastar» o «que las contrasten» dicen una ausencia o un
 * proceso, no un resultado, y siguen. No juzga prosa: lee lo que la web pinta —el
 * texto de las páginas y de sus módulos, sin comentarios— y los valores del
 * catálogo, en los dos idiomas.
 *
 * Una sola excepción, y no es de declaraciones: /aviso-legal dice que los datos de
 * una adjudicación están «contrastados uno a uno contra la ficha» de PLACSP, y ahí
 * la palabra dice lo que pasó —se comprobaron y coinciden—.
 */
const RAIZ = join(__dirname, '..')
const RETIRADO =
  /(?<!\b(?:no|ni|sin|sense)\s+(?:\p{L}+\s+)?)(?<!\p{L})contrasta(?:d[ao]s?|des|ts?)(?!\p{L})(?! uno a uno contra la ficha)/iu

function fuentes(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const ruta = join(dir, f)
    if (statSync(ruta).isDirectory()) fuentes(ruta, out)
    else if (/\.jsx?$/.test(ruta)) out.push(ruta)
  }
  return out
}

/** El código sin comentarios y con las frases que Prettier parte, unidas. */
const pintable = (codigo) =>
  codigo
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\{' '\}/g, ' ')
    .replace(/\s+/g, ' ')

const PAGINAS = fuentes(join(RAIZ, 'src'))

describe('el agregado se llama «cotejadas», no «contrastadas»', () => {
  it('mide algo: lee las páginas, sus módulos y el catálogo', () => {
    expect(PAGINAS.filter((p) => p.endsWith('.jsx')).length).toBeGreaterThan(100)
    expect(PAGINAS.some((p) => p.endsWith('src/pages/Metodologia.jsx'))).toBe(true)
    expect(PAGINAS.some((p) => p.endsWith('src/pages/AvisoLegal.jsx'))).toBe(true)
    expect(Object.keys(CATALOGUE.es).length).toBeGreaterThan(500)
    expect(Object.keys(CATALOGUE.ca).length).toBeGreaterThan(500)
  })

  it('el detector ve el rótulo en los dos idiomas y deja la negación (el control)', () => {
    for (const visto of [
      '8 contrastadas',
      'Declaraciones contrastadas',
      '1 declaración contrastada',
      'Declaracions contrastades',
      'Documents contrastats',
      'se enseña como contrastado',
      'extraído y contrastado',
      pintable('<strong>8</strong> contrastadas'),
    ]) {
      expect(RETIRADO.test(visto), visto).toBe(true)
    }
    for (const limpio of [
      'acusación no contrastada',
      'Qué significa que una cita no esté contrastada →',
      'hechos fechados— contrastados uno a uno contra la ficha del expediente',
      'acusaciones públicas sin contrastar',
      'Publicadas sin datos que las contrasten',
      '5 cotejadas con un documento (1 verificada, 4 parciales)',
      '5 acarades amb un document (1 verificada, 4 parcials)',
      'sin contraste en los datos',
      pintable('// decía «8 contrastadas»\nconst x = 1'),
      pintable('{/* «Declaraciones contrastadas» */}'),
    ]) {
      expect(RETIRADO.test(limpio), limpio).toBe(false)
    }
  })

  it('ninguna página ni módulo lo pinta', () => {
    const conRotulo = PAGINAS.filter((p) => RETIRADO.test(pintable(readFileSync(p, 'utf8'))))
    expect(conRotulo.map((p) => relative(RAIZ, p))).toEqual([])
  })

  it('ningún valor del catálogo lo dice, en ninguno de los dos idiomas', () => {
    const claves = ['es', 'ca'].flatMap((l) =>
      Object.entries(CATALOGUE[l])
        .filter(([, v]) => RETIRADO.test(String(v)))
        .map(([k]) => `${l}:${k}`),
    )
    expect(claves).toEqual([])
  })
})

// ─── /cargos/:slug: la cifra al lado del nombre de quien dirige el área ─────────

/**
 * Donde más pesa: la ficha de un cargo decía «5 declaracions contrastades» de su
 * área, debajo de su nombre, con una verificada y cuatro parciales. Y con una sola,
 * «1 declaracions contrastades». Se le sirven recuentos por tema y veredicto como los
 * escribe el troceador (`totals.byTopicVerdict`); las cifras son de la prueba.
 */
const SLUG = 'ana-prueba'
const [TEMA] = deptSlugToClaimTopics('urbanismo')
const MANIFIESTO = JSON.parse(
  readFileSync(join(RAIZ, 'public/data/pleno-claims/index.json'), 'utf8'),
)

function monta(idioma, porVeredicto) {
  localStorage.setItem('cp:lang', idioma)
  installFetchMock({
    '/data/officials.json': {
      generatedAt: '2026-04-20T00:00:00Z',
      officials: [
        {
          slug: SLUG,
          name: 'Ana Prueba',
          role: 'concejal',
          party: 'PSOE',
          portfolios: ['Urbanismo'],
          photoUrl: '',
        },
      ],
    },
    '/data/promises.json': { items: [] },
    '/data/plenos-agendas.json': { plenos: [] },
    '/data/pleno-votes.json': { items: [] },
    '/data/quejas.json': { stats: { total: 0 }, items: [] },
    '/data/tenders.json': { contracts: [] },
    '/data/pleno-claims/index.json': {
      ...MANIFIESTO,
      totals: { ...MANIFIESTO.totals, byTopicVerdict: { [TEMA]: porVeredicto } },
    },
  })
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={[`/cargos/${SLUG}`]}>
        <Routes>
          <Route path="/cargos/:slug" element={<CargoDetalle />} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  )
}

/** La fila de Urbanismo en «Actividad de sus áreas», cuando ya tiene su recuento. */
async function filaDeUrbanismo(idioma, n) {
  const titulo = await screen.findByText(CATALOGUE[idioma]['cargos.detalle.actividad.title'])
  const enlace = titulo.closest('section').querySelector('a[href="/departamentos/urbanismo"]')
  expect(enlace, 'la sección no enlaza a la ficha de Urbanismo').not.toBeNull()
  const fila = enlace.parentElement
  await screen.findByText(
    (_, el) => el === fila && new RegExp(`\\b${n} declaraci`).test(el.textContent),
  )
  return fila.textContent.replace(/\s+/g, ' ')
}

afterEach(() => localStorage.clear())

describe('/cargos/:slug · las declaraciones de sus áreas dicen qué son', () => {
  it('existe el tema del área en el que se siembra el recuento', () => {
    expect(TEMA).toBeTruthy()
  })

  it.each([
    [
      'es',
      { parcial: 2, 'sin-datos': 7 },
      '2 declaraciones cotejadas (2 parciales)',
      'la forma de la revisión: todas parciales',
    ],
    [
      'ca',
      { parcial: 2, 'sin-datos': 7 },
      '2 declaracions acarades (2 parcials)',
      'la forma de la revisión, en valencià',
    ],
    ['es', { parcial: 1 }, '1 declaración cotejada (1 parcial)', 'una sola: singular'],
    ['ca', { parcial: 1 }, '1 declaració acarada (1 parcial)', 'una sola, en valencià'],
    [
      'es',
      { verificado: 1, parcial: 4, 'sin-datos': 3 },
      '5 declaraciones cotejadas (1 verificada, 4 parciales)',
      'mezcla: cada veredicto con su cifra',
    ],
    [
      'ca',
      { verificado: 1, parcial: 4, 'sin-datos': 3 },
      '5 declaracions acarades (1 verificada, 4 parcials)',
      'mezcla, en valencià',
    ],
    [
      'es',
      { contradicho: 2, verificado: 1 },
      '3 declaraciones cotejadas (1 verificada, 2 contradichas)',
      'contradichas también son cotejadas',
    ],
    [
      'ca',
      { contradicho: 1 },
      '1 declaració acarada (1 contradita)',
      'contradita, en singular y en valencià',
    ],
    ['es', { 'sin-datos': 4 }, '0 declaraciones cotejadas', 'ninguna: sin desglose'],
  ])('%s · %j → «%s» (%s)', async (idioma, porVeredicto, esperado) => {
    monta(idioma, porVeredicto)
    const fila = await filaDeUrbanismo(idioma, esperado.split(' ')[0])
    expect(fila).toContain(esperado)
    expect(fila).not.toMatch(RETIRADO)
    if (!esperado.includes('(')) expect(fila).not.toMatch(/cotejadas \(/)
  })
})
