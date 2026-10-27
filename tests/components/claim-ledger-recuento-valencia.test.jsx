/**
 * La línea de recuento del registro de declaraciones, en castellano y en valencià.
 *
 * `ClaimLedger` abre su lista con «N contrastadas · M sin contraste en los datos» en
 * dos sitios: la pestaña «Declaraciones contrastadas» de /plenos/:id y la sección de
 * declaraciones de /departamentos/:slug. Las dos palabras estaban escritas en
 * castellano dentro del JSX, así que en valencià la línea salía igual: el 03-10-2026,
 * en /departamentos/urbanismo y en una build servida, «3 contrastadas · 1060 sin
 * contraste en los datos». Ninguna guarda valenciana (`*-valencia.test.jsx`) pinta
 * esas dos páginas, y por eso nada lo veía.
 *
 * Con una sola contrastada decía además «1 contrastadas». La línea del resumen de la
 * misma ficha aprendió el singular en la #234 (`plenoDetail.line.*`); ésta lo aprende
 * con las mismas claves `.uno`/`.varios`. El cero va en plural, como allí.
 *
 * Y «contrastadas» decía de más. La revisión lectora del 06-10-2026 leyó «8
 * contrastadas» en /departamentos/medio-ambiente, y las ocho eran parciales: en
 * castellano una información contrastada es una información comprobada. Lo que la
 * cifra cuenta es que se cotejaron con un documento municipal, saliera como saliera;
 * así que se llaman «cotejadas con un documento» / «acarades amb un document», y al
 * lado va cuántas son de cada veredicto, contado del dato.
 *
 * Lo que se sirve son declaraciones publicadas que pasan la puerta del registro, en el
 * número que cada escenario necesita para pintar cada forma; en /departamentos, con el
 * tema del área puesto, que es una mutación pequeña y nombrada. Las palabras esperadas
 * están escritas a mano, en los dos idiomas: son lo que esta prueba fija. El resto de
 * la tarjeta —«Fuentes comprobadas», el veredicto, el tipo— y la barra de veredictos
 * de /departamentos los lee tests/components/claim-ledger-valencia.test.jsx.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fireEvent, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import PlenoDetalle from '../../src/pages/PlenoDetalle'
import DepartamentoDetalle from '../../src/pages/DepartamentoDetalle'
import { CATALOGUE } from '../../src/i18n'
import { gateForDisplay } from '../../src/lib/claim-ledger'
import { deptSlugToClaimTopics } from '../../src/lib/department-claim-topics'
import { detectorDeCastellano } from '../setup/castellano'
import { pintaYLee } from '../setup/pinta-y-lee'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const MANIFIESTO = lee('pleno-claims/index.json')
const PLENOS = lee('plenos.json')
const VOTOS = lee('pleno-votes.json')
const HALLAZGOS = lee('pleno-findings.json')
const VIDEOS = lee('pleno-videos.json')
const VIDEOS_REGMEET = lee('pleno-videos-regmeet.json')
const AGENDAS = lee('plenos-agendas.json')

/** Un fragmento publicado, para la forma del fichero que se sirve. */
const FRAGMENTO = lee(MANIFIESTO.plenos[0].chunkPath)

/** Lo que el registro pinta del corpus publicado: lo que pasa su misma puerta. */
const VISIBLES = gateForDisplay(MANIFIESTO.plenos.flatMap((p) => lee(p.chunkPath).items))
const PARCIALES = VISIBLES.filter((it) => it.verification?.verdict === 'parcial')
const VERIFICADAS = VISIBLES.filter((it) => it.verification?.verdict === 'verificado')
const SIN_CONTRASTE = VISIBLES.filter((it) => it.verification?.verdict === 'sin-datos')

// ─── Las dos páginas ───────────────────────────────────────────────────────────

const ID = 'p1'

/** /plenos/:id con estas declaraciones en su fragmento, y nada más de la sesión. */
const enElPleno = (declaraciones) => ({
  '/data/plenos.json': { ...PLENOS, items: [{ ...PLENOS.items[0], id: ID }] },
  '/data/pleno-votes.json': { ...VOTOS, items: [] },
  '/data/pleno-findings.json': { ...HALLAZGOS, items: [] },
  '/data/pleno-videos.json': { ...VIDEOS, items: [] },
  '/data/pleno-videos-regmeet.json': { ...VIDEOS_REGMEET, items: [] },
  '/data/plenos-agendas.json': { ...AGENDAS, plenos: [] },
  [`/data/pleno-claims/${ID}.json`]: { ...FRAGMENTO, plenoId: ID, items: declaraciones },
})

const SLUG = 'urbanismo'
const [TEMA] = deptSlugToClaimTopics(SLUG)
const CHUNK_DEL_AREA = `pleno-claims/${ID}.json`

/**
 * /departamentos/:slug con un corpus de un solo fragmento: estas declaraciones, con el
 * tema del área, para que el filtro de la sección las deje pasar todas.
 */
const enElArea = (declaraciones) => ({
  '/data/officials.json': { officials: [] },
  '/data/promises.json': { items: [] },
  '/data/plenos-agendas.json': { plenos: [] },
  '/data/pleno-votes.json': { items: [] },
  '/data/quejas.json': { stats: { total: 0 }, items: [] },
  '/data/pleno-claims/index.json': {
    ...MANIFIESTO,
    plenos: [{ ...MANIFIESTO.plenos[0], plenoId: ID, chunkPath: CHUNK_DEL_AREA }],
  },
  [`/data/${CHUNK_DEL_AREA}`]: {
    ...FRAGMENTO,
    plenoId: ID,
    items: declaraciones.map((it) => ({ ...it, claim: { ...it.claim, topic: TEMA } })),
  },
})

// ─── Qué se lee ────────────────────────────────────────────────────────────────

/**
 * La línea de recuento: el elemento más interior que nombra lo que no tiene contraste
 * y separa sus piezas con « · ». Se busca por lo que dice, en las dos lenguas, y no
 * por su etiqueta, para que la prueba falle por la redacción y no por un selector.
 */
function lineaDe(c) {
  const candidatas = [...c.querySelectorAll('*')].filter(
    (el) =>
      /sin contraste en los datos|sense contrast en les dades/.test(el.textContent) &&
      el.textContent.includes(' · '),
  )
  if (candidatas.length === 0) return null
  return candidatas.reduce((a, b) => (b.textContent.length < a.textContent.length ? b : a))
}

const leeLinea = (c) => {
  const linea = lineaDe(c)
  return linea ? [linea.textContent] : []
}

/** En /plenos/:id las pestañas se montan al pulsarlas: la línea sale al abrir la suya. */
async function abreDeclaraciones(c) {
  fireEvent.click(c.querySelector('[data-pestana="declaraciones"]'))
  const linea = await waitFor(() => {
    const l = lineaDe(c)
    expect(l, 'la pestaña de declaraciones no pinta la línea de recuento').not.toBeNull()
    return l
  })
  return [linea.textContent]
}

/**
 * La tarjeta de una cotejada puede montar el puente de importe, que pide
 * `tenders.json` —1,4 MB— para cuadrar dos cifras del mismo expediente. Esta prueba
 * lee la línea de recuento y no las tarjetas, así que no se sirve a propósito.
 */
const FALTAN_ADREDE = ['/data/tenders.json']

const enPleno = (nombre, declaraciones, es, ca) => ({
  nombre: `/plenos/:id · ${nombre}`,
  ruta: `/plenos/${ID}`,
  fetch: enElPleno(declaraciones),
  faltanAdrede: FALTAN_ADREDE,
  pinta: () => (
    <Routes>
      <Route path="/plenos/:id" element={<PlenoDetalle />} />
    </Routes>
  ),
  listo: (c) => c.querySelector('[data-pestana="declaraciones"]') !== null,
  interactua: abreDeclaraciones,
  es,
  ca,
})

const enArea = (nombre, declaraciones, es, ca) => ({
  nombre: `/departamentos/${SLUG} · ${nombre}`,
  ruta: `/departamentos/${SLUG}`,
  fetch: enElArea(declaraciones),
  faltanAdrede: FALTAN_ADREDE,
  pinta: () => (
    <Routes>
      <Route path="/departamentos/:slug" element={<DepartamentoDetalle />} />
    </Routes>
  ),
  listo: (c) => lineaDe(c) !== null,
  es,
  ca,
})

// ─── Lo que tiene que decir ────────────────────────────────────────────────────

const ESCENARIOS = [
  enPleno(
    'una parcial y tres sin contraste',
    [PARCIALES[0], ...SIN_CONTRASTE.slice(0, 3)],
    '1 cotejada con un documento (1 parcial) · 3 sin contraste en los datos',
    '1 acarada amb un document (1 parcial) · 3 sense contrast en les dades',
  ),
  enPleno(
    'dos parciales y una sin contraste: la forma de la revisión lectora',
    [...PARCIALES.slice(0, 2), SIN_CONTRASTE[0]],
    '2 cotejadas con un documento (2 parciales) · 1 sin contraste en los datos',
    '2 acarades amb un document (2 parcials) · 1 sense contrast en les dades',
  ),
  enPleno(
    'ninguna cotejada: el cero va en plural y sin desglose',
    SIN_CONTRASTE.slice(0, 2),
    '0 cotejadas con un documento · 2 sin contraste en los datos',
    '0 acarades amb un document · 2 sense contrast en les dades',
  ),
  enArea(
    'una verificada, dos parciales y dos sin contraste',
    [VERIFICADAS[0], ...PARCIALES.slice(0, 2), ...SIN_CONTRASTE.slice(0, 2)],
    '3 cotejadas con un documento (1 verificada, 2 parciales) · 2 sin contraste en los datos',
    '3 acarades amb un document (1 verificada, 2 parcials) · 2 sense contrast en les dades',
  ),
]

describe('la línea de recuento · lo que necesita del dato publicado', () => {
  it('hay declaraciones visibles de las dos clases para pintar cada forma', () => {
    expect(PARCIALES.length, 'parciales visibles').toBeGreaterThanOrEqual(2)
    expect(VERIFICADAS.length, 'verificadas visibles').toBeGreaterThanOrEqual(1)
    expect(SIN_CONTRASTE.length, 'sin contraste visibles').toBeGreaterThanOrEqual(3)
    expect(TEMA, `temas de ${SLUG}`).toBeTruthy()
  })
})

describe('la línea de recuento del registro dice lo mismo en castellano y en valencià', () => {
  it.each(ESCENARIOS)(
    '$nombre',
    async (escenario) => {
      const es = await pintaYLee(escenario, 'es', { lee: leeLinea })
      const ca = await pintaYLee(escenario, 'ca', { lee: leeLinea })
      expect.soft(es.pedidasSinServir, 'la página pide datos que la prueba no sirve').toEqual([])
      expect.soft(es.piezas, 'castellano').toEqual([escenario.es])
      expect.soft(ca.piezas, 'valencià').toEqual([escenario.ca])
      expect
        .soft(
          ca.piezas.flatMap((s) => detectorDeCastellano([]).castellanoEn(s)),
          'castellano dentro del valencià',
        )
        .toEqual([])
    },
    60000,
  )
})

/**
 * Cobertura: cada cadena `ledger.recuento.*` sale, palabra a palabra, en lo que algún
 * escenario espera, en los dos idiomas; y lo que espera cada escenario es lo que la
 * prueba de arriba lee pintado. Una forma nueva sin escenario nacería sin leer.
 */
describe('cobertura de la guarda de la línea de recuento', () => {
  const PREFIJO = 'ledger.recuento.'
  const claves = Object.keys(CATALOGUE.es).filter((k) => k.startsWith(PREFIJO))
  const escapa = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Entera: «cotejada» no cuenta como pintada porque se lea «cotejadas».
  const palabraEntera = (trozo) => new RegExp(`(?<!\\p{L})${escapa(trozo)}(?!\\p{L})`, 'u')

  it('el catálogo tiene las cadenas de la línea (si no, esto no mide nada)', () => {
    expect(claves.length).toBeGreaterThanOrEqual(3)
  })

  it.each(['es', 'ca'])('toda cadena %s de la línea sale en algún escenario', (idioma) => {
    const esperado = ESCENARIOS.map((e) => e[idioma])
    const sinPintar = claves.filter((clave) =>
      CATALOGUE[idioma][clave]
        .split(/\{\w+\}/)
        .map((trozo) => trozo.trim())
        .filter((trozo) => /\p{L}/u.test(trozo))
        .some((trozo) => !esperado.some((linea) => palabraEntera(trozo).test(linea))),
    )
    expect(sinPintar).toEqual([])
  })
})
