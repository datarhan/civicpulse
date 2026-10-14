/**
 * /hallazgos/:id leída entera en valencià, ficha a ficha, y la lista /hallazgos.
 *
 * La #320 pasó al catálogo las citas de la ficha y sus notas (`findings.citas.*`),
 * y su prueba (`citas-de-la-ficha-valencia.test.jsx`) lee sólo ese componente. El
 * resto de la página seguía escrito a mano en castellano: las tres bandas —«Lo que
 * se dijo», «Contra qué se cotejó», «Derecho de réplica»—, lo que dicen cuando
 * están vacías, la cabecera de la ficha, la bitácora de correcciones, la huella de
 * un hallazgo retirado y la propia pastilla de la fecha. Un lector que pedía la
 * página en valencià leía los rótulos de la ficha en castellano.
 *
 * Esta prueba pinta la página como la sirve el sitio —la copia servida, sin los
 * literales retenidos ni las versiones que nombraban a un grupo de un solo escaño
 * (`copiaServidaDeHallazgos`)— para CADA ficha publicada y cada retirada, en los
 * dos idiomas, y la compara pieza a pieza. Un escenario más le pone a unas fichas
 * reales cada forma que el dato publicado no trae hoy —réplica, atribución
 * individual, ficha sin citas, cada gravedad, filas de bitácora retenidas— para que
 * una rama a medio traducir no pase por no pintarse. La lista se lee una vez con
 * todas las fichas.
 *
 * Es dato, y se pinta como se publica, sólo lo que sale de la ficha: título,
 * sumario, citas y su grupo, quién la editó, el texto de los documentos cotejados,
 * las versiones y los motivos de la bitácora, la réplica, el motivo de una retirada.
 * Lo demás, en valencià, no puede quedar en castellano.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { Route, Routes } from 'react-router-dom'

import HallazgoDetalle from '../../src/pages/HallazgoDetalle'
import Hallazgos from '../../src/pages/Hallazgos'
import { CATALOGUE } from '../../src/i18n'
import { codigoDeFicha } from '../../src/components/PlenoFindings'
import { SEVERITY_LABEL } from '../../src/hooks/usePlenoFindings'
import { MARCA_GRUPO_RETENIDO, ROTULO_GRUPO_RETENIDO } from '../../src/lib/grupo-retenido'
import {
  ROTULO_MOTIVO_ENMENDADO,
  ROTULO_TEXTO_RETIRADO,
  ROTULO_TEXTO_SUSTITUIDO,
  ROTULO_TEXTO_VIGENTE,
} from '../../src/components/BitacoraCorrecciones'
import { ROTULO_CITA_RETENIDA } from '../../src/lib/cita-retenida'
import { HUMAN_CURATORS } from '../../src/scraper/finding-authorship'
import { copiaServidaDeHallazgos } from '../../publication-denylist.js'
import { detectorDeCastellano, lectura, masLargasPrimero } from '../setup/castellano'
import { pintaYLee } from '../setup/pinta-y-lee'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))

const PROV = lee('finding-quote-provenance.json')
const SERVIDA = copiaServidaDeHallazgos(
  lee('pleno-findings.json'),
  PROV,
  lee('officials.json'),
).snapshot
const TENDERS = lee('tenders.json')

const sirve = (hallazgos) => ({
  '/data/pleno-findings.json': hallazgos,
  '/data/finding-quote-provenance.json': PROV,
  '/data/tenders.json': TENDERS,
})

// ─── Cada forma que el dato publicado no trae ─────────────────────────────────

/**
 * La copia servida con unas fichas reales retocadas: una con réplica (y su
 * fuente) y atribución individual, una sin citas, una sin documentos cotejados,
 * las tres gravedades, una firmada por una persona, y una bitácora con una fila
 * de literal retenido y otra de grupo de un solo escaño, de cada lado, y una
 * cita re-escrita y retirada después.
 */
function cadaForma() {
  const copia = structuredClone(SERVIDA)
  const [a, b, c, d] = copia.items.filter((f) => (f.crossChecked ?? []).length > 0)
  a.response = {
    from: 'PP',
    respondedAt: '2026-01-15',
    quote: 'Texto literal de la réplica del grupo.',
    sourceUrl: 'https://example.org/replica',
  }
  a.individualSpeaker = { name: 'Nombre Apellido', party: 'PP' }
  b.quotes = []
  c.crossChecked = []
  c.contradiction = []
  const gravedades = Object.keys(SEVERITY_LABEL)
  ;[a, b, c].forEach((f, i) => (f.severity = gravedades[i]))
  d.curatorName = [...HUMAN_CURATORS][0]
  const fila = d.corrections?.[0] ?? { field: 'summary', editor: 'x', correctedAt: '2026-01-01' }
  d.corrections = [
    ...(d.corrections ?? []),
    {
      ...fila,
      original: `${ROTULO_CITA_RETENIDA} · sha256:aaaaaaaaaaaa`,
      corrected: `${ROTULO_CITA_RETENIDA} · sha256:bbbbbbbbbbbb`,
      reasonAmendments: undefined,
      literalRetenido: true,
    },
    { ...fila, original: MARCA_GRUPO_RETENIDO, reasonAmendments: undefined, grupoRetenido: true },
    { ...fila, corrected: MARCA_GRUPO_RETENIDO, reasonAmendments: undefined, grupoRetenido: true },
    {
      ...fila,
      original: MARCA_GRUPO_RETENIDO,
      corrected: MARCA_GRUPO_RETENIDO,
      reasonAmendments: undefined,
      grupoRetenido: true,
    },
    // Una cita cuyo texto se cambió y que después se retiró entera: su fila de
    // texto no es vigente, y su cabecera dice que la cita ya no está.
    { ...fila, field: 'quote.9.text', reasonAmendments: undefined },
    {
      ...fila,
      field: 'quote.9',
      original: 'cita · sha256:cccccccccccc',
      corrected: 'retirada del hallazgo',
      reasonAmendments: undefined,
    },
  ]
  return { snapshot: copia, retocadas: [a, b, c, d].map((f) => f.id) }
}

// ─── Los escenarios ────────────────────────────────────────────────────────────

const laFicha = () => (
  <Routes>
    <Route path="/hallazgos/:id" element={<HallazgoDetalle />} />
  </Routes>
)

const PUBLICADA = SERVIDA.items
const FORMAS = cadaForma()

/**
 * Las fichas con documentos cotejados van delante: piden `tenders.json`, y pintar
 * primero una que no los pide dejaría esa ruta sin llegar en la pasada que vacía
 * la caché.
 */
const conCotejosPrimero = (fichas) =>
  [...fichas].sort(
    (x, y) => Number((y.crossChecked ?? []).length > 0) - Number((x.crossChecked ?? []).length > 0),
  )

const ficha = (f, mapa, etiqueta) => ({
  nombre: `${etiqueta} ${f.id}`,
  ruta: `/hallazgos/${f.id}`,
  fetch: mapa,
  pinta: laFicha,
  // La tarjeta con sus tres bandas (`EvidenceBand` pinta un <section>).
  listo: (c) => !!c.querySelector(`[id="${f.id}"]`) && c.querySelectorAll('section').length >= 3,
  hallazgo: f,
})

const MAPA_PUBLICADO = sirve(SERVIDA)
const MAPA_FORMAS = sirve(FORMAS.snapshot)
/** La huella de una retirada no pinta ninguna ficha: no pide citas ni contratos. */
const MAPA_SOLO_HALLAZGOS = { '/data/pleno-findings.json': SERVIDA }

const ESCENARIOS_FICHA = [
  ...conCotejosPrimero(PUBLICADA).map((f) => ficha(f, MAPA_PUBLICADO, 'publicada')),
  ...conCotejosPrimero(FORMAS.snapshot.items.filter((f) => FORMAS.retocadas.includes(f.id))).map(
    (f) => ficha(f, MAPA_FORMAS, 'con cada forma'),
  ),
]

const ESCENARIOS_RETIRADA = [
  ...(SERVIDA.retractions ?? []).map((r) => ({
    nombre: `retirada ${r.findingId}`,
    ruta: `/hallazgos/${r.findingId}`,
    fetch: MAPA_SOLO_HALLAZGOS,
    pinta: laFicha,
    listo: (c) => c.textContent.includes(r.digest),
    retirada: r,
  })),
  {
    nombre: 'un enlace que no lleva a ningún hallazgo',
    ruta: '/hallazgos/f-0000-00-00-xxx-000000',
    fetch: MAPA_SOLO_HALLAZGOS,
    pinta: laFicha,
    listo: (c) => !!c.querySelector('[data-no-resuelta]'),
  },
]

const laLista = () => (
  <Routes>
    <Route path="/hallazgos" element={<Hallazgos />} />
  </Routes>
)

const LA_LISTA = {
  nombre: '/hallazgos con todas las fichas',
  ruta: '/hallazgos',
  fetch: MAPA_PUBLICADO,
  pinta: laLista,
  listo: (c) => PUBLICADA.every((f) => !!c.querySelector(`[id="${f.id}"]`)),
}

/**
 * Las dos frases de una lista sin fichas que pintar: ninguna publicada, y ninguna
 * que pase el filtro. Para la segunda, todas las fichas son informativas y se pulsa
 * el filtro de las críticas, que se pinta aunque no haya ninguna.
 */
const SIN_FICHAS = [
  {
    nombre: '/hallazgos sin ninguna ficha publicada',
    ruta: '/hallazgos',
    fetch: { ...sirve({ ...SERVIDA, items: [] }) },
    pinta: laLista,
    listo: (c) => c.querySelectorAll('.cp-cifras > *').length > 0,
    alPulsar: ['/data/tenders.json'],
  },
  {
    nombre: '/hallazgos con un filtro que no deja ninguna',
    ruta: '/hallazgos',
    fetch: sirve({
      ...SERVIDA,
      items: SERVIDA.items.map((f) => ({ ...f, severity: 'informational' })),
    }),
    pinta: laLista,
    listo: (c) => PUBLICADA.every((f) => !!c.querySelector(`[id="${f.id}"]`)),
    interactua: async (c) => {
      // «todas», y después las tres gravedades en su orden: la segunda es «critical».
      fireEvent.click(c.querySelectorAll('[data-print-hide] button')[1])
      await waitFor(() =>
        expect(PUBLICADA.some((f) => c.querySelector(`[id="${f.id}"]`))).toBe(false),
      )
      return lectura(c)
    },
  },
]

// ─── Qué es dato ───────────────────────────────────────────────────────────────

/** El verificador junta los trozos de un snippet con « · », y la ficha los pinta sueltos. */
const trozos = (s) => (typeof s === 'string' ? [s, ...s.split(' · ')] : [])

/** Lo que una ficha pinta de su propio dato. */
const datosDeLaFicha = (f) => [
  f.id,
  codigoDeFicha(f.id),
  f.title,
  f.summary,
  f.curatorName,
  f.plenoId,
  f.plenoDate,
  f.publishedAt,
  ...(f.quotes ?? []).flatMap((q) => [q.text, q.speakerGroup]),
  ...[...(f.crossChecked ?? []), ...(f.contradiction ?? [])].flatMap((r) => [
    r.ref,
    ...trozos(r.snippet),
  ]),
  ...(f.corrections ?? []).flatMap((c) => [
    c.field,
    c.editor,
    c.reason,
    String(c.correctedAt ?? '').slice(0, 10),
    ...trozos(c.original),
    ...trozos(c.corrected),
    ...(c.reasonAmendments ?? []).flatMap((a) => [a.editor, a.reason, ...trozos(a.previous)]),
  ]),
  f.response?.from,
  f.response?.quote,
  f.response?.respondedAt,
  f.individualSpeaker?.name,
  f.individualSpeaker?.party,
]

/** Lo que la huella de una retirada pinta del registro de retiradas. */
const datosDeLaRetirada = (r) => [
  r.findingId,
  r.plenoDate,
  r.retractedAt.slice(0, 10),
  r.editor,
  r.reason,
  // «hallazgo · sha256:…»: la huella tal como la guarda el registro.
  ...trozos(r.digest),
]

/** Lo que no es lengua: marcas, un algoritmo, una ruta impresa como enlace, y la
 * fecha de la instantánea, que la pastilla de frescura lleva en su `title`. */
const SIGLAS = ['WhatsApp', 'Telegram', 'sha256', '/aviso-legal', SERVIDA.generatedAt]

const NO_SE_TRADUCE = masLargasPrimero([
  ...[...PUBLICADA, ...FORMAS.snapshot.items].flatMap(datosDeLaFicha),
  ...(SERVIDA.retractions ?? []).flatMap(datosDeLaRetirada),
  ...SIGLAS,
])

// ─── La comparación ────────────────────────────────────────────────────────────

/**
 * Pinta un escenario en los dos idiomas y devuelve lo que en valencià sigue en
 * castellano —palabra a palabra, y pieza a pieza lo que se lee igual sin ser dato—.
 */
async function compara(esc) {
  const es = await pintaYLee(esc, 'es')
  const ca = await pintaYLee(esc, 'ca')
  expect(es.pedidasSinServir, `${esc.nombre}: pide datos que la prueba no sirve`).toEqual([])
  expect(ca.piezas.length, `${esc.nombre}: las mismas piezas en los dos idiomas`).toBe(
    es.piezas.length,
  )
  const { castellanoEn, sinTraducir } = detectorDeCastellano(NO_SE_TRADUCE)
  const castellano = ca.piezas.flatMap((p) =>
    castellanoEn(p).map((w) => `${esc.nombre}: «${w}» en «${p.slice(0, 100)}»`),
  )
  // Las compuestas —«2026-05-11 · pleno 10yl550 · editado por …»—, trozo a trozo;
  // no las que son dato enteras, como un título que lleva « · » dentro.
  const esDato = (p) => sinTraducir([[p, p]]).length === 0
  const pares = es.piezas.flatMap((p, i) =>
    p !== ca.piezas[i] ? [[p, ca.piezas[i]]] : esDato(p) ? [] : p.split(' · ').map((t) => [t, t]),
  )
  const iguales = sinTraducir(pares).map((s) => `${esc.nombre}: «${s.slice(0, 100)}»`)
  return { es, ca, castellano, iguales }
}

afterEach(() => localStorage.clear())

describe('el castellano de siempre', () => {
  /**
   * Los rótulos de la bitácora se exportan en castellano: /eficiencia y el informe
   * del agente pintan su propio marcado con ellos. Salen del catálogo, y el del
   * grupo de un solo escaño vive en `lib/grupo-retenido.js`.
   */
  it('los rótulos exportados son los del catálogo castellano', () => {
    expect(ROTULO_TEXTO_RETIRADO).toBe('Texto retirado')
    expect(ROTULO_TEXTO_VIGENTE).toBe('Texto vigente')
    expect(ROTULO_TEXTO_SUSTITUIDO).toBe('Texto que puso esta corrección')
    expect(ROTULO_MOTIVO_ENMENDADO).toBe('Motivo enmendado')
    expect(CATALOGUE.es['bitacora.grupoRetenido.rotulo']).toBe(ROTULO_GRUPO_RETENIDO)
  })
})

describe('lo que la prueba necesita del dato publicado', () => {
  it('hay fichas publicadas con citas, cotejos y bitácora, y retiradas', () => {
    expect(PUBLICADA.length, 'fichas publicadas').toBeGreaterThan(20)
    expect(PUBLICADA.every((f) => (f.quotes ?? []).length > 0)).toBe(true)
    expect(PUBLICADA.some((f) => (f.crossChecked ?? []).length > 0)).toBe(true)
    expect(PUBLICADA.some((f) => (f.corrections ?? []).length > 0)).toBe(true)
    expect(PUBLICADA.some((f) => f.corrections?.some((c) => c.reasonAmendments?.length))).toBe(true)
    expect((SERVIDA.retractions ?? []).length, 'retiradas').toBeGreaterThan(0)
  })

  it('el escenario de formas trae lo que el dato publicado no', () => {
    const fichas = FORMAS.snapshot.items.filter((f) => FORMAS.retocadas.includes(f.id))
    expect(fichas).toHaveLength(4)
    expect(fichas.some((f) => f.response?.sourceUrl)).toBe(true)
    expect(fichas.some((f) => f.individualSpeaker)).toBe(true)
    expect(fichas.some((f) => f.quotes.length === 0)).toBe(true)
    expect(new Set(fichas.map((f) => f.severity))).toEqual(
      new Set([...Object.keys(SEVERITY_LABEL), fichas[3].severity]),
    )
    expect(fichas.some((f) => f.corrections.some((c) => c.literalRetenido))).toBe(true)
    expect(fichas.some((f) => f.corrections.some((c) => c.grupoRetenido))).toBe(true)
  })
})

describe('/hallazgos/:id en valencià, sin castellano fuera del dato', () => {
  it('cada ficha publicada y cada forma', async () => {
    const castellano = []
    const iguales = []
    let citas = 0
    for (const esc of ESCENARIOS_FICHA) {
      const r = await compara(esc)
      castellano.push(...r.castellano)
      iguales.push(...r.iguales)
      // Que leyó la ficha entera: su título, cada cita y sus tres bandas.
      expect(r.ca.piezas, `${esc.nombre}: no leyó el título`).toContain(esc.hallazgo.title)
      citas += r.ca.piezas.filter((p) => esc.hallazgo.quotes.some((q) => p === q.text)).length
    }
    expect(ESCENARIOS_FICHA.length, 'fichas leídas').toBe(PUBLICADA.length + 4)
    expect(citas, 'citas leídas').toBeGreaterThan(PUBLICADA.length)
    expect.soft([...new Set(castellano)], 'castellano dentro del valencià').toEqual([])
    expect.soft([...new Set(iguales)], 'se lee igual en castellano y en valencià').toEqual([])
  }, 600000)

  it('cada hallazgo retirado y un enlace que no lleva a nada', async () => {
    const castellano = []
    const iguales = []
    for (const esc of ESCENARIOS_RETIRADA) {
      const r = await compara(esc)
      castellano.push(...r.castellano)
      iguales.push(...r.iguales)
      if (esc.retirada)
        expect(r.ca.piezas.join('\n'), `${esc.nombre}: no leyó el motivo`).toContain(
          esc.retirada.reason,
        )
    }
    expect(ESCENARIOS_RETIRADA.length).toBe((SERVIDA.retractions ?? []).length + 1)
    expect.soft([...new Set(castellano)], 'castellano dentro del valencià').toEqual([])
    expect.soft([...new Set(iguales)], 'se lee igual en castellano y en valencià').toEqual([])
  }, 300000)
})

describe('/hallazgos en valencià', () => {
  it('la lista con todas las fichas y el registro de retiradas', async () => {
    const r = await compara(LA_LISTA)
    for (const f of PUBLICADA) expect(r.ca.piezas, `la lista no leyó ${f.id}`).toContain(f.title)
    for (const ret of SERVIDA.retractions ?? [])
      expect(r.ca.piezas.join('\n'), `la lista no leyó la retirada ${ret.findingId}`).toContain(
        ret.reason,
      )
    expect.soft([...new Set(r.castellano)], 'castellano dentro del valencià').toEqual([])
    expect.soft([...new Set(r.iguales)], 'se lee igual en castellano y en valencià').toEqual([])
  }, 300000)

  it.each(SIN_FICHAS)(
    '$nombre',
    async (esc) => {
      const r = await compara(esc)
      expect(r.ca.piezas.join('\n'), 'no leyó el aviso de la lista vacía').toContain(
        esc.interactua
          ? CATALOGUE.ca['hallazgos.lista.ninguno']
          : CATALOGUE.ca['hallazgos.lista.vacia'],
      )
      expect.soft([...new Set(r.castellano)], 'castellano dentro del valencià').toEqual([])
      expect.soft([...new Set(r.iguales)], 'se lee igual en castellano y en valencià').toEqual([])
    },
    120000,
  )
})

describe('cobertura de la guarda', () => {
  /**
   * Cada cadena que esta página trajo al catálogo se pinta en algún escenario, en
   * castellano: una clave que ninguno pinta es una rama que la guarda no lee.
   */
  it('toda cadena de la ficha, de la retirada, de la bitácora y de la lista se pinta', async () => {
    const PREFIJOS = ['findings.detalle.', 'findings.retirada.', 'bitacora.', 'hallazgos.lista.']
    const claves = Object.keys(CATALOGUE.es).filter((k) => PREFIJOS.some((p) => k.startsWith(p)))
    expect(claves.length, 'el catálogo no tiene cadenas de la página').toBeGreaterThan(30)
    const leido = []
    for (const esc of [...ESCENARIOS_FICHA, ...ESCENARIOS_RETIRADA, LA_LISTA, ...SIN_FICHAS])
      leido.push(...(await pintaYLee(esc, 'es')).piezas)
    const texto = leido.join('\n')
    const sinPintar = claves.filter((clave) =>
      CATALOGUE.es[clave]
        .split(/\{\w+\}|\*\*/)
        .map((trozo) => trozo.trim())
        .filter((trozo) => /\p{L}/u.test(trozo))
        .some((trozo) => !texto.includes(trozo)),
    )
    expect(sinPintar).toEqual([])
  }, 600000)
})
