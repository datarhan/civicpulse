/**
 * /plenos/:id leída entera, pestaña a pestaña, en castellano y en valencià.
 *
 * La #234 pasó al catálogo la línea del resumen y la nota de la ficha de votaciones,
 * y su prueba lee sólo eso. El resto de la ficha seguía escrito a mano: la pastilla de
 * cada hallazgo del resumen imprimía el token del enum («informational»), el
 * desenlace de cada votación y la sección de cada punto salían de tablas sólo en
 * castellano, la nota del acta frente al audio estaba en el JSX, y los documentos
 * cotejados de una ficha —en /plenos/qz6weg, la bef239— decían «TENDER … · awarded»
 * y «… · INSDAGAR S.L. · construction»: el tipo de documento en mayúsculas, y el
 * estado y la categoría del contrato tal cual los guarda el verificador en el
 * snippet.
 *
 * Dos lecturas, y las dos se hacen sobre todas las pestañas que la revisión lectora
 * abre (`data-pestana`) y sobre la nota de la transcripción, que no lleva el
 * atributo:
 *
 *   - ningún token de enum, en ningún idioma: una pieza —o un trozo entre « · »— que
 *     es la clave de un enum es un rótulo que no pasó por ninguna tabla;
 *   - en valencià, ninguna palabra castellana fuera de los datos, que se pintan
 *     como se publican (títulos, citas, nombres, el texto de los snippets).
 *
 * La sesión es real y tal cual se publica: /plenos/qz6weg tiene votaciones,
 * hallazgos con documentos cotejados y declaraciones. Un segundo escenario le pone
 * a la misma sesión cada forma que el dato publicado no trae —cada sección del
 * orden del día, cada desenlace, cada gravedad, una réplica—, para que una tabla a medio
 * traducir no pase por no pintarse.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { Route, Routes } from 'react-router-dom'

import PlenoDetalle from '../../src/pages/PlenoDetalle'
import { CATALOGUE } from '../../src/i18n'
import { OUTCOME_LABEL } from '../../src/hooks/usePlenoVotes'
import { SECTION_LABEL } from '../../src/hooks/usePlenoAgendas'
import { SEVERITY_LABEL } from '../../src/hooks/usePlenoFindings'
import { DEPARTMENT_LABEL } from '../../src/scraper/departments'
import { REAL_BLOCS } from '../../src/lib/party-label'
import { resumenSegunFuentes } from '../../src/lib/claim-provenance.js'
import { resumenPublicable } from '../../src/lib/resumenes-retirados.js'
import {
  cadenasDe,
  datosPintados,
  detectorDeCastellano,
  lectura,
  masLargasPrimero,
} from '../setup/castellano'
import { pintaYLee } from '../setup/pinta-y-lee'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))

/** La sesión de la ficha bef239, con votaciones, hallazgos y declaraciones. */
const ID = 'qz6weg'
const RUTA_FRAGMENTO = `/data/pleno-claims/${ID}.json`
const ENTRADA = lee('pleno-claims/index.json').plenos.find((p) => p.plenoId === ID)
const TRANSCRIPCION = readFileSync(`public/data/pleno-transcripts/${ID}.txt`, 'utf8')

const sirve = () => ({
  '/data/plenos.json': lee('plenos.json'),
  '/data/plenos-agendas.json': lee('plenos-agendas.json'),
  '/data/pleno-votes.json': lee('pleno-votes.json'),
  '/data/pleno-findings.json': lee('pleno-findings.json'),
  '/data/pleno-videos.json': lee('pleno-videos.json'),
  '/data/finding-quote-provenance.json': lee('finding-quote-provenance.json'),
  '/data/tenders.json': lee('tenders.json'),
  [RUTA_FRAGMENTO]: lee(ENTRADA.chunkPath),
})

/**
 * La misma sesión con cada forma que el dato no trae: los puntos del orden del día
 * repartidos entre todas las secciones, las votaciones entre todos los desenlaces y
 * los hallazgos entre todas las gravedades.
 */
function cadaForma() {
  const mapa = structuredClone(sirve())
  const secciones = Object.keys(SECTION_LABEL)
  const sesion = mapa['/data/plenos-agendas.json'].plenos.find((p) => p.id === ID)
  sesion.agenda = sesion.agenda.map((it, i) => ({
    ...it,
    section: secciones[i % secciones.length],
  }))
  const desenlaces = Object.keys(OUTCOME_LABEL)
  const votos = mapa['/data/pleno-votes.json']
  const otras = votos.items.filter((v) => v.plenoId !== ID).slice(0, desenlaces.length)
  votos.items = [
    ...votos.items,
    ...otras.map((v, i) => ({
      ...v,
      id: `${v.id}-forma`,
      plenoId: ID,
      outcome: desenlaces[i],
    })),
  ]
  const gravedades = Object.keys(SEVERITY_LABEL)
  const hallazgos = mapa['/data/pleno-findings.json']
  const deLaSesion = hallazgos.items.filter((f) => f.plenoId === ID)
  hallazgos.items = hallazgos.items.map((f) =>
    f.plenoId === ID
      ? { ...f, severity: gravedades[deLaSesion.indexOf(f) % gravedades.length] }
      : f,
  )
  // Y una réplica, que ninguna ficha publicada de la sesión trae: su cita es dato.
  const conReplica = hallazgos.items.find((f) => f.plenoId === ID)
  conReplica.response = {
    from: 'PP',
    respondedAt: '2026-01-15',
    quote: 'Texto literal de la réplica del grupo.',
  }
  return mapa
}

// ─── Qué se lee ────────────────────────────────────────────────────────────────

const botonesDePestana = (c) => [...c.querySelectorAll('button[data-pestana]')]

/**
 * Lo que esta prueba todavía no le pide al valencià, quitado de una copia de la
 * página: las citas de cada ficha de hallazgo y sus notas de procedencia y de
 * contraste (`CitasDeLaFicha`, también en /hallazgos), la lista `ol` de la ficha y la
 * nota que va con ella, que comparten contenedor. Es prosa compartida con una
 * superficie legalmente material, y su traducción va aparte para que se revise como
 * tal. Las dos lecturas —tokens y castellano— se hacen sin ella.
 *
 * Las tarjetas del registro de declaraciones (`ClaimLedger`) estuvieron aquí hasta
 * que pasaron por el catálogo (#314), y desde entonces se leen enteras.
 */
const sinLoPendiente = (c) => {
  const copia = c.cloneNode(true)
  for (const ol of copia.querySelectorAll('.cp-card ol')) ol.parentElement?.remove()
  return copia
}

/** Sin la transcripción, que es el acta hablada y no prosa nuestra. */
const sinTranscripcion = (c) => {
  const copia = c.cloneNode(true)
  for (const pre of copia.querySelectorAll('pre')) pre.remove()
  return copia
}

/** Lee cuando dos lecturas seguidas coinciden: los cotejos llegan un render después. */
async function leeQuieta(container) {
  let previa = null
  await waitFor(
    () => {
      const ahora = JSON.stringify(lectura(container))
      const quieta = ahora === previa
      previa = ahora
      expect(quieta).toBe(true)
    },
    { timeout: 15000, interval: 60 },
  )
}

/**
 * Pulsa cada pestaña de la revisión lectora y la transcripción, y lee la página
 * cada vez: entera, para los tokens, y sin lo pendiente, para el castellano. La
 * transcripción se sirve como texto —el simulacro de `fetch` lo serializa todo como
 * JSON, y la nota depende de qué clase de texto es— y de ella se lee sólo la nota.
 */
function pulsaCadaPestana(lecturas, idioma, transcripcion) {
  return async (container) => {
    const enteras = []
    const sinPendiente = []
    const lee = (clave, raiz) => {
      enteras.push(...lectura(raiz).map((p) => `${clave}\u0000${p}`))
      sinPendiente.push(...lectura(sinLoPendiente(raiz)).map((p) => `${clave}\u0000${p}`))
    }
    for (const clave of botonesDePestana(container).map((b) => b.getAttribute('data-pestana'))) {
      const boton = container.querySelector(`button[data-pestana="${clave}"]`)
      fireEvent.click(boton)
      await waitFor(() => expect(boton.style.fontWeight).toBe('700'))
      await leeQuieta(container)
      lee(clave, container)
    }
    const servido = globalThis.fetch
    globalThis.fetch = async (u) =>
      String(u).endsWith('.txt')
        ? new Response(transcripcion, { status: 200, headers: { 'Content-Type': 'text/plain' } })
        : servido(u)
    try {
      const boton = [...container.querySelectorAll('button')].find(
        (b) => b.textContent === CATALOGUE[idioma]['plenoDetail.transcript'],
      )
      fireEvent.click(boton)
      await waitFor(() => expect(container.querySelector('pre')).not.toBeNull())
      lee('transcripcion', sinTranscripcion(container))
    } finally {
      globalThis.fetch = servido
    }
    lecturas[idioma] = { enteras, sinPendiente }
    return []
  }
}

/** Una transcripción con forma de acta: marcas de tiempo todas a cero. */
const COMO_ACTA = TRANSCRIPCION.replace(/^\[\s*[\d.]+\s*→\s*[\d.]+\s*\]/gm, '[0.0 → 0.0]')

const laFicha = () => (
  <Routes>
    <Route path="/plenos/:id" element={<PlenoDetalle />} />
  </Routes>
)

const escenario = (nombre, mapa, transcripcion) => ({
  nombre,
  transcripcion,
  ruta: `/plenos/${ID}`,
  fetch: mapa,
  pinta: laFicha,
  listo: (c) => botonesDePestana(c).length >= 5,
  // Las fichas de hallazgo los piden al abrir su pestaña.
  alPulsar: ['/data/finding-quote-provenance.json', '/data/tenders.json'],
})

const ESCENARIOS = [
  escenario(`/plenos/${ID} tal cual se publica`, sirve(), TRANSCRIPCION),
  escenario(
    `/plenos/${ID} con cada sección, desenlace y gravedad, y la transcripción de un acta`,
    cadaForma(),
    COMO_ACTA,
  ),
]

// ─── Qué es dato ───────────────────────────────────────────────────────────────

/**
 * Los trozos de un snippet: el verificador los junta con « · », y la ficha los pinta
 * con algún trozo quitado o cambiado por su rótulo, así que el snippet entero ya no
 * aparece y cada trozo sigue siendo dato.
 */
const trozosDeSnippets = (mapa) => [
  ...mapa['/data/pleno-findings.json'].items.flatMap((f) =>
    [...(f.crossChecked ?? []), ...(f.contradiction ?? [])].flatMap((r) =>
      String(r.snippet ?? '').split(' · '),
    ),
  ),
  // Y los de cada fila de evidencia de una declaración, que la tarjeta pinta sin su
  // cola de estado.
  ...mapa[RUTA_FRAGMENTO].items.flatMap((it) =>
    (it.verification?.evidence ?? []).flatMap((e) => String(e.snippet ?? '').split(' · ')),
  ),
]

/**
 * Lo que una tarjeta de declaración pinta del dato y `datosPintados` no puede
 * reconocer: la explicación del verificador tal como la tarjeta la re-deriva
 * (`resumenSegunFuentes`, que nombra los corpus con su rótulo castellano y ya no es
 * la cadena guardada), la unidad del recuento que el extractor sacó de la cita
 * («actuaciones»), en su propio nodo junto a la cifra, y las unidades de un importe
 * abreviado («27 K €»). Los corpus de «Fuentes comprobadas» ya no: llevan rótulo del
 * catálogo (`ledger.corpus.*`) desde el 12-10-2026, y se leen como rótulo.
 */
const DATO_DE_LAS_DECLARACIONES = (mapa) => [
  ...mapa[RUTA_FRAGMENTO].items
    .map(
      (it) =>
        it.verification && resumenSegunFuentes(it.verification, resumenPublicable(it.verification)),
    )
    .filter((s) => typeof s === 'string' && s !== ''),
  ...mapa[RUTA_FRAGMENTO].items
    .map((it) => it.claim?.entities?.countUnit)
    .filter((u) => typeof u === 'string' && u !== ''),
  'K €',
  'M €',
]

/** Lo que no es lengua en esta página. */
const SIGLAS = [
  'YouTube',
  'WhatsApp',
  'Telegram',
  'Riba-roja de Túria',
  'auto-curation-v1',
  ...REAL_BLOCS,
]

const AREAS_IGUALES = Object.values(DEPARTMENT_LABEL)
  .filter((l) => l.es === l.ca)
  .map((l) => l.es)

// ─── Qué es un token ───────────────────────────────────────────────────────────

const sufijos = (prefijo) =>
  Object.keys(CATALOGUE.es)
    .filter((k) => k.startsWith(prefijo))
    .map((k) => k.slice(prefijo.length))

/** Las claves de los enums que la página pinta: ninguna se lee tal cual. */
const TOKENS = new Set([
  ...Object.keys(SEVERITY_LABEL),
  ...Object.keys(OUTCOME_LABEL),
  ...Object.keys(SECTION_LABEL).filter((k) => k !== 'otro'),
  ...sufijos('contrato.estado.'),
  ...sufijos('contrato.categoria.'),
  'tender',
  'bdns',
  'budget',
  'promise',
  'pleno-video',
  'pleno-acta',
  'press',
  'document',
  'transcript',
])

/**
 * Un trozo es un token si es la clave tal cual, o la clave en mayúsculas —así se
 * pintaba el tipo de documento, «TENDER»—. «Aprobado» no lo es: es el rótulo de
 * «aprobado», con su mayúscula.
 */
const esTokenDeEnum = (trozo) => {
  const t = trozo.trim()
  return TOKENS.has(t) || (t === t.toUpperCase() && TOKENS.has(t.toLowerCase()))
}

/** Las piezas que son —o llevan entre « · »— la clave de un enum. */
const tokensEn = (piezas) => [
  ...new Set(piezas.filter((p) => [p, ...p.split(/\s·\s/)].some(esTokenDeEnum))),
]

afterEach(() => localStorage.clear())

describe(`/plenos/${ID}: lo que la prueba necesita del dato publicado`, () => {
  it('la sesión tiene votaciones, hallazgos con contratos cotejados y declaraciones', () => {
    const mapa = sirve()
    expect(mapa['/data/pleno-votes.json'].items.some((v) => v.plenoId === ID)).toBe(true)
    const hallazgos = mapa['/data/pleno-findings.json'].items.filter((f) => f.plenoId === ID)
    expect(hallazgos.some((f) => f.crossChecked?.some((r) => r.kind === 'tender'))).toBe(true)
    expect(ENTRADA?.itemCount ?? 0).toBeGreaterThan(0)
  })
})

/** Las piezas de una lectura, cada una con la pestaña donde se leyó delante. */
const deLaPestana = (piezas) =>
  piezas.map((p) => {
    const [pestana, texto] = p.split('\u0000')
    return { pestana, texto }
  })

describe(`/plenos/${ID}: cada pestaña, sin tokens y en valencià sin castellano`, () => {
  it.each(ESCENARIOS)(
    '$nombre',
    async (esc) => {
      const lecturas = {}
      const es = await pintaYLee(
        { ...esc, interactua: pulsaCadaPestana(lecturas, 'es', esc.transcripcion) },
        'es',
      )
      await pintaYLee(
        { ...esc, interactua: pulsaCadaPestana(lecturas, 'ca', esc.transcripcion) },
        'ca',
      )
      expect.soft(es.pedidasSinServir, 'la página pide datos que la prueba no sirve').toEqual([])
      expect.soft(es.servidasSinPedir, 'servidas y nunca pedidas').toEqual([])
      const leidas = new Set(deLaPestana(lecturas.es.enteras).map((p) => p.pestana))
      expect([...leidas].sort(), 'no abrió todas las pestañas').toEqual(
        ['agenda', 'declaraciones', 'hallazgos', 'resumen', 'transcripcion', 'votos'].sort(),
      )

      // Lo pendiente se quita, y sólo eso: en la pestaña de hallazgos la lectura sin
      // ello es más corta y sigue leyendo sus cotejos; la de declaraciones se lee entera.
      const cuenta = (lista, pestana) =>
        deLaPestana(lista).filter((p) => p.pestana === pestana).length
      expect
        .soft(cuenta(lecturas.ca.sinPendiente, 'hallazgos'), 'nada pendiente en hallazgos')
        .toBeLessThan(cuenta(lecturas.ca.enteras, 'hallazgos'))
      expect
        .soft(cuenta(lecturas.ca.sinPendiente, 'declaraciones'), 'declaraciones, entera')
        .toBe(cuenta(lecturas.ca.enteras, 'declaraciones'))
      expect(cuenta(lecturas.ca.enteras, 'declaraciones'), 'tarjetas leídas').toBeGreaterThan(20)
      expect
        .soft(
          deLaPestana(lecturas.ca.sinPendiente).some(
            (p) =>
              p.pestana === 'hallazgos' &&
              p.texto.startsWith(CATALOGUE.ca['findings.refs.crossChecked']),
          ),
          'la pestaña de hallazgos, sin lo pendiente, ya no lee sus cotejos',
        )
        .toBe(true)

      for (const idioma of ['es', 'ca']) {
        const conToken = tokensEn(deLaPestana(lecturas[idioma].sinPendiente).map((p) => p.texto))
        expect.soft(conToken, `tokens de enum (${idioma})`).toEqual([])
      }

      const piezasEs = deLaPestana(lecturas.es.enteras).map((p) => p.texto)
      const datos = datosPintados(
        [...es.piezas, ...piezasEs],
        new Set([...cadenasDe(esc.fetch), ...trozosDeSnippets(esc.fetch)]),
      )
      const noSeTraduce = masLargasPrimero([
        ...datos,
        ...SIGLAS,
        ...AREAS_IGUALES,
        ...DATO_DE_LAS_DECLARACIONES(esc.fetch),
      ])
      const { castellanoEn, sinTraducir } = detectorDeCastellano(noSeTraduce)
      const castellano = deLaPestana(lecturas.ca.sinPendiente).flatMap(({ pestana, texto }) =>
        castellanoEn(texto).map((p) => `${pestana}: «${p}» en «${texto.slice(0, 120)}»`),
      )
      expect.soft([...new Set(castellano)], 'castellano dentro del valencià').toEqual([])

      // La otra mitad: una cadena valenciana copiada del castellano deja de ser
      // «sólo castellana» y `castellanoEn` no la ve. Pieza a pieza, lo que se lee
      // igual en los dos idiomas sin ser dato.
      const es2 = deLaPestana(lecturas.es.sinPendiente).map((p) => p.texto)
      const ca2 = deLaPestana(lecturas.ca.sinPendiente).map((p) => p.texto)
      expect(ca2.length, 'las dos lecturas no pintan las mismas piezas').toBe(es2.length)
      // Las piezas compuestas —«PP · A favor · 7», un snippet con su categoría— se
      // comparan trozo a trozo: cada trozo es dato, sigla o una cadena que el
      // catálogo escribe igual en los dos idiomas, y entera no es ninguna de ellas.
      const trozos = (p) => p.split(' · ')
      const pares = es2.flatMap((p, i) =>
        p === ca2[i] ? trozos(p).map((t) => [t, t]) : [[p, ca2[i]]],
      )
      const iguales = sinTraducir(pares)
      expect.soft([...new Set(iguales)], 'se lee igual en castellano y en valencià').toEqual([])
    },
    180000,
  )
})
