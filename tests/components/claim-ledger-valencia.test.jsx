/**
 * La tarjeta de una declaración y la barra de veredictos, en castellano y en valencià.
 *
 * La #235 pasó por el catálogo la línea de recuento del registro (`ledger.recuento.*`,
 * tests/components/claim-ledger-recuento-valencia.test.jsx), y al mirar las páginas
 * servidas con `cp:lang = 'ca'` el 04-10-2026 todo lo que la rodea seguía en
 * castellano: en /departamentos/urbanismo, «Parcial 3 · Sin contraste 1060» justo
 * encima de «3 acarades amb un document · 1060 sense contrast en les dades», y en
 * cada tarjeta «Fuentes comprobadas», «Veredicto», «CONTRATO», «Verificado», «Obra
 * citada», el parecido de la fila y el puente de importe.
 *
 * Sólo se traduce el rótulo. La cita (`claim.verbatim`), la explicación del
 * verificador (`verification.summary`, o la que `resumenSegunFuentes` re-deriva con
 * la misma frase que el verificador guarda), el texto de cada fila de evidencia y las
 * firmas son dato y se quedan como vinieron. Los corpus de «Fuentes comprobadas» se
 * pintaban como identificadores —`tenders`, `promises`, iguales en las dos lenguas— y
 * esta guarda los contaba como dato; desde el 12-10-2026 llevan rótulo del catálogo
 * (`ledger.corpus.*`) y se leen como lo que son, rótulo.
 *
 * La guarda es la de la portada y la de /plenos: pinta la misma superficie en los dos
 * idiomas con declaraciones PUBLICADAS, compara pieza a pieza y busca palabras
 * castellanas en el valencià, con el dato fuera de la cuenta. Las declaraciones se
 * eligen del corpus servido para que cada rama de la tarjeta salga al menos una vez
 * —cada veredicto, tipo, procedencia, fuente de fila, la explicación retirada, el
 * parecido y el puente—, y la cobertura de abajo exige que de verdad salgan.
 *
 * La pestaña de /plenos/:id fuera del registro (su barra «contrastadas / sin
 * contraste» y su vacío) es de la tarea hermana de esa ficha, no de ésta.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fireEvent, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import PlenoDetalle from '../../src/pages/PlenoDetalle'
import DepartamentoDetalle from '../../src/pages/DepartamentoDetalle'
import { gateForDisplay } from '../../src/lib/claim-ledger'
import { deptSlugToClaimTopics } from '../../src/lib/department-claim-topics'
import { tipoAMostrar } from '../../src/lib/claim-type-label.js'
import {
  etiquetaVerificador,
  evidenciaSegunFuentes,
  resumenSegunFuentes,
} from '../../src/lib/claim-provenance.js'
import { resumenPublicable } from '../../src/lib/resumenes-retirados.js'
import { snippetDeEvidencia } from '../../src/lib/crosschecked-status.js'
import { CATALOGUE } from '../../src/i18n'
import { desenlaceDeCotejo } from '../../src/scraper/claim-verdicts'
import { puenteDeImporte } from '../../src/scraper/importe-de-contrato'
import { cifraCitada } from '../../src/scraper/cifra-en-literal'
import {
  cadenasDe,
  datosPintados,
  detectorDeCastellano,
  IGUALES_EN_EL_CATALOGO,
  lectura,
  masLargasPrimero,
} from '../setup/castellano'
import { pintaYLee } from '../setup/pinta-y-lee'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const MANIFIESTO = lee('pleno-claims/index.json')
const PLENOS = lee('plenos.json')
const VOTOS = lee('pleno-votes.json')
const HALLAZGOS = lee('pleno-findings.json')
const VIDEOS = lee('pleno-videos.json')
const VIDEOS_REGMEET = lee('pleno-videos-regmeet.json')
const AGENDAS = lee('plenos-agendas.json')
const TENDERS = lee('tenders.json')

const FRAGMENTO = lee(MANIFIESTO.plenos[0].chunkPath)
/**
 * La única declaración servida con puente de importe era k4olcs-019-cit-b9b013, y
 * desde el 19-10-2026 el verificador cita la fila que imprime su cifra
 * (`filaQueDiceLaCifra`, claim-verifier.ts): lo servido ya no lo necesita. Para que
 * el rótulo del puente se siga leyendo en los dos idiomas, entra su fila de antes,
 * congelada, en lugar de la servida.
 *
 * Y con la cifra dicha en su literal: la cita publicada no trae los 80.666 € —se
 * dijeron en la frase siguiente—, y desde el 27-10-2026 la tarjeta sólo llama «la
 * cifra citada» a la que la cita dice (src/scraper/cifra-en-literal.ts).
 */
const FILA_CONGELADA = JSON.parse(
  readFileSync('tests/fixtures/puente-importe-k4olcs-019_2026-10-19.json', 'utf8'),
).item
const CONGELADA = {
  ...FILA_CONGELADA,
  claim: {
    ...FILA_CONGELADA.claim,
    verbatim: `${FILA_CONGELADA.claim.verbatim} por importe de 80.666 euros.`,
  },
}
const VISIBLES = gateForDisplay(
  MANIFIESTO.plenos
    .flatMap((p) => lee(p.chunkPath).items)
    .map((it) => (it.claim.id === CONGELADA.claim.id ? CONGELADA : it)),
)

// ─── Qué declaraciones se pintan ───────────────────────────────────────────────

/**
 * Los rasgos de una tarjeta que pintan un rótulo distinto: cada uno tiene que salir
 * en alguna de las elegidas para que su rótulo se lea en los dos idiomas.
 */
function rasgosDe(it) {
  const v = it.verification
  const filas = evidenciaSegunFuentes(v)
  return [
    `veredicto:${v.verdict}`,
    `tipo:${tipoAMostrar(it.claim)}`,
    `verificador:${etiquetaVerificador(v)}`,
    `fuentes:${desenlaceDeCotejo(v)}`,
    ...filas.map((e) => `fila:${e.kind}`),
    ...(filas.some((e) => typeof e.similarity === 'number') ? ['parecido'] : []),
    ...(resumenPublicable(v) === null ? ['retirada'] : []),
    ...(filas.some((e) => puenteDeImporte(cifraCitada(it.claim), e, TENDERS)) ? ['puente'] : []),
  ]
}

/** Cobertura voraz: en cada paso, la declaración que trae más rasgos nuevos. */
function eligeCubriendo(items) {
  const rasgos = new Map(items.map((it) => [it, rasgosDe(it)]))
  const vistos = new Set()
  const elegidas = []
  for (;;) {
    let mejor = null
    let nuevos = 0
    for (const [it, rs] of rasgos) {
      const n = rs.filter((r) => !vistos.has(r)).length
      if (n > nuevos) [mejor, nuevos] = [it, n]
    }
    if (!mejor) return { elegidas, rasgos: vistos }
    elegidas.push(mejor)
    for (const r of rasgos.get(mejor)) vistos.add(r)
    rasgos.delete(mejor)
  }
}

const { elegidas: ELEGIDAS, rasgos: RASGOS } = eligeCubriendo(VISIBLES)

// ─── Qué es dato ───────────────────────────────────────────────────────────────

/**
 * Lo que la tarjeta pinta del dato, además de lo que trae el fichero tal cual: la
 * fila sin su cola de estado y con la categoría del contrato por su rótulo, la
 * explicación re-derivada y el recuento con su unidad.
 */
const DERIVADOS = ELEGIDAS.flatMap((it) => {
  const v = it.verification
  const e = it.claim.entities ?? {}
  return [
    // Una fila de contrato lleva la categoría por su rótulo, que es del idioma: la
    // fila pintada en castellano no está entera en la valenciana, así que cuenta
    // también cada trozo entre « · », que sí es dato en las dos (como en
    // pleno-detalle-valencia.test.jsx).
    ...(v.evidence ?? []).flatMap((f) => {
      const fila = snippetDeEvidencia(f, (k) => CATALOGUE.es[k] ?? k)
      return [fila, ...fila.split(' · ')]
    }),
    resumenSegunFuentes(v, resumenPublicable(v), it.claim.verbatim),
    e.count && e.countUnit ? `${e.count} ${e.countUnit}` : null,
  ].filter((s) => typeof s === 'string' && s !== '')
})

/**
 * Lo que `datosPintados` no puede reconocer como dato porque tiene forma de token: la
 * unidad del recuento que el extractor sacó de la cita («parques») —se pinta en su
 * propio nodo, junto a la cifra— y las unidades de un importe abreviado.
 */
const IDENTIFICADORES = [
  ...ELEGIDAS.map((it) => it.claim.entities?.countUnit).filter((u) => typeof u === 'string'),
  'K €',
  'M €',
]

/**
 * Dos formas de un rótulo que el valenciano escribe igual —«Parcial», «Promesa
 * documentada»— y que el detector no puede dar por traducidas porque la pieza no es el
 * valor exacto del catálogo: la fuente de una fila, en mayúsculas («PROMESA
 * DOCUMENTADA»), y el `title` de un tramo de la barra de veredictos, «<rótulo>:
 * <cifra>». Sólo se aceptan esas dos formas, de un rótulo que el catálogo escribe igual.
 */
const MAYUSCULAS_IGUALES = new Set([...IGUALES_EN_EL_CATALOGO].map((s) => s.toUpperCase()))
const esRotuloIgual = (pieza) => {
  if (MAYUSCULAS_IGUALES.has(pieza)) return true
  const m = /^(.+): \d+$/.exec(pieza)
  return m !== null && IGUALES_EN_EL_CATALOGO.has(m[1])
}

// ─── Las dos páginas ───────────────────────────────────────────────────────────

const ID = 'p1'

/** /plenos/:id con las elegidas en su fragmento, y nada más de la sesión. */
const enElPleno = {
  '/data/plenos.json': { ...PLENOS, items: [{ ...PLENOS.items[0], id: ID }] },
  '/data/pleno-votes.json': { ...VOTOS, items: [] },
  '/data/pleno-findings.json': { ...HALLAZGOS, items: [] },
  '/data/pleno-videos.json': { ...VIDEOS, items: [] },
  '/data/pleno-videos-regmeet.json': { ...VIDEOS_REGMEET, items: [] },
  '/data/plenos-agendas.json': { ...AGENDAS, plenos: [] },
  [`/data/pleno-claims/${ID}.json`]: { ...FRAGMENTO, plenoId: ID, items: ELEGIDAS },
  '/data/tenders.json': TENDERS,
}

const SLUG = 'urbanismo'
const [TEMA] = deptSlugToClaimTopics(SLUG)
const CHUNK_DEL_AREA = `pleno-claims/${ID}.json`

/** /departamentos/:slug con un corpus de un fragmento: las elegidas, con el tema del área. */
const enElArea = {
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
    items: ELEGIDAS.map((it) => ({ ...it, claim: { ...it.claim, topic: TEMA } })),
  },
}

/** La línea de recuento, por lo que dice: abre el registro en las dos páginas. */
function lineaDe(c) {
  const candidatas = [...c.querySelectorAll('*')].filter(
    (el) =>
      /sin contraste en los datos|sense contrast en les dades/.test(el.textContent) &&
      el.textContent.includes(' · '),
  )
  if (candidatas.length === 0) return null
  return candidatas.reduce((a, b) => (b.textContent.length < a.textContent.length ? b : a))
}

/** El registro: la línea de recuento, sus tarjetas y el botón de cargar más. */
const registroDe = (c) => lineaDe(c)?.parentElement ?? null

/** En /departamentos, la sección entera: la barra de veredictos va encima del registro. */
const seccionDe = (c) => lineaDe(c)?.closest('section') ?? null

const N_PUENTES = RASGOS.has('puente') ? 1 : 0

/** En /plenos/:id el registro se monta al pulsar su pestaña; el puente, al llegar tenders. */
async function abreDeclaraciones(c) {
  fireEvent.click(c.querySelector('[data-pestana="declaraciones"]'))
  let previa = null
  return waitFor(
    () => {
      const registro = registroDe(c)
      expect(registro, 'la pestaña de declaraciones no pinta el registro').not.toBeNull()
      expect(registro.querySelectorAll('[data-puente-importe]').length).toBe(N_PUENTES)
      const ahora = lectura(registro)
      const quieta = previa !== null && JSON.stringify(ahora) === JSON.stringify(previa)
      previa = ahora
      expect(quieta, 'el registro todavía se mueve').toBe(true)
      return ahora
    },
    { timeout: 15000 },
  )
}

const ESCENARIOS = [
  {
    nombre: `/plenos/:id · pestaña de declaraciones, ${ELEGIDAS.length} tarjetas`,
    ruta: `/plenos/${ID}`,
    fetch: enElPleno,
    alPulsar: ['/data/tenders.json'],
    pinta: () => (
      <Routes>
        <Route path="/plenos/:id" element={<PlenoDetalle />} />
      </Routes>
    ),
    listo: (c) => c.querySelector('[data-pestana="declaraciones"]') !== null,
    lee: () => [],
    interactua: abreDeclaraciones,
  },
  {
    nombre: `/departamentos/${SLUG} · barra de veredictos y registro`,
    ruta: `/departamentos/${SLUG}`,
    fetch: enElArea,
    // Las diez primeras tarjetas no traen el puente, y sin `tenders.json` no se pinta.
    faltanAdrede: ['/data/tenders.json'],
    pinta: () => (
      <Routes>
        <Route path="/departamentos/:slug" element={<DepartamentoDetalle />} />
      </Routes>
    ),
    listo: (c) => seccionDe(c) !== null,
    lee: (c) => (seccionDe(c) ? lectura(seccionDe(c)) : []),
  },
]

// ─── Lo que tiene que decir ────────────────────────────────────────────────────

describe('la tarjeta de una declaración · lo que necesita del dato publicado', () => {
  it('las elegidas pintan cada rama de la tarjeta y caben en la pestaña sin «cargar más»', () => {
    for (const r of [
      'veredicto:verificado',
      'veredicto:parcial',
      'veredicto:sin-datos',
      'fuentes:sin-corpus',
      'fuentes:no-consta',
      'fuentes:con-corpus',
      'fila:tender',
      'fila:bdns',
      'parecido',
      'retirada',
      'puente',
    ])
      expect(RASGOS.has(r), r).toBe(true)
    expect([...RASGOS].filter((r) => r.startsWith('verificador:')).length).toBeGreaterThan(4)
    expect(ELEGIDAS.length).toBeLessThanOrEqual(20)
  })
})

describe('la tarjeta y la barra de veredictos dicen lo mismo en castellano y en valencià', () => {
  it.each(ESCENARIOS)(
    '$nombre',
    async (escenario) => {
      const es = await pintaYLee(escenario, 'es', { lee: escenario.lee })
      const ca = await pintaYLee(escenario, 'ca', { lee: escenario.lee })
      expect.soft(es.pedidasSinServir, 'la página pide datos que la prueba no sirve').toEqual([])
      expect.soft(es.servidasSinPedir, 'se sirve algo que nadie pide').toEqual([])
      expect(es.piezas.length, 'no se ha leído nada').toBeGreaterThan(20)
      expect(ca.piezas.length, 'las dos lecturas tienen la misma forma').toBe(es.piezas.length)

      const dato = masLargasPrimero([
        ...datosPintados(es.piezas, cadenasDe([ELEGIDAS, DERIVADOS])),
        ...IDENTIFICADORES,
      ])
      const { sinTraducir, castellanoEn } = detectorDeCastellano(dato)
      const pares = es.piezas.map((p, i) => [p, ca.piezas[i]])
      expect
        .soft(
          sinTraducir(pares).filter((p) => !esRotuloIgual(p)),
          'igual en los dos idiomas sin ser dato',
        )
        .toEqual([])
      expect
        .soft(
          [...new Set(ca.piezas.flatMap((s) => castellanoEn(s)))],
          'castellano dentro del valencià',
        )
        .toEqual([])
    },
    60000,
  )
})

/**
 * Cobertura: cada forma de la tarjeta sale pintada en castellano en algún escenario.
 * Sin esto, una elección que dejara de traer, por ejemplo, la explicación retirada
 * dejaría esta guarda en verde sin haberla leído.
 */
describe('cobertura de la guarda de la tarjeta', () => {
  it('lo que se lee en castellano trae cada forma de la tarjeta', async () => {
    const piezas = []
    for (const e of ESCENARIOS) piezas.push(...(await pintaYLee(e, 'es', { lee: e.lee })).piezas)
    const texto = piezas.join('\n')
    for (const forma of [
      'Fuentes comprobadas: ninguna',
      'Fuentes comprobadas: no constan',
      'Veredicto: verificador determinista',
      'Veredicto: verificador LLM',
      'Veredicto: sin verificador anotado',
      'Explicación retirada:',
      'parecido con lo citado',
      'la cifra citada',
      'CONTRATO',
      'SUBVENCIÓN BDNS',
      'Verificado',
      'Parcial',
      'Sin datos',
      'Sin contraste',
    ])
      expect(texto, forma).toContain(forma)
  }, 60000)
})
